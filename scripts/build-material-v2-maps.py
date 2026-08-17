#!/usr/bin/env python3
"""Build seamless web PBR maps from generated, flat-lit textile sources.

The source images provide weave structure and albedo variation. Normal,
roughness, and height are derived deterministically so the image model never
has to invent technical map encodings.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


PROFILES = {
    "cotton-jersey": {"roughness": 0.86, "height": 0.16, "normal": 4.0, "variance": 0.035},
    "rib-knit": {"roughness": 0.88, "height": 0.30, "normal": 5.2, "variance": 0.045},
    "french-terry": {"roughness": 0.91, "height": 0.28, "normal": 4.8, "variance": 0.050},
    "fleece": {"roughness": 0.96, "height": 0.20, "normal": 3.2, "variance": 0.025},
    "poplin": {"roughness": 0.74, "height": 0.11, "normal": 2.8, "variance": 0.025},
    "linen": {"roughness": 0.93, "height": 0.24, "normal": 4.4, "variance": 0.045},
    "denim": {"roughness": 0.78, "height": 0.27, "normal": 4.8, "variance": 0.040},
    "twill": {"roughness": 0.81, "height": 0.22, "normal": 4.2, "variance": 0.035},
    "nylon-ripstop": {"roughness": 0.46, "height": 0.14, "normal": 3.0, "variance": 0.030},
    "satin-silk": {"roughness": 0.27, "height": 0.07, "normal": 2.2, "variance": 0.020},
    "velvet": {"roughness": 0.88, "height": 0.13, "normal": 2.8, "variance": 0.035},
    "wool-blend": {"roughness": 0.90, "height": 0.20, "normal": 3.8, "variance": 0.040},
}


def image_to_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0


def array_to_image(array: np.ndarray, mode: str = "RGB") -> Image.Image:
    encoded = np.clip(array * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(encoded, mode=mode)


def gaussian(array: np.ndarray, radius: float) -> np.ndarray:
    image = array_to_image(array, "L" if array.ndim == 2 else "RGB")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius=radius)), dtype=np.float32) / 255.0


def flatten_lighting(rgb: np.ndarray) -> np.ndarray:
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    illumination = gaussian(luminance, max(16.0, rgb.shape[0] / 12.0))
    target = float(np.median(illumination))
    correction = np.power(target / np.clip(illumination, 0.08, None), 0.55)
    return np.clip(rgb * correction[..., None], 0.0, 1.0)


def periodic_component(array: np.ndarray) -> np.ndarray:
    """Remove the smooth boundary mismatch using periodic-plus-smooth decomposition."""
    height, width = array.shape[:2]
    channels = 1 if array.ndim == 2 else array.shape[2]
    source = array[..., None] if channels == 1 else array
    result = np.empty_like(source)

    row_freq = np.arange(height, dtype=np.float32)[:, None]
    col_freq = np.arange(width, dtype=np.float32)[None, :]
    denominator = (
        2.0 * np.cos(2.0 * np.pi * row_freq / height)
        + 2.0 * np.cos(2.0 * np.pi * col_freq / width)
        - 4.0
    )
    denominator[0, 0] = 1.0

    for channel in range(channels):
        values = source[..., channel]
        boundary = np.zeros_like(values)
        boundary[0, :] = values[-1, :] - values[0, :]
        boundary[-1, :] = values[0, :] - values[-1, :]
        boundary[:, 0] += values[:, -1] - values[:, 0]
        boundary[:, -1] += values[:, 0] - values[:, -1]

        smooth_frequency = np.fft.fft2(boundary) / denominator
        smooth_frequency[0, 0] = 0.0
        smooth = np.fft.ifft2(smooth_frequency).real.astype(np.float32)
        result[..., channel] = values - smooth

    return result[..., 0] if channels == 1 else result


def close_edges(array: np.ndarray, band: int = 4) -> np.ndarray:
    """Make opposite edge pixels identical while keeping the correction local."""
    result = array.copy()
    for index in range(band):
        weight = 1.0 - index / max(1, band)
        opposite = -(index + 1)
        row_average = (result[index, ...] + result[opposite, ...]) * 0.5
        result[index, ...] = result[index, ...] * (1.0 - weight) + row_average * weight
        result[opposite, ...] = result[opposite, ...] * (1.0 - weight) + row_average * weight

        column_average = (result[:, index, ...] + result[:, opposite, ...]) * 0.5
        result[:, index, ...] = result[:, index, ...] * (1.0 - weight) + column_average * weight
        result[:, opposite, ...] = result[:, opposite, ...] * (1.0 - weight) + column_average * weight
    return result


def normalized_height(luminance: np.ndarray, strength: float) -> np.ndarray:
    broad = gaussian(luminance, 12.0)
    fine = gaussian(luminance, 1.2)
    detail = (luminance - broad) * 0.72 + (luminance - fine) * 0.28
    low, high = np.percentile(detail, [2.0, 98.0])
    scaled = (detail - low) / max(1e-5, high - low)
    height = 0.5 + (scaled - 0.5) * strength * 2.0
    return close_edges(periodic_component(np.clip(height, 0.0, 1.0)))


def normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    gradient_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    gradient_y = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.stack((-gradient_x, -gradient_y, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True).clip(min=1e-6)
    return close_edges(normal * 0.5 + 0.5)


def roughness_from_height(height: np.ndarray, base: float, variance: float) -> np.ndarray:
    micro = height - gaussian(height, 5.0)
    roughness = base + micro * (variance * 7.0)
    return close_edges(periodic_component(np.clip(roughness, 0.02, 0.99)))


def seam_error(array: np.ndarray) -> float:
    vertical = np.abs(array[0, ...] - array[-1, ...]).mean()
    horizontal = np.abs(array[:, 0, ...] - array[:, -1, ...]).mean()
    return float((vertical + horizontal) * 0.5)


def build_material(material_dir: Path, source_root: Path, size: int) -> dict[str, float | str]:
    material_id = material_dir.name
    profile = PROFILES[material_id]
    source_path = source_root / f"{material_id}.webp"
    source = Image.open(source_path).convert("RGB")

    crop_size = int(min(source.size) * 0.84)
    left = (source.width - crop_size) // 2
    top = (source.height - crop_size) // 2
    source = source.crop((left, top, left + crop_size, top + crop_size))
    source = source.resize((size, size), Image.Resampling.LANCZOS)

    basecolor = flatten_lighting(image_to_array(source))
    basecolor = np.clip(close_edges(periodic_component(basecolor)), 0.0, 1.0)
    luminance = basecolor @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    height = normalized_height(luminance, profile["height"])
    normal = normal_from_height(height, profile["normal"])
    roughness = roughness_from_height(height, profile["roughness"], profile["variance"])

    array_to_image(basecolor).save(material_dir / "basecolor.webp", "WEBP", quality=88, method=6)
    array_to_image(normal).save(material_dir / "normal.webp", "WEBP", quality=92, method=6)
    array_to_image(roughness, "L").save(material_dir / "roughness.png", optimize=True)
    array_to_image(height, "L").save(material_dir / "height.png", optimize=True)

    return {
        "material": material_id,
        "source": str(source_path),
        "size": size,
        "basecolor_seam_error": seam_error(basecolor),
        "height_seam_error": seam_error(height),
        "roughness_mean": float(roughness.mean()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("public/materials-v2"))
    parser.add_argument("--source-root", type=Path, default=Path("assets/material-sources-v2"))
    parser.add_argument("--size", type=int, default=512)
    args = parser.parse_args()

    args.source_root.mkdir(parents=True, exist_ok=True)
    for material_id in PROFILES:
        legacy_source = args.root / material_id / "source.png"
        source_path = args.source_root / f"{material_id}.webp"
        if legacy_source.exists() and not source_path.exists():
            source = Image.open(legacy_source).convert("RGB")
            source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            source.save(source_path, "WEBP", quality=94, method=6)

    report = []
    for material_id in PROFILES:
        material_dir = args.root / material_id
        if (args.source_root / f"{material_id}.webp").exists():
            report.append(build_material(material_dir, args.source_root, args.size))

    manifest_path = args.root / "manifest.json"
    manifest_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

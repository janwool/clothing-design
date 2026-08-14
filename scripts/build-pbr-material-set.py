#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def periodic_component(channel: np.ndarray) -> np.ndarray:
    """Remove the smooth boundary mismatch while preserving the texture detail."""
    height, width = channel.shape
    boundary = np.zeros_like(channel, dtype=np.float64)
    boundary[0, :] += channel[-1, :] - channel[0, :]
    boundary[-1, :] += channel[0, :] - channel[-1, :]
    boundary[:, 0] += channel[:, -1] - channel[:, 0]
    boundary[:, -1] += channel[:, 0] - channel[:, -1]

    x = np.arange(width, dtype=np.float64)
    y = np.arange(height, dtype=np.float64)[:, None]
    denominator = (
        2 * np.cos(2 * np.pi * x / width)
        + 2 * np.cos(2 * np.pi * y / height)
        - 4
    )
    denominator[0, 0] = 1
    smooth = np.fft.ifft2(np.fft.fft2(boundary) / denominator).real
    smooth -= smooth.mean()
    return channel - smooth


def make_periodic(image: Image.Image, size: int, tile_repeat: int, base_contrast: float) -> Image.Image:
    source = image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    pixels = np.asarray(source, dtype=np.float64) / 255
    periodic = np.stack([periodic_component(pixels[:, :, index]) for index in range(3)], axis=2)
    low, high = np.percentile(periodic, (0.1, 99.9), axis=(0, 1), keepdims=True)
    periodic = np.clip(periodic, low, high)
    periodic = np.clip(periodic, 0, 1)
    periodic[-1, :, :] = periodic[0, :, :]
    periodic[:, -1, :] = periodic[:, 0, :]
    mean = periodic.mean(axis=(0, 1), keepdims=True)
    periodic = np.clip(mean + (periodic - mean) * base_contrast, 0, 1)
    result = Image.fromarray(np.uint8(np.round(periodic * 255)), mode="RGB")
    if tile_repeat > 1:
        tile_size = max(1, size // tile_repeat)
        tile = result.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
        repeated = Image.new("RGB", (size, size))
        for y in range(0, size, tile_size):
            for x in range(0, size, tile_size):
                repeated.paste(tile, (x, y))
        result = repeated.crop((0, 0, size, size))
        pixels = np.asarray(result).copy()
        pixels[-1, :, :] = pixels[0, :, :]
        pixels[:, -1, :] = pixels[:, 0, :]
        result = Image.fromarray(pixels, mode="RGB")
    return result


def height_from_base(base: Image.Image, contrast: float) -> Image.Image:
    luminance = np.asarray(base.convert("L"), dtype=np.float64) / 255
    illumination = np.asarray(base.convert("L").filter(ImageFilter.GaussianBlur(18)), dtype=np.float64) / 255
    detail = luminance - illumination
    low, high = np.percentile(detail, (1.0, 99.0))
    normalized = np.clip((detail - low) / max(1e-9, high - low), 0, 1)
    normalized = 0.5 + (normalized - 0.5) * contrast
    normalized[-1, :] = normalized[0, :]
    normalized[:, -1] = normalized[:, 0]
    return Image.fromarray(np.uint8(np.round(np.clip(normalized, 0, 1) * 255)), mode="L")


def normal_from_height(height: Image.Image, strength: float) -> Image.Image:
    values = np.asarray(height, dtype=np.float64) / 255
    dx = (np.roll(values, -1, axis=1) - np.roll(values, 1, axis=1)) * strength
    dy = (np.roll(values, -1, axis=0) - np.roll(values, 1, axis=0)) * strength
    normals = np.dstack((-dx, dy, np.ones_like(values)))
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    encoded = np.clip(normals * 0.5 + 0.5, 0, 1)
    encoded[-1, :, :] = encoded[0, :, :]
    encoded[:, -1, :] = encoded[:, 0, :]
    return Image.fromarray(np.uint8(np.round(encoded * 255)), mode="RGB")


def roughness_from_height(height: Image.Image, roughness: float) -> Image.Image:
    detail = np.asarray(height, dtype=np.float64) / 255 - 0.5
    values = np.clip(roughness + detail * 0.08, 0, 1)
    values[-1, :] = values[0, :]
    values[:, -1] = values[:, 0]
    return Image.fromarray(np.uint8(np.round(values * 255)), mode="L")


def edge_rms(image: Image.Image) -> dict[str, float]:
    pixels = np.asarray(image.convert("RGB"), dtype=np.float64)
    left_right = float(np.sqrt(np.mean((pixels[:, 0, :] - pixels[:, -1, :]) ** 2)))
    top_bottom = float(np.sqrt(np.mean((pixels[0, :, :] - pixels[-1, :, :]) ** 2)))
    return {"left_right": round(left_right, 6), "top_bottom": round(top_bottom, 6)}


def tint_to_target(image: Image.Image, target_hex: str) -> Image.Image:
    value = target_hex.removeprefix("#")
    if len(value) != 6:
        raise ValueError("--target-color must be a six-digit hex color")
    target = np.array([int(value[index : index + 2], 16) for index in (0, 2, 4)], dtype=np.float64) / 255
    pixels = np.asarray(image.convert("RGB"), dtype=np.float64) / 255
    luminance = pixels @ np.array([0.2126, 0.7152, 0.0722])
    tone = luminance / max(float(luminance.mean()), 1e-9)
    tinted = np.clip(target[None, None, :] * tone[:, :, None], 0, 1)
    tinted[-1, :, :] = tinted[0, :, :]
    tinted[:, -1, :] = tinted[:, 0, :]
    return Image.fromarray(np.uint8(np.round(tinted * 255)), mode="RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a seamless base color, height, normal, and roughness set.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--roughness", type=float, default=0.86)
    parser.add_argument("--height-contrast", type=float, default=0.62)
    parser.add_argument("--normal-strength", type=float, default=2.2)
    parser.add_argument("--tile-repeat", type=int, default=1)
    parser.add_argument("--base-contrast", type=float, default=1.0)
    parser.add_argument("--target-color", help="Optional six-digit sRGB tint, for example 9aaab5.")
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    base = make_periodic(Image.open(args.input), args.size, args.tile_repeat, args.base_contrast)
    if args.target_color:
        base = tint_to_target(base, args.target_color)
    height = height_from_base(base, args.height_contrast)
    normal = normal_from_height(height, args.normal_strength)
    roughness = roughness_from_height(height, args.roughness)

    base.save(args.output / "basecolor.png", optimize=True)
    height.save(args.output / "height.png", optimize=True)
    normal.save(args.output / "normal.png", optimize=True)
    roughness.save(args.output / "roughness.png", optimize=True)
    base.save(args.output / "basecolor.jpg", quality=84, optimize=True, progressive=True)
    normal.save(args.output / "normal.jpg", quality=88, subsampling=0)
    roughness.convert("RGB").save(
        args.output / "roughness.jpg",
        quality=86,
        subsampling=0,
        optimize=True,
        progressive=True,
    )
    manifest = {
        "source": str(args.input),
        "size": args.size,
        "roughness": args.roughness,
        "height_contrast": args.height_contrast,
        "normal_strength": args.normal_strength,
        "tile_repeat": args.tile_repeat,
        "base_contrast": args.base_contrast,
        "target_color": f"#{args.target_color.removeprefix('#')}" if args.target_color else None,
        "basecolor_edge_rms": edge_rms(base),
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()

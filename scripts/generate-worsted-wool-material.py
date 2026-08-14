#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def tileable_noise(size: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size] / size
    result = np.zeros((size, size), dtype=np.float64)
    for frequency in (1, 2, 3, 5, 8, 13, 21):
        angle = rng.uniform(0, 2 * np.pi)
        phase = rng.uniform(0, 2 * np.pi)
        kx = max(1, round(np.cos(angle) * frequency))
        ky = max(1, round(np.sin(angle) * frequency))
        result += np.sin(2 * np.pi * (kx * x + ky * y) + phase) / np.sqrt(frequency)
    result -= result.mean()
    result /= max(result.std(), 1e-9)
    return result


def normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.dstack((-dx, dy, np.ones_like(height)))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return np.clip(normal * 0.5 + 0.5, 0, 1)


def save_rgb(array: np.ndarray, path: Path) -> None:
    Image.fromarray(np.uint8(np.round(np.clip(array, 0, 1) * 255)), "RGB").save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a seamless fine worsted-wool PBR material set.")
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--color", default="b7ad9e", help="Six-digit sRGB base color without #.")
    parser.add_argument("--roughness", type=float, default=0.79)
    parser.add_argument("--normal-strength", type=float, default=5.2)
    parser.add_argument("--weave-period", type=float, default=11.0)
    parser.add_argument("--height-twill-amplitude", type=float, default=0.074)
    parser.add_argument("--height-yarn-amplitude", type=float, default=0.022)
    parser.add_argument("--base-twill-amplitude", type=float, default=0.024)
    parser.add_argument("--base-yarn-amplitude", type=float, default=0.009)
    parser.add_argument("--base-noise-amplitude", type=float, default=0.012)
    parser.add_argument("--roughness-noise-amplitude", type=float, default=0.027)
    parser.add_argument("--roughness-twill-amplitude", type=float, default=0.018)
    parser.add_argument("--seed", type=int, default=27)
    args = parser.parse_args()

    if len(args.color) != 6:
        raise ValueError("--color must be six hexadecimal digits")

    size = args.size
    args.output.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:size, 0:size]
    period = args.weave_period

    # A compact 2x2-style diagonal twill with subdued warp/weft microstructure.
    twill = np.sin(2 * np.pi * (x + y) / period)
    twill += 0.28 * np.sin(4 * np.pi * (x + y) / period + 0.45)
    yarn = 0.34 * np.sin(2 * np.pi * x / (period * 0.52))
    yarn += 0.24 * np.sin(2 * np.pi * y / (period * 0.52) + 0.8)
    broad = tileable_noise(size, args.seed)
    micro = tileable_noise(size, args.seed + 1)

    height = (
        0.5
        + args.height_twill_amplitude * twill
        + args.height_yarn_amplitude * yarn
        + 0.012 * broad
        + 0.007 * micro
    )
    height = np.clip(height, 0, 1)

    rgb = np.array([int(args.color[index : index + 2], 16) for index in (0, 2, 4)]) / 255
    tone = (
        1
        + args.base_twill_amplitude * twill
        + args.base_yarn_amplitude * yarn
        + args.base_noise_amplitude * broad
        + 0.004 * micro
    )
    base = np.clip(rgb[None, None, :] * tone[:, :, None], 0, 1)
    normal = normal_from_height(height, args.normal_strength)
    roughness = np.clip(
        args.roughness
        + args.roughness_noise_amplitude * broad
        - args.roughness_twill_amplitude * twill,
        0,
        1,
    )

    # Force exact edge equality so all maps are mathematically seamless.
    for array in (base, normal):
        array[-1, :, :] = array[0, :, :]
        array[:, -1, :] = array[:, 0, :]
    for array in (height, roughness):
        array[-1, :] = array[0, :]
        array[:, -1] = array[:, 0]

    base_image = Image.fromarray(np.uint8(np.round(base * 255)), "RGB")
    normal_image = Image.fromarray(np.uint8(np.round(normal * 255)), "RGB")
    roughness_image = Image.fromarray(np.uint8(np.round(roughness * 255)), "L")
    height_image = Image.fromarray(np.uint8(np.round(height * 255)), "L")

    base_image.save(args.output / "basecolor.png", optimize=True)
    normal_image.save(args.output / "normal.png", optimize=True)
    roughness_image.save(args.output / "roughness.png", optimize=True)
    height_image.save(args.output / "height.png", optimize=True)
    base_image.save(args.output / "basecolor.jpg", quality=88, optimize=True, progressive=True)
    normal_image.save(args.output / "normal.jpg", quality=90, subsampling=0, optimize=True)
    roughness_image.convert("RGB").save(
        args.output / "roughness.jpg", quality=88, subsampling=0, optimize=True, progressive=True
    )

    manifest = {
        "generator": "fine-worsted-wool",
        "size": size,
        "color": f"#{args.color}",
        "roughness": args.roughness,
        "normal_strength": args.normal_strength,
        "weave_period": period,
        "height_twill_amplitude": args.height_twill_amplitude,
        "height_yarn_amplitude": args.height_yarn_amplitude,
        "base_twill_amplitude": args.base_twill_amplitude,
        "base_yarn_amplitude": args.base_yarn_amplitude,
        "base_noise_amplitude": args.base_noise_amplitude,
        "roughness_noise_amplitude": args.roughness_noise_amplitude,
        "roughness_twill_amplitude": args.roughness_twill_amplitude,
        "seed": args.seed,
        "seamless_edges": True,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()

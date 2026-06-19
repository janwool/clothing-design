#!/usr/bin/env python3
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "materials"
SIZE = 512


@dataclass(frozen=True)
class MaterialSpec:
    id: str
    color: tuple[int, int, int]
    roughness: float
    pattern: str
    normal_strength: float


MATERIALS = [
    MaterialSpec("cotton-jersey", (244, 241, 234), 0.86, "jersey", 0.55),
    MaterialSpec("rib-knit", (236, 231, 220), 0.88, "rib", 0.72),
    MaterialSpec("french-terry", (215, 208, 196), 0.91, "terry", 0.62),
    MaterialSpec("fleece", (239, 233, 223), 0.96, "fleece", 0.42),
    MaterialSpec("poplin", (247, 243, 234), 0.74, "plain", 0.38),
    MaterialSpec("oxford-cloth", (223, 232, 238), 0.82, "oxford", 0.48),
    MaterialSpec("linen", (231, 221, 200), 0.93, "linen", 0.58),
    MaterialSpec("denim", (53, 93, 132), 0.78, "denim", 0.68),
    MaterialSpec("twill", (182, 170, 146), 0.81, "twill", 0.58),
    MaterialSpec("wool-blend", (95, 98, 91), 0.90, "wool", 0.46),
    MaterialSpec("nylon-ripstop", (102, 114, 124), 0.46, "ripstop", 0.32),
    MaterialSpec("leather", (45, 37, 32), 0.38, "leather", 0.52),
    MaterialSpec("satin-silk", (222, 211, 202), 0.27, "satin", 0.18),
    MaterialSpec("velvet", (61, 37, 69), 0.88, "velvet", 0.30),
    MaterialSpec("modal-stretch", (221, 216, 209), 0.68, "modal", 0.30),
    MaterialSpec("wool-felt", (118, 109, 96), 0.97, "felt", 0.42),
]


def clamp(value: float, low: int = 0, high: int = 255) -> int:
    return max(low, min(high, int(round(value))))


def fbm(width: int, height: int, seed: int, octaves: int = 5) -> Image.Image:
    rng = random.Random(seed)
    acc = Image.new("L", (width, height), 128)
    weight_sum = 0.0
    weight = 1.0
    for octave in range(octaves):
        scale = max(8, width // (2 ** (octave + 4)))
        small = Image.effect_noise((scale, scale), rng.uniform(20, 110)).convert("L")
        small = small.resize((width, height), Image.Resampling.BICUBIC)
        acc = Image.blend(acc, small, weight / (weight_sum + weight))
        weight_sum += weight
        weight *= 0.52
    return acc.filter(ImageFilter.GaussianBlur(0.35))


def pattern_value(spec: MaterialSpec, x: int, y: int, noise_px: float) -> float:
    nx = x / SIZE
    ny = y / SIZE
    weave = 0.0
    if spec.pattern == "jersey":
        weave = 16 * math.sin(y * 2 * math.pi / 9) + 5 * math.sin(x * 2 * math.pi / 23)
    elif spec.pattern == "rib":
        rib = math.sin(x * 2 * math.pi / 28)
        weave = 34 * abs(rib) + 7 * math.sin(y * 2 * math.pi / 13)
    elif spec.pattern == "terry":
        weave = 16 * math.sin(y * 2 * math.pi / 12) + 18 * math.sin((x + y) * 2 * math.pi / 37)
    elif spec.pattern == "fleece":
        weave = 20 * noise_px + 8 * math.sin((x + y) * 2 * math.pi / 41)
    elif spec.pattern == "plain":
        weave = 11 * math.sin(x * 2 * math.pi / 10) + 11 * math.sin(y * 2 * math.pi / 10)
    elif spec.pattern == "oxford":
        weave = 18 * math.sin((x + y) * 2 * math.pi / 22) + 18 * math.sin((x - y) * 2 * math.pi / 22)
    elif spec.pattern == "linen":
        slub = 22 * math.sin(x * 2 * math.pi / 43 + noise_px * 0.06)
        weave = slub + 14 * math.sin(y * 2 * math.pi / 17) + 12 * noise_px
    elif spec.pattern == "denim":
        weave = 26 * math.sin((x + y * 1.25) * 2 * math.pi / 18) - 14 * math.sin((x - y) * 2 * math.pi / 31)
    elif spec.pattern == "twill":
        weave = 28 * math.sin((x + y * 1.1) * 2 * math.pi / 24) + 5 * math.sin(y * 2 * math.pi / 13)
    elif spec.pattern == "wool":
        weave = 17 * math.sin((x * 0.8 + y) * 2 * math.pi / 36) + 18 * noise_px
    elif spec.pattern == "ripstop":
        grid_x = 32 if x % 96 < 5 else 0
        grid_y = 32 if y % 96 < 5 else 0
        weave = grid_x + grid_y + 5 * math.sin(x * 2 * math.pi / 17) + 4 * math.sin(y * 2 * math.pi / 19)
    elif spec.pattern == "leather":
        pores = 22 * math.sin((nx * 37 + noise_px * 0.09) * 2 * math.pi)
        weave = pores + 20 * noise_px
    elif spec.pattern == "satin":
        weave = 19 * math.sin((x * 0.55 + y * 0.15) * 2 * math.pi / 96) + 4 * noise_px
    elif spec.pattern == "velvet":
        weave = 15 * math.sin((nx * 9 + ny * 3) * 2 * math.pi) + 18 * noise_px
    elif spec.pattern == "modal":
        weave = 9 * math.sin(x * 2 * math.pi / 18) + 5 * math.sin(y * 2 * math.pi / 22)
    elif spec.pattern == "felt":
        weave = 25 * noise_px + 7 * math.sin((x - y) * 2 * math.pi / 38)
    return weave


def make_maps(spec: MaterialSpec) -> tuple[Image.Image, Image.Image, Image.Image]:
    seed = sum(ord(c) for c in spec.id)
    noise_img = fbm(SIZE, SIZE, seed, 5)
    noise = noise_img.load()
    base = Image.new("RGB", (SIZE, SIZE))
    height = Image.new("L", (SIZE, SIZE))
    rough = Image.new("L", (SIZE, SIZE))
    base_px = base.load()
    height_px = height.load()
    rough_px = rough.load()

    for y in range(SIZE):
        for x in range(SIZE):
            n = (noise[x, y] - 128) / 128
            weave = pattern_value(spec, x, y, n)
            fiber = (weave * 0.18) + n * 8
            if spec.pattern in {"satin", "nylon-ripstop", "leather", "velvet"}:
                contrast = 0.12
            else:
                contrast = 0.08
            shade = 1 + (fiber / 255) * contrast
            r, g, b = spec.color
            if spec.pattern == "denim" and (x + y) % 13 < 4:
                shade *= 1.025
            if spec.pattern == "wool" and (x * 5 + y * 3) % 47 < 7:
                shade *= 1.035
            base_px[x, y] = (clamp(r * shade), clamp(g * shade), clamp(b * shade))
            height_px[x, y] = clamp(128 + weave * 0.36 + n * 8)
            rough_px[x, y] = clamp(spec.roughness * 255 + n * 5 - abs(weave) * 0.04)

    return (
        base.filter(ImageFilter.GaussianBlur(0.12)),
        height.filter(ImageFilter.GaussianBlur(0.45)),
        rough.filter(ImageFilter.GaussianBlur(0.35)),
    )


def make_normal(height: Image.Image, strength: float) -> Image.Image:
    src = height.convert("L")
    src_px = src.load()
    normal = Image.new("RGB", src.size)
    out = normal.load()
    width, height_px = src.size
    for y in range(height_px):
        y0 = (y - 1) % height_px
        y1 = (y + 1) % height_px
        for x in range(width):
            x0 = (x - 1) % width
            x1 = (x + 1) % width
            dx = (src_px[x1, y] - src_px[x0, y]) / 255 * strength
            dy = (src_px[x, y1] - src_px[x, y0]) / 255 * strength
            nx, ny, nz = -dx, -dy, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            nx, ny, nz = nx / length, ny / length, nz / length
            out[x, y] = (
                clamp((nx * 0.5 + 0.5) * 255),
                clamp((ny * 0.5 + 0.5) * 255),
                clamp((nz * 0.5 + 0.5) * 255),
            )
    return normal


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for spec in MATERIALS:
        material_dir = OUT_DIR / spec.id
        material_dir.mkdir(parents=True, exist_ok=True)
        base, height, rough = make_maps(spec)
        normal = make_normal(height, spec.normal_strength)
        base.save(material_dir / "basecolor.png", optimize=True)
        height.save(material_dir / "height.png", optimize=True)
        rough.save(material_dir / "roughness.png", optimize=True)
        normal.save(material_dir / "normal.png", optimize=True)
        print(f"generated {spec.id}", flush=True)


if __name__ == "__main__":
    main()

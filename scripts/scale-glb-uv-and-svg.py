#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

import bpy


NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")
PATH_RE = re.compile(r'(<path\b[^>]*\sd=")([^"]+)("[^>]*/?>)')


def svg_bbox(svg_text: str) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for _, d, _ in PATH_RE.findall(svg_text):
        nums = [float(value) for value in NUMBER_RE.findall(d)]
        xs.extend(nums[0::2])
        ys.extend(nums[1::2])
    if not xs or not ys:
        raise RuntimeError("SVG has no path coordinates")
    return min(xs), min(ys), max(xs), max(ys)


def transform_numbers_in_d(d: str, scale: float, dx: float, dy: float) -> str:
    nums = [float(value) for value in NUMBER_RE.findall(d)]
    formatted: list[str] = []
    for index in range(0, len(nums), 2):
        x = nums[index] * scale + dx
        y = nums[index + 1] * scale + dy
        formatted.extend([f"{x:.2f}", f"{y:.2f}"])
    pieces = []
    last_end = 0
    for value, match in zip(formatted, NUMBER_RE.finditer(d)):
        pieces.append(d[last_end : match.start()])
        pieces.append(value)
        last_end = match.end()
    pieces.append(d[last_end:])
    return "".join(pieces)


def scale_svg(input_svg: Path, output_svg: Path, size: int, margin: float) -> tuple[float, float, float, tuple[float, float, float, float]]:
    text = input_svg.read_text(encoding="utf-8")
    min_x, min_y, max_x, max_y = svg_bbox(text)
    width = max_x - min_x
    height = max_y - min_y
    if width <= 0 or height <= 0:
        raise RuntimeError("SVG path bbox has invalid size")

    scale = min((size - margin * 2.0) / width, (size - margin * 2.0) / height)
    dx = (size - width * scale) / 2.0 - min_x * scale
    dy = (size - height * scale) / 2.0 - min_y * scale

    def repl(match: re.Match[str]) -> str:
        prefix, d, suffix = match.groups()
        return prefix + html.escape(transform_numbers_in_d(d, scale, dx, dy), quote=True) + suffix

    output_svg.write_text(PATH_RE.sub(repl, text), encoding="utf-8")
    return scale, dx, dy, (min_x, min_y, max_x, max_y)


def scale_glb_uv(
    input_glb: Path,
    output_glb: Path,
    scale: float,
    dx: float,
    dy: float,
    size: int,
    source_bbox: tuple[float, float, float, float],
    bbox_epsilon: float,
) -> tuple[int, int]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=str(input_glb))

    touched = 0
    skipped = 0
    min_x, min_y, max_x, max_y = source_bbox
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.uv_layers:
            continue
        uv_layer = obj.data.uv_layers.active
        for item in uv_layer.data:
            x = item.uv.x * size
            y = (1.0 - item.uv.y) * size
            if (
                x < min_x - bbox_epsilon
                or x > max_x + bbox_epsilon
                or y < min_y - bbox_epsilon
                or y > max_y + bbox_epsilon
            ):
                skipped += 1
                continue
            x = x * scale + dx
            y = y * scale + dy
            item.uv.x = x / size
            item.uv.y = 1.0 - y / size
            touched += 1
        obj.data.update()

    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    return touched, skipped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_glb", type=Path)
    parser.add_argument("input_svg", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--margin", type=float, default=32.0)
    parser.add_argument("--bbox-epsilon", type=float, default=0.25)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    scale, dx, dy, bbox = scale_svg(args.input_svg, args.output_svg, args.size, args.margin)
    touched, skipped = scale_glb_uv(
        args.input_glb,
        args.output_glb,
        scale,
        dx,
        dy,
        args.size,
        bbox,
        args.bbox_epsilon,
    )
    print(f"svg_bbox_before={bbox}")
    print(f"scale={scale:.8f} dx={dx:.4f} dy={dy:.4f}")
    print(f"uv_loops_touched={touched}")
    print(f"uv_loops_skipped={skipped}")
    print(f"output_glb={args.output_glb}")
    print(f"output_svg={args.output_svg}")


if __name__ == "__main__":
    main()

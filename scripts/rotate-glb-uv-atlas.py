#!/usr/bin/env python3
"""Rotate an existing GLB UV atlas and export its matching SVG outlines."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
HELPER_PATH = ROOT / "scripts" / "repack-glb-uv-and-export-svg.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("repack_glb_uv", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load UV helper: {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def uv_bounds(objects: list[bpy.types.Object]) -> dict[str, float]:
    coordinates = [
        tuple(item.uv)
        for obj in objects
        for layer in obj.data.uv_layers
        for item in layer.data
    ]
    if not coordinates:
        raise RuntimeError("Imported GLB has no UV coordinates")
    return {
        "min_u": min(point[0] for point in coordinates),
        "max_u": max(point[0] for point in coordinates),
        "min_v": min(point[1] for point in coordinates),
        "max_v": max(point[1] for point in coordinates),
    }


def rotate_uv_atlas(objects: list[bpy.types.Object], degrees: float) -> int:
    radians = math.radians(degrees)
    cosine = math.cos(radians)
    sine = math.sin(radians)
    changed = 0
    for obj in objects:
        for layer in obj.data.uv_layers:
            for item in layer.data:
                x = item.uv.x - 0.5
                y = item.uv.y - 0.5
                item.uv.x = 0.5 + x * cosine - y * sine
                item.uv.y = 0.5 + x * sine + y * cosine
                changed += 1
        obj.data.update()
    return changed


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--degrees", type=float, default=180.0)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--position-quantization", type=int, default=14)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--min-svg-area", type=float, default=50.0)
    parser.add_argument("--min-svg-span", type=float, default=1.5)
    args = parser.parse_args(argv)

    helper = load_helper()
    helper.clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("Imported GLB has no mesh objects")

    before = uv_bounds(objects)
    changed = rotate_uv_atlas(objects, args.degrees)
    after = uv_bounds(objects)
    tolerance = 1e-5
    if min(after.values()) < -tolerance or max(after.values()) > 1.0 + tolerance:
        raise RuntimeError(f"Rotated UVs exceed the normalized atlas: {after}")

    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    args.output_svg.parent.mkdir(parents=True, exist_ok=True)
    svg_paths = helper.export_svg(
        args.output_svg,
        objects,
        args.size,
        args.min_svg_area,
        outer_contours_only=True,
        min_span=args.min_svg_span,
    )
    helper.export_glb(args.output_glb, args.position_quantization)

    report = {
        "input": str(args.input.resolve()),
        "output_glb": str(args.output_glb.resolve()),
        "output_svg": str(args.output_svg.resolve()),
        "degrees": args.degrees,
        "mesh_objects": len(objects),
        "uv_loops_changed": changed,
        "uv_bounds_before": before,
        "uv_bounds_after": after,
        "svg_paths": svg_paths,
        "geometry_changed": False,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

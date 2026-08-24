#!/usr/bin/env python3
"""Rotate an existing GLB UV atlas and export its matching SVG outlines."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import xml.etree.ElementTree as ET
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


def transform_uv_atlas(
    objects: list[bpy.types.Object],
    degrees: float,
    flip_u: bool = False,
    flip_v: bool = False,
) -> int:
    radians = math.radians(degrees)
    cosine = math.cos(radians)
    sine = math.sin(radians)
    u_sign = -1.0 if flip_u else 1.0
    v_sign = -1.0 if flip_v else 1.0
    changed = 0
    for obj in objects:
        for layer in obj.data.uv_layers:
            for item in layer.data:
                x = (item.uv.x - 0.5) * u_sign
                y = (item.uv.y - 0.5) * v_sign
                item.uv.x = 0.5 + x * cosine - y * sine
                item.uv.y = 0.5 + x * sine + y * cosine
                changed += 1
        obj.data.update()
    return changed


def svg_transform_matrix(degrees: float, flip_u: bool, flip_v: bool, size: int) -> str:
    """Convert the centered UV transform into SVG's downward-positive Y axis."""
    radians = math.radians(degrees)
    cosine = math.cos(radians)
    sine = math.sin(radians)
    u_sign = -1.0 if flip_u else 1.0
    v_sign = -1.0 if flip_v else 1.0
    a = cosine * u_sign
    b = -sine * u_sign
    c = sine * v_sign
    d = cosine * v_sign
    center = size / 2.0
    e = center - a * center - c * center
    f = center - b * center - d * center
    values = (a, b, c, d, e, f)
    return "matrix(" + " ".join(f"{value:.9g}" for value in values) + ")"


def transform_existing_svg(
    source: Path,
    destination: Path,
    degrees: float,
    flip_u: bool,
    flip_v: bool,
    size: int,
) -> int:
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(source)
    root = tree.getroot()
    namespace = root.tag.partition("}")[0] + "}" if root.tag.startswith("{") else ""
    wrapper = ET.Element(
        f"{namespace}g",
        {"transform": svg_transform_matrix(degrees, flip_u, flip_v, size)},
    )
    children = list(root)
    for child in children:
        root.remove(child)
        wrapper.append(child)
    root.append(wrapper)
    destination.parent.mkdir(parents=True, exist_ok=True)
    tree.write(destination, encoding="utf-8", xml_declaration=False)
    return sum(1 for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "path")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--degrees", type=float, default=180.0)
    parser.add_argument("--flip-u", action="store_true")
    parser.add_argument("--flip-v", action="store_true")
    parser.add_argument("--source-svg", type=Path)
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
    changed = transform_uv_atlas(objects, args.degrees, args.flip_u, args.flip_v)
    after = uv_bounds(objects)
    tolerance = 1e-5
    if min(after.values()) < -tolerance or max(after.values()) > 1.0 + tolerance:
        raise RuntimeError(f"Rotated UVs exceed the normalized atlas: {after}")

    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    args.output_svg.parent.mkdir(parents=True, exist_ok=True)
    if args.source_svg:
        svg_paths = transform_existing_svg(
            args.source_svg,
            args.output_svg,
            args.degrees,
            args.flip_u,
            args.flip_v,
            args.size,
        )
    else:
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
        "flip_u": args.flip_u,
        "flip_v": args.flip_v,
        "mesh_objects": len(objects),
        "uv_loops_changed": changed,
        "uv_bounds_before": before,
        "uv_bounds_after": after,
        "svg_paths": svg_paths,
        "source_svg": str(args.source_svg.resolve()) if args.source_svg else None,
        "geometry_changed": False,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

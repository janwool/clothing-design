#!/usr/bin/env python3
"""Flip selected SVG panels and their matching GLB UV loops vertically."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rewrite_path_vertical(path_data: str, center_y: float) -> str:
    token_pattern = re.compile(r"-?\d+(?:\.\d+)?(?:e[-+]?\d+)?", re.I)
    token_index = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal token_index
        value = float(match.group(0))
        is_y = token_index % 2 == 1
        token_index += 1
        if not is_y:
            return f"{value:.2f}"
        return f"{2.0 * center_y - value:.2f}"

    return token_pattern.sub(replace, path_data)


def transform_svg(source: Path, destination: Path, selected: dict[int, dict[str, object]]) -> int:
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(source)
    paths = [node for node in tree.getroot().iter() if node.tag.rsplit("}", 1)[-1] == "path" and node.get("d")]
    for index, item in selected.items():
        if index >= len(paths):
            raise RuntimeError(f"SVG path index {index} exceeds {len(paths)} paths")
        min_x, min_y, max_x, max_y = item["bbox"]
        del min_x, max_x
        paths[index].set("d", rewrite_path_vertical(paths[index].get("d", ""), (min_y + max_y) / 2.0))
    destination.parent.mkdir(parents=True, exist_ok=True)
    tree.write(destination, encoding="utf-8", xml_declaration=False)
    return len(paths)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input_glb", type=Path)
    parser.add_argument("input_svg", type=Path)
    parser.add_argument("audit_report", type=Path)
    parser.add_argument("slug")
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--min-physical-area", type=float, default=0.05)
    args = parser.parse_args(argv)

    audit_helper = load_module("audit_glb_uv_direction", ROOT / "scripts" / "audit-glb-uv-direction.py")
    export_helper = load_module("repack_glb_uv", ROOT / "scripts" / "repack-glb-uv-and-export-svg.py")
    catalog_report = json.loads(args.audit_report.read_text(encoding="utf-8"))
    model = next((item for item in catalog_report["results"] if item["slug"] == args.slug), None)
    if model is None:
        raise RuntimeError(f"Slug not found in audit report: {args.slug}")
    selected = {
        int(item["index"]): item
        for item in model["svg_paths"]
        if item["reliable_v"] and item["recommended_flip_v"] and item["physical_area"] >= args.min_physical_area
    }
    if not selected:
        raise RuntimeError(f"No reliable downward panels found for {args.slug}")

    export_helper.clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input_glb.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    svg_paths, width, height = audit_helper.load_svg_paths(args.input_svg)
    if len(svg_paths) != len(model["svg_paths"]):
        raise RuntimeError(f"SVG path count changed: {len(svg_paths)} != {len(model['svg_paths'])}")

    transformed_faces = 0
    transformed_loops = 0
    unmatched_faces = 0
    for obj in objects:
        mesh = obj.data
        for layer in mesh.uv_layers:
            for polygon in mesh.polygons:
                loops = list(polygon.loop_indices)
                if not loops:
                    continue
                uv_center = sum((layer.data[loop].uv for loop in loops), Vector((0.0, 0.0))) / len(loops)
                path_index = audit_helper.locate_svg_path(
                    (uv_center.x * width, (1.0 - uv_center.y) * height),
                    svg_paths,
                )
                if path_index is None:
                    unmatched_faces += 1
                    continue
                item = selected.get(path_index)
                if item is None:
                    continue
                min_x, min_y, max_x, max_y = item["bbox"]
                # A few source meshes contain long seam/degenerate triangles
                # whose centroid falls inside one island while another UV
                # vertex belongs elsewhere. Never drag those vertices across
                # the atlas when correcting a panel.
                tolerance = 0.75
                if any(
                    not (
                        min_x - tolerance <= layer.data[loop].uv.x * width <= max_x + tolerance
                        and min_y - tolerance <= (1.0 - layer.data[loop].uv.y) * height <= max_y + tolerance
                    )
                    for loop in loops
                ):
                    unmatched_faces += 1
                    continue
                center_v = 1.0 - ((min_y + max_y) / 2.0) / height
                for loop in loops:
                    layer.data[loop].uv.y = 2.0 * center_v - layer.data[loop].uv.y
                    transformed_loops += 1
                transformed_faces += 1
            mesh.update()

    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    args.output_svg.parent.mkdir(parents=True, exist_ok=True)
    path_count = transform_svg(args.input_svg, args.output_svg, selected)
    export_helper.export_glb(args.output_glb, 14)
    result = {
        "slug": args.slug,
        "input_glb": str(args.input_glb.resolve()),
        "input_svg": str(args.input_svg.resolve()),
        "output_glb": str(args.output_glb.resolve()),
        "output_svg": str(args.output_svg.resolve()),
        "selected_paths": sorted(selected),
        "selected_path_count": len(selected),
        "svg_path_count": path_count,
        "transformed_faces": transformed_faces,
        "transformed_loops": transformed_loops,
        "unmatched_faces": unmatched_faces,
        "geometry_changed": False,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()

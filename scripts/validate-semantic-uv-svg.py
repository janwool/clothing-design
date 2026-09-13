#!/usr/bin/env python3
"""Validate one rebuilt GLB/SVG pair inside Blender."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


ROOT = Path(__file__).resolve().parent.parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


UV_HELPER = load_module("validate_uv_helper", ROOT / "scripts" / "repack-glb-uv-and-export-svg.py")
AUDIT = load_module("validate_uv_audit", ROOT / "scripts" / "audit-garment-model.py")


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def source_trees(path: Path) -> dict[str, tuple[KDTree, int]]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    result = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        tree = KDTree(len(obj.data.vertices))
        for index, vertex in enumerate(obj.data.vertices):
            tree.insert(obj.matrix_world @ vertex.co, index)
        tree.balance()
        result[obj.name] = (tree, len(obj.data.vertices))
    return result


def svg_report(path: Path, expected_paths: int) -> dict[str, object]:
    root = ET.parse(path).getroot()
    view_box = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", root.get("viewBox", ""))]
    nodes = [node for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "path"]
    numbers = [
        value
        for node in nodes
        for value in map(float, re.findall(r"-?\d+(?:\.\d+)?", node.get("d", "")))
    ]
    width = view_box[2] if len(view_box) == 4 else 0.0
    height = view_box[3] if len(view_box) == 4 else 0.0
    x_values, y_values = numbers[0::2], numbers[1::2]
    panels = [node.get("data-panel") for node in nodes]
    return {
        "xml_valid": True,
        "view_box": view_box,
        "paths": len(nodes),
        "expected_paths": expected_paths,
        "coordinate_bounds": [
            min(x_values, default=0.0), min(y_values, default=0.0),
            max(x_values, default=0.0), max(y_values, default=0.0),
        ],
        "coordinates_in_bounds": bool(x_values) and min(x_values) >= -0.02 and max(x_values) <= width + 0.02 and min(y_values) >= -0.02 and max(y_values) <= height + 0.02,
        "semantic_panels_valid": all(panel in ("front", "back", "side", "detail") for panel in panels),
        "path_count_matches": len(nodes) == expected_paths,
    }


def rectangle_overlap_pairs(rectangles: list[tuple[float, float, float, float]], epsilon: float = 1e-7) -> int:
    if not rectangles:
        return 0
    grid_size = min(256, max(16, math.ceil(math.sqrt(len(rectangles)) / 2.0)))
    global_min_x = min(rectangle[0] for rectangle in rectangles)
    global_min_y = min(rectangle[1] for rectangle in rectangles)
    global_max_x = max(rectangle[2] for rectangle in rectangles)
    global_max_y = max(rectangle[3] for rectangle in rectangles)
    cell_width = max((global_max_x - global_min_x) / grid_size, 1e-12)
    cell_height = max((global_max_y - global_min_y) / grid_size, 1e-12)
    cells: dict[tuple[int, int], list[int]] = {}
    count = 0
    for index, first in enumerate(rectangles):
        min_cell_x = max(0, min(grid_size - 1, math.floor((first[0] - global_min_x) / cell_width)))
        max_cell_x = max(0, min(grid_size - 1, math.floor((first[2] - global_min_x) / cell_width)))
        min_cell_y = max(0, min(grid_size - 1, math.floor((first[1] - global_min_y) / cell_height)))
        max_cell_y = max(0, min(grid_size - 1, math.floor((first[3] - global_min_y) / cell_height)))
        possible = set()
        for cell_x in range(min_cell_x, max_cell_x + 1):
            for cell_y in range(min_cell_y, max_cell_y + 1):
                possible.update(cells.get((cell_x, cell_y), ()))
        for other_index in possible:
            second = rectangles[other_index]
            overlap_x = min(first[2], second[2]) - max(first[0], second[0])
            overlap_y = min(first[3], second[3]) - max(first[1], second[1])
            if overlap_x > epsilon and overlap_y > epsilon:
                count += 1
        for cell_x in range(min_cell_x, max_cell_x + 1):
            for cell_y in range(min_cell_y, max_cell_y + 1):
                cells.setdefault((cell_x, cell_y), []).append(index)
    return count


def object_uv_report(
    obj: bpy.types.Object,
    source_tree: tuple[KDTree, int] | None,
    zero_area_epsilon: float = 1e-16,
) -> dict[str, object]:
    mesh = obj.data
    if not mesh.uv_layers:
        return {"present": False}
    layer = mesh.uv_layers.active
    values = [tuple(item.uv) for item in layer.data]
    zero_triangles = 0
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        root = layer.data[loops[0]].uv
        for index in range(1, len(loops) - 1):
            first = layer.data[loops[index]].uv - root
            second = layer.data[loops[index + 1]].uv - root
            zero_triangles += abs(first.x * second.y - first.y * second.x) * 0.5 <= zero_area_epsilon

    islands = AUDIT.collect_topology_uv_island_faces(mesh)
    rectangles = []
    negative_vertical = 0
    reliable_vertical = 0
    for faces in islands:
        loops = [loop for face in faces for loop in mesh.polygons[face].loop_indices]
        uvs = [layer.data[loop].uv for loop in loops]
        rectangles.append((min(uv.x for uv in uvs), min(uv.y for uv in uvs), max(uv.x for uv in uvs), max(uv.y for uv in uvs)))
        points = [obj.matrix_world @ mesh.vertices[mesh.loops[loop].vertex_index].co for loop in loops]
        z_spread = max(point.z for point in points) - min(point.z for point in points)
        if z_spread > 1e-5 and len(loops) >= 9:
            mean_z = sum(point.z for point in points) / len(points)
            mean_v = sum(uv.y for uv in uvs) / len(uvs)
            covariance = sum((point.z - mean_z) * (uv.y - mean_v) for point, uv in zip(points, uvs))
            reliable_vertical += 1
            negative_vertical += covariance < -1e-10

    overlap = AUDIT.uv_same_island_overlap_report(mesh, islands, max_tested_pairs=20_000_000)
    cross_overlap = AUDIT.uv_cross_island_overlap_report(mesh, islands, max_tested_pairs=20_000_000)
    maximum_geometry_error = None
    if source_tree:
        tree, _count = source_tree
        maximum_geometry_error = 0.0
        for vertex in mesh.vertices:
            _co, _index, distance = tree.find(obj.matrix_world @ vertex.co)
            maximum_geometry_error = max(maximum_geometry_error, distance)
    return {
        "present": True,
        "bounds": [min(value[0] for value in values), max(value[0] for value in values), min(value[1] for value in values), max(value[1] for value in values)],
        "out_of_bounds": sum(value[0] < -1e-7 or value[0] > 1.0000001 or value[1] < -1e-7 or value[1] > 1.0000001 for value in values),
        "zero_area_triangles": zero_triangles,
        "islands": len(islands),
        "island_bbox_overlap_pairs": rectangle_overlap_pairs(rectangles),
        "triangle_overlap_pairs": overlap["overlap_pairs"] + cross_overlap["overlap_pairs"],
        "cross_island_overlap_pairs": cross_overlap["overlap_pairs"],
        "same_island_overlap_pairs": overlap["overlap_pairs"],
        "overlap_tested_pairs": overlap["tested_pairs"],
        "overlap_samples": overlap["samples"],
        "cross_overlap_candidate_island_pairs": cross_overlap["candidate_island_pairs"],
        "cross_overlap_tested_pairs": cross_overlap["tested_pairs"],
        "cross_overlap_samples": cross_overlap["samples"],
        "overlap_scan_truncated": overlap["truncated"] or cross_overlap["truncated"],
        "reliable_vertical_islands": reliable_vertical,
        "negative_vertical_islands": negative_vertical,
        "max_candidate_to_source_distance": maximum_geometry_error,
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate_glb", type=Path)
    parser.add_argument("candidate_svg", type=Path)
    parser.add_argument("rebuild_report", type=Path)
    parser.add_argument("source_glb", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    rebuild = json.loads(args.rebuild_report.read_text())
    trees = source_trees(args.source_glb)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.candidate_glb.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    zero_area_epsilon = float(rebuild.get("zero_area_epsilon", 1e-16))
    object_reports = {
        obj.name: object_uv_report(obj, trees.get(obj.name), zero_area_epsilon)
        for obj in objects
    }
    svg = svg_report(args.candidate_svg, int(rebuild["svg_paths"]))
    failures = []
    if not svg["coordinates_in_bounds"] or not svg["semantic_panels_valid"] or not svg["path_count_matches"]:
        failures.append("svg_contract")
    for name, report in object_reports.items():
        if report.get("out_of_bounds"):
            failures.append(f"{name}:uv_bounds")
        if report.get("zero_area_triangles"):
            failures.append(f"{name}:zero_area_uv")
        if report.get("triangle_overlap_pairs") or report.get("overlap_scan_truncated"):
            failures.append(f"{name}:uv_overlap")
        distance = report.get("max_candidate_to_source_distance")
        if distance is None or distance > 2e-4:
            failures.append(f"{name}:geometry_changed")
        editable_vertical = rebuild.get("editable_vertical_islands")
        if editable_vertical is not None:
            upside_down = int(editable_vertical.get("negative", 0))
        else:
            upside_down = int(report.get("negative_vertical_islands", 0))
        if upside_down:
            failures.append(f"{name}:upside_down_island")
    payload = {
        "candidate_glb": str(args.candidate_glb.resolve()),
        "candidate_svg": str(args.candidate_svg.resolve()),
        "source_glb": str(args.source_glb.resolve()),
        "pass": not failures, "failures": failures,
        "svg": svg, "objects": object_reports,
        "geometry_deformed": any(value.endswith("geometry_changed") for value in failures),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload, indent=2), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

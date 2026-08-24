#!/usr/bin/env python3
"""Audit whether increasing U reads rightward and increasing V reads upward outside a garment."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy
from mathutils import Vector


UP = Vector((0.0, 0.0, 1.0))


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def world_bounds_center(objects: list[bpy.types.Object]) -> Vector:
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], point[axis])
                maxs[axis] = max(maxs[axis], point[axis])
    return (mins + maxs) * 0.5


def weighted_summary(rows: list[tuple[float, float]]) -> dict[str, float | int]:
    total = sum(weight for _score, weight in rows)
    if total <= 0:
        return {"samples": 0, "mean": 0.0, "positive_fraction": 0.0, "confidence": 0.0}
    mean = sum(score * weight for score, weight in rows) / total
    positive = sum(weight for score, weight in rows if score > 0) / total
    return {
        "samples": len(rows),
        "mean": round(mean, 6),
        "positive_fraction": round(positive, 6),
        "confidence": round(abs(positive - 0.5) * 2.0, 6),
    }


def multiply_affine(left: tuple[float, ...], right: tuple[float, ...]) -> tuple[float, ...]:
    la, lb, lc, ld, le, lf = left
    ra, rb, rc, rd, re, rf = right
    return (
        la * ra + lc * rb,
        lb * ra + ld * rb,
        la * rc + lc * rd,
        lb * rc + ld * rd,
        la * re + lc * rf + le,
        lb * re + ld * rf + lf,
    )


def parse_transform(value: str | None) -> tuple[float, ...]:
    if not value:
        return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    for name, raw in re.findall(r"([a-zA-Z]+)\s*\(([^)]*)\)", value):
        numbers = [float(item) for item in re.findall(r"-?\d+(?:\.\d+)?(?:e[-+]?\d+)?", raw, re.I)]
        if name == "matrix" and len(numbers) == 6:
            current = tuple(numbers)
        elif name == "rotate" and numbers:
            angle = math.radians(numbers[0])
            cosine, sine = math.cos(angle), math.sin(angle)
            cx = numbers[1] if len(numbers) >= 3 else 0.0
            cy = numbers[2] if len(numbers) >= 3 else 0.0
            current = (
                cosine,
                sine,
                -sine,
                cosine,
                cx - cosine * cx + sine * cy,
                cy - sine * cx - cosine * cy,
            )
        else:
            continue
        matrix = multiply_affine(matrix, current)
    return matrix


def apply_affine(point: tuple[float, float], matrix: tuple[float, ...]) -> tuple[float, float]:
    a, b, c, d, e, f = matrix
    return (a * point[0] + c * point[1] + e, b * point[0] + d * point[1] + f)


def load_svg_paths(path: Path) -> tuple[list[dict[str, object]], float, float]:
    root = ET.parse(path).getroot()
    view_box = [float(item) for item in re.findall(r"-?\d+(?:\.\d+)?", root.get("viewBox", "0 0 1024 1024"))]
    width, height = view_box[2], view_box[3]
    paths: list[dict[str, object]] = []

    def visit(node: ET.Element, parent_matrix: tuple[float, ...]) -> None:
        matrix = multiply_affine(parent_matrix, parse_transform(node.get("transform")))
        if node.tag.rsplit("}", 1)[-1] == "path" and node.get("d"):
            numbers = [float(item) for item in re.findall(r"-?\d+(?:\.\d+)?", node.get("d", ""))]
            points = [apply_affine((numbers[index], numbers[index + 1]), matrix) for index in range(0, len(numbers) - 1, 2)]
            if len(points) >= 3:
                xs, ys = [point[0] for point in points], [point[1] for point in points]
                area = abs(sum(
                    points[index][0] * points[(index + 1) % len(points)][1]
                    - points[(index + 1) % len(points)][0] * points[index][1]
                    for index in range(len(points))
                )) / 2.0
                paths.append({
                    "index": len(paths),
                    "points": points,
                    "bbox": (min(xs), min(ys), max(xs), max(ys)),
                    "area": area,
                })
        for child in node:
            visit(child, matrix)

    visit(root, (1.0, 0.0, 0.0, 1.0, 0.0, 0.0))
    return paths, width, height


def point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    x, y = point
    inside = False
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y):
            crossing = (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-20) + x1
            if x < crossing:
                inside = not inside
        previous = current
    return inside


def locate_svg_path(point: tuple[float, float], paths: list[dict[str, object]]) -> int | None:
    x, y = point
    for item in paths:
        min_x, min_y, max_x, max_y = item["bbox"]
        if min_x <= x <= max_x and min_y <= y <= max_y and point_in_polygon(point, item["points"]):
            return int(item["index"])
    return None


def audit(objects: list[bpy.types.Object], max_faces: int, svg_path: Path | None = None) -> dict[str, object]:
    center = world_bounds_center(objects)
    horizontal_rows: list[tuple[float, float]] = []
    vertical_rows: list[tuple[float, float]] = []
    svg_paths, svg_width, svg_height = load_svg_paths(svg_path) if svg_path else ([], 1024.0, 1024.0)
    path_scores = {
        int(item["index"]): {"u_right": [], "v_up": [], "u_up": [], "v_right": [], "physical_area": 0.0}
        for item in svg_paths
    }
    total_faces = sum(len(obj.data.polygons) for obj in objects)
    stride = max(1, math.ceil(total_faces / max_faces)) if max_faces > 0 else 1
    visited = 0
    skipped_uv = 0
    skipped_orientation = 0
    uv_min_u = math.inf
    uv_max_u = -math.inf
    uv_min_v = math.inf
    uv_max_v = -math.inf
    uv_out_of_bounds = 0

    for obj in objects:
        for layer in obj.data.uv_layers:
            for item in layer.data:
                u, v = item.uv
                uv_min_u = min(uv_min_u, u)
                uv_max_u = max(uv_max_u, u)
                uv_min_v = min(uv_min_v, v)
                uv_max_v = max(uv_max_v, v)
                if u < -1e-5 or u > 1.00001 or v < -1e-5 or v > 1.00001:
                    uv_out_of_bounds += 1

    for obj in objects:
        mesh = obj.data
        uv_layer = mesh.uv_layers.active
        if uv_layer is None:
            continue
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for polygon in mesh.polygons:
            if polygon.index % stride != 0 or len(polygon.loop_indices) < 3:
                continue
            loops = list(polygon.loop_indices[:3])
            points = [obj.matrix_world @ mesh.vertices[mesh.loops[loop].vertex_index].co for loop in loops]
            uvs = [uv_layer.data[loop].uv.copy() for loop in loops]
            edge1 = points[1] - points[0]
            edge2 = points[2] - points[0]
            cross = edge1.cross(edge2)
            double_area = cross.length
            if double_area <= 1e-12:
                continue
            normal = cross / double_area
            authored_normal = (normal_matrix @ polygon.normal).normalized()
            if normal.dot(authored_normal) < 0:
                normal.negate()
            face_center = (points[0] + points[1] + points[2]) / 3.0
            radial = face_center - center
            # Closed/thick garments contain matching inner surfaces. Keep the
            # outward-facing side so the score matches what a customer sees.
            if radial.length > 1e-10 and normal.dot(radial.normalized()) < -0.05:
                skipped_orientation += 1
                continue
            du1, dv1 = uvs[1].x - uvs[0].x, uvs[1].y - uvs[0].y
            du2, dv2 = uvs[2].x - uvs[0].x, uvs[2].y - uvs[0].y
            determinant = du1 * dv2 - dv1 * du2
            if abs(determinant) <= 1e-12:
                skipped_uv += 1
                continue
            dpdu = (edge1 * dv2 - edge2 * dv1) / determinant
            dpdv = (-edge1 * du2 + edge2 * du1) / determinant
            if dpdu.length <= 1e-10 or dpdv.length <= 1e-10:
                continue
            face_weight = double_area * 0.5
            horizontal_normal = Vector((normal.x, normal.y, 0.0))
            if horizontal_normal.length > 0.2:
                outward = horizontal_normal.normalized()
                desired_right = (-outward).cross(UP).normalized()
                horizontal_rows.append((dpdu.normalized().dot(desired_right), face_weight * horizontal_normal.length))
                vertical_rows.append((dpdv.normalized().dot(UP), face_weight * horizontal_normal.length))
                if svg_paths:
                    uv_center = sum((uv for uv in uvs), Vector((0.0, 0.0))) / len(uvs)
                    svg_point = (uv_center.x * svg_width, (1.0 - uv_center.y) * svg_height)
                    path_index = locate_svg_path(svg_point, svg_paths)
                    if path_index is not None:
                        weight = face_weight * horizontal_normal.length
                        entry = path_scores[path_index]
                        entry["u_right"].append((dpdu.normalized().dot(desired_right), weight))
                        entry["v_up"].append((dpdv.normalized().dot(UP), weight))
                        entry["u_up"].append((dpdu.normalized().dot(UP), weight))
                        entry["v_right"].append((dpdv.normalized().dot(desired_right), weight))
                        entry["physical_area"] += face_weight
            visited += 1

    horizontal = weighted_summary(horizontal_rows)
    vertical = weighted_summary(vertical_rows)
    path_results = []
    for item in svg_paths:
        score = path_scores[int(item["index"])]
        u_right = weighted_summary(score["u_right"])
        v_up = weighted_summary(score["v_up"])
        u_up = weighted_summary(score["u_up"])
        v_right = weighted_summary(score["v_right"])
        direct_strength = abs(float(u_right["mean"])) + abs(float(v_up["mean"]))
        swapped_strength = abs(float(u_up["mean"])) + abs(float(v_right["mean"]))
        reliable_u = u_right["samples"] >= 10 and u_right["confidence"] >= 0.5 and abs(float(u_right["mean"])) >= 0.2
        reliable_v = v_up["samples"] >= 10 and v_up["confidence"] >= 0.5 and abs(float(v_up["mean"])) >= 0.2
        path_results.append({
            "index": item["index"],
            "svg_area": round(float(item["area"]), 4),
            "bbox": [round(value, 3) for value in item["bbox"]],
            "physical_area": round(float(score["physical_area"]), 6),
            "u_right": u_right,
            "v_up": v_up,
            "u_up": u_up,
            "v_right": v_right,
            "axis_alignment": "direct" if direct_strength >= swapped_strength else "swapped",
            "reliable_u": reliable_u,
            "reliable_v": reliable_v,
            "recommended_flip_u": reliable_u and u_right["positive_fraction"] < 0.5,
            "recommended_flip_v": reliable_v and v_up["positive_fraction"] < 0.5,
        })
    return {
        "total_faces": total_faces,
        "sample_stride": stride,
        "visited_faces": visited,
        "skipped_degenerate_uv": skipped_uv,
        "skipped_inward_faces": skipped_orientation,
        "uv_bounds": {
            "min_u": round(uv_min_u, 8),
            "max_u": round(uv_max_u, 8),
            "min_v": round(uv_min_v, 8),
            "max_v": round(uv_max_v, 8),
        },
        "uv_out_of_bounds": uv_out_of_bounds,
        "horizontal": horizontal,
        "vertical": vertical,
        "recommended_flip_u": horizontal["samples"] > 0 and horizontal["positive_fraction"] < 0.5,
        "recommended_flip_v": vertical["samples"] > 0 and vertical["positive_fraction"] < 0.5,
        "svg": str(svg_path.resolve()) if svg_path else None,
        "svg_paths": path_results,
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--svg", type=Path)
    parser.add_argument("--max-faces", type=int, default=100000)
    args = parser.parse_args(argv)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    result = {"input": str(args.input.resolve()), **audit(objects, args.max_faces, args.svg)}
    payload = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload, flush=True)


if __name__ == "__main__":
    main()

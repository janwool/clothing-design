#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path

import bpy


EPS = 1e-10


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def polygon_area(poly: list[tuple[float, float]]) -> float:
    if len(poly) < 3:
        return 0.0
    area = 0.0
    for a, b in zip(poly, poly[1:] + poly[:1]):
        area += a[0] * b[1] - b[0] * a[1]
    return abs(area) * 0.5


def signed_area(poly: list[tuple[float, float]]) -> float:
    area = 0.0
    for a, b in zip(poly, poly[1:] + poly[:1]):
        area += a[0] * b[1] - b[0] * a[1]
    return area * 0.5


def inside(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float], ccw: bool) -> bool:
    cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    return cross >= -EPS if ccw else cross <= EPS


def line_intersection(
    p1: tuple[float, float],
    p2: tuple[float, float],
    q1: tuple[float, float],
    q2: tuple[float, float],
) -> tuple[float, float]:
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = q1
    x4, y4 = q2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < EPS:
        return p2
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return (px, py)


def clip_polygon(subject: list[tuple[float, float]], clipper: list[tuple[float, float]]) -> list[tuple[float, float]]:
    output = subject
    ccw = signed_area(clipper) >= 0
    for a, b in zip(clipper, clipper[1:] + clipper[:1]):
        if not output:
            break
        current = output
        output = []
        prev = current[-1]
        prev_inside = inside(prev, a, b, ccw)
        for point in current:
            point_inside = inside(point, a, b, ccw)
            if point_inside:
                if not prev_inside:
                    output.append(line_intersection(prev, point, a, b))
                output.append(point)
            elif prev_inside:
                output.append(line_intersection(prev, point, a, b))
            prev = point
            prev_inside = point_inside
    return output


def tri_overlap_area(a: tuple[tuple[float, float], ...], b: tuple[tuple[float, float], ...]) -> float:
    return polygon_area(clip_polygon(list(a), list(b)))


def uv_triangles() -> list[tuple[tuple[float, float], tuple[float, float], tuple[float, float]]]:
    triangles = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.uv_layers:
            continue
        uv_layer = obj.data.uv_layers.active
        for poly in obj.data.polygons:
            loops = list(poly.loop_indices)
            if len(loops) < 3:
                continue
            root = loops[0]
            for index in range(1, len(loops) - 1):
                loop_ids = (root, loops[index], loops[index + 1])
                tri = tuple((uv_layer.data[loop_id].uv.x, uv_layer.data[loop_id].uv.y) for loop_id in loop_ids)
                if polygon_area(list(tri)) > EPS:
                    triangles.append(tri)  # type: ignore[arg-type]
    return triangles


def detect_overlap(path: Path, grid_size: int, max_pairs: int, overlap_area_threshold: float) -> dict[str, object]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    tris = uv_triangles()
    cells: dict[tuple[int, int], list[int]] = {}
    seen: set[tuple[int, int]] = set()
    tested = 0
    sample = None

    for index, tri in enumerate(tris):
        xs = [p[0] for p in tri]
        ys = [p[1] for p in tri]
        min_x = max(0, min(grid_size - 1, math.floor(min(xs) * grid_size)))
        max_x = max(0, min(grid_size - 1, math.floor(max(xs) * grid_size)))
        min_y = max(0, min(grid_size - 1, math.floor(min(ys) * grid_size)))
        max_y = max(0, min(grid_size - 1, math.floor(max(ys) * grid_size)))
        for cell_x in range(min_x, max_x + 1):
            for cell_y in range(min_y, max_y + 1):
                bucket = cells.setdefault((cell_x, cell_y), [])
                for other_index in bucket:
                    pair = (other_index, index)
                    if pair in seen:
                        continue
                    seen.add(pair)
                    tested += 1
                    area = tri_overlap_area(tris[other_index], tri)
                    if area >= overlap_area_threshold:
                        sample = {"tri_a": other_index, "tri_b": index, "overlap_area": area}
                        return {
                            "path": str(path),
                            "triangles": len(tris),
                            "tested_pairs": tested,
                            "overlap": True,
                            "sample": sample,
                        }
                    if max_pairs and tested >= max_pairs:
                        return {
                            "path": str(path),
                            "triangles": len(tris),
                            "tested_pairs": tested,
                            "overlap": False,
                            "limited": True,
                            "sample": None,
                        }
                bucket.append(index)
    return {
        "path": str(path),
        "triangles": len(tris),
        "tested_pairs": tested,
        "overlap": False,
        "limited": False,
        "sample": None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--grid-size", type=int, default=128)
    parser.add_argument("--max-pairs", type=int, default=0)
    parser.add_argument("--overlap-area-threshold", type=float, default=1e-6)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    rows = list(csv.DictReader(args.manifest.open()))
    results = []
    for row in rows:
        path = Path(row["input_path"])
        if not path.exists():
            result = {"slug": row["slug"], "path": str(path), "missing": True, "overlap": None}
        else:
            try:
                result = detect_overlap(path, args.grid_size, args.max_pairs, args.overlap_area_threshold)
                result["slug"] = row["slug"]
            except Exception as exc:
                result = {"slug": row["slug"], "path": str(path), "error": str(exc), "overlap": None}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

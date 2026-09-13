#!/usr/bin/env python3
"""Compare imported GLBs by quantized world-space vertex and triangle fingerprints."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
import numpy as np


def fingerprint(path: Path, tolerance: float) -> dict[str, object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    scale = 1.0 / tolerance
    vertices = set()
    triangle_digest = hashlib.sha256()
    triangle_count = 0
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    for obj in sorted((item for item in bpy.context.scene.objects if item.type == "MESH"), key=lambda item: item.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        world = obj.matrix_world
        quantized = []
        for vertex in mesh.vertices:
            point = world @ vertex.co
            value = tuple(round(component * scale) for component in point)
            quantized.append(value)
            vertices.add(value)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], float(point[axis]))
                maximum[axis] = max(maximum[axis], float(point[axis]))
        for triangle in mesh.loop_triangles:
            points = sorted(quantized[index] for index in triangle.vertices)
            triangle_digest.update(struct.pack("<9q", *(component for point in points for component in point)))
            triangle_count += 1
    vertex_digest = hashlib.sha256()
    for point in sorted(vertices):
        vertex_digest.update(struct.pack("<3q", *point))
    return {
        "path": str(path.resolve()),
        "tolerance": tolerance,
        "unique_positions": len(vertices),
        "triangles": triangle_count,
        "bounds": [minimum, maximum],
        "unique_position_sha256": vertex_digest.hexdigest(),
        "ordered_triangle_sha256": triangle_digest.hexdigest(),
    }


def ordered_triangle_positions(path: Path) -> np.ndarray:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    rows = []
    for obj in sorted((item for item in bpy.context.scene.objects if item.type == "MESH"), key=lambda item: item.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        world = obj.matrix_world
        coordinates = np.asarray([tuple(world @ vertex.co) for vertex in mesh.vertices], dtype=np.float32)
        rows.append(np.asarray([[coordinates[index] for index in triangle.vertices] for triangle in mesh.loop_triangles]))
    return np.concatenate(rows, axis=0)


def face_order_error(first_path: Path, second_path: Path) -> dict[str, object]:
    first = ordered_triangle_positions(first_path)
    second = ordered_triangle_positions(second_path)
    if first.shape != second.shape:
        return {"same_shape": False, "first_shape": first.shape, "second_shape": second.shape}
    permutations = ((0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0))
    maximum = 0.0
    over_1e4 = 0
    over_1e3 = 0
    for start in range(0, len(first), 100_000):
        left = first[start : start + 100_000]
        right = second[start : start + 100_000]
        best = np.full(len(left), np.inf, dtype=np.float32)
        for permutation in permutations:
            distance = np.linalg.norm(left - right[:, permutation, :], axis=2).max(axis=1)
            best = np.minimum(best, distance)
        maximum = max(maximum, float(best.max(initial=0.0)))
        over_1e4 += int(np.count_nonzero(best > 1e-4))
        over_1e3 += int(np.count_nonzero(best > 1e-3))
    return {
        "same_shape": True,
        "triangles": len(first),
        "max_best_corner_distance": maximum,
        "faces_over_1e-4": over_1e4,
        "faces_over_1e-3": over_1e3,
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("first", type=Path)
    parser.add_argument("second", type=Path)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    first = fingerprint(args.first, args.tolerance)
    second = fingerprint(args.second, args.tolerance)
    result = {
        "first": first,
        "second": second,
        "same_unique_positions": (
            first["unique_positions"] == second["unique_positions"]
            and first["unique_position_sha256"] == second["unique_position_sha256"]
        ),
        "same_ordered_triangles": (
            first["triangles"] == second["triangles"]
            and first["ordered_triangle_sha256"] == second["ordered_triangle_sha256"]
        ),
        "face_order_error": face_order_error(args.first, args.second),
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload)
    if not result["same_unique_positions"] and result["face_order_error"].get("faces_over_1e-3"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()

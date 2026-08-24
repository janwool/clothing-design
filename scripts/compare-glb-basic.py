#!/usr/bin/env python3
"""Compare lightweight geometry and UV invariants for two GLB files."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def quantized_position_digest(objects: list[bpy.types.Object], precision: int = 5) -> tuple[int, str]:
    positions = {
        tuple(round(value, precision) for value in (obj.matrix_world @ vertex.co))
        for obj in objects
        for vertex in obj.data.vertices
    }
    payload = "\n".join(",".join(f"{value:.{precision}f}" for value in point) for point in sorted(positions))
    return len(positions), hashlib.sha256(payload.encode("ascii")).hexdigest()


def inspect(path: Path) -> dict[str, object]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    mins = Vector((float("inf"),) * 3)
    maxs = Vector((float("-inf"),) * 3)
    uv_points = []
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], point[axis])
                maxs[axis] = max(maxs[axis], point[axis])
        for layer in obj.data.uv_layers:
            uv_points.extend(tuple(item.uv) for item in layer.data)
    unique_positions, digest = quantized_position_digest(objects)
    return {
        "path": str(path.resolve()),
        "objects": len(objects),
        "vertices": sum(len(obj.data.vertices) for obj in objects),
        "polygons": sum(len(obj.data.polygons) for obj in objects),
        "loops": sum(len(obj.data.loops) for obj in objects),
        "unique_positions_1e5": unique_positions,
        "position_digest_1e5": digest,
        # Blender's glTF round-trip can move decoded coordinates below one
        # micrometre. Compare bounds at the same 1e-5 precision as positions.
        "bounds_min": [round(value, 5) for value in mins],
        "bounds_max": [round(value, 5) for value in maxs],
        "uv_bounds": {
            "min_u": min(point[0] for point in uv_points),
            "max_u": max(point[0] for point in uv_points),
            "min_v": min(point[1] for point in uv_points),
            "max_v": max(point[1] for point in uv_points),
        },
        "uv_out_of_bounds": sum(
            point[0] < -1e-5 or point[0] > 1.00001 or point[1] < -1e-5 or point[1] > 1.00001
            for point in uv_points
        ),
        "materials": sum(len(obj.data.materials) for obj in objects),
        "animations": len(bpy.data.actions),
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    before = inspect(args.before)
    after = inspect(args.after)
    bounds_match = all(
        abs(left - right) <= 2e-5
        for key in ("bounds_min", "bounds_max")
        for left, right in zip(before[key], after[key])
    )
    result = {
        "before": before,
        "after": after,
        "geometry_matches_at_1e5": (
            before["polygons"] == after["polygons"]
            and before["unique_positions_1e5"] == after["unique_positions_1e5"]
            and before["position_digest_1e5"] == after["position_digest_1e5"]
            and bounds_match
        ),
    }
    payload = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload, flush=True)


if __name__ == "__main__":
    main()

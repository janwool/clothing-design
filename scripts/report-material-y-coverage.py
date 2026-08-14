#!/usr/bin/env python3
"""Report local-Y coverage intervals for each material on a GLB."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--merge-gap", type=float, default=0.01)
    parser.add_argument("--max-abs-x", type=float)
    parser.add_argument("--min-z", type=float)
    args = parser.parse_args(argv)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    rows = []
    for obj in (item for item in bpy.context.scene.objects if item.type == "MESH"):
        for material_index, material in enumerate(obj.data.materials):
            intervals = []
            faces = 0
            for polygon in obj.data.polygons:
                if polygon.material_index != material_index:
                    continue
                coordinates = [obj.data.vertices[index].co for index in polygon.vertices]
                center_x = sum(co.x for co in coordinates) / len(coordinates)
                center_z = sum(co.z for co in coordinates) / len(coordinates)
                if args.max_abs_x is not None and abs(center_x) > args.max_abs_x:
                    continue
                if args.min_z is not None and center_z < args.min_z:
                    continue
                ys = [co.y for co in coordinates]
                intervals.append((min(ys), max(ys)))
                faces += 1
            intervals.sort()
            merged = []
            for start, end in intervals:
                if not merged or start > merged[-1][1] + args.merge_gap:
                    merged.append([start, end])
                else:
                    merged[-1][1] = max(merged[-1][1], end)
            rows.append({
                "object": obj.name,
                "material_index": material_index,
                "material": material.name if material else None,
                "faces": faces,
                "y_intervals": [[round(a, 6), round(b, 6)] for a, b in merged],
            })
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Report mesh cross-section extents for model-specific reconstruction work."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--y", type=float, action="append", required=True)
    parser.add_argument("--tolerance", type=float, default=0.03)
    parser.add_argument("--max-abs-x", type=float)
    parser.add_argument("--output", type=Path)
    return parser.parse_args(argv)


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    lower = int(position)
    upper = min(len(ordered) - 1, lower + 1)
    blend = position - lower
    return ordered[lower] * (1.0 - blend) + ordered[upper] * blend


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    rows = []
    for target_y in args.y:
        coordinates = [
            tuple(vertex.co)
            for obj in objects
            for vertex in obj.data.vertices
            if abs(vertex.co.y - target_y) <= args.tolerance
            and (args.max_abs_x is None or abs(vertex.co.x) <= args.max_abs_x)
        ]
        xs = [co[0] for co in coordinates]
        zs = [co[2] for co in coordinates]
        rows.append({
            "y": target_y,
            "tolerance": args.tolerance,
            "vertices": len(coordinates),
            "x": {
                "min": min(xs) if xs else None,
                "p02": percentile(xs, 0.02) if xs else None,
                "p50": percentile(xs, 0.50) if xs else None,
                "p98": percentile(xs, 0.98) if xs else None,
                "max": max(xs) if xs else None,
            },
            "z": {
                "min": min(zs) if zs else None,
                "p02": percentile(zs, 0.02) if zs else None,
                "p50": percentile(zs, 0.50) if zs else None,
                "p98": percentile(zs, 0.98) if zs else None,
                "max": max(zs) if zs else None,
            },
        })
    report = json.dumps(rows, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report + "\n")
    print(report)


if __name__ == "__main__":
    main()

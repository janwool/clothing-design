#!/usr/bin/env python3
"""Measure removed source-component centers against the retained garment surface."""

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("component_report")
    parser.add_argument("output")
    parser.add_argument("--max-faces", type=int, default=20)
    return parser.parse_args(argv)


def percentile(values, q):
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * q)))
    return ordered[index]


def main():
    args = parse_args()
    report = json.loads(Path(args.component_report).read_text(encoding="utf-8"))
    source_components = report["objects"][0]["components"]
    removed = [component for component in source_components if component["faces"] <= args.max_faces]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)

    rows = []
    for component in removed:
        center = Vector(component["center"])
        nearest, normal, face_index, distance = bvh.find_nearest(center)
        bbox = component["bbox"]
        diagonal = Vector((bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2])).length
        rows.append(
            {
                "component": component["index"],
                "faces": component["faces"],
                "center": [round(value, 6) for value in center],
                "bbox_diagonal": round(diagonal, 8),
                "nearest": [round(value, 6) for value in nearest],
                "face": face_index,
                "distance": round(distance, 8),
                "distance_over_diagonal": round(distance / diagonal, 6) if diagonal else None,
            }
        )

    distances = [row["distance"] for row in rows]
    ratios = [row["distance_over_diagonal"] for row in rows if row["distance_over_diagonal"] is not None]
    output = {
        "input": args.input,
        "component_report": args.component_report,
        "removed_components": len(rows),
        "distance_percentiles": {str(q): round(percentile(distances, q), 8) for q in (0, 0.1, 0.5, 0.9, 1)},
        "distance_over_diagonal_percentiles": {str(q): round(percentile(ratios, q), 6) for q in (0, 0.1, 0.5, 0.9, 1)},
        "components": sorted(rows, key=lambda row: row["distance"]),
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({key: output[key] for key in ("removed_components", "distance_percentiles", "distance_over_diagonal_percentiles")}, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

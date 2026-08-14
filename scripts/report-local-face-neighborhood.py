#!/usr/bin/env python3
"""Report face-normal continuity in a mesh-local neighborhood."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--center-local", required=True)
    parser.add_argument("--radius", type=float, default=0.12)
    parser.add_argument("--limit", type=int, default=80)
    return parser.parse_args(argv)


def rounded(vector):
    return [round(value, 9) for value in vector]


def main():
    args = parse_args()
    center = Vector(tuple(float(value) for value in args.center_local.split(",")))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    rows = []
    for face in bm.faces:
        face_center = face.calc_center_median()
        distance = (face_center - center).length
        if distance > args.radius:
            continue
        edge_neighbors = {
            neighbor
            for edge in face.edges
            for neighbor in edge.link_faces
            if neighbor is not face
        }
        dots = [face.normal.dot(neighbor.normal) for neighbor in edge_neighbors]
        rows.append(
            {
                "face": face.index,
                "distance": round(distance, 10),
                "center": rounded(face_center),
                "area": round(face.calc_area(), 12),
                "normal": rounded(face.normal),
                "vertices": [rounded(vertex.co) for vertex in face.verts],
                "neighbor_faces": sorted(neighbor.index for neighbor in edge_neighbors),
                "neighbor_normal_dots": [round(value, 9) for value in sorted(dots)],
                "min_neighbor_normal_dot": round(min(dots), 9) if dots else None,
                "mean_neighbor_normal_dot": round(sum(dots) / len(dots), 9) if dots else None,
            }
        )
    rows.sort(key=lambda row: (row["min_neighbor_normal_dot"] if row["min_neighbor_normal_dot"] is not None else 2, row["distance"]))
    output = {
        "input": str(args.input),
        "center_local": list(center),
        "radius": args.radius,
        "matching_faces": len(rows),
        "faces": rows[: args.limit],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

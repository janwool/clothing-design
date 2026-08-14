#!/usr/bin/env python3
"""Report a face and its topological neighborhood from a GLB."""

import argparse
import json
import math
import sys
from collections import deque
from pathlib import Path

import bpy
import bmesh


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("face", type=int)
    parser.add_argument("output")
    parser.add_argument("--rings", type=int, default=2)
    return parser.parse_args(argv)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    seed = bm.faces[args.face]
    distance = {seed.index: 0}
    queue = deque([seed])
    while queue:
        face = queue.popleft()
        if distance[face.index] >= args.rings:
            continue
        for edge in face.edges:
            for neighbor in edge.link_faces:
                if neighbor.index not in distance:
                    distance[neighbor.index] = distance[face.index] + 1
                    queue.append(neighbor)

    rows = []
    for face_index, ring in sorted(distance.items(), key=lambda item: (item[1], item[0])):
        face = bm.faces[face_index]
        dihedral = []
        for edge in face.edges:
            if len(edge.link_faces) == 2:
                other = edge.link_faces[0] if edge.link_faces[1] == face else edge.link_faces[1]
                dot = max(-1.0, min(1.0, face.normal.dot(other.normal)))
                dihedral.append(math.degrees(math.acos(dot)))
        rows.append(
            {
                "face": face.index,
                "ring": ring,
                "area": round(face.calc_area(), 10),
                "center": [round(value, 7) for value in face.calc_center_median()],
                "normal": [round(value, 7) for value in face.normal],
                "vertices": [
                    {"index": vert.index, "co": [round(value, 7) for value in vert.co]}
                    for vert in face.verts
                ],
                "edge_face_counts": [len(edge.link_faces) for edge in face.edges],
                "dihedral_degrees": [round(value, 5) for value in dihedral],
            }
        )
    output = {"input": args.input, "seed_face": args.face, "rings": args.rings, "faces": rows}
    Path(args.output).write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

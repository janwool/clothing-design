#!/usr/bin/env python3
"""Report nearest main-shell vertices for every diagnosed ID101 repair solid."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils.kdtree import KDTree


PAIRING = {
    0: 1, 2: 3, 5: 8, 6: 8, 7: 8, 10: 12, 11: 12, 13: 12,
    19: 20, 21: 23, 22: 23, 24: 26, 25: 26, 27: 28, 29: 32,
    30: 32, 31: 32, 34: 37, 35: 37, 36: 37, 38: 40, 39: 40,
    41: 43, 42: 43, 45: 46, 47: 48, 50: 52, 51: 52,
}


def components(mesh):
    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        for edge in polygon.edge_keys:
            edge_faces[edge].append(polygon.index)
    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    unseen = {polygon.index for polygon in mesh.polygons}
    result = []
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        queue = deque([seed])
        faces = []
        while queue:
            face = queue.popleft()
            faces.append(face)
            for other in sorted(neighbors[face]):
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        result.append(faces)
    return result


def vertices(mesh, faces):
    return sorted({vertex for face in faces for vertex in mesh.polygons[face].vertices})


def rounded(vector):
    return [round(float(value), 9) for value in vector]


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    groups = components(mesh)
    rows = []
    for small, main in PAIRING.items():
        small_vertices = vertices(mesh, groups[small])
        main_vertices = vertices(mesh, groups[main])
        tree = KDTree(len(main_vertices))
        for local_index, vertex in enumerate(main_vertices):
            tree.insert(mesh.vertices[vertex].co, local_index)
        tree.balance()
        pairs = []
        for vertex in small_vertices:
            coordinate, local_index, distance = tree.find(mesh.vertices[vertex].co)
            pairs.append(
                {
                    "small_vertex": vertex,
                    "small_coordinate": rounded(mesh.vertices[vertex].co),
                    "main_vertex": main_vertices[local_index],
                    "main_coordinate": rounded(coordinate),
                    "distance": round(float(distance), 9),
                }
            )
        distances = [row["distance"] for row in pairs]
        paired_main_vertices = {row["main_vertex"] for row in pairs}
        tunnel_faces = sorted(
            face for face in groups[main]
            if set(mesh.polygons[face].vertices).issubset(paired_main_vertices)
        )
        rows.append(
            {
                "small_component": small,
                "main_component": main,
                "small_vertices": len(small_vertices),
                "unique_main_vertices": len({row["main_vertex"] for row in pairs}),
                "distance": {
                    "minimum": min(distances),
                    "mean": round(sum(distances) / len(distances), 9),
                    "maximum": max(distances),
                },
                "candidate_tunnel_faces": tunnel_faces,
                "pairs": pairs,
            }
        )
    report = {"input": str(args.input), "pairing": PAIRING, "components": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "components": [
            {key: row[key] for key in (
                "small_component", "main_component", "small_vertices",
                "unique_main_vertices", "distance",
                "candidate_tunnel_faces",
            )}
            for row in rows
        ]
    }, indent=2))


if __name__ == "__main__":
    main()

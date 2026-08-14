#!/usr/bin/env python3
"""Inspect one explicitly selected tubular garment component before reconstruction."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
import bmesh


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * q
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[low]
    amount = position - low
    return ordered[low] * (1.0 - amount) + ordered[high] * amount


def connected_faces(bm: bmesh.types.BMesh) -> list[set[bmesh.types.BMFace]]:
    unseen = set(bm.faces)
    groups = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        faces = {seed}
        while stack:
            face = stack.pop()
            for edge in face.edges:
                for neighbor in edge.link_faces:
                    if neighbor in unseen:
                        unseen.remove(neighbor)
                        faces.add(neighbor)
                        stack.append(neighbor)
        groups.append(faces)
    groups.sort(key=lambda faces: min(face.index for face in faces))
    return groups


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--component", type=int, required=True)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    groups = connected_faces(bm)
    faces = groups[args.component]
    vertices = {vertex for face in faces for vertex in face.verts}
    edges = {edge for face in faces for edge in face.edges}
    lengths = [edge.calc_length() for edge in edges]
    uv_layer = bm.loops.layers.uv.active
    rows = []
    for vertex in sorted(vertices, key=lambda item: item.index):
        vertex_edges = [edge for edge in vertex.link_edges if edge in edges]
        uvs = []
        if uv_layer is not None:
            uvs = sorted({
                (round(loop[uv_layer].uv.x, 8), round(loop[uv_layer].uv.y, 8))
                for face in vertex.link_faces if face in faces
                for loop in face.loops if loop.vert is vertex
            })
        rows.append({
            "vertex": vertex.index,
            "co": [round(value, 8) for value in vertex.co],
            "degree": len(vertex_edges),
            "edge_lengths": sorted(round(edge.calc_length(), 8) for edge in vertex_edges),
            "neighbors": sorted(edge.other_vert(vertex).index for edge in vertex_edges),
            "uvs": uvs,
        })
    report = {
        "input": str(args.input),
        "component": args.component,
        "vertices": len(vertices),
        "edges": len(edges),
        "faces": len(faces),
        "euler": len(vertices) - len(edges) + len(faces),
        "boundary_edges": sum(1 for edge in edges if len([face for face in edge.link_faces if face in faces]) == 1),
        "vertex_degree_counts": dict(sorted(Counter(row["degree"] for row in rows).items())),
        "edge_length_percentiles": {
            str(q): round(percentile(lengths, q), 9)
            for q in (0, .01, .05, .1, .25, .5, .75, .9, .95, .99, 1)
        },
        "vertex_rows": rows[:args.limit],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "vertex_rows"}, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

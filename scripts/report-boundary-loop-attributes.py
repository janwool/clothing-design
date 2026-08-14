#!/usr/bin/env python3
"""Inspect loop UVs and normals around the boundary nearest a local target."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--target-local", required=True)
    return parser.parse_args(argv)


def boundary_groups(edges):
    vertex_edges = defaultdict(set)
    for edge in edges:
        for vertex in edge.verts:
            vertex_edges[vertex].add(edge)
    groups = []
    pending = set(edges)
    while pending:
        seed = pending.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for neighbor in vertex_edges[vertex]:
                    if neighbor in pending:
                        pending.remove(neighbor)
                        group.append(neighbor)
                        queue.append(neighbor)
        groups.append(group)
    return groups


def center(group):
    vertices = {vertex for edge in group for vertex in edge.verts}
    return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)


def main():
    args = parse_args()
    target = Vector(tuple(float(value) for value in args.target_local.split(",")))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.active
    groups = boundary_groups([edge for edge in bm.edges if edge.is_boundary])
    group = min(groups, key=lambda item: (center(item) - target).length)

    rows = []
    for edge in sorted(group, key=lambda item: item.index):
        face = edge.link_faces[0]
        edge_rows = []
        for vertex in edge.verts:
            face_loop = next(loop for loop in face.loops if loop.vert is vertex)
            all_loops = [loop for linked_face in vertex.link_faces for loop in linked_face.loops if loop.vert is vertex]
            edge_rows.append(
                {
                    "vertex": vertex.index,
                    "coordinate": [round(value, 9) for value in vertex.co],
                    "boundary_face_uv": [round(value, 9) for value in face_loop[uv_layer].uv] if uv_layer else None,
                    "boundary_face_loop_normal": [round(value, 9) for value in face_loop.calc_normal()],
                    "linked_loop_uvs": sorted(
                        {
                            tuple(round(value, 9) for value in loop[uv_layer].uv)
                            for loop in all_loops
                        }
                    ) if uv_layer else [],
                    "linked_loop_normals": sorted(
                        {
                            tuple(round(value, 9) for value in loop.calc_normal())
                            for loop in all_loops
                        }
                    ),
                }
            )
        rows.append(
            {
                "edge": edge.index,
                "adjacent_face": face.index,
                "face_normal": [round(value, 9) for value in face.normal],
                "vertices": edge_rows,
            }
        )

    output = {
        "input": str(args.input),
        "target_local": list(target),
        "group_center": [round(value, 9) for value in center(group)],
        "distance": round((center(group) - target).length, 12),
        "edges": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

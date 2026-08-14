#!/usr/bin/env python3
"""Print an ordered boundary loop from a GLB for model-specific diagnosis."""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def center(edges):
    vertices = {vertex for edge in edges for vertex in edge.verts}
    return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)


def boundary_groups(bm):
    remaining = {edge for edge in bm.edges if edge.is_boundary}
    groups = []
    while remaining:
        seed = remaining.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for linked in vertex.link_edges:
                    if linked in remaining:
                        remaining.remove(linked)
                        queue.append(linked)
                        group.append(linked)
        groups.append(group)
    groups.sort(key=lambda group: tuple(round(value, 9) for value in center(group)))
    return groups


def order_cycle(edges):
    edge_set = set(edges)
    vertices = {vertex for edge in edges for vertex in edge.verts}
    neighbors = {
        vertex: sorted(
            {
                other
                for edge in vertex.link_edges
                if edge in edge_set
                for other in edge.verts
                if other is not vertex
            },
            key=lambda item: item.index,
        )
        for vertex in vertices
    }
    if any(len(items) != 2 for items in neighbors.values()):
        raise RuntimeError("Selected boundary group is not a simple closed cycle")
    start = min(vertices, key=lambda vertex: vertex.index)
    ordered = [start]
    previous = None
    current = start
    while True:
        candidates = [vertex for vertex in neighbors[current] if vertex is not previous]
        following = candidates[0]
        if following is start:
            break
        if following in ordered:
            raise RuntimeError("Boundary walk repeated before closing")
        ordered.append(following)
        previous, current = current, following
    if len(ordered) != len(vertices):
        raise RuntimeError(f"Walk visited {len(ordered)} of {len(vertices)} vertices")
    return ordered


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("group", type=int)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    bm = bmesh.new()
    bm.from_mesh(objects[0].data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    groups = boundary_groups(bm)
    group = groups[args.group]
    ordered = order_cycle(group)
    rows = []
    for index, vertex in enumerate(ordered):
        following = ordered[(index + 1) % len(ordered)]
        rows.append(
            {
                "order": index,
                "vertex": vertex.index,
                "coordinate": [round(float(value), 8) for value in vertex.co],
                "edge_to_next": round(float((following.co - vertex.co).length), 8),
            }
        )
    print(
        json.dumps(
            {
                "input": str(args.input),
                "group": args.group,
                "edges": len(group),
                "center": [round(float(value), 8) for value in center(group)],
                "vertices": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )
    bm.free()


if __name__ == "__main__":
    main()

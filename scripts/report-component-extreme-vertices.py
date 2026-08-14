#!/usr/bin/env python3
"""Report coordinate extrema and nearby vertices for one diagnosed mesh component."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh


def connected_components(bm: bmesh.types.BMesh) -> list[set[bmesh.types.BMVert]]:
    unseen = set(bm.verts)
    groups = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        vertices = {seed}
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    vertices.add(neighbor)
                    stack.append(neighbor)
        groups.append(vertices)
    groups.sort(key=lambda vertices: min(vertex.index for vertex in vertices))
    return groups


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--component", type=int, required=True)
    parser.add_argument("--axis", choices=("x", "y", "z"), required=True)
    parser.add_argument("--side", choices=("min", "max"), required=True)
    parser.add_argument("--distance", type=float, default=0.12)
    parser.add_argument("--limit", type=int, default=500)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    groups = connected_components(bm)
    vertices = groups[args.component]
    axis_index = {"x": 0, "y": 1, "z": 2}[args.axis]
    values = [vertex.co[axis_index] for vertex in vertices]
    extreme = min(values) if args.side == "min" else max(values)
    if args.side == "min":
        selected = [vertex for vertex in vertices if vertex.co[axis_index] <= extreme + args.distance]
        selected.sort(key=lambda vertex: (vertex.co[axis_index], vertex.index))
    else:
        selected = [vertex for vertex in vertices if vertex.co[axis_index] >= extreme - args.distance]
        selected.sort(key=lambda vertex: (-vertex.co[axis_index], vertex.index))

    report = {
        "input": str(args.input),
        "object_matrix_world": [
            [round(value, 9) for value in row]
            for row in obj.matrix_world
        ],
        "component": args.component,
        "component_vertices": len(vertices),
        "bounds": {
            axis: [
                round(min(vertex.co[index] for vertex in vertices), 9),
                round(max(vertex.co[index] for vertex in vertices), 9),
            ]
            for index, axis in enumerate(("x", "y", "z"))
        },
        "axis": args.axis,
        "side": args.side,
        "extreme": round(extreme, 9),
        "distance": args.distance,
        "matching_vertices": len(selected),
        "vertices": [
            {
                "index": vertex.index,
                "co": [round(value, 9) for value in vertex.co],
                "edges": len(vertex.link_edges),
                "faces": len(vertex.link_faces),
            }
            for vertex in selected[: args.limit]
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

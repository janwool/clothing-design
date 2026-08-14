#!/usr/bin/env python3
"""Report true non-manifold edges after welding coincident GLB positions."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--distance", type=float, default=1e-5)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=args.distance)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    rows = []
    for edge in bm.edges:
        if len(edge.link_faces) <= 2:
            continue
        center = (edge.verts[0].co + edge.verts[1].co) * 0.5
        rows.append(
            {
                "edge": edge.index,
                "vertices": [edge.verts[0].index, edge.verts[1].index],
                "coordinates": [
                    [round(float(value), 9) for value in vertex.co]
                    for vertex in edge.verts
                ],
                "center": [round(float(value), 9) for value in center],
                "length": round(float(edge.calc_length()), 9),
                "linked_faces": [
                    {
                        "face": face.index,
                        "center": [
                            round(float(value), 9)
                            for value in face.calc_center_median()
                        ],
                        "normal": [round(float(value), 9) for value in face.normal],
                        "area": round(float(face.calc_area()), 12),
                    }
                    for face in sorted(edge.link_faces, key=lambda face: face.index)
                ],
            }
        )

    report = {
        "input": str(args.input),
        "distance": args.distance,
        "vertices_before": before,
        "vertices_after": len(bm.verts),
        "vertices_welded": before - len(bm.verts),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "true_nonmanifold_edges": len(rows),
        "edges": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    bm.free()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Diagnose catalog model ID 105 without treating garment openings as holes.

The thin trench-coat source contains fourteen substantial pattern pieces and
four tiny shoulder continuations.  This analysis previews the exact two-face
seam weld, then classifies every remaining boundary loop by size and position.
It distinguishes the open front/neck/hem outline and two sleeve cuffs from the
single narrow internal quad tear on the lower right panel.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id105_analysis_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def face_bounds(faces):
    vertices = {vertex for face in faces for vertex in face.verts}
    return [
        round(float(value), 6)
        for value in (
            *(min(vertex.co[axis] for vertex in vertices) for axis in range(3)),
            *(max(vertex.co[axis] for vertex in vertices) for axis in range(3)),
        )
    ]


def boundary_loops(bm):
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    adjacency = defaultdict(list)
    for edge in boundary:
        for vertex in edge.verts:
            adjacency[vertex].append(edge)
    rows = []
    seen = set()
    for seed in boundary:
        if seed in seen:
            continue
        seen.add(seed)
        queue = deque([seed])
        edges = []
        vertices = set()
        while queue:
            edge = queue.popleft()
            edges.append(edge)
            vertices.update(edge.verts)
            for vertex in edge.verts:
                for neighbor in adjacency[vertex]:
                    if neighbor not in seen:
                        seen.add(neighbor)
                        queue.append(neighbor)
        rows.append(
            {
                "edges": len(edges),
                "perimeter": round(sum(edge.calc_length() for edge in edges), 6),
                "bbox": [
                    round(min(vertex.co[axis] for vertex in vertices), 6)
                    for axis in range(3)
                ]
                + [
                    round(max(vertex.co[axis] for vertex in vertices), 6)
                    for axis in range(3)
                ],
                "center": [
                    round(
                        sum(vertex.co[axis] for vertex in vertices) / len(vertices),
                        6,
                    )
                    for axis in range(3)
                ],
            }
        )
    return sorted(rows, key=lambda row: (-row["perimeter"], row["center"]))


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")

    bm = bmesh.new()
    bm.from_mesh(objects[0].data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    source = helpers.topology(bm)
    raw_components = helpers.components(bm)
    component_rows = [
        {
            "index": index,
            "faces": len(faces),
            "bbox": face_bounds(faces),
            "classification": "pattern_owner" if len(faces) >= 100 else "shoulder_continuation",
        }
        for index, faces in enumerate(raw_components)
    ]

    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        uv_owner_min_faces=100,
    )
    sewn = helpers.topology(bm)
    loops = boundary_loops(bm)
    internal_tears = [
        row for row in loops if row["edges"] == 4 and row["perimeter"] < 0.5
    ]
    intended_openings = [row for row in loops if row not in internal_tears]

    report = {
        "input": str(args.input),
        "tolerance": args.tolerance,
        "source": source,
        "raw_components": component_rows,
        "pattern_owners": sum(row["classification"] == "pattern_owner" for row in component_rows),
        "shoulder_continuations": [
            row["index"]
            for row in component_rows
            if row["classification"] == "shoulder_continuation"
        ],
        "weld_preview": weld,
        "sewn_preview": sewn,
        "boundary_loops_after_sewing": loops,
        "intended_openings": intended_openings,
        "internal_tears": internal_tears,
        "diagnosis": (
            "Sew all exact two-face continuation seams, preserve the large open "
            "front/neck/hem outline and two sleeve cuffs, and fill only the unique "
            "four-edge narrow internal tear centered near (2.10482, -5.071697, -0.271652)."
        ),
    }
    bm.free()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

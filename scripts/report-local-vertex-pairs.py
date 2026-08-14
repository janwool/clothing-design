#!/usr/bin/env python3
"""Report close vertex pairs in one explicit component and local bounding box.

This is a diagnostic-only tool. It never mutates or exports the source mesh.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh


def parse_vec(value: str) -> tuple[float, float, float]:
    result = tuple(float(item) for item in value.split(","))
    if len(result) != 3:
        raise ValueError("Expected x,y,z")
    return result


def connected_components(bm: bmesh.types.BMesh) -> list[set[bmesh.types.BMFace]]:
    bm.faces.ensure_lookup_table()
    unseen = set(bm.faces)
    components = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        faces = {seed}
        while stack:
            face = stack.pop()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unseen:
                        unseen.remove(linked)
                        faces.add(linked)
                        stack.append(linked)
        components.append(faces)
    components.sort(key=lambda faces: min(face.index for face in faces))
    return components


def rounded_vec(vector) -> list[float]:
    return [round(float(value), 9) for value in vector]


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--component", type=int, required=True)
    parser.add_argument("--minimum", required=True)
    parser.add_argument("--maximum", required=True)
    parser.add_argument("--maximum-distance", type=float, default=0.1)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args(argv)

    minimum = parse_vec(args.minimum)
    maximum = parse_vec(args.maximum)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    components = connected_components(bm)
    if not 0 <= args.component < len(components):
        raise ValueError(f"Component {args.component} outside 0..{len(components) - 1}")

    faces = components[args.component]
    component_verts = {vertex for face in faces for vertex in face.verts}
    candidates = sorted(
        (
            vertex
            for vertex in component_verts
            if all(minimum[axis] <= vertex.co[axis] <= maximum[axis] for axis in range(3))
        ),
        key=lambda vertex: vertex.index,
    )

    pairs = []
    for offset, first in enumerate(candidates):
        first_edges = set(first.link_edges)
        first_faces = set(first.link_faces)
        for second in candidates[offset + 1 :]:
            distance = float((first.co - second.co).length)
            if distance > args.maximum_distance:
                continue
            shared_edges = first_edges.intersection(second.link_edges)
            shared_faces = first_faces.intersection(second.link_faces)
            pairs.append(
                {
                    "distance": round(distance, 12),
                    "first": first.index,
                    "second": second.index,
                    "first_coordinate": rounded_vec(first.co),
                    "second_coordinate": rounded_vec(second.co),
                    "edge_adjacent": bool(shared_edges),
                    "face_adjacent": bool(shared_faces),
                    "first_valence": len(first.link_edges),
                    "second_valence": len(second.link_edges),
                    "first_boundary": any(edge.is_boundary for edge in first.link_edges),
                    "second_boundary": any(edge.is_boundary for edge in second.link_edges),
                    "first_normal": rounded_vec(first.normal),
                    "second_normal": rounded_vec(second.normal),
                }
            )
    pairs.sort(key=lambda row: (row["distance"], row["first"], row["second"]))

    nonadjacent = [row for row in pairs if not row["edge_adjacent"]]
    exact_nonadjacent = [row for row in nonadjacent if row["distance"] <= 1e-5]
    report = {
        "input": str(args.input),
        "component": args.component,
        "component_faces": len(faces),
        "component_vertices": len(component_verts),
        "bbox": [*minimum, *maximum],
        "candidate_vertices": len(candidates),
        "candidate_details": [
            {
                "vertex": vertex.index,
                "coordinate": rounded_vec(vertex.co),
                "normal": rounded_vec(vertex.normal),
                "neighbors": [
                    {
                        "vertex": edge.other_vert(vertex).index,
                        "coordinate": rounded_vec(edge.other_vert(vertex).co),
                        "distance": round(float(edge.calc_length()), 12),
                    }
                    for edge in sorted(vertex.link_edges, key=lambda item: item.index)
                ],
                "faces": sorted(face.index for face in vertex.link_faces),
            }
            for vertex in candidates
        ],
        "maximum_distance": args.maximum_distance,
        "pairs_within_distance": len(pairs),
        "nonadjacent_pairs_within_distance": len(nonadjacent),
        "exact_nonadjacent_pairs": len(exact_nonadjacent),
        "closest_nonadjacent_pairs": nonadjacent[: args.limit],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

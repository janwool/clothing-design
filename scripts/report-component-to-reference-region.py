#!/usr/bin/env python3
"""Measure one component region against a specific reference component."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils.bvhtree import BVHTree


def parse_vec(value: str) -> tuple[float, float, float]:
    result = tuple(float(item) for item in value.split(","))
    if len(result) != 3:
        raise ValueError("Expected x,y,z")
    return result


def components(bm: bmesh.types.BMesh) -> list[set[bmesh.types.BMFace]]:
    unseen = set(bm.faces)
    result = []
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
        result.append(faces)
    result.sort(key=lambda faces: min(face.index for face in faces))
    return result


def describe(values: list[float]) -> dict[str, float | int | None]:
    ordered = sorted(values)
    if not ordered:
        return {"count": 0, "min": None, "median": None, "max": None}
    return {
        "count": len(ordered),
        "min": round(ordered[0], 9),
        "median": round(statistics.median(ordered), 9),
        "max": round(ordered[-1], 9),
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--component", type=int, required=True)
    parser.add_argument("--reference-component", type=int, required=True)
    parser.add_argument("--minimum", required=True)
    parser.add_argument("--maximum", required=True)
    args = parser.parse_args(argv)
    minimum = parse_vec(args.minimum)
    maximum = parse_vec(args.maximum)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    groups = components(bm)
    source_faces = groups[args.component]
    reference_faces = groups[args.reference_component]
    reference_bvh = BVHTree.FromBMesh(bm)

    # FromBMesh contains every component, so build a component-only local index mesh.
    reference_vertices = sorted(
        {vertex for face in reference_faces for vertex in face.verts}, key=lambda vertex: vertex.index
    )
    reference_lookup = {vertex: index for index, vertex in enumerate(reference_vertices)}
    reference_polygons = [
        [reference_lookup[vertex] for vertex in face.verts]
        for face in sorted(reference_faces, key=lambda face: face.index)
    ]
    reference_bvh = BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in reference_vertices], reference_polygons, all_triangles=True
    )

    candidates = sorted(
        {
            vertex
            for face in source_faces
            for vertex in face.verts
            if all(minimum[axis] <= vertex.co[axis] <= maximum[axis] for axis in range(3))
        },
        key=lambda vertex: vertex.index,
    )
    rows = []
    for vertex in candidates:
        nearest, normal, polygon_index, distance = reference_bvh.find_nearest(vertex.co)
        signed = float((vertex.co - nearest).dot(normal))
        normal_dot = float(vertex.normal.dot(normal))
        rows.append(
            {
                "vertex": vertex.index,
                "coordinate": [round(float(value), 9) for value in vertex.co],
                "nearest": [round(float(value), 9) for value in nearest],
                "reference_normal": [round(float(value), 9) for value in normal],
                "distance": round(float(distance), 9),
                "signed_distance": round(signed, 9),
                "normal_dot": round(normal_dot, 9),
                "reference_polygon": polygon_index,
            }
        )

    same_direction = [row for row in rows if row["normal_dot"] >= 0]
    opposite_direction = [row for row in rows if row["normal_dot"] < 0]
    report = {
        "input": str(args.input),
        "component": args.component,
        "reference_component": args.reference_component,
        "bbox": [*minimum, *maximum],
        "candidate_vertices": len(candidates),
        "all_distance": describe([row["distance"] for row in rows]),
        "all_signed_distance": describe([row["signed_distance"] for row in rows]),
        "same_normal_direction": {
            "count": len(same_direction),
            "distance": describe([row["distance"] for row in same_direction]),
            "signed_distance": describe([row["signed_distance"] for row in same_direction]),
        },
        "opposite_normal_direction": {
            "count": len(opposite_direction),
            "distance": describe([row["distance"] for row in opposite_direction]),
            "signed_distance": describe([row["signed_distance"] for row in opposite_direction]),
        },
        "vertices": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "vertices"}, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

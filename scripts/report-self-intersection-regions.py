#!/usr/bin/env python3
"""Locate non-adjacent triangle intersections inside each mesh component."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--bin-size", type=float, default=0.25)
    return parser.parse_args(argv)


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    components: list[list[int]] = []
    visited: set[int] = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        component: list[int] = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def rounded(vector: Vector) -> list[float]:
    return [round(value, 6) for value in vector]


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    components = face_components(mesh)
    face_component = {
        face: component_index
        for component_index, faces in enumerate(components)
        for face in faces
    }

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm, epsilon=1e-7)

    rows: dict[int, list[dict[str, object]]] = defaultdict(list)
    for face_a, face_b in tree.overlap(tree):
        if face_a >= face_b:
            continue
        a = bm.faces[face_a]
        b = bm.faces[face_b]
        if {vert.index for vert in a.verts} & {vert.index for vert in b.verts}:
            continue
        component_a = face_component.get(face_a)
        component_b = face_component.get(face_b)
        if component_a != component_b:
            continue
        center = (a.calc_center_median() + b.calc_center_median()) * 0.5
        rows[component_a].append(
            {"faces": [face_a, face_b], "center": rounded(center)}
        )

    report = []
    for component, intersections in sorted(rows.items()):
        centers = [Vector(row["center"]) for row in intersections]
        bins = Counter(
            tuple(math.floor(value / args.bin_size) for value in center)
            for center in centers
        )
        report.append(
            {
                "component": component,
                "component_faces": len(components[component]),
                "intersection_pairs": len(intersections),
                "bbox": rounded(Vector(tuple(min(center[axis] for center in centers) for axis in range(3))))
                + rounded(Vector(tuple(max(center[axis] for center in centers) for axis in range(3)))),
                "mean_center": rounded(sum(centers, Vector()) / len(centers)),
                "densest_bins": [
                    {
                        "cell": list(cell),
                        "center": [round((value + 0.5) * args.bin_size, 6) for value in cell],
                        "count": count,
                    }
                    for cell, count in bins.most_common(12)
                ],
                "intersections": intersections,
            }
        )

    output = {
        "input": str(args.input),
        "bin_size": args.bin_size,
        "same_component_pairs": sum(row["intersection_pairs"] for row in report),
        "components": report,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({
        "same_component_pairs": output["same_component_pairs"],
        "components": [
            {key: row[key] for key in ("component", "component_faces", "intersection_pairs", "bbox", "densest_bins")}
            for row in report
        ],
    }, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

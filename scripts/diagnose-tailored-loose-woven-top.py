#!/usr/bin/env python3
"""Model-specific component/contact diagnosis for catalog model ID 101.

The source contains many individually closed pieces, including a set of tiny
triangular/box-like solids.  Indexed topology alone therefore cannot tell a
real button or facing from a plug seated on a recessed repair tunnel.  This
report keeps the authored connected-component IDs and groups edges by exact
position so every tiny component can be matched to the garment shell(s) it
touches before any geometry is changed.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


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
    unseen = {polygon.index for polygon in mesh.polygons}
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        queue = deque([seed])
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in sorted(neighbors[face]):
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        components.append(component)
    return components


def component_bvh(mesh: bpy.types.Mesh, faces: list[int]) -> BVHTree:
    vertices = sorted(
        {vertex for face in faces for vertex in mesh.polygons[face].vertices}
    )
    lookup = {vertex: index for index, vertex in enumerate(vertices)}
    polygons = [
        [lookup[vertex] for vertex in mesh.polygons[face].vertices]
        for face in faces
    ]
    return BVHTree.FromPolygons(
        [mesh.vertices[vertex].co.copy() for vertex in vertices],
        polygons,
        all_triangles=True,
    )


def rounded(vector: Vector) -> list[float]:
    return [round(float(value), 9) for value in vector]


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--small-faces", type=int, default=24)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    mesh.calc_normals_split()
    components = face_components(mesh)
    face_component = {
        face: component_index
        for component_index, faces in enumerate(components)
        for face in faces
    }

    scale = 1.0 / args.tolerance
    position_keys = [
        tuple(round(float(value) * scale) for value in vertex.co)
        for vertex in mesh.vertices
    ]
    position_components: dict[tuple[int, int, int], set[int]] = defaultdict(set)
    edge_faces: dict[
        tuple[tuple[int, int, int], tuple[int, int, int]], list[int]
    ] = defaultdict(list)
    for polygon in mesh.polygons:
        vertices = list(polygon.vertices)
        component = face_component[polygon.index]
        for vertex in vertices:
            position_components[position_keys[vertex]].add(component)
        for index, start in enumerate(vertices):
            a = position_keys[start]
            b = position_keys[vertices[(index + 1) % len(vertices)]]
            if a != b:
                edge_faces[tuple(sorted((a, b)))].append(polygon.index)

    component_vertices = [
        sorted({vertex for face in faces for vertex in mesh.polygons[face].vertices})
        for faces in components
    ]
    component_rows = []
    substantial = [
        index for index, faces in enumerate(components) if len(faces) > args.small_faces
    ]
    substantial_bvhs = {
        index: component_bvh(mesh, components[index]) for index in substantial
    }
    small_indices = [
        index for index, faces in enumerate(components) if len(faces) <= args.small_faces
    ]
    small_faces = [face for index in small_indices for face in components[index]]
    small_bvh = component_bvh(mesh, small_faces)
    low_alignment_rows = []
    for component_index in substantial:
        for face in components[component_index]:
            polygon = mesh.polygons[face]
            minimum_dot = min(
                float(polygon.normal.dot(mesh.loops[loop].normal))
                for loop in polygon.loop_indices
            )
            if minimum_dot >= 0.5:
                continue
            center = polygon.center.copy()
            nearest = small_bvh.find_nearest(center)
            low_alignment_rows.append(
                {
                    "component": component_index,
                    "face": face,
                    "center": rounded(center),
                    "minimum_loop_dot": round(minimum_dot, 9),
                    "distance_to_repair_solids": round(float(nearest[3]), 9),
                }
            )
    for component_index, faces in enumerate(components):
        vertices = component_vertices[component_index]
        coordinates = [mesh.vertices[vertex].co for vertex in vertices]
        center = sum(coordinates, Vector()) / len(coordinates)
        shared_positions = sorted(
            {
                key
                for vertex in vertices
                if len(position_components[key := position_keys[vertex]]) > 1
            }
        )
        shared_edges = []
        for (a, b), linked_faces in edge_faces.items():
            linked_components = sorted({face_component[face] for face in linked_faces})
            if component_index not in linked_components or len(linked_components) < 2:
                continue
            shared_edges.append(
                {
                    "coordinates": [
                        [round(value / scale, 9) for value in a],
                        [round(value / scale, 9) for value in b],
                    ],
                    "components": linked_components,
                    "face_count": len(linked_faces),
                    "faces_by_component": {
                        str(other): sum(
                            face_component[face] == other for face in linked_faces
                        )
                        for other in linked_components
                    },
                }
            )

        loop_normal_dots = [
            float(mesh.polygons[face].normal.dot(mesh.loops[loop].normal))
            for face in faces
            for loop in mesh.polygons[face].loop_indices
        ]

        nearest_rows = []
        if len(faces) <= args.small_faces:
            for other, bvh in substantial_bvhs.items():
                distances = [
                    float(bvh.find_nearest(coordinate)[3]) for coordinate in coordinates
                ]
                nearest_rows.append(
                    {
                        "component": other,
                        "minimum": round(min(distances), 9),
                        "mean": round(sum(distances) / len(distances), 9),
                        "maximum": round(max(distances), 9),
                    }
                )
            nearest_rows.sort(key=lambda row: (row["mean"], row["component"]))

        component_rows.append(
            {
                "component": component_index,
                "faces": len(faces),
                "vertices": len(vertices),
                "surface_area": round(
                    sum(mesh.polygons[face].area for face in faces), 9
                ),
                "center": rounded(center),
                "bbox": [
                    *[round(min(co[axis] for co in coordinates), 9) for axis in range(3)],
                    *[round(max(co[axis] for co in coordinates), 9) for axis in range(3)],
                ],
                "shared_position_count": len(shared_positions),
                "shared_position_components": sorted(
                    {
                        other
                        for key in shared_positions
                        for other in position_components[key]
                        if other != component_index
                    }
                ),
                "shared_edges": shared_edges,
                "split_normal_alignment": {
                    "loops": len(loop_normal_dots),
                    "negative": sum(value < 0.0 for value in loop_normal_dots),
                    "below_half": sum(value < 0.5 for value in loop_normal_dots),
                    "minimum": round(min(loop_normal_dots), 9),
                    "mean": round(
                        sum(loop_normal_dots) / len(loop_normal_dots), 9
                    ),
                    "maximum": round(max(loop_normal_dots), 9),
                },
                "nearest_substantial": nearest_rows[:5],
            }
        )

    cross_component_edges = [
        {
            "coordinates": [
                [round(value / scale, 9) for value in a],
                [round(value / scale, 9) for value in b],
            ],
            "components": sorted({face_component[face] for face in faces}),
            "face_count": len(faces),
        }
        for (a, b), faces in edge_faces.items()
        if len({face_component[face] for face in faces}) > 1
    ]
    report = {
        "input": str(args.input),
        "tolerance": args.tolerance,
        "component_count": len(components),
        "small_face_threshold": args.small_faces,
        "small_components": sum(
            len(faces) <= args.small_faces for faces in components
        ),
        "cross_component_exact_edges": len(cross_component_edges),
        "cross_component_edges": cross_component_edges,
        "substantial_low_alignment_near_repair_solids": {
            "faces": len(low_alignment_rows),
            "distance_threshold_counts": {
                str(threshold): sum(
                    row["distance_to_repair_solids"] <= threshold
                    for row in low_alignment_rows
                )
                for threshold in (0.002, 0.005, 0.01, 0.02, 0.03, 0.05)
            },
            "rows": low_alignment_rows,
        },
        "components": component_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "component_count": report["component_count"],
                "small_components": report["small_components"],
                "cross_component_exact_edges": report[
                    "cross_component_exact_edges"
                ],
                "small_component_summary": [
                    {
                        key: row[key]
                        for key in (
                            "component",
                            "faces",
                            "center",
                            "shared_position_count",
                            "shared_position_components",
                            "split_normal_alignment",
                        )
                    }
                    for row in component_rows
                    if row["faces"] <= args.small_faces
                ],
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

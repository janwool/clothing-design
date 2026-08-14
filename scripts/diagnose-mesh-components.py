#!/usr/bin/env python3
"""Report detailed geometry and retained-surface proximity for selected mesh components."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--indices", required=True)
    return parser.parse_args(argv)


def connected_components(bm):
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
        verts = {vert for face in faces for vert in face.verts}
        components.append((faces, verts))
    components.sort(key=lambda item: min(face.index for face in item[0]))
    return components


def rounded_vec(vector):
    return [round(value, 8) for value in vector]


def main():
    args = parse_args()
    wanted = {int(value) for value in args.indices.split(",") if value.strip()}

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    components = connected_components(bm)

    retained_faces = [
        [vertex.index for vertex in face.verts]
        for component_index, (faces, _) in enumerate(components)
        if component_index not in wanted
        for face in faces
    ]
    retained_bvh = BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in bm.verts], retained_faces, all_triangles=True
    )

    rows = []
    for component_index in sorted(wanted):
        faces, verts = components[component_index]
        ordered_verts = sorted(verts, key=lambda vertex: vertex.index)
        vertex_lookup = {vertex: index for index, vertex in enumerate(ordered_verts)}
        coords = [vertex.co.copy() for vertex in ordered_verts]
        center = sum(coords, Vector()) / len(coords)
        distances = []
        nearest_points = []
        for coord in coords:
            nearest, _, _, distance = retained_bvh.find_nearest(coord)
            distances.append(float(distance))
            nearest_points.append(rounded_vec(nearest))

        signed_volume = 0.0
        for face in faces:
            a, b, c = (vertex.co for vertex in face.verts[:3])
            signed_volume += a.dot(b.cross(c)) / 6.0

        rows.append(
            {
                "component": component_index,
                "vertices": len(verts),
                "faces": len(faces),
                "center": rounded_vec(center),
                "surface_area": round(sum(face.calc_area() for face in faces), 10),
                "signed_volume": round(signed_volume, 12),
                "absolute_volume": round(abs(signed_volume), 12),
                "distance_to_retained": {
                    "min": round(min(distances), 10),
                    "median": round(statistics.median(distances), 10),
                    "max": round(max(distances), 10),
                },
                "vertex_coordinates": [rounded_vec(coord) for coord in coords],
                "nearest_retained_points": nearest_points,
                "coincident_retained_vertices": [
                    [
                        {
                            "vertex": other.index,
                            "coordinate": rounded_vec(other.co),
                            "loops": [
                                {
                                    "face": linked_face.index,
                                    "face_normal": rounded_vec(linked_face.normal),
                                    "uv": rounded_vec(loop[bm.loops.layers.uv.active].uv)
                                    if bm.loops.layers.uv.active is not None else None,
                                    "normal": rounded_vec(loop.calc_normal()),
                                }
                                for linked_face in other.link_faces
                                for loop in linked_face.loops
                                if loop.vert is other
                            ],
                        }
                        for other in bm.verts
                        if other not in verts and (other.co - vertex.co).length <= 1e-5
                    ]
                    for vertex in ordered_verts
                ],
                "local_faces": [
                    [vertex_lookup[vertex] for vertex in face.verts]
                    for face in sorted(faces, key=lambda face: face.index)
                ],
                "face_normals": [
                    rounded_vec(face.normal)
                    for face in sorted(faces, key=lambda face: face.index)
                ],
                "loop_attributes": [
                    [
                        {
                            "vertex": vertex_lookup[loop.vert],
                            "uv": rounded_vec(loop[bm.loops.layers.uv.active].uv)
                            if bm.loops.layers.uv.active is not None else None,
                            "normal": rounded_vec(loop.calc_normal()),
                        }
                        for loop in face.loops
                    ]
                    for face in sorted(faces, key=lambda face: face.index)
                ],
            }
        )

    output = {
        "input": str(args.input),
        "component_count": len(components),
        "selected": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))
    bm.free()


if __name__ == "__main__":
    main()

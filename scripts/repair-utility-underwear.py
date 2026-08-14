#!/usr/bin/env python3
"""Attach four diagnosed covers and remove one detached shoulder prism in underwear model 05."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


COVER_COMPONENTS = {0, 1, 4, 5}
PRISM_COMPONENT = 6
PRISM_COORDINATES = [
    Vector((0.80320966, 1.45065176, -0.02497530)),
    Vector((0.76597631, 1.41854632, 0.02942562)),
    Vector((0.75103843, 1.49970162, -0.03969026)),
    Vector((0.77578628, 1.43348420, 0.04503238)),
    Vector((0.81301963, 1.46558964, -0.00936842)),
    Vector((0.76084840, 1.51486254, -0.02408350)),
]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tolerance", type=float, default=0.0001)
    parser.add_argument("--position-quantization", type=int, default=22)
    return parser.parse_args(argv)


def components(bm):
    bm.faces.ensure_lookup_table()
    unseen = set(bm.faces)
    result = []
    while unseen:
        seed = min(unseen, key=lambda face: face.index)
        unseen.remove(seed)
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
        result.append((faces, {vert for face in faces for vert in face.verts}))
    result.sort(key=lambda item: min(face.index for face in item[0]))
    return result


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    source_components = components(bm)
    if len(source_components) != 17:
        raise RuntimeError(f"Expected 17 source components, found {len(source_components)}")
    if any(len(source_components[index][0]) != 1 for index in COVER_COMPONENTS):
        raise RuntimeError("The four diagnosed cover components are no longer one-face patches")
    if len(source_components[PRISM_COMPONENT][0]) != 8:
        raise RuntimeError("The diagnosed prism component is no longer eight faces")

    cover_faces = [next(iter(source_components[index][0])) for index in sorted(COVER_COMPONENTS)]
    cover_vertices = {vert for index in COVER_COMPONENTS for vert in source_components[index][1]}
    prism_faces, prism_vertices = source_components[PRISM_COMPONENT]
    unmatched_prism_coordinates = [
        coordinate
        for coordinate in PRISM_COORDINATES
        if not any((vert.co - coordinate).length <= args.tolerance for vert in prism_vertices)
    ]
    if unmatched_prism_coordinates:
        raise RuntimeError("The diagnosed prism coordinates no longer match component 6")

    def matches_prism(vertex):
        return any((vertex.co - coordinate).length <= args.tolerance for coordinate in PRISM_COORDINATES)

    imprint_faces = [
        face
        for face in bm.faces
        if face not in prism_faces and face not in cover_faces and all(matches_prism(vert) for vert in face.verts)
    ]
    if len(imprint_faces) != 4:
        raise RuntimeError(
            f"Expected four intact strap faces beneath the prism, found {len(imprint_faces)}"
        )
    underlay_vertices = {vert for face in imprint_faces for vert in face.verts}
    if len(underlay_vertices) != 6:
        raise RuntimeError(
            f"Expected six strap vertices beneath the prism, found {len(underlay_vertices)}"
        )
    underlay_lookup = []
    for coordinate in PRISM_COORDINATES:
        matches = [
            vertex
            for vertex in underlay_vertices
            if (vertex.co - coordinate).length <= args.tolerance
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected one retained strap vertex at {list(coordinate)}, found {len(matches)}"
            )
        underlay_lookup.append(matches[0])

    retained_vertices = [
        vert for vert in bm.verts if vert not in cover_vertices and vert not in prism_vertices
    ]
    weld_map = {}
    for cover_vertex in cover_vertices:
        matches = [
            retained
            for retained in retained_vertices
            if (retained.co - cover_vertex.co).length <= args.tolerance
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected one retained target for cover vertex {cover_vertex.index}, found {len(matches)}"
            )
        weld_map[cover_vertex] = matches[0]

    removed_face_indices = sorted(face.index for face in prism_faces)
    bmesh.ops.delete(bm, geom=list(prism_faces), context="FACES")
    bmesh.ops.weld_verts(bm, targetmap=weld_map)
    old_tip_positions = [underlay_lookup[index].co.copy() for index in (0, 4)]
    underlay_lookup[0].co = (underlay_lookup[1].co + underlay_lookup[2].co) * 0.5
    underlay_lookup[4].co = (underlay_lookup[3].co + underlay_lookup[5].co) * 0.5
    new_tip_positions = [underlay_lookup[index].co.copy() for index in (0, 4)]
    bm.normal_update()

    for cover_face in cover_faces:
        if not cover_face.is_valid:
            raise RuntimeError("A cover face disappeared during the local weld")
        neighbors = {
            linked
            for edge in cover_face.edges
            for linked in edge.link_faces
            if linked is not cover_face
        }
        reference = sum((face.normal for face in neighbors), Vector())
        if reference.length_squared and cover_face.normal.dot(reference) < 0:
            cover_face.normal_flip()
        cover_face.smooth = True
    bm.normal_update()

    report = {
        "source_components": len(source_components),
        "cover_components_welded": sorted(COVER_COMPONENTS),
        "cover_vertices_welded": len(weld_map),
        "prism_component_removed": PRISM_COMPONENT,
        "prism_faces_removed": len(prism_faces),
        "intact_underlay_faces_preserved": len(imprint_faces),
        "underlay_vertices_preserved": len(underlay_vertices) - 2,
        "wedge_tip_vertices_aligned": 2,
        "tip_offsets": [
            round((new - old).length, 9)
            for old, new in zip(old_tip_positions, new_tip_positions)
        ],
        "tip_positions_before": [[round(value, 9) for value in point] for point in old_tip_positions],
        "tip_positions_after": [[round(value, 9) for value in point] for point in new_tip_positions],
        "removed_face_indices": removed_face_indices,
        "boundary_edges_after": sum(1 for edge in bm.edges if edge.is_boundary),
        "nonmanifold_edges_after": sum(
            1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary
        ),
        "zero_area_faces_after": sum(1 for face in bm.faces if face.calc_area() <= 1e-12),
        "faces_after": len(bm.faces),
    }

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

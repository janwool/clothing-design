#!/usr/bin/env python3
"""Rebuild the mislabeled modern-skirt asset from its original thin jumpsuit.

The source contains 22 authored garment pieces plus 141 disconnected surface
fragments.  Many fragments are exact continuation patches split away by the
exporter.  Solidifying them independently created the visible pin-like pits in
the previous asset.  This model-specific repair welds only fragments whose
complete boundary maps one-to-one onto a single authored garment piece,
preserves unmatched construction pieces, removes zero-area triangles, and
solidifies the repaired pieces together in one Blender session.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


EXPECTED_GARMENT_COMPONENTS = 22
EXPECTED_FRAGMENT_COMPONENTS = 141
# Four authored pocket-bag layers sit directly behind the shorts surface.  A
# full outer-fabric solidify makes their pointed tips poke through as black
# pinholes; retain them at the same micro thickness as other internal joins.
MICRO_GARMENT_SOURCE_COMPONENTS = {0, 1, 2, 3}
# One sharp fold on the front-left shorts panel is valid in the thin source,
# but a full 18 mm Solidify makes its two sides intersect and leaves a black
# needle slit.  Limit thickness only inside this diagnosed fold neighborhood.
LOCAL_MICRO_REGIONS = [
    (Vector((-1.4657, -0.3695, 0.5888)), 0.12),
]


def connected_components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    pending = set(bm.faces)
    result = []
    while pending:
        seed = min(pending, key=lambda face: face.index)
        pending.remove(seed)
        queue = deque([seed])
        faces = [seed]
        while queue:
            face = queue.popleft()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in pending:
                        pending.remove(linked)
                        queue.append(linked)
                        faces.append(linked)
        result.append(faces)
    result.sort(key=lambda faces: min(face.index for face in faces))
    return result


def component_boundary(component: list[bmesh.types.BMFace]) -> list[bmesh.types.BMVert]:
    faces = set(component)
    edges = {
        edge
        for face in component
        for edge in face.edges
        if sum(linked in faces for linked in edge.link_faces) == 1
    }
    return sorted({vertex for edge in edges for vertex in edge.verts}, key=lambda vertex: vertex.index)


def component_bbox(component: list[bmesh.types.BMFace]) -> list[float]:
    vertices = {vertex for face in component for vertex in face.verts}
    return [
        *[round(float(min(vertex.co[axis] for vertex in vertices)), 6) for axis in range(3)],
        *[round(float(max(vertex.co[axis] for vertex in vertices)), 6) for axis in range(3)],
    ]


def build_tree(vertices: list[bmesh.types.BMVert]) -> tuple[KDTree, list[bmesh.types.BMVert]]:
    ordered = sorted(vertices, key=lambda vertex: vertex.index)
    tree = KDTree(len(ordered))
    for index, vertex in enumerate(ordered):
        tree.insert(vertex.co, index)
    tree.balance()
    return tree, ordered


def topology(bm: bmesh.types.BMesh) -> dict[str, int]:
    return {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "true_nonmanifold_edges": sum(
            not edge.is_boundary and not edge.is_manifold for edge in bm.edges
        ),
        "components": len(connected_components(bm)),
    }


def apply_thickness(
    obj: bpy.types.Object,
    thickness: float,
    full_thickness_vertices: list[int],
    micro_thickness_vertices: list[int],
    micro_thickness: float,
) -> None:
    if thickness <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    group = obj.vertex_groups.new(name="Repaired garment surfaces")
    if micro_thickness_vertices:
        group.add(
            micro_thickness_vertices,
            max(0.0, min(1.0, micro_thickness / thickness)),
            "REPLACE",
        )
    group.add(full_thickness_vertices, 1.0, "REPLACE")
    modifier = obj.modifiers.new("Rebuilt jumpsuit fabric thickness", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 0.0
    modifier.use_even_offset = False
    modifier.use_quality_normals = False
    modifier.use_rim_only = False
    modifier.material_offset = 0
    modifier.material_offset_rim = 0
    modifier.vertex_group = group.name
    # Unassigned vertices get zero thickness.  This is intentional only for
    # the tiny diagnosed self-intersecting fold; internal construction pieces
    # receive the explicit micro-thickness weight above.
    modifier.thickness_vertex_group = 0.0
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    remaining = obj.vertex_groups.get(group.name)
    if remaining is not None:
        obj.vertex_groups.remove(remaining)


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--max-fragment-faces", type=int, default=99)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.0)
    parser.add_argument("--micro-thickness", type=float, default=0.001)
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    components = connected_components(bm)
    fragments = [component for component in components if len(component) <= args.max_fragment_faces]
    garments = [component for component in components if len(component) > args.max_fragment_faces]
    if len(garments) != EXPECTED_GARMENT_COMPONENTS or len(fragments) != EXPECTED_FRAGMENT_COMPONENTS:
        raise RuntimeError(
            f"Unexpected source structure: {len(garments)} garment pieces and "
            f"{len(fragments)} fragments"
        )

    garment_faces = {face for component in garments for face in component}
    micro_garment_faces = {
        face
        for source_index in MICRO_GARMENT_SOURCE_COMPONENTS
        for face in components[source_index]
    }
    garment_component_by_face = {
        face: index for index, component in enumerate(garments) for face in component
    }
    garment_boundary_vertices = sorted(
        {
            vertex
            for edge in bm.edges
            if edge.is_boundary and any(face in garment_faces for face in edge.link_faces)
            for vertex in edge.verts
        },
        key=lambda vertex: vertex.index,
    )
    tree, candidates = build_tree(garment_boundary_vertices)

    target_map: dict[bmesh.types.BMVert, bmesh.types.BMVert] = {}
    zero_area_faces = []
    rows = []
    accepted_components = []
    rejected_components = []
    rejected_faces: set[bmesh.types.BMFace] = set()
    for fragment in fragments:
        source_index = components.index(fragment)
        area = sum(face.calc_area() for face in fragment)
        if area <= 1e-12:
            zero_area_faces.extend(fragment)
            rows.append(
                {
                    "source_component": source_index,
                    "faces": len(fragment),
                    "surface_area": round(float(area), 12),
                    "bbox": component_bbox(fragment),
                    "accepted": False,
                    "action": "remove zero-area fragment",
                }
            )
            continue

        boundary = component_boundary(fragment)
        fragment_map = {}
        distances = []
        target_indices = []
        target_components = Counter()
        for vertex in boundary:
            _coordinate, candidate_index, distance = tree.find(vertex.co)
            target = candidates[candidate_index]
            fragment_map[vertex] = target
            distances.append(float(distance))
            target_indices.append(target.index)
            target_components.update(
                garment_component_by_face[face]
                for face in target.link_faces
                if face in garment_faces
            )

        safe = (
            bool(boundary)
            and max(distances) <= args.tolerance
            and len(set(target_indices)) == len(target_indices)
            and len(target_components) == 1
        )
        if safe:
            target_map.update(fragment_map)
            accepted_components.append(source_index)
            action = "weld exact fragment boundary into one authored garment piece"
        else:
            rejected_components.append(source_index)
            rejected_faces.update(fragment)
            action = "preserve unmatched authored construction piece"
        rows.append(
            {
                "source_component": source_index,
                "faces": len(fragment),
                "surface_area": round(float(area), 12),
                "boundary_vertices": len(boundary),
                "bbox": component_bbox(fragment),
                "min_distance": round(min(distances), 10),
                "median_distance": round(sorted(distances)[len(distances) // 2], 10),
                "max_distance": round(max(distances), 10),
                "unique_target_vertices": len(set(target_indices)),
                "target_garment_components": dict(sorted(target_components.items())),
                "accepted": safe,
                "action": action,
            }
        )

    before = topology(bm)
    if not args.inspect_only:
        if zero_area_faces:
            bmesh.ops.delete(bm, geom=zero_area_faces, context="FACES")
        if target_map:
            bmesh.ops.weld_verts(bm, targetmap=target_map)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.normal_update()
    bm.verts.index_update()
    local_zero_vertices = {
        vertex.index
        for vertex in bm.verts
        if any(
            (vertex.co - center).length <= radius
            for center, radius in LOCAL_MICRO_REGIONS
        )
    }
    micro_thickness_vertices = {
        vertex.index
        for face in bm.faces
        if face in rejected_faces or face in micro_garment_faces
        for vertex in face.verts
    } - local_zero_vertices
    full_thickness_vertices = {
        vertex.index for vertex in bm.verts
    } - micro_thickness_vertices - local_zero_vertices
    after_patch_weld = topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    if not args.inspect_only:
        apply_thickness(
            obj,
            args.thickness,
            sorted(full_thickness_vertices),
            sorted(micro_thickness_vertices),
            args.micro_thickness,
        )
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.normal_update()
        after_thickness = topology(bm)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update(calc_edges=True, calc_edges_loose=True)
    else:
        after_thickness = None

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "weld only exact one-piece fragment matches; preserve unmatched construction pieces"
        ),
        "source_components": len(components),
        "garment_components": len(garments),
        "micro_thickness_garment_source_components": sorted(
            MICRO_GARMENT_SOURCE_COMPONENTS
        ),
        "local_micro_regions": [
            {"center": list(center), "radius": radius}
            for center, radius in LOCAL_MICRO_REGIONS
        ],
        "local_zero_thickness_vertices": len(local_zero_vertices),
        "micro_thickness_vertices": len(micro_thickness_vertices),
        "full_thickness_vertices": len(full_thickness_vertices),
        "fragment_components": len(fragments),
        "fragment_face_distribution": dict(sorted(Counter(len(item) for item in fragments).items())),
        "accepted_fragment_components": accepted_components,
        "accepted_fragment_count": len(accepted_components),
        "rejected_fragment_components": rejected_components,
        "rejected_fragment_count": len(rejected_components),
        "zero_area_faces_removed": len(zero_area_faces) if not args.inspect_only else 0,
        "fragment_boundary_vertices_welded": len(target_map) if not args.inspect_only else 0,
        "topology_before": before,
        "topology_after_patch_weld": after_patch_weld,
        "topology_after_thickness": after_thickness,
        "thickness": args.thickness,
        "micro_thickness": args.micro_thickness,
        "inspect_only": args.inspect_only,
        "fragments": rows,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    export_glb(args.output, args.position_quantization)
    print(
        json.dumps(
            {key: value for key, value in report.items() if key != "fragments"},
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

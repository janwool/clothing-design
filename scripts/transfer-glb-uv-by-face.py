#!/usr/bin/env python3
"""Transfer UV loops from a geometrically matching GLB without changing faces."""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

import bpy
from mathutils.kdtree import KDTree


def imported_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def import_one(path: Path, label: str):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    created = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH"]
    if len(created) != 1:
        raise RuntimeError(f"Expected one mesh in {label}, found {len(created)}")
    created[0].name = label
    return created[0]


def polygon_center(mesh, polygon):
    return sum((mesh.vertices[index].co for index in polygon.vertices), mesh.vertices[polygon.vertices[0]].co * 0) / len(polygon.vertices)


def export_glb(path: Path, position_quantization: int):
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


def topology_counts(mesh):
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(mesh)
    result = {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "non_manifold_edges": sum(not edge.is_manifold for edge in bm.edges),
    }
    bm.free()
    return result


def normal_consistency(mesh):
    """Audit normals while the Solidify result is still a closed manifold mesh."""
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    before = [face.normal.copy() for face in bm.faces]
    signed_volume = bm.calc_volume(signed=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    changed = sum(1 for index, face in enumerate(bm.faces) if before[index].dot(face.normal) < 0)
    bm.free()
    return {
        "signed_volume": signed_volume,
        "faces_changed_by_recalculate_outside": changed,
    }


def apply_thickness(obj, thickness):
    if thickness <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Rebuilt garment thickness", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 0.0
    modifier.use_even_offset = False
    modifier.use_quality_normals = False
    modifier.use_rim_only = False
    modifier.material_offset = 0
    modifier.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def recalculate_outside(obj):
    """Make every closed garment shell consistently outward-facing after Solidify."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("target", type=Path, help="GLB whose geometry is retained")
    parser.add_argument("uv_reference", type=Path, help="Matching GLB whose UV loops are copied")
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--maximum-centroid-distance", type=float, default=0.01)
    parser.add_argument("--maximum-corner-distance", type=float, default=0.02)
    parser.add_argument("--thickness", type=float, default=0.0)
    parser.add_argument("--recalculate-outside", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=18)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    reference = import_one(args.uv_reference, "UV reference")
    target = import_one(args.target, "UV target")
    reference_mesh = reference.data
    target_mesh = target.data
    if len(reference_mesh.polygons) != len(target_mesh.polygons):
        raise RuntimeError(
            f"Face counts differ: reference {len(reference_mesh.polygons)}, target {len(target_mesh.polygons)}"
        )
    reference_uv = reference_mesh.uv_layers.active
    if reference_uv is None:
        raise RuntimeError("UV reference has no active UV layer")
    target_uv = target_mesh.uv_layers.active or target_mesh.uv_layers.new(name=reference_uv.name)

    tree = KDTree(len(reference_mesh.polygons))
    reference_centers = []
    for polygon in reference_mesh.polygons:
        location = polygon_center(reference_mesh, polygon)
        reference_centers.append(location)
        tree.insert(location, polygon.index)
    tree.balance()

    matches = []
    for polygon in target_mesh.polygons:
        location = polygon_center(target_mesh, polygon)
        _coordinate, reference_index, distance = tree.find(location)
        matches.append((float(distance), polygon.index, reference_index))
    source_use_counts = {}
    for _distance, _target_index, reference_index in matches:
        source_use_counts[reference_index] = source_use_counts.get(reference_index, 0) + 1
    duplicate_matches = {index: count for index, count in source_use_counts.items() if count != 1}
    if duplicate_matches or len(source_use_counts) != len(reference_mesh.polygons):
        raise RuntimeError(
            f"Centroid mapping is not one-to-one: {len(source_use_counts)} of "
            f"{len(reference_mesh.polygons)} reference faces used; duplicates={len(duplicate_matches)}"
        )
    maximum_centroid_distance = max(distance for distance, _target, _source in matches)
    if maximum_centroid_distance > args.maximum_centroid_distance:
        raise RuntimeError(
            f"Maximum face-centroid distance {maximum_centroid_distance:.6f} exceeds limit"
        )

    maximum_corner_distance = 0.0
    for _distance, target_index, reference_index in matches:
        target_polygon = target_mesh.polygons[target_index]
        reference_polygon = reference_mesh.polygons[reference_index]
        if len(target_polygon.vertices) != 3 or len(reference_polygon.vertices) != 3:
            raise RuntimeError("UV transfer expects triangulated meshes")
        target_vertices = [target_mesh.vertices[index].co for index in target_polygon.vertices]
        reference_vertices = [reference_mesh.vertices[index].co for index in reference_polygon.vertices]
        permutation = min(
            itertools.permutations(range(3)),
            key=lambda order: sum(
                (target_vertices[target_corner] - reference_vertices[order[target_corner]]).length_squared
                for target_corner in range(3)
            ),
        )
        corner_distances = [
            (target_vertices[target_corner] - reference_vertices[permutation[target_corner]]).length
            for target_corner in range(3)
        ]
        maximum_corner_distance = max(maximum_corner_distance, *corner_distances)
        for target_corner, target_loop_index in enumerate(target_polygon.loop_indices):
            reference_loop_index = reference_polygon.loop_indices[permutation[target_corner]]
            target_uv.data[target_loop_index].uv = reference_uv.data[reference_loop_index].uv
    if maximum_corner_distance > args.maximum_corner_distance:
        raise RuntimeError(
            f"Maximum matched-corner distance {maximum_corner_distance:.6f} exceeds limit"
        )

    topology_before_thickness = topology_counts(target_mesh)
    bpy.data.objects.remove(reference, do_unlink=True)
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    apply_thickness(target, args.thickness)
    if args.recalculate_outside:
        recalculate_outside(target)
    topology_after_thickness = topology_counts(target.data)
    normals_after_thickness = normal_consistency(target.data)
    export_glb(args.output, args.position_quantization)
    report = {
        "target": str(args.target),
        "uv_reference": str(args.uv_reference),
        "output": str(args.output),
        "faces": len(target_mesh.polygons),
        "one_to_one_face_matches": len(matches),
        "maximum_centroid_distance": maximum_centroid_distance,
        "maximum_corner_distance": maximum_corner_distance,
        "thickness": args.thickness,
        "recalculated_outside": args.recalculate_outside,
        "topology_before_thickness": topology_before_thickness,
        "topology_after_thickness_before_export": topology_after_thickness,
        "normals_after_thickness_before_export": normals_after_thickness,
        "geometry_changed": args.thickness > 0,
        "uv_changed": True,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

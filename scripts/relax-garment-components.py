#!/usr/bin/env python3
"""Apply volume-preserving relaxation only to explicitly selected mesh components."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh


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


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--indices")
    parser.add_argument(
        "--source-material-indices",
        help="Comma-separated imported material-slot indices whose vertices should be relaxed.",
    )
    parser.add_argument("--factor", type=float, default=0.04)
    parser.add_argument("--iterations", type=int, default=2)
    parser.add_argument("--clear-custom-normals", action="store_true")
    parser.add_argument("--recalculate-face-normals", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)
    if bool(args.indices) == bool(args.source_material_indices):
        raise ValueError("Specify exactly one of --indices or --source-material-indices")
    selected_indices = (
        {int(value) for value in args.indices.split(",") if value.strip()}
        if args.indices
        else set()
    )
    selected_material_indices = (
        {int(value) for value in args.source_material_indices.split(",") if value.strip()}
        if args.source_material_indices
        else set()
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    reports = []
    for obj in (item for item in bpy.context.scene.objects if item.type == "MESH"):
        components = face_components(obj.data)
        if selected_indices:
            missing = selected_indices - set(range(len(components)))
            if missing:
                raise ValueError(f"Unknown component indices: {sorted(missing)}")
            selected_faces = {
                face_index
                for component_index in selected_indices
                for face_index in components[component_index]
            }
        else:
            selected_faces = {
                polygon.index
                for polygon in obj.data.polygons
                if polygon.material_index in selected_material_indices
            }
        selected_vertices = sorted(
            {
                vertex_index
                for face_index in selected_faces
                for vertex_index in obj.data.polygons[face_index].vertices
            }
        )
        group = obj.vertex_groups.new(name="Diagnosed cup components")
        group.add(selected_vertices, 1.0, "REPLACE")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("Local volume preserving relaxation", "LAPLACIANSMOOTH")
        modifier.vertex_group = group.name
        modifier.lambda_factor = args.factor
        modifier.lambda_border = 0.0
        modifier.iterations = args.iterations
        modifier.use_volume_preserve = True
        modifier.use_normalized = True
        modifier.use_x = True
        modifier.use_y = True
        modifier.use_z = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Applying a modifier can consume/remove its temporary vertex group in
        # some Blender versions. Remove it only when it still exists.
        remaining_group = obj.vertex_groups.get("Diagnosed cup components")
        if remaining_group is not None:
            obj.vertex_groups.remove(remaining_group)
        if args.clear_custom_normals and obj.data.has_custom_normals:
            obj.data.free_normals_split()
        if args.recalculate_face_normals:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(obj.data)
            bm.free()
        obj.data.use_auto_smooth = False
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj.data.update(calc_edges=True, calc_edges_loose=True)
        reports.append(
            {
                "object": obj.name,
                "component_count": len(components),
                "selected_components": sorted(selected_indices),
                "selected_source_material_indices": sorted(selected_material_indices),
                "selected_faces": len(selected_faces),
                "selected_vertices": len(selected_vertices),
                "factor": args.factor,
                "iterations": args.iterations,
                "custom_normals_cleared": args.clear_custom_normals,
                "face_normals_recalculated": args.recalculate_face_normals,
                "vertices": len(obj.data.vertices),
                "faces": len(obj.data.polygons),
            }
        )

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
    print(json.dumps({"input": str(args.input), "output": str(args.output), "objects": reports}, indent=2))


if __name__ == "__main__":
    main()

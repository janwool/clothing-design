#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


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


def nearest_vertex(source, candidates):
    return min(candidates, key=lambda candidate: (candidate.co - source.co).length_squared)


def repair_object(obj: bpy.types.Object, max_faces: int, tolerance: float) -> dict[str, object]:
    mesh = obj.data
    components = face_components(mesh)
    main_face_indices = {
        face_index
        for component in components
        if len(component) > max_faces
        for face_index in component
    }
    patch_face_indices = {
        component[0]
        for component in components
        if len(component) == 1
    }
    garbage_face_indices = {
        face_index
        for component in components
        if 1 < len(component) <= max_faces
        for face_index in component
    }

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()

    main_faces = {bm.faces[index] for index in main_face_indices}
    patch_faces = [bm.faces[index] for index in patch_face_indices]
    garbage_faces = [bm.faces[index] for index in garbage_face_indices]
    main_boundary_vertices = {
        vert
        for edge in bm.edges
        if edge.is_boundary and any(face in main_faces for face in edge.link_faces)
        for vert in edge.verts
    }
    if not main_boundary_vertices:
        raise RuntimeError("No main garment boundary vertices were found for patch welding")

    uv_layer = bm.loops.layers.uv.active
    target_map = {}
    max_weld_distance = 0.0
    patch_faces_flipped = 0
    for patch_face in patch_faces:
        was_flat_shaded = not patch_face.smooth
        if was_flat_shaded:
            # The source uses a custom split normal to mask reversed winding on
            # two one-face repair patches. Fix the winding before discarding
            # custom normals so the repaired GLB shades correctly everywhere.
            patch_face.normal_flip()
            patch_faces_flipped += 1
        patch_face.smooth = True
        neighboring_main_faces = set()
        for loop in patch_face.loops:
            target = nearest_vertex(loop.vert, main_boundary_vertices)
            distance = (target.co - loop.vert.co).length
            max_weld_distance = max(max_weld_distance, distance)
            if distance > tolerance:
                raise RuntimeError(
                    f"Patch vertex is {distance:.8f} units from its nearest garment boundary; "
                    f"tolerance is {tolerance:.8f}"
                )
            if uv_layer is not None:
                target_loops = [
                    candidate_loop
                    for face in target.link_faces
                    if face in main_faces
                    for candidate_loop in face.loops
                    if candidate_loop.vert is target
                ]
                if target_loops:
                    loop[uv_layer].uv = target_loops[0][uv_layer].uv.copy()
            neighboring_main_faces.update(face for face in target.link_faces if face in main_faces)
            target_map[loop.vert] = target

        if neighboring_main_faces:
            reference_normal = patch_face.normal.copy() * 0
            for neighboring_face in neighboring_main_faces:
                reference_normal += neighboring_face.normal
            if (
                not was_flat_shaded
                and reference_normal.length_squared > 0
                and patch_face.normal.dot(reference_normal) < 0
            ):
                patch_face.normal_flip()
                patch_faces_flipped += 1

    if garbage_faces:
        bmesh.ops.delete(bm, geom=garbage_faces, context="FACES")
    if target_map:
        bmesh.ops.weld_verts(bm, targetmap=target_map)
    # Rebuild a consistent outward winding for every now-closed garment shell.
    # This also fixes source faces whose appearance previously depended on
    # inconsistent custom split normals hidden beneath the debris patches.
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    return {
        "object": obj.name,
        "components_before": len(components),
        "main_components": sum(1 for component in components if len(component) > max_faces),
        "patch_triangles_welded": len(patch_faces),
        "patch_triangles_flipped": patch_faces_flipped,
        "garbage_components_removed": sum(1 for component in components if 1 < len(component) <= max_faces),
        "garbage_faces_removed": len(garbage_face_indices),
        "vertices_welded": len(target_map),
        "max_weld_distance": max_weld_distance,
        "faces_after": len(mesh.polygons),
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Weld one-face repair patches into garment holes and remove other tiny debris components."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-faces", type=int, default=99)
    parser.add_argument("--tolerance", type=float, default=0.002)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")

    reports = [repair_object(obj, args.max_faces, args.tolerance) for obj in objects]
    export_glb(args.output)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "max_faces": args.max_faces,
                "tolerance": args.tolerance,
                "objects": reports,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

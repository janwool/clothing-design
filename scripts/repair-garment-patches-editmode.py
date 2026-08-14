#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

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


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def weld_single_triangle_patches(obj: bpy.types.Object, max_faces: int, tolerance: float) -> dict[str, object]:
    mesh = obj.data
    components = face_components(mesh)
    main_face_indices = {
        face_index
        for component in components
        if len(component) > max_faces
        for face_index in component
    }
    patch_face_indices = [component[0] for component in components if len(component) == 1]

    edge_face_indices: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_face_indices[edge_key].append(polygon.index)
    main_boundary_vertices = {
        vertex_index
        for edge_key, linked_faces in edge_face_indices.items()
        if len(linked_faces) == 1 and linked_faces[0] in main_face_indices
        for vertex_index in edge_key
    }
    patch_vertices = {
        vertex_index
        for face_index in patch_face_indices
        for vertex_index in mesh.polygons[face_index].vertices
    }
    selected_vertices = set(patch_vertices)
    max_distance = 0.0
    for patch_vertex_index in patch_vertices:
        patch_vertex = mesh.vertices[patch_vertex_index]
        nearest_index = min(
            main_boundary_vertices,
            key=lambda index: (mesh.vertices[index].co - patch_vertex.co).length_squared,
        )
        distance = (mesh.vertices[nearest_index].co - patch_vertex.co).length
        max_distance = max(max_distance, distance)
        if distance > tolerance:
            raise RuntimeError(
                f"Patch vertex is {distance:.8f} units from its garment boundary; tolerance is {tolerance:.8f}"
            )
        selected_vertices.add(nearest_index)

    for polygon in mesh.polygons:
        polygon.select = False
    for edge in mesh.edges:
        edge.select = False
    for vertex in mesh.vertices:
        vertex.select = vertex.index in selected_vertices
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.mesh.remove_doubles(threshold=tolerance)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.update(calc_edges=True, calc_edges_loose=True)
    return {
        "components_before": len(components),
        "patch_triangles": len(patch_face_indices),
        "patch_vertices": len(patch_vertices),
        "selected_vertices": len(selected_vertices),
        "max_weld_distance": max_distance,
    }


def remove_debris(obj: bpy.types.Object, max_faces: int) -> dict[str, object]:
    mesh = obj.data
    components = face_components(mesh)
    garbage_components = [component for component in components if len(component) <= max_faces]
    garbage_face_indices = {
        face_index for component in garbage_components for face_index in component
    }
    for vertex in mesh.vertices:
        vertex.select = False
    for edge in mesh.edges:
        edge.select = False
    for polygon in mesh.polygons:
        polygon.select = polygon.index in garbage_face_indices
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.validate(verbose=False, clean_customdata=True)
    mesh.update(calc_edges=True, calc_edges_loose=True)
    return {
        "components_after_weld": len(components),
        "debris_components_removed": len(garbage_components),
        "debris_faces_removed": len(garbage_face_indices),
        "faces_after": len(mesh.polygons),
        "custom_normals_preserved": mesh.has_custom_normals,
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_texcoords=True,
        export_normals=True, export_materials="EXPORT", export_apply=False,
        export_yup=True, export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Repair coincident triangle patches with Blender edit-mode operations that preserve source normals."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-faces", type=int, default=99)
    parser.add_argument("--tolerance", type=float, default=1e-6)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")

    reports = []
    for obj in objects:
        reports.append({
            "object": obj.name,
            **weld_single_triangle_patches(obj, args.max_faces, args.tolerance),
            **remove_debris(obj, args.max_faces),
        })
    export_glb(args.output)
    print(json.dumps({"input": str(args.input), "output": str(args.output), "objects": reports}, indent=2))


if __name__ == "__main__":
    main()

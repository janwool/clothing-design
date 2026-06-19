#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def connected_face_components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    edge_faces = defaultdict(list)
    for face in bm.faces:
        for edge in face.edges:
            edge_faces[edge].append(face)

    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    visited = set()
    components = []
    for face in bm.faces:
        if face in visited:
            continue
        queue = deque([face])
        visited.add(face)
        component = []
        while queue:
            current = queue.popleft()
            component.append(current)
            for other in neighbors[current]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def remove_small_components(obj: bpy.types.Object, keep_largest: int) -> tuple[int, int]:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    ranked = []
    for component in connected_face_components(bm):
        area = sum(face.calc_area() for face in component)
        ranked.append((area, component))
    ranked.sort(key=lambda item: item[0], reverse=True)

    faces_to_delete = [face for _, component in ranked[keep_largest:] for face in component]
    removed_components = max(0, len(ranked) - keep_largest)
    removed_faces = len(faces_to_delete)
    if faces_to_delete:
        bmesh.ops.delete(bm, geom=faces_to_delete, context="FACES")
        loose_verts = [vert for vert in bm.verts if not vert.link_faces]
        if loose_verts:
            bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return removed_components, removed_faces


def boundary_components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMEdge]]:
    boundary_edges = [edge for edge in bm.edges if edge.is_boundary]
    visited = set()
    components = []
    for start in boundary_edges:
        if start in visited:
            continue
        queue = deque([start])
        visited.add(start)
        component = []
        while queue:
            edge = queue.popleft()
            component.append(edge)
            for vert in edge.verts:
                for linked in vert.link_edges:
                    if linked.is_boundary and linked not in visited:
                        visited.add(linked)
                        queue.append(linked)
        components.append(component)
    return components


def boundary_length(edges: list[bmesh.types.BMEdge]) -> float:
    return sum((edge.verts[0].co - edge.verts[1].co).length for edge in edges)


def fill_small_boundary_holes(obj: bpy.types.Object, max_length: float, max_edges: int) -> int:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    filled = 0
    for edges in boundary_components(bm):
        if len(edges) <= max_edges and boundary_length(edges) <= max_length:
            try:
                bmesh.ops.holes_fill(bm, edges=edges, sides=0)
                filled += 1
            except ValueError:
                pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return filled


def add_thickness(obj: bpy.types.Object, thickness: float) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    solidify = obj.modifiers.new("Safe garment thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0
    solidify.use_even_offset = False
    solidify.use_quality_normals = False
    solidify.use_rim_only = False
    solidify.material_offset = 0
    solidify.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=solidify.name)

    weighted = obj.modifiers.new("Soft cloth normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True
    weighted.weight = 25
    bpy.ops.object.modifier_apply(modifier=weighted.name)


def export_glb(path: Path) -> None:
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair small pinholes on minimal-fashion-top without replacing the model.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--keep-largest", type=int, default=32)
    parser.add_argument("--max-hole-length", type=float, default=0.35)
    parser.add_argument("--max-hole-edges", type=int, default=16)
    parser.add_argument("--thickness", type=float, default=0.012)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

    removed_components = 0
    removed_faces = 0
    filled_holes = 0
    for obj in mesh_objects:
        components, faces = remove_small_components(obj, args.keep_largest)
        removed_components += components
        removed_faces += faces
        filled_holes += fill_small_boundary_holes(obj, args.max_hole_length, args.max_hole_edges)
        add_thickness(obj, args.thickness)

    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print(f"meshes={len(mesh_objects)}")
    print(f"removed_components={removed_components}")
    print(f"removed_faces={removed_faces}")
    print(f"filled_holes={filled_holes}")
    print(f"max_hole_length={args.max_hole_length}")
    print(f"thickness={args.thickness}")


if __name__ == "__main__":
    main()

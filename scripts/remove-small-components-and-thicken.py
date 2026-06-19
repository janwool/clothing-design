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

    components = []
    visited = set()
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


def remove_small_components(obj: bpy.types.Object, min_area: float, min_faces: int, keep_largest: int) -> int:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    components = connected_face_components(bm)
    ranked = []
    for component in components:
        area = sum(face.calc_area() for face in component)
        ranked.append((area, len(component), component))
    ranked.sort(key=lambda item: item[0], reverse=True)

    protected = {face for _, _, component in ranked[:keep_largest] for face in component}
    faces_to_delete = []
    removed_components = 0
    for area, face_count, component in ranked[keep_largest:]:
        if area < min_area or face_count < min_faces:
            faces_to_delete.extend(face for face in component if face not in protected)
            removed_components += 1

    if faces_to_delete:
        bmesh.ops.delete(bm, geom=faces_to_delete, context="FACES")
        bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not vert.link_faces], context="VERTS")

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return removed_components


def add_safe_thickness(obj: bpy.types.Object, thickness: float) -> None:
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

    weighted = obj.modifiers.new("Soft cloth edge normals", "WEIGHTED_NORMAL")
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
    parser = argparse.ArgumentParser(description="Remove tiny disconnected mesh components and add safe garment thickness.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--min-area", type=float, default=0.05)
    parser.add_argument("--min-faces", type=int, default=100)
    parser.add_argument("--keep-largest", type=int, default=32)
    parser.add_argument("--thickness", type=float, default=0.024)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    removed = 0
    for obj in mesh_objects:
        removed += remove_small_components(obj, args.min_area, args.min_faces, args.keep_largest)
        add_safe_thickness(obj, args.thickness)
        removed += remove_small_components(obj, args.min_area, args.min_faces, args.keep_largest)
    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print(f"meshes={len(mesh_objects)}")
    print(f"removed_small_components={removed}")


if __name__ == "__main__":
    main()

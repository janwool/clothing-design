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


def remove_components(obj: bpy.types.Object, keep_largest: int) -> tuple[int, int]:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    ranked = []
    for component in connected_face_components(bm):
        area = sum(face.calc_area() for face in component)
        ranked.append((area, len(component), component))
    ranked.sort(key=lambda item: item[0], reverse=True)

    faces_to_delete = [face for _, _, component in ranked[keep_largest:] for face in component]
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


def export_glb(path: Path) -> None:
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove tiny disconnected GLB surface components without changing main garment geometry.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--keep-largest", type=int, default=32)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

    removed_components = 0
    removed_faces = 0
    for obj in mesh_objects:
        components, faces = remove_components(obj, args.keep_largest)
        removed_components += components
        removed_faces += faces

    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print(f"meshes={len(mesh_objects)}")
    print(f"keep_largest={args.keep_largest}")
    print(f"removed_components={removed_components}")
    print(f"removed_faces={removed_faces}")


if __name__ == "__main__":
    main()

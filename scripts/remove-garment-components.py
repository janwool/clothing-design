#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components, visited = [], set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue, component = deque([polygon.index]), []
        visited.add(polygon.index)
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_texcoords=True,
        export_normals=True, export_materials="EXPORT", export_apply=False,
        export_yup=True, export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove explicit connected components while preserving other mesh data.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--indices", required=True)
    parser.add_argument("--position-quantization", type=int, default=14)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    indices = {int(value) for value in args.indices.split(",") if value.strip()}

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    components = face_components(obj.data)
    missing = indices - set(range(len(components)))
    if missing:
        raise ValueError(f"Unknown component indices: {sorted(missing)}")
    removed_faces = {face for index in indices for face in components[index]}
    for vertex in obj.data.vertices:
        vertex.select = False
    for edge in obj.data.edges:
        edge.select = False
    for polygon in obj.data.polygons:
        polygon.select = polygon.index in removed_faces
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    export_glb(args.output, args.position_quantization)
    print(json.dumps({"indices": sorted(indices), "faces_removed": len(removed_faces), "faces_after": len(obj.data.polygons), "position_quantization": args.position_quantization}, indent=2))


if __name__ == "__main__":
    main()

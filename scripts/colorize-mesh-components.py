#!/usr/bin/env python3
"""Assign a distinct diagnostic material to every connected mesh component."""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


COLORS = [
    (0.91, 0.16, 0.12, 1.0),
    (0.12, 0.48, 0.95, 1.0),
    (0.12, 0.75, 0.32, 1.0),
    (0.95, 0.62, 0.08, 1.0),
    (0.64, 0.24, 0.88, 1.0),
    (0.08, 0.75, 0.78, 1.0),
    (0.95, 0.28, 0.62, 1.0),
    (0.52, 0.72, 0.08, 1.0),
    (0.32, 0.28, 0.92, 1.0),
    (0.88, 0.45, 0.14, 1.0),
    (0.15, 0.64, 0.58, 1.0),
    (0.72, 0.16, 0.34, 1.0),
]


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
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    for obj in (item for item in bpy.context.scene.objects if item.type == "MESH"):
        components = face_components(obj.data)
        obj.data.materials.clear()
        for index in range(len(components)):
            color = COLORS[index % len(COLORS)]
            material = bpy.data.materials.new(f"Diagnostic component {index}")
            material.use_nodes = True
            material.diffuse_color = color
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = color
                bsdf.inputs["Roughness"].default_value = 0.62
            obj.data.materials.append(material)
        for component_index, faces in enumerate(components):
            for face_index in faces:
                obj.data.polygons[face_index].material_index = component_index

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


if __name__ == "__main__":
    main()

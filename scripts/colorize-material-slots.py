#!/usr/bin/env python3
"""Replace imported material slots with vivid diagnostic colors without changing assignments."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


COLORS = [
    (1.0, 0.03, 0.02, 1.0),
    (0.02, 0.35, 1.0, 1.0),
    (0.05, 1.0, 0.12, 1.0),
    (1.0, 0.65, 0.02, 1.0),
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    for obj in (item for item in bpy.context.scene.objects if item.type == "MESH"):
        slot_count = max(1, len(obj.data.materials))
        source_indices = [polygon.material_index for polygon in obj.data.polygons]
        obj.data.materials.clear()
        for index in range(slot_count):
            material = bpy.data.materials.new(f"Diagnostic slot {index}")
            material.use_nodes = True
            material.diffuse_color = COLORS[index % len(COLORS)]
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = COLORS[index % len(COLORS)]
                bsdf.inputs["Roughness"].default_value = 0.58
            obj.data.materials.append(material)
        for polygon, source_index in zip(obj.data.polygons, source_indices):
            polygon.material_index = source_index

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

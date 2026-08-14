#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


COLORS = [
    (1.0, 0.03, 0.02, 1.0),
    (0.02, 0.35, 1.0, 1.0),
    (0.05, 1.0, 0.12, 1.0),
    (1.0, 0.65, 0.02, 1.0),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Add colored diagnostic spheres at mesh-local coordinates.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--centers", required=True, help="Semicolon-separated x,y,z coordinates")
    parser.add_argument("--radius", type=float, default=0.1)
    parser.add_argument("--position-quantization", type=int, default=22)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    garment = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    centers = [
        Vector(tuple(float(value) for value in group.split(",")))
        for group in args.centers.split(";")
        if group.strip()
    ]
    for index, center in enumerate(centers):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24,
            ring_count=12,
            radius=args.radius,
            location=garment.matrix_world @ center,
        )
        marker = bpy.context.object
        marker.name = f"Diagnostic marker {index + 1}"
        material = bpy.data.materials.new(f"Marker {index + 1}")
        material.diffuse_color = COLORS[index % len(COLORS)]
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = COLORS[index % len(COLORS)]
            if "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = COLORS[index % len(COLORS)]
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = 2.0
            bsdf.inputs["Roughness"].default_value = 0.35
        marker.data.materials.append(material)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()),
        export_format="GLB",
        use_selection=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print(f"markers={len(centers)}")
    print(f"output={args.output}")


if __name__ == "__main__":
    main()

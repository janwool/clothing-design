#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def repair_normals(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()
    weighted = obj.modifiers.new("Soft continuous cloth normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = False
    weighted.weight = 50
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
    parser = argparse.ArgumentParser(description="Repair minimal fashion top shading by smoothing normals only.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        repair_normals(obj)
    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")


if __name__ == "__main__":
    main()

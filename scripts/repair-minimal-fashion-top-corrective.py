#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def apply_corrective(obj: bpy.types.Object, factor: float, iterations: int) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    mod = obj.modifiers.new("Gentle corrective cloth smooth", "CORRECTIVE_SMOOTH")
    mod.factor = factor
    mod.iterations = iterations
    mod.use_only_smooth = False
    bpy.ops.object.modifier_apply(modifier=mod.name)
    weighted = obj.modifiers.new("Soft cloth normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True
    weighted.weight = 35
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
    parser = argparse.ArgumentParser(description="Correctively smooth minimal fashion top without deleting mesh pieces.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--factor", type=float, default=0.35)
    parser.add_argument("--iterations", type=int, default=4)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        apply_corrective(obj, args.factor, args.iterations)
    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print(f"factor={args.factor}")
    print(f"iterations={args.iterations}")


if __name__ == "__main__":
    main()

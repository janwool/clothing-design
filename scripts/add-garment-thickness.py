#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix == ".glb" or suffix == ".gltf":
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.import_scene.obj(filepath=str(path))
    else:
        raise ValueError(f"Unsupported model format: {path}")


def scene_size(mesh_objects: list[bpy.types.Object]) -> float:
    mins = [math.inf, math.inf, math.inf]
    maxs = [-math.inf, -math.inf, -math.inf]
    for obj in mesh_objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world[axis])
                maxs[axis] = max(maxs[axis], world[axis])
    return max(maxs[axis] - mins[axis] for axis in range(3))


def add_thickness(mesh_objects: list[bpy.types.Object], thickness: float) -> None:
    for obj in mesh_objects:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        solidify = obj.modifiers.new("Garment fabric thickness", "SOLIDIFY")
        solidify.thickness = thickness
        solidify.offset = 0
        solidify.use_even_offset = True
        solidify.use_quality_normals = True
        solidify.use_rim_only = False
        solidify.material_offset = 0
        solidify.material_offset_rim = 0
        bpy.ops.object.modifier_apply(modifier=solidify.name)

        weighted = obj.modifiers.new("Soft cloth edge normals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        weighted.weight = 35
        bpy.ops.object.modifier_apply(modifier=weighted.name)
        obj.select_set(False)


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
    parser = argparse.ArgumentParser(description="Add subtle solid cloth thickness to garment GLB/OBJ files.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--thickness", type=float, default=0.0, help="Absolute scene-unit thickness. Defaults to auto.")
    parser.add_argument("--ratio", type=float, default=0.0065, help="Auto thickness as ratio of largest dimension.")
    parser.add_argument("--min", dest="min_thickness", type=float, default=0.008)
    parser.add_argument("--max", dest="max_thickness", type=float, default=0.032)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    import_model(args.input)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError(f"No mesh objects found in {args.input}")

    largest = max(obj.dimensions[axis] for obj in mesh_objects for axis in range(3))
    thickness = args.thickness or max(args.min_thickness, min(args.max_thickness, largest * args.ratio))
    add_thickness(mesh_objects, thickness)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    export_glb(args.output)
    print(f"processed={args.input}")
    print(f"output={args.output}")
    print(f"meshes={len(mesh_objects)}")
    print(f"largest_dimension={largest:.6f}")
    print(f"thickness={thickness:.6f}")


if __name__ == "__main__":
    import mathutils

    main()

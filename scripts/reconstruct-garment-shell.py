#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def reconstruct(
    obj: bpy.types.Object,
    resolution: int,
    target_triangles: int,
    smooth_iterations: int,
    thickness_voxels: float,
) -> dict[str, object]:
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    before = triangle_count(obj)
    largest_dimension = max(obj.dimensions)
    voxel_size = largest_dimension / resolution

    if thickness_voxels > 0:
        solidify = obj.modifiers.new("Temporary garment reconstruction thickness", "SOLIDIFY")
        solidify.thickness = voxel_size * thickness_voxels
        solidify.offset = 0.0
        solidify.use_even_offset = True
        solidify.use_quality_normals = True
        solidify.use_rim_only = False
        bpy.ops.object.modifier_apply(modifier=solidify.name)

    obj.data.remesh_voxel_size = voxel_size
    obj.data.remesh_voxel_adaptivity = 0.0
    obj.data.use_remesh_preserve_volume = True
    bpy.ops.object.voxel_remesh()
    after_remesh = triangle_count(obj)

    if smooth_iterations > 0:
        smooth = obj.modifiers.new("Garment surface relaxation", "SMOOTH")
        smooth.factor = 0.12
        smooth.iterations = smooth_iterations
        smooth.use_x = True
        smooth.use_y = True
        smooth.use_z = True
        bpy.ops.object.modifier_apply(modifier=smooth.name)

    current = triangle_count(obj)
    if current > target_triangles:
        decimate = obj.modifiers.new("Garment web topology", "DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = max(0.01, target_triangles / current)
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)

    obj.data.validate(verbose=False, clean_customdata=True)
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    if obj.data.uv_layers:
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name="Garment UV")
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.012)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=False, margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()

    after = triangle_count(obj)
    return {
        "object": obj.name,
        "triangles_before": before,
        "triangles_after_voxel_remesh": after_remesh,
        "triangles_after": after,
        "vertices_after": len(obj.data.vertices),
        "voxel_size": round(voxel_size, 6),
        "reconstruction_thickness": round(voxel_size * thickness_voxels, 6),
        "resolution": resolution,
        "target_triangles": target_triangles,
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild fragmented garment geometry as one continuous web-ready shell.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--resolution", type=int, default=256)
    parser.add_argument("--target-triangles", type=int, default=48_000)
    parser.add_argument("--smooth-iterations", type=int, default=2)
    parser.add_argument("--thickness-voxels", type=float, default=1.25)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one garment mesh, found {len(objects)}")
    report = reconstruct(
        objects[0],
        args.resolution,
        args.target_triangles,
        args.smooth_iterations,
        args.thickness_voxels,
    )
    export_glb(args.output)
    print(json.dumps({"input": str(args.input), "output": str(args.output), **report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

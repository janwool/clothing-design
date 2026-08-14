#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
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


def relax_object(obj: bpy.types.Object, factor: float, iterations: int) -> dict[str, object]:
    activate(obj)
    before_vertices = len(obj.data.vertices)
    before_faces = len(obj.data.polygons)

    modifier = obj.modifiers.new("Volume preserving garment relaxation", "LAPLACIANSMOOTH")
    modifier.lambda_factor = factor
    modifier.lambda_border = 0.0
    modifier.iterations = iterations
    modifier.use_volume_preserve = True
    modifier.use_normalized = True
    modifier.use_x = True
    modifier.use_y = True
    modifier.use_z = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    obj.data.validate(verbose=False, clean_customdata=True)
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    return {
        "object": obj.name,
        "factor": factor,
        "iterations": iterations,
        "vertices_before": before_vertices,
        "vertices_after": len(obj.data.vertices),
        "faces_before": before_faces,
        "faces_after": len(obj.data.polygons),
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
    parser = argparse.ArgumentParser(
        description="Apply a volume-preserving surface relaxation to one repaired garment GLB."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--factor", type=float, default=0.08)
    parser.add_argument("--iterations", type=int, default=4)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")
    reports = [relax_object(obj, args.factor, args.iterations) for obj in objects]
    export_glb(args.output)
    print(
        json.dumps(
            {"input": str(args.input), "output": str(args.output), "objects": reports},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

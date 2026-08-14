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


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def optimize_object(obj: bpy.types.Object, target_triangles: int, preserve_uv_seams: bool) -> dict[str, object]:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    before = triangle_count(obj)
    current = before
    passes = []
    while current > target_triangles * 1.05 and len(passes) < 6:
        modifier = obj.modifiers.new(f"Web garment optimization {len(passes) + 1}", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.001, min(1.0, target_triangles / current))
        modifier.use_collapse_triangulate = True
        if hasattr(modifier, "delimit"):
            modifier.delimit = {"UV"} if preserve_uv_seams else set()
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Blender 3.1 can retain stale loop-triangle indices after collapsing a
        # very dense imported Draco mesh. Rebuild runtime data after every pass.
        obj.data.validate(verbose=False, clean_customdata=True)
        obj.data.update(calc_edges=True, calc_edges_loose=True)
        next_count = triangle_count(obj)
        passes.append({"before": current, "after": next_count})
        if next_count >= current * 0.995:
            break
        current = next_count

    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()

    after = triangle_count(obj)
    obj.select_set(False)
    return {
        "object": obj.name,
        "triangles_before": before,
        "triangles_after": after,
        "vertices_after": len(obj.data.vertices),
        "target_triangles": target_triangles,
        "ratio": round(after / before, 6) if before else 1.0,
        "passes": passes,
    }


def export_glb(path: Path, position_quantization: int) -> None:
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
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Reduce dense garment GLBs while preserving UV seams and silhouette.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--target-triangles", type=int, default=36_000)
    parser.add_argument(
        "--position-quantization",
        type=int,
        default=14,
        help="Draco position quantization bits; raise this for dense garment seams.",
    )
    parser.add_argument(
        "--preserve-uv-seams",
        action="store_true",
        help="Keep every imported UV seam. This can prevent dense CLO meshes from reaching the target.",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")

    total_before = sum(triangle_count(obj) for obj in objects)
    reports = []
    for obj in objects:
        share = max(500, round(args.target_triangles * triangle_count(obj) / total_before))
        reports.append(optimize_object(obj, share, args.preserve_uv_seams))

    export_glb(args.output, args.position_quantization)
    payload = {
        "input": str(args.input),
        "output": str(args.output),
        "objects": reports,
        "triangles_before": total_before,
        "triangles_after": sum(row["triangles_after"] for row in reports),
        "position_quantization": args.position_quantization,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

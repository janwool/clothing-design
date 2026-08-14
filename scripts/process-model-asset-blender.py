#!/usr/bin/env python3
"""Create the production GLB, UV outline and cover render for one catalog model.

This script is intentionally one-model-per-Blender-process. A malformed source
therefore cannot contaminate the remaining catalog batch, and the orchestrator
can safely resume from the last completed model.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def load_script(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load helper script: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def mesh_statistics(objects: list[bpy.types.Object]) -> dict[str, int]:
    vertices = faces = triangles = boundary_edges = non_manifold_edges = 0
    uv_layers = 0
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        vertices += len(mesh.vertices)
        faces += len(mesh.polygons)
        triangles += len(mesh.loop_triangles)
        uv_layers += int(bool(mesh.uv_layers))
        edge_face_counts = [0] * len(mesh.edges)
        edge_lookup = {tuple(sorted(edge.vertices)): edge.index for edge in mesh.edges}
        for polygon in mesh.polygons:
            for key in polygon.edge_keys:
                edge_face_counts[edge_lookup[tuple(sorted(key))]] += 1
        boundary_edges += sum(count == 1 for count in edge_face_counts)
        non_manifold_edges += sum(count != 2 for count in edge_face_counts)
    return {
        "objects": len(objects),
        "vertices": vertices,
        "faces": faces,
        "triangles": triangles,
        "boundary_edges": boundary_edges,
        "non_manifold_edges": non_manifold_edges,
        "objects_with_uv": uv_layers,
    }


def prepare_meshes(objects: list[bpy.types.Object], uv_margin: float) -> dict[str, object]:
    generated_uvs = []
    invalid_uvs = []
    for obj in objects:
        mesh = obj.data
        mesh.validate(verbose=False, clean_customdata=False)
        mesh.update(calc_edges=True, calc_edges_loose=True)
        if hasattr(mesh, "free_normals_split"):
            try:
                mesh.free_normals_split()
            except RuntimeError:
                pass
        if hasattr(mesh, "use_auto_smooth"):
            mesh.use_auto_smooth = False
        for polygon in mesh.polygons:
            polygon.use_smooth = True

        needs_uv = not mesh.uv_layers
        if not needs_uv:
            layer = mesh.uv_layers.active.data
            needs_uv = any(
                not math.isfinite(loop.uv.x) or not math.isfinite(loop.uv.y)
                for loop in layer
            )
            if needs_uv:
                invalid_uvs.append(obj.name)
                while mesh.uv_layers:
                    mesh.uv_layers.remove(mesh.uv_layers[0])

        if needs_uv:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(66.0),
                island_margin=uv_margin,
            )
            bpy.ops.object.mode_set(mode="OBJECT")
            obj.select_set(False)
            generated_uvs.append(obj.name)
    return {"generated_uvs": generated_uvs, "invalid_uvs": invalid_uvs}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-glb", required=True, type=Path)
    parser.add_argument("--output-svg", required=True, type=Path)
    parser.add_argument("--cover-dir", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--uv-margin", type=float, default=0.012)
    parser.add_argument("--svg-size", type=int, default=1024)
    parser.add_argument("--min-svg-area", type=float, default=50.0)
    parser.add_argument("--min-svg-span", type=float, default=1.5)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    profile = json.loads(args.profile)
    root = Path(__file__).resolve().parent.parent
    material_helper = load_script("apply_garment_material", root / "scripts/apply-garment-material.py")
    motion_helper = load_script("add_garment_softness", root / "scripts/add-garment-softness-animation.py")
    render_helper = load_script("render_glb_qa", root / "scripts/render-glb-qa-views.py")
    uv_helper = load_script("repack_glb_uv", root / "scripts/repack-glb-uv-and-export-svg.py")

    material_helper.clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError(f"No mesh objects found in {args.input}")

    before = mesh_statistics(objects)
    # CLO exports can intentionally retain collapsed sewing-edge triangles.
    # Removing or decimating them opened visible seams in the sample catalog,
    # so the batch preserves topology and only repairs invalid runtime data.
    removed_faces = 0
    optimization = []
    preparation = prepare_meshes(objects, args.uv_margin)

    material_dir = Path(profile["material_dir"])
    material = material_helper.build_material(
        profile["material_name"],
        material_dir,
        profile["roughness"],
        profile["normal_strength"],
        "jpeg",
        profile["texture_repeat"],
        profile.get("texture_rotation", 0.0),
        profile["sheen"],
        profile["specular"],
    )
    assignment = material_helper.assign_materials(objects, material, None, 0, None)

    motion_reports = []
    motion_strength = float(profile.get("motion_strength", 0.0))
    motion_skipped_reason = None
    if motion_strength > 0 and before["triangles"] <= 250_000:
        for obj in objects:
            if len(obj.data.vertices) < 4:
                continue
            report = motion_helper.add_softness_shape_key(obj, motion_strength)
            report["object"] = obj.name
            report["animation"] = motion_helper.animate_shape_keys(obj, 8.0, 30)
            motion_reports.append(report)
    elif motion_strength > 0:
        motion_skipped_reason = "source exceeds 250000 triangles; morph target omitted to protect web payload size"

    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    if motion_reports:
        motion_helper.export_glb(args.output_glb)
        motion_helper.patch_sheen_extension(
            args.output_glb,
            profile["sheen"],
            profile["sheen_roughness"],
        )
    else:
        material_helper.export_glb(args.output_glb)
        material_helper.add_sheen_extension(
            args.output_glb,
            profile["sheen"],
            profile["sheen_roughness"],
        )

    args.output_svg.parent.mkdir(parents=True, exist_ok=True)
    svg_paths = uv_helper.export_svg(
        args.output_svg,
        objects,
        args.svg_size,
        args.min_svg_area,
        min_span=args.min_svg_span,
    )

    bpy.context.scene.frame_set(1)
    args.cover_dir.mkdir(parents=True, exist_ok=True)
    render_helper.tune_fabric_materials(objects)
    center, largest = render_helper.setup_scene(objects, True)
    # Filmic preserves pale textile detail under the bright studio rig instead
    # of clipping canvas and nylon panels to flat white.
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.view_settings.exposure = 0.7
    render_helper.render_view(
        args.cover_dir,
        center,
        largest,
        "cover",
        Vector((-0.42, -1.0, 0.16)),
    )

    result = {
        "input": str(args.input),
        "output_glb": str(args.output_glb),
        "output_svg": str(args.output_svg),
        "cover": str(args.cover_dir / "cover.png"),
        "profile": profile["key"],
        "before": before,
        "after": mesh_statistics(objects),
        "zero_area_faces_removed": removed_faces,
        "optimization": optimization,
        "uv": {**preparation, "svg_paths": svg_paths},
        "materials": assignment,
        "motion": motion_reports,
        "motion_skipped_reason": motion_skipped_reason,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

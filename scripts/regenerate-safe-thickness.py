#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy


@dataclass(frozen=True)
class Attempt:
    name: str
    ratio: float
    min_thickness: float
    max_thickness: float


ATTEMPTS = [
    Attempt("safe-medium", 0.0045, 0.004, 0.024),
    Attempt("safe-small", 0.0030, 0.003, 0.016),
    Attempt("safe-tiny", 0.0020, 0.002, 0.010),
]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_glb(path: Path) -> list[bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


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


def scene_stats(mesh_objects: list[bpy.types.Object]) -> dict[str, float]:
    verts = []
    max_edge = 0.0
    for obj in mesh_objects:
        mesh = obj.data
        obj_verts = [obj.matrix_world @ vert.co for vert in mesh.vertices]
        verts.extend(obj_verts)
        for edge in mesh.edges:
            a = obj_verts[edge.vertices[0]]
            b = obj_verts[edge.vertices[1]]
            max_edge = max(max_edge, (a - b).length)

    if not verts:
        return {"dim_x": 0.0, "dim_y": 0.0, "dim_z": 0.0, "largest": 0.0, "max_edge": 0.0}

    dims = [
        max(v[axis] for v in verts) - min(v[axis] for v in verts)
        for axis in range(3)
    ]
    return {
        "dim_x": dims[0],
        "dim_y": dims[1],
        "dim_z": dims[2],
        "largest": max(dims),
        "max_edge": max_edge,
    }


def ratio(a: float, b: float) -> float:
    return a / b if b else 0.0


def validate(thin: dict[str, float], thick: dict[str, float]) -> tuple[bool, str]:
    largest_ratio = ratio(thick["largest"], thin["largest"])
    axis_ratio = max(
        ratio(thick["dim_x"], thin["dim_x"]),
        ratio(thick["dim_y"], thin["dim_y"]),
        ratio(thick["dim_z"], thin["dim_z"]),
    )

    # True fabric thickness should barely change the garment's outer bounds.
    if largest_ratio > 1.18:
        return False, f"largest_ratio={largest_ratio:.4f}"
    if axis_ratio > 1.35:
        return False, f"axis_ratio={axis_ratio:.4f}"
    if thick["largest"] > thin["largest"] + 2.0:
        return False, f"absolute_growth={thick['largest'] - thin['largest']:.4f}"
    return True, f"largest_ratio={largest_ratio:.4f} axis_ratio={axis_ratio:.4f}"


def apply_safe_thickness(mesh_objects: list[bpy.types.Object], thickness: float) -> None:
    for obj in mesh_objects:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        solidify = obj.modifiers.new("Safe garment fabric thickness", "SOLIDIFY")
        solidify.thickness = thickness
        solidify.offset = 0
        solidify.use_even_offset = False
        solidify.use_quality_normals = False
        solidify.use_rim_only = False
        solidify.material_offset = 0
        solidify.material_offset_rim = 0
        bpy.ops.object.modifier_apply(modifier=solidify.name)

        weighted = obj.modifiers.new("Soft cloth edge normals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        weighted.weight = 25
        bpy.ops.object.modifier_apply(modifier=weighted.name)


def target_files(root: Path, report: Path | None, names: list[str]) -> list[Path]:
    if names:
        return [root / name for name in names]
    if not report:
        raise ValueError("Provide --report or explicit filenames")
    with report.open(newline="", encoding="utf-8") as file:
        rows = csv.DictReader(file)
        return [root / row["filename"] for row in rows if row.get("status") == "suspicious"]


def regenerate_one(path: Path, replace: bool) -> dict[str, str]:
    backup = path.with_name(f"{path.stem}.bak-thin{path.suffix}")
    if not backup.exists():
        return {"filename": path.name, "status": "missing_backup"}

    tmp = path.with_name(f"{path.stem}.tmp-safe-thick{path.suffix}")

    clear_scene()
    thin_objects = import_glb(backup)
    thin_stats = scene_stats(thin_objects)
    if not thin_objects:
        return {"filename": path.name, "status": "no_mesh"}

    last_reason = ""
    for attempt in ATTEMPTS:
        clear_scene()
        mesh_objects = import_glb(backup)
        largest = max(obj.dimensions[axis] for obj in mesh_objects for axis in range(3))
        thickness = max(attempt.min_thickness, min(attempt.max_thickness, largest * attempt.ratio))
        apply_safe_thickness(mesh_objects, thickness)
        thick_stats = scene_stats(mesh_objects)
        ok, reason = validate(thin_stats, thick_stats)
        last_reason = reason
        if ok:
            export_glb(tmp)
            if replace:
                tmp.replace(path)
            return {
                "filename": path.name,
                "status": "safe_thick",
                "attempt": attempt.name,
                "thickness": f"{thickness:.6f}",
                "reason": reason,
            }

    shutil.copy2(backup, tmp)
    if replace:
        tmp.replace(path)
    return {
        "filename": path.name,
        "status": "fallback_thin",
        "attempt": "none",
        "thickness": "0",
        "reason": last_reason,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate spiky thickened GLBs using safer Solidify settings.")
    parser.add_argument("root", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--output-report", type=Path, default=Path("safe-thickness-regenerate-report.csv"))
    parser.add_argument("--only-file", action="append", default=[])
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    files = target_files(args.root, args.report, args.only_file)
    rows = []
    print(f"target_count={len(files)}", flush=True)
    for index, path in enumerate(files, 1):
        try:
            row = regenerate_one(path, args.replace)
        except Exception as error:
            row = {"filename": path.name, "status": "error", "reason": str(error)}
        rows.append(row)
        print(f"[{index}/{len(files)}] {row}", flush=True)

    fieldnames = sorted({key for row in rows for key in row.keys()})
    with args.output_report.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"report={args.output_report}", flush=True)


if __name__ == "__main__":
    main()

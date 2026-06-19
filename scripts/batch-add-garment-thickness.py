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


def import_glb(path: Path) -> None:
    bpy.ops.import_scene.gltf(filepath=str(path))


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


def add_thickness(mesh_objects: list[bpy.types.Object], thickness: float) -> None:
    for obj in mesh_objects:
        bpy.ops.object.select_all(action="DESELECT")
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


def process_file(path: Path, output: Path, ratio: float, min_thickness: float, max_thickness: float) -> str:
    clear_scene()
    import_glb(path)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        return f"SKIP no-mesh {path}"
    largest = max(obj.dimensions[axis] for obj in mesh_objects for axis in range(3))
    thickness = max(min_thickness, min(max_thickness, largest * ratio))
    add_thickness(mesh_objects, thickness)
    output.parent.mkdir(parents=True, exist_ok=True)
    export_glb(output)
    return f"OK {path} -> {output} thickness={thickness:.6f} meshes={len(mesh_objects)}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch create thickened garment GLBs without overwriting originals.")
    parser.add_argument("root", type=Path)
    parser.add_argument("--suffix", default="-thick")
    parser.add_argument("--replace", action="store_true", help="Replace original GLBs after writing .bak-thin.glb backups.")
    parser.add_argument("--backup-suffix", default=".bak-thin")
    parser.add_argument("--ratio", type=float, default=0.0065)
    parser.add_argument("--min", dest="min_thickness", type=float, default=0.008)
    parser.add_argument("--max", dest="max_thickness", type=float, default=0.032)
    parser.add_argument("--limit", type=int, default=0)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    files = sorted(
        path
        for path in args.root.rglob("*.glb")
        if not path.stem.endswith(args.suffix)
        and args.backup_suffix not in path.stem
        and ".tmp-" not in path.stem
    )
    if args.limit:
        files = files[: args.limit]
    print(f"batch_count={len(files)}", flush=True)
    for index, path in enumerate(files, 1):
        backup = path.with_name(f"{path.stem}{args.backup_suffix}{path.suffix}")
        source = backup if args.replace and backup.exists() else path
        output = path.with_name(f"{path.stem}{args.suffix}{path.suffix}")
        if args.replace:
            output = path.with_name(f"{path.stem}.tmp-thick{path.suffix}")
        try:
            message = process_file(source, output, args.ratio, args.min_thickness, args.max_thickness)
            if args.replace:
                if not backup.exists():
                    path.replace(backup)
                output.replace(path)
                message = f"{message} REPLACED original={path} backup={backup}"
            print(f"[{index}/{len(files)}] {message}", flush=True)
        except Exception as error:
            print(f"[{index}/{len(files)}] ERROR {path}: {error}", flush=True)


if __name__ == "__main__":
    main()

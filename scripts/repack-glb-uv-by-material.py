#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

import bpy


def read_glb_document(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"Unsupported GLB: {path}")
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            return json.loads(chunk.rstrip(b"\x00 \t\r\n"))
    raise ValueError(f"Missing GLB JSON chunk: {path}")


def patch_material_extensions(path: Path, source_document: dict[str, object]) -> None:
    data = path.read_bytes()
    chunks: list[tuple[int, bytes]] = []
    document = None
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.rstrip(b"\x00 \t\r\n"))
        else:
            chunks.append((chunk_type, chunk))
    if document is None:
        raise ValueError(f"Missing GLB JSON chunk: {path}")

    source_materials = source_document.get("materials", [])
    for index, material in enumerate(document.get("materials", [])):
        if index >= len(source_materials):
            continue
        extensions = source_materials[index].get("extensions")
        if extensions:
            material["extensions"] = extensions
    for key in ("extensionsUsed", "extensionsRequired"):
        values = source_document.get(key)
        if values:
            document[key] = values

    json_chunk = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    output_chunks = [(0x4E4F534A, json_chunk), *chunks]
    total_length = 12 + sum(8 + len(chunk) for _kind, chunk in output_chunks)
    payload = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    for chunk_type, chunk in output_chunks:
        payload.extend(struct.pack("<II", len(chunk), chunk_type))
        payload.extend(chunk)
    path.write_bytes(payload)


def pack_material(obj: bpy.types.Object, material_index: int, margin: float) -> int:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="OBJECT")
    selected = 0
    for polygon in obj.data.polygons:
        polygon.select = polygon.material_index == material_index
        selected += int(polygon.select)
    if not selected:
        return 0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=False, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return selected


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=True,
        export_frame_range=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Repack existing GLB UV islands separately per material.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--material-indices", default="0")
    parser.add_argument("--margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=22)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    source_document = read_glb_document(args.input)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    indices = [int(value.strip()) for value in args.material_indices.split(",") if value.strip()]
    report: dict[str, object] = {"input": str(args.input), "output": str(args.output), "materials": {}}
    for material_index in indices:
        report["materials"][str(material_index)] = sum(
            pack_material(obj, material_index, args.margin) for obj in objects
        )
    export_glb(args.output, args.position_quantization)
    patch_material_extensions(args.output, source_document)
    report.update({"objects": len(objects), "margin": args.margin, "position_quantization": args.position_quantization})
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

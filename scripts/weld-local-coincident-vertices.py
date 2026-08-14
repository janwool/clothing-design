#!/usr/bin/env python3
"""Weld coincident vertices only inside an explicit local bounding box."""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

import bpy
import bmesh


def connected_components(bm):
    bm.faces.ensure_lookup_table()
    unseen = set(bm.faces)
    components = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        faces = {seed}
        while stack:
            face = stack.pop()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unseen:
                        unseen.remove(linked)
                        faces.add(linked)
                        stack.append(linked)
        components.append(faces)
    components.sort(key=lambda faces: min(face.index for face in faces))
    return components


def parse_vec(value: str):
    result = tuple(float(item) for item in value.split(","))
    if len(result) != 3:
        raise ValueError("Expected x,y,z")
    return result


def add_sheen_extension(path: Path, sheen: float, sheen_roughness: float) -> None:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"Unsupported GLB: {path}")
    chunks = []
    document = None
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk_data = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk_data.rstrip(b"\x00 \t\r\n"))
        else:
            chunks.append((chunk_type, chunk_data))
    if document is None:
        raise ValueError("Missing GLB JSON chunk")
    used = document.setdefault("extensionsUsed", [])
    if "KHR_materials_sheen" not in used:
        used.append("KHR_materials_sheen")
    for material in document.get("materials", []):
        material.setdefault("extensions", {})["KHR_materials_sheen"] = {
            "sheenColorFactor": [sheen, sheen, sheen],
            "sheenRoughnessFactor": sheen_roughness,
        }
    json_data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_data += b" " * ((4 - len(json_data) % 4) % 4)
    output_chunks = [(0x4E4F534A, json_data), *chunks]
    total = 12 + sum(8 + len(chunk) for _, chunk in output_chunks)
    payload = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    for chunk_type, chunk in output_chunks:
        payload.extend(struct.pack("<II", len(chunk), chunk_type))
        payload.extend(chunk)
    path.write_bytes(payload)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--minimum", required=True)
    parser.add_argument("--maximum", required=True)
    parser.add_argument("--distance", type=float, default=1e-5)
    parser.add_argument("--component", type=int)
    parser.add_argument("--clear-custom-normals", action="store_true")
    parser.add_argument("--add-sheen", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=22)
    parser.add_argument("--sheen", type=float, default=0.17)
    parser.add_argument("--sheen-roughness", type=float, default=0.88)
    args = parser.parse_args(argv)
    minimum = parse_vec(args.minimum)
    maximum = parse_vec(args.maximum)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    components = connected_components(bm)
    allowed_vertices = None
    if args.component is not None:
        if not 0 <= args.component < len(components):
            raise ValueError(f"Component {args.component} outside 0..{len(components) - 1}")
        allowed_vertices = {
            vertex for face in components[args.component] for vertex in face.verts
        }
    before_vertices = len(bm.verts)
    boundary_before = sum(1 for edge in bm.edges if edge.is_boundary)
    candidates = [
        vertex
        for vertex in bm.verts
        if allowed_vertices is None or vertex in allowed_vertices
        if all(minimum[axis] <= vertex.co[axis] <= maximum[axis] for axis in range(3))
    ]
    bmesh.ops.remove_doubles(bm, verts=candidates, dist=args.distance)
    bm.normal_update()
    after_vertices = len(bm.verts)
    report = {
        "bbox": [*minimum, *maximum],
        "component": args.component,
        "candidate_vertices": len(candidates),
        "vertices_welded": before_vertices - after_vertices,
        "boundary_edges_before": boundary_before,
        "boundary_edges_after": sum(1 for edge in bm.edges if edge.is_boundary),
        "nonmanifold_edges_after": sum(1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary),
        "zero_area_faces_after": sum(1 for face in bm.faces if face.calc_area() <= 1e-12),
    }
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if args.clear_custom_normals and obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    if args.add_sheen:
        add_sheen_extension(args.output, args.sheen, args.sheen_roughness)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

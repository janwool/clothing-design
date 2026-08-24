#!/usr/bin/env python3
"""Add restrained cloth drape and folds directly to a decompressed T-shirt GLB.

Only POSITION, NORMAL, and corresponding morph-target accessors are rewritten.
Indices, UVs, materials, textures, extensions, nodes, and animation channels are
left intact, which keeps the browser editor's UV atlas one-to-one.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from typing import Iterable


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
COMPONENT_FORMATS = {
    5121: ("B", 1),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def gaussian(value: float, center: float, width: float) -> float:
    offset = (value - center) / width
    return math.exp(-(offset * offset))


def add(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return a[0] + b[0], a[1] + b[1], a[2] + b[2]


def subtract(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return a[0] - b[0], a[1] - b[1], a[2] - b[2]


def cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def normalize(value: tuple[float, float, float]) -> tuple[float, float, float]:
    length = math.sqrt(value[0] ** 2 + value[1] ** 2 + value[2] ** 2)
    if length <= 1e-12:
        return 0.0, 0.0, 1.0
    return value[0] / length, value[1] / length, value[2] / length


def orient_normals(
    calculated: list[tuple[float, float, float]],
    references: list[tuple[float, float, float]],
) -> list[tuple[float, float, float]]:
    oriented = []
    for normal, reference in zip(calculated, references):
        dot = sum(normal[axis] * reference[axis] for axis in range(3))
        oriented.append(tuple(-value for value in normal) if dot < 0 else normal)
    return oriented


def load_glb(path: Path) -> tuple[dict, bytearray]:
    payload = path.read_bytes()
    if len(payload) < 20 or payload[:4] != b"glTF":
        raise ValueError(f"Not a GLB file: {path}")
    version, declared_length = struct.unpack_from("<II", payload, 4)
    if version != 2 or declared_length != len(payload):
        raise ValueError("Only valid glTF 2.0 binary files are supported")

    document = None
    binary = None
    offset = 12
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        chunk = payload[offset + 8 : offset + 8 + chunk_length]
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.rstrip(b"\x00 \t\r\n").decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            binary = bytearray(chunk)
        offset += 8 + chunk_length
    if document is None or binary is None:
        raise ValueError("GLB must contain JSON and BIN chunks")
    if "KHR_draco_mesh_compression" in document.get("extensionsUsed", []):
        raise ValueError("Input must be decompressed first (gltf-transform cp input.glb output.glb)")
    return document, binary


def save_glb(path: Path, document: dict, binary: bytearray) -> None:
    document["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(binary) + b"\x00" * ((4 - len(binary) % 4) % 4)
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    payload = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    payload.extend(struct.pack("<II", len(json_bytes), JSON_CHUNK))
    payload.extend(json_bytes)
    payload.extend(struct.pack("<II", len(bin_bytes), BIN_CHUNK))
    payload.extend(bin_bytes)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def accessor_layout(document: dict, accessor_index: int) -> tuple[dict, int, int, str]:
    accessor = document["accessors"][accessor_index]
    if accessor.get("sparse"):
        raise ValueError("Sparse accessors are not supported")
    view = document["bufferViews"][accessor["bufferView"]]
    component_format, component_size = COMPONENT_FORMATS[accessor["componentType"]]
    component_count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    stride = view.get("byteStride", component_size * component_count)
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return accessor, offset, stride, "<" + component_format * component_count


def read_accessor(document: dict, binary: bytearray, accessor_index: int) -> list[tuple]:
    accessor, offset, stride, value_format = accessor_layout(document, accessor_index)
    return [struct.unpack_from(value_format, binary, offset + index * stride) for index in range(accessor["count"])]


def write_accessor(document: dict, binary: bytearray, accessor_index: int, values: Iterable[tuple]) -> None:
    accessor, offset, stride, value_format = accessor_layout(document, accessor_index)
    rows = list(values)
    if len(rows) != accessor["count"]:
        raise ValueError(f"Accessor {accessor_index} count changed")
    for index, value in enumerate(rows):
        struct.pack_into(value_format, binary, offset + index * stride, *value)


def update_bounds(document: dict, accessor_index: int, values: list[tuple[float, float, float]]) -> None:
    accessor = document["accessors"][accessor_index]
    accessor["min"] = [min(value[axis] for value in values) for axis in range(3)]
    accessor["max"] = [max(value[axis] for value in values) for axis in range(3)]


def accessor_bytes(document: dict, binary: bytearray, accessor_index: int) -> bytes:
    accessor, offset, stride, value_format = accessor_layout(document, accessor_index)
    value_size = struct.calcsize(value_format)
    return b"".join(binary[offset + index * stride : offset + index * stride + value_size] for index in range(accessor["count"]))


def calculate_normals(
    positions: list[tuple[float, float, float]],
    indices: list[int],
) -> list[tuple[float, float, float]]:
    accumulators = [[0.0, 0.0, 0.0] for _ in positions]
    for start in range(0, len(indices) - 2, 3):
        ia, ib, ic = indices[start : start + 3]
        edge_ab = subtract(positions[ib], positions[ia])
        edge_ac = subtract(positions[ic], positions[ia])
        face = cross(edge_ab, edge_ac)
        for index in (ia, ib, ic):
            accumulators[index][0] += face[0]
            accumulators[index][1] += face[1]
            accumulators[index][2] += face[2]
    return [normalize(tuple(value)) for value in accumulators]


def deformation(
    coordinate: tuple[float, float, float],
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
    strength: float,
    detail_weight: float,
) -> tuple[float, float, float]:
    size = tuple(max(maximum[axis] - minimum[axis], 1e-6) for axis in range(3))
    center = tuple((minimum[axis] + maximum[axis]) * 0.5 for axis in range(3))
    half_width, half_depth, height = size[0] * 0.5, size[1] * 0.5, size[2]
    x, y, z = coordinate
    nx = (x - center[0]) / half_width
    # The source asset is authored Z-down before its node rotation converts it
    # to glTF Y-up: minimum Z is the neckline, maximum Z is the hem.
    nz = (maximum[2] - z) / height
    abs_x = abs(nx)
    depth_side = -1.0 if y < center[1] else 1.0
    depth_surface = smoothstep(0.10, 0.38, abs(y - center[1]) / half_depth)

    torso = (1.0 - smoothstep(0.50, 0.72, abs_x)) * smoothstep(0.015, 0.10, nz)
    torso *= 1.0 - smoothstep(0.77, 0.91, nz)
    sleeve = smoothstep(0.48, 0.72, abs_x) * smoothstep(0.58, 0.80, nz)
    sleeve *= 1.0 - smoothstep(0.91, 1.0, nz)
    shoulder = smoothstep(0.70, 0.92, nz) * smoothstep(0.20, 0.78, abs_x)
    hem = 1.0 - smoothstep(0.025, 0.16, nz)
    lower_body = torso * (1.0 - smoothstep(0.62, 0.78, nz))

    waist_taper = 0.035 * gaussian(nz, 0.39, 0.18) * (1.0 - smoothstep(0.48, 0.68, abs_x))
    hem_release = 0.010 * hem * (1.0 - smoothstep(0.50, 0.68, abs_x))
    dx = -x * waist_taper + x * hem_release

    dz = height * strength * (
        0.030 * shoulder * smoothstep(0.45, 0.95, abs_x)
        + 0.028 * sleeve * smoothstep(0.58, 0.98, abs_x)
    )
    dz += height * strength * hem * torso * (
        0.0120 * math.sin(nx * math.pi * 3.6 + 0.35)
        + 0.0050 * math.sin(nx * math.pi * 7.1 - 0.8)
    )

    vertical_phase = nx * math.pi * 5.2 + 0.48 * math.sin(nz * math.pi * 1.7)
    vertical_fold = math.sin(vertical_phase) + 0.42 * math.sin(nx * math.pi * 8.3 - 0.55)
    depth_offset = half_depth * strength * 0.120 * lower_body * vertical_fold
    depth_offset += half_depth * strength * 0.050 * lower_body * math.cos(nx * math.pi * 2.2 + nz * 1.4)

    underarm_band = gaussian(abs_x, 0.54, 0.15) * gaussian(nz, 0.61, 0.20)
    diagonal_phase = 24.0 * (nz - 0.54 + 0.48 * (abs_x - 0.52))
    depth_offset += half_depth * strength * 0.075 * underarm_band * math.sin(diagonal_phase)
    depth_offset += half_depth * strength * 0.050 * torso * gaussian(nz, 0.34, 0.22)
    depth_offset += half_depth * strength * 0.075 * hem * torso * math.sin(nx * math.pi * 4.4 - 0.25)
    sleeve_phase = 17.0 * (nz - 0.69) + nx * math.pi * 2.1
    depth_offset += half_depth * strength * 0.060 * sleeve * math.sin(sleeve_phase)

    dy = depth_side * depth_surface * depth_offset
    return dx * detail_weight, dy * detail_weight, dz * detail_weight


def magnitude(value: tuple[float, float, float]) -> float:
    return math.sqrt(sum(component * component for component in value))


def remesh(document: dict, binary: bytearray, strength: float) -> dict:
    meshes = document.get("meshes", [])
    primitives = [(mesh, primitive) for mesh in meshes for primitive in mesh.get("primitives", [])]
    all_positions = [
        position
        for _mesh, primitive in primitives
        for position in read_accessor(document, binary, primitive["attributes"]["POSITION"])
    ]
    minimum = tuple(min(position[axis] for position in all_positions) for axis in range(3))
    maximum = tuple(max(position[axis] for position in all_positions) for axis in range(3))
    reports = []

    for primitive_index, (mesh, primitive) in enumerate(primitives):
        material_index = primitive.get("material")
        material_name = document.get("materials", [{}])[material_index].get("name", "") if material_index is not None else ""
        # The collar is a separate primitive but shares the neckline boundary.
        # It must receive the same continuous field or the two surfaces separate.
        detail_weight = 1.0
        position_index = primitive["attributes"]["POSITION"]
        normal_index = primitive["attributes"].get("NORMAL")
        uv_index = primitive["attributes"].get("TEXCOORD_0")
        index_index = primitive.get("indices")
        if normal_index is None or index_index is None:
            raise ValueError("Every primitive must provide NORMAL and indexed triangle geometry")

        original_positions = [tuple(value) for value in read_accessor(document, binary, position_index)]
        original_normals = [tuple(value) for value in read_accessor(document, binary, normal_index)]
        indices = [int(value[0]) for value in read_accessor(document, binary, index_index)]
        uv_hash_before = hashlib.sha256(accessor_bytes(document, binary, uv_index)).hexdigest() if uv_index is not None else None
        index_hash_before = hashlib.sha256(accessor_bytes(document, binary, index_index)).hexdigest()
        deltas = [deformation(value, minimum, maximum, strength, detail_weight) for value in original_positions]
        deformed_positions = [add(value, delta) for value, delta in zip(original_positions, deltas)]
        deformed_normals = orient_normals(calculate_normals(deformed_positions, indices), original_normals)
        write_accessor(document, binary, position_index, deformed_positions)
        write_accessor(document, binary, normal_index, deformed_normals)
        update_bounds(document, position_index, deformed_positions)

        morph_reports = []
        for target in primitive.get("targets", []):
            morph_position_index = target.get("POSITION")
            morph_normal_index = target.get("NORMAL")
            if morph_position_index is None:
                continue
            original_morph_deltas = [tuple(value) for value in read_accessor(document, binary, morph_position_index)]
            original_target_positions = [add(base, delta) for base, delta in zip(original_positions, original_morph_deltas)]
            target_positions = [
                add(value, deformation(value, minimum, maximum, strength, detail_weight))
                for value in original_target_positions
            ]
            new_morph_deltas = [subtract(target, base) for target, base in zip(target_positions, deformed_positions)]
            write_accessor(document, binary, morph_position_index, new_morph_deltas)
            update_bounds(document, morph_position_index, new_morph_deltas)
            if morph_normal_index is not None:
                original_morph_normal_deltas = [
                    tuple(value) for value in read_accessor(document, binary, morph_normal_index)
                ]
                original_target_normals = [
                    normalize(add(base, delta))
                    for base, delta in zip(original_normals, original_morph_normal_deltas)
                ]
                target_normals = orient_normals(
                    calculate_normals(target_positions, indices),
                    original_target_normals,
                )
                morph_normal_deltas = [subtract(target, base) for target, base in zip(target_normals, deformed_normals)]
                write_accessor(document, binary, morph_normal_index, morph_normal_deltas)
            morph_reports.append({
                "vertices": len(new_morph_deltas),
                "maximum_position_delta": round(max(map(magnitude, new_morph_deltas)), 7),
            })

        uv_hash_after = hashlib.sha256(accessor_bytes(document, binary, uv_index)).hexdigest() if uv_index is not None else None
        index_hash_after = hashlib.sha256(accessor_bytes(document, binary, index_index)).hexdigest()
        reports.append({
            "mesh": mesh.get("name"),
            "primitive": primitive_index,
            "material": material_name,
            "vertices": len(deformed_positions),
            "triangles": len(indices) // 3,
            "detail_weight": detail_weight,
            "mean_displacement": round(sum(map(magnitude, deltas)) / max(len(deltas), 1), 7),
            "maximum_displacement": round(max(map(magnitude, deltas)), 7),
            "uv_unchanged": uv_hash_before == uv_hash_after,
            "indices_unchanged": index_hash_before == index_hash_after,
            "morph_targets": morph_reports,
        })

    return {
        "bounds_before": {"minimum": minimum, "maximum": maximum},
        "animations": len(document.get("animations", [])),
        "materials": len(document.get("materials", [])),
        "primitives": reports,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Add realistic drape to a decompressed T-shirt GLB while preserving UVs.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--strength", type=float, default=1.0)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if not 0.0 < args.strength <= 2.0:
        raise ValueError("--strength must be greater than 0 and no more than 2")

    document, binary = load_glb(args.input)
    report = remesh(document, binary, args.strength)
    save_glb(args.output, document, binary)
    report.update({
        "input": str(args.input.resolve()),
        "output": str(args.output.resolve()),
        "strength": args.strength,
        "output_bytes": args.output.stat().st_size,
    })
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    print(payload)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(payload + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

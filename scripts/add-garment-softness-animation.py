#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return float(value >= edge1)
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def add_softness_shape_key(
    obj: bpy.types.Object,
    strength: float,
    vertical_axis_override: int | None = None,
    depth_axis_override: int | None = None,
) -> dict[str, float]:
    mesh = obj.data
    if mesh.shape_keys:
        obj.shape_key_clear()
    basis = obj.shape_key_add(name="Basis", from_mix=False)
    flow = obj.shape_key_add(name="Fabric flow", from_mix=False)
    flow.slider_min = -1.0
    flow.slider_max = 1.0

    values = [[vertex.co[axis] for vertex in mesh.vertices] for axis in range(3)]
    minimums = [min(axis_values) for axis_values in values]
    maximums = [max(axis_values) for axis_values in values]
    extents = [maximums[axis] - minimums[axis] for axis in range(3)]
    vertical_axis = (
        vertical_axis_override
        if vertical_axis_override is not None
        else max(range(3), key=lambda axis: extents[axis])
    )
    depth_axis = (
        depth_axis_override
        if depth_axis_override is not None
        else min(
            (axis for axis in range(3) if axis != vertical_axis),
            key=lambda axis: extents[axis],
        )
    )
    if vertical_axis == depth_axis:
        raise ValueError("Vertical and depth axes must be different")
    horizontal_axis = next(axis for axis in range(3) if axis not in {vertical_axis, depth_axis})
    width = extents[horizontal_axis]
    depth = extents[depth_axis]
    height = extents[vertical_axis]
    center_x = (minimums[horizontal_axis] + maximums[horizontal_axis]) * 0.5
    center_y = (minimums[depth_axis] + maximums[depth_axis]) * 0.5
    half_width = max(width * 0.5, 1e-6)
    amplitude = height * strength
    displaced = 0
    maximum_offset = 0.0

    for index, vertex in enumerate(mesh.vertices):
        coordinate = basis.data[index].co
        horizontal = (coordinate[horizontal_axis] - center_x) / half_width
        vertical = (coordinate[vertical_axis] - minimums[vertical_axis]) / max(height, 1e-6)
        depth_position = (coordinate[depth_axis] - center_y) / max(depth, 1e-6)

        hem = 1.0 - smoothstep(0.0, 0.32, vertical)
        sleeve_outward = smoothstep(0.53, 0.94, abs(horizontal))
        sleeve_height = smoothstep(0.28, 0.5, vertical) * (1.0 - smoothstep(0.73, 0.91, vertical))
        sleeve = sleeve_outward * sleeve_height
        free_edge = max(hem, sleeve)
        if free_edge <= 1e-5:
            continue

        phase = horizontal * math.pi * 0.9
        side = -1.0 if horizontal < 0 else 1.0
        depth_bias = 0.72 + 0.28 * (1.0 - abs(depth_position))

        offset_x = amplitude * (0.18 * hem * math.cos(phase) + 0.11 * sleeve * side)
        offset_y = amplitude * depth_bias * (
            0.78 * hem * math.sin(phase + 0.45) + 1.05 * sleeve * side
        )
        offset_z = amplitude * (
            0.16 * hem * math.cos(phase * 1.35) - 0.2 * sleeve * (0.6 + 0.4 * abs(horizontal))
        )
        flow.data[index].co = coordinate.copy()
        flow.data[index].co[horizontal_axis] += offset_x
        flow.data[index].co[depth_axis] += offset_y
        flow.data[index].co[vertical_axis] += offset_z
        offset_length = math.sqrt(offset_x * offset_x + offset_y * offset_y + offset_z * offset_z)
        maximum_offset = max(maximum_offset, offset_length)
        displaced += 1

    return {
        "vertices": len(mesh.vertices),
        "displaced_vertices": displaced,
        "max_offset": round(maximum_offset, 6),
        "relative_strength": strength,
        "axes": {
            "horizontal": "XYZ"[horizontal_axis],
            "vertical": "XYZ"[vertical_axis],
            "depth": "XYZ"[depth_axis],
        },
    }


def animate_shape_keys(obj: bpy.types.Object, duration_seconds: float, fps: int) -> str:
    shape_keys = obj.data.shape_keys
    flow = shape_keys.key_blocks.get("Fabric flow")
    if flow is None:
        raise RuntimeError("Fabric flow shape key was not created")

    action_name = "Fabric breeze"
    action = bpy.data.actions.new(action_name)
    shape_keys.animation_data_create()
    shape_keys.animation_data.action = action
    total_frames = max(96, round(duration_seconds * fps))
    keyframes = [
        (1, 0.0),
        (round(total_frames * 0.125), 0.72),
        (round(total_frames * 0.25), 1.0),
        (round(total_frames * 0.375), 0.72),
        (round(total_frames * 0.5), 0.0),
        (round(total_frames * 0.625), -0.72),
        (round(total_frames * 0.75), -1.0),
        (round(total_frames * 0.875), -0.72),
        (total_frames + 1, 0.0),
    ]
    for frame, value in keyframes:
        flow.value = value
        flow.keyframe_insert(data_path="value", frame=frame, group="Soft garment motion")
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "SINE"
            point.easing = "EASE_IN_OUT"

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = total_frames + 1
    bpy.context.scene.render.fps = fps
    return action_name


def patch_sheen_extension(path: Path, sheen: float, sheen_roughness: float) -> None:
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
        raise ValueError(f"Missing GLB JSON chunk: {path}")

    extensions_used = document.setdefault("extensionsUsed", [])
    if "KHR_materials_sheen" not in extensions_used:
        extensions_used.append("KHR_materials_sheen")
    for material in document.get("materials", []):
        material.setdefault("extensions", {})["KHR_materials_sheen"] = {
            "sheenColorFactor": [sheen, sheen, sheen],
            "sheenRoughnessFactor": sheen_roughness,
        }

    json_data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_data += b" " * ((4 - len(json_data) % 4) % 4)
    output_chunks = [(0x4E4F534A, json_data), *chunks]
    total_length = 12 + sum(8 + len(chunk_data) for _, chunk_data in output_chunks)
    payload = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    for chunk_type, chunk_data in output_chunks:
        payload.extend(struct.pack("<II", len(chunk_data), chunk_type))
        payload.extend(chunk_data)
    path.write_bytes(payload)


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
    parser = argparse.ArgumentParser(description="Add a subtle looping fabric-motion morph animation to a garment GLB.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--strength", type=float, default=0.006)
    parser.add_argument("--duration", type=float, default=8.0)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--sheen", type=float, default=0.08)
    parser.add_argument("--sheen-roughness", type=float, default=0.9)
    parser.add_argument("--position-quantization", type=int, default=14)
    parser.add_argument("--vertical-axis", choices=("x", "y", "z"))
    parser.add_argument("--depth-axis", choices=("x", "y", "z"))
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")

    reports = []
    axis_indices = {"x": 0, "y": 1, "z": 2}
    vertical_axis = axis_indices.get(args.vertical_axis) if args.vertical_axis else None
    depth_axis = axis_indices.get(args.depth_axis) if args.depth_axis else None
    if vertical_axis is not None and depth_axis is None:
        depth_axis = min(
            (axis for axis in range(3) if axis != vertical_axis),
            key=lambda axis: max(
                vertex.co[axis]
                for obj in objects
                for vertex in obj.data.vertices
            )
            - min(
                vertex.co[axis]
                for obj in objects
                for vertex in obj.data.vertices
            ),
        )
    for obj in objects:
        report = add_softness_shape_key(
            obj,
            args.strength,
            vertical_axis_override=vertical_axis,
            depth_axis_override=depth_axis,
        )
        report["object"] = obj.name
        report["animation"] = animate_shape_keys(obj, args.duration, args.fps)
        reports.append(report)

    export_glb(args.output, args.position_quantization)
    patch_sheen_extension(args.output, args.sheen, args.sheen_roughness)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "duration_seconds": args.duration,
                "fps": args.fps,
                "position_quantization": args.position_quantization,
                "objects": reports,
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

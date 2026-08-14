#!/usr/bin/env python3
"""Rebuild one upright UV layout per connected garment panel component."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


def connected_face_components(mesh):
    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        for edge in polygon.edge_keys:
            edge_faces[edge].append(polygon.index)
    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components = []
    visited = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for neighbor in neighbors[face]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return components


def qpoint(uv, precision=6):
    scale = 10**precision
    return round(uv[0] * scale), round(uv[1] * scale)


def uv_islands(mesh):
    uv_layer = mesh.uv_layers.active
    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, loop_index in enumerate(loops):
            following = loops[(index + 1) % len(loops)]
            key = tuple(sorted((mesh.loops[loop_index].vertex_index, mesh.loops[following].vertex_index)))
            edge_faces[key].append(
                (
                    polygon.index,
                    qpoint(uv_layer.data[loop_index].uv),
                    qpoint(uv_layer.data[following].uv),
                )
            )
    neighbors = defaultdict(set)
    for entries in edge_faces.values():
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        if (a0 == b0 and a1 == b1) or (a0 == b1 and a1 == b0):
            neighbors[face_a].add(face_b)
            neighbors[face_b].add(face_a)
    islands = []
    visited = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        island = []
        while queue:
            face = queue.popleft()
            island.append(face)
            for neighbor in neighbors[face]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        islands.append(island)
    return islands


def orient_islands_upright(mesh):
    uv_layer = mesh.uv_layers.active
    rows = []
    for island_index, faces in enumerate(uv_islands(mesh)):
        loop_indices = [loop for face in faces for loop in mesh.polygons[face].loop_indices]
        samples = [
            (
                mesh.vertices[mesh.loops[loop].vertex_index].co.y,
                uv_layer.data[loop].uv.copy(),
            )
            for loop in loop_indices
        ]
        mean_y = sum(y for y, _uv in samples) / len(samples)
        mean_u = sum(uv.x for _y, uv in samples) / len(samples)
        mean_v = sum(uv.y for _y, uv in samples) / len(samples)
        covariance_u = sum((y - mean_y) * (uv.x - mean_u) for y, uv in samples)
        covariance_v = sum((y - mean_y) * (uv.y - mean_v) for y, uv in samples)
        magnitude = math.hypot(covariance_u, covariance_v)
        angle = 0.0
        if magnitude > 1e-10:
            angle = math.pi / 2.0 - math.atan2(covariance_v, covariance_u)
            cosine = math.cos(angle)
            sine = math.sin(angle)
            for loop in loop_indices:
                uv = uv_layer.data[loop].uv
                x = uv.x - mean_u
                y = uv.y - mean_v
                uv.x = mean_u + x * cosine - y * sine
                uv.y = mean_v + x * sine + y * cosine
        rows.append(
            {
                "island": island_index,
                "faces": len(faces),
                "rotation_degrees": round(math.degrees(angle), 4),
            }
        )
    return rows


def export_glb(path, position_quantization):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
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


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=18)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]
    mesh = obj.data
    component_count = len(connected_face_components(mesh))
    for edge in mesh.edges:
        edge.use_seam = False

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", fill_holes=True, correct_aspect=True, margin=0.001)
    bpy.ops.object.mode_set(mode="OBJECT")
    invalid_uv_loops = sum(
        not math.isfinite(item.uv.x) or not math.isfinite(item.uv.y)
        for item in mesh.uv_layers.active.data
    )
    smart_project_fallback = invalid_uv_loops > 0
    if smart_project_fallback:
        while mesh.uv_layers:
            mesh.uv_layers.remove(mesh.uv_layers[0])
        mesh.uv_layers.new(name="Garment UV")
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(
            angle_limit=math.radians(66.0),
            island_margin=0.001,
        )
        bpy.ops.object.mode_set(mode="OBJECT")
    orientation_rows = orient_islands_upright(mesh)
    islands_before_pack = len(orientation_rows)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=False, margin=args.margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    islands_after_pack = len(uv_islands(mesh))
    export_glb(args.output, args.position_quantization)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "connected_components": component_count,
        "uv_islands_before_pack": islands_before_pack,
        "uv_islands_after_pack": islands_after_pack,
        "margin": args.margin,
        "position_quantization": args.position_quantization,
        "orientation": orientation_rows,
        "invalid_uv_loops_after_unwrap": invalid_uv_loops,
        "smart_project_fallback": smart_project_fallback,
        "geometry_changed": False,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Repair the self-intersecting front-neck keeper on underwear model 04.

The source garment is otherwise closed.  Component 41 is a dense folded solid
with 103 same-component triangle intersections.  This script removes only that
component, relaxes the explicitly diagnosed flexible strap components, and
rebuilds the keeper at its measured source bounds as a closed rounded rectangle.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh


FLEXIBLE_COMPONENTS = {0, 1, 2, 3, 14, 15, *range(26, 41)}
BAD_KEEPER_COMPONENT = 41


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components: list[list[int]] = []
    visited: set[int] = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        component: list[int] = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def remove_component(obj: bpy.types.Object, component_index: int) -> int:
    components = face_components(obj.data)
    faces = set(components[component_index])
    for vertex in obj.data.vertices:
        vertex.select = False
    for edge in obj.data.edges:
        edge.select = False
    for polygon in obj.data.polygons:
        polygon.select = polygon.index in faces
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    return len(faces)


def relax_flexible_components(obj: bpy.types.Object, factor: float, iterations: int) -> int:
    components = face_components(obj.data)
    selected_vertices = sorted(
        {
            vertex_index
            for component_index in FLEXIBLE_COMPONENTS
            for face_index in components[component_index]
            for vertex_index in obj.data.polygons[face_index].vertices
        }
    )
    group = obj.vertex_groups.new(name="Longline flexible straps")
    group.add(selected_vertices, 1.0, "REPLACE")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("Longline strap relaxation", "LAPLACIANSMOOTH")
    modifier.vertex_group = group.name
    modifier.lambda_factor = factor
    modifier.lambda_border = 0.0
    modifier.iterations = iterations
    modifier.use_volume_preserve = True
    modifier.use_normalized = True
    modifier.use_x = True
    modifier.use_y = True
    modifier.use_z = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    remaining = obj.vertex_groups.get(group.name)
    if remaining is not None:
        obj.vertex_groups.remove(remaining)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    return len(selected_vertices)


def rounded_rectangle(half_y: float, half_z: float, radius: float, segments: int) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    corners = (
        (half_y - radius, half_z - radius, 0.0),
        (-half_y + radius, half_z - radius, 90.0),
        (-half_y + radius, -half_z + radius, 180.0),
        (half_y - radius, -half_z + radius, 270.0),
    )
    for center_y, center_z, start_angle in corners:
        for step in range(segments):
            angle = math.radians(start_angle + step * 90.0 / segments)
            points.append((center_y + math.cos(angle) * radius, center_z + math.sin(angle) * radius))
    return points


def build_keeper(source_obj: bpy.types.Object) -> bpy.types.Object:
    center_x, center_y, center_z = -0.003741, 2.005227, 0.074440
    half_x, half_y, half_z = 0.052591, 0.067084, 0.078438
    wall = 0.0185
    outer = rounded_rectangle(half_y, half_z, 0.022, 4)
    inner = rounded_rectangle(half_y - wall, half_z - wall, 0.006, 4)
    count = len(outer)

    vertices: list[tuple[float, float, float]] = []
    for x in (center_x - half_x, center_x + half_x):
        vertices.extend((x, center_y + y, center_z + z) for y, z in outer)
        vertices.extend((x, center_y + y, center_z + z) for y, z in inner)

    outer_min = 0
    inner_min = count
    outer_max = count * 2
    inner_max = count * 3
    faces: list[tuple[int, int, int]] = []
    face_uvs: list[list[tuple[float, float]]] = []

    def planar(point: tuple[float, float], u0: float, v0: float, width: float, height: float) -> tuple[float, float]:
        y, z = point
        return (u0 + (y / (2 * half_y) + 0.5) * width, v0 + (z / (2 * half_z) + 0.5) * height)

    def add_quad(indices: tuple[int, int, int, int], uvs: tuple[tuple[float, float], ...]) -> None:
        a, b, c, d = indices
        ua, ub, uc, ud = uvs
        faces.extend(((a, b, c), (a, c, d)))
        face_uvs.extend(([ua, ub, uc], [ua, uc, ud]))

    for index in range(count):
        nxt = (index + 1) % count
        # Two coherent annular face islands.
        add_quad(
            (outer_min + index, outer_min + nxt, inner_min + nxt, inner_min + index),
            (
                planar(outer[index], 0.02, 0.04, 0.20, 0.30),
                planar(outer[nxt], 0.02, 0.04, 0.20, 0.30),
                planar(inner[nxt], 0.02, 0.04, 0.20, 0.30),
                planar(inner[index], 0.02, 0.04, 0.20, 0.30),
            ),
        )
        add_quad(
            (outer_max + nxt, outer_max + index, inner_max + index, inner_max + nxt),
            (
                planar(outer[nxt], 0.27, 0.04, 0.20, 0.30),
                planar(outer[index], 0.27, 0.04, 0.20, 0.30),
                planar(inner[index], 0.27, 0.04, 0.20, 0.30),
                planar(inner[nxt], 0.27, 0.04, 0.20, 0.30),
            ),
        )
        u0 = index / count
        u1 = (index + 1) / count
        # Outer and inner wall strips, deliberately straight in UV space.
        add_quad(
            (outer_min + index, outer_max + index, outer_max + nxt, outer_min + nxt),
            ((0.52 + 0.46 * u0, 0.04), (0.52 + 0.46 * u0, 0.15), (0.52 + 0.46 * u1, 0.15), (0.52 + 0.46 * u1, 0.04)),
        )
        add_quad(
            (inner_min + nxt, inner_max + nxt, inner_max + index, inner_min + index),
            ((0.52 + 0.46 * u1, 0.22), (0.52 + 0.46 * u1, 0.33), (0.52 + 0.46 * u0, 0.33), (0.52 + 0.46 * u0, 0.22)),
        )

    mesh = bpy.data.meshes.new("Rebuilt front-neck keeper")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True, calc_edges_loose=True)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    # Keep one UV coordinate per physical vertex.  A seam-split torus would be
    # visually identical but glTF would duplicate its boundary vertices and
    # turn the keeper into four indexed-open components.  Planar Y/Z mapping
    # intentionally overlays the two thin sides while preserving one closed,
    # coherent UV island and watertight indexed topology.
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            y = vertex.co.y - center_y
            z = vertex.co.z - center_z
            uv_layer.data[loop_index].uv = (
                0.10 + (y / (2 * half_y) + 0.5) * 0.30,
                0.10 + (z / (2 * half_z) + 0.5) * 0.36,
            )

    keeper = bpy.data.objects.new("Rebuilt front-neck keeper", mesh)
    bpy.context.collection.objects.link(keeper)
    keeper.matrix_world = source_obj.matrix_world.copy()
    if source_obj.data.materials:
        mesh.materials.append(source_obj.data.materials[0])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return keeper


def export_glb(path: Path, position_quantization: int) -> None:
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--factor", type=float, default=0.04)
    parser.add_argument("--iterations", type=int, default=2)
    parser.add_argument("--position-quantization", type=int, default=22)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    source_obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    selected_vertices = relax_flexible_components(source_obj, args.factor, args.iterations)
    removed_faces = remove_component(source_obj, BAD_KEEPER_COMPONENT)
    keeper = build_keeper(source_obj)
    export_glb(args.output, args.position_quantization)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "removed_component": BAD_KEEPER_COMPONENT,
                "removed_faces": removed_faces,
                "flexible_components": sorted(FLEXIBLE_COMPONENTS),
                "relaxed_vertices": selected_vertices,
                "factor": args.factor,
                "iterations": args.iterations,
                "keeper_vertices": len(keeper.data.vertices),
                "keeper_faces": len(keeper.data.polygons),
                "keeper_uv_islands": 1,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

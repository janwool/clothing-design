#!/usr/bin/env python3
"""Replace the shattered waist assembly of the modern one-piece with a clean band."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--waist-min-y", type=float, default=0.90)
    parser.add_argument("--waist-max-y", type=float, default=2.10)
    parser.add_argument("--band-min-y", type=float, default=0.86)
    parser.add_argument("--band-max-y", type=float, default=2.10)
    parser.add_argument("--segments", type=int, default=96)
    parser.add_argument("--rings", type=int, default=25)
    parser.add_argument("--lower-radius-x", type=float, default=1.355)
    parser.add_argument("--upper-radius-x", type=float, default=1.245)
    parser.add_argument("--lower-radius-z", type=float, default=0.855)
    parser.add_argument("--upper-radius-z", type=float, default=0.850)
    parser.add_argument("--lower-center-z", type=float, default=0.250)
    parser.add_argument("--upper-center-z", type=float, default=0.126)
    parser.add_argument("--mid-cinch", type=float, default=0.055)
    parser.add_argument("--thickness", type=float, default=0.022)
    parser.add_argument("--micro-max-faces", type=int, default=0)
    parser.add_argument("--micro-max-area", type=float, default=0.02)
    parser.add_argument("--position-quantization", type=int, default=22)
    return parser.parse_args(argv)


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


def waist_profile(args: argparse.Namespace, y: float) -> tuple[float, float, float]:
    v = max(0.0, min(1.0, (y - args.band_min_y) / (args.band_max_y - args.band_min_y)))
    blend = v * v * (3.0 - 2.0 * v)
    cinch = 1.0 - args.mid_cinch * math.sin(math.pi * v) ** 2
    radius_x = (
        args.lower_radius_x * (1.0 - blend) + args.upper_radius_x * blend
    ) * cinch
    radius_z = (
        args.lower_radius_z * (1.0 - blend) + args.upper_radius_z * blend
    ) * (1.0 - args.mid_cinch * 0.45 * math.sin(math.pi * v) ** 2)
    center_z = args.lower_center_z * (1.0 - blend) + args.upper_center_z * blend
    return radius_x, radius_z, center_z


def add_band(bm: bmesh.types.BMesh, args: argparse.Namespace) -> int:
    uv_layer = bm.loops.layers.uv.verify()
    outer: list[list[bmesh.types.BMVert]] = []
    inner: list[list[bmesh.types.BMVert]] = []

    for ring_index in range(args.rings):
        v = ring_index / (args.rings - 1)
        y = args.band_min_y + (args.band_max_y - args.band_min_y) * v
        # Match the actual lower-torso and upper-torso cross-sections, then add
        # a restrained anatomical waist curve.  Smoothstep avoids a visible
        # tangent break where the replacement overlaps the retained garment.
        radius_x, radius_z, center_z = waist_profile(args, y)
        outer_ring = []
        inner_ring = []
        for segment_index in range(args.segments):
            u = segment_index / args.segments
            theta = 2.0 * math.pi * u
            sin_theta = math.sin(theta)
            cos_theta = math.cos(theta)
            rx = radius_x
            rz = radius_z
            outer_vert = bm.verts.new((rx * sin_theta, y, center_z + rz * cos_theta))
            inner_scale_x = max(0.01, rx - args.thickness)
            inner_scale_z = max(0.01, rz - args.thickness)
            inner_vert = bm.verts.new(
                (inner_scale_x * sin_theta, y, center_z + inner_scale_z * cos_theta)
            )
            outer_ring.append(outer_vert)
            inner_ring.append(inner_vert)
        outer.append(outer_ring)
        inner.append(inner_ring)

    new_faces: list[bmesh.types.BMFace] = []

    def make_face(
        vertices: list[bmesh.types.BMVert],
        coordinates: list[tuple[float, float]],
    ) -> None:
        face = bm.faces.new(vertices)
        face.material_index = 0
        face.smooth = True
        for loop, coordinate in zip(face.loops, coordinates):
            loop[uv_layer].uv = coordinate
        new_faces.append(face)

    for ring_index in range(args.rings - 1):
        for segment_index in range(args.segments):
            next_segment = (segment_index + 1) % args.segments
            u0 = segment_index / args.segments
            u1 = (segment_index + 1) / args.segments
            v0 = ring_index / (args.rings - 1)
            v1 = (ring_index + 1) / (args.rings - 1)
            make_face([
                outer[ring_index][segment_index],
                outer[ring_index][next_segment],
                outer[ring_index + 1][next_segment],
                outer[ring_index + 1][segment_index],
            ], [
                (0.48 * u0, 0.08 + 0.84 * v0),
                (0.48 * u1, 0.08 + 0.84 * v0),
                (0.48 * u1, 0.08 + 0.84 * v1),
                (0.48 * u0, 0.08 + 0.84 * v1),
            ])
            make_face([
                inner[ring_index][segment_index],
                inner[ring_index + 1][segment_index],
                inner[ring_index + 1][next_segment],
                inner[ring_index][next_segment],
            ], [
                (0.52 + 0.48 * u0, 0.08 + 0.84 * v0),
                (0.52 + 0.48 * u0, 0.08 + 0.84 * v1),
                (0.52 + 0.48 * u1, 0.08 + 0.84 * v1),
                (0.52 + 0.48 * u1, 0.08 + 0.84 * v0),
            ])

    for segment_index in range(args.segments):
        next_segment = (segment_index + 1) % args.segments
        u0 = segment_index / args.segments
        u1 = (segment_index + 1) / args.segments
        make_face([
            outer[0][next_segment],
            outer[0][segment_index],
            inner[0][segment_index],
            inner[0][next_segment],
        ], [
            (0.02 + 0.46 * u1, 0.065),
            (0.02 + 0.46 * u0, 0.065),
            (0.02 + 0.46 * u0, 0.005),
            (0.02 + 0.46 * u1, 0.005),
        ])
        make_face([
            outer[-1][segment_index],
            outer[-1][next_segment],
            inner[-1][next_segment],
            inner[-1][segment_index],
        ], [
            (0.52 + 0.46 * u0, 0.935),
            (0.52 + 0.46 * u1, 0.935),
            (0.52 + 0.46 * u1, 0.995),
            (0.52 + 0.46 * u0, 0.995),
        ])
    return len(new_faces)


def add_placket_bridge(bm: bmesh.types.BMesh, args: argparse.Namespace) -> int:
    """Bridge the source model's 0.19-unit gap between upper/lower plackets."""
    uv_layer = bm.loops.layers.uv.verify()
    x_segments = 12
    y_segments = 8
    min_x, max_x = -0.120, 0.160
    min_y, max_y = 0.82, 2.20
    outer_offset = 0.225
    thickness = 0.030
    front: list[list[bmesh.types.BMVert]] = []
    back: list[list[bmesh.types.BMVert]] = []
    uv_by_vert: dict[bmesh.types.BMVert, tuple[float, float]] = {}

    for y_index in range(y_segments + 1):
        v = y_index / y_segments
        y = min_y + (max_y - min_y) * v
        radius_x, radius_z, center_z = waist_profile(args, y)
        front_row = []
        back_row = []
        for x_index in range(x_segments + 1):
            u = x_index / x_segments
            x = min_x + (max_x - min_x) * u
            ellipse = math.sqrt(max(0.0, 1.0 - (x / radius_x) ** 2))
            surface_z = center_z + radius_z * ellipse
            front_vert = bm.verts.new((x, y, surface_z + outer_offset))
            back_vert = bm.verts.new((x, y, surface_z + outer_offset - thickness))
            front_row.append(front_vert)
            back_row.append(back_vert)
            uv_by_vert[front_vert] = (u, v)
            uv_by_vert[back_vert] = (u, v)
        front.append(front_row)
        back.append(back_row)

    faces: list[bmesh.types.BMFace] = []

    def make_face(vertices: list[bmesh.types.BMVert]) -> None:
        face = bm.faces.new(vertices)
        face.material_index = 0
        face.smooth = True
        for loop in face.loops:
            loop[uv_layer].uv = uv_by_vert[loop.vert]
        faces.append(face)

    for y_index in range(y_segments):
        for x_index in range(x_segments):
            make_face([
                front[y_index][x_index],
                front[y_index][x_index + 1],
                front[y_index + 1][x_index + 1],
                front[y_index + 1][x_index],
            ])
            make_face([
                back[y_index][x_index],
                back[y_index + 1][x_index],
                back[y_index + 1][x_index + 1],
                back[y_index][x_index + 1],
            ])

    for x_index in range(x_segments):
        make_face([front[0][x_index + 1], front[0][x_index], back[0][x_index], back[0][x_index + 1]])
        make_face([front[-1][x_index], front[-1][x_index + 1], back[-1][x_index + 1], back[-1][x_index]])
    for y_index in range(y_segments):
        make_face([front[y_index][0], front[y_index + 1][0], back[y_index + 1][0], back[y_index][0]])
        make_face([front[y_index + 1][-1], front[y_index][-1], back[y_index][-1], back[y_index + 1][-1]])
    return len(faces)


def main() -> None:
    args = parse_args()
    # A fresh background process already starts with an empty scene here.
    # Avoid read_factory_settings: Blender 3.1 under Rosetta can deadlock while
    # reloading bundled add-ons during repeated per-model repair runs.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    components = face_components(obj.data)
    removed_indices = []
    removed_waist_indices = []
    removed_micro_indices = []
    removed_faces = set()
    for component_index, component in enumerate(components):
        vertices = {
            vertex_index
            for face_index in component
            for vertex_index in obj.data.polygons[face_index].vertices
        }
        ys = [obj.data.vertices[index].co.y for index in vertices]
        surface_area = sum(obj.data.polygons[index].area for index in component)
        is_waist_fragment = min(ys) >= args.waist_min_y and max(ys) <= args.waist_max_y
        is_micro_fragment = (
            len(component) <= args.micro_max_faces
            and surface_area <= args.micro_max_area
        )
        if is_waist_fragment or is_micro_fragment:
            removed_indices.append(component_index)
            removed_faces.update(component)
            if is_waist_fragment:
                removed_waist_indices.append(component_index)
            elif is_micro_fragment:
                removed_micro_indices.append(component_index)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(
        bm,
        geom=[bm.faces[index] for index in sorted(removed_faces)],
        context="FACES",
    )
    band_faces = add_band(bm, args)
    bridge_faces = add_placket_bridge(bm, args)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
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
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print(json.dumps({
        "input": str(args.input),
        "output": str(args.output),
        "components_before": len(components),
        "removed_components": len(removed_indices),
        "removed_waist_components": len(removed_waist_indices),
        "removed_micro_components": len(removed_micro_indices),
        "removed_component_indices": removed_indices,
        "removed_micro_component_indices": removed_micro_indices,
        "removed_faces": len(removed_faces),
        "band_faces_before_triangulation": band_faces,
        "placket_bridge_faces_before_triangulation": bridge_faces,
        "band": {
            "min_y": args.band_min_y,
            "max_y": args.band_max_y,
            "lower_radius_x": args.lower_radius_x,
            "upper_radius_x": args.upper_radius_x,
            "lower_radius_z": args.lower_radius_z,
            "upper_radius_z": args.upper_radius_z,
            "lower_center_z": args.lower_center_z,
            "upper_center_z": args.upper_center_z,
            "mid_cinch": args.mid_cinch,
            "thickness": args.thickness,
            "segments": args.segments,
            "rings": args.rings,
        },
    }, indent=2))


if __name__ == "__main__":
    main()

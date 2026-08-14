#!/usr/bin/env python3
"""Add one explicit closed elliptical-ribbon gusset between diagnosed garment ends."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def parse_vector(value: str) -> Vector:
    parts = tuple(float(item) for item in value.split(","))
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("Expected x,y,z")
    return Vector(parts)


def bezier(first: Vector, control: Vector, last: Vector, t: float) -> Vector:
    return first * ((1.0 - t) ** 2) + control * (2.0 * (1.0 - t) * t) + last * (t ** 2)


def bezier_tangent(first: Vector, control: Vector, last: Vector, t: float) -> Vector:
    return (control - first) * (2.0 * (1.0 - t)) + (last - control) * (2.0 * t)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--start", type=parse_vector, required=True)
    parser.add_argument("--control", type=parse_vector, required=True)
    parser.add_argument("--end", type=parse_vector, required=True)
    parser.add_argument("--width-start", type=float, required=True)
    parser.add_argument("--width-middle", type=float, required=True)
    parser.add_argument("--width-end", type=float, required=True)
    parser.add_argument("--half-thickness", type=float, default=0.025)
    parser.add_argument("--segments", type=int, default=28)
    parser.add_argument("--cross-segments", type=int, default=12)
    parser.add_argument("--material-index", type=int, default=0)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)
    if args.segments < 4 or args.cross_segments < 6:
        raise SystemExit("Need at least 4 path segments and 6 cross-section segments")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.verify()
    before = {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "boundary_edges": sum(1 for edge in bm.edges if edge.is_boundary),
    }

    rings: list[list[bmesh.types.BMVert]] = []
    for path_index in range(args.segments + 1):
        t = path_index / args.segments
        center = bezier(args.start, args.control, args.end, t)
        tangent = bezier_tangent(args.start, args.control, args.end, t)
        if tangent.length <= 1e-12:
            raise RuntimeError("Degenerate gusset centerline tangent")
        tangent.normalize()
        # The diagnosed path runs in the garment's local y/z plane.  Its ribbon
        # width is local x; this vector is the in-plane thickness direction.
        thickness_direction = tangent.cross(Vector((1.0, 0.0, 0.0)))
        if thickness_direction.length <= 1e-12:
            raise RuntimeError("Gusset tangent is parallel to the width axis")
        thickness_direction.normalize()
        width = bezier(
            Vector((args.width_start, 0.0, 0.0)),
            Vector((args.width_middle, 0.0, 0.0)),
            Vector((args.width_end, 0.0, 0.0)),
            t,
        ).x
        ring = []
        for cross_index in range(args.cross_segments):
            angle = math.tau * cross_index / args.cross_segments
            coordinate = (
                center
                + Vector((1.0, 0.0, 0.0)) * (math.cos(angle) * width)
                + thickness_direction * (math.sin(angle) * args.half_thickness)
            )
            ring.append(bm.verts.new(coordinate))
        rings.append(ring)

    side_faces = []
    for path_index in range(args.segments):
        first_ring = rings[path_index]
        second_ring = rings[path_index + 1]
        for cross_index in range(args.cross_segments):
            following = (cross_index + 1) % args.cross_segments
            face = bm.faces.new((
                first_ring[cross_index],
                first_ring[following],
                second_ring[following],
                second_ring[cross_index],
            ))
            face.material_index = args.material_index
            face.smooth = True
            side_faces.append(face)

    start_center = bm.verts.new(args.start)
    end_center = bm.verts.new(args.end)
    cap_faces = []
    for cross_index in range(args.cross_segments):
        following = (cross_index + 1) % args.cross_segments
        start_face = bm.faces.new((start_center, rings[0][following], rings[0][cross_index]))
        end_face = bm.faces.new((end_center, rings[-1][cross_index], rings[-1][following]))
        for face in (start_face, end_face):
            face.material_index = args.material_index
            face.smooth = True
            cap_faces.append(face)

    bmesh.ops.recalc_face_normals(bm, faces=[*side_faces, *cap_faces])
    # Use one deterministic UV per geometric vertex.  Keeping cap and side UVs
    # identical at their shared ring prevents glTF from splitting every cap
    # triangle into a false disconnected component during export.
    maximum_width = max(args.width_start, args.width_middle, args.width_end)
    z_extent = args.end.z - args.start.z
    if abs(z_extent) <= 1e-12:
        raise RuntimeError("Gusset start and end need different local z values")
    new_faces = [*side_faces, *cap_faces]
    for face in new_faces:
        for loop in face.loops:
            loop[uv_layer].uv = (
                0.5 + loop.vert.co.x / (2.0 * maximum_width),
                (loop.vert.co.z - args.start.z) / z_extent,
            )

    bm.normal_update()
    report = {
        "input": str(args.input),
        "start": list(args.start),
        "control": list(args.control),
        "end": list(args.end),
        "widths": [args.width_start, args.width_middle, args.width_end],
        "half_thickness": args.half_thickness,
        "path_segments": args.segments,
        "cross_segments": args.cross_segments,
        "new_vertices": sum(len(ring) for ring in rings) + 2,
        "new_faces": len(side_faces) + len(cap_faces),
        "before": before,
        "after": {
            "vertices": len(bm.verts),
            "faces": len(bm.faces),
            "boundary_edges": sum(1 for edge in bm.edges if edge.is_boundary),
            "nonmanifold_edges": sum(
                1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary
            ),
        },
    }
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

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
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

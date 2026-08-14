#!/usr/bin/env python3
"""Delete only faces whose vertices match an explicitly diagnosed local vertex set."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--vertices", required=True, help="Semicolon-separated local x,y,z coordinates")
    parser.add_argument("--tolerance", type=float, default=0.0001)
    parser.add_argument("--expected-faces", type=int, required=True)
    parser.add_argument("--position-quantization", type=int, default=22)
    return parser.parse_args(argv)


def boundary_count(bm):
    return sum(1 for edge in bm.edges if edge.is_boundary)


def main():
    args = parse_args()
    seeds = [
        Vector(tuple(float(value) for value in group.split(",")))
        for group in args.vertices.split(";")
        if group.strip()
    ]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()

    def matches_seed(vertex):
        return any((vertex.co - seed).length <= args.tolerance for seed in seeds)

    selected = [face for face in bm.faces if all(matches_seed(vertex) for vertex in face.verts)]
    if len(selected) != args.expected_faces:
        raise RuntimeError(
            f"Expected {args.expected_faces} matched faces, found {len(selected)}: "
            f"{[face.index for face in selected]}"
        )
    report = {
        "matched_faces": [face.index for face in selected],
        "matched_face_centers": [
            [round(value, 9) for value in face.calc_center_median()]
            for face in selected
        ],
        "boundary_edges_before": boundary_count(bm),
    }
    bmesh.ops.delete(bm, geom=selected, context="FACES")
    report["boundary_edges_after"] = boundary_count(bm)
    report["faces_after"] = len(bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
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
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

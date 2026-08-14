#!/usr/bin/env python3
"""Align diagnosed near-coincident seam pairs without merging their topology."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh


def parse_vec(value: str) -> tuple[float, float, float]:
    result = tuple(float(item) for item in value.split(","))
    if len(result) != 3:
        raise ValueError("Expected x,y,z")
    return result


def components(bm: bmesh.types.BMesh) -> list[set[bmesh.types.BMFace]]:
    unseen = set(bm.faces)
    result = []
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
        result.append(faces)
    result.sort(key=lambda faces: min(face.index for face in faces))
    return result


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--component", type=int, required=True)
    parser.add_argument("--minimum", required=True)
    parser.add_argument("--maximum", required=True)
    parser.add_argument("--distance", type=float, required=True)
    parser.add_argument("--expected-pairs", type=int, required=True)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)
    minimum = parse_vec(args.minimum)
    maximum = parse_vec(args.maximum)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    groups = components(bm)
    faces = groups[args.component]
    allowed = {vertex for face in faces for vertex in face.verts}
    candidates = sorted(
        (
            vertex
            for vertex in allowed
            if all(minimum[axis] <= vertex.co[axis] <= maximum[axis] for axis in range(3))
        ),
        key=lambda vertex: vertex.index,
    )
    possible = []
    for offset, first in enumerate(candidates):
        first_edges = set(first.link_edges)
        for second in candidates[offset + 1 :]:
            if first_edges.intersection(second.link_edges):
                continue
            distance = float((first.co - second.co).length)
            if distance <= args.distance:
                possible.append((distance, first, second))
    possible.sort(key=lambda item: (item[0], item[1].index, item[2].index))
    selected = []
    used = set()
    for distance, first, second in possible:
        if first in used or second in used:
            continue
        used.update((first, second))
        selected.append((distance, first, second))
    if len(selected) != args.expected_pairs:
        raise RuntimeError(
            f"Expected {args.expected_pairs} unique pairs, found {len(selected)}; "
            f"candidate pairs={len(possible)}"
        )
    report_pairs = []
    for distance, first, second in selected:
        before_first = first.co.copy()
        before_second = second.co.copy()
        midpoint = (before_first + before_second) * 0.5
        first.co = midpoint
        second.co = midpoint
        report_pairs.append(
            {
                "distance": round(distance, 12),
                "first": first.index,
                "second": second.index,
                "first_before": [round(float(value), 9) for value in before_first],
                "second_before": [round(float(value), 9) for value in before_second],
                "aligned_coordinate": [round(float(value), 9) for value in midpoint],
            }
        )
    bm.normal_update()
    report = {
        "component": args.component,
        "bbox": [*minimum, *maximum],
        "distance": args.distance,
        "candidate_vertices": len(candidates),
        "candidate_pairs": len(possible),
        "aligned_pairs": report_pairs,
        "boundary_edges": sum(1 for edge in bm.edges if edge.is_boundary),
        "nonmanifold_edges": sum(
            1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary
        ),
        "zero_area_faces": sum(1 for face in bm.faces if face.calc_area() <= 1e-12),
    }
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

#!/usr/bin/env python3
"""Stitch the seven model-specific pants seam ruptures in the repaired jumpsuit.

Run this after ``repair-relaxed-long-coat-jumpsuit.py --skip-side-slit-repair``.
The intermediate GLB preserves each side of an authored seam as a simple
boundary cycle. Each diagnosed defect is a doubled, nearly coincident slit, so
opposing vertices are midpoint-welded instead of spanning the slit with a cap.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def center(vertices):
    return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)


def bbox(vertices):
    return [
        *[min(vertex.co[axis] for vertex in vertices) for axis in range(3)],
        *[max(vertex.co[axis] for vertex in vertices) for axis in range(3)],
    ]


def boundary_groups(bm):
    remaining = {edge for edge in bm.edges if edge.is_boundary}
    groups = []
    while remaining:
        seed = remaining.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for linked in vertex.link_edges:
                    if linked in remaining:
                        remaining.remove(linked)
                        queue.append(linked)
                        group.append(linked)
        groups.append(group)
    groups.sort(
        key=lambda group: tuple(
            round(value, 9)
            for value in center(list({vertex for edge in group for vertex in edge.verts}))
        )
    )
    return groups


def ordered_boundary_cycle(group):
    edge_set = set(group)
    vertices = {vertex for edge in group for vertex in edge.verts}
    neighbors = {
        vertex: sorted(
            {
                other
                for edge in vertex.link_edges
                if edge in edge_set
                for other in edge.verts
                if other is not vertex
            },
            key=lambda item: item.index,
        )
        for vertex in vertices
    }
    if any(len(items) != 2 for items in neighbors.values()):
        raise RuntimeError("Selected pants defect is not a simple closed boundary cycle")
    start = min(vertices, key=lambda vertex: vertex.index)
    ordered = [start]
    previous = None
    current = start
    while True:
        following = next(vertex for vertex in neighbors[current] if vertex is not previous)
        if following is start:
            break
        if following in ordered:
            raise RuntimeError("Boundary cycle repeated before closing")
        ordered.append(following)
        previous, current = current, following
    if len(ordered) != len(vertices):
        raise RuntimeError("Boundary cycle walk did not visit every vertex")
    return ordered


def doubled_slit_pairs(ordered):
    count = len(ordered)
    if count % 2:
        raise RuntimeError(f"Doubled slit must have an even boundary count, got {count}")
    half = count // 2
    candidates = []
    for tip_index in range(half):
        pairs = [
            (ordered[(tip_index + step) % count], ordered[(tip_index - step) % count])
            for step in range(1, half)
        ]
        distances = [(left.co - right.co).length for left, right in pairs]
        candidates.append((max(distances, default=0.0), sum(distances), tip_index, pairs))
    max_gap, _total_gap, tip_index, pairs = min(candidates, key=lambda item: (item[0], item[1]))
    return pairs, (ordered[tip_index], ordered[(tip_index + half) % count]), float(max_gap)


def apply_thickness(obj, thickness):
    if thickness <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Rebuilt jumpsuit fabric thickness", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 0.0
    modifier.use_even_offset = False
    modifier.use_quality_normals = False
    modifier.use_rim_only = False
    modifier.material_offset = 0
    modifier.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def export_glb(output, position_quantization):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
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


def mesh_topology_counts(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = sum(edge.is_boundary for edge in bm.edges)
    non_manifold = sum(not edge.is_manifold for edge in bm.edges)
    bm.free()
    return boundary, non_manifold


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--thickness", type=float, default=0.024)
    parser.add_argument("--maximum-gap", type=float, default=0.01)
    parser.add_argument("--preserve-uv-seams", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=18)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one joined mesh object, found {len(objects)}")
    obj = objects[0]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    groups = boundary_groups(bm)
    selected = []
    for index, group in enumerate(groups):
        vertices = list({vertex for edge in group for vertex in edge.verts})
        bounds = bbox(vertices)
        perimeter = sum(edge.calc_length() for edge in group)
        right = (
            len(group) <= 42
            and perimeter < 5.3
            and bounds[0] > 1.7
            and bounds[1] > -7.4
            and bounds[4] < 0.3
            and bounds[2] > 0.1
        )
        left = (
            len(group) == 36
            and perimeter < 4.3
            and bounds[3] < -2.6
            and bounds[1] > -6.1
            and bounds[4] < -3.8
            and bounds[2] > -0.1
            and bounds[5] < 0.1
        )
        if right or left:
            selected.append((index, group, vertices, bounds, perimeter))
    expected = [4, 4, 10, 10, 36, 42, 42]
    if len(selected) != 7 or sorted(len(group) for _i, group, _v, _b, _p in selected) != expected:
        raise RuntimeError(
            f"Expected pants seam ruptures {expected}; found "
            f"{[(index, len(group)) for index, group, _v, _b, _p in selected]}"
        )

    target_map = {}
    rows = []
    for index, group, vertices, bounds, perimeter in selected:
        ordered = ordered_boundary_cycle(group)
        pairs, tips, max_gap = doubled_slit_pairs(ordered)
        if max_gap > args.maximum_gap:
            raise RuntimeError(
                f"Boundary group {index} is not a narrow doubled slit: maximum gap {max_gap:.6f}"
            )
        for source, target in pairs:
            midpoint = (source.co + target.co) * 0.5
            source.co = midpoint
            target.co = midpoint
            target_map[source] = target
        rows.append(
            {
                "boundary_group": index,
                "edges": len(group),
                "perimeter": round(float(perimeter), 8),
                "center": [round(float(value), 6) for value in center(vertices)],
                "bbox": [round(float(value), 6) for value in bounds],
                "slit_tip_vertices": [tips[0].index, tips[1].index],
                "opposing_vertex_pairs": len(pairs),
                "maximum_opposing_gap": round(max_gap, 8),
                "faces_created": 0,
                "repair_method": "midpoint weld opposing sides of narrow doubled seam",
            }
        )
    bmesh.ops.weld_verts(bm, targetmap=target_map)

    uv_layer = bm.loops.layers.uv.active
    uv_loops_unified = 0
    if uv_layer is not None and not args.preserve_uv_seams:
        for vertex in bm.verts:
            loops = [loop for loop in vertex.link_loops if loop.face.is_valid]
            values = [tuple(round(float(value), 9) for value in loop[uv_layer].uv) for loop in loops]
            if len(set(values)) <= 1:
                continue
            chosen = Counter(values).most_common(1)[0][0]
            for loop in loops:
                loop[uv_layer].uv = chosen
                uv_loops_unified += 1
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    boundary_after = sum(edge.is_boundary for edge in bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    apply_thickness(obj, args.thickness)
    boundary_after_thickness, non_manifold_after_thickness = mesh_topology_counts(obj.data)
    export_glb(args.output.resolve(), args.position_quantization)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": "seven individually diagnosed doubled pants seam ruptures",
        "boundary_groups_before": len(groups),
        "rupture_boundary_edges_stitched": sum(len(group) for _i, group, _v, _b, _p in selected),
        "opposing_vertices_welded": len(target_map),
        "uv_loops_unified": uv_loops_unified,
        "uv_seams_preserved": args.preserve_uv_seams,
        "boundary_edges_after_stitch_before_thickness": boundary_after,
        "boundary_edges_after_thickness_before_export": boundary_after_thickness,
        "non_manifold_edges_after_thickness_before_export": non_manifold_after_thickness,
        "thickness": args.thickness,
        "repairs": rows,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

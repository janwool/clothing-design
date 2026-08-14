#!/usr/bin/env python3
"""Repair catalog model ID 105 with one measured internal-tear fill.

All fourteen authored pattern pieces and four shoulder continuations are kept.
Only exact same-material two-face seams are welded.  Of the four boundary loops
that remain, the open front/neck/hem outline and both cuffs are preserved; the
single isolated four-edge lower-panel slit is filled before centered thickness
is added.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id105_repair_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def boundary_edge_groups(bm):
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    adjacency = defaultdict(list)
    for edge in boundary:
        for vertex in edge.verts:
            adjacency[vertex].append(edge)
    groups = []
    seen = set()
    for seed in boundary:
        if seed in seen:
            continue
        seen.add(seed)
        queue = deque([seed])
        edges = []
        vertices = set()
        while queue:
            edge = queue.popleft()
            edges.append(edge)
            vertices.update(edge.verts)
            for vertex in edge.verts:
                for neighbor in adjacency[vertex]:
                    if neighbor not in seen:
                        seen.add(neighbor)
                        queue.append(neighbor)
        groups.append(
            {
                "edges_raw": edges,
                "edges": len(edges),
                "perimeter": sum(edge.calc_length() for edge in edges),
                "bbox": [
                    float(min(vertex.co[axis] for vertex in vertices))
                    for axis in range(3)
                ]
                + [
                    float(max(vertex.co[axis] for vertex in vertices))
                    for axis in range(3)
                ],
                "center": [
                    float(sum(vertex.co[axis] for vertex in vertices) / len(vertices))
                    for axis in range(3)
                ],
            }
        )
    return groups


def serializable_loop(row):
    return {
        "edges": row["edges"],
        "perimeter": round(row["perimeter"], 6),
        "bbox": [round(value, 6) for value in row["bbox"]],
        "center": [round(value, 6) for value in row["center"]],
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--pattern-surface-output", type=Path)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--uv-margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    source = helpers.topology(bm)
    if source != {
        "vertices": 42651,
        "edges": 124957,
        "faces": 82320,
        "components": 18,
        "boundary_edges": 2954,
        "true_nonmanifold_edges": 0,
    }:
        raise RuntimeError(f"Unexpected ID105 thin source: {source}")

    raw_components = helpers.components(bm)
    source_component_by_face = {
        face: component_index
        for component_index, faces in enumerate(raw_components)
        for face in faces
    }

    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        uv_owner_min_faces=100,
    )
    expected_weld = {
        "geometric_edges": 123795,
        "unambiguous_same_material_seams": 1162,
        "already_indexed_manifold_edges": 122003,
        "different_material_contacts_preserved": 0,
        "three_plus_layer_contacts_preserved": 0,
        "vertices_merged": 1178,
        "authored_cloth_seam_edges": 1094,
        "uv_owner_min_faces": 100,
        "uv_major_components": 14,
        "uv_owner_groups": 14,
    }
    if weld != expected_weld:
        raise RuntimeError(f"Unexpected ID105 weld result: {weld}")
    sewn_before_fill = helpers.topology(bm)
    if sewn_before_fill != {
        "vertices": 41473,
        "edges": 123795,
        "faces": 82320,
        "components": 1,
        "boundary_edges": 630,
        "true_nonmanifold_edges": 0,
    }:
        raise RuntimeError(f"Unexpected sewn ID105 topology: {sewn_before_fill}")

    loops = boundary_edge_groups(bm)
    tiny_tears = [
        row for row in loops if row["edges"] == 4 and row["perimeter"] < 0.5
    ]
    intended_openings = [row for row in loops if row not in tiny_tears]
    if sorted(row["edges"] for row in intended_openings) != [32, 32, 562]:
        raise RuntimeError(
            "Expected the open front/neck/hem outline and two cuff openings, got "
            f"{[serializable_loop(row) for row in intended_openings]}"
        )
    if len(tiny_tears) != 1:
        raise RuntimeError(f"Expected one internal quad tear, got {len(tiny_tears)}")
    tear = tiny_tears[0]
    center = tear["center"]
    expected_center = (2.10482, -5.071697, -0.271652)
    if any(abs(value - expected) > 2e-4 for value, expected in zip(center, expected_center)):
        raise RuntimeError(f"Unexpected internal tear position: {center}")

    loop_adjacency = defaultdict(list)
    for edge in tear["edges_raw"]:
        for vertex in edge.verts:
            loop_adjacency[vertex].append(edge)
    split_vertices = [
        vertex
        for vertex, edges in loop_adjacency.items()
        if len(
            {
                source_component_by_face[edge.link_faces[0]]
                for edge in edges
            }
        )
        == 2
    ]
    if len(split_vertices) != 2:
        raise RuntimeError(
            "Expected the tear endpoints to touch both adjacent pattern owners, "
            f"got {len(split_vertices)} split vertices"
        )
    side_vertices = [vertex for vertex in loop_adjacency if vertex not in split_vertices]
    if len(side_vertices) != 2:
        raise RuntimeError(f"Expected two side vertices, got {len(side_vertices)}")

    new_faces = []
    repair_owners = []
    first, second = split_vertices
    for side in side_vertices:
        path_edges = [
            edge
            for edge in loop_adjacency[side]
            if first in edge.verts or second in edge.verts
        ]
        if len(path_edges) != 2:
            raise RuntimeError("Could not resolve the two-edge owner path around the tear")
        owners = {source_component_by_face[edge.link_faces[0]] for edge in path_edges}
        if len(owners) != 1:
            raise RuntimeError(f"A repair side crossed source owners: {sorted(owners)}")
        owner = owners.pop()
        adjacent_faces = [edge.link_faces[0] for edge in path_edges]
        reference_normal = sum(
            (face.normal.copy() for face in adjacent_faces),
            adjacent_faces[0].normal.copy() * 0.0,
        ).normalized()
        ordered = (first, side, second)
        proposed_normal = (side.co - first.co).cross(second.co - first.co).normalized()
        if proposed_normal.dot(reference_normal) < 0.0:
            ordered = (second, side, first)
        face = bm.faces.new(ordered)
        face.material_index = adjacent_faces[0].material_index
        new_faces.append(face)
        repair_owners.append(owner)
    if sorted(repair_owners) != [6, 16]:
        raise RuntimeError(f"Expected repair owners 6 and 16, got {repair_owners}")
    repair_seam = bm.edges.get((first, second))
    if repair_seam is None:
        raise RuntimeError("The restored owner seam was not created")
    repair_seam.seam = True
    bm.normal_update()
    repaired = helpers.topology(bm)
    if repaired != {
        "vertices": 41473,
        "edges": 123796,
        "faces": 82322,
        "components": 1,
        "boundary_edges": 626,
        "true_nonmanifold_edges": 0,
    }:
        raise RuntimeError(f"Unexpected repaired ID105 topology: {repaired}")
    repair_face_area = float(sum(face.calc_area() for face in new_faces))

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    rebuilt_uv = helpers.rebuild_physical_uv(obj, args.uv_margin)
    if rebuilt_uv["islands"] != 14:
        raise RuntimeError(f"Expected fourteen authored pattern UV islands: {rebuilt_uv}")
    if args.pattern_surface_output:
        helpers.export_glb(args.pattern_surface_output, args.position_quantization)

    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened_before_normals = helpers.topology(bm)
    normals_before = [face.normal.copy() for face in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    faces_changed = sum(
        before.dot(face.normal) < 0.9999
        for before, face in zip(normals_before, bm.faces)
    )
    thickened = helpers.topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    if (
        thickened["components"] != 1
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Final ID105 topology is not closed and manifold: {thickened}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "preserve fourteen authored patterns and four shoulder continuations; "
            "sew only exact two-face seams; preserve the front/neck/hem and cuff "
            "openings; fill only the unique four-edge internal lower-panel tear; "
            "then add centered thickness"
        ),
        "tolerance": args.tolerance,
        "thickness": args.thickness,
        "source": source,
        "weld": weld,
        "sewn_before_fill": sewn_before_fill,
        "intended_openings": [serializable_loop(row) for row in intended_openings],
        "internal_tear": serializable_loop(tear),
        "repair_faces_added": len(new_faces),
        "repair_pattern_owners": sorted(repair_owners),
        "repair_uv_seam_restored": True,
        "repair_face_area": round(repair_face_area, 10),
        "repaired_surface": repaired,
        "rebuilt_uv": rebuilt_uv,
        "pattern_surface_output": str(args.pattern_surface_output) if args.pattern_surface_output else None,
        "thickened_before_normal_recalculation": thickened_before_normals,
        "faces_changed_by_closed_shell_normal_recalculation": faces_changed,
        "thickened": thickened,
        "thickened_uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

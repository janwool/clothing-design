#!/usr/bin/env python3
"""Repair the pinholed blazer catalogued as ``minimal-fashion-top``.

The original thin blazer contains 32 authored pattern pieces plus 281 surface
continuations.  Sewing exact two-face seams restores fifteen physical cloth
groups, but also reveals sixteen small internal boundary loops.  Those loops
are narrow slit-shaped cracks, not round holes: Solidify turns them into black
side walls, while a centroid cap leaves a visibly recessed patch.  This
model-specific repair pairs and welds the two banks of each measured slit and
preserves all larger collar, front opening, cuff, hem and construction edges.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("garment_seam_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
    return groups


def ordered_boundary_vertices(group):
    adjacency = {}
    for edge in group:
        for vertex in edge.verts:
            adjacency.setdefault(vertex, [])
            adjacency[vertex].append(edge.other_vert(vertex))
    if any(len(neighbors) != 2 for neighbors in adjacency.values()):
        raise RuntimeError("ID97 repair boundary is not a simple cycle")
    start = min(adjacency, key=lambda vertex: vertex.index)
    ordered = [start]
    previous = None
    current = start
    while True:
        following = next(vertex for vertex in adjacency[current] if vertex is not previous)
        if following is start:
            break
        if following in ordered:
            raise RuntimeError("ID97 boundary repeated before closing")
        ordered.append(following)
        previous, current = current, following
    if len(ordered) != len(adjacency):
        raise RuntimeError("ID97 boundary walk did not include every vertex")
    return ordered


def group_detail(group):
    vertices = {vertex for edge in group for vertex in edge.verts}
    center = sum((vertex.co for vertex in vertices), Vector()) / len(vertices)
    return {
        "edges": len(group),
        "vertices": len(vertices),
        "perimeter": round(sum(edge.calc_length() for edge in group), 9),
        "center": [round(float(value), 6) for value in center],
    }


def plan_slit_pairs(boundary_vertices):
    """Find the minimum-width, non-crossing pairing between a slit's banks.

    Cutting an even boundary cycle at opposite edges produces two equally
    sampled banks.  The authored cracks are long and narrow, so the correct cut
    is the one whose reversed point-to-point pairing has the least total span.
    """

    count = len(boundary_vertices)
    if count % 2:
        raise RuntimeError("ID97 repair slit has an odd boundary vertex count")
    half = count // 2
    candidates = []
    for cut in range(half):
        bank_a = [boundary_vertices[(cut + 1 + offset) % count] for offset in range(half)]
        bank_b = [boundary_vertices[(cut - offset) % count] for offset in range(half)]
        pairs = list(zip(bank_a, bank_b))
        distances = [(left.co - right.co).length for left, right in pairs]
        candidates.append((sum(distances), max(distances), cut, pairs, distances))
    return min(candidates, key=lambda candidate: (candidate[0], candidate[1], candidate[2]))


def stitch_measured_slits(bm, max_perimeter, relax_iterations, relax_factor):
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    groups = boundary_groups(bm)
    groups.sort(key=lambda group: (sum(edge.calc_length() for edge in group), group_detail(group)["center"]))
    selected = [
        group
        for group in groups
        if len(group) <= 24 and sum(edge.calc_length() for edge in group) <= max_perimeter
    ]
    if len(groups) != 36 or len(selected) != 16 or sum(len(group) for group in selected) != 108:
        raise RuntimeError(
            "Unexpected ID97 boundary signature: "
            f"groups={len(groups)} selected={len(selected)} edges={sum(len(group) for group in selected)}"
        )
    if min(sum(edge.calc_length() for edge in group) for group in groups[16:]) <= 1.8:
        raise RuntimeError("ID97 repair loops are no longer separated from authored garment openings")

    reports = []
    targetmap = {}
    seam_chains = []
    for index, group in enumerate(selected):
        detail = group_detail(group)
        boundary_vertices = ordered_boundary_vertices(group)
        total_span, maximum_span, cut, pairs, distances = plan_slit_pairs(boundary_vertices)
        targets = []
        for left, right in pairs:
            target, source = (left, right) if left.index < right.index else (right, left)
            midpoint = (left.co + right.co) * 0.5
            left.co = midpoint
            right.co = midpoint
            targetmap[source] = target
            targets.append(target)
        seam_chains.append(targets)
        detail.update(
            {
                "index": index,
                "cut": cut,
                "pairs": len(pairs),
                "total_stitch_span": round(total_span, 9),
                "maximum_stitch_span": round(maximum_span, 9),
                "pair_distances": [round(distance, 9) for distance in distances],
            }
        )
        reports.append(detail)

    bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    stitch_targets = {vertex for chain in seam_chains for vertex in chain}
    relaxation = []
    for iteration in range(relax_iterations):
        updates = {}
        for vertex in stitch_targets:
            neighbors = [
                edge.other_vert(vertex)
                for edge in vertex.link_edges
                if edge.other_vert(vertex) not in stitch_targets
            ]
            if not neighbors:
                raise RuntimeError("ID97 stitched slit has no surrounding surface neighbors")
            average = sum((neighbor.co for neighbor in neighbors), Vector()) / len(neighbors)
            updates[vertex] = vertex.co.lerp(average, relax_factor)
        displacements = [(updates[vertex] - vertex.co).length for vertex in updates]
        for vertex, coordinate in updates.items():
            vertex.co = coordinate
        relaxation.append(
            {
                "iteration": iteration + 1,
                "maximum_displacement": round(max(displacements), 9),
                "mean_displacement": round(sum(displacements) / len(displacements), 9),
            }
        )
    for chain in seam_chains:
        for left, right in zip(chain, chain[1:]):
            if not left.is_valid or not right.is_valid:
                raise RuntimeError("ID97 stitched seam target was unexpectedly removed")
            edge = bm.edges.get((left, right))
            if edge is None or not edge.is_manifold:
                raise RuntimeError("ID97 stitched slit did not produce a manifold seam edge")
            edge.seam = True
    bm.normal_update()
    return {
        "boundary_groups_before": len(groups),
        "stitched_groups": reports,
        "groups_stitched": len(selected),
        "boundary_edges_closed": sum(len(group) for group in selected),
        "vertices_merged": len(targetmap),
        "relax_iterations": relax_iterations,
        "relax_factor": relax_factor,
        "relaxation": relaxation,
    }


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--pattern-surface-output", type=Path)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--max-repair-perimeter", type=float, default=1.7)
    parser.add_argument("--relax-iterations", type=int, default=2)
    parser.add_argument("--relax-factor", type=float, default=0.65)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--uv-margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    source = helpers.topology(bm)
    expected_source = {
        "vertices": 39613,
        "faces": 72384,
        "components": 313,
        "boundary_edges": 6838,
        "true_nonmanifold_edges": 0,
    }
    for key, expected in expected_source.items():
        if source[key] != expected:
            raise RuntimeError(f"Unexpected ID97 source {key}: {source[key]} (expected {expected})")

    weld = helpers.selective_same_layer_weld(bm, args.tolerance, uv_owner_min_faces=100)
    expected_weld = {
        "unambiguous_same_material_seams": 1997,
        "vertices_merged": 2005,
        "three_plus_layer_contacts_preserved": 0,
        "uv_major_components": 32,
    }
    for key, expected in expected_weld.items():
        if weld[key] != expected:
            raise RuntimeError(f"Unexpected ID97 {key}: {weld[key]} (expected {expected})")
    sewn_before_slit_repair = helpers.topology(bm)
    if (
        sewn_before_slit_repair["components"] != 15
        or sewn_before_slit_repair["boundary_edges"] != 2844
        or sewn_before_slit_repair["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Unexpected ID97 sewn topology: {sewn_before_slit_repair}")

    pinhole_stitches = stitch_measured_slits(
        bm,
        args.max_repair_perimeter,
        args.relax_iterations,
        args.relax_factor,
    )
    stitched = helpers.topology(bm)
    if (
        stitched["components"] != 15
        or stitched["boundary_edges"] != 2736
        or stitched["true_nonmanifold_edges"] != 0
        or stitched["faces"] != 72352
        or stitched["vertices"] != 37554
    ):
        raise RuntimeError(f"Unexpected ID97 stitched topology: {stitched}")

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
    if rebuilt_uv["islands"] != 32:
        raise RuntimeError(f"Expected 32 authored ID97 UV owners: {rebuilt_uv}")
    if args.pattern_surface_output:
        helpers.export_glb(args.pattern_surface_output, args.position_quantization)
    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened = helpers.topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    if (
        thickened["components"] != 15
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Final ID97 topology is not closed and manifold: {thickened}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "return to the thin blazer; sew only exact same-material two-face seams; "
            "pair and weld the banks of sixteen measured internal slits; preserve every larger "
            "collar/front/cuff/hem boundary; then add centered thickness"
        ),
        "diagnosis": {
            "authored_pattern_owners": 32,
            "physical_garment_groups": 15,
            "surface_continuation_fragments": 281,
            "old_failure": (
                "unclosed internal loops generated Solidify sidewalls that rendered as "
                "black triangular pits across the blazer"
            ),
        },
        "source": source,
        "weld": weld,
        "sewn_before_slit_repair": sewn_before_slit_repair,
        "pinhole_stitches": pinhole_stitches,
        "stitched": stitched,
        "rebuilt_uv": rebuilt_uv,
        "pattern_surface_output": str(args.pattern_surface_output) if args.pattern_surface_output else None,
        "thickness": args.thickness,
        "thickened": thickened,
        "thickened_uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

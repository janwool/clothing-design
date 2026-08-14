#!/usr/bin/env python3
"""Rebuild ID100 from its authored thin structured-blazer surfaces.

The old catalog asset solidified 64 raw indexed fragments independently.  Forty
of those fragments are continuation patches from the 24 authored pattern
pieces, not floating debris.  Deleting them and capping everything produced the
large chest pit in the first repair; solidifying them independently left the
black shoulder hole and many pinhole rims in the published follow-up.

This model-specific repair stitches only continuation fragments that share the
same pattern owner, preserves all authored faces, and deliberately synthesizes
no cap faces.  After that owner-only stitch, all 24 patterns have exactly one
simple outer boundary and no internal holes.  It rebuilds one upright UV island
per pattern owner and then adds a restrained centered cloth thickness.
"""

from __future__ import annotations

import argparse
import heapq
import importlib.util
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id100_garment_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def boundary_groups(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMEdge]]:
    pending = {edge for edge in bm.edges if edge.is_boundary}
    groups = []
    while pending:
        seed = min(pending, key=lambda edge: edge.index)
        pending.remove(seed)
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for linked in vertex.link_edges:
                    if linked in pending:
                        pending.remove(linked)
                        queue.append(linked)
                        group.append(linked)
        groups.append(group)
    groups.sort(key=lambda group: (group_perimeter(group), tuple(group_center(group))))
    return groups


def group_vertices(group: list[bmesh.types.BMEdge]) -> set[bmesh.types.BMVert]:
    return {vertex for edge in group for vertex in edge.verts}


def group_center(group: list[bmesh.types.BMEdge]) -> Vector:
    vertices = group_vertices(group)
    return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)


def group_perimeter(group: list[bmesh.types.BMEdge]) -> float:
    return sum(edge.calc_length() for edge in group)


def group_detail(index: int, group: list[bmesh.types.BMEdge]) -> dict[str, object]:
    vertices = group_vertices(group)
    minimum = [min(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    maximum = [max(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    degree = {
        vertex: sum(vertex in edge.verts for edge in group)
        for vertex in vertices
    }
    return {
        "index": index,
        "edges": len(group),
        "vertices": len(vertices),
        "perimeter": round(group_perimeter(group), 9),
        "center": [round(float(value), 6) for value in group_center(group)],
        "bbox": [round(float(value), 6) for value in minimum + maximum],
        "simple_cycle": all(value == 2 for value in degree.values()),
    }


def weld_continuation_patches_only(
    bm: bmesh.types.BMesh,
    helpers,
    tolerance: float,
) -> dict[str, object]:
    """Attach every small continuation fragment to one of 24 pattern owners.

    Exact edges between two different major owners are authored sewing edges.
    They stay topologically separate so Solidify closes each paper pattern and
    the UV layout remains one coherent island per pattern piece.
    """

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    raw_components = helpers.components(bm)
    component_by_face = {
        face: index
        for index, faces in enumerate(raw_components)
        for face in faces
    }
    component_sizes = [len(faces) for faces in raw_components]
    major_components = [
        index for index, size in enumerate(component_sizes) if size >= 50
    ]
    if len(major_components) != 24:
        raise RuntimeError(f"Expected 24 ID100 major pattern owners: {major_components}")

    scale = 1.0 / tolerance
    position_key = {
        vertex: tuple(round(float(value) * scale) for value in vertex.co)
        for vertex in bm.verts
    }
    edge_entries = defaultdict(list)
    for face in bm.faces:
        for edge in face.edges:
            a, b = edge.verts
            key_a, key_b = position_key[a], position_key[b]
            if key_a != key_b:
                edge_entries[tuple(sorted((key_a, key_b)))].append((face, a, b))

    neighbors = defaultdict(set)
    for entries in edge_entries.values():
        if len(entries) != 2:
            continue
        face_a, face_b = entries[0][0], entries[1][0]
        component_a = component_by_face[face_a]
        component_b = component_by_face[face_b]
        if face_a.material_index == face_b.material_index and component_a != component_b:
            neighbors[component_a].add(component_b)
            neighbors[component_b].add(component_a)

    best = {}
    queue = []
    for root in major_components:
        candidate = (0, -component_sizes[root], root)
        best[root] = candidate
        heapq.heappush(queue, (*candidate, root))
    owner = {}
    while queue:
        distance, negative_size, root, component = heapq.heappop(queue)
        if best.get(component) != (distance, negative_size, root):
            continue
        owner[component] = root
        for neighbor in neighbors[component]:
            candidate = (distance + 1, negative_size, root)
            if neighbor not in best or candidate < best[neighbor]:
                best[neighbor] = candidate
                heapq.heappush(queue, (*candidate, neighbor))
    missing = sorted(set(range(len(raw_components))) - set(owner))
    if missing:
        raise RuntimeError(f"ID100 continuation fragments without a pattern owner: {missing}")

    dsu = helpers.DisjointSet(len(bm.verts))
    continuation_edges = 0
    authored_pattern_seams = 0
    indexed_manifold_edges = 0
    layer_conflicts = 0
    for geometric_key, entries in edge_entries.items():
        if len(entries) > 2:
            layer_conflicts += 1
            continue
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        component_a = component_by_face[face_a]
        component_b = component_by_face[face_b]
        if {a0.index, a1.index} == {b0.index, b1.index}:
            indexed_manifold_edges += 1
            continue
        if face_a.material_index != face_b.material_index:
            raise RuntimeError(f"Unexpected ID100 material conflict at {geometric_key}")
        if owner[component_a] != owner[component_b]:
            authored_pattern_seams += 1
            continue
        endpoints_a = {position_key[a0]: a0, position_key[a1]: a1}
        endpoints_b = {position_key[b0]: b0, position_key[b1]: b1}
        if set(endpoints_a) != set(endpoints_b):
            raise RuntimeError(f"ID100 continuation endpoint mismatch at {geometric_key}")
        for key in endpoints_a:
            dsu.union(endpoints_a[key].index, endpoints_b[key].index)
        continuation_edges += 1

    vertices = list(bm.verts)
    targetmap = {}
    for vertex in vertices:
        root = dsu.find(vertex.index)
        if root != vertex.index:
            targetmap[vertex] = vertices[root]
    if targetmap:
        bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    for edge in bm.edges:
        edge.seam = False
    return {
        "raw_components": len(raw_components),
        "major_pattern_owners": len(major_components),
        "continuation_fragments": len(raw_components) - len(major_components),
        "geometric_edges": len(edge_entries),
        "continuation_edges_welded": continuation_edges,
        "authored_pattern_seams_preserved": authored_pattern_seams,
        "already_indexed_manifold_edges": indexed_manifold_edges,
        "three_plus_layer_contacts_preserved": layer_conflicts,
        "vertices_merged": len(targetmap),
        "owner_groups": len(set(owner.values())),
    }


def inspect_pattern_boundaries(
    bm: bmesh.types.BMesh,
) -> list[dict[str, object]]:
    """Verify that every repaired pattern has one simple outer boundary."""
    groups = boundary_groups(bm)
    details = [group_detail(index, group) for index, group in enumerate(groups)]
    if len(groups) != 24:
        raise RuntimeError(f"Unexpected ID100 sewn boundary-group count: {len(groups)}")
    if not all(detail["simple_cycle"] for detail in details):
        raise RuntimeError("ID100 contains a branched pattern boundary")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    return details


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
        raise RuntimeError(f"Expected one ID100 mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    source = helpers.topology(bm)
    expected_source = {
        "vertices": 38905,
        "edges": 112428,
        "faces": 73547,
        "components": 64,
        "boundary_edges": 4215,
        "true_nonmanifold_edges": 0,
    }
    if source != expected_source:
        raise RuntimeError(f"Unexpected ID100 thin-source topology: {source}")

    weld = weld_continuation_patches_only(
        bm,
        helpers,
        args.tolerance,
    )
    sewn = helpers.topology(bm)
    expected_sewn = {
        "vertices": 38655,
        "edges": 112178,
        "faces": 73547,
        "components": 24,
        "boundary_edges": 3715,
        "true_nonmanifold_edges": 0,
    }
    if sewn != expected_sewn:
        raise RuntimeError(f"Unexpected ID100 sewn topology: {sewn}")
    expected_weld = {
        "continuation_edges_welded": 250,
        "authored_pattern_seams_preserved": 998,
        "vertices_merged": 250,
        "major_pattern_owners": 24,
        "owner_groups": 24,
    }
    for key, value in expected_weld.items():
        if weld[key] != value:
            raise RuntimeError(
                f"Unexpected ID100 weld {key}: {weld[key]} (expected {value})"
            )

    pattern_boundaries = inspect_pattern_boundaries(bm)
    repaired_surface = helpers.topology(bm)
    expected_surface = {
        "vertices": 38655,
        "edges": 112178,
        "faces": 73547,
        "components": 24,
        "boundary_edges": 3715,
        "true_nonmanifold_edges": 0,
    }
    if repaired_surface != expected_surface:
        raise RuntimeError(
            f"Unexpected ID100 topology after the 19 local fills: {repaired_surface}"
        )

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
    if rebuilt_uv["islands"] != 24:
        raise RuntimeError(f"Expected 24 repaired ID100 UV islands: {rebuilt_uv}")
    if args.pattern_surface_output:
        helpers.export_glb(args.pattern_surface_output, args.position_quantization)

    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    thickened = helpers.topology(bm)
    if (
        thickened["components"] != 24
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"ID100 restrained thickness did not close cleanly: {thickened}")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "preserve all 73,547 authored faces; weld only the 250 exact edges "
            "that attach 40 continuation fragments to their pattern owners; "
            "preserve 998 authored inter-pattern sewing edges as separate; "
            "synthesize no cap faces; rebuild 24 upright UV owner islands; "
            "add centered restrained thickness"
        ),
        "source": source,
        "weld": weld,
        "sewn": sewn,
        "pattern_boundaries": pattern_boundaries,
        "created_repair_faces": 0,
        "repaired_surface": repaired_surface,
        "rebuilt_uv": rebuilt_uv,
        "thickness": args.thickness,
        "thickened": thickened,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

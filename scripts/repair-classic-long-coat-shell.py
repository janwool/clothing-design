#!/usr/bin/env python3
"""Rebuild ID102 from its authored thin coat and base-layer surfaces.

The old catalog pass solidified 32 indexed source components independently.
Eight of those components are small but legitimate surface continuations: six
sleeve/cuff strips and two one-face collar-junction triangles.  Deleting either
triangle opens a real three-edge hole.  This repair welds only exact same-
material edges that are shared by exactly two faces, propagates the eight small
continuations to one of 24 measured pattern owners, preserves the boundaries
between every owner as UV seams, and adds centered thickness only after the two
physical garment groups are coherent.
"""

from __future__ import annotations

import argparse
import heapq
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id102_garment_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stitch_source_patterns(
    bm: bmesh.types.BMesh,
    helpers,
    tolerance: float,
    owner_min_faces: int,
) -> dict[str, object]:
    """Sew unambiguous continuations and retain all owner borders as UV seams."""

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    raw_components = helpers.components(bm)
    component_by_face = {
        face: component_index
        for component_index, faces in enumerate(raw_components)
        for face in faces
    }
    component_sizes = [len(faces) for faces in raw_components]
    component_materials = [
        sorted({face.material_index for face in faces})
        for faces in raw_components
    ]
    major_components = [
        index for index, size in enumerate(component_sizes)
        if size >= owner_min_faces
    ]
    if len(major_components) != 24:
        raise RuntimeError(f"Expected 24 ID102 pattern owners: {major_components}")

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
    predecessor = {}
    queue = []
    for root in major_components:
        candidate = (0, -component_sizes[root], root)
        best[root] = candidate
        heapq.heappush(queue, (*candidate, root))
    owner = {}
    owner_distance = {}
    while queue:
        distance, negative_size, root, component = heapq.heappop(queue)
        if best.get(component) != (distance, negative_size, root):
            continue
        owner[component] = root
        owner_distance[component] = distance
        for neighbor in neighbors[component]:
            candidate = (distance + 1, negative_size, root)
            if neighbor not in best or candidate < best[neighbor]:
                best[neighbor] = candidate
                predecessor[neighbor] = component
                heapq.heappush(queue, (*candidate, neighbor))
    missing = sorted(set(range(len(raw_components))) - set(owner))
    if missing:
        raise RuntimeError(f"ID102 components without a pattern owner: {missing}")

    uv_layer = bm.loops.layers.uv.active
    if uv_layer is None:
        raise RuntimeError("ID102 source has no UV layer")

    def edge_uvs(face, a, b):
        wanted_vertices = {a, b}
        return {
            position_key[loop.vert]: loop[uv_layer].uv.copy()
            for loop in face.loops
            if loop.vert in wanted_vertices
        }

    uv_stitches = []
    for component_index in sorted(
        (index for index in range(len(raw_components)) if index not in major_components),
        key=lambda index: (owner_distance[index], index),
    ):
        parent_component = predecessor.get(component_index)
        if parent_component is None:
            raise RuntimeError(f"ID102 continuation {component_index} has no UV parent")
        candidates = []
        for geometric_key, entries in edge_entries.items():
            if len(entries) != 2:
                continue
            entry_a, entry_b = entries
            component_a = component_by_face[entry_a[0]]
            component_b = component_by_face[entry_b[0]]
            if {component_a, component_b} != {component_index, parent_component}:
                continue
            child_entry = entry_a if component_a == component_index else entry_b
            parent_entry = entry_b if component_a == component_index else entry_a
            candidates.append(
                (
                    (child_entry[1].co - child_entry[2].co).length,
                    geometric_key,
                    child_entry,
                    parent_entry,
                )
            )
        if not candidates:
            raise RuntimeError(
                f"ID102 continuation {component_index} has no exact edge to parent {parent_component}"
            )
        _length, geometric_key, child_entry, parent_entry = max(
            candidates, key=lambda row: row[0]
        )
        child_uvs = edge_uvs(*child_entry)
        parent_uvs = edge_uvs(*parent_entry)
        if set(child_uvs) != set(parent_uvs) or len(child_uvs) != 2:
            raise RuntimeError(f"ID102 UV endpoint mismatch at {geometric_key}")
        keys = sorted(child_uvs)
        child_start, child_end = child_uvs[keys[0]], child_uvs[keys[1]]
        parent_start, parent_end = parent_uvs[keys[0]], parent_uvs[keys[1]]
        child_delta = child_end - child_start
        parent_delta = parent_end - parent_start
        if child_delta.length <= 1e-10 or parent_delta.length <= 1e-10:
            raise RuntimeError(f"ID102 degenerate UV stitch edge at {geometric_key}")
        uv_scale = parent_delta.length / child_delta.length
        angle = math.atan2(parent_delta.y, parent_delta.x) - math.atan2(
            child_delta.y, child_delta.x
        )
        cosine, sine = math.cos(angle), math.sin(angle)
        for face in raw_components[component_index]:
            for loop in face.loops:
                relative = loop[uv_layer].uv - child_start
                rotated_x = relative.x * cosine - relative.y * sine
                rotated_y = relative.x * sine + relative.y * cosine
                loop[uv_layer].uv = parent_start + uv_scale * type(relative)(
                    (rotated_x, rotated_y)
                )
        transformed_child = edge_uvs(*child_entry)
        residual = max(
            (transformed_child[key] - parent_uvs[key]).length
            for key in keys
        )
        uv_stitches.append(
            {
                "component": component_index,
                "parent": parent_component,
                "owner": owner[component_index],
                "owner_distance": owner_distance[component_index],
                "edge": [list(geometric_key[0]), list(geometric_key[1])],
                "scale": round(float(uv_scale), 9),
                "rotation_degrees": round(math.degrees(angle), 6),
                "endpoint_residual": round(float(residual), 12),
            }
        )

    dsu = helpers.DisjointSet(len(bm.verts))
    same_material_seams = 0
    already_indexed = 0
    different_material_contacts = 0
    layer_conflicts = 0
    owner_seam_keys = set()
    continuation_edges = 0
    for geometric_key, entries in edge_entries.items():
        if len(entries) > 2:
            layer_conflicts += 1
            continue
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        component_a = component_by_face[face_a]
        component_b = component_by_face[face_b]
        if face_a.material_index != face_b.material_index:
            different_material_contacts += 1
            continue
        if {a0.index, a1.index} == {b0.index, b1.index}:
            already_indexed += 1
            continue
        endpoints_a = {position_key[a0]: a0, position_key[a1]: a1}
        endpoints_b = {position_key[b0]: b0, position_key[b1]: b1}
        if set(endpoints_a) != set(endpoints_b):
            raise RuntimeError(f"ID102 endpoint mismatch at {geometric_key}")
        if owner[component_a] != owner[component_b]:
            owner_seam_keys.add(geometric_key)
        else:
            continuation_edges += 1
        for key in endpoints_a:
            dsu.union(endpoints_a[key].index, endpoints_b[key].index)
        same_material_seams += 1

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
        a, b = edge.verts
        key_a = tuple(round(float(value) * scale) for value in a.co)
        key_b = tuple(round(float(value) * scale) for value in b.co)
        edge.seam = tuple(sorted((key_a, key_b))) in owner_seam_keys

    material_owner_counts = defaultdict(set)
    for component_index, root in owner.items():
        for material_index in component_materials[component_index]:
            material_owner_counts[material_index].add(root)
    continuation_components = [
        {
            "component": index,
            "faces": component_sizes[index],
            "owner": owner[index],
            "owner_distance": owner_distance[index],
            "material": component_materials[index],
        }
        for index in range(len(raw_components))
        if index not in major_components
    ]
    return {
        "geometric_edges": len(edge_entries),
        "unambiguous_same_material_seams": same_material_seams,
        "already_indexed_manifold_edges": already_indexed,
        "different_material_contacts_preserved": different_material_contacts,
        "three_plus_layer_contacts_preserved": layer_conflicts,
        "vertices_merged": len(targetmap),
        "owner_seam_edges": len(owner_seam_keys),
        "continuation_edges": continuation_edges,
        "pattern_owners": len(major_components),
        "owner_groups": len(set(owner.values())),
        "material_owner_counts": {
            str(material): len(roots)
            for material, roots in sorted(material_owner_counts.items())
        },
        "uv_stitches": uv_stitches,
        "continuation_components": continuation_components,
    }


def pack_existing_uv(obj: bpy.types.Object, helpers, margin: float) -> dict[str, object]:
    """Keep the authored charts, orient them upright, then repack without rotation."""

    before = len(helpers.uv_islands(obj.data))
    orientation = helpers.orient_uv_islands_upright(obj.data)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=False, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    return {
        "islands_before_pack": before,
        "islands": len(helpers.uv_islands(obj.data)),
        "margin": margin,
        "orientation": orientation,
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--pattern-surface-output", type=Path)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--owner-min-faces", type=int, default=50)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--uv-margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one ID102 mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    source = helpers.topology(bm)
    expected_source = {
        "vertices": 10712,
        "edges": 30121,
        "faces": 19441,
        "components": 32,
        "boundary_edges": 1919,
        "true_nonmanifold_edges": 0,
    }
    if source != expected_source:
        raise RuntimeError(f"Unexpected ID102 thin-source topology: {source}")

    weld = stitch_source_patterns(
        bm,
        helpers,
        args.tolerance,
        args.owner_min_faces,
    )
    expected_weld = {
        "unambiguous_same_material_seams": 714,
        "vertices_merged": 748,
        "three_plus_layer_contacts_preserved": 0,
        "pattern_owners": 24,
        "owner_groups": 24,
    }
    for key, expected in expected_weld.items():
        if weld[key] != expected:
            raise RuntimeError(f"Unexpected ID102 {key}: {weld[key]} (expected {expected})")
    continuation_indices = [row["component"] for row in weld["continuation_components"]]
    if continuation_indices != [9, 11, 14, 17, 19, 21, 27, 30]:
        raise RuntimeError(f"Unexpected ID102 continuation set: {continuation_indices}")

    repaired = helpers.topology(bm)
    expected_repaired = {
        "vertices": 9964,
        "edges": 29407,
        "faces": 19441,
        "components": 2,
        "boundary_edges": 491,
        "true_nonmanifold_edges": 0,
    }
    if repaired != expected_repaired:
        raise RuntimeError(f"Unexpected ID102 sewn topology: {repaired}")

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    rebuilt_uv = pack_existing_uv(obj, helpers, args.uv_margin)
    if rebuilt_uv["islands"] != 24:
        raise RuntimeError(f"Expected 24 coherent ID102 UV owners: {rebuilt_uv}")
    if args.pattern_surface_output:
        helpers.export_glb(args.pattern_surface_output, args.position_quantization)

    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    normals_before = [face.normal.copy() for face in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    normal_faces_reoriented = sum(
        before.dot(face.normal) < 0
        for before, face in zip(normals_before, bm.faces)
    )
    thickened = helpers.topology(bm)
    if (
        thickened["components"] != 2
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"ID102 centered thickness did not close cleanly: {thickened}")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "return to the authored thin coat/base layer; retain both one-face "
            "collar-junction triangles because their edges close real holes; "
            "weld only exact same-material two-face seams; propagate eight "
            "continuations to 24 pattern owners; preserve every owner border as "
            "a UV seam; add centered 0.004 fabric thickness only after sewing"
        ),
        "diagnosis": {
            "old_independent_solidify_components": 32,
            "physical_garment_groups": 2,
            "pattern_owners": 24,
            "continuation_components": [9, 11, 14, 17, 19, 21, 27, 30],
            "single_triangle_continuations": [27, 30],
        },
        "tolerance": args.tolerance,
        "owner_min_faces": args.owner_min_faces,
        "thickness": args.thickness,
        "source": source,
        "weld": weld,
        "repaired": repaired,
        "rebuilt_uv": rebuilt_uv,
        "pattern_surface_output": str(args.pattern_surface_output) if args.pattern_surface_output else None,
        "thickened": thickened,
        "physical_faces_reoriented_by_outside_recalculate": normal_faces_reoriented,
        "thickened_uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

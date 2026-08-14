#!/usr/bin/env python3
"""Diagnose the fragmented thin source for catalog model ID 103.

The report groups raw indexed components only through exact geometric edges
shared by two faces.  This reveals which fragments are true continuations and
which physical groups must stay independent before any repair is attempted.
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
    spec = importlib.util.spec_from_file_location("id103_seam_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def component_bbox(faces):
    vertices = {vertex for face in faces for vertex in face.verts}
    minimum = [min(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    maximum = [max(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    return [round(float(value), 6) for value in (*minimum, *maximum)]


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--owner-min-faces", type=int, default=700)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")

    bm = bmesh.new()
    bm.from_mesh(objects[0].data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    raw_components = helpers.components(bm)
    component_by_face = {
        face: index
        for index, faces in enumerate(raw_components)
        for face in faces
    }
    component_sizes = [len(faces) for faces in raw_components]
    scale = 1.0 / args.tolerance
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
    seam_edges = defaultdict(int)
    for entries in edge_entries.values():
        if len(entries) != 2:
            continue
        face_a, face_b = entries[0][0], entries[1][0]
        component_a = component_by_face[face_a]
        component_b = component_by_face[face_b]
        if component_a == component_b or face_a.material_index != face_b.material_index:
            continue
        neighbors[component_a].add(component_b)
        neighbors[component_b].add(component_a)
        seam_edges[tuple(sorted((component_a, component_b)))] += 1

    physical_groups = []
    pending = set(range(len(raw_components)))
    while pending:
        seed = min(pending)
        pending.remove(seed)
        queue = deque([seed])
        group = [seed]
        while queue:
            component = queue.popleft()
            for other in neighbors[component]:
                if other in pending:
                    pending.remove(other)
                    queue.append(other)
                    group.append(other)
        physical_groups.append(sorted(group))

    major_components = {
        index for index, size in enumerate(component_sizes)
        if size >= args.owner_min_faces
    }
    group_rows = []
    for index, group in enumerate(physical_groups):
        faces = [face for component in group for face in raw_components[component]]
        group_rows.append(
            {
                "index": index,
                "raw_components": len(group),
                "faces": len(faces),
                "bbox": component_bbox(faces),
                "major_components": sorted(major_components.intersection(group)),
                "largest_components": sorted(
                    (
                        {
                            "index": component,
                            "faces": component_sizes[component],
                            "bbox": component_bbox(raw_components[component]),
                        }
                        for component in group
                    ),
                    key=lambda row: (-row["faces"], row["index"]),
                )[:20],
            }
        )
    group_rows.sort(key=lambda row: (-row["faces"], row["index"]))

    report = {
        "input": str(args.input),
        "tolerance": args.tolerance,
        "owner_min_faces": args.owner_min_faces,
        "source": helpers.topology(bm),
        "geometric_edge_keys": len(edge_entries),
        "exact_cross_component_seam_keys": sum(seam_edges.values()),
        "raw_components": len(raw_components),
        "major_components": len(major_components),
        "physical_groups": group_rows,
    }
    bm.free()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

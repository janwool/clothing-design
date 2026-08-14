#!/usr/bin/env python3
"""Diagnose the thin source used by catalog model ID 104.

The asset is a long high-collar coat/dress despite its catalog name.  Its
surface contains twelve substantial authored panels and thirty-seven tiny
continuations.  This report groups those indexed pieces only across exact
two-face geometric seams so repairs cannot accidentally weld seated layers.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id104_analysis_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def bounds(faces):
    vertices = {vertex for face in faces for vertex in face.verts}
    return [
        round(float(value), 6)
        for value in (
            *(min(vertex.co[axis] for vertex in vertices) for axis in range(3)),
            *(max(vertex.co[axis] for vertex in vertices) for axis in range(3)),
        )
    ]


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--owner-min-faces", type=int, default=300)
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
    source = helpers.topology(bm)
    raw_components = helpers.components(bm)
    sizes = [len(faces) for faces in raw_components]
    component_by_face = {
        face: index for index, faces in enumerate(raw_components) for face in faces
    }
    scale = 1.0 / args.tolerance
    position_key = {
        vertex: tuple(round(float(value) * scale) for value in vertex.co)
        for vertex in bm.verts
    }
    edge_entries = defaultdict(list)
    for face in bm.faces:
        for edge in face.edges:
            first, second = edge.verts
            key = tuple(sorted((position_key[first], position_key[second])))
            if key[0] != key[1]:
                edge_entries[key].append((face, first, second))

    neighbors = defaultdict(set)
    seam_counts = Counter()
    layer_conflicts = 0
    layer_contact_rows = []
    layer_component_sets = Counter()
    for geometric_key, entries in edge_entries.items():
        if len(entries) > 2:
            layer_conflicts += 1
            component_set = tuple(sorted({component_by_face[item[0]] for item in entries}))
            layer_component_sets[component_set] += 1
            start, end = geometric_key
            layer_contact_rows.append(
                {
                    "multiplicity": len(entries),
                    "components": list(component_set),
                    "center": [
                        round((start[axis] + end[axis]) * 0.5 / scale, 6)
                        for axis in range(3)
                    ],
                    "length": round(
                        sum(((end[axis] - start[axis]) / scale) ** 2 for axis in range(3)) ** 0.5,
                        8,
                    ),
                }
            )
            continue
        if len(entries) != 2:
            continue
        face_a, face_b = entries[0][0], entries[1][0]
        component_a, component_b = component_by_face[face_a], component_by_face[face_b]
        if component_a == component_b or face_a.material_index != face_b.material_index:
            continue
        neighbors[component_a].add(component_b)
        neighbors[component_b].add(component_a)
        seam_counts[tuple(sorted((component_a, component_b)))] += 1

    groups = []
    pending = set(range(len(raw_components)))
    while pending:
        seed = min(pending)
        pending.remove(seed)
        queue = deque([seed])
        group = [seed]
        while queue:
            component = queue.popleft()
            for neighbor in neighbors[component]:
                if neighbor in pending:
                    pending.remove(neighbor)
                    queue.append(neighbor)
                    group.append(neighbor)
        groups.append(sorted(group))

    major = {index for index, size in enumerate(sizes) if size >= args.owner_min_faces}
    group_rows = []
    for index, group in enumerate(groups):
        faces = [face for component in group for face in raw_components[component]]
        group_rows.append(
            {
                "index": index,
                "raw_components": len(group),
                "faces": len(faces),
                "bbox": bounds(faces),
                "major_components": sorted(major.intersection(group)),
                "continuation_components": sorted(set(group) - major),
            }
        )

    report = {
        "input": str(args.input),
        "tolerance": args.tolerance,
        "source": source,
        "owner_min_faces": args.owner_min_faces,
        "raw_components": len(raw_components),
        "component_face_distribution": dict(sorted(Counter(sizes).items())),
        "major_pattern_owners": len(major),
        "small_surface_continuations": len(raw_components) - len(major),
        "exact_cross_component_seam_edges": sum(seam_counts.values()),
        "three_plus_layer_edge_contacts": layer_conflicts,
        "layer_contact_component_sets": [
            {"components": list(components), "edges": count}
            for components, count in sorted(
                layer_component_sets.items(), key=lambda item: (-item[1], item[0])
            )
        ],
        "layer_contacts": sorted(
            layer_contact_rows,
            key=lambda row: (row["center"][1], row["center"][0], row["center"][2]),
        ),
        "physical_groups": group_rows,
    }
    bm.free()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Compare topology after virtually removing explicit connected components.

This is a read-only diagnostic.  It imports the GLB once, classifies indexed
face components, then reports both indexed and position-welded edge counts for
each requested removal set without exporting or mutating an asset.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components: list[list[int]] = []
    visited: set[int] = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        component: list[int] = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def edge_counts(mesh: bpy.types.Mesh, kept_faces: set[int], tolerance: float) -> dict[str, object]:
    scale = 1.0 / tolerance
    position_keys = [
        tuple(round(value * scale) for value in vertex.co)
        for vertex in mesh.vertices
    ]
    indexed: dict[tuple[int, int], list[int]] = defaultdict(list)
    welded: dict[tuple[tuple[int, int, int], tuple[int, int, int]], list[int]] = defaultdict(list)
    for face_index in kept_faces:
        vertices = list(mesh.polygons[face_index].vertices)
        for index, start in enumerate(vertices):
            end = vertices[(index + 1) % len(vertices)]
            indexed[tuple(sorted((start, end)))].append(face_index)
            a, b = position_keys[start], position_keys[end]
            if a != b:
                welded[tuple(sorted((a, b)))].append(face_index)

    def summary(rows):
        return {
            "boundary_edges": sum(len(faces) == 1 for faces in rows.values()),
            "overfull_edges": sum(len(faces) > 2 for faces in rows.values()),
            "non_manifold_edges": sum(len(faces) != 2 for faces in rows.values()),
            "overfull_face_counts": sorted(
                (len(faces) for faces in rows.values() if len(faces) > 2), reverse=True
            )[:20],
        }

    return {"indexed": summary(indexed), "position_welded": summary(welded)}


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--sets",
        required=True,
        help="Semicolon-separated component-index sets, for example 0,11;1;2;1,2",
    )
    parser.add_argument("--tolerance", type=float, default=1e-5)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    components = face_components(mesh)
    all_faces = set(range(len(mesh.polygons)))
    rows = []
    for raw_set in args.sets.split(";"):
        indices = sorted({int(value) for value in raw_set.split(",") if value.strip()})
        missing = set(indices) - set(range(len(components)))
        if missing:
            raise ValueError(f"Unknown component indices: {sorted(missing)}")
        removed_faces = {face for index in indices for face in components[index]}
        rows.append(
            {
                "components_removed": indices,
                "faces_removed": len(removed_faces),
                "faces_kept": len(all_faces) - len(removed_faces),
                **edge_counts(mesh, all_faces - removed_faces, args.tolerance),
            }
        )

    payload = {
        "input": str(args.input),
        "tolerance": args.tolerance,
        "component_count": len(components),
        "variants": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2), flush=True)


if __name__ == "__main__":
    main()

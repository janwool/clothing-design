#!/usr/bin/env python3
"""Report the exact main-shell faces touched by one ID101 micro repair solid."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils.kdtree import KDTree


def face_components(mesh):
    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        for edge in polygon.edge_keys:
            edge_faces[edge].append(polygon.index)
    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    unseen = set(range(len(mesh.polygons)))
    result = []
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        queue = deque([seed])
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        result.append(component)
    return result, edge_faces


def vector(values):
    return [round(float(value), 9) for value in values]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("small_component", type=int)
    parser.add_argument("main_component", type=int)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    components, edge_faces = face_components(mesh)
    small_faces = components[args.small_component]
    main_faces = set(components[args.main_component])
    small_vertices = sorted({vertex for face in small_faces for vertex in mesh.polygons[face].vertices})
    main_vertices = sorted({vertex for face in main_faces for vertex in mesh.polygons[face].vertices})
    tree = KDTree(len(main_vertices))
    for vertex in main_vertices:
        tree.insert(mesh.vertices[vertex].co, vertex)
    tree.balance()
    pairs = []
    paired_main = set()
    for small_vertex in small_vertices:
        _coordinate, main_vertex, distance = tree.find(mesh.vertices[small_vertex].co)
        paired_main.add(main_vertex)
        pairs.append({
            "small_vertex": small_vertex,
            "main_vertex": main_vertex,
            "distance": round(float(distance), 9),
        })

    touched = sorted(
        face for face in main_faces
        if paired_main.intersection(mesh.polygons[face].vertices)
    )
    rows = []
    for face in touched:
        polygon = mesh.polygons[face]
        neighbors = sorted({
            other
            for edge in polygon.edge_keys
            for other in edge_faces[edge]
            if other != face and other in main_faces
        })
        rows.append({
            "face": face,
            "paired_vertices": sorted(paired_main.intersection(polygon.vertices)),
            "vertices": list(polygon.vertices),
            "coordinates": [vector(mesh.vertices[index].co) for index in polygon.vertices],
            "center": vector(polygon.center),
            "normal": vector(polygon.normal),
            "area": round(float(polygon.area), 12),
            "neighbors": [
                {
                    "face": other,
                    "normal": vector(mesh.polygons[other].normal),
                    "dot": round(float(polygon.normal.dot(mesh.polygons[other].normal)), 9),
                }
                for other in neighbors
            ],
        })
    report = {
        "input": str(args.input),
        "small_component": args.small_component,
        "main_component": args.main_component,
        "pairs": pairs,
        "paired_main_vertices": sorted(paired_main),
        "touched_faces": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

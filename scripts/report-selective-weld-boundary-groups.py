#!/usr/bin/env python3
"""Report physical boundary groups after the selective two-face seam weld."""

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
    spec = importlib.util.spec_from_file_location("selective_weld_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helpers from {path}")
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


def group_detail(group):
    vertices = {vertex for edge in group for vertex in edge.verts}
    center = sum((vertex.co for vertex in vertices), Vector()) / len(vertices)
    minimum = [min(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    maximum = [max(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    degrees = {
        vertex: sum(1 for edge in group if vertex in edge.verts)
        for vertex in vertices
    }
    return {
        "edges": len(group),
        "vertices": len(vertices),
        "perimeter": round(sum(edge.calc_length() for edge in group), 9),
        "center": [round(float(value), 6) for value in center],
        "bbox": [round(float(value), 6) for value in (*minimum, *maximum)],
        "simple_cycle": all(degree == 2 for degree in degrees.values()),
        "branch_vertices": sum(degree != 2 for degree in degrees.values()),
    }


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--uv-owner-min-faces", type=int, default=100)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    bm = bmesh.new()
    bm.from_mesh(objects[0].data)
    source = helpers.topology(bm)
    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        args.uv_owner_min_faces,
    )
    sewn = helpers.topology(bm)
    details = [group_detail(group) for group in boundary_groups(bm)]
    details.sort(key=lambda row: (row["perimeter"], row["center"]))
    for index, detail in enumerate(details):
        detail["index"] = index
    payload = {
        "input": str(args.input),
        "source": source,
        "weld": weld,
        "sewn": sewn,
        "boundary_groups": details,
    }
    bm.free()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2), flush=True)


if __name__ == "__main__":
    main()

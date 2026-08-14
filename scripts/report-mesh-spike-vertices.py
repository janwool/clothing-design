#!/usr/bin/env python3
"""Report vertices whose one-ring geometry looks like a local spike or pit.

Run through Blender so GLB import uses Blender's glTF implementation:
  blender --background --python scripts/report-mesh-spike-vertices.py -- input.glb report.json
"""

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def argv_after_separator():
    if "--" not in sys.argv:
        raise SystemExit("Expected: -- input.glb report.json")
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Expected: -- input.glb report.json")
    return Path(args[0]), Path(args[1])


def percentile(values, q):
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return ordered[lo]
    alpha = pos - lo
    return ordered[lo] * (1.0 - alpha) + ordered[hi] * alpha


def connected_component_ids(bm):
    component = {}
    component_index = 0
    for seed in bm.verts:
        if seed.index in component:
            continue
        stack = [seed]
        component[seed.index] = component_index
        while stack:
            vert = stack.pop()
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other.index not in component:
                    component[other.index] = component_index
                    stack.append(other)
        component_index += 1
    return component


def analyze_object(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    component = connected_component_ids(bm)
    rows = []
    for vert in bm.verts:
        neighbors = [edge.other_vert(vert) for edge in vert.link_edges]
        if len(neighbors) < 3 or not vert.link_faces:
            continue
        lengths = [(neighbor.co - vert.co).length for neighbor in neighbors]
        median_edge = percentile(lengths, 0.5)
        if median_edge <= 1e-12:
            continue

        centroid = Vector((0.0, 0.0, 0.0))
        for neighbor in neighbors:
            centroid += neighbor.co
        centroid /= len(neighbors)
        laplacian = (vert.co - centroid).length
        laplacian_ratio = laplacian / median_edge

        face_normals = [face.normal.copy() for face in vert.link_faces]
        mean_normal = Vector((0.0, 0.0, 0.0))
        for normal in face_normals:
            mean_normal += normal
        if mean_normal.length > 1e-12:
            mean_normal.normalize()
        max_normal_angle = 0.0
        for normal in face_normals:
            dot = max(-1.0, min(1.0, normal.dot(mean_normal)))
            max_normal_angle = max(max_normal_angle, math.degrees(math.acos(dot)))

        rows.append(
            {
                "vertex": vert.index,
                "component": component[vert.index],
                "co": [round(value, 6) for value in vert.co],
                "neighbors": len(neighbors),
                "median_edge": round(median_edge, 8),
                "max_edge_ratio": round(max(lengths) / median_edge, 6),
                "laplacian": round(laplacian, 8),
                "laplacian_ratio": round(laplacian_ratio, 6),
                "max_normal_angle_degrees": round(max_normal_angle, 4),
            }
        )

    ratios = [row["laplacian_ratio"] for row in rows]
    angles = [row["max_normal_angle_degrees"] for row in rows]
    rows.sort(
        key=lambda row: (
            row["laplacian_ratio"] * (1.0 + row["max_normal_angle_degrees"] / 90.0),
            row["max_normal_angle_degrees"],
        ),
        reverse=True,
    )
    result = {
        "object": obj.name,
        "vertices_analyzed": len(rows),
        "components": max(component.values(), default=-1) + 1,
        "laplacian_ratio_percentiles": {
            str(q): round(percentile(ratios, q), 6)
            for q in (0.5, 0.9, 0.95, 0.99, 0.995, 0.999)
        },
        "normal_angle_percentiles": {
            str(q): round(percentile(angles, q), 4)
            for q in (0.5, 0.9, 0.95, 0.99, 0.995, 0.999)
        },
        "top_vertices": rows[:1000],
    }
    bm.free()
    return result


def main():
    input_path, output_path = argv_after_separator()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = {
        "input": str(input_path),
        "objects": [analyze_object(obj) for obj in objects],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output_path), "objects": len(objects)}, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Trim one diagnosed component at a plane and close only the new cut loop."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def connected_components(bm: bmesh.types.BMesh) -> list[set[bmesh.types.BMFace]]:
    unseen = set(bm.faces)
    result = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        faces = {seed}
        while stack:
            face = stack.pop()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unseen:
                        unseen.remove(linked)
                        faces.add(linked)
                        stack.append(linked)
        result.append(faces)
    result.sort(key=lambda faces: min(face.index for face in faces))
    return result


def boundary_groups(edges: list[bmesh.types.BMEdge]) -> list[list[bmesh.types.BMEdge]]:
    by_vertex: dict[bmesh.types.BMVert, set[bmesh.types.BMEdge]] = defaultdict(set)
    for edge in edges:
        for vertex in edge.verts:
            by_vertex[vertex].add(edge)
    pending = set(edges)
    result = []
    while pending:
        seed = pending.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for neighbor in by_vertex[vertex]:
                    if neighbor in pending:
                        pending.remove(neighbor)
                        queue.append(neighbor)
                        group.append(neighbor)
        result.append(group)
    return result


def ordered_loop(edges: list[bmesh.types.BMEdge]) -> list[bmesh.types.BMVert]:
    adjacency: dict[bmesh.types.BMVert, list[bmesh.types.BMVert]] = defaultdict(list)
    for edge in edges:
        first, second = edge.verts
        adjacency[first].append(second)
        adjacency[second].append(first)
    if any(len(neighbors) != 2 for neighbors in adjacency.values()):
        raise RuntimeError("Cut boundary is not a simple closed loop")
    start, current = edges[0].verts
    result = [start, current]
    previous = start
    while True:
        following = next(vertex for vertex in adjacency[current] if vertex is not previous)
        if following is start:
            break
        if following in result:
            raise RuntimeError("Cut boundary repeats a vertex before closing")
        result.append(following)
        previous, current = current, following
    if len(result) != len(edges):
        raise RuntimeError("Cut boundary ordering omitted an edge")
    return result


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--component", type=int, required=True)
    parser.add_argument("--axis", choices=("x", "y", "z"), default="y")
    parser.add_argument("--cutoff", type=float, required=True)
    parser.add_argument(
        "--remove-side", choices=("less", "greater"), default="less",
        help="Remove coordinates less than or greater than the cutoff.",
    )
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    groups = connected_components(bm)
    target_faces = groups[args.component]
    target_edges = {edge for face in target_faces for edge in face.edges}
    target_verts = {vertex for face in target_faces for vertex in face.verts}
    axis_index = {"x": 0, "y": 1, "z": 2}[args.axis]
    plane_co = Vector((0.0, 0.0, 0.0))
    plane_no = Vector((0.0, 0.0, 0.0))
    plane_co[axis_index] = args.cutoff
    plane_no[axis_index] = 1.0
    before = {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "boundary_edges": sum(1 for edge in bm.edges if edge.is_boundary),
    }
    bmesh.ops.bisect_plane(
        bm,
        geom=[*target_verts, *target_edges, *target_faces],
        dist=1e-7,
        plane_co=plane_co,
        plane_no=plane_no,
        clear_inner=args.remove_side == "less",
        clear_outer=args.remove_side == "greater",
    )
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    cut_edges = [
        edge
        for edge in bm.edges
        if edge.is_boundary
        and all(abs(vertex.co[axis_index] - args.cutoff) <= 1e-5 for vertex in edge.verts)
    ]
    cut_groups = boundary_groups(cut_edges)
    if len(cut_groups) != 1:
        raise RuntimeError(f"Expected one cut boundary loop, found {len(cut_groups)}")
    loop_vertices = ordered_loop(cut_groups[0])
    uv_layer = bm.loops.layers.uv.active
    uv_by_vertex = {}
    if uv_layer is not None:
        for vertex in loop_vertices:
            retained_loops = [
                loop
                for face in vertex.link_faces
                for loop in face.loops
                if loop.vert is vertex
            ]
            if retained_loops:
                uv_by_vertex[vertex] = retained_loops[0][uv_layer].uv.copy()
    material_counts = Counter(
        face.material_index for edge in cut_groups[0] for face in edge.link_faces
    )
    cap = bm.faces.new(loop_vertices)
    cap.material_index = material_counts.most_common(1)[0][0] if material_counts else 0
    cap.smooth = True
    bm.normal_update()
    wanted_direction = -1.0 if args.remove_side == "less" else 1.0
    if cap.normal[axis_index] * wanted_direction < 0:
        cap.normal_flip()
    triangulated = bmesh.ops.triangulate(bm, faces=[cap])
    cap_faces = list(triangulated.get("faces", [cap]))
    for face in cap_faces:
        face.material_index = cap.material_index
        face.smooth = True
        if uv_layer is not None:
            for loop in face.loops:
                if loop.vert in uv_by_vertex:
                    loop[uv_layer].uv = uv_by_vertex[loop.vert]
    bm.normal_update()
    report = {
        "component": args.component,
        "axis": args.axis,
        "cutoff": args.cutoff,
        "remove_side": args.remove_side,
        "before": before,
        "cut_loop_edges": len(cut_groups[0]),
        "cut_loop_vertices": len(loop_vertices),
        "cap_faces": len(cap_faces),
        "after": {
            "vertices": len(bm.verts),
            "faces": len(bm.faces),
            "boundary_edges": sum(1 for edge in bm.edges if edge.is_boundary),
            "nonmanifold_edges": sum(
                1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary
            ),
            "zero_area_faces": sum(1 for face in bm.faces if face.calc_area() <= 1e-12),
        },
    }
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

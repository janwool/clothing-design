#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def boundary_summary(bm: bmesh.types.BMesh) -> dict[str, object]:
    boundary_edges = [edge for edge in bm.edges if len(edge.link_faces) == 1]
    vertices = {vertex for edge in boundary_edges for vertex in edge.verts}
    bbox = None
    if vertices:
        bbox = [
            min(vertex.co[axis] for vertex in vertices)
            for axis in range(3)
        ] + [
            max(vertex.co[axis] for vertex in vertices)
            for axis in range(3)
        ]
    return {"edges": len(boundary_edges), "vertices": len(vertices), "bbox": bbox}


def boundary_groups(edges: list[bmesh.types.BMEdge]) -> list[list[bmesh.types.BMEdge]]:
    vertex_edges: dict[bmesh.types.BMVert, set[bmesh.types.BMEdge]] = defaultdict(set)
    for edge in edges:
        for vertex in edge.verts:
            vertex_edges[vertex].add(edge)
    groups = []
    pending = set(edges)
    while pending:
        seed = pending.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for neighbor in vertex_edges[vertex]:
                    if neighbor in pending:
                        pending.remove(neighbor)
                        queue.append(neighbor)
                        group.append(neighbor)
        groups.append(group)
    return groups


def ordered_boundary_vertices(group: list[bmesh.types.BMEdge]) -> list[bmesh.types.BMVert]:
    adjacency: dict[bmesh.types.BMVert, list[bmesh.types.BMVert]] = defaultdict(list)
    for edge in group:
        first, second = edge.verts
        adjacency[first].append(second)
        adjacency[second].append(first)
    if any(len(neighbors) != 2 for neighbors in adjacency.values()):
        raise ValueError("Boundary group is not a simple loop")
    start, current = group[0].verts
    ordered = [start, current]
    previous = start
    while True:
        next_vertex = next(vertex for vertex in adjacency[current] if vertex is not previous)
        if next_vertex is start:
            break
        ordered.append(next_vertex)
        previous, current = current, next_vertex
    return ordered


def fill_small_boundaries(bm, max_perimeter: float, max_edges: int) -> dict[str, object]:
    groups = boundary_groups([edge for edge in bm.edges if len(edge.link_faces) == 1])
    uv_layer = bm.loops.layers.uv.active
    filled = []
    skipped = []
    for group in groups:
        perimeter = sum(edge.calc_length() for edge in group)
        if len(group) < 3 or len(group) > max_edges or perimeter > max_perimeter:
            skipped.append({"edges": len(group), "perimeter": round(perimeter, 8)})
            continue
        try:
            vertices = ordered_boundary_vertices(group)
        except ValueError as error:
            degree_counts = Counter(
                sum(1 for edge in group if vertex in edge.verts)
                for vertex in {vertex for edge in group for vertex in edge.verts}
            )
            skipped.append(
                {
                    "edges": len(group),
                    "perimeter": round(perimeter, 8),
                    "reason": str(error),
                    "vertex_degree_distribution": dict(sorted(degree_counts.items())),
                }
            )
            continue
        adjacent_faces = {face for edge in group for face in edge.link_faces}
        reference_normal = sum((face.normal for face in adjacent_faces), Vector())
        material_counts = Counter(face.material_index for face in adjacent_faces)
        uv_choices = {}
        if uv_layer is not None:
            for vertex in vertices:
                values = [
                    tuple(round(float(value), 9) for value in loop[uv_layer].uv)
                    for loop in vertex.link_loops
                    if loop.face.is_valid
                ]
                if values:
                    chosen = Counter(values).most_common(1)[0][0]
                    uv_choices[vertex] = chosen
                    for loop in vertex.link_loops:
                        if loop.face.is_valid:
                            loop[uv_layer].uv = chosen
        created = [bm.faces.new(vertices)]
        if len(vertices) > 3:
            created = list(bmesh.ops.triangulate(bm, faces=created).get("faces", created))
        material_index = material_counts.most_common(1)[0][0] if material_counts else 0
        for face in created:
            if reference_normal.length_squared and face.normal.dot(reference_normal) < 0:
                face.normal_flip()
            face.material_index = material_index
            face.smooth = True
            if uv_layer is not None:
                for loop in face.loops:
                    if loop.vert in uv_choices:
                        loop[uv_layer].uv = uv_choices[loop.vert]
        if any(face.calc_area() <= 1e-12 for face in created):
            raise RuntimeError("Boundary fill created a zero-area face")
        filled.append({"edges": len(group), "perimeter": round(perimeter, 8), "faces": len(created)})
    bm.normal_update()
    return {
        "groups_before": len(groups),
        "filled": filled,
        "skipped": skipped,
        "boundary_after": boundary_summary(bm),
    }


def weld_object(
    obj: bpy.types.Object,
    distance: float,
    axis: str | None,
    min_coordinate: float | None,
    max_coordinate: float | None,
    preserve_normals: bool,
    unify_welded_uvs: bool,
    fill_boundary_max_perimeter: float,
    fill_boundary_max_edges: int,
) -> dict[str, object]:
    mesh = obj.data
    vertices_before = len(mesh.vertices)
    faces_before = len(mesh.polygons)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary_before = boundary_summary(bm)
    axis_index = {"x": 0, "y": 1, "z": 2}.get(axis) if axis else None
    candidate_vertices = []
    for vertex in bm.verts:
        if axis_index is not None:
            coordinate = vertex.co[axis_index]
            if min_coordinate is not None and coordinate < min_coordinate:
                continue
            if max_coordinate is not None and coordinate > max_coordinate:
                continue
        candidate_vertices.append(vertex)
    coordinate_counts = Counter(
        tuple(round(float(value) / distance) for value in vertex.co)
        for vertex in candidate_vertices
    )
    duplicate_coordinate_keys = {key for key, count in coordinate_counts.items() if count > 1}
    bmesh.ops.remove_doubles(bm, verts=candidate_vertices, dist=distance)
    welded_targets = {
        vertex
        for vertex in bm.verts
        if tuple(round(float(value) / distance) for value in vertex.co) in duplicate_coordinate_keys
    }
    unified_uv_vertices = 0
    if unify_welded_uvs:
        uv_layer = bm.loops.layers.uv.active
        if uv_layer is not None:
            for vertex in welded_targets:
                loops = [loop for loop in vertex.link_loops if loop.face.is_valid]
                values = [
                    tuple(round(float(value), 9) for value in loop[uv_layer].uv)
                    for loop in loops
                ]
                if not values:
                    continue
                chosen = Counter(values).most_common(1)[0][0]
                for loop in loops:
                    loop[uv_layer].uv = chosen
                unified_uv_vertices += 1
    if not preserve_normals:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    boundary_after = boundary_summary(bm)
    boundary_fill = None
    if fill_boundary_max_perimeter > 0.0 and fill_boundary_max_edges >= 3:
        boundary_fill = fill_small_boundaries(
            bm,
            fill_boundary_max_perimeter,
            fill_boundary_max_edges,
        )
    bm.to_mesh(mesh)
    bm.free()

    mesh.validate(verbose=False, clean_customdata=True)
    mesh.update(calc_edges=True, calc_edges_loose=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    vertices_after = len(mesh.vertices)
    return {
        "object": obj.name,
        "distance": distance,
        "vertices_before": vertices_before,
        "vertices_after": vertices_after,
        "vertices_welded": vertices_before - vertices_after,
        "candidate_vertices": len(candidate_vertices),
        "faces_before": faces_before,
        "faces_after": len(mesh.polygons),
        "boundary_before": boundary_before,
        "boundary_after": boundary_after,
        "axis": axis,
        "min_coordinate": min_coordinate,
        "max_coordinate": max_coordinate,
        "preserve_normals": preserve_normals,
        "unified_uv_vertices": unified_uv_vertices,
        "boundary_fill": boundary_fill,
    }


def export_glb(path: Path, export_normals: bool, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=export_normals,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Weld coincident vertices across disconnected garment repair patches."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--distance", type=float, default=1e-6)
    parser.add_argument("--axis", choices=("x", "y", "z"))
    parser.add_argument("--min-coordinate", type=float)
    parser.add_argument("--max-coordinate", type=float)
    parser.add_argument("--preserve-normals", action="store_true")
    parser.add_argument("--omit-normals", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=14)
    parser.add_argument("--unify-welded-uvs", action="store_true")
    parser.add_argument("--fill-boundary-max-perimeter", type=float, default=0.0)
    parser.add_argument("--fill-boundary-max-edges", type=int, default=0)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")

    if (args.min_coordinate is not None or args.max_coordinate is not None) and not args.axis:
        parser.error("--axis is required when a coordinate bound is provided")
    reports = [
        weld_object(
            obj,
            args.distance,
            args.axis,
            args.min_coordinate,
            args.max_coordinate,
            args.preserve_normals,
            args.unify_welded_uvs,
            args.fill_boundary_max_perimeter,
            args.fill_boundary_max_edges,
        )
        for obj in objects
    ]
    export_glb(args.output, not args.omit_normals, args.position_quantization)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "distance": args.distance,
                "axis": args.axis,
                "min_coordinate": args.min_coordinate,
                "max_coordinate": args.max_coordinate,
                "preserve_normals": args.preserve_normals,
                "export_normals": not args.omit_normals,
                "position_quantization": args.position_quantization,
                "unify_welded_uvs": args.unify_welded_uvs,
                "objects": reports,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

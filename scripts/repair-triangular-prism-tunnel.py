#!/usr/bin/env python3
"""Replace one diagnosed triangular through-tunnel with two attached cloth caps."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from itertools import product
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--vertices", required=True, help="Six semicolon-separated local x,y,z coordinates")
    parser.add_argument("--tolerance", type=float, default=0.0001)
    parser.add_argument("--position-quantization", type=int, default=22)
    return parser.parse_args(argv)


def boundary_groups(edges):
    vertex_edges = defaultdict(set)
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
                        group.append(neighbor)
                        queue.append(neighbor)
        groups.append(group)
    return groups


def ordered_vertices(group):
    adjacency = defaultdict(list)
    for edge in group:
        first, second = edge.verts
        adjacency[first].append(second)
        adjacency[second].append(first)
    if len(group) != 3 or len(adjacency) != 3 or any(len(values) != 2 for values in adjacency.values()):
        raise RuntimeError("Expected a simple three-edge boundary loop")
    start, current = group[0].verts
    ordered = [start, current]
    previous = start
    while True:
        following = next(vertex for vertex in adjacency[current] if vertex is not previous)
        if following is start:
            break
        ordered.append(following)
        previous, current = current, following
    return ordered


def center(group):
    vertices = {vertex for edge in group for vertex in edge.verts}
    return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)


def position_key(vector, precision=7):
    return tuple(round(float(value), precision) for value in vector)


def capture_split_normals(mesh):
    """Keep authored CLO normals on every face that survives the local repair.

    Recalculating the whole garment after replacing a six-face tunnel can expose
    unrelated, tightly layered panel contacts as dark dents.  A face-position
    key lets us restore the imported per-loop normals on unchanged triangles;
    only the two new cap faces use freshly calculated smooth normals.
    """
    mesh.calc_normals_split()
    records = {}
    duplicate_face_keys = 0
    for polygon in mesh.polygons:
        face_key = tuple(sorted(position_key(mesh.vertices[index].co) for index in polygon.vertices))
        normals = {
            position_key(mesh.vertices[mesh.loops[loop_index].vertex_index].co):
            mesh.loops[loop_index].normal.copy()
            for loop_index in polygon.loop_indices
        }
        if face_key in records:
            duplicate_face_keys += 1
        records[face_key] = normals
    return records, duplicate_face_keys


def restore_split_normals(mesh, records):
    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)
    mesh.calc_normals_split()
    loop_normals = [loop.normal.copy() for loop in mesh.loops]
    restored_faces = 0
    generated_faces = 0
    generated_polygon_indices = []
    for polygon in mesh.polygons:
        face_key = tuple(sorted(position_key(mesh.vertices[index].co) for index in polygon.vertices))
        source = records.get(face_key)
        if source is None:
            generated_faces += 1
            generated_polygon_indices.append(polygon.index)
            continue
        restored_faces += 1
        for loop_index in polygon.loop_indices:
            loop = mesh.loops[loop_index]
            normal = source.get(position_key(mesh.vertices[loop.vertex_index].co))
            if normal is not None:
                loop_normals[loop_index] = normal

    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    aligned_cap_loops = 0
    for polygon_index in generated_polygon_indices:
        polygon = mesh.polygons[polygon_index]
        neighbors = {
            neighbor
            for edge_key in polygon.edge_keys
            for neighbor in edge_faces[edge_key]
            if neighbor != polygon_index and neighbor not in generated_polygon_indices
        }
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            adjacent_normals = [
                loop_normals[neighbor_loop]
                for neighbor in neighbors
                for neighbor_loop in mesh.polygons[neighbor].loop_indices
                if mesh.loops[neighbor_loop].vertex_index == vertex_index
            ]
            if adjacent_normals:
                blended = sum(adjacent_normals, Vector())
                if blended.length_squared:
                    loop_normals[loop_index] = blended.normalized()
                    aligned_cap_loops += 1
    mesh.use_auto_smooth = True
    mesh.normals_split_custom_set(loop_normals)
    mesh.update()
    return restored_faces, generated_faces, aligned_cap_loops


def main():
    args = parse_args()
    seeds = [
        Vector(tuple(float(value) for value in group.split(",")))
        for group in args.vertices.split(";")
        if group.strip()
    ]
    if len(seeds) != 6:
        raise ValueError("--vertices must contain exactly six coordinates")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    source_split_normals, duplicate_normal_face_keys = capture_split_normals(obj.data)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    def matches_seed(vertex):
        return any((vertex.co - seed).length <= args.tolerance for seed in seeds)

    walls = [face for face in bm.faces if all(matches_seed(vertex) for vertex in face.verts)]
    if len(walls) != 6:
        raise RuntimeError(f"Expected 6 tunnel wall faces, found {len(walls)}: {[face.index for face in walls]}")
    removed_indices = sorted(face.index for face in walls)
    removed_centers = [[round(value, 9) for value in face.calc_center_median()] for face in walls]
    bmesh.ops.delete(bm, geom=walls, context="FACES")
    bm.normal_update()

    groups = boundary_groups([edge for edge in bm.edges if edge.is_boundary])
    groups.sort(key=lambda group: tuple(round(value, 9) for value in center(group)))
    if len(groups) != 2 or any(len(group) != 3 for group in groups):
        raise RuntimeError(f"Expected two triangular cap loops, got {[len(group) for group in groups]}")

    uv_layer = bm.loops.layers.uv.active
    created = []
    cap_reports = []
    for group in groups:
        adjacent_faces = {face for edge in group for face in edge.link_faces}
        reference_normal = sum((face.normal for face in adjacent_faces), Vector())
        material_counts = Counter(face.material_index for face in adjacent_faces)
        cap_vertices = ordered_vertices(group)
        selected_uvs = None
        matched_uv_edges = None
        if uv_layer is not None:
            edge_uvs = {}
            for edge in group:
                adjacent = edge.link_faces[0]
                edge_uvs[edge] = {
                    vertex: tuple(
                        float(value)
                        for value in next(loop for loop in adjacent.loops if loop.vert is vertex)[uv_layer].uv
                    )
                    for vertex in edge.verts
                }
            candidate_uvs = []
            for vertex in cap_vertices:
                values = []
                for edge in group:
                    if vertex in edge.verts:
                        value = edge_uvs[edge][vertex]
                        if value not in values:
                            values.append(value)
                candidate_uvs.append(values)
            best = None
            for combination in product(*candidate_uvs):
                chosen = {vertex: uv for vertex, uv in zip(cap_vertices, combination)}
                score = sum(
                    all(chosen[vertex] == edge_uvs[edge][vertex] for vertex in edge.verts)
                    for edge in group
                )
                if best is None or score > best[0]:
                    best = (score, chosen)
            matched_uv_edges, selected_uvs = best

        new_face = bm.faces.new(cap_vertices)
        bm.normal_update()
        if reference_normal.length_squared and new_face.normal.dot(reference_normal) < 0:
            new_face.normal_flip()
            bm.normal_update()
        new_face.material_index = material_counts.most_common(1)[0][0] if material_counts else 0
        new_face.smooth = True
        if selected_uvs is not None:
            for loop in new_face.loops:
                loop[uv_layer].uv = Vector(selected_uvs[loop.vert])
        created.append(new_face)
        cap_reports.append(
            {
                "center": [round(value, 9) for value in new_face.calc_center_median()],
                "area": round(new_face.calc_area(), 12),
                "normal": [round(value, 9) for value in new_face.normal],
                "material_index": new_face.material_index,
                "matched_uv_edges": matched_uv_edges,
            }
        )

    bm.normal_update()
    report = {
        "removed_faces": removed_indices,
        "removed_face_centers": removed_centers,
        "caps": cap_reports,
        "boundary_edges_after": sum(1 for edge in bm.edges if edge.is_boundary),
        "nonmanifold_edges_after": sum(1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary),
        "zero_area_faces_after": sum(1 for face in bm.faces if face.calc_area() <= 1e-12),
        "faces_after": len(bm.faces),
    }
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    restored_normal_faces, generated_normal_faces, aligned_cap_loops = restore_split_normals(
        obj.data,
        source_split_normals,
    )
    report["split_normals"] = {
        "restored_unchanged_faces": restored_normal_faces,
        "generated_cap_faces": generated_normal_faces,
        "aligned_cap_loops": aligned_cap_loops,
        "duplicate_source_face_keys": duplicate_normal_face_keys,
    }

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

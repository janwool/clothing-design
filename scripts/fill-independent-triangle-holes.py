#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from itertools import product
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def boundary_groups(edges: list[bmesh.types.BMEdge]) -> list[list[bmesh.types.BMEdge]]:
    vertex_edges: dict[bmesh.types.BMVert, set[bmesh.types.BMEdge]] = defaultdict(set)
    for edge in edges:
        for vertex in edge.verts:
            vertex_edges[vertex].add(edge)
    groups: list[list[bmesh.types.BMEdge]] = []
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
        raise ValueError("Boundary group is not a simple closed loop")

    start, current = group[0].verts
    ordered = [start, current]
    previous = start
    while True:
        candidates = [vertex for vertex in adjacency[current] if vertex is not previous]
        if len(candidates) != 1:
            raise ValueError("Boundary loop ordering is ambiguous")
        next_vertex = candidates[0]
        if next_vertex is start:
            break
        if next_vertex in ordered:
            raise ValueError("Boundary loop closes through a repeated vertex")
        ordered.append(next_vertex)
        previous, current = current, next_vertex
    if len(ordered) != len(group):
        raise ValueError("Boundary loop did not include every edge")
    return ordered


def fill_object(
    obj: bpy.types.Object,
    max_perimeter: float,
    max_edges: int,
    target: Vector | None,
    target_is_local: bool,
    clear_custom_normals: bool,
) -> dict[str, object]:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    bm.normal_update()

    groups = boundary_groups([edge for edge in bm.edges if edge.is_boundary])

    def group_center(group: list[bmesh.types.BMEdge]) -> Vector:
        vertices = {vertex for edge in group for vertex in edge.verts}
        return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)

    groups.sort(key=lambda group: tuple(round(value, 9) for value in group_center(group)))
    selected_group = None
    selected_distance = None
    if target is not None and groups:
        target_local = target if target_is_local else obj.matrix_world.inverted() @ target
        selected_group = min(groups, key=lambda group: (group_center(group) - target_local).length)
        selected_distance = (group_center(selected_group) - target_local).length
    uv_layer = bm.loops.layers.uv.active
    reports = []
    filled_faces = []
    skipped = []

    for index, group in enumerate(groups):
        if selected_group is not None and group is not selected_group:
            continue
        perimeter = sum(edge.calc_length() for edge in group)
        vertices = {vertex for edge in group for vertex in edge.verts}
        detail = {
            "index": index,
            "edges": len(group),
            "vertices": len(vertices),
            "perimeter": round(perimeter, 9),
            "center": [round(value, 6) for value in group_center(group)],
        }
        if len(group) < 3 or len(group) > max_edges or len(vertices) != len(group) or perimeter > max_perimeter:
            detail["reason"] = "not_an_allowed_triangle_loop"
            skipped.append(detail)
            continue

        adjacent_faces = {
            face
            for edge in group
            for face in edge.link_faces
        }
        reference_normal = sum((face.normal for face in adjacent_faces), Vector())
        material_counts = Counter(face.material_index for face in adjacent_faces)
        boundary_vertices = ordered_boundary_vertices(group)
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
            for vertex in boundary_vertices:
                values = []
                for edge in group:
                    if vertex in edge.verts:
                        value = edge_uvs[edge][vertex]
                        if value not in values:
                            values.append(value)
                candidate_uvs.append(values)
            best = None
            for combination in product(*candidate_uvs):
                chosen = {vertex: uv for vertex, uv in zip(boundary_vertices, combination)}
                score = sum(
                    all(chosen[vertex] == edge_uvs[edge][vertex] for vertex in edge.verts)
                    for edge in group
                )
                if best is None or score > best[0]:
                    best = (score, chosen)
            matched_uv_edges, selected_uvs = best

        created_faces = [bm.faces.new(boundary_vertices)]
        if len(group) > 3:
            triangulated = bmesh.ops.triangulate(bm, faces=created_faces)
            created_faces = list(triangulated.get("faces", created_faces))
        # A newly created BMesh face does not yet have a dependable normal for
        # orientation comparison. Refresh before deciding whether it needs to flip.
        bm.normal_update()

        material_index = material_counts.most_common(1)[0][0] if material_counts else 0
        for new_face in created_faces:
            if reference_normal.length_squared and new_face.normal.dot(reference_normal) < 0:
                new_face.normal_flip()
            new_face.material_index = material_index
            new_face.smooth = True

            if selected_uvs is not None:
                for loop in new_face.loops:
                    loop[uv_layer].uv = Vector(selected_uvs[loop.vert])

        areas = [new_face.calc_area() for new_face in created_faces]
        if any(area <= 1e-12 for area in areas):
            raise RuntimeError(f"Filled boundary group {index} created a zero-area face")
        detail["faces_created"] = len(created_faces)
        detail["area"] = round(sum(areas), 12)
        detail["material_index"] = material_index
        detail["matched_uv_edges"] = matched_uv_edges
        reports.append(detail)
        filled_faces.extend(created_faces)
        bm.normal_update()

    bm.normal_update()
    remaining_boundaries = sum(1 for edge in bm.edges if edge.is_boundary)
    zero_area_faces = sum(1 for face in bm.faces if face.calc_area() <= 1e-12)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    # Preserve authored split normals by default: clearing them can change the
    # shading of every untouched garment panel. Some repairs need a continuous
    # regenerated normal field, so keep that behavior available explicitly.
    if clear_custom_normals and mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    return {
        "object": obj.name,
        "boundary_groups_before": len(groups),
        "faces_created": len(filled_faces),
        "filled_groups": reports,
        "skipped_groups": skipped,
        "boundary_edges_after": remaining_boundaries,
        "zero_area_faces_after": zero_area_faces,
        "faces_after": len(mesh.polygons),
        "selected_boundary_distance": selected_distance,
    }


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
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
        description="Fill each isolated three-edge boundary loop with its own face without cross-loop pairing."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-perimeter", type=float, default=0.2)
    parser.add_argument("--max-edges", type=int, default=3)
    parser.add_argument(
        "--target",
        help="World-space x,y,z point; only the nearest boundary loop is filled.",
    )
    parser.add_argument(
        "--target-local",
        action="store_true",
        help="Interpret --target in imported mesh-local coordinates.",
    )
    parser.add_argument("--position-quantization", type=int, default=22)
    parser.add_argument(
        "--clear-custom-normals",
        action="store_true",
        help="Regenerate normals for the whole mesh after repair instead of preserving imported split normals.",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")
    target = Vector(tuple(float(value) for value in args.target.split(","))) if args.target else None
    if target is not None and len(target) != 3:
        raise ValueError("--target must contain x,y,z")
    reports = [
        fill_object(
            obj,
            args.max_perimeter,
            args.max_edges,
            target,
            args.target_local,
            args.clear_custom_normals,
        )
        for obj in objects
    ]
    export_glb(args.output, args.position_quantization)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "max_perimeter": args.max_perimeter,
                "target": list(target) if target is not None else None,
                "target_is_local": args.target_local,
                "position_quantization": args.position_quantization,
                "clear_custom_normals": args.clear_custom_normals,
                "objects": reports,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

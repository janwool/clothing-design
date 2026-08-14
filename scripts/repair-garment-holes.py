#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


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


def boundary_groups(edges) -> list[list]:
    vertex_edges = defaultdict(set)
    for edge in edges:
        for vertex in edge.verts:
            vertex_edges[vertex].add(edge)
    groups, pending = [], set(edges)
    while pending:
        seed = pending.pop()
        queue, group = deque([seed]), [seed]
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


def repair_object(
    obj: bpy.types.Object,
    max_faces: int,
    keep_small_components: bool,
    target_world: Vector | None,
    boundary_group_indices: set[int] | None,
    inspect_only: bool,
) -> dict[str, object]:
    mesh = obj.data
    components = face_components(mesh)
    removed = [] if keep_small_components else [component for component in components if len(component) <= max_faces]
    removed_faces = {face for component in removed for face in component}

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(
        bm,
        geom=[bm.faces[index] for index in sorted(removed_faces)],
        context="FACES",
    )

    all_boundary_edges = [edge for edge in bm.edges if edge.is_boundary]
    groups = boundary_groups(all_boundary_edges)

    def group_center(group):
        vertices = {vertex for edge in group for vertex in edge.verts}
        return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)

    groups.sort(key=lambda group: tuple(round(value, 9) for value in group_center(group)))
    group_details = []
    for index, group in enumerate(groups):
        vertices = {vertex for edge in group for vertex in edge.verts}
        center = group_center(group)
        mins = [min(vertex.co[axis] for vertex in vertices) for axis in range(3)]
        maxs = [max(vertex.co[axis] for vertex in vertices) for axis in range(3)]
        group_details.append(
            {
                "index": index,
                "edges": len(group),
                "vertices": len(vertices),
                "perimeter": sum((edge.verts[0].co - edge.verts[1].co).length for edge in group),
                "center": [round(value, 6) for value in center],
                "bbox": [round(value, 6) for value in (*mins, *maxs)],
            }
        )
    selected_group = None
    selected_distance = None
    if target_world is not None:
        target_local = obj.matrix_world.inverted() @ target_world
        selected_group = min(groups, key=lambda group: (group_center(group) - target_local).length)
        selected_distance = (group_center(selected_group) - target_local).length
        boundary_edges = selected_group
    elif boundary_group_indices is not None:
        missing = sorted(boundary_group_indices - set(range(len(groups))))
        if missing:
            raise ValueError(f"Boundary group indices out of range: {missing}")
        boundary_edges = [edge for index, group in enumerate(groups) if index in boundary_group_indices for edge in group]
    else:
        boundary_edges = all_boundary_edges
    if inspect_only:
        new_faces = set()
    else:
        fill_result = bmesh.ops.holes_fill(bm, edges=boundary_edges, sides=0)
        filled_faces = list(fill_result.get("faces", []))
        triangulated = bmesh.ops.triangulate(bm, faces=filled_faces)
        new_faces = set(triangulated.get("faces", filled_faces))

    uv_layer = bm.loops.layers.uv.active
    if uv_layer is not None and new_faces:
        for face in new_faces:
            for loop in face.loops:
                neighboring_uvs = [
                    other_loop[uv_layer].uv.copy()
                    for other_face in loop.vert.link_faces
                    if other_face not in new_faces
                    for other_loop in other_face.loops
                    if other_loop.vert is loop.vert
                ]
                if neighboring_uvs:
                    loop[uv_layer].uv = sum(neighboring_uvs[1:], neighboring_uvs[0]) / len(neighboring_uvs)

    if new_faces:
        bm.normal_update()
        for face in new_faces:
            neighboring_faces = {
                other_face
                for edge in face.edges
                for other_face in edge.link_faces
                if other_face not in new_faces
            }
            if neighboring_faces:
                reference_normal = sum((other.normal for other in neighboring_faces), Vector())
                if reference_normal.length_squared and face.normal.dot(reference_normal) < 0:
                    face.normal_flip()
            face.smooth = True
        bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    return {
        "object": obj.name,
        "components_before": len(components),
        "components_removed": len(removed),
        "faces_removed": len(removed_faces),
        "boundary_groups": len(groups),
        "boundary_group_details": group_details,
        "boundary_edges_filled": len(boundary_edges),
        "selected_boundary_group_edges": len(selected_group) if selected_group is not None else None,
        "selected_boundary_distance": selected_distance,
        "faces_created": len(new_faces),
        "faces_after": len(mesh.polygons),
        "inspect_only": inspect_only,
    }


def export_glb(path: Path, position_quantization: int = 14) -> None:
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
        description="Replace disconnected garment repair patches with faces attached to their boundary loops."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-faces", type=int, default=99)
    parser.add_argument("--keep-small-components", action="store_true")
    parser.add_argument(
        "--target",
        help="World-space x,y,z point; only the nearest boundary loop is filled.",
    )
    parser.add_argument(
        "--boundary-groups",
        help="Comma-separated stable boundary-loop indices to fill; use inspection output to choose them.",
    )
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument(
        "--position-quantization",
        type=int,
        default=14,
        help="Draco position quantization bits; raise this for small repair geometry.",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects found")

    target_world = Vector(tuple(float(value) for value in args.target.split(","))) if args.target else None
    if target_world is not None and len(target_world) != 3:
        raise ValueError("--target must contain x,y,z")
    boundary_group_indices = (
        {int(value) for value in args.boundary_groups.split(",") if value.strip()}
        if args.boundary_groups
        else None
    )
    reports = [
        repair_object(
            obj,
            args.max_faces,
            keep_small_components=args.keep_small_components,
            target_world=target_world,
            boundary_group_indices=boundary_group_indices,
            inspect_only=args.inspect_only,
        )
        for obj in objects
    ]
    export_glb(args.output, args.position_quantization)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "max_faces": args.max_faces,
                "position_quantization": args.position_quantization,
                "objects": reports,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

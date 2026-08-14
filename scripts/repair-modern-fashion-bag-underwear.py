#!/usr/bin/env python3
"""Rebuild the folded bandeau shell in catalog item 84.

The catalog calls this asset a fashion bag, but the source GLB is a two-piece
underwear set.  Its upper bandeau is a single closed component whose right seam
has folded through itself.  The three lower brief components are intentionally
layered and are preserved verbatim.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
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


def component_vertex_indices(mesh: bpy.types.Mesh, face_indices: list[int]) -> set[int]:
    return {
        vertex_index
        for face_index in face_indices
        for vertex_index in mesh.polygons[face_index].vertices
    }


def delete_component(mesh: bpy.types.Mesh, face_indices: list[int]) -> None:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    doomed = [bm.faces[index] for index in face_indices]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    loose_edges = [edge for edge in bm.edges if not edge.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    loose_vertices = [vertex for vertex in bm.verts if not vertex.link_faces]
    if loose_vertices:
        bmesh.ops.delete(bm, geom=loose_vertices, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update(calc_edges=True, calc_edges_loose=True)


def make_bandeau(
    name: str,
    bbox: tuple[float, float, float, float, float, float],
    material: bpy.types.Material | None,
    angular_segments: int,
    vertical_segments: int,
) -> bpy.types.Object:
    xmin, ymin, zmin, xmax, ymax, zmax = bbox
    center_x = (xmin + xmax) * 0.5
    center_z = (zmin + zmax) * 0.5
    radius_x = (xmax - xmin) * 0.5
    radius_z = (zmax - zmin) * 0.5

    vertices: list[tuple[float, float, float]] = []
    vertex_uv: list[tuple[float, float]] = []
    umin, vmin, umax, vmax = 0.027344, 0.027302, 0.972656, 0.174120

    def index(layer: int, angle_index: int, height_index: int) -> int:
        return layer * angular_segments * (vertical_segments + 1) + angle_index * (
            vertical_segments + 1
        ) + height_index

    for layer in range(2):
        radial_offset = 0.018 if layer == 0 else -0.018
        for angle_index in range(angular_segments):
            theta = math.tau * angle_index / angular_segments
            cosine = math.cos(theta)
            sine = math.sin(theta)
            lower_y = ymin + 0.042 + 0.018 * math.cos(2.0 * theta + 0.35)
            upper_y = (
                ymax
                - 0.040
                + 0.026 * math.cos(2.0 * theta - 0.20)
                + 0.010 * math.cos(theta + 0.60)
            )
            for height_index in range(vertical_segments + 1):
                t = height_index / vertical_segments
                # The source is narrower at the lower edge, fuller through the
                # middle, and eases slightly at the top.  This polynomial keeps
                # that underwear silhouette without retaining the folded seam.
                radial_scale = 0.84 + 0.40 * t - 0.28 * t * t + radial_offset
                x = center_x + radius_x * radial_scale * cosine
                y = lower_y * (1.0 - t) + upper_y * t
                z = center_z + radius_z * radial_scale * sine
                vertices.append((x, y, z))
                vertex_uv.append(
                    (
                        umin + (umax - umin) * angle_index / angular_segments,
                        vmin + (vmax - vmin) * t,
                    )
                )

    faces: list[tuple[int, int, int]] = []
    for angle_index in range(angular_segments):
        next_angle = (angle_index + 1) % angular_segments
        for height_index in range(vertical_segments):
            outer_a = index(0, angle_index, height_index)
            outer_b = index(0, next_angle, height_index)
            outer_c = index(0, next_angle, height_index + 1)
            outer_d = index(0, angle_index, height_index + 1)
            faces.extend(((outer_a, outer_b, outer_c), (outer_a, outer_c, outer_d)))

            inner_a = index(1, angle_index, height_index)
            inner_b = index(1, next_angle, height_index)
            inner_c = index(1, next_angle, height_index + 1)
            inner_d = index(1, angle_index, height_index + 1)
            faces.extend(((inner_a, inner_c, inner_b), (inner_a, inner_d, inner_c)))

        outer_bottom = index(0, angle_index, 0)
        outer_bottom_next = index(0, next_angle, 0)
        inner_bottom = index(1, angle_index, 0)
        inner_bottom_next = index(1, next_angle, 0)
        faces.extend(
            (
                (outer_bottom, inner_bottom_next, outer_bottom_next),
                (outer_bottom, inner_bottom, inner_bottom_next),
            )
        )

        outer_top = index(0, angle_index, vertical_segments)
        outer_top_next = index(0, next_angle, vertical_segments)
        inner_top = index(1, angle_index, vertical_segments)
        inner_top_next = index(1, next_angle, vertical_segments)
        faces.extend(
            (
                (outer_top, outer_top_next, inner_top_next),
                (outer_top, inner_top_next, inner_top),
            )
        )

    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True, calc_edges_loose=True)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv_layer.data[loop_index].uv = vertex_uv[mesh.loops[loop_index].vertex_index]

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def count_open_edges(mesh: bpy.types.Mesh) -> tuple[int, int]:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    nonmanifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    return boundary, nonmanifold


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--angular-segments", type=int, default=192)
    parser.add_argument("--vertical-segments", type=int, default=18)
    parser.add_argument("--position-quantization", type=int, default=22)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    source = objects[0]
    components = face_components(source.data)
    if len(components) != 4:
        raise RuntimeError(f"Expected four source components, found {len(components)}")

    component_reports = []
    for component_index, face_indices in enumerate(components):
        vertex_indices = component_vertex_indices(source.data, face_indices)
        coordinates = [source.data.vertices[index].co for index in vertex_indices]
        component_reports.append(
            {
                "index": component_index,
                "faces": len(face_indices),
                "vertices": len(vertex_indices),
                "center_y": sum(co.y for co in coordinates) / len(coordinates),
                "bbox": (
                    min(co.x for co in coordinates),
                    min(co.y for co in coordinates),
                    min(co.z for co in coordinates),
                    max(co.x for co in coordinates),
                    max(co.y for co in coordinates),
                    max(co.z for co in coordinates),
                ),
            }
        )
    upper = max(component_reports, key=lambda report: (report["center_y"], report["faces"]))
    if upper["center_y"] <= 0 or upper["faces"] != 5532:
        raise RuntimeError(f"Unexpected upper component: {upper}")

    material = source.data.materials[0] if source.data.materials else None
    delete_component(source.data, components[upper["index"]])
    bandeau = make_bandeau(
        "Rebuilt seamless bandeau",
        tuple(upper["bbox"]),
        material,
        args.angular_segments,
        args.vertical_segments,
    )
    # The generated vertices use the original garment's local coordinates.
    # Carry that object's transform onto the replacement before joining it.
    bandeau.matrix_world = source.matrix_world.copy()
    rebuilt_vertices = len(bandeau.data.vertices)
    rebuilt_faces = len(bandeau.data.polygons)

    for obj in objects + [bandeau]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.join()
    source.name = "Underwear set — repaired upper shell"
    source.data.name = "Underwear set repaired mesh"
    source.data.update(calc_edges=True, calc_edges_loose=True)
    boundary, nonmanifold = count_open_edges(source.data)
    if boundary or nonmanifold:
        raise RuntimeError(
            f"Rebuilt mesh is not closed: boundary={boundary}, nonmanifold={nonmanifold}"
        )

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
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "source_components": component_reports,
                "replaced_component": upper["index"],
                "source_upper_faces": upper["faces"],
                "rebuilt_vertices": rebuilt_vertices,
                "rebuilt_faces": rebuilt_faces,
                "faces_after": len(source.data.polygons),
                "boundary_edges_after": boundary,
                "nonmanifold_edges_after": nonmanifold,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

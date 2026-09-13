#!/usr/bin/env python3
"""Preserve authored garment UV panels, repair only invalid faces, then repack."""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
import math
import re
import struct
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


BASE = load_module("preserved_uv_base", ROOT / "scripts" / "rebuild-semantic-uv-svg.py")
AUDIT = load_module("preserved_uv_audit", ROOT / "scripts" / "audit-garment-model.py")
STANDARD_ZONES = {
    "front": (0.025, 0.54, 0.465, 0.435),
    "back": (0.51, 0.54, 0.465, 0.435),
    "side": (0.025, 0.08, 0.625, 0.42),
    "detail": (0.675, 0.08, 0.30, 0.42),
}
PAPER_PATTERN_ZONES = {
    "front": (0.025, 0.565, 0.465, 0.410),
    "back": (0.510, 0.565, 0.465, 0.410),
    "side": (0.025, 0.285, 0.950, 0.240),
    "detail": (0.025, 0.080, 0.950, 0.165),
}
STANDARD_REPAIR_ZONE = (0.025, 0.01, 0.84, 0.045)
STANDARD_ZERO_FACE_ZONE = (0.88, 0.01, 0.095, 0.045)
SEVERE_REPAIR_ZONES = {
    "front": (0.025, 0.755, 0.465, 0.22),
    "back": (0.51, 0.755, 0.465, 0.22),
    "side": (0.025, 0.52, 0.625, 0.22),
    "detail": (0.675, 0.52, 0.30, 0.22),
}
SEVERE_REPAIR_ZONE = (0.0, 0.0, 0.89, 0.49)
SEVERE_ZERO_FACE_ZONE = (0.90, 0.0, 0.10, 0.49)
FINAL_ZERO_AREA_EPSILON = 0.0
PRESERVED_SHAPE_ERROR_LIMIT = 2e-3
EXPORT_SAFE_REPAIR_AREA_EPSILON = 1e-12
BASE.ZONES = STANDARD_ZONES


def xatlas_module():
    dependency = Path(__file__).resolve().parent.parent / "artifacts" / "tools" / "xatlas-py313"
    if dependency.exists() and str(dependency) not in sys.path:
        sys.path.insert(0, str(dependency))
    try:
        import xatlas
    except ImportError as exc:
        raise RuntimeError(
            f"xatlas is required for chart unwrap; expected it under {dependency}"
        ) from exc
    return xatlas


def quantized_position(co: Vector, tolerance: float) -> tuple[int, int, int]:
    scale = 1.0 / tolerance
    return tuple(round(value * scale) for value in co)


def position_welded_face_groups(
    mesh: bpy.types.Mesh,
    tolerance: float = 1e-5,
) -> list[list[int]]:
    """Recover physical face groups while ignoring GLB attribute-only splits."""
    position_keys = [quantized_position(vertex.co, tolerance) for vertex in mesh.vertices]
    edge_faces: dict[tuple[tuple[int, int, int], tuple[int, int, int]], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        vertices = list(polygon.vertices)
        for index, vertex in enumerate(vertices):
            start = position_keys[vertex]
            end = position_keys[vertices[(index + 1) % len(vertices)]]
            if start != end:
                edge_faces[tuple(sorted((start, end)))].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for linked_faces in edge_faces.values():
        for face_index in linked_faces:
            neighbors[face_index].update(other for other in linked_faces if other != face_index)
    groups = []
    visited = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        group = []
        while queue:
            face_index = queue.popleft()
            group.append(face_index)
            for neighbor in neighbors[face_index]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        groups.append(group)
    return groups


def position_welded_xatlas_unwrap(
    objects: list[bpy.types.Object],
    tolerance: float = 1e-5,
    resolution: int = 4096,
    padding: int = 8,
) -> tuple[dict[str, list[list[int]]], dict[str, object]]:
    """Generate overlap-free charts on welded positions and transfer loop UVs only."""
    xatlas = xatlas_module()
    groups_by_object: dict[str, list[list[int]]] = {}
    reports: dict[str, object] = {}
    for obj in objects:
        mesh = obj.data
        if any(len(polygon.vertices) != 3 for polygon in mesh.polygons):
            raise RuntimeError(f"xatlas unwrap requires triangles for {obj.name}")

        key_to_vertex: dict[tuple[int, int, int], int] = {}
        positions: list[tuple[float, float, float]] = []
        source_to_welded: list[int] = []
        for vertex in mesh.vertices:
            key = quantized_position(vertex.co, tolerance)
            welded = key_to_vertex.get(key)
            if welded is None:
                welded = len(positions)
                key_to_vertex[key] = welded
                positions.append(tuple(vertex.co))
            source_to_welded.append(welded)
        indices = np.asarray(
            [[source_to_welded[index] for index in polygon.vertices] for polygon in mesh.polygons],
            dtype=np.uint32,
        )
        if any(len(set(face)) != 3 for face in indices.tolist()):
            raise RuntimeError(f"Position welding collapsed a triangle for {obj.name}")

        atlas = xatlas.Atlas()
        atlas.add_mesh(np.asarray(positions, dtype=np.float32), indices)
        chart_options = xatlas.ChartOptions()
        # Photogrammetry garments contain high-frequency wrinkle normals that
        # should not become UV seams. Bias charting toward broad fabric panels.
        chart_options.max_cost = 100.0
        chart_options.max_iterations = 8
        chart_options.normal_deviation_weight = 0.02
        chart_options.normal_seam_weight = 0.01
        chart_options.roundness_weight = 0.001
        chart_options.straightness_weight = 0.01
        chart_options.texture_seam_weight = 0.0
        pack_options = xatlas.PackOptions()
        pack_options.resolution = resolution
        pack_options.padding = padding
        pack_options.bilinear = True
        pack_options.rotate_charts = True
        pack_options.rotate_charts_to_axis = True
        atlas.generate(chart_options=chart_options, pack_options=pack_options, verbose=False)
        vertex_mapping, output_indices, output_uvs = atlas[0]
        if len(output_indices) != len(mesh.polygons):
            raise RuntimeError(
                f"xatlas face count changed for {obj.name}: {len(output_indices)}/{len(mesh.polygons)}"
            )

        if not mesh.uv_layers:
            mesh.uv_layers.new(name="Garment UV")
        layer = mesh.uv_layers.active
        transferred = 0
        for face_index, output_face in enumerate(output_indices):
            polygon = mesh.polygons[face_index]
            corner_by_vertex = {
                int(vertex_mapping[int(output_vertex)]): corner
                for corner, output_vertex in enumerate(output_face)
            }
            for loop_index in polygon.loop_indices:
                source_vertex = mesh.loops[loop_index].vertex_index
                welded_vertex = source_to_welded[source_vertex]
                corner = corner_by_vertex.get(welded_vertex)
                if corner is None:
                    raise RuntimeError(
                        f"xatlas corner mapping failed for {obj.name} face {face_index}"
                    )
                uv = output_uvs[int(output_face[corner])]
                layer.data[loop_index].uv = (float(uv[0]), float(uv[1]))
            transferred += 1
        mesh.update()
        atlas_assignment, chart_assignment = atlas.get_mesh_vertex_assignment(0)
        grouped_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
        for face_index, output_face in enumerate(output_indices):
            assignments = {
                (
                    int(atlas_assignment[int(output_vertex)]),
                    int(chart_assignment[int(output_vertex)]),
                )
                for output_vertex in output_face
            }
            if len(assignments) != 1:
                raise RuntimeError(
                    f"xatlas face spans multiple charts for {obj.name} face {face_index}: {assignments}"
                )
            grouped_faces[next(iter(assignments))].append(face_index)
        groups = list(grouped_faces.values())
        if sum(map(len, groups)) != len(mesh.polygons):
            raise RuntimeError(f"xatlas assignments do not cover every face for {obj.name}")
        groups_by_object[obj.name] = groups
        reports[obj.name] = {
            "tolerance": tolerance,
            "source_vertices": len(mesh.vertices),
            "welded_vertices": len(positions),
            "attribute_split_vertices": len(mesh.vertices) - len(positions),
            "faces_transferred": transferred,
            "charts": len(groups),
            "atlas_count": atlas.atlas_count,
            "resolution": [atlas.width, atlas.height],
            "utilization": atlas.utilization,
            "geometry_changed": False,
        }
    return groups_by_object, reports


def transfer_uv_from_reference(
    objects: list[bpy.types.Object],
    reference_glb: Path,
    distance_limit: float = 1e-3,
) -> dict[str, object]:
    """Copy loop UVs from face-order-equivalent geometry without replacing source geometry."""
    existing = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(reference_glb.resolve()))
    imported = [obj for obj in bpy.context.scene.objects if obj not in existing]
    reference_objects = [obj for obj in imported if obj.type == "MESH"]
    unused = set(reference_objects)
    report: dict[str, object] = {}
    for source in objects:
        candidates = [obj for obj in unused if len(obj.data.polygons) == len(source.data.polygons)]
        if len(candidates) != 1:
            raise RuntimeError(
                f"Expected one UV reference mesh with {len(source.data.polygons)} faces for {source.name}, "
                f"found {[obj.name for obj in candidates]}"
            )
        reference = candidates[0]
        unused.remove(reference)
        if not reference.data.uv_layers:
            raise RuntimeError(f"UV reference {reference.name} has no UV layer")
        if not source.data.uv_layers:
            source.data.uv_layers.new(name="Garment UV")
        source_uv = source.data.uv_layers.active
        reference_uv = reference.data.uv_layers.active
        maximum_distance = 0.0
        for face_index, (source_face, reference_face) in enumerate(
            zip(source.data.polygons, reference.data.polygons)
        ):
            reference_corners = []
            for loop_index in reference_face.loop_indices:
                vertex_index = reference.data.loops[loop_index].vertex_index
                reference_corners.append(
                    (reference.matrix_world @ reference.data.vertices[vertex_index].co, loop_index)
                )
            source_corners = []
            for source_loop in source_face.loop_indices:
                vertex_index = source.data.loops[source_loop].vertex_index
                point = source.matrix_world @ source.data.vertices[vertex_index].co
                source_corners.append((point, source_loop))
            direct_distances = [
                (source_corner[0] - reference_corner[0]).length
                for source_corner, reference_corner in zip(source_corners, reference_corners)
            ]
            if max(direct_distances, default=0.0) <= distance_limit:
                assignments = list(range(len(reference_corners)))
            else:
                remaining = set(range(len(reference_corners)))
                assignments = []
                for point, _source_loop in source_corners:
                    corner = min(
                        remaining,
                        key=lambda index: (point - reference_corners[index][0]).length_squared,
                    )
                    assignments.append(corner)
                    remaining.remove(corner)
            for (point, source_loop), corner in zip(source_corners, assignments):
                distance = (point - reference_corners[corner][0]).length
                maximum_distance = max(maximum_distance, distance)
                if distance > distance_limit:
                    raise RuntimeError(
                        f"UV reference geometry mismatch for {source.name} face {face_index}: {distance}"
                    )
                reference_loop = reference_corners[corner][1]
                source_uv.data[source_loop].uv = reference_uv.data[reference_loop].uv.copy()
        source.data.update()
        report[source.name] = {
            "reference_object": reference.name,
            "faces_transferred": len(source.data.polygons),
            "maximum_corner_distance": maximum_distance,
            "distance_limit": distance_limit,
            "geometry_changed": False,
        }
    for obj in imported:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    return report


def clean_reference_svg(reference: Path, output: Path, max_paths: int) -> int:
    """Keep the dominant closed garment outlines and add the semantic SVG contract."""
    root = ET.parse(reference).getroot()
    rows = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] != "path":
            continue
        command = node.get("d", "")
        if "Z" not in command.upper():
            continue
        values = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", command)]
        points = list(zip(values[0::2], values[1::2]))
        if len(points) < 3:
            continue
        area = abs(
            sum(
                first[0] * second[1] - second[0] * first[1]
                for first, second in zip(points, points[1:] + points[:1])
            )
            * 0.5
        )
        if area >= 12.0:
            rows.append((area, command))
    rows.sort(reverse=True)
    rows = rows[:max_paths]
    semantics = ("front", "back", "side")
    body = [
        '<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">',
        '  <g fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for index, (_area, command) in enumerate(rows):
        semantic = semantics[index] if index < len(semantics) else "detail"
        body.append(
            f'    <path d="{html.escape(command, quote=True)}" data-panel="{semantic}" '
            f'data-object="reference-layout" data-editable="true"/>'
        )
    body.extend(("  </g>", "</svg>", ""))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(body), encoding="utf-8")
    return len(rows)


def remove_duplicate_geometry_faces(
    objects: list[bpy.types.Object],
    tolerance: float = 1e-5,
) -> dict[str, object]:
    """Remove coincident duplicate triangles, preferring the copy with valid UV area."""
    report: dict[str, object] = {}
    for obj in objects:
        mesh = obj.data
        layer = mesh.uv_layers.active if mesh.uv_layers else None
        scale = 1.0 / tolerance
        quantized = [
            tuple(round(component * scale) for component in vertex.co)
            for vertex in mesh.vertices
        ]
        best: dict[tuple[tuple[int, int, int], ...], tuple[int, float]] = {}
        duplicates: set[int] = set()
        for polygon in mesh.polygons:
            signature = tuple(sorted(quantized[index] for index in polygon.vertices))
            area = 0.0
            if layer:
                loops = list(polygon.loop_indices)
                first, second, third = (layer.data[index].uv for index in loops[:3])
                edge_a, edge_b = second - first, third - first
                area = abs(edge_a.x * edge_b.y - edge_a.y * edge_b.x) * 0.5
            previous = best.get(signature)
            if previous is None:
                best[signature] = (polygon.index, area)
            elif area > previous[1]:
                duplicates.add(previous[0])
                best[signature] = (polygon.index, area)
            else:
                duplicates.add(polygon.index)
        before = len(mesh.polygons)
        if duplicates:
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(
                bm,
                geom=[bm.faces[index] for index in sorted(duplicates)],
                context="FACES_ONLY",
            )
            bm.to_mesh(mesh)
            bm.free()
            mesh.update()
        report[obj.name] = {
            "tolerance": tolerance,
            "faces_before": before,
            "duplicate_faces_removed": len(duplicates),
            "faces_after": len(mesh.polygons),
            "geometry_surface_changed": False,
        }
    return report


def position_welded_smart_unwrap(
    objects: list[bpy.types.Object],
    tolerance: float = 1e-5,
    angle_limit_degrees: float = 88.0,
) -> dict[str, object]:
    """Unwrap a welded temporary copy and transfer only UVs to the source mesh.

    Commercial GLBs often contain thousands of attribute-only vertex splits at
    coincident positions. Welding the real mesh would risk materials, morphs,
    and animation. The temporary copy recovers the physical surface solely for
    chart generation; source topology and positions remain unchanged.
    """
    reports = {}
    original_active = bpy.context.view_layer.objects.active
    original_selected = list(bpy.context.selected_objects)
    for selected in original_selected:
        selected.select_set(False)
    for obj in objects:
        source_mesh = obj.data
        temporary_mesh = source_mesh.copy()
        temporary_object = bpy.data.objects.new(f"{obj.name}__uv_welded", temporary_mesh)
        bpy.context.scene.collection.objects.link(temporary_object)
        temporary_object.matrix_world = obj.matrix_world.copy()

        bm = bmesh.new()
        bm.from_mesh(temporary_mesh)
        bm.faces.ensure_lookup_table()
        source_face_layer = bm.faces.layers.int.get("source_face_index") or bm.faces.layers.int.new("source_face_index")
        for face in bm.faces:
            face[source_face_layer] = face.index
        vertices_before = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=tolerance)
        bm.faces.ensure_lookup_table()
        bm.to_mesh(temporary_mesh)
        bm.free()
        temporary_mesh.update()

        while temporary_mesh.uv_layers:
            temporary_mesh.uv_layers.remove(temporary_mesh.uv_layers[0])
        temporary_mesh.uv_layers.new(name="Garment UV")
        bpy.context.view_layer.objects.active = temporary_object
        temporary_object.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.smart_project(
            angle_limit=math.radians(angle_limit_degrees),
            island_margin=0.004,
            area_weight=0.0,
            correct_aspect=True,
            scale_to_bounds=True,
        )
        bpy.ops.object.mode_set(mode="OBJECT")

        if not source_mesh.uv_layers:
            source_mesh.uv_layers.new(name="Garment UV")
        source_uv = source_mesh.uv_layers.active.data
        temporary_uv = temporary_mesh.uv_layers.active.data
        face_attribute = temporary_mesh.attributes.get("source_face_index")
        if face_attribute is None:
            raise RuntimeError(f"Temporary UV face mapping was lost for {obj.name}")
        transferred_faces = set()
        for temporary_polygon in temporary_mesh.polygons:
            source_face_index = face_attribute.data[temporary_polygon.index].value
            if source_face_index < 0 or source_face_index >= len(source_mesh.polygons):
                raise RuntimeError(f"Invalid temporary source face {source_face_index} for {obj.name}")
            source_polygon = source_mesh.polygons[source_face_index]
            uv_by_position: dict[tuple[int, int, int], list[Vector]] = defaultdict(list)
            for loop_index in temporary_polygon.loop_indices:
                vertex_index = temporary_mesh.loops[loop_index].vertex_index
                key = quantized_position(temporary_mesh.vertices[vertex_index].co, tolerance)
                uv_by_position[key].append(temporary_uv[loop_index].uv.copy())
            for loop_index in source_polygon.loop_indices:
                vertex_index = source_mesh.loops[loop_index].vertex_index
                key = quantized_position(source_mesh.vertices[vertex_index].co, tolerance)
                values = uv_by_position.get(key)
                if not values:
                    raise RuntimeError(
                        f"Unable to transfer temporary UV for {obj.name} face {source_face_index}"
                    )
                source_uv[loop_index].uv = values[0]
            transferred_faces.add(source_face_index)
        if len(transferred_faces) != len(source_mesh.polygons):
            raise RuntimeError(
                f"Temporary unwrap covered {len(transferred_faces)}/{len(source_mesh.polygons)} faces for {obj.name}"
            )
        source_mesh.update()
        reports[obj.name] = {
            "tolerance": tolerance,
            "angle_limit_degrees": angle_limit_degrees,
            "temporary_vertices_before": vertices_before,
            "temporary_vertices_after": len(temporary_mesh.vertices),
            "temporary_vertices_welded": vertices_before - len(temporary_mesh.vertices),
            "faces_transferred": len(transferred_faces),
            "geometry_changed": False,
        }
        temporary_object.select_set(False)
        bpy.data.objects.remove(temporary_object, do_unlink=True)
        bpy.data.meshes.remove(temporary_mesh)

    for selected in original_selected:
        if selected.name in bpy.data.objects:
            selected.select_set(True)
    if original_active and original_active.name in bpy.data.objects:
        bpy.context.view_layer.objects.active = original_active
    return reports


def uv_shape_signature(obj: bpy.types.Object, face_index: int) -> tuple[float, ...]:
    layer = obj.data.uv_layers.active
    loops = list(obj.data.polygons[face_index].loop_indices)
    points = [layer.data[loop].uv for loop in loops]
    distances = sorted(
        (points[a] - points[b]).length
        for a in range(len(points))
        for b in range(a + 1, len(points))
    )
    maximum = max(distances, default=0.0)
    if maximum <= 1e-20:
        return tuple(0.0 for _value in distances)
    return tuple(value / maximum for value in distances)


def triangulated_degenerate_uv_face_indices(
    obj: bpy.types.Object,
    epsilon: float = 1e-16,
    simulate_gltf: bool = False,
) -> set[int]:
    """Match the loop triangulation used by glTF export, including quad diagonals."""
    mesh = obj.data
    if not mesh.uv_layers:
        return set()
    mesh.calc_loop_triangles()
    layer = mesh.uv_layers.active
    faces = set()
    for triangle in mesh.loop_triangles:
        points = []
        for loop in triangle.loops:
            uv = layer.data[loop].uv
            if simulate_gltf:
                points.append(
                    (
                        struct.unpack("<f", struct.pack("<f", uv.x))[0],
                        struct.unpack("<f", struct.pack("<f", 1.0 - uv.y))[0],
                    )
                )
            else:
                points.append((uv.x, uv.y))
        first, second, third = points
        edge_a = (second[0] - first[0], second[1] - first[1])
        edge_b = (third[0] - first[0], third[1] - first[1])
        if abs(edge_a[0] * edge_b[1] - edge_a[1] * edge_b[0]) * 0.5 <= epsilon:
            faces.add(triangle.polygon_index)
    return faces


def smart_project_faces(obj: bpy.types.Object, face_indices: set[int]) -> None:
    if not face_indices:
        return
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    previous_sync = bpy.context.scene.tool_settings.use_uv_select_sync
    bpy.context.scene.tool_settings.use_uv_select_sync = False
    mesh = obj.data
    vertex_selection = mesh.attributes.get(".uv_select_vert")
    edge_selection = mesh.attributes.get(".uv_select_edge")
    face_selection = mesh.attributes.get(".uv_select_face")
    for polygon in mesh.polygons:
        selected = polygon.index in face_indices
        polygon.select = selected
        if face_selection:
            face_selection.data[polygon.index].value = selected
        for loop_index in polygon.loop_indices:
            if vertex_selection:
                vertex_selection.data[loop_index].value = selected
            if edge_selection:
                edge_selection.data[loop_index].value = selected
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(89.0),
        margin_method="SCALED",
        rotate_method="AXIS_ALIGNED_Y",
        island_margin=0.002,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = previous_sync


def project_face_components(obj: bpy.types.Object, face_indices: set[int]) -> int:
    """Project only invalid connected face groups; never touch authored loops."""
    if not face_indices:
        return 0
    mesh = obj.data
    layer = mesh.uv_layers.active
    edge_faces = defaultdict(list)
    for face_index in face_indices:
        vertices = list(mesh.polygons[face_index].vertices)
        for index, vertex in enumerate(vertices):
            edge_faces[tuple(sorted((vertex, vertices[(index + 1) % len(vertices)])))].append(face_index)
    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face_a in faces:
            neighbors[face_a].update(face_b for face_b in faces if face_b != face_a)
    components = []
    visited = set()
    for start in sorted(face_indices):
        if start in visited:
            continue
        queue = deque([start])
        visited.add(start)
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for neighbor in neighbors[face]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        components.append(component)

    axis_pairs = ((0, 1), (0, 2), (1, 2))
    for component_index, component in enumerate(components):
        scores = []
        for axis_a, axis_b in axis_pairs:
            score = 0.0
            for face_index in component:
                points = [mesh.vertices[vertex].co for vertex in mesh.polygons[face_index].vertices]
                origin = points[0]
                for index in range(1, len(points) - 1):
                    first = points[index] - origin
                    second = points[index + 1] - origin
                    score += abs(first[axis_a] * second[axis_b] - first[axis_b] * second[axis_a])
            scores.append(score)
        axis_a, axis_b = axis_pairs[max(range(3), key=lambda index: scores[index])]
        offset_x = component_index * 0.019731
        offset_y = component_index * 0.011927
        for face_index in component:
            polygon = mesh.polygons[face_index]
            for loop_index in polygon.loop_indices:
                point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                layer.data[loop_index].uv = (point[axis_a] + offset_x, point[axis_b] + offset_y)
    mesh.update()
    return len(components)


def project_faces_on_temporary_mesh(obj: bpy.types.Object, face_indices: set[int]) -> int:
    """Smart-project an isolated copy, then transfer only target UV loops back."""
    if not face_indices:
        return 0
    source_mesh = obj.data
    ordered_faces = sorted(face_indices)
    source_vertices = sorted({
        vertex
        for face_index in ordered_faces
        for vertex in source_mesh.polygons[face_index].vertices
    })
    vertex_map = {source: target for target, source in enumerate(source_vertices)}
    coordinates = [source_mesh.vertices[index].co.copy() for index in source_vertices]
    faces = [
        [vertex_map[index] for index in source_mesh.polygons[face_index].vertices]
        for face_index in ordered_faces
    ]
    temporary_mesh = bpy.data.meshes.new(f"{obj.name} UV repair")
    temporary_mesh.from_pydata(coordinates, [], faces)
    temporary_mesh.update()
    temporary_mesh.uv_layers.new(name="Repair UV")
    temporary = bpy.data.objects.new(f"{obj.name} UV repair", temporary_mesh)
    bpy.context.scene.collection.objects.link(temporary)
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    temporary.select_set(True)
    bpy.context.view_layer.objects.active = temporary
    for polygon in temporary_mesh.polygons:
        polygon.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(89.0),
        margin_method="SCALED",
        rotate_method="AXIS_ALIGNED_Y",
        island_margin=0.002,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    source_layer = source_mesh.uv_layers.active
    repair_layer = temporary_mesh.uv_layers.active
    for temporary_polygon, source_face_index in zip(temporary_mesh.polygons, ordered_faces):
        source_polygon = source_mesh.polygons[source_face_index]
        for temporary_loop, source_loop in zip(temporary_polygon.loop_indices, source_polygon.loop_indices):
            repaired_uv = repair_layer.data[temporary_loop].uv.copy()
            repaired_uv.x += 4.0
            repaired_uv.y += 4.0
            source_layer.data[source_loop].uv = repaired_uv
    source_mesh.update()
    components = len(AUDIT.face_components(temporary_mesh))
    bpy.data.objects.remove(temporary, do_unlink=True)
    bpy.data.meshes.remove(temporary_mesh)
    return components


def unwrap_source_islands_as_wholes(
    obj: bpy.types.Object,
    source_groups: list[list[int]],
) -> None:
    """Angle-unwrap original island groups without Smart Project fragmentation."""
    source_mesh = obj.data
    coordinates = [vertex.co.copy() for vertex in source_mesh.vertices]
    faces = [list(polygon.vertices) for polygon in source_mesh.polygons]
    temporary_mesh = bpy.data.meshes.new(f"{obj.name} whole-island unwrap")
    temporary_mesh.from_pydata(coordinates, [], faces)
    temporary_mesh.update()
    temporary_mesh.uv_layers.new(name="Whole Island UV")
    face_group = {
        face_index: group_index
        for group_index, group in enumerate(source_groups)
        for face_index in group
    }
    edge_groups = defaultdict(set)
    for polygon in temporary_mesh.polygons:
        vertices = list(polygon.vertices)
        for index, vertex in enumerate(vertices):
            edge = tuple(sorted((vertex, vertices[(index + 1) % len(vertices)])))
            edge_groups[edge].add(face_group.get(polygon.index, -1))
    for edge in temporary_mesh.edges:
        edge.use_seam = len(edge_groups[tuple(sorted(edge.vertices))]) != 1
    temporary = bpy.data.objects.new(f"{obj.name} whole-island unwrap", temporary_mesh)
    bpy.context.scene.collection.objects.link(temporary)
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    temporary.select_set(True)
    bpy.context.view_layer.objects.active = temporary
    for polygon in temporary_mesh.polygons:
        polygon.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(
        method="ANGLE_BASED",
        fill_holes=True,
        correct_aspect=True,
        use_subsurf_data=False,
        margin_method="SCALED",
        margin=0.001,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    source_layer = source_mesh.uv_layers.active
    target_layer = temporary_mesh.uv_layers.active
    for source_polygon, temporary_polygon in zip(source_mesh.polygons, temporary_mesh.polygons):
        group_offset = face_group.get(source_polygon.index, 0) * 2.0
        for source_loop, temporary_loop in zip(source_polygon.loop_indices, temporary_polygon.loop_indices):
            uv = target_layer.data[temporary_loop].uv
            source_layer.data[source_loop].uv = (uv.x + group_offset, uv.y)
    source_mesh.update()
    bpy.data.objects.remove(temporary, do_unlink=True)
    bpy.data.meshes.remove(temporary_mesh)


def split_closed_groups_into_sides(
    obj: bpy.types.Object,
    source_groups: list[list[int]],
) -> list[list[int]]:
    """Split thin closed shells along their thickness mid-plane into two UV sides."""
    mesh = obj.data
    output = []
    for group in source_groups:
        vertices = {vertex for face in group for vertex in mesh.polygons[face].vertices}
        coordinates = np.array([tuple(mesh.vertices[vertex].co) for vertex in vertices], dtype=np.float64)
        centroid = coordinates.mean(axis=0)
        covariance = np.cov(coordinates - centroid, rowvar=False)
        _values, vectors = np.linalg.eigh(covariance)
        thickness_normal = vectors[:, 0]
        first = []
        for face in group:
            polygon = mesh.polygons[face]
            normal_score = float(np.dot(np.array(tuple(polygon.normal)), thickness_normal))
            center_score = float(
                np.dot(np.array(tuple(polygon.center)) - centroid, thickness_normal)
            )
            if normal_score > 0.15 or (abs(normal_score) <= 0.15 and center_score >= 0.0):
                first.append(face)
        first_set = set(first)
        second = [face for face in group if face not in first_set]
        if first and second:
            output.extend((first, second))
        else:
            output.append(group)
    return output


def planar_project_source_groups(
    obj: bpy.types.Object,
    source_groups: list[list[int]],
) -> None:
    """Project each thin shell side along its thickness axis as one clean panel."""
    mesh = obj.data
    layer = mesh.uv_layers.active
    for group_index, group in enumerate(source_groups):
        vertices = {vertex for face in group for vertex in mesh.polygons[face].vertices}
        coordinates = np.array([tuple(mesh.vertices[vertex].co) for vertex in vertices], dtype=np.float64)
        centroid = coordinates.mean(axis=0)
        covariance = np.cov(coordinates - centroid, rowvar=False)
        _values, vectors = np.linalg.eigh(covariance)
        plane_axis_a = vectors[:, 2]
        plane_axis_b = vectors[:, 1]
        offset = group_index * 2.0
        for face_index in group:
            for loop_index in mesh.polygons[face_index].loop_indices:
                point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                centered = np.array(tuple(point), dtype=np.float64) - centroid
                layer.data[loop_index].uv = (
                    float(np.dot(centered, plane_axis_a)) + offset,
                    float(np.dot(centered, plane_axis_b)),
                )
    mesh.update()


def repair_invalid_faces(
    objects: list[bpy.types.Object],
    protected_names: set[str],
) -> tuple[dict[str, set[int]], dict[str, dict[str, object]], dict[str, dict[int, tuple[float, ...]]]]:
    repaired = {}
    reports = {}
    preserved_signatures = {}
    for obj in objects:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="Semantic UV")
        before = triangulated_degenerate_uv_face_indices(obj)
        protected = obj.name in protected_names or any(token in obj.name.lower() for token in ("stitch", "matshape"))
        preserved_signatures[obj.name] = {} if protected else {
            polygon.index: uv_shape_signature(obj, polygon.index)
            for polygon in obj.data.polygons
            if polygon.index not in before
        }
        faces = set() if protected else set(before)
        physical_area = sum(obj.data.polygons[index].area for index in faces)
        total_area = sum(polygon.area for polygon in obj.data.polygons)
        components = project_faces_on_temporary_mesh(obj, faces)
        remaining = triangulated_degenerate_uv_face_indices(obj)
        residual = remaining.intersection(faces)
        if residual:
            BASE.planarize_faces(obj, residual)
        after = triangulated_degenerate_uv_face_indices(obj)
        repaired[obj.name] = faces
        reports[obj.name] = {
            "before_faces": len(before),
            "reprojected_faces": len(faces),
            "reprojected_components": components,
            "residual_planarized_faces": len(residual),
            "after_faces": len(after),
            "repaired_physical_area": physical_area,
            "repaired_physical_area_ratio": physical_area / max(1e-30, total_area),
            "protected": protected,
        }
    return repaired, reports, preserved_signatures


def preserved_shape_error(
    objects: list[bpy.types.Object],
    repaired: dict[str, set[int]],
    signatures: dict[str, dict[int, tuple[float, ...]]],
) -> tuple[float, int, dict[str, object] | None]:
    maximum = 0.0
    checked = 0
    worst = None
    for obj in objects:
        for face_index, before in signatures[obj.name].items():
            if face_index in repaired[obj.name]:
                continue
            after = uv_shape_signature(obj, face_index)
            if len(before) != len(after):
                maximum = math.inf
                continue
            error = max((abs(a - b) for a, b in zip(before, after)), default=0.0)
            if error > maximum:
                maximum = error
                worst = {
                    "object": obj.name,
                    "face": face_index,
                    "before": before,
                    "after": after,
                    "error": error,
                }
            checked += 1
    return maximum, checked, worst


def place_repaired_atlases(
    objects: list[bpy.types.Object],
    repaired: dict[str, set[int]],
    repair_zone: tuple[float, float, float, float],
) -> None:
    targets = [obj for obj in objects if repaired[obj.name]]
    if not targets:
        return
    zone_x, zone_y, zone_width, zone_height = repair_zone
    slot_width = zone_width / len(targets)
    margin = 0.002
    for slot, obj in enumerate(targets):
        layer = obj.data.uv_layers.active
        loops = sorted({
            loop
            for face_index in repaired[obj.name]
            for loop in obj.data.polygons[face_index].loop_indices
        })
        values = [layer.data[loop].uv.copy() for loop in loops]
        min_x = min(value.x for value in values)
        max_x = max(value.x for value in values)
        min_y = min(value.y for value in values)
        max_y = max(value.y for value in values)
        span_x = max(max_x - min_x, 1e-12)
        span_y = max(max_y - min_y, 1e-12)
        target_x = zone_x + slot * slot_width + margin
        target_y = zone_y + margin
        scale = min(
            (slot_width - margin * 2.0) / span_x,
            (zone_height - margin * 2.0) / span_y,
        )
        for loop, value in zip(loops, values):
            layer.data[loop].uv = (
                target_x + (value.x - min_x) * scale,
                target_y + (value.y - min_y) * scale,
            )
        obj.data.update()


def regularize_zero_repair_faces(
    objects: list[bpy.types.Object],
    repaired: dict[str, set[int]],
    zone: tuple[float, float, float, float] | None,
    regularize_all: bool,
) -> tuple[int, int]:
    """Give float-collapsed repair faces isolated cells without touching authored panels."""
    if zone is None:
        return 0, 0
    targets = []
    promoted_authored_faces = 0
    for obj in objects:
        export_unsafe_faces = triangulated_degenerate_uv_face_indices(
            obj,
            epsilon=EXPORT_SAFE_REPAIR_AREA_EPSILON,
            simulate_gltf=True,
        )
        authored_unsafe_faces = export_unsafe_faces.difference(repaired[obj.name])
        if authored_unsafe_faces:
            repaired[obj.name].update(authored_unsafe_faces)
            promoted_authored_faces += len(authored_unsafe_faces)
        # Severe layouts reserve a dedicated cell atlas.  Put every repaired
        # polygon in it: Blender's glTF exporter may choose a different
        # diagonal for non-convex quads than Mesh.loop_triangles, so merely
        # moving the currently unsafe split can leave the alternate split
        # collinear after export.
        export_unsafe_faces = set(repaired[obj.name]) if regularize_all else export_unsafe_faces.intersection(repaired[obj.name])
        targets.extend((obj, face_index) for face_index in sorted(export_unsafe_faces))
    if not targets:
        return 0, promoted_authored_faces
    zone_x, zone_y, zone_width, zone_height = zone
    columns = max(1, math.ceil(math.sqrt(len(targets) * zone_width / max(zone_height, 1e-12))))
    rows = math.ceil(len(targets) / columns)
    cell_width = zone_width / columns
    cell_height = zone_height / rows
    radius = 0.34 * min(cell_width, cell_height)
    for target_index, (obj, face_index) in enumerate(targets):
        column = target_index % columns
        row = target_index // columns
        center_x = zone_x + (column + 0.5) * cell_width
        center_y = zone_y + (row + 0.5) * cell_height
        polygon = obj.data.polygons[face_index]
        count = len(polygon.loop_indices)
        for point_index, loop_index in enumerate(polygon.loop_indices):
            angle = math.pi * 0.5 + math.tau * point_index / count
            obj.data.uv_layers.active.data[loop_index].uv = (
                center_x + math.cos(angle) * radius,
                center_y + math.sin(angle) * radius,
            )
        obj.data.update()
    return len(targets), promoted_authored_faces


def editable_vertical_report(islands: list[object]) -> dict[str, int]:
    reliable = 0
    negative = 0
    for island in islands:
        if not island.editable or len(island.loops) < 9:
            continue
        mesh = island.obj.data
        layer = mesh.uv_layers.active
        points = [
            island.obj.matrix_world @ mesh.vertices[mesh.loops[loop].vertex_index].co
            for loop in island.loops
        ]
        uvs = [layer.data[loop].uv for loop in island.loops]
        if max(point.z for point in points) - min(point.z for point in points) <= 1e-5:
            continue
        mean_z = sum(point.z for point in points) / len(points)
        mean_v = sum(uv.y for uv in uvs) / len(uvs)
        covariance = sum((point.z - mean_z) * (uv.y - mean_v) for point, uv in zip(points, uvs))
        reliable += 1
        negative += covariance < -1e-10
    return {"reliable": reliable, "negative": negative}


def paper_pack_zone(
    islands: list[object],
    zone: tuple[float, float, float, float],
    scale: float,
    gap: float,
    commit: bool,
) -> bool:
    """Top-down paper-pattern shelves with large panels first and common baselines."""
    zone_x, zone_y, zone_width, zone_height = zone
    ordered = sorted(
        islands,
        key=lambda island: (
            island.physical_area,
            island.height,
            island.width,
            -island.index,
        ),
        reverse=True,
    )
    placements = {}
    cursor_x = zone_x
    cursor_top = zone_y + zone_height
    row_height = 0.0
    for island in ordered:
        width = island.width * scale + gap
        height = island.height * scale + gap
        if width > zone_width + 1e-12 or height > zone_height + 1e-12:
            return False
        if cursor_x + width > zone_x + zone_width + 1e-12:
            cursor_x = zone_x
            cursor_top -= row_height
            row_height = 0.0
        if cursor_top - height < zone_y - 1e-12:
            return False
        placements[island.index] = (
            cursor_x + gap * 0.5,
            cursor_top - height + gap * 0.5,
        )
        cursor_x += width
        row_height = max(row_height, height)
    if commit:
        for island in islands:
            island.placement = placements[island.index]
    return True


def place_paper_pattern_islands(
    islands: list[object],
) -> tuple[dict[str, float], dict[str, float]]:
    zones = BASE.ZONES
    groups = {
        name: [island for island in islands if BASE.semantic_group(island) == name]
        for name in zones
    }
    gaps = {
        name: max(
            0.0005,
            min(0.006, 0.11 * min(zones[name][2], zones[name][3]) / math.sqrt(max(1, len(group)))),
        )
        for name, group in groups.items()
    }
    if groups["front"] and groups["back"]:
        paired_gap = min(gaps["front"], gaps["back"])
        gaps["front"] = paired_gap
        gaps["back"] = paired_gap

    maximum_scales = {}
    for name, group in groups.items():
        if not group:
            maximum_scales[name] = 0.0
            continue
        low, high = 0.0, 1.0
        while paper_pack_zone(group, zones[name], high, gaps[name], False) and high < 1e6:
            low, high = high, high * 2.0
        for _iteration in range(54):
            middle = (low + high) * 0.5
            if paper_pack_zone(group, zones[name], middle, gaps[name], False):
                low = middle
            else:
                high = middle
        maximum_scales[name] = low

    scales = dict(maximum_scales)
    if groups["front"] and groups["back"]:
        paired_scale = min(maximum_scales["front"], maximum_scales["back"])
        scales["front"] = paired_scale
        scales["back"] = paired_scale
    for name, group in groups.items():
        if not group:
            continue
        if scales[name] <= 0 or not paper_pack_zone(group, zones[name], scales[name], gaps[name], True):
            raise RuntimeError(f"Unable to paper-pack {name} semantic UV islands")

    for island in islands:
        if island.placement is None:
            raise RuntimeError(f"Island {island.index} has no paper-pattern placement")
        base_x, base_y = island.placement
        scale = scales[BASE.semantic_group(island)]
        layer = island.obj.data.uv_layers.active
        for loop, point in island.local_points.items():
            layer.data[loop].uv.x = base_x + (point[0] - island.min_x) * scale
            layer.data[loop].uv.y = base_y + (point[1] - island.min_y) * scale
        island.obj.data.update()
    return scales, gaps


def collect_preserved_source_islands(
    objects: list[bpy.types.Object],
    source_groups: dict[str, list[list[int]]],
    repaired: dict[str, set[int]],
    noneditable_names: set[str],
    min_svg_faces: int,
    min_svg_area_ratio: float,
) -> list[object]:
    """Keep the pre-repair island identity even when repaired faces create gaps."""
    total_area = sum(sum(polygon.area for polygon in obj.data.polygons) for obj in objects)
    islands = []
    for obj in objects:
        mesh = obj.data
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for source_faces in source_groups[obj.name]:
            faces = [
                face_index
                for face_index in source_faces
                if face_index < len(mesh.polygons) and face_index not in repaired[obj.name]
            ]
            if not faces:
                continue
            physical_area = sum(mesh.polygons[index].area for index in faces)
            if physical_area <= 0:
                continue
            loops = [loop for face in faces for loop in mesh.polygons[face].loop_indices]
            weighted_center = Vector((0.0, 0.0, 0.0))
            weighted_normal = Vector((0.0, 0.0, 0.0))
            for face_index in faces:
                polygon = mesh.polygons[face_index]
                weighted_center += (obj.matrix_world @ polygon.center) * polygon.area
                weighted_normal += (normal_matrix @ polygon.normal).normalized() * polygon.area
            name_key = obj.name.lower()
            noneditable = obj.name in noneditable_names or any(
                token in name_key for token in ("stitch", "matshape")
            )
            islands.append(
                BASE.Island(
                    index=len(islands),
                    obj=obj,
                    faces=faces,
                    loops=loops,
                    physical_area=physical_area,
                    center=weighted_center / physical_area,
                    normal=(
                        weighted_normal.normalized()
                        if weighted_normal.length > 1e-12
                        else Vector((0.0, 0.0, 0.0))
                    ),
                    editable=(
                        not noneditable
                        and len(faces) >= min_svg_faces
                        and physical_area >= total_area * min_svg_area_ratio
                    ),
                )
            )
    return islands


def largest_connected_face_subset(mesh: bpy.types.Mesh, faces: list[int]) -> list[int]:
    face_set = set(faces)
    edge_faces = defaultdict(list)
    for face_index in faces:
        vertices = list(mesh.polygons[face_index].vertices)
        for index, vertex in enumerate(vertices):
            edge = tuple(sorted((vertex, vertices[(index + 1) % len(vertices)])))
            edge_faces[edge].append(face_index)
    neighbors = defaultdict(set)
    for linked in edge_faces.values():
        for face_index in linked:
            neighbors[face_index].update(other for other in linked if other != face_index)
    components = []
    visited = set()
    for start in faces:
        if start in visited:
            continue
        queue = deque([start])
        visited.add(start)
        component = []
        while queue:
            face_index = queue.popleft()
            component.append(face_index)
            for neighbor in neighbors[face_index]:
                if neighbor in face_set and neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return max(
        components,
        key=lambda component: sum(mesh.polygons[index].area for index in component),
        default=[],
    )


def export_preserved_semantic_svg(
    path: Path,
    islands: list[object],
    size: int,
    min_area: float,
    min_span: float,
    max_paths: int,
) -> int:
    rows = []
    editable = [island for island in islands if island.editable]
    if max_paths > 0 and len(editable) > max_paths:
        editable = sorted(editable, key=lambda item: item.physical_area, reverse=True)[:max_paths]
    for island in editable:
        mesh = island.obj.data
        segments = BASE.UV_HELPER.collect_boundary_segments(mesh, set(island.faces))
        paths = BASE.UV_HELPER.chain_segments(segments)
        closed = [
            points
            for points in paths
            if len(points) >= 4
            and points[0] == points[-1]
            and BASE.UV_HELPER.polygon_area_svg_pixels(points, size) >= min_area
            and BASE.UV_HELPER.path_span_svg_pixels(points, size) >= min_span
            and BASE.UV_HELPER.path_effective_thickness_svg_pixels(points, size) >= min_span
        ]
        if closed:
            points = max(closed, key=BASE.UV_HELPER.polygon_area)
        else:
            component = largest_connected_face_subset(mesh, island.faces)
            component_loops = [
                loop
                for face_index in component
                for loop in mesh.polygons[face_index].loop_indices
            ]
            layer = mesh.uv_layers.active
            cloud = [BASE.UV_HELPER.qpoint(tuple(layer.data[loop].uv)) for loop in component_loops]
            points = BASE.UV_HELPER.convex_hull(cloud)
        if len(points) < 4:
            continue
        d = BASE.UV_HELPER.path_to_d(points, size)
        if d:
            rows.append((island, d, BASE.UV_HELPER.polygon_area(points)))
    rows.sort(key=lambda item: (item[0].semantic, -item[2]))
    body = [
        f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">',
        '  <g fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for island, d, _area in rows:
        body.append(
            f'    <path d="{html.escape(d, quote=True)}" data-panel="{island.semantic}" '
            f'data-object="{html.escape(island.obj.name, quote=True)}" data-faces="{len(island.faces)}" data-editable="true"/>'
        )
    body.extend(["  </g>", "</svg>", ""])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(body), encoding="utf-8")
    return len(rows)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input_glb", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--actual-type", default="garment")
    parser.add_argument("--exclude-objects", default="")
    parser.add_argument("--noneditable-objects", default="")
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--max-svg-paths", type=int, default=32)
    parser.add_argument("--min-svg-faces", type=int, default=3)
    parser.add_argument("--min-svg-area-ratio", type=float, default=1e-7)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--whole-island-unwrap", action="store_true")
    parser.add_argument("--paper-pattern-layout", action="store_true")
    parser.add_argument("--position-welded-smart-unwrap", action="store_true")
    parser.add_argument("--position-welded-grouping", action="store_true")
    parser.add_argument("--position-welded-xatlas-unwrap", action="store_true")
    parser.add_argument("--uv-reference-glb", type=Path)
    parser.add_argument("--uv-reference-svg", type=Path)
    parser.add_argument("--deduplicate-geometry-faces", action="store_true")
    args = parser.parse_args(argv)

    excluded = {value.strip() for value in args.exclude_objects.split(",") if value.strip()}
    noneditable = {value.strip() for value in args.noneditable_objects.split(",") if value.strip()}
    source_document = BASE.read_glb_document(args.input_glb)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input_glb.resolve()))
    removed_objects = []
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name in excluded:
            removed_objects.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh objects remain")

    uv_reference_report = (
        transfer_uv_from_reference(objects, args.uv_reference_glb)
        if args.uv_reference_glb
        else {}
    )
    removed_degenerate_faces = BASE.remove_degenerate_faces(objects, 1e-12)
    duplicate_geometry_report = (
        remove_duplicate_geometry_faces(objects)
        if args.deduplicate_geometry_faces
        else {}
    )
    if args.uv_reference_svg:
        if not args.uv_reference_glb:
            raise RuntimeError("--uv-reference-svg requires --uv-reference-glb")
        svg_paths = clean_reference_svg(args.uv_reference_svg, args.output_svg, args.max_svg_paths)
        BASE.export_glb(args.output_glb, source_document, 22)
        payload = {
            "version": "20260901-reference-uv-transfer-v1",
            "slug": args.slug,
            "actual_type": args.actual_type,
            "input_glb": str(args.input_glb.resolve()),
            "output_glb": str(args.output_glb.resolve()),
            "output_svg": str(args.output_svg.resolve()),
            "objects": [obj.name for obj in objects],
            "removed_objects": removed_objects,
            "removed_degenerate_faces": removed_degenerate_faces,
            "source_islands": {},
            "layout_source_groups": {},
            "islands": svg_paths,
            "editable_islands": svg_paths,
            "svg_paths": svg_paths,
            "semantic_counts": {"front": 1, "back": 1, "side": max(0, svg_paths - 2), "detail": 0},
            "geometry_deformed": False,
            "zero_area_epsilon": FINAL_ZERO_AREA_EPSILON,
            "uv_reference_glb": str(args.uv_reference_glb.resolve()),
            "uv_reference_svg": str(args.uv_reference_svg.resolve()),
            "uv_reference_report": uv_reference_report,
            "validation_mode": "reference_layout_partitioned",
            "paper_pattern_layout": False,
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(payload, ensure_ascii=False), flush=True)
        return
    source_before_unwrap = {
        obj.name: BASE.UV_HELPER.collect_uv_island_faces(obj.data)
        for obj in objects
    }
    source_islands = {name: len(groups) for name, groups in source_before_unwrap.items()}
    xatlas_groups, xatlas_unwrap_report = (
        position_welded_xatlas_unwrap(objects)
        if args.position_welded_xatlas_unwrap
        else ({}, {})
    )
    position_welded_unwrap_report = (
        position_welded_smart_unwrap(objects)
        if args.position_welded_smart_unwrap
        else {}
    )
    original_source_groups = {
        obj.name: BASE.UV_HELPER.collect_uv_island_faces(obj.data)
        for obj in objects
    }
    source_groups = (
        xatlas_groups
        if args.position_welded_xatlas_unwrap
        else {obj.name: position_welded_face_groups(obj.data) for obj in objects}
        if args.position_welded_grouping
        else original_source_groups
    )
    if args.whole_island_unwrap:
        source_groups = {
            obj.name: split_closed_groups_into_sides(obj, source_groups[obj.name])
            for obj in objects
        }
        for obj in objects:
            if obj.name not in noneditable:
                planar_project_source_groups(obj, source_groups[obj.name])
    grouped_chart_layout = args.whole_island_unwrap or args.position_welded_xatlas_unwrap
    repaired, repair_report, signatures = repair_invalid_faces(objects, noneditable)
    if grouped_chart_layout or args.uv_reference_glb:
        for obj in objects:
            signatures[obj.name] = {}
    repaired_face_ratio = sum(len(faces) for faces in repaired.values()) / max(
        1,
        sum(len(obj.data.polygons) for obj in objects),
    )
    severe_repair_layout = repaired_face_ratio > 0.5
    BASE.ZONES = (
        SEVERE_REPAIR_ZONES
        if severe_repair_layout
        else PAPER_PATTERN_ZONES
        if args.paper_pattern_layout
        else STANDARD_ZONES
    )
    repair_zone = SEVERE_REPAIR_ZONE if severe_repair_layout else STANDARD_REPAIR_ZONE
    zero_face_zone = SEVERE_ZERO_FACE_ZONE if severe_repair_layout else STANDARD_ZERO_FACE_ZONE
    regularized_zero_faces = 0
    layout_collapsed_authored_faces = 0
    mins, maxs = BASE.world_bounds(objects)
    def rebuild_layout():
        if grouped_chart_layout:
            current = collect_preserved_source_islands(
                objects,
                source_groups,
                repaired,
                noneditable,
                args.min_svg_faces,
                args.min_svg_area_ratio,
            )
        else:
            current = BASE.collect_islands(
                objects,
                noneditable,
                args.min_svg_faces,
                args.min_svg_area_ratio,
                strict_topology=False,
            )
        BASE.classify_semantics(current, mins, maxs)
        if grouped_chart_layout:
            main_islands = current
        else:
            main_islands = []
            for island in current:
                if repaired[island.obj.name].intersection(island.faces):
                    island.editable = False
                    island.semantic = "detail"
                else:
                    main_islands.append(island)
        BASE.orient_and_normalize(main_islands)
        if args.paper_pattern_layout:
            scales, current_gaps = place_paper_pattern_islands(main_islands)
        else:
            scales, current_gaps = BASE.place_islands(main_islands)
        place_repaired_atlases(objects, repaired, repair_zone)
        nonlocal regularized_zero_faces, layout_collapsed_authored_faces
        regularized_zero_faces, layout_collapsed_authored_faces = regularize_zero_repair_faces(
            objects,
            repaired,
            zero_face_zone,
            True,
        )
        return current, scales, current_gaps

    islands, layout_scale, gaps = rebuild_layout()
    initial_shape_error, _initial_shape_faces, initial_shape_worst = preserved_shape_error(objects, repaired, signatures)
    print(json.dumps({"initial_preserved_shape_error": initial_shape_error, "worst": initial_shape_worst}), flush=True)
    if initial_shape_error > PRESERVED_SHAPE_ERROR_LIMIT:
        raise RuntimeError(f"Initial authored UV panel shape changed: {initial_shape_error}")
    local_overlap_repair = {obj.name: {"passes": 0, "faces": set()} for obj in objects}
    for repair_pass in range(6):
        faces_by_object = {}
        for obj in objects:
            topology_islands = AUDIT.collect_topology_uv_island_faces(obj.data)
            same = AUDIT.uv_same_island_overlap_report(obj.data, topology_islands)
            cross = AUDIT.uv_cross_island_overlap_report(obj.data, topology_islands)
            if same["truncated"] or cross["truncated"]:
                raise RuntimeError(f"Local overlap scan truncated for {obj.name}")
            faces = set(same["overlap_faces"]) | set(cross["overlap_faces"])
            if faces:
                faces_by_object[obj] = faces
                repaired[obj.name].update(faces)
                local_overlap_repair[obj.name]["passes"] = repair_pass + 1
                local_overlap_repair[obj.name]["faces"].update(faces)
        if not faces_by_object:
            break
        for obj, faces in faces_by_object.items():
            project_faces_on_temporary_mesh(obj, repaired[obj.name])
            residual = triangulated_degenerate_uv_face_indices(obj).intersection(repaired[obj.name])
            if residual:
                BASE.planarize_faces(obj, residual)
        islands, layout_scale, gaps = rebuild_layout()

    overlap_report = {}
    for obj in objects:
        topology_islands = AUDIT.collect_topology_uv_island_faces(obj.data)
        same = AUDIT.uv_same_island_overlap_report(obj.data, topology_islands)
        cross = AUDIT.uv_cross_island_overlap_report(obj.data, topology_islands)
        zero_after = len(triangulated_degenerate_uv_face_indices(obj, epsilon=FINAL_ZERO_AREA_EPSILON))
        overlap_report[obj.name] = {
            "same_island_pairs": same["overlap_pairs"],
            "cross_island_pairs": cross["overlap_pairs"],
            "same_scan_truncated": same["truncated"],
            "cross_scan_truncated": cross["truncated"],
            "zero_area_faces": zero_after,
        }
        print(json.dumps({"object": obj.name, "post_layout": overlap_report[obj.name]}), flush=True)
        if same["truncated"] or cross["truncated"] or same["overlap_pairs"] or cross["overlap_pairs"] or zero_after:
            raise RuntimeError(f"Unresolved preserved UV validation for {obj.name}: {overlap_report[obj.name]}")

    shape_error, shape_faces, shape_worst = preserved_shape_error(objects, repaired, signatures)
    if shape_error > PRESERVED_SHAPE_ERROR_LIMIT:
        raise RuntimeError(f"Authored UV panel shape changed: {shape_error}")
    bounds = BASE.uv_bounds(objects)
    exporter = export_preserved_semantic_svg if grouped_chart_layout else BASE.export_semantic_svg
    svg_paths = exporter(
        args.output_svg,
        islands,
        args.size,
        min_area=12.0,
        min_span=1.5,
        max_paths=args.max_svg_paths,
    )
    BASE.export_glb(args.output_glb, source_document, 22)
    editable_vertical = editable_vertical_report(islands)

    report = {
        "version": "20260829-semantic-uv-preserved-v2",
        "slug": args.slug,
        "actual_type": args.actual_type,
        "input_glb": str(args.input_glb.resolve()),
        "output_glb": str(args.output_glb.resolve()),
        "output_svg": str(args.output_svg.resolve()),
        "objects": [obj.name for obj in objects],
        "removed_objects": removed_objects,
        "removed_degenerate_faces": removed_degenerate_faces,
        "source_islands": source_islands,
        "layout_source_groups": {name: len(groups) for name, groups in source_groups.items()},
        "islands": len(islands),
        "editable_islands": sum(island.editable for island in islands),
        "svg_paths": svg_paths,
        "local_uv_repair": repair_report,
        "local_overlap_repair": {
            name: {"passes": value["passes"], "faces": len(value["faces"])}
            for name, value in local_overlap_repair.items()
        },
        "post_layout_overlap": overlap_report,
        "preserved_uv_shape_faces": shape_faces,
        "preserved_uv_shape_max_error": shape_error,
        "preserved_uv_shape_error_limit": PRESERVED_SHAPE_ERROR_LIMIT,
        "preserved_uv_shape_worst": shape_worst,
        "semantic_counts": {
            name: sum(island.semantic == name for island in islands)
            for name in ("front", "back", "side", "detail")
        },
        "layout_scale": layout_scale,
        "gaps": gaps,
        "uv_bounds": bounds,
        "similarity_only_for_preserved_panels": True,
        "whole_island_unwrap": args.whole_island_unwrap,
        "position_welded_smart_unwrap": args.position_welded_smart_unwrap,
        "position_welded_unwrap_report": position_welded_unwrap_report,
        "position_welded_grouping": args.position_welded_grouping,
        "position_welded_xatlas_unwrap": args.position_welded_xatlas_unwrap,
        "xatlas_unwrap_report": xatlas_unwrap_report,
        "uv_reference_glb": str(args.uv_reference_glb.resolve()) if args.uv_reference_glb else None,
        "uv_reference_report": uv_reference_report,
        "duplicate_geometry_report": duplicate_geometry_report,
        "paper_pattern_layout": args.paper_pattern_layout,
        "paper_pattern_rules": {
            "fixed_semantic_zones": args.paper_pattern_layout,
            "top_down_rows": args.paper_pattern_layout,
            "physical_area_priority": args.paper_pattern_layout,
            "shared_front_back_scale": args.paper_pattern_layout,
            "common_row_baselines": args.paper_pattern_layout,
        },
        "geometry_deformed": False,
        "zero_area_epsilon": FINAL_ZERO_AREA_EPSILON,
        "repaired_face_ratio": repaired_face_ratio,
        "severe_repair_layout": severe_repair_layout,
        "repair_zone": repair_zone,
        "regularized_zero_repair_faces": regularized_zero_faces,
        "layout_collapsed_authored_faces": layout_collapsed_authored_faces,
        "export_safe_repair_area_epsilon": EXPORT_SAFE_REPAIR_AREA_EPSILON,
        "editable_vertical_islands": editable_vertical,
        "island_layout": [
            {
                "index": island.index,
                "object": island.obj.name,
                "faces": len(island.faces),
                "physical_area": island.physical_area,
                "semantic": island.semantic,
                "editable": island.editable,
                "rotation_degrees": island.rotation_degrees,
                "mirrored_u": island.mirrored_u,
                "density_scale": island.density_scale,
            }
            for island in islands
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "slug": args.slug,
        "source_islands": source_islands,
        "final_islands": len(islands),
        "svg_paths": svg_paths,
        "preserved_uv_shape_max_error": shape_error,
        "uv_bounds": bounds,
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()

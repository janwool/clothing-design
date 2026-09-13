#!/usr/bin/env python3
"""Repack GLB UV islands into semantic zones and export a matching clean SVG.

The rebuild intentionally limits every island change to a similarity transform:
rotation, optional mirror correction, uniform scale, and translation. This keeps
the authored UV shape intact while normalizing texel density and eliminating
cross-island overlap. Small/non-editable construction islands stay in the GLB
but are omitted from the editable SVG contract.
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
import math
import struct
import sys
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
UP = Vector((0.0, 0.0, 1.0))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


UV_HELPER = load_module("semantic_uv_export_helper", ROOT / "scripts" / "repack-glb-uv-and-export-svg.py")
UV_AUDIT = load_module("semantic_uv_audit_helper", ROOT / "scripts" / "audit-garment-model.py")


@dataclass
class Island:
    index: int
    obj: bpy.types.Object
    faces: list[int]
    loops: list[int]
    physical_area: float
    center: Vector
    normal: Vector
    semantic: str = "detail"
    editable: bool = True
    rotation_degrees: float = 0.0
    mirrored_u: bool = False
    local_points: dict[int, tuple[float, float]] = field(default_factory=dict)
    min_x: float = 0.0
    min_y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    density_scale: float = 1.0
    placement: tuple[float, float] | None = None


ZONES = {
    "front": (0.025, 0.515, 0.465, 0.46),
    "back": (0.51, 0.515, 0.465, 0.46),
    "side": (0.025, 0.025, 0.625, 0.455),
    "detail": (0.675, 0.025, 0.30, 0.455),
}


def read_glb_document(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise RuntimeError(f"Unsupported GLB: {path}")
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            return json.loads(chunk.rstrip(b"\x00 \t\r\n"))
    raise RuntimeError(f"Missing GLB JSON: {path}")


def patch_material_extensions(path: Path, source_document: dict[str, object]) -> None:
    data = path.read_bytes()
    chunks: list[tuple[int, bytes]] = []
    document = None
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.rstrip(b"\x00 \t\r\n"))
        else:
            chunks.append((chunk_type, chunk))
    if document is None:
        return
    source_materials = source_document.get("materials", [])
    for index, material in enumerate(document.get("materials", [])):
        if index < len(source_materials) and source_materials[index].get("extensions"):
            material["extensions"] = source_materials[index]["extensions"]
    for key in ("extensionsUsed", "extensionsRequired"):
        if source_document.get(key):
            document[key] = source_document[key]
    json_chunk = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    output_chunks = [(0x4E4F534A, json_chunk), *chunks]
    total_length = 12 + sum(8 + len(chunk) for _kind, chunk in output_chunks)
    payload = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    for chunk_type, chunk in output_chunks:
        payload.extend(struct.pack("<II", len(chunk), chunk_type))
        payload.extend(chunk)
    path.write_bytes(payload)


def remove_degenerate_faces(objects: list[bpy.types.Object], min_area: float) -> int:
    removed = 0
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        doomed = [face for face in bm.faces if face.calc_area() <= min_area]
        removed += len(doomed)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            loose = [vertex for vertex in bm.verts if not vertex.link_faces]
            if loose:
                bmesh.ops.delete(bm, geom=loose, context="VERTS")
            bm.normal_update()
            bm.to_mesh(obj.data)
            obj.data.update()
        bm.free()
        # MeshPolygon.area is float32-backed and can expose collapsed triangles
        # that BMesh's double-precision area test still considers microscopic.
        # Remove those explicitly so no source UV coordinates bypass packing.
        collapsed = [poly.index for poly in obj.data.polygons if poly.area <= min_area]
        if collapsed:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.faces[index] for index in collapsed], context="FACES")
            loose = [vertex for vertex in bm.verts if not vertex.link_faces]
            if loose:
                bmesh.ops.delete(bm, geom=loose, context="VERTS")
            removed += len(collapsed)
            bm.normal_update()
            bm.to_mesh(obj.data)
            obj.data.update()
            bm.free()
    return removed


def degenerate_uv_triangles(obj: bpy.types.Object, epsilon: float = 1e-16) -> int:
    if not obj.data.uv_layers:
        return 0
    layer = obj.data.uv_layers.active
    count = 0
    for polygon in obj.data.polygons:
        loops = list(polygon.loop_indices)
        if len(loops) < 3:
            continue
        root = layer.data[loops[0]].uv
        for index in range(1, len(loops) - 1):
            first = layer.data[loops[index]].uv - root
            second = layer.data[loops[index + 1]].uv - root
            if abs(first.x * second.y - first.y * second.x) * 0.5 <= epsilon:
                count += 1
    return count


def degenerate_uv_face_indices(obj: bpy.types.Object, epsilon: float = 1e-16) -> set[int]:
    if not obj.data.uv_layers:
        return set()
    layer = obj.data.uv_layers.active
    faces: set[int] = set()
    for polygon in obj.data.polygons:
        loops = list(polygon.loop_indices)
        root = layer.data[loops[0]].uv
        for index in range(1, len(loops) - 1):
            first = layer.data[loops[index]].uv - root
            second = layer.data[loops[index + 1]].uv - root
            if abs(first.x * second.y - first.y * second.x) * 0.5 <= epsilon:
                faces.add(polygon.index)
                break
    return faces


def mark_existing_uv_seams(obj: bpy.types.Object) -> None:
    mesh = obj.data
    layer = mesh.uv_layers.active
    entries: dict[tuple[int, int], list[tuple[tuple[int, int], tuple[int, int]]]] = defaultdict(list)
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, loop in enumerate(loops):
            following = loops[(index + 1) % len(loops)]
            a = mesh.loops[loop].vertex_index
            b = mesh.loops[following].vertex_index
            entries[tuple(sorted((a, b)))].append((
                UV_HELPER.qpoint(tuple(layer.data[loop].uv)),
                UV_HELPER.qpoint(tuple(layer.data[following].uv)),
            ))
    for edge in mesh.edges:
        rows = entries.get(tuple(sorted(edge.vertices)), [])
        if len(rows) != 2:
            edge.use_seam = True
            continue
        (a0, a1), (b0, b1) = rows
        edge.use_seam = not ((a0 == b0 and a1 == b1) or (a0 == b1 and a1 == b0))


def repair_degenerate_uvs(
    objects: list[bpy.types.Object],
    protected_objects: set[str],
    force_smart_project_all: bool = False,
) -> dict[str, dict[str, int | str]]:
    results: dict[str, dict[str, int | str]] = {}
    for obj in objects:
        before = degenerate_uv_triangles(obj)
        name_key = obj.name.lower()
        protected = (
            obj.name in protected_objects
            or any(token in name_key for token in ("stitch", "matshape"))
        )
        method = "none"
        intermediate = before
        fallback_faces = 0
        fallback_islands = 0
        if force_smart_project_all and not protected:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            for polygon in obj.data.polygons:
                polygon.select = True
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(89.0), margin_method="SCALED",
                rotate_method="AXIS_ALIGNED_Y", island_margin=0.001,
                area_weight=0.0, correct_aspect=True, scale_to_bounds=False,
            )
            bpy.ops.object.mode_set(mode="OBJECT")
            method = "smart_project_all"
            intermediate = 0
            fallback_islands = 1
            fallback_faces = len(obj.data.polygons)
        elif before and not protected:
            mark_existing_uv_seams(obj)
            bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.001, fill_holes=True, correct_aspect=True)
            bpy.ops.object.mode_set(mode="OBJECT")
            method = "angle_based_existing_seams"
            bad_faces = degenerate_uv_face_indices(obj)
            intermediate = len(bad_faces)
            # Only reproject the UV islands that Angle Based could not solve.
            # Reprojecting the entire garment needlessly turns clean authored
            # panels into hundreds of jagged projection fragments.
            if bad_faces:
                affected: set[int] = set()
                for faces in UV_HELPER.collect_uv_island_faces(obj.data):
                    if bad_faces.intersection(faces):
                        affected.update(faces)
                        fallback_islands += 1
                fallback_faces = len(affected)
                bpy.ops.object.select_all(action="DESELECT")
                obj.select_set(True)
                bpy.context.view_layer.objects.active = obj
                for polygon in obj.data.polygons:
                    polygon.select = polygon.index in affected
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.uv.smart_project(
                    angle_limit=math.radians(89.0), margin_method="SCALED",
                    rotate_method="AXIS_ALIGNED_Y", island_margin=0.001,
                    area_weight=0.0, correct_aspect=True, scale_to_bounds=False,
                )
                bpy.ops.object.mode_set(mode="OBJECT")
                method = "smart_project_failed_islands"
        after = degenerate_uv_triangles(obj)
        results[obj.name] = {
            "before": before, "intermediate": intermediate, "after": after,
            "method": method, "fallback_islands": fallback_islands,
            "fallback_faces": fallback_faces,
        }
    return results


def remove_residual_uv_slivers(
    objects: list[bpy.types.Object],
    protected_objects: set[str],
    epsilon: float = 1e-16,
) -> dict[str, dict[str, float | int]]:
    results: dict[str, dict[str, float | int]] = {}
    for obj in objects:
        total_physical_area = sum(polygon.area for polygon in obj.data.polygons)
        name_key = obj.name.lower()
        protected = (
            obj.name in protected_objects
            or any(token in name_key for token in ("stitch", "matshape"))
        )
        bad_faces: set[int] = set()
        removed_area = 0.0
        if not protected and obj.data.uv_layers:
            layer = obj.data.uv_layers.active
            for polygon in obj.data.polygons:
                loops = list(polygon.loop_indices)
                root = layer.data[loops[0]].uv
                for index in range(1, len(loops) - 1):
                    first = layer.data[loops[index]].uv - root
                    second = layer.data[loops[index + 1]].uv - root
                    if abs(first.x * second.y - first.y * second.x) * 0.5 <= epsilon:
                        bad_faces.add(polygon.index)
                        removed_area += polygon.area
                        break
        if bad_faces:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(
                bm,
                geom=[bm.faces[index] for index in sorted(bad_faces)],
                context="FACES",
            )
            loose = [vertex for vertex in bm.verts if not vertex.link_faces]
            if loose:
                bmesh.ops.delete(bm, geom=loose, context="VERTS")
            bm.normal_update()
            bm.to_mesh(obj.data)
            obj.data.update()
            bm.free()
        results[obj.name] = {
            "faces": len(bad_faces),
            "physical_area": round(removed_area, 12),
            "physical_area_ratio": round(removed_area / total_physical_area, 12) if total_physical_area else 0.0,
        }
    return results


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], point[axis])
                maxs[axis] = max(maxs[axis], point[axis])
    return mins, maxs


def triangle_uv_area(mesh: bpy.types.Mesh, face_indices: list[int]) -> float:
    layer = mesh.uv_layers.active
    area = 0.0
    for face_index in face_indices:
        loops = list(mesh.polygons[face_index].loop_indices)
        if len(loops) < 3:
            continue
        root = layer.data[loops[0]].uv
        for index in range(1, len(loops) - 1):
            first = layer.data[loops[index]].uv - root
            second = layer.data[loops[index + 1]].uv - root
            area += abs(first.x * second.y - first.y * second.x) * 0.5
    return area


def collect_topology_uv_island_faces(mesh: bpy.types.Mesh) -> list[list[int]]:
    """Collect UV islands without welding coincident but independent shells."""
    layer = mesh.uv_layers.active
    if layer is None:
        return []
    edge_faces: dict[
        tuple[tuple[int, tuple[int, int]], tuple[int, tuple[int, int]]],
        list[tuple[int, tuple[int, int], tuple[int, int]]],
    ] = defaultdict(list)
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, loop in enumerate(loops):
            following = loops[(index + 1) % len(loops)]
            start_vertex = mesh.loops[loop].vertex_index
            end_vertex = mesh.loops[following].vertex_index
            start_uv = UV_HELPER.qpoint(tuple(layer.data[loop].uv))
            end_uv = UV_HELPER.qpoint(tuple(layer.data[following].uv))
            key = tuple(sorted(((start_vertex, start_uv), (end_vertex, end_uv))))
            edge_faces[key].append((polygon.index, start_uv, end_uv))
    neighbors: dict[int, set[int]] = defaultdict(set)
    for entries in edge_faces.values():
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        if (a0 == b0 and a1 == b1) or (a0 == b1 and a1 == b0):
            neighbors[face_a].add(face_b)
            neighbors[face_b].add(face_a)
    islands = []
    visited: set[int] = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        faces = []
        while queue:
            face = queue.popleft()
            faces.append(face)
            for neighbor in neighbors[face]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        islands.append(faces)
    return islands


def internal_overlap_faces(
    mesh: bpy.types.Mesh,
    max_tested_pairs: int = 20_000_000,
) -> tuple[set[int], int, bool]:
    islands = collect_topology_uv_island_faces(mesh)
    report = UV_AUDIT.uv_same_island_overlap_report(
        mesh,
        islands,
        max_tested_pairs=max_tested_pairs,
    )
    return (
        set(report["overlap_faces"]),
        int(report["overlap_pairs"]),
        bool(report["truncated"]),
    )


def planarize_faces(obj: bpy.types.Object, face_indices: set[int]) -> None:
    layer = obj.data.uv_layers.active
    for face_index in sorted(face_indices):
        polygon = obj.data.polygons[face_index]
        loops = list(polygon.loop_indices)
        points = [obj.data.vertices[obj.data.loops[loop].vertex_index].co.copy() for loop in loops]
        origin = points[0]
        x_axis = max((point - origin for point in points[1:]), key=lambda edge: edge.length_squared)
        if x_axis.length <= 1e-14:
            continue
        x_axis.normalize()
        normal = polygon.normal.normalized()
        y_axis = normal.cross(x_axis).normalized()
        offset_x = face_index * 0.013271
        offset_y = face_index * 0.007919
        for loop, point in zip(loops, points):
            delta = point - origin
            layer.data[loop].uv = (delta.dot(x_axis) + offset_x, delta.dot(y_axis) + offset_y)
    obj.data.update()


def repair_internal_uv_overlaps(
    objects: list[bpy.types.Object],
    protected_objects: set[str],
    passes: int = 10,
) -> dict[str, dict[str, int | bool]]:
    result: dict[str, dict[str, int | bool]] = {}
    for obj in objects:
        name_key = obj.name.lower()
        protected = obj.name in protected_objects or any(token in name_key for token in ("stitch", "matshape"))
        total_faces: set[int] = set()
        total_pairs = 0
        truncated = False
        if not protected:
            for _pass in range(passes):
                faces, pairs, was_truncated = internal_overlap_faces(obj.data)
                total_pairs += pairs
                truncated = truncated or was_truncated
                if not faces:
                    break
                total_faces.update(faces)
                planarize_faces(obj, faces)
        result[obj.name] = {
            "overlap_pairs_found": total_pairs,
            "faces_isolated": len(total_faces),
            "scan_truncated": truncated,
        }
    return result


def collect_islands(
    objects: list[bpy.types.Object],
    noneditable_names: set[str],
    min_svg_faces: int,
    min_svg_area_ratio: float,
    strict_topology: bool = False,
) -> list[Island]:
    total_area = sum(sum(poly.area for poly in obj.data.polygons) for obj in objects)
    islands: list[Island] = []
    for obj in objects:
        mesh = obj.data
        if not mesh.uv_layers:
            mesh.uv_layers.new(name="Semantic UV")
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        collector = collect_topology_uv_island_faces if strict_topology else UV_HELPER.collect_uv_island_faces
        for face_indices in collector(mesh):
            physical_area = sum(mesh.polygons[index].area for index in face_indices)
            if physical_area <= 0:
                continue
            loops = [loop for face in face_indices for loop in mesh.polygons[face].loop_indices]
            weighted_center = Vector((0.0, 0.0, 0.0))
            weighted_normal = Vector((0.0, 0.0, 0.0))
            for face_index in face_indices:
                polygon = mesh.polygons[face_index]
                area = polygon.area
                weighted_center += (obj.matrix_world @ polygon.center) * area
                weighted_normal += (normal_matrix @ polygon.normal).normalized() * area
            center = weighted_center / physical_area
            normal = weighted_normal.normalized() if weighted_normal.length > 1e-12 else Vector((0.0, 0.0, 0.0))
            name_key = obj.name.lower()
            noneditable = obj.name in noneditable_names or any(token in name_key for token in ("stitch", "matshape"))
            editable = (
                not noneditable
                and len(face_indices) >= min_svg_faces
                and physical_area >= total_area * min_svg_area_ratio
            )
            islands.append(Island(
                index=len(islands), obj=obj, faces=face_indices, loops=loops,
                physical_area=physical_area, center=center, normal=normal,
                editable=editable,
            ))
    return islands


def remove_noneditable_fragments(
    islands: list[Island],
    protected_objects: set[str],
) -> int:
    """Drop tiny detached debris from garment shells, never from detail layers."""
    total_area = sum(island.physical_area for island in islands)
    by_object: dict[bpy.types.Object, set[int]] = {}
    for island in islands:
        name_key = island.obj.name.lower()
        protected = (
            island.obj.name in protected_objects
            or any(token in name_key for token in ("stitch", "matshape", "button", "zip"))
        )
        removable_debris = len(island.faces) <= 2 or island.physical_area <= total_area * 1e-8
        if not island.editable and not protected and removable_debris:
            by_object.setdefault(island.obj, set()).update(island.faces)
    removed = 0
    for obj, face_indices in by_object.items():
        if not face_indices:
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(
            bm,
            geom=[bm.faces[index] for index in sorted(face_indices)],
            context="FACES",
        )
        loose = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        removed += len(face_indices)
        bm.normal_update()
        bm.to_mesh(obj.data)
        obj.data.update()
        bm.free()
    return removed


def classify_semantics(islands: list[Island], mins: Vector, maxs: Vector) -> None:
    center = (mins + maxs) * 0.5
    size = maxs - mins
    depth_threshold = max(size.y * 0.08, 1e-5)
    for island in islands:
        name = island.obj.name.lower()
        horizontal = Vector((island.normal.x, island.normal.y, 0.0))
        if not island.editable or any(token in name for token in ("stitch", "matshape", "button", "zip")):
            island.semantic = "detail"
        elif any(token in name for token in ("neck", "collar", "rib")):
            island.semantic = "detail"
        elif horizontal.length > 0.25 and island.normal.y <= -0.3:
            island.semantic = "front"
        elif horizontal.length > 0.25 and island.normal.y >= 0.3:
            island.semantic = "back"
        elif island.center.y < center.y - depth_threshold:
            island.semantic = "front"
        elif island.center.y > center.y + depth_threshold:
            island.semantic = "back"
        else:
            island.semantic = "side"


def orient_and_normalize(islands: list[Island]) -> None:
    for island in islands:
        mesh = island.obj.data
        uv_layer = mesh.uv_layers.active
        samples: list[tuple[Vector, Vector]] = []
        for loop in island.loops:
            vertex = mesh.vertices[mesh.loops[loop].vertex_index]
            samples.append((island.obj.matrix_world @ vertex.co, uv_layer.data[loop].uv.copy()))
        mean_point = sum((point for point, _uv in samples), Vector((0.0, 0.0, 0.0))) / len(samples)
        mean_u = sum(uv.x for _point, uv in samples) / len(samples)
        mean_v = sum(uv.y for _point, uv in samples) / len(samples)
        cov_u = sum((point.z - mean_point.z) * (uv.x - mean_u) for point, uv in samples)
        cov_v = sum((point.z - mean_point.z) * (uv.y - mean_v) for point, uv in samples)
        vertical_spread = max(point.z for point, _uv in samples) - min(point.z for point, _uv in samples)
        angle = 0.0
        if math.hypot(cov_u, cov_v) > 1e-12 and vertical_spread > 1e-5:
            angle = math.pi * 0.5 - math.atan2(cov_v, cov_u)
        cosine, sine = math.cos(angle), math.sin(angle)
        rotated: dict[int, tuple[float, float]] = {}
        for loop, (_point, uv) in zip(island.loops, samples):
            x, y = uv.x - mean_u, uv.y - mean_v
            rotated[loop] = (x * cosine - y * sine, x * sine + y * cosine)

        horizontal = Vector((island.normal.x, island.normal.y, 0.0))
        mirrored = False
        if horizontal.length > 0.2:
            desired_right = (-horizontal.normalized()).cross(UP)
            mean_right = sum((point - mean_point).dot(desired_right) for point, _uv in samples) / len(samples)
            mean_rotated_u = sum(rotated[loop][0] for loop in island.loops) / len(island.loops)
            covariance = sum(
                (((point - mean_point).dot(desired_right) - mean_right) * (rotated[loop][0] - mean_rotated_u))
                for loop, (point, _uv) in zip(island.loops, samples)
            )
            mirrored = covariance < 0
        if mirrored:
            rotated = {loop: (-point[0], point[1]) for loop, point in rotated.items()}

        uv_area = max(triangle_uv_area(mesh, island.faces), 1e-16)
        density_scale = math.sqrt(island.physical_area / uv_area)
        scaled = {loop: (point[0] * density_scale, point[1] * density_scale) for loop, point in rotated.items()}
        xs = [point[0] for point in scaled.values()]
        ys = [point[1] for point in scaled.values()]
        island.local_points = scaled
        island.min_x, island.min_y = min(xs), min(ys)
        island.width = max(max(xs) - island.min_x, 1e-9)
        island.height = max(max(ys) - island.min_y, 1e-9)
        island.rotation_degrees = math.degrees(angle)
        island.mirrored_u = mirrored
        island.density_scale = density_scale


def prune_free_rectangles(rectangles: list[tuple[float, float, float, float]]) -> list[tuple[float, float, float, float]]:
    output = []
    for index, rect in enumerate(rectangles):
        x, y, w, h = rect
        if w <= 1e-9 or h <= 1e-9:
            continue
        contained = False
        for other_index, other in enumerate(rectangles):
            if index == other_index:
                continue
            ox, oy, ow, oh = other
            if x >= ox - 1e-12 and y >= oy - 1e-12 and x + w <= ox + ow + 1e-12 and y + h <= oy + oh + 1e-12:
                contained = True
                break
        if not contained:
            output.append(rect)
    return output


def pack_rectangles(
    islands: list[Island],
    zone: tuple[float, float, float, float],
    scale: float,
    gap: float,
    commit: bool,
) -> bool:
    zx, zy, zw, zh = zone
    placements: dict[int, tuple[float, float]] = {}
    # A deterministic shelf layout stays linear even for stitch/detail meshes
    # containing thousands of tiny islands.  The former MaxRects splitter was
    # unnecessarily expensive because every binary-search probe could grow a
    # very large free-rectangle list.
    ordered = sorted(islands, key=lambda item: (item.height, item.width, item.width * item.height), reverse=True)
    cursor_x = zx
    cursor_y = zy
    row_height = 0.0
    for island in ordered:
        width = island.width * scale + gap
        height = island.height * scale + gap
        if width > zw + 1e-12 or height > zh + 1e-12:
            return False
        if cursor_x + width > zx + zw + 1e-12:
            cursor_x = zx
            cursor_y += row_height
            row_height = 0.0
        if cursor_y + height > zy + zh + 1e-12:
            return False
        placements[island.index] = (cursor_x + gap * 0.5, cursor_y + gap * 0.5)
        cursor_x += width
        row_height = max(row_height, height)
    if commit:
        for island in islands:
            island.placement = placements[island.index]
    return True


def semantic_group(island: Island) -> str:
    if island.semantic in ("front", "back"):
        return island.semantic
    if island.semantic == "side" and island.editable:
        return "side"
    return "detail"


def place_islands(islands: list[Island]) -> tuple[dict[str, float], dict[str, float]]:
    groups = {name: [island for island in islands if semantic_group(island) == name] for name in ZONES}
    gaps = {
        name: max(0.00025, min(0.006, 0.12 * min(ZONES[name][2], ZONES[name][3]) / math.sqrt(max(1, len(group)))))
        for name, group in groups.items()
    }

    scales: dict[str, float] = {}
    for name, group in groups.items():
        if not group:
            scales[name] = 0.0
            continue

        def fits(scale: float, commit: bool = False) -> bool:
            return pack_rectangles(group, ZONES[name], scale, gaps[name], commit)

        low, high = 0.0, 1.0
        while fits(high) and high < 1e6:
            low, high = high, high * 2.0
        for _iteration in range(54):
            middle = (low + high) * 0.5
            if fits(middle):
                low = middle
            else:
                high = middle
        if low <= 0 or not fits(low, commit=True):
            raise RuntimeError(f"Unable to pack {name} semantic UV islands")
        scales[name] = low

    for island in islands:
        if island.placement is None:
            raise RuntimeError(f"Island {island.index} has no placement")
        base_x, base_y = island.placement
        scale = scales[semantic_group(island)]
        layer = island.obj.data.uv_layers.active
        for loop, point in island.local_points.items():
            layer.data[loop].uv.x = base_x + (point[0] - island.min_x) * scale
            layer.data[loop].uv.y = base_y + (point[1] - island.min_y) * scale
        island.obj.data.update()
    return scales, gaps


def export_semantic_svg(
    path: Path,
    islands: list[Island],
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
        face_set = set(island.faces)
        segments = UV_HELPER.collect_boundary_segments(mesh, face_set)
        paths = UV_HELPER.chain_segments(segments)
        closed = [
            points for points in paths
            if len(points) >= 4 and points[0] == points[-1]
            and UV_HELPER.polygon_area_svg_pixels(points, size) >= min_area
            and UV_HELPER.path_span_svg_pixels(points, size) >= min_span
            and UV_HELPER.path_effective_thickness_svg_pixels(points, size) >= min_span
        ]
        if closed:
            points = max(closed, key=UV_HELPER.polygon_area)
        else:
            uv_layer = mesh.uv_layers.active
            cloud = [UV_HELPER.qpoint(tuple(uv_layer.data[loop].uv)) for loop in island.loops]
            points = UV_HELPER.convex_hull(cloud)
        if len(points) < 4:
            continue
        d = UV_HELPER.path_to_d(points, size)
        if not d:
            continue
        rows.append((island, d, UV_HELPER.polygon_area(points)))
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


def export_glb(path: Path, source_document: dict[str, object], position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()), export_format="GLB", export_texcoords=True,
        export_normals=True, export_materials="EXPORT", export_animations=True,
        export_frame_range=True, export_force_sampling=True, export_morph=True,
        export_morph_normal=False, export_morph_tangent=False, export_yup=True,
        # Preserve authored UV coordinates exactly.  Draco's independent
        # texcoord quantization can reintroduce overlaps in very small shells
        # even when the pre-export layout is clean.
        export_draco_mesh_compression_enable=False,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        # Tiny construction/detail islands need more than Draco's common
        # 12–14 bit UV precision; otherwise valid triangles can quantize to a
        # single UV point and appear as overlap/distortion false positives.
        export_draco_texcoord_quantization=30,
    )
    patch_material_extensions(path, source_document)


def uv_bounds(objects: list[bpy.types.Object]) -> dict[str, float | int]:
    values = [tuple(loop.uv) for obj in objects for layer in obj.data.uv_layers for loop in layer.data]
    return {
        "min_u": min(value[0] for value in values), "max_u": max(value[0] for value in values),
        "min_v": min(value[1] for value in values), "max_v": max(value[1] for value in values),
        "out_of_bounds": sum(value[0] < -1e-7 or value[0] > 1.0000001 or value[1] < -1e-7 or value[1] > 1.0000001 for value in values),
    }


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
    parser.add_argument("--report", type=Path)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--min-svg-faces", type=int, default=3)
    parser.add_argument("--min-svg-area", type=float, default=12.0)
    parser.add_argument("--min-svg-span", type=float, default=1.5)
    parser.add_argument("--min-svg-area-ratio", type=float, default=1e-7)
    parser.add_argument("--max-svg-paths", type=int, default=96)
    parser.add_argument("--min-face-area", type=float, default=1e-12)
    parser.add_argument("--position-quantization", type=int, default=22)
    parser.add_argument("--uv-sliver-epsilon", type=float, default=1e-16)
    parser.add_argument("--force-smart-project-all", action="store_true")
    args = parser.parse_args(argv)

    excluded = {value.strip() for value in args.exclude_objects.split(",") if value.strip()}
    noneditable = {value.strip() for value in args.noneditable_objects.split(",") if value.strip()}
    source_document = read_glb_document(args.input_glb)
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
    removed_faces = remove_degenerate_faces(objects, args.min_face_area)
    uv_repair = repair_degenerate_uvs(objects, noneditable, args.force_smart_project_all)
    overlap_repair = repair_internal_uv_overlaps(objects, noneditable)
    removed_uv_slivers = remove_residual_uv_slivers(objects, noneditable, args.uv_sliver_epsilon)
    mins, maxs = world_bounds(objects)
    islands = collect_islands(
        objects, noneditable, args.min_svg_faces, args.min_svg_area_ratio,
        strict_topology=args.force_smart_project_all,
    )
    removed_fragments = remove_noneditable_fragments(islands, noneditable)
    if removed_fragments:
        islands = collect_islands(
            objects, noneditable, args.min_svg_faces, args.min_svg_area_ratio,
            strict_topology=args.force_smart_project_all,
        )
    classify_semantics(islands, mins, maxs)
    orient_and_normalize(islands)
    layout_scale, gaps = place_islands(islands)
    post_layout_repair = {
        obj.name: {"overlap_pairs_found": 0, "faces_isolated": set(), "passes": 0}
        for obj in objects
    }
    for repair_pass in range(10):
        faces_by_object = {}
        for obj in objects:
            report = UV_AUDIT.uv_same_island_overlap_report(
                obj.data,
                collect_topology_uv_island_faces(obj.data),
            )
            if report["truncated"]:
                raise RuntimeError(f"Post-layout overlap scan truncated for {obj.name}")
            post_layout_repair[obj.name]["overlap_pairs_found"] += int(report["overlap_pairs"])
            post_layout_repair[obj.name]["passes"] = repair_pass + 1
            name_key = obj.name.lower()
            protected = obj.name in noneditable or any(token in name_key for token in ("stitch", "matshape"))
            faces = set(report["overlap_faces"]) if not protected else set()
            if faces:
                faces_by_object[obj] = faces
                post_layout_repair[obj.name]["faces_isolated"].update(faces)
        if not faces_by_object:
            break
        for obj, faces in faces_by_object.items():
            planarize_faces(obj, faces)
        islands = collect_islands(
            objects, noneditable, args.min_svg_faces, args.min_svg_area_ratio,
            strict_topology=args.force_smart_project_all,
        )
        classify_semantics(islands, mins, maxs)
        orient_and_normalize(islands)
        layout_scale, gaps = place_islands(islands)

    post_layout_overlap = {}
    for obj in objects:
        strict_report = UV_AUDIT.uv_same_island_overlap_report(
            obj.data,
            collect_topology_uv_island_faces(obj.data),
        )
        welded_report = UV_AUDIT.uv_same_island_overlap_report(
            obj.data,
            UV_HELPER.collect_uv_island_faces(obj.data),
        )
        post_layout_overlap[obj.name] = {
            "strict_overlap_pairs": strict_report["overlap_pairs"],
            "strict_scan_truncated": strict_report["truncated"],
            "welded_overlap_pairs": welded_report["overlap_pairs"],
            "welded_scan_truncated": welded_report["truncated"],
            "welded_samples": welded_report["samples"],
        }
        if strict_report["truncated"] or strict_report["overlap_pairs"]:
            raise RuntimeError(f"Unresolved post-layout UV overlap for {obj.name}")
    for value in post_layout_repair.values():
        value["faces_isolated"] = len(value["faces_isolated"])
    bounds_before_export = uv_bounds(objects)
    svg_paths = export_semantic_svg(
        args.output_svg, islands, args.size, args.min_svg_area,
        args.min_svg_span, args.max_svg_paths,
    )
    export_glb(args.output_glb, source_document, args.position_quantization)

    report = {
        "slug": args.slug, "actual_type": args.actual_type,
        "input_glb": str(args.input_glb.resolve()),
        "output_glb": str(args.output_glb.resolve()), "output_svg": str(args.output_svg.resolve()),
        "objects": [obj.name for obj in objects], "removed_objects": removed_objects,
        "removed_degenerate_faces": removed_faces, "islands": len(islands),
        "removed_fragment_faces": removed_fragments,
        "degenerate_uv_triangles": uv_repair,
        "internal_overlap_repair": overlap_repair,
        "post_layout_overlap_repair": post_layout_repair,
        "post_layout_overlap": post_layout_overlap,
        "removed_uv_slivers": removed_uv_slivers,
        "editable_islands": sum(island.editable for island in islands), "svg_paths": svg_paths,
        "semantic_counts": {name: sum(island.semantic == name for island in islands) for name in ("front", "back", "side", "detail")},
        "layout_scale": layout_scale, "gaps": gaps, "uv_bounds": bounds_before_export,
        "similarity_only": True, "geometry_deformed": False,
        "island_layout": [
            {
                "index": island.index, "object": island.obj.name, "faces": len(island.faces),
                "physical_area": round(island.physical_area, 9), "semantic": island.semantic,
                "editable": island.editable, "rotation_degrees": round(island.rotation_degrees, 5),
                "mirrored_u": island.mirrored_u, "density_scale": island.density_scale,
            }
            for island in islands
        ],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("slug", "objects", "removed_objects", "removed_degenerate_faces", "removed_fragment_faces", "islands", "editable_islands", "svg_paths", "semantic_counts", "uv_bounds", "similarity_only")}, indent=2), flush=True)


if __name__ == "__main__":
    main()

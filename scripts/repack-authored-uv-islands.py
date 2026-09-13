#!/usr/bin/env python3
"""Repair authored UV charts, use Blender Pack Islands, then extract SVG from disk GLB.

This deliberately does not perform semantic panel placement or path-count filtering.
The exported SVG is a direct outline view of the UV islands stored in the final GLB.
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


BASE = load_module("authored_uv_base", ROOT / "scripts" / "rebuild-semantic-uv-svg.py")
UV = BASE.UV_HELPER
AUDIT = BASE.UV_AUDIT


def clear_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def strict_uv_islands(mesh: bpy.types.Mesh) -> list[list[int]]:
    """Match Blender UV connectivity without welding coincident mesh shells."""
    layer = mesh.uv_layers.active
    if layer is None:
        return []
    edge_faces: dict[tuple[int, int], list[tuple[int, tuple[int, int], tuple[int, int]]]] = defaultdict(list)
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, loop in enumerate(loops):
            following = loops[(index + 1) % len(loops)]
            edge = tuple(sorted((mesh.loops[loop].vertex_index, mesh.loops[following].vertex_index)))
            edge_faces[edge].append((
                polygon.index,
                UV.qpoint(tuple(layer.data[loop].uv)),
                UV.qpoint(tuple(layer.data[following].uv)),
            ))
    neighbors: dict[int, set[int]] = defaultdict(set)
    for entries in edge_faces.values():
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        if (a0 == b0 and a1 == b1) or (a0 == b1 and a1 == b0):
            neighbors[face_a].add(face_b)
            neighbors[face_b].add(face_a)
    result: list[list[int]] = []
    visited: set[int] = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        faces: list[int] = []
        while queue:
            face = queue.popleft()
            faces.append(face)
            for neighbor in neighbors[face]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        result.append(faces)
    return result


def repair_collapsed_uvs(obj: bpy.types.Object) -> dict[str, object]:
    """Repair collapsed faces while pinning every valid authored UV loop."""
    before = BASE.degenerate_uv_triangles(obj)
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
        before = len(obj.data.polygons)
    if not before:
        return {"before": 0, "after": 0, "method": "preserved"}

    BASE.mark_existing_uv_seams(obj)
    source_island_count = len(strict_uv_islands(obj.data))
    bad_faces = BASE.degenerate_uv_face_indices(obj)
    layer = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        pin = polygon.index not in bad_faces
        for loop in polygon.loop_indices:
            layer.data[loop].pin_uv = pin
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for polygon in obj.data.polygons:
        polygon.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(
        method="ANGLE_BASED",
        margin=0.001,
        fill_holes=True,
        correct_aspect=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    intermediate = BASE.degenerate_uv_triangles(obj)
    for item in layer.data:
        item.pin_uv = False
    after = BASE.degenerate_uv_triangles(obj)
    return {
        "before": before,
        "intermediate": intermediate,
        "after": after,
        "source_islands": source_island_count,
        "islands_after": len(strict_uv_islands(obj.data)),
        "method": "angle_based_pinned_valid_authored_uvs",
    }


def orient_islands_world_z(obj: bpy.types.Object) -> dict[str, int | float]:
    """Rotate each UV island so increasing world Z maps to increasing V."""
    mesh = obj.data
    layer = mesh.uv_layers.active
    rows = strict_uv_islands(mesh)
    rotated = 0
    skipped = 0
    negative_after = 0
    for faces in rows:
        loops = [loop for face in faces for loop in mesh.polygons[face].loop_indices]
        if sum(
            UV.polygon_area([UV.qpoint(tuple(layer.data[loop].uv)) for loop in mesh.polygons[face].loop_indices])
            for face in faces
        ) <= 1.0:
            skipped += 1
            continue
        samples = [
            (obj.matrix_world @ mesh.vertices[mesh.loops[loop].vertex_index].co, layer.data[loop].uv.copy())
            for loop in loops
        ]
        if not samples:
            continue
        z_values = [point.z for point, _uv in samples]
        if max(z_values) - min(z_values) <= 1e-6:
            skipped += 1
            continue
        mean_z = sum(z_values) / len(z_values)
        mean_u = sum(uv.x for _point, uv in samples) / len(samples)
        mean_v = sum(uv.y for _point, uv in samples) / len(samples)
        cov_u = sum((point.z - mean_z) * (uv.x - mean_u) for point, uv in samples)
        cov_v = sum((point.z - mean_z) * (uv.y - mean_v) for point, uv in samples)
        if math.hypot(cov_u, cov_v) <= 1e-12:
            skipped += 1
            continue
        angle = math.pi * 0.5 - math.atan2(cov_v, cov_u)
        cosine, sine = math.cos(angle), math.sin(angle)
        for loop in loops:
            uv = layer.data[loop].uv
            x, y = uv.x - mean_u, uv.y - mean_v
            uv.x = mean_u + x * cosine - y * sine
            uv.y = mean_v + x * sine + y * cosine
        rotated += 1
        final_cov = sum((point.z - mean_z) * (layer.data[loop].uv.y - mean_v) for loop, (point, _uv) in zip(loops, samples))
        negative_after += final_cov < -1e-10
    mesh.update()
    return {"islands": len(rows), "rotated": rotated, "skipped": skipped, "negative_after": negative_after}


def polygon_has_uv_area(mesh: bpy.types.Mesh, polygon: bpy.types.MeshPolygon) -> bool:
    layer = mesh.uv_layers.active
    points = [UV.qpoint(tuple(layer.data[loop].uv)) for loop in polygon.loop_indices]
    return UV.polygon_area(points) > 1.0


def pack_all_objects(objects: list[bpy.types.Object], margin: float, visible_only: bool = False) -> None:
    """One multi-object Pack Islands call prevents inter-object UV overlap."""
    bpy.ops.object.select_all(action="DESELECT")
    usable = [obj for obj in objects if obj.data.uv_layers.active and obj.data.polygons]
    if not usable:
        return
    for obj in usable:
        obj.select_set(True)
        for polygon in obj.data.polygons:
            polygon.select = not visible_only or polygon_has_uv_area(obj.data, polygon)
    bpy.context.view_layer.objects.active = usable[0]
    bpy.ops.object.mode_set(mode="EDIT")
    if not visible_only:
        bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=False, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def outer_path(mesh: bpy.types.Mesh, faces: list[int]) -> list[tuple[int, int]]:
    layer = mesh.uv_layers.active
    edge_counts: dict[tuple[tuple[int, int], tuple[int, int]], int] = defaultdict(int)
    oriented: dict[tuple[tuple[int, int], tuple[int, int]], tuple[tuple[int, int], tuple[int, int]]] = {}
    seen_polygons: set[tuple[tuple[int, int], ...]] = set()
    # Scan only this island. UV.collect_boundary_segments intentionally scans
    # the whole mesh, which becomes quadratic when a model has many islands.
    for face in faces:
        loops = list(mesh.polygons[face].loop_indices)
        polygon = tuple(UV.qpoint(tuple(layer.data[loop].uv)) for loop in loops)
        if UV.polygon_area(list(polygon)) < 1.0:
            continue
        polygon_key = tuple(sorted(polygon))
        if polygon_key in seen_polygons:
            continue
        seen_polygons.add(polygon_key)
        for index, loop in enumerate(loops):
            following = loops[(index + 1) % len(loops)]
            a = UV.qpoint(tuple(layer.data[loop].uv))
            b = UV.qpoint(tuple(layer.data[following].uv))
            if a == b:
                continue
            key = tuple(sorted((a, b)))
            edge_counts[key] += 1
            oriented.setdefault(key, (a, b))
    segments = [oriented[key] for key, count in edge_counts.items() if count == 1]
    closed = [
        path for path in UV.chain_segments(segments)
        if len(path) >= 4 and path[0] == path[-1] and UV.polygon_area(path) > 0
    ]
    if closed:
        return max(closed, key=UV.polygon_area)
    points = [
        UV.qpoint(tuple(layer.data[loop].uv))
        for face in faces
        for loop in mesh.polygons[face].loop_indices
    ]
    return UV.convex_hull(points)


def export_direct_svg(
    path: Path,
    objects: list[bpy.types.Object],
    size: int,
    min_area: float,
    min_span: float,
    islands_by_object: dict[str, list[list[int]]] | None = None,
) -> dict[str, object]:
    rows: list[tuple[float, str, str, int, int]] = []
    object_counts: dict[str, int] = {}
    for obj in objects:
        if not obj.data.uv_layers.active:
            continue
        count = 0
        islands = islands_by_object[obj.name] if islands_by_object is not None else strict_uv_islands(obj.data)
        for island_index, faces in enumerate(islands):
            # Do not build/sort a multi-million-point hull for a completely
            # collapsed construction island; it has no visible SVG contour.
            if not any(polygon_has_uv_area(obj.data, obj.data.polygons[face]) for face in faces):
                continue
            points = outer_path(obj.data, faces)
            if (
                len(points) < 4
                or points[0] != points[-1]
                or UV.polygon_area_svg_pixels(points, size) < min_area
                or UV.path_span_svg_pixels(points, size) < min_span
            ):
                continue
            d = UV.path_to_d(points, size)
            if not d:
                continue
            rows.append((UV.polygon_area(points), d, obj.name, island_index, len(faces)))
            count += 1
        object_counts[obj.name] = count
    rows.sort(key=lambda row: row[0], reverse=True)
    body = [
        f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">',
        '  <g fill="none" stroke="#111" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for _area, d, object_name, island_index, face_count in rows:
        body.append(
            f'    <path d="{html.escape(d, quote=True)}" data-panel="detail" '
            f'data-object="{html.escape(object_name, quote=True)}" data-island="{island_index}" data-faces="{face_count}"/>'
        )
    body.extend(("  </g>", "</svg>", ""))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(body), encoding="utf-8")
    return {"paths": len(rows), "objects": object_counts}


def uv_report(
    objects: list[bpy.types.Object],
    include_overlap: bool = True,
    islands_by_object: dict[str, list[list[int]]] | None = None,
) -> dict[str, object]:
    result = {}
    for obj in objects:
        if not obj.data.uv_layers.active:
            continue
        layer = obj.data.uv_layers.active
        values = [tuple(loop.uv) for loop in layer.data]
        islands = islands_by_object[obj.name] if islands_by_object is not None else strict_uv_islands(obj.data)
        same = AUDIT.uv_same_island_overlap_report(obj.data, islands, max_tested_pairs=20_000_000) if include_overlap else {"overlap_pairs": None, "truncated": False}
        cross = AUDIT.uv_cross_island_overlap_report(obj.data, islands, max_tested_pairs=20_000_000) if include_overlap else {"overlap_pairs": None, "truncated": False}
        result[obj.name] = {
            "faces": len(obj.data.polygons),
            "islands": len(islands),
            "zero_area_triangles": BASE.degenerate_uv_triangles(obj),
            "out_of_bounds_loops": sum(u < -1e-7 or u > 1.0000001 or v < -1e-7 or v > 1.0000001 for u, v in values),
            "bounds": [min(u for u, _v in values), max(u for u, _v in values), min(v for _u, v in values), max(v for _u, v in values)],
            "same_island_overlap_pairs": same["overlap_pairs"],
            "cross_island_overlap_pairs": cross["overlap_pairs"],
            "overlap_scan_truncated": same["truncated"] or cross["truncated"],
        }
    return result


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input_glb", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--margin", type=float, default=0.008)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--min-svg-area", type=float, default=0.25)
    parser.add_argument("--min-svg-span", type=float, default=0.20)
    parser.add_argument("--remove-geometry-below", type=float, default=0.0)
    parser.add_argument("--skip-overlap-audit", action="store_true")
    parser.add_argument("--preserve-collapsed", action="store_true", help="Pack authored islands without unwrapping collapsed construction faces.")
    parser.add_argument("--pack-visible-only", action="store_true", help="Exclude collapsed construction faces from the Pack Islands selection.")
    parser.add_argument("--extract-only", action="store_true", help="Read input_glb as the final packed GLB and only extract SVG/report.")
    args = parser.parse_args(argv)

    if args.extract_only:
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=str(args.input_glb.resolve()))
        final_objects = mesh_objects()
        final_islands = {obj.name: strict_uv_islands(obj.data) for obj in final_objects if obj.data.uv_layers.active}
        final_uv = uv_report(final_objects, include_overlap=not args.skip_overlap_audit, islands_by_object=final_islands)
        svg = export_direct_svg(args.output_svg, final_objects, args.size, args.min_svg_area, args.min_svg_span, final_islands)
        payload = {
            "version": "authored-uv-blender-pack-islands-v1-extraction",
            "input_glb": str(args.input_glb.resolve()),
            "output_svg": str(args.output_svg.resolve()),
            "final_uv": final_uv,
            "svg": svg,
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(payload, indent=2), flush=True)
        return

    source_document = BASE.read_glb_document(args.input_glb)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input_glb.resolve()))
    objects = mesh_objects()
    removed_geometry_faces = 0
    if args.remove_geometry_below > 0:
        removed_geometry_faces = BASE.remove_degenerate_faces(objects, args.remove_geometry_below)
    source_islands = {obj.name: len(strict_uv_islands(obj.data)) for obj in objects if obj.data.uv_layers.active}
    repair = (
        {obj.name: {"before": BASE.degenerate_uv_triangles(obj), "after": BASE.degenerate_uv_triangles(obj), "method": "preserved_for_island_pack"} for obj in objects}
        if args.preserve_collapsed
        else {obj.name: repair_collapsed_uvs(obj) for obj in objects}
    )
    unresolved = {name: row["after"] for name, row in repair.items() if row["after"]}
    if unresolved and not args.preserve_collapsed:
        raise RuntimeError(f"Collapsed UV triangles remain after authored-seam unwrap: {unresolved}")
    orientation = {obj.name: orient_islands_world_z(obj) for obj in objects if obj.data.uv_layers.active}
    pack_all_objects(objects, args.margin, visible_only=args.pack_visible_only)
    pre_islands = {obj.name: strict_uv_islands(obj.data) for obj in objects if obj.data.uv_layers.active}
    pre_export = uv_report(objects, include_overlap=not args.skip_overlap_audit, islands_by_object=pre_islands)
    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    BASE.export_glb(args.output_glb, source_document, 22)

    # The SVG must describe the final disk asset, not Blender's pre-export mesh.
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.output_glb.resolve()))
    final_objects = mesh_objects()
    final_islands = {obj.name: strict_uv_islands(obj.data) for obj in final_objects if obj.data.uv_layers.active}
    final_uv = uv_report(final_objects, include_overlap=not args.skip_overlap_audit, islands_by_object=final_islands)
    svg = export_direct_svg(args.output_svg, final_objects, args.size, args.min_svg_area, args.min_svg_span, final_islands)
    failures = []
    for name, row in final_uv.items():
        if row["zero_area_triangles"] and not args.preserve_collapsed:
            failures.append(f"{name}:zero_area_uv")
        if row["out_of_bounds_loops"]:
            failures.append(f"{name}:uv_out_of_bounds")
        if row["same_island_overlap_pairs"] or row["cross_island_overlap_pairs"] or row["overlap_scan_truncated"]:
            failures.append(f"{name}:uv_overlap")
    payload = {
        "version": "authored-uv-blender-pack-islands-v1",
        "input_glb": str(args.input_glb.resolve()),
        "output_glb": str(args.output_glb.resolve()),
        "output_svg": str(args.output_svg.resolve()),
        "pack_operator": "bpy.ops.uv.pack_islands",
        "pack_all_objects_together": True,
        "pack_rotate": False,
        "pack_visible_only": args.pack_visible_only,
        "margin": args.margin,
        "removed_geometry_faces": removed_geometry_faces,
        "source_islands": source_islands,
        "repair": repair,
        "orientation": orientation,
        "pre_export_uv": pre_export,
        "final_uv": final_uv,
        "svg": svg,
        "failures": failures,
        "pass": not failures,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

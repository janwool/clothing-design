#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils.bvhtree import BVHTree


EPS = 1e-8


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def same_uv(a, b, tolerance: float = 1e-6) -> bool:
    return (a - b).length_squared <= tolerance * tolerance


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        for index, start in enumerate(verts):
            edge_faces[tuple(sorted((start, verts[(index + 1) % len(verts)])))].append(poly.index)

    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    components = []
    visited = set()
    for poly in mesh.polygons:
        if poly.index in visited:
            continue
        queue = deque([poly.index])
        visited.add(poly.index)
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def position_welded_topology(
    mesh: bpy.types.Mesh,
    tolerance: float = 1e-5,
) -> dict[str, object]:
    """Audit geometric topology while ignoring attribute-only GLB vertex splits.

    glTF must split a vertex at UV/material seams even when the two copies occupy
    the exact same position.  Index-based boundary counts therefore report false
    holes after a correct unwrap.  This parallel report reconnects only vertices
    whose positions agree within a tight tolerance; real gaps stay visible.
    """
    scale = 1.0 / tolerance
    position_keys = [
        tuple(round(value * scale) for value in vertex.co)
        for vertex in mesh.vertices
    ]
    edge_faces: dict[tuple[tuple[int, int, int], tuple[int, int, int]], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        vertices = list(poly.vertices)
        for index, start in enumerate(vertices):
            a = position_keys[start]
            b = position_keys[vertices[(index + 1) % len(vertices)]]
            if a == b:
                continue
            edge_faces[tuple(sorted((a, b)))].append(poly.index)

    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    visited: set[int] = set()
    components = 0
    for poly in mesh.polygons:
        if poly.index in visited:
            continue
        components += 1
        queue = deque([poly.index])
        visited.add(poly.index)
        while queue:
            face = queue.popleft()
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)

    return {
        "tolerance": tolerance,
        "unique_positions": len(set(position_keys)),
        "attribute_split_vertices": len(position_keys) - len(set(position_keys)),
        "boundary_edges": sum(1 for faces in edge_faces.values() if len(faces) == 1),
        "non_manifold_edges": sum(1 for faces in edge_faces.values() if len(faces) != 2),
        "connected_components": components,
    }


def uv_islands(mesh: bpy.types.Mesh) -> list[list[int]]:
    if not mesh.uv_layers:
        return []
    uv_layer = mesh.uv_layers.active.data
    edge_face_loops: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        for index, loop_index in enumerate(loops):
            next_loop = loops[(index + 1) % len(loops)]
            start = mesh.loops[loop_index].vertex_index
            end = mesh.loops[next_loop].vertex_index
            edge_face_loops[tuple(sorted((start, end)))].append((poly.index, loop_index, next_loop))

    neighbors: dict[int, set[int]] = defaultdict(set)
    for entries in edge_face_loops.values():
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        a_start = mesh.loops[a0].vertex_index
        b_start = mesh.loops[b0].vertex_index
        if a_start == b_start:
            matches = same_uv(uv_layer[a0].uv, uv_layer[b0].uv) and same_uv(uv_layer[a1].uv, uv_layer[b1].uv)
        else:
            matches = same_uv(uv_layer[a0].uv, uv_layer[b1].uv) and same_uv(uv_layer[a1].uv, uv_layer[b0].uv)
        if matches:
            neighbors[face_a].add(face_b)
            neighbors[face_b].add(face_a)

    islands = []
    visited = set()
    for poly in mesh.polygons:
        if poly.index in visited:
            continue
        queue = deque([poly.index])
        visited.add(poly.index)
        island = []
        while queue:
            face = queue.popleft()
            island.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        islands.append(island)
    return islands


def triangle_area(a, b, c) -> float:
    return abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5


def triangulated_uvs(mesh: bpy.types.Mesh):
    uv_layer = mesh.uv_layers.active.data
    rows = []
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        for index in range(1, len(loops) - 1):
            loop_ids = (loops[0], loops[index], loops[index + 1])
            points = tuple(uv_layer[loop_id].uv.copy() for loop_id in loop_ids)
            rows.append((poly.index, points))
    return rows


def signed_polygon_area(points) -> float:
    return sum(a.x * b.y - b.x * a.y for a, b in zip(points, points[1:] + points[:1])) * 0.5


def line_intersection(p1, p2, q1, q2):
    x1, y1 = p1.x, p1.y
    x2, y2 = p2.x, p2.y
    x3, y3 = q1.x, q1.y
    x4, y4 = q2.x, q2.y
    denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denominator) < 1e-12:
        return p2.copy()
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator
    result = p2.copy()
    result.x = px
    result.y = py
    return result


def clipped_triangle_area(subject, clipper) -> float:
    output = list(subject)
    clipper_ccw = signed_polygon_area(list(clipper)) >= 0
    for a, b in zip(clipper, clipper[1:] + clipper[:1]):
        if not output:
            return 0.0
        current = output
        output = []
        previous = current[-1]
        previous_cross = (b.x - a.x) * (previous.y - a.y) - (b.y - a.y) * (previous.x - a.x)
        previous_inside = previous_cross >= -1e-10 if clipper_ccw else previous_cross <= 1e-10
        for point in current:
            cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
            point_inside = cross >= -1e-10 if clipper_ccw else cross <= 1e-10
            if point_inside:
                if not previous_inside:
                    output.append(line_intersection(previous, point, a, b))
                output.append(point)
            elif previous_inside:
                output.append(line_intersection(previous, point, a, b))
            previous = point
            previous_inside = point_inside
    return abs(signed_polygon_area(output))


def uv_overlap_report(
    mesh: bpy.types.Mesh,
    islands: list[list[int]],
    grid_size: int = 128,
    max_tested_pairs: int = 2_000_000,
) -> dict[str, object]:
    triangles = triangulated_uvs(mesh)
    face_island = {face: island_index for island_index, faces in enumerate(islands) for face in faces}
    cells: dict[tuple[int, int], list[int]] = defaultdict(list)
    tested = set()
    overlap_samples = []
    cross_island_samples = []
    overlap_pairs = 0
    total_overlap_area = 0.0
    same_island_pairs = 0
    cross_island_pairs = 0
    same_material_cross_island_pairs = 0
    different_material_pairs = 0
    near_exact_pairs = 0
    truncated = False
    for index, (face_index, tri) in enumerate(triangles):
        xs = [point.x for point in tri]
        ys = [point.y for point in tri]
        min_x, max_x = math.floor(min(xs) * grid_size), math.floor(max(xs) * grid_size)
        min_y, max_y = math.floor(min(ys) * grid_size), math.floor(max(ys) * grid_size)
        for cell_x in range(min_x, max_x + 1):
            for cell_y in range(min_y, max_y + 1):
                bucket = cells[(cell_x, cell_y)]
                for other_index in bucket:
                    pair = (other_index, index)
                    if pair in tested:
                        continue
                    tested.add(pair)
                    if len(tested) > max_tested_pairs:
                        truncated = True
                        break
                    other_face, other_tri = triangles[other_index]
                    if other_face == face_index:
                        continue
                    area = clipped_triangle_area(other_tri, tri)
                    if area > 1e-7:
                        overlap_pairs += 1
                        if len(overlap_samples) < 20:
                            overlap_samples.append((other_face, face_index, area))
                        total_overlap_area += area
                        if face_island.get(other_face) == face_island.get(face_index):
                            same_island_pairs += 1
                        else:
                            cross_island_pairs += 1
                            if len(cross_island_samples) < 50:
                                cross_island_samples.append(
                                    {
                                        "face_a": other_face,
                                        "face_b": face_index,
                                        "island_a": face_island.get(other_face),
                                        "island_b": face_island.get(face_index),
                                        "material_a": mesh.polygons[other_face].material_index,
                                        "material_b": mesh.polygons[face_index].material_index,
                                        "area": round(area, 9),
                                    }
                                )
                            if mesh.polygons[other_face].material_index == mesh.polygons[face_index].material_index:
                                same_material_cross_island_pairs += 1
                            else:
                                different_material_pairs += 1
                        smaller = min(
                            triangle_area(*other_tri),
                            triangle_area(*tri),
                        )
                        if smaller > EPS and area / smaller >= 0.999:
                            near_exact_pairs += 1
                if truncated:
                    break
                bucket.append(index)
            if truncated:
                break
        if truncated:
            break
    return {
        "triangles": len(triangles),
        "tested_pairs": len(tested),
        "test_limit": max_tested_pairs,
        "truncated": truncated,
        "overlap_pairs": overlap_pairs,
        "same_island_pairs": same_island_pairs,
        "cross_island_pairs": cross_island_pairs,
        "same_material_cross_island_pairs": same_material_cross_island_pairs,
        "different_material_pairs": different_material_pairs,
        "near_exact_triangle_pairs": near_exact_pairs,
        "overlap_area_sum": round(total_overlap_area, 9),
        "samples": [
            {"face_a": row[0], "face_b": row[1], "area": round(row[2], 9)} for row in overlap_samples
        ],
        "cross_island_samples": cross_island_samples,
    }


def uv_report(mesh: bpy.types.Mesh, include_overlap: bool = True) -> dict[str, object]:
    if not mesh.uv_layers:
        return {"present": False}
    uv_layer = mesh.uv_layers.active.data
    uv_edge_counts: dict[tuple[tuple[int, int], tuple[int, int]], int] = defaultdict(int)
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        for index, loop_id in enumerate(loops):
            next_loop_id = loops[(index + 1) % len(loops)]
            a = tuple(round(value, 6) for value in uv_layer[loop_id].uv)
            b = tuple(round(value, 6) for value in uv_layer[next_loop_id].uv)
            if a != b:
                uv_edge_counts[tuple(sorted((a, b)))] += 1
    uv_edge_histogram: dict[str, int] = defaultdict(int)
    for count in uv_edge_counts.values():
        uv_edge_histogram[str(count)] += 1
    islands = uv_islands(mesh)
    island_rows = []
    total_uv_area = 0.0
    out_of_bounds = 0
    for island_index, faces in enumerate(islands):
        loop_ids = [loop_id for face in faces for loop_id in mesh.polygons[face].loop_indices]
        points = [uv_layer[loop_id].uv for loop_id in loop_ids]
        min_x, max_x = min(point.x for point in points), max(point.x for point in points)
        min_y, max_y = min(point.y for point in points), max(point.y for point in points)
        area = 0.0
        for face in faces:
            loops = list(mesh.polygons[face].loop_indices)
            for index in range(1, len(loops) - 1):
                area += triangle_area(uv_layer[loops[0]].uv, uv_layer[loops[index]].uv, uv_layer[loops[index + 1]].uv)
        out = sum(1 for point in points if point.x < -EPS or point.x > 1 + EPS or point.y < -EPS or point.y > 1 + EPS)
        out_of_bounds += out
        total_uv_area += area
        width, height = max_x - min_x, max_y - min_y
        island_rows.append(
            {
                "index": island_index,
                "faces": len(faces),
                "loops": len(loop_ids),
                "area": round(area, 8),
                "bbox": [round(min_x, 6), round(min_y, 6), round(max_x, 6), round(max_y, 6)],
                "width": round(width, 6),
                "height": round(height, 6),
                "orientation": "upright" if height >= width else "landscape",
                "out_of_bounds_loops": out,
            }
        )
    island_rows.sort(key=lambda row: row["area"], reverse=True)
    return {
        "present": True,
        "layer": mesh.uv_layers.active.name,
        "islands": len(islands),
        "out_of_bounds_loops": out_of_bounds,
        "summed_face_area": round(total_uv_area, 8),
        "edge_multiplicity": dict(sorted(uv_edge_histogram.items(), key=lambda item: int(item[0]))),
        "island_details": island_rows,
        "overlap": uv_overlap_report(mesh, islands) if include_overlap else {"skipped": True},
    }


def self_intersection_count(mesh: bpy.types.Mesh, components: list[list[int]]) -> dict[str, object]:
    face_component = {face: component_index for component_index, faces in enumerate(components) for face in faces}
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm, epsilon=1e-7)
    overlaps = tree.overlap(tree)
    samples = []
    count = 0
    same_component = 0
    cross_component = 0
    component_pairs: dict[str, int] = defaultdict(int)
    same_component_centers = []
    for face_a, face_b in overlaps:
        if face_a >= face_b:
            continue
        verts_a = {vert.index for vert in bm.faces[face_a].verts}
        verts_b = {vert.index for vert in bm.faces[face_b].verts}
        if verts_a & verts_b:
            continue
        count += 1
        component_a = face_component.get(face_a)
        component_b = face_component.get(face_b)
        component_pair = tuple(sorted((component_a, component_b)))
        component_pairs[f"{component_pair[0]}:{component_pair[1]}"] += 1
        if component_a == component_b:
            same_component += 1
            if len(same_component_centers) < 20:
                center = (bm.faces[face_a].calc_center_median() + bm.faces[face_b].calc_center_median()) * 0.5
                same_component_centers.append([round(value, 6) for value in center])
        else:
            cross_component += 1
        if len(samples) < 20:
            samples.append([face_a, face_b])
    bm.free()
    return {
        "non_adjacent_triangle_pairs": count,
        "same_component_pairs": same_component,
        "cross_component_pairs": cross_component,
        "component_pair_counts": dict(sorted(component_pairs.items(), key=lambda item: item[1], reverse=True)),
        "same_component_center_samples": same_component_centers,
        "samples": samples,
    }


def normal_report(mesh: bpy.types.Mesh) -> dict[str, object]:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    before = [face.normal.copy() for face in bm.faces]
    signed_volume = bm.calc_volume(signed=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    changed = [
        index for index, face in enumerate(bm.faces)
        if before[index].dot(face.normal) < 0
    ]
    samples = [
        {
            "face": index,
            "center": [round(value, 9) for value in bm.faces[index].calc_center_median()],
            "before": [round(value, 9) for value in before[index]],
            "after": [round(value, 9) for value in bm.faces[index].normal],
        }
        for index in changed[:100]
    ]
    bm.free()
    return {
        "signed_volume": round(signed_volume, 9),
        "faces_changed_by_recalculate_outside": len(changed),
        "changed_samples": samples,
    }


def mesh_report(
    obj: bpy.types.Object,
    include_self_intersections: bool = True,
    include_uv_overlap: bool = True,
) -> dict[str, object]:
    mesh = obj.data
    mesh.calc_loop_triangles()
    edge_face_count = defaultdict(int)
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        for index, start in enumerate(verts):
            edge_face_count[tuple(sorted((start, verts[(index + 1) % len(verts)])))] += 1
    components = face_components(mesh)
    component_rows = []
    for component_index, faces in enumerate(components):
        vertices = {vertex for face in faces for vertex in mesh.polygons[face].vertices}
        coordinates = [mesh.vertices[vertex].co for vertex in vertices]
        min_corner = [min(co[axis] for co in coordinates) for axis in range(3)]
        max_corner = [max(co[axis] for co in coordinates) for axis in range(3)]
        center = [(min_corner[axis] + max_corner[axis]) * 0.5 for axis in range(3)]
        component_rows.append(
            {
                "index": component_index,
                "faces": len(faces),
                "vertices": len(vertices),
                "surface_area": round(sum(mesh.polygons[face].area for face in faces), 8),
                "bbox": [round(value, 6) for value in min_corner + max_corner],
                "center": [round(value, 6) for value in center],
            }
        )
    component_rows.sort(key=lambda row: row["surface_area"], reverse=True)
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "faces": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "boundary_edges": sum(1 for count in edge_face_count.values() if count == 1),
        "non_manifold_edges": sum(1 for count in edge_face_count.values() if count != 2),
        "connected_components": len(components),
        "position_welded_topology": position_welded_topology(mesh),
        "component_details": component_rows,
        "normals": normal_report(mesh),
        "self_intersections": self_intersection_count(mesh, components)
        if include_self_intersections
        else {"skipped": True},
        "uv": uv_report(mesh, include_overlap=include_uv_overlap),
        "materials": [material.name if material else None for material in mesh.materials],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit garment topology, normals, self intersections, and UV layout.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--skip-self-intersections", action="store_true")
    parser.add_argument("--skip-uv-overlap", action="store_true")
    parser.add_argument("--quiet", action="store_true", help="Write the JSON report without echoing it to stdout.")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    result = {
        "input": str(args.input),
        "objects": [
            mesh_report(
                obj,
                include_self_intersections=not args.skip_self_intersections,
                include_uv_overlap=not args.skip_uv_overlap,
            )
            for obj in bpy.context.scene.objects
            if obj.type == "MESH"
        ],
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if not args.quiet:
        print(payload, flush=True)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

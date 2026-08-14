#!/usr/bin/env python3
"""Remove micro-hole sidewalls located by detached plugs and cap both cloth skins.

Some garment exports contain hundreds of tiny closed plug components embedded in
matching through-holes. Removing only the plugs exposes black pinholes even though
the remaining cloth shell is manifold. This script uses the removed plug centers
to find the perpendicular sidewall belt of each hole, deletes those belts, and
caps the resulting inner and outer boundary loops while preserving surrounding UVs.
"""

import argparse
import json
import math
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("component_report")
    parser.add_argument("output")
    parser.add_argument("--max-component-faces", type=int, default=20)
    parser.add_argument("--component-indices")
    parser.add_argument("--pca-radius-factor", type=float, default=1.8)
    parser.add_argument("--wall-radius-factor", type=float, default=0.62)
    parser.add_argument("--wall-normal-dot", type=float, default=0.68)
    parser.add_argument("--min-wall-faces", type=int, default=4)
    parser.add_argument("--max-wall-faces", type=int, default=24)
    parser.add_argument("--position-quantization", type=int, default=18)
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--require-two-closed-loops", action="store_true")
    parser.add_argument("--require-one-closed-loop", action="store_true")
    parser.add_argument("--allow-partial", action="store_true")
    parser.add_argument("--adaptive-two-loop-search", action="store_true")
    return parser.parse_args(argv)


def build_vertex_tree(bm):
    tree = KDTree(len(bm.verts))
    for vert in bm.verts:
        tree.insert(vert.co, vert.index)
    tree.balance()
    return tree


def pca_surface_normal(bm, tree, center, radius):
    indices = {index for _co, index, _distance in tree.find_range(center, radius)}
    if len(indices) < 6:
        return None, len(indices), None
    points = np.array([list(bm.verts[index].co) for index in indices], dtype=np.float64)
    centered = points - points.mean(axis=0)
    covariance = centered.T @ centered / max(1, len(points) - 1)
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    normal = Vector(eigenvectors[:, 0].tolist()).normalized()
    ratio = float(eigenvalues[0] / max(eigenvalues[1], 1e-12))
    return normal, len(indices), ratio


def candidate_wall_faces(bm, tree, center, radius, surface_normal, normal_dot):
    near_vertices = {index for _co, index, _distance in tree.find_range(center, radius * 1.35)}
    candidates = set()
    for index in near_vertices:
        candidates.update(face.index for face in bm.verts[index].link_faces)
    selected = []
    for face_index in candidates:
        face = bm.faces[face_index]
        center_distance = (face.calc_center_median() - center).length
        dot = abs(face.normal.dot(surface_normal))
        if center_distance <= radius and dot <= normal_dot:
            selected.append(face_index)
    return selected


def face_patch_boundary_topology(bm, face_indices):
    selected = {bm.faces[index] for index in face_indices}
    boundary_edges = [
        edge
        for face in selected
        for edge in face.edges
        if sum(linked in selected for linked in edge.link_faces) == 1
    ]
    boundary_edges = list(set(boundary_edges))
    vertex_edges = defaultdict(set)
    for edge in boundary_edges:
        for vertex in edge.verts:
            vertex_edges[vertex].add(edge)
    pending = set(boundary_edges)
    groups = []
    while pending:
        seed = pending.pop()
        group = [seed]
        queue = deque([seed])
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for neighbor in vertex_edges[vertex]:
                    if neighbor in pending:
                        pending.remove(neighbor)
                        group.append(neighbor)
                        queue.append(neighbor)
        groups.append(group)
    degree_distribution = Counter(len(edges) for edges in vertex_edges.values())
    return {
        "boundary_edges": len(boundary_edges),
        "boundary_groups": len(groups),
        "boundary_group_sizes": sorted(len(group) for group in groups),
        "vertex_degree_distribution": dict(sorted(degree_distribution.items())),
        "closed_loop_count": len(groups) if set(degree_distribution) == {2} else 0,
        "two_closed_loops": len(groups) == 2 and set(degree_distribution) == {2},
    }


def boundary_loops(edges):
    remaining = set(edges)
    loops = []
    while remaining:
        seed = remaining.pop()
        loop = [seed]
        current_vert = seed.verts[1]
        start_vert = seed.verts[0]
        while current_vert != start_vert:
            next_edge = next(
                (
                    edge
                    for edge in current_vert.link_edges
                    if edge in remaining and len(edge.link_faces) == 1
                ),
                None,
            )
            if next_edge is None:
                break
            remaining.remove(next_edge)
            loop.append(next_edge)
            current_vert = next_edge.other_vert(current_vert)
        loops.append(loop)
    return loops


def existing_vertex_uvs(vert, uv_layer):
    values = []
    for loop in vert.link_loops:
        if loop.face.is_valid:
            uv = loop[uv_layer].uv
            values.append((round(float(uv.x), 7), round(float(uv.y), 7)))
    return values


def assign_cap_uvs(new_faces, uv_layer, uv_by_vertex):
    for face in new_faces:
        for loop in face.loops:
            values = uv_by_vertex.get(loop.vert.index, [])
            if values:
                chosen = Counter(values).most_common(1)[0][0]
                loop[uv_layer].uv = chosen


def ordered_loop_vertices(loop_edges):
    first = loop_edges[0]
    ordered = [first.verts[0], first.verts[1]]
    for edge in loop_edges[1:]:
        if ordered[-1] not in edge.verts:
            raise ValueError("Boundary edge order is discontinuous")
        next_vertex = edge.other_vert(ordered[-1])
        if next_vertex is ordered[0]:
            break
        ordered.append(next_vertex)
    return ordered


def fill_loop_with_centroid_fan(bm, loop_edges, uv_layer, uv_by_vertex):
    vertices = ordered_loop_vertices(loop_edges)
    center = bm.verts.new(sum((vertex.co for vertex in vertices), Vector()) / len(vertices))
    adjacent_faces = {face for edge in loop_edges for face in edge.link_faces}
    material_counts = Counter(face.material_index for face in adjacent_faces)
    material_index = material_counts.most_common(1)[0][0] if material_counts else 0
    uv_choices = {}
    center_uv = Vector((0.0, 0.0))
    uv_count = 0
    if uv_layer is not None:
        for vertex in vertices:
            values = uv_by_vertex.get(vertex.index, [])
            if values:
                chosen = Counter(values).most_common(1)[0][0]
                uv_choices[vertex] = chosen
                center_uv += Vector(chosen)
                uv_count += 1
        if uv_count:
            center_uv /= uv_count
    created = []
    for index, vertex in enumerate(vertices):
        next_vertex = vertices[(index + 1) % len(vertices)]
        face = bm.faces.new((vertex, next_vertex, center))
        face.material_index = material_index
        face.smooth = True
        if uv_layer is not None:
            for face_loop in face.loops:
                if face_loop.vert is center:
                    face_loop[uv_layer].uv = center_uv
                elif face_loop.vert in uv_choices:
                    face_loop[uv_layer].uv = uv_choices[face_loop.vert]
        created.append(face)
    return created


def unify_boundary_uvs(edges, uv_layer, uv_by_vertex):
    vertices = {vert for edge in edges for vert in edge.verts}
    variants = Counter()
    for vert in vertices:
        values = uv_by_vertex.get(vert.index, [])
        unique = set(values)
        variants[len(unique)] += 1
        if not values:
            continue
        chosen = Counter(values).most_common(1)[0][0]
        for loop in vert.link_loops:
            if loop.face.is_valid:
                loop[uv_layer].uv = chosen
        uv_by_vertex[vert.index] = [chosen]
    return dict(sorted(variants.items()))


def main():
    args = parse_args()
    if args.require_one_closed_loop and args.require_two_closed_loops:
        raise ValueError("Choose only one required boundary-loop count")
    required_loop_count = 1 if args.require_one_closed_loop else 2
    source_report = json.loads(Path(args.component_report).read_text(encoding="utf-8"))
    plugs = [
        component
        for component in source_report["objects"][0]["components"]
        if component["faces"] <= args.max_component_faces
    ]
    if args.component_indices:
        requested = {int(value) for value in args.component_indices.split(",") if value.strip()}
        plugs = [component for component in plugs if component["index"] in requested]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    tree = build_vertex_tree(bm)

    rows = []
    all_wall_faces = set()
    accepted_plugs = []
    for plug in plugs:
        center = Vector(plug["center"])
        bbox = plug["bbox"]
        diagonal = Vector((bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2])).length
        surface_normal, pca_vertices, pca_ratio = pca_surface_normal(
            bm,
            tree,
            center,
            diagonal * args.pca_radius_factor,
        )
        walls = []
        chosen_radius_factor = args.wall_radius_factor
        chosen_normal_dot = args.wall_normal_dot
        search_solutions = []
        if surface_normal is not None:
            parameter_pairs = [(args.wall_radius_factor, args.wall_normal_dot)]
            if args.adaptive_two_loop_search:
                parameter_pairs = [
                    (radius_factor, normal_dot)
                    for radius_factor in (0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8)
                    for normal_dot in (0.45, 0.55, 0.65, 0.72, 0.8, 0.88)
                ]
            for radius_factor, normal_dot in parameter_pairs:
                candidate = candidate_wall_faces(
                    bm,
                    tree,
                    center,
                    diagonal * radius_factor,
                    surface_normal,
                    normal_dot,
                )
                topology = face_patch_boundary_topology(bm, candidate) if candidate else None
                if (
                    args.min_wall_faces <= len(candidate) <= args.max_wall_faces
                    and topology
                    and topology["closed_loop_count"] == required_loop_count
                ):
                    search_solutions.append(
                        {
                            "radius_factor": radius_factor,
                            "normal_dot": normal_dot,
                            "wall_faces": len(candidate),
                            "wall_face_indices": sorted(candidate),
                            "topology": topology,
                        }
                    )
            if search_solutions:
                best = min(
                    search_solutions,
                    key=lambda solution: (
                        solution["wall_faces"],
                        solution["radius_factor"],
                        solution["normal_dot"],
                    ),
                )
                walls = best["wall_face_indices"]
                chosen_radius_factor = best["radius_factor"]
                chosen_normal_dot = best["normal_dot"]
            elif not args.adaptive_two_loop_search:
                walls = candidate_wall_faces(
                    bm,
                    tree,
                    center,
                    diagonal * args.wall_radius_factor,
                    surface_normal,
                    args.wall_normal_dot,
                )
        patch_topology = face_patch_boundary_topology(bm, walls) if walls else None
        accepted = (
            args.min_wall_faces <= len(walls) <= args.max_wall_faces
            and (
                not (args.require_two_closed_loops or args.require_one_closed_loop)
                or bool(
                    patch_topology
                    and patch_topology["closed_loop_count"] == required_loop_count
                )
            )
        )
        if accepted:
            all_wall_faces.update(walls)
            accepted_plugs.append(plug["index"])
        rows.append(
            {
                "component": plug["index"],
                "plug_faces": plug["faces"],
                "center": [round(value, 6) for value in center],
                "bbox_diagonal": round(diagonal, 8),
                "pca_vertices": pca_vertices,
                "pca_small_to_middle_ratio": round(pca_ratio, 6) if pca_ratio is not None else None,
                "surface_normal": [round(value, 6) for value in surface_normal] if surface_normal else None,
                "wall_faces": len(walls),
                "wall_face_indices": sorted(walls),
                "wall_patch_topology": patch_topology,
                "chosen_radius_factor": chosen_radius_factor,
                "chosen_normal_dot": chosen_normal_dot,
                "adaptive_solution_count": len(search_solutions),
                "accepted": accepted,
            }
        )

    count_distribution = dict(sorted(Counter(row["wall_faces"] for row in rows).items()))
    report = {
        "input": args.input,
        "output": args.output,
        "plugs_considered": len(plugs),
        "plugs_accepted": len(accepted_plugs),
        "wall_faces_unique": len(all_wall_faces),
        "wall_face_count_distribution": count_distribution,
        "settings": {
            "pca_radius_factor": args.pca_radius_factor,
            "wall_radius_factor": args.wall_radius_factor,
            "wall_normal_dot": args.wall_normal_dot,
            "min_wall_faces": args.min_wall_faces,
            "max_wall_faces": args.max_wall_faces,
        },
        "holes": rows,
    }
    output_path = Path(args.output)
    report_path = output_path.with_suffix(".hole-repair.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)

    if args.inspect_only:
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({key: report[key] for key in report if key != "holes"}, indent=2))
        bm.free()
        return

    if len(accepted_plugs) != len(plugs) and not args.allow_partial:
        rejected = [row["component"] for row in rows if not row["accepted"]]
        raise RuntimeError(f"Refusing partial repair; rejected plug components: {rejected}")

    faces_to_delete = [bm.faces[index] for index in sorted(all_wall_faces)]
    bmesh.ops.delete(bm, geom=faces_to_delete, context="FACES_ONLY")
    uv_layer = bm.loops.layers.uv.active
    uv_by_vertex = {
        vert.index: existing_vertex_uvs(vert, uv_layer)
        for vert in bm.verts
    } if uv_layer else {}
    bm.edges.ensure_lookup_table()
    new_boundary_edges = [edge for edge in bm.edges if len(edge.link_faces) == 1]
    boundary_uv_variant_distribution = {}
    if uv_layer:
        boundary_uv_variant_distribution = unify_boundary_uvs(new_boundary_edges, uv_layer, uv_by_vertex)
    loops = boundary_loops(new_boundary_edges)
    cap_faces = []
    loop_sizes = []
    for loop in loops:
        loop_sizes.append(len(loop))
        cap_faces.extend(fill_loop_with_centroid_fan(bm, loop, uv_layer, uv_by_vertex))
    bm.normal_update()
    for face in cap_faces:
        face.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    report.update(
        {
            "boundary_edges_after_wall_delete": len(new_boundary_edges),
            "boundary_uv_variant_distribution": boundary_uv_variant_distribution,
            "boundary_loops_filled": len(loops),
            "boundary_loop_size_distribution": dict(sorted(Counter(loop_sizes).items())),
            "cap_faces_created": len(cap_faces),
        }
    )

    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path.resolve()),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=args.position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in report if key != "holes"}, indent=2))


if __name__ == "__main__":
    main()

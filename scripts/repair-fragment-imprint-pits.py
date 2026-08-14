#!/usr/bin/env python3
"""Smooth local cloth puckers located by removed surface-fragment components.

This is intended for garments where many tiny closed polyhedra sit on the cloth
surface and leave sharp pin-like imprints in the retained garment shell. The
repair changes vertex positions only; topology and UV loop data are preserved.
"""

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("component_report")
    parser.add_argument("output")
    parser.add_argument("--max-component-faces", type=int, default=20)
    parser.add_argument("--component-indices")
    parser.add_argument("--max-proximity", type=float, default=0.025)
    parser.add_argument("--seed-radius", type=float, default=0.0)
    parser.add_argument("--rings", type=int, default=3)
    parser.add_argument("--iterations", type=int, default=6)
    parser.add_argument("--factor", type=float, default=0.35)
    parser.add_argument("--protect-other-component-distance", type=float, default=0.0)
    parser.add_argument("--protect-rings", type=int, default=1)
    parser.add_argument("--position-quantization", type=int, default=18)
    parser.add_argument("--preserve-custom-normals", action="store_true")
    return parser.parse_args(argv)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def collect_weighted_vertices(bm, seed_faces, seed_vertices, rings):
    distance = {}
    queue = deque()
    for vertex_index in seed_vertices:
        if vertex_index not in distance:
            distance[vertex_index] = 0
            queue.append(bm.verts[vertex_index])
    for face_index in seed_faces:
        for vert in bm.faces[face_index].verts:
            if vert.index not in distance:
                distance[vert.index] = 0
                queue.append(vert)
    while queue:
        vert = queue.popleft()
        current = distance[vert.index]
        if current >= rings:
            continue
        for edge in vert.link_edges:
            other = edge.other_vert(vert)
            if other.index not in distance or distance[other.index] > current + 1:
                distance[other.index] = current + 1
                queue.append(other)
    return {
        index: max(0.0, 1.0 - ring / (rings + 1.0))
        for index, ring in distance.items()
    }


def connected_components(bm):
    component_by_vertex = {}
    components = []
    for seed in bm.verts:
        if seed.index in component_by_vertex:
            continue
        component_index = len(components)
        indices = []
        stack = [seed]
        component_by_vertex[seed.index] = component_index
        while stack:
            vert = stack.pop()
            indices.append(vert.index)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other.index not in component_by_vertex:
                    component_by_vertex[other.index] = component_index
                    stack.append(other)
        components.append(indices)
    return component_by_vertex, components


def vertices_near_other_components(bm, component_by_vertex, components, threshold):
    if threshold <= 0.0 or len(components) < 2:
        return set()
    trees = []
    for indices in components:
        tree = KDTree(len(indices))
        for index in indices:
            tree.insert(bm.verts[index].co, index)
        tree.balance()
        trees.append(tree)
    protected = set()
    for vert in bm.verts:
        own_component = component_by_vertex[vert.index]
        for component_index, tree in enumerate(trees):
            if component_index == own_component:
                continue
            _co, _index, distance = tree.find(vert.co)
            if distance <= threshold:
                protected.add(vert.index)
                break
    return protected


def expand_vertex_set(bm, indices, rings):
    expanded = set(indices)
    frontier = set(indices)
    for _ in range(rings):
        next_frontier = set()
        for index in frontier:
            for edge in bm.verts[index].link_edges:
                other_index = edge.other_vert(bm.verts[index]).index
                if other_index not in expanded:
                    expanded.add(other_index)
                    next_frontier.add(other_index)
        frontier = next_frontier
        if not frontier:
            break
    return expanded


def smooth_positions(bm, weights, iterations, factor):
    bm.verts.ensure_lookup_table()
    for _ in range(iterations):
        updates = {}
        for index, weight in weights.items():
            vert = bm.verts[index]
            neighbors = [edge.other_vert(vert) for edge in vert.link_edges]
            if not neighbors:
                continue
            average = Vector((0.0, 0.0, 0.0))
            total = 0.0
            for neighbor in neighbors:
                edge_length = max((neighbor.co - vert.co).length, 1e-8)
                inverse_length = 1.0 / edge_length
                average += neighbor.co * inverse_length
                total += inverse_length
            average /= total
            updates[index] = vert.co.lerp(average, factor * weight)
        for index, position in updates.items():
            bm.verts[index].co = position
        bm.normal_update()


def main():
    args = parse_args()
    component_report = json.loads(Path(args.component_report).read_text(encoding="utf-8"))
    source_object = component_report["objects"][0]
    source_components = source_object.get("components") or source_object.get("component_details")
    if source_components is None:
        raise KeyError("Component report must contain 'components' or 'component_details'")
    fragments = [
        component
        for component in source_components
        if component["faces"] <= args.max_component_faces
    ]
    if args.component_indices:
        requested = {int(value) for value in args.component_indices.split(",") if value.strip()}
        fragments = [fragment for fragment in fragments if fragment["index"] in requested]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    objects = mesh_objects()
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    vertex_tree = KDTree(len(bm.verts))
    for vert in bm.verts:
        vertex_tree.insert(vert.co, vert.index)
    vertex_tree.balance()
    component_by_vertex, components = connected_components(bm)

    seed_faces = set()
    seed_vertices = set()
    accepted = []
    rejected = []
    for fragment in fragments:
        center = Vector(fragment["center"])
        nearest, _normal, face_index, distance = bvh.find_nearest(center)
        row = {
            "component": fragment["index"],
            "center": [round(value, 6) for value in center],
            "nearest": [round(value, 6) for value in nearest],
            "face": face_index,
            "distance": round(distance, 8),
        }
        if distance <= args.max_proximity:
            if args.seed_radius > 0.0:
                for _co, vertex_index, _vertex_distance in vertex_tree.find_range(center, args.seed_radius):
                    seed_vertices.add(vertex_index)
            else:
                seed_faces.add(face_index)
            accepted.append(row)
        else:
            rejected.append(row)

    weights = collect_weighted_vertices(bm, seed_faces, seed_vertices, args.rings)
    protected = vertices_near_other_components(
        bm,
        component_by_vertex,
        components,
        args.protect_other_component_distance,
    )
    protected = expand_vertex_set(bm, protected, args.protect_rings)
    weights = {index: weight for index, weight in weights.items() if index not in protected}
    before = {index: bm.verts[index].co.copy() for index in weights}
    smooth_positions(bm, weights, args.iterations, args.factor)
    displacements = [(bm.verts[index].co - before[index]).length for index in weights]

    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    had_custom_normals = bool(getattr(obj.data, "has_custom_normals", False))
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if not args.preserve_custom_normals:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if had_custom_normals and not args.preserve_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.calc_normals()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
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

    report = {
        "input": args.input,
        "output": args.output,
        "fragments_considered": len(fragments),
        "fragments_accepted": len(accepted),
        "fragments_rejected": len(rejected),
        "seed_faces": len(seed_faces),
        "seed_vertices": len(seed_vertices),
        "seed_radius": args.seed_radius,
        "vertices_smoothed": len(weights),
        "rings": args.rings,
        "iterations": args.iterations,
        "factor": args.factor,
        "protect_other_component_distance": args.protect_other_component_distance,
        "protected_vertices": len(protected),
        "max_displacement": round(max(displacements, default=0.0), 8),
        "mean_displacement": round(sum(displacements) / len(displacements), 8) if displacements else 0.0,
        "custom_normals_cleared": had_custom_normals and not args.preserve_custom_normals,
        "rejected": rejected,
    }
    output_path.with_suffix(".repair.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

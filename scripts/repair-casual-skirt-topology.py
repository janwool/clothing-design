#!/usr/bin/env python3
"""Repair split cloth faces on the casual skirt source model.

The source is not made from 1,149 independent design parts.  Most of those
indexed components are triangles and narrow patches whose edges occupy the
same positions as the surrounding material-0 cloth.  Solidifying every raw
component independently turns those seams into the spikes visible in the old
catalog asset.

This repair joins only an unambiguous geometric edge shared by exactly two
faces of the same material.  Edges shared by three or more coincident layers
are deliberately left separate, so the skirt body, slit facing, waistband and
zipper are not accidentally welded through one another.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    pending = set(bm.faces)
    result: list[list[bmesh.types.BMFace]] = []
    while pending:
        seed = min(pending, key=lambda face: face.index)
        pending.remove(seed)
        queue = deque([seed])
        faces = [seed]
        while queue:
            face = queue.popleft()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in pending:
                        pending.remove(linked)
                        queue.append(linked)
                        faces.append(linked)
        result.append(faces)
    return result


def topology(bm: bmesh.types.BMesh) -> dict[str, int]:
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    return {
        "vertices": len(bm.verts),
        "edges": len(bm.edges),
        "faces": len(bm.faces),
        "components": len(components(bm)),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "true_nonmanifold_edges": sum(
            not edge.is_boundary and not edge.is_manifold for edge in bm.edges
        ),
    }


class DisjointSet:
    def __init__(self, count: int) -> None:
        self.parent = list(range(count))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, a: int, b: int) -> None:
        root_a, root_b = self.find(a), self.find(b)
        if root_a != root_b:
            self.parent[max(root_a, root_b)] = min(root_a, root_b)


def selective_same_layer_weld(
    bm: bmesh.types.BMesh,
    tolerance: float,
    uv_owner_min_faces: int = 0,
) -> dict[str, object]:
    """Weld seam copies only where the geometric edge has two cloth faces."""
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    raw_components = components(bm)
    raw_component_by_face = {
        face: component_index
        for component_index, faces in enumerate(raw_components)
        for face in faces
    }
    raw_component_sizes = [len(faces) for faces in raw_components]
    scale = 1.0 / tolerance
    position_key = {
        vertex: tuple(round(float(value) * scale) for value in vertex.co)
        for vertex in bm.verts
    }
    edge_entries: dict[
        tuple[tuple[int, int, int], tuple[int, int, int]],
        list[tuple[bmesh.types.BMFace, bmesh.types.BMVert, bmesh.types.BMVert]],
    ] = defaultdict(list)
    for face in bm.faces:
        for edge in face.edges:
            a, b = edge.verts
            key_a, key_b = position_key[a], position_key[b]
            if key_a == key_b:
                continue
            edge_entries[tuple(sorted((key_a, key_b)))].append((face, a, b))

    propagated_owner: dict[int, int] = {}
    major_components: list[int] = []
    if uv_owner_min_faces > 0:
        neighbors: dict[int, set[int]] = defaultdict(set)
        for entries in edge_entries.values():
            if len(entries) != 2:
                continue
            face_a, face_b = entries[0][0], entries[1][0]
            component_a = raw_component_by_face[face_a]
            component_b = raw_component_by_face[face_b]
            if face_a.material_index != face_b.material_index or component_a == component_b:
                continue
            neighbors[component_a].add(component_b)
            neighbors[component_b].add(component_a)
        major_components = [
            index for index, size in enumerate(raw_component_sizes)
            if size >= uv_owner_min_faces
        ]
        best: dict[int, tuple[int, int, int]] = {}
        queue: list[tuple[int, int, int, int]] = []
        for root in major_components:
            candidate = (0, -raw_component_sizes[root], root)
            best[root] = candidate
            heapq.heappush(queue, (*candidate, root))
        while queue:
            distance, negative_root_size, root, component = heapq.heappop(queue)
            if best.get(component) != (distance, negative_root_size, root):
                continue
            propagated_owner[component] = root
            for neighbor in neighbors[component]:
                candidate = (distance + 1, negative_root_size, root)
                if neighbor not in best or candidate < best[neighbor]:
                    best[neighbor] = candidate
                    heapq.heappush(queue, (*candidate, neighbor))
        for component_index in range(len(raw_components)):
            propagated_owner.setdefault(component_index, component_index)

    dsu = DisjointSet(len(bm.verts))
    safe_edges = 0
    already_indexed_edges = 0
    material_conflicts = 0
    layer_conflicts = 0
    authored_cloth_seam_keys = set()
    for geometric_key, entries in edge_entries.items():
        if len(entries) != 2:
            if len(entries) > 2:
                layer_conflicts += 1
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        if face_a.material_index != face_b.material_index:
            material_conflicts += 1
            continue
        if {a0.index, a1.index} == {b0.index, b1.index}:
            already_indexed_edges += 1
            continue
        endpoints_a = {position_key[a0]: a0, position_key[a1]: a1}
        endpoints_b = {position_key[b0]: b0, position_key[b1]: b1}
        if set(endpoints_a) != set(endpoints_b):
            raise RuntimeError(f"Endpoint quantization mismatch at {geometric_key}")
        component_a = raw_component_by_face[face_a]
        component_b = raw_component_by_face[face_b]
        if uv_owner_min_faces > 0:
            preserve_uv_seam = (
                face_a.material_index == 0
                and propagated_owner[component_a] != propagated_owner[component_b]
            )
        else:
            preserve_uv_seam = (
                face_a.material_index == 0
                and component_a != component_b
                and raw_component_sizes[component_a] > 100
                and raw_component_sizes[component_b] > 100
            )
        if preserve_uv_seam:
            authored_cloth_seam_keys.add(geometric_key)
        for key in endpoints_a:
            dsu.union(endpoints_a[key].index, endpoints_b[key].index)
        safe_edges += 1

    vertices = list(bm.verts)
    targetmap = {}
    for vertex in vertices:
        root = dsu.find(vertex.index)
        if root != vertex.index:
            targetmap[vertex] = vertices[root]
    if targetmap:
        bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    for edge in bm.edges:
        a, b = edge.verts
        key_a = tuple(round(float(value) * scale) for value in a.co)
        key_b = tuple(round(float(value) * scale) for value in b.co)
        edge.seam = tuple(sorted((key_a, key_b))) in authored_cloth_seam_keys
    return {
        "geometric_edges": len(edge_entries),
        "unambiguous_same_material_seams": safe_edges,
        "already_indexed_manifold_edges": already_indexed_edges,
        "different_material_contacts_preserved": material_conflicts,
        "three_plus_layer_contacts_preserved": layer_conflicts,
        "vertices_merged": len(targetmap),
        "authored_cloth_seam_edges": len(authored_cloth_seam_keys),
        "uv_owner_min_faces": uv_owner_min_faces,
        "uv_major_components": len(major_components),
        "uv_owner_groups": len(set(propagated_owner.values())) if propagated_owner else 0,
    }


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
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


def qpoint(uv, precision: int = 6) -> tuple[int, int]:
    scale = 10**precision
    return round(float(uv[0]) * scale), round(float(uv[1]) * scale)


def uv_islands(mesh: bpy.types.Mesh) -> list[list[int]]:
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return []
    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, loop_index in enumerate(loops):
            following = loops[(index + 1) % len(loops)]
            key = tuple(
                sorted(
                    (
                        mesh.loops[loop_index].vertex_index,
                        mesh.loops[following].vertex_index,
                    )
                )
            )
            edge_faces[key].append(
                (
                    polygon.index,
                    qpoint(uv_layer.data[loop_index].uv),
                    qpoint(uv_layer.data[following].uv),
                )
            )
    neighbors = defaultdict(set)
    for entries in edge_faces.values():
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        if (a0 == b0 and a1 == b1) or (a0 == b1 and a1 == b0):
            neighbors[face_a].add(face_b)
            neighbors[face_b].add(face_a)
    islands, visited = [], set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue, island = deque([polygon.index]), []
        visited.add(polygon.index)
        while queue:
            face = queue.popleft()
            island.append(face)
            for neighbor in neighbors[face]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        islands.append(island)
    return islands


def orient_uv_islands_upright(mesh: bpy.types.Mesh) -> list[dict[str, object]]:
    uv_layer = mesh.uv_layers.active
    rows = []
    for island_index, faces in enumerate(uv_islands(mesh)):
        loops = [loop for face in faces for loop in mesh.polygons[face].loop_indices]
        samples = [
            (
                mesh.vertices[mesh.loops[loop].vertex_index].co.y,
                uv_layer.data[loop].uv.copy(),
            )
            for loop in loops
        ]
        mean_y = sum(y for y, _uv in samples) / len(samples)
        mean_u = sum(uv.x for _y, uv in samples) / len(samples)
        mean_v = sum(uv.y for _y, uv in samples) / len(samples)
        covariance_u = sum((y - mean_y) * (uv.x - mean_u) for y, uv in samples)
        covariance_v = sum((y - mean_y) * (uv.y - mean_v) for y, uv in samples)
        angle = 0.0
        if math.hypot(covariance_u, covariance_v) > 1e-10:
            angle = math.pi / 2.0 - math.atan2(covariance_v, covariance_u)
            cosine, sine = math.cos(angle), math.sin(angle)
            for loop in loops:
                uv = uv_layer.data[loop].uv
                x, y = uv.x - mean_u, uv.y - mean_v
                uv.x = mean_u + x * cosine - y * sine
                uv.y = mean_v + x * sine + y * cosine
        rows.append(
            {
                "island": island_index,
                "faces": len(faces),
                "rotation_degrees": round(math.degrees(angle), 4),
            }
        )
    return rows


def rebuild_physical_uv(obj: bpy.types.Object, margin: float) -> dict[str, object]:
    mesh = obj.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # The cloth is three open sewn surfaces after the topology repair, so an
    # angle-based garment unwrap produces exactly three coherent pattern
    # islands.  The zipper includes four closed miniature hardware groups;
    # those require explicit projection seams and are unwrapped separately.
    for polygon in mesh.polygons:
        polygon.select = polygon.material_index == 0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.unwrap(
        method="ANGLE_BASED",
        fill_holes=True,
        correct_aspect=True,
        margin=0.001,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    for polygon in mesh.polygons:
        polygon.select = polygon.material_index != 0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0),
        island_margin=0.001,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    orientation = orient_uv_islands_upright(mesh)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=False, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    return {
        "islands": len(uv_islands(mesh)),
        "margin": margin,
        "substantial_orientation": [row for row in orientation if row["faces"] >= 20],
    }


def add_thickness(obj: bpy.types.Object, thickness: float) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Casual skirt repaired fabric thickness", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 0.0
    modifier.use_even_offset = False
    modifier.use_quality_normals = False
    modifier.use_rim_only = False
    modifier.material_offset = 0
    modifier.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--uv-margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=22)
    parser.add_argument(
        "--pattern-surface-output",
        type=Path,
        help="Optionally export the sewn, UV-rebuilt surface before adding thickness.",
    )
    parser.add_argument(
        "--uv-owner-min-faces",
        type=int,
        default=0,
        help="Propagate small patches to major source panels and preserve UV seams between owners.",
    )
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    source = topology(bm)
    weld = selective_same_layer_weld(bm, args.tolerance, args.uv_owner_min_faces)
    repaired = topology(bm)
    bm.to_mesh(obj.data)
    bm.free()

    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    rebuilt_uv = rebuild_physical_uv(obj, args.uv_margin)
    if args.pattern_surface_output:
        export_glb(args.pattern_surface_output, args.position_quantization)
    add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened = topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    thickened_uv_islands = len(uv_islands(obj.data))

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "weld only exact geometric edges shared by two faces of the same "
            "material; preserve multi-layer contacts and zipper/material seams"
        ),
        "tolerance": args.tolerance,
        "thickness": args.thickness,
        "uv_margin": args.uv_margin,
        "source": source,
        "weld": weld,
        "repaired": repaired,
        "rebuilt_uv": rebuilt_uv,
        "pattern_surface_output": (
            str(args.pattern_surface_output) if args.pattern_surface_output else None
        ),
        "thickened": thickened,
        "thickened_uv_islands": thickened_uv_islands,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

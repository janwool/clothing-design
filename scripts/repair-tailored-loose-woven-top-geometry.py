#!/usr/bin/env python3
"""Remove ID101's redundant micro repair solids and heal local shading.

Twenty-eight closed micro solids sit almost exactly on fifteen already-closed
garment shells.  Keeping them causes black/gray chips from coincident surfaces;
removing them alone exposes inherited bad split normals on the underlying local
faces.  This repair deletes only those diagnosed components and replaces split
normals only on low-alignment shell faces within a measured distance of them.
Every other garment face and authored split normal is preserved.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


EXPECTED_SMALL = {
    0: 12, 2: 16, 5: 8, 6: 8, 7: 12, 10: 8, 11: 8, 13: 8,
    19: 12, 21: 8, 22: 12, 24: 8, 25: 12, 27: 8, 29: 8,
    30: 12, 31: 12, 34: 8, 35: 12, 36: 12, 38: 12, 39: 24,
    41: 8, 42: 8, 45: 8, 47: 8, 50: 8, 51: 12,
}

REPAIR_TO_MAIN = {
    0: 1, 2: 3, 5: 8, 6: 8, 7: 8, 10: 12, 11: 12, 13: 12,
    19: 20, 21: 23, 22: 23, 24: 26, 25: 26, 27: 28, 29: 32,
    30: 32, 31: 32, 34: 37, 35: 37, 36: 37, 38: 40, 39: 40,
    41: 43, 42: 43, 45: 46, 47: 48, 50: 52, 51: 52,
}

NONBIJECTIVE_SEAL_COMPONENTS = {35, 36}


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    unseen = {polygon.index for polygon in mesh.polygons}
    result = []
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        queue = deque([seed])
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in sorted(neighbors[face]):
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        result.append(component)
    return result


def position_key(vector, precision: int = 7) -> tuple[float, float, float]:
    return tuple(round(float(value), precision) for value in vector)


def polygon_key(mesh: bpy.types.Mesh, polygon: bpy.types.MeshPolygon):
    return tuple(sorted(position_key(mesh.vertices[index].co) for index in polygon.vertices))


def topology(mesh: bpy.types.Mesh) -> dict[str, int]:
    edge_counts: dict[tuple[int, int], int] = defaultdict(int)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_counts[edge_key] += 1
    return {
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "components": len(face_components(mesh)),
        "boundary_edges": sum(count == 1 for count in edge_counts.values()),
        "nonmanifold_edges": sum(count != 2 for count in edge_counts.values()),
    }


def faces_bvh(mesh: bpy.types.Mesh, faces: list[int]) -> BVHTree:
    vertices = sorted({vertex for face in faces for vertex in mesh.polygons[face].vertices})
    lookup = {vertex: index for index, vertex in enumerate(vertices)}
    polygons = [
        [lookup[vertex] for vertex in mesh.polygons[face].vertices]
        for face in faces
    ]
    return BVHTree.FromPolygons(
        [mesh.vertices[vertex].co.copy() for vertex in vertices],
        polygons,
        all_triangles=True,
    )


def capture_normals(mesh: bpy.types.Mesh):
    mesh.calc_normals_split()
    records = {}
    duplicates = 0
    for polygon in mesh.polygons:
        key = polygon_key(mesh, polygon)
        value = {
            position_key(mesh.vertices[mesh.loops[loop].vertex_index].co):
            mesh.loops[loop].normal.copy()
            for loop in polygon.loop_indices
        }
        if key in records:
            duplicates += 1
        records[key] = value
    return records, duplicates


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("--distance", type=float, default=0.02)
    parser.add_argument("--normal-dot", type=float, default=0.5)
    parser.add_argument("--local-normal-mode", choices=("smooth", "flat"), default="smooth")
    parser.add_argument(
        "--align-small-components",
        nargs="*",
        type=int,
        default=[],
        help="Move the paired main-shell vertices onto selected repair-solid vertices before deletion",
    )
    parser.add_argument(
        "--seal-small-components",
        nargs="*",
        type=int,
        default=[],
        help="Replace the paired main-shell tunnel walls with front/back cap faces",
    )
    parser.add_argument(
        "--mirror-back-tab",
        action="store_true",
        help="Replace corrupted component 18 with a mirrored copy of healthy component 15",
    )
    parser.add_argument(
        "--flat-small-components",
        nargs="*",
        type=int,
        default=[],
        help="Use face normals only on the paired main-shell strip of selected repairs",
    )
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    source = topology(mesh)
    if source != {
        "vertices": 60280,
        "faces": 120444,
        "components": 53,
        "boundary_edges": 0,
        "nonmanifold_edges": 0,
    }:
        raise RuntimeError(f"Unexpected ID101 source topology: {source}")
    components = face_components(mesh)
    actual_small = {
        index: len(faces)
        for index, faces in enumerate(components)
        if len(faces) <= 24
    }
    if actual_small != EXPECTED_SMALL:
        raise RuntimeError(f"Unexpected ID101 repair-solid set: {actual_small}")

    mirrored_tab_faces = set()
    mirror_report = {"enabled": False}
    if args.mirror_back_tab:
        healthy_component = 15
        corrupt_component = 18
        healthy_faces = components[healthy_component]
        corrupt_faces = components[corrupt_component]
        healthy_vertices = sorted({
            vertex for face in healthy_faces for vertex in mesh.polygons[face].vertices
        })
        corrupt_vertices = sorted({
            vertex for face in corrupt_faces for vertex in mesh.polygons[face].vertices
        })
        if len(healthy_faces) != 68 or len(corrupt_faces) != 68:
            raise RuntimeError("Unexpected ID101 back-tab face counts")
        if len(healthy_vertices) != 36 or len(corrupt_vertices) != 36:
            raise RuntimeError("Unexpected ID101 back-tab vertex counts")
        healthy_topology = sorted(
            tuple(vertex - min(healthy_vertices) for vertex in mesh.polygons[face].vertices)
            for face in healthy_faces
        )
        corrupt_topology = sorted(
            tuple(vertex - min(corrupt_vertices) for vertex in mesh.polygons[face].vertices)
            for face in corrupt_faces
        )
        if healthy_topology != corrupt_topology:
            raise RuntimeError("ID101 paired back-tab topology no longer matches")
        healthy_center_x = sum(mesh.vertices[index].co.x for index in healthy_vertices) / 36
        corrupt_center_x = sum(mesh.vertices[index].co.x for index in corrupt_vertices) / 36
        mirror_plane_x = (healthy_center_x + corrupt_center_x) * 0.5
        before_coordinates = [mesh.vertices[index].co.copy() for index in corrupt_vertices]
        for healthy_vertex, corrupt_vertex in zip(healthy_vertices, corrupt_vertices):
            source_coordinate = mesh.vertices[healthy_vertex].co
            mesh.vertices[corrupt_vertex].co = (
                2 * mirror_plane_x - source_coordinate.x,
                source_coordinate.y,
                source_coordinate.z,
            )
        for face in corrupt_faces:
            mesh.polygons[face].flip()
        mesh.update(calc_edges=True, calc_edges_loose=True)
        mirrored_tab_faces = set(corrupt_faces)
        displacements = [
            float((mesh.vertices[index].co - before).length)
            for index, before in zip(corrupt_vertices, before_coordinates)
        ]
        mirror_report = {
            "enabled": True,
            "healthy_component": healthy_component,
            "corrupt_component": corrupt_component,
            "vertices": len(corrupt_vertices),
            "faces": len(corrupt_faces),
            "mirror_plane_x": round(float(mirror_plane_x), 9),
            "vertex_displacement": {
                "minimum": round(min(displacements), 9),
                "mean": round(sum(displacements) / len(displacements), 9),
                "maximum": round(max(displacements), 9),
            },
            "winding_reversed": True,
        }

    align_components = sorted(set(args.align_small_components))
    unknown_alignments = set(align_components) - set(REPAIR_TO_MAIN)
    if unknown_alignments:
        raise RuntimeError(f"Unknown ID101 repair components requested: {sorted(unknown_alignments)}")
    seal_components = sorted(set(args.seal_small_components))
    unknown_seals = set(seal_components) - set(REPAIR_TO_MAIN)
    if unknown_seals:
        raise RuntimeError(f"Unknown ID101 repair components requested for sealing: {sorted(unknown_seals)}")
    flat_components = sorted(set(args.flat_small_components))
    unknown_flat = set(flat_components) - set(REPAIR_TO_MAIN)
    if unknown_flat:
        raise RuntimeError(f"Unknown ID101 repair components requested for flat normals: {sorted(unknown_flat)}")
    if set(flat_components).intersection(seal_components):
        raise RuntimeError("ID101 repair components cannot be both sealed and forced flat")

    aligned_vertices = set()
    alignment_details = []
    for small_component in align_components:
        main_component = REPAIR_TO_MAIN[small_component]
        small_vertices = sorted({
            vertex
            for face in components[small_component]
            for vertex in mesh.polygons[face].vertices
        })
        main_vertices = sorted({
            vertex
            for face in components[main_component]
            for vertex in mesh.polygons[face].vertices
        })
        tree = KDTree(len(main_vertices))
        for vertex in main_vertices:
            tree.insert(mesh.vertices[vertex].co, vertex)
        tree.balance()
        matches = []
        for small_vertex in small_vertices:
            small_coordinate = mesh.vertices[small_vertex].co.copy()
            _coordinate, main_vertex, distance = tree.find(small_coordinate)
            matches.append((small_vertex, main_vertex, float(distance), small_coordinate))
        if len({main_vertex for _small, main_vertex, _distance, _co in matches}) != len(matches):
            raise RuntimeError(
                f"ID101 repair component {small_component} does not map one-to-one "
                f"onto main component {main_component}"
            )
        for small_vertex, main_vertex, distance, small_coordinate in matches:
            before = mesh.vertices[main_vertex].co.copy()
            mesh.vertices[main_vertex].co = small_coordinate
            aligned_vertices.add(main_vertex)
            alignment_details.append({
                "small_component": small_component,
                "main_component": main_component,
                "small_vertex": small_vertex,
                "main_vertex": main_vertex,
                "distance": round(distance, 9),
                "before": [round(float(value), 9) for value in before],
                "after": [round(float(value), 9) for value in small_coordinate],
            })
    mesh.update()

    alignment_faces = {
        polygon.index
        for polygon in mesh.polygons
        if aligned_vertices.intersection(polygon.vertices)
    }

    sealed_wall_faces = set()
    seal_details = []
    for small_component in seal_components:
        main_component = REPAIR_TO_MAIN[small_component]
        small_vertices = sorted({
            vertex
            for face in components[small_component]
            for vertex in mesh.polygons[face].vertices
        })
        main_vertices = sorted({
            vertex
            for face in components[main_component]
            for vertex in mesh.polygons[face].vertices
        })
        tree = KDTree(len(main_vertices))
        for vertex in main_vertices:
            tree.insert(mesh.vertices[vertex].co, vertex)
        tree.balance()
        matches = []
        for small_vertex in small_vertices:
            _coordinate, main_vertex, distance = tree.find(mesh.vertices[small_vertex].co)
            matches.append((small_vertex, main_vertex, float(distance)))
        paired_main = {main_vertex for _small, main_vertex, _distance in matches}
        if (
            len(paired_main) != len(matches)
            and small_component not in NONBIJECTIVE_SEAL_COMPONENTS
        ):
            raise RuntimeError(
                f"ID101 seal component {small_component} does not map one-to-one "
                f"onto main component {main_component}"
            )
        if len(paired_main) < 6:
            raise RuntimeError(
                f"ID101 seal component {small_component} has only "
                f"{len(paired_main)} paired main-shell vertices"
            )
        wall_faces = sorted(
            face for face in components[main_component]
            if set(mesh.polygons[face].vertices).issubset(paired_main)
        )
        if not wall_faces:
            raise RuntimeError(
                f"ID101 seal component {small_component} has no paired tunnel-wall faces"
            )
        overlap = sealed_wall_faces.intersection(wall_faces)
        if overlap:
            raise RuntimeError(f"ID101 seal face reused by multiple repairs: {sorted(overlap)}")
        sealed_wall_faces.update(wall_faces)
        seal_details.append({
            "small_component": small_component,
            "main_component": main_component,
            "small_vertices": len(small_vertices),
            "paired_main_vertices": len(paired_main),
            "maximum_pair_distance": round(max(distance for _small, _main, distance in matches), 9),
            "removed_tunnel_faces": wall_faces,
        })

    forced_flat_faces = set()
    flat_details = []
    for small_component in flat_components:
        main_component = REPAIR_TO_MAIN[small_component]
        small_vertices = sorted({
            vertex
            for face in components[small_component]
            for vertex in mesh.polygons[face].vertices
        })
        main_vertices = sorted({
            vertex
            for face in components[main_component]
            for vertex in mesh.polygons[face].vertices
        })
        tree = KDTree(len(main_vertices))
        for vertex in main_vertices:
            tree.insert(mesh.vertices[vertex].co, vertex)
        tree.balance()
        paired_main = {
            tree.find(mesh.vertices[small_vertex].co)[1]
            for small_vertex in small_vertices
        }
        faces = sorted(
            face for face in components[main_component]
            if set(mesh.polygons[face].vertices).issubset(paired_main)
        )
        if not faces:
            raise RuntimeError(f"ID101 flat-normal component {small_component} has no local faces")
        forced_flat_faces.update(faces)
        flat_details.append({
            "small_component": small_component,
            "main_component": main_component,
            "paired_main_vertices": len(paired_main),
            "faces": faces,
        })

    small_faces = [face for index in EXPECTED_SMALL for face in components[index]]
    small_face_set = set(small_faces)
    substantial_faces = [
        face for face in range(len(mesh.polygons)) if face not in small_face_set
    ]
    source_normals, duplicate_normal_keys = capture_normals(mesh)
    repair_bvh = faces_bvh(mesh, small_faces)
    local_repair_faces = []
    local_repair_details = []
    for face in substantial_faces:
        polygon = mesh.polygons[face]
        minimum_dot = min(
            float(polygon.normal.dot(mesh.loops[loop].normal))
            for loop in polygon.loop_indices
        )
        distance = float(repair_bvh.find_nearest(polygon.center)[3])
        if (
            face in alignment_faces
            or face in mirrored_tab_faces
            or face in forced_flat_faces
            or (minimum_dot < args.normal_dot and distance <= args.distance)
        ):
            local_repair_faces.append(face)
            local_repair_details.append(
                {
                    "face": face,
                    "component": next(
                        index for index, faces in enumerate(components) if face in faces
                    ),
                    "center": [round(float(value), 9) for value in polygon.center],
                    "minimum_loop_dot": round(minimum_dot, 9),
                    "distance_to_repair_solid": round(distance, 9),
                }
            )
    sealed_wall_keys = {polygon_key(mesh, mesh.polygons[face]) for face in sealed_wall_faces}
    forced_flat_keys = {polygon_key(mesh, mesh.polygons[face]) for face in forced_flat_faces}
    local_repair_keys = {
        polygon_key(mesh, mesh.polygons[face])
        for face in local_repair_faces
        if face not in sealed_wall_faces
    }

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(
        bm,
        geom=[bm.faces[index] for index in sorted(small_face_set | sealed_wall_faces)],
        context="FACES",
    )
    loose_vertices = [vertex for vertex in bm.verts if not vertex.link_faces]
    if loose_vertices:
        bmesh.ops.delete(bm, geom=loose_vertices, context="VERTS")
    boundary_before_fill = [edge for edge in bm.edges if len(edge.link_faces) == 1]
    fill_result = bmesh.ops.holes_fill(bm, edges=boundary_before_fill, sides=0)
    filled_faces_count = len(fill_result.get("faces", []))
    filled_position_keys = {
        tuple(sorted(position_key(vertex.co) for vertex in face.verts))
        for face in fill_result.get("faces", [])
    }
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    mesh.update(calc_edges=True, calc_edges_loose=True)

    after_delete = topology(mesh)
    expected_after = {
        "vertices": 60078,
        "faces": 120152 - len(sealed_wall_faces) + filled_faces_count,
        "components": 25,
        "boundary_edges": 0,
        "nonmanifold_edges": 0,
    }
    if after_delete != expected_after:
        raise RuntimeError(f"Unexpected ID101 topology after local deletions: {after_delete}")

    filled_face_keys = {
        polygon_key(mesh, polygon)
        for polygon in mesh.polygons
        if polygon_key(mesh, polygon) in filled_position_keys
    }
    if len(filled_face_keys) != filled_faces_count:
        raise RuntimeError(
            f"ID101 filled-face identity mismatch: {len(filled_face_keys)} vs "
            f"{filled_faces_count}"
        )
    local_repair_keys.update(filled_face_keys)

    filled_face_indices = {
        polygon.index
        for polygon in mesh.polygons
        if polygon_key(mesh, polygon) in filled_face_keys
    }
    filled_uv_loops = 0
    filled_uv_missing = 0
    filled_uv_conflicts = 0
    if mesh.uv_layers.active is not None:
        uv_data = mesh.uv_layers.active.data
        edge_faces = defaultdict(list)
        for polygon in mesh.polygons:
            for edge_key in polygon.edge_keys:
                edge_faces[edge_key].append(polygon.index)
        for face_index in sorted(filled_face_indices):
            polygon = mesh.polygons[face_index]
            for loop_index in polygon.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                candidates = []
                for edge_key in polygon.edge_keys:
                    if vertex_index not in edge_key:
                        continue
                    for neighbor_index in edge_faces[edge_key]:
                        if neighbor_index == face_index or neighbor_index in filled_face_indices:
                            continue
                        neighbor = mesh.polygons[neighbor_index]
                        for neighbor_loop in neighbor.loop_indices:
                            if mesh.loops[neighbor_loop].vertex_index == vertex_index:
                                candidates.append(uv_data[neighbor_loop].uv.copy())
                if not candidates:
                    filled_uv_missing += 1
                    continue
                reference = candidates[0]
                if any((candidate - reference).length > 1e-5 for candidate in candidates[1:]):
                    filled_uv_conflicts += 1
                uv_data[loop_index].uv = reference
                filled_uv_loops += 1

    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = True
    mesh.calc_normals_split()
    final_normals = [loop.normal.copy() for loop in mesh.loops]
    restored_faces = 0
    locally_rebuilt_faces = 0
    missing_source_faces = 0
    repaired_loop_dots = []
    for polygon in mesh.polygons:
        key = polygon_key(mesh, polygon)
        source_face = source_normals.get(key)
        if key in local_repair_keys:
            locally_rebuilt_faces += 1
            if args.local_normal_mode == "flat" or key in forced_flat_keys:
                for loop in polygon.loop_indices:
                    final_normals[loop] = polygon.normal.copy()
                    repaired_loop_dots.append(1.0)
        elif source_face is not None:
            restored_faces += 1
            for loop in polygon.loop_indices:
                vertex_key = position_key(mesh.vertices[mesh.loops[loop].vertex_index].co)
                normal = source_face.get(vertex_key)
                if normal is not None and normal.length_squared >= 0.25:
                    final_normals[loop] = normal
        else:
            missing_source_faces += 1
    mesh.normals_split_custom_set(final_normals)
    mesh.update()

    if locally_rebuilt_faces != len(local_repair_keys):
        raise RuntimeError(
            f"ID101 local-normal face mismatch: {locally_rebuilt_faces} vs "
            f"{len(local_repair_keys)}"
        )
    if missing_source_faces != 0:
        raise RuntimeError(f"ID101 lost source normal records for {missing_source_faces} faces")
    final = topology(mesh)
    if final != expected_after:
        raise RuntimeError(f"ID101 final topology changed unexpectedly: {final}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "inspect all 28 <=24-face auxiliary repair solids individually; "
            "replace the 21 confirmed tunnel plugs with manifold inner/outer caps, "
            "discard the remaining floating patches while retaining their healthy "
            "underlying shells, mirror the intact waist tab onto its corrupted peer, "
            "and force only the four verified sharp fold faces flat; preserve the "
            "other 25 authored closed garment/detail components and restore their "
            "source split normals exactly"
        ),
        "source": source,
        "removed_components": sorted(EXPECTED_SMALL),
        "removed_component_faces": EXPECTED_SMALL,
        "removed_faces": len(small_faces),
        "removed_vertices": source["vertices"] - after_delete["vertices"],
        "mirrored_back_tab": mirror_report,
        "forced_flat_strips": {
            "small_components": flat_components,
            "faces": len(forced_flat_faces),
            "details": flat_details,
        },
        "sealed_tunnels": {
            "small_components": seal_components,
            "removed_wall_faces": len(sealed_wall_faces),
            "boundary_edges_before_fill": len(boundary_before_fill),
            "filled_faces": filled_faces_count,
            "face_orientation_recalculated": True,
            "uv_boundary_stitch": {
                "assigned_loops": filled_uv_loops,
                "missing_loops": filled_uv_missing,
                "conflicting_boundary_values": filled_uv_conflicts,
            },
            "details": seal_details,
        },
        "vertex_alignment": {
            "small_components": align_components,
            "main_components": sorted({REPAIR_TO_MAIN[index] for index in align_components}),
            "vertices": len(aligned_vertices),
            "incident_faces": len(alignment_faces),
            "details": alignment_details,
        },
        "normal_selection": {
            "distance": args.distance,
            "minimum_dot": args.normal_dot,
            "mode": args.local_normal_mode,
            "faces": len(local_repair_faces),
            "components": dict(
                sorted(Counter(row["component"] for row in local_repair_details).items())
            ),
            "details": local_repair_details,
        },
        "normal_restore": {
            "source_duplicate_face_keys": duplicate_normal_keys,
            "unchanged_faces_restored": restored_faces,
            "local_faces_rebuilt": locally_rebuilt_faces,
            "missing_source_faces": missing_source_faces,
        },
        "after_delete": after_delete,
        "final": final,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    export_glb(args.output, args.position_quantization)
    print(json.dumps({key: value for key, value in report.items() if key != "normal_selection"}, indent=2))
    print(json.dumps({"normal_selection": {key: value for key, value in report["normal_selection"].items() if key != "details"}}, indent=2))


if __name__ == "__main__":
    main()

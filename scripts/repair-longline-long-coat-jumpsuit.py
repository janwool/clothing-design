#!/usr/bin/env python3
"""Repair the mislabeled longline-coat asset as its actual long jumpsuit.

The source is already watertight. Its visible damage is model-specific:

* two vertices in the left front ankle panel were pulled far away from their
  one-rings, producing two long triangular fans;
* ten tiny closed solids sit on top of otherwise complete wrist/ankle/leg
  surfaces and are residual export debris.
* the three other ankle panels have shallow local compression, while the
  right-back sleeve panel folds into itself immediately above its cuff.

This script deliberately does not merge, remesh, decimate, or globally smooth
the garment. Legitimate cuffs, collar pieces, pockets, plackets, and authored
folds remain separate and untouched.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


MICRO_COMPONENTS = {
    4: {"faces": 12, "center": (-3.770020, 2.679185, 0.142559), "role": "left wrist debris"},
    7: {"faces": 12, "center": (3.328981, 3.010333, 0.068615), "role": "right wrist debris"},
    14: {"faces": 12, "center": (-1.338409, -6.148857, -0.401789), "role": "left rear ankle debris"},
    16: {"faces": 12, "center": (1.381412, -6.230897, -0.435245), "role": "right rear ankle debris"},
    18: {"faces": 12, "center": (0.580180, -6.112418, -0.060839), "role": "right inner ankle debris"},
    20: {"faces": 12, "center": (-0.558060, -6.050194, -0.080870), "role": "left inner ankle debris"},
    25: {"faces": 8, "center": (1.948541, -4.720947, -0.354704), "role": "right lower-leg debris"},
    27: {"faces": 8, "center": (3.351737, 3.019263, 0.007411), "role": "right wrist debris A"},
    28: {"faces": 8, "center": (3.353579, 3.023474, 0.008463), "role": "right wrist debris B"},
    30: {"faces": 8, "center": (-3.794378, 2.685307, 0.083729), "role": "left wrist debris"},
}


OUTLIER_VERTICES = {
    5119: {
        "coordinate": (-1.609845, -5.662683, 0.117677),
        "neighbors": {5044, 5118, 5120, 5285, 5286, 5287},
        "role": "upper left-ankle triangular fan",
    },
    5721: {
        "coordinate": (-0.700347, -6.245330, 0.716904),
        "neighbors": {5585, 5720, 5722, 5848, 5849, 5850},
        "role": "lower left-ankle triangular fan",
    },
}


LOCAL_REPAIRS = (
    {
        "role": "mild ankle decompression on the three unaffected main panels",
        "target": (0.0, -6.1, 0.0),
        "radius": 2.4,
        "inner_radius": 1.55,
        "component_face_counts": {8872, 8760, 8336},
        "factor": 0.07,
        "iterations": 3,
    },
    {
        "role": "right wrist fold relaxation on the right-back panel",
        "target": (4.0, 3.65, 0.2),
        "radius": 1.4,
        "inner_radius": 0.75,
        "component_face_counts": {8760},
        "factor": 0.16,
        "iterations": 6,
    },
)


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


def component_center(mesh: bpy.types.Mesh, face_indices: list[int]) -> Vector:
    vertex_indices = {
        vertex_index
        for face_index in face_indices
        for vertex_index in mesh.polygons[face_index].vertices
    }
    center = Vector((0.0, 0.0, 0.0))
    for vertex_index in vertex_indices:
        center += mesh.vertices[vertex_index].co
    return center / len(vertex_indices)


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def relax_local_region(obj: bpy.types.Object, repair: dict[str, object]) -> dict[str, object]:
    """Apply one validated, face-count-addressed local Laplacian repair."""
    mesh = obj.data
    components = face_components(mesh)
    requested_counts = set(repair["component_face_counts"])
    matched = [
        (index, faces)
        for index, faces in enumerate(components)
        if len(faces) in requested_counts
    ]
    actual_counts = {len(faces) for _, faces in matched}
    if actual_counts != requested_counts or len(matched) != len(requested_counts):
        raise RuntimeError(
            f"Could not uniquely identify panels for {repair['role']}: "
            f"expected face counts {sorted(requested_counts)}, got {sorted(actual_counts)}"
        )

    allowed_vertices = {
        vertex_index
        for _, faces in matched
        for face_index in faces
        for vertex_index in mesh.polygons[face_index].vertices
    }
    target = Vector(repair["target"])
    radius = float(repair["radius"])
    inner_radius = float(repair["inner_radius"])
    group = obj.vertex_groups.new(name=f"Local repair {repair['role']}")
    selected: list[int] = []
    weights: list[float] = []
    before: dict[int, Vector] = {}
    for vertex_index in sorted(allowed_vertices):
        vertex = mesh.vertices[vertex_index]
        distance = (vertex.co - target).length
        if distance >= radius:
            continue
        weight = (
            1.0
            if distance <= inner_radius
            else smoothstep((radius - distance) / (radius - inner_radius))
        )
        if weight <= 1e-6:
            continue
        group.add([vertex_index], weight, "REPLACE")
        selected.append(vertex_index)
        weights.append(weight)
        before[vertex_index] = vertex.co.copy()
    if not selected:
        raise RuntimeError(f"Local repair selected no vertices: {repair['role']}")

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(f"Local repair {repair['role']}", "LAPLACIANSMOOTH")
    modifier.vertex_group = group.name
    modifier.lambda_factor = float(repair["factor"])
    modifier.lambda_border = 0.0
    modifier.iterations = int(repair["iterations"])
    modifier.use_volume_preserve = True
    modifier.use_normalized = True
    modifier.use_x = True
    modifier.use_y = True
    modifier.use_z = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    displacements = [(mesh.vertices[index].co - before[index]).length for index in selected]
    if obj.vertex_groups.get(group.name) is not None:
        obj.vertex_groups.remove(obj.vertex_groups[group.name])
    mesh.update(calc_edges=True, calc_edges_loose=True)
    return {
        "role": repair["role"],
        "target": [round(float(value), 6) for value in target],
        "radius": radius,
        "inner_radius": inner_radius,
        "component_face_counts": sorted(requested_counts),
        "matched_component_indices": [index for index, _ in matched],
        "selected_vertices": len(selected),
        "weight_min": round(min(weights), 8),
        "weight_max": round(max(weights), 8),
        "factor": float(repair["factor"]),
        "iterations": int(repair["iterations"]),
        "mean_displacement": round(sum(displacements) / len(displacements), 9),
        "max_displacement": round(max(displacements), 9),
    }


def validate_source(mesh: bpy.types.Mesh, components: list[list[int]]) -> None:
    if len(mesh.vertices) != 19870 or len(mesh.polygons) != 39616:
        raise RuntimeError(
            f"Unexpected source topology: {len(mesh.vertices)} vertices / "
            f"{len(mesh.polygons)} faces"
        )
    if len(components) != 32:
        raise RuntimeError(f"Expected 32 source components, got {len(components)}")

    for component_index, expected in MICRO_COMPONENTS.items():
        faces = components[component_index]
        center = component_center(mesh, faces)
        expected_center = Vector(expected["center"])
        if len(faces) != expected["faces"] or (center - expected_center).length > 2e-4:
            raise RuntimeError(
                f"Component {component_index} no longer matches {expected['role']}: "
                f"faces={len(faces)}, center={tuple(round(value, 6) for value in center)}"
            )

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    for vertex_index, expected in OUTLIER_VERTICES.items():
        vertex = mesh.vertices[vertex_index]
        if (vertex.co - Vector(expected["coordinate"])).length > 2e-4:
            raise RuntimeError(
                f"Vertex {vertex_index} no longer matches {expected['role']}: "
                f"coordinate={tuple(round(value, 6) for value in vertex.co)}"
            )
        bm_vertex = bm.verts[vertex_index]
        actual_neighbors = {edge.other_vert(bm_vertex).index for edge in bm_vertex.link_edges}
        if actual_neighbors != expected["neighbors"]:
            bm.free()
            raise RuntimeError(
                f"Vertex {vertex_index} neighbors changed: "
                f"expected={sorted(expected['neighbors'])}, got={sorted(actual_neighbors)}"
            )
    bm.free()


def repair_mesh(obj: bpy.types.Object, components: list[list[int]]) -> dict[str, object]:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    outlier_report = []
    for vertex_index, expected in OUTLIER_VERTICES.items():
        vertex = bm.verts[vertex_index]
        neighbor_vertices = sorted(
            (edge.other_vert(vertex) for edge in vertex.link_edges),
            key=lambda item: item.index,
        )
        before = vertex.co.copy()
        target = sum((neighbor.co for neighbor in neighbor_vertices), Vector()) / len(neighbor_vertices)
        vertex.co = target
        outlier_report.append(
            {
                "vertex": vertex_index,
                "role": expected["role"],
                "before": [round(float(value), 9) for value in before],
                "after": [round(float(value), 9) for value in target],
                "displacement": round(float((target - before).length), 9),
                "neighbor_vertices": [neighbor.index for neighbor in neighbor_vertices],
            }
        )

    faces_to_delete = {
        bm.faces[face_index]
        for component_index in MICRO_COMPONENTS
        for face_index in components[component_index]
    }
    vertices_to_delete = {vertex for face in faces_to_delete for vertex in face.verts}
    debris_report = [
        {
            "component": component_index,
            "role": MICRO_COMPONENTS[component_index]["role"],
            "faces": len(components[component_index]),
        }
        for component_index in sorted(MICRO_COMPONENTS)
    ]
    bmesh.ops.delete(bm, geom=list(vertices_to_delete), context="VERTS")
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

    local_reports = [relax_local_region(obj, repair) for repair in LOCAL_REPAIRS]
    mesh.validate(verbose=False, clean_customdata=True)
    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    return {
        "method": (
            "two one-ring outlier projections, ten individually verified debris removals, "
            "and two panel-specific local volume-preserving relaxations"
        ),
        "outlier_repairs": outlier_report,
        "removed_components": debris_report,
        "removed_faces": sum(row["faces"] for row in debris_report),
        "local_repairs": local_reports,
        "remaining_vertices": len(mesh.vertices),
        "remaining_faces": len(mesh.polygons),
    }


def topology_report(mesh: bpy.types.Mesh) -> dict[str, int | float]:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    signed_volume = sum(face.calc_area() * face.calc_center_median().dot(face.normal) for face in bm.faces) / 3.0
    report = {
        "vertices": len(bm.verts),
        "edges": len(bm.edges),
        "faces": len(bm.faces),
        "boundary_edges": boundary,
        "non_manifold_edges": non_manifold,
        "signed_volume": round(float(signed_volume), 9),
    }
    bm.free()
    return report


def export_glb(path: Path, position_quantization: int) -> None:
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
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--position-quantization", type=int, default=22)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next((item for item in bpy.context.scene.objects if item.type == "MESH"), None)
    if obj is None:
        raise RuntimeError("No mesh object found")

    mesh = obj.data
    components = face_components(mesh)
    before = topology_report(mesh)
    validate_source(mesh, components)
    repair = repair_mesh(obj, components)
    after = topology_report(mesh)
    if after["boundary_edges"] != 0 or after["non_manifold_edges"] != 0:
        raise RuntimeError(f"Repair broke watertight topology: {after}")

    export_glb(args.output, args.position_quantization)
    report = {
        "input": str(args.input),
        "output": str(args.output),
        "position_quantization": args.position_quantization,
        "before": before,
        "after_before_export": after,
        "repair": repair,
    }
    report_path = args.report or args.output.with_suffix(".report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector


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


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def relax_region(
    obj: bpy.types.Object,
    target: Vector,
    radius: float,
    inner_radius: float,
    component_indices: set[int],
    factor: float,
    iterations: int,
    method: str,
    clear_custom_normals: bool,
) -> dict[str, object]:
    mesh = obj.data
    components = face_components(mesh)
    missing = component_indices - set(range(len(components)))
    if missing:
        raise ValueError(f"Unknown component indices: {sorted(missing)}")

    allowed_vertices = {
        vertex
        for component_index in component_indices
        for face_index in components[component_index]
        for vertex in mesh.polygons[face_index].vertices
    }
    group = obj.vertex_groups.new(name="Local garment repair")
    selected: list[int] = []
    weights: list[float] = []
    before: dict[int, Vector] = {}
    for vertex_index in sorted(allowed_vertices):
        vertex = mesh.vertices[vertex_index]
        distance = (vertex.co - target).length
        if distance >= radius:
            continue
        if distance <= inner_radius:
            weight = 1.0
        else:
            weight = smoothstep((radius - distance) / (radius - inner_radius))
        if weight <= 1e-6:
            continue
        group.add([vertex_index], weight, "REPLACE")
        selected.append(vertex_index)
        weights.append(weight)
        before[vertex_index] = vertex.co.copy()
    if not selected:
        raise RuntimeError("The requested region selected no vertices")

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if method == "laplacian":
        modifier = obj.modifiers.new("Local volume-preserving repair", "LAPLACIANSMOOTH")
        modifier.vertex_group = group.name
        modifier.lambda_factor = factor
        modifier.lambda_border = 0.0
        modifier.iterations = iterations
        modifier.use_volume_preserve = True
        modifier.use_normalized = True
        modifier.use_x = True
        modifier.use_y = True
        modifier.use_z = True
    else:
        modifier = obj.modifiers.new("Local direct surface repair", "SMOOTH")
        modifier.vertex_group = group.name
        modifier.factor = factor
        modifier.iterations = iterations
        modifier.use_x = True
        modifier.use_y = True
        modifier.use_z = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    displacements = [(mesh.vertices[index].co - before[index]).length for index in selected]
    # Blender 3.1 can consume the temporary vertex group while applying a
    # Laplacian Smooth modifier. Removing the stale Python reference then
    # raises even though the group is already gone.
    try:
        obj.vertex_groups.remove(group)
    except RuntimeError:
        pass
    mesh.validate(verbose=False, clean_customdata=True)
    if clear_custom_normals and mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    return {
        "target": [round(float(value), 6) for value in target],
        "radius": radius,
        "inner_radius": inner_radius,
        "components": sorted(component_indices),
        "selected_vertices": len(selected),
        "weight_min": round(min(weights), 8),
        "weight_max": round(max(weights), 8),
        "factor": factor,
        "iterations": iterations,
        "method": method,
        "mean_displacement": round(sum(displacements) / len(displacements), 9),
        "max_displacement": round(max(displacements), 9),
        "clear_custom_normals": clear_custom_normals,
    }


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
    parser = argparse.ArgumentParser(
        description="Relax one explicitly selected garment region without smoothing the rest of the model."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--target", required=True, help="Mesh-local x,y,z center")
    parser.add_argument("--radius", type=float, required=True)
    parser.add_argument("--inner-radius", type=float, default=0.0)
    parser.add_argument("--components", required=True, help="Connected component indices, comma separated")
    parser.add_argument("--factor", type=float, default=0.16)
    parser.add_argument("--iterations", type=int, default=6)
    parser.add_argument("--method", choices=("laplacian", "simple"), default="laplacian")
    parser.add_argument("--position-quantization", type=int, default=22)
    parser.add_argument("--clear-custom-normals", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    target_values = tuple(float(value) for value in args.target.split(","))
    if len(target_values) != 3:
        raise ValueError("--target must contain x,y,z")
    if not 0.0 <= args.inner_radius < args.radius:
        raise ValueError("--inner-radius must be non-negative and smaller than --radius")
    component_indices = {int(value) for value in args.components.split(",") if value.strip()}
    if not component_indices:
        raise ValueError("--components must not be empty")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    obj = next((item for item in bpy.context.scene.objects if item.type == "MESH"), None)
    if obj is None:
        raise RuntimeError("No mesh object found")
    report = relax_region(
        obj,
        Vector(target_values),
        args.radius,
        args.inner_radius,
        component_indices,
        args.factor,
        args.iterations,
        args.method,
        args.clear_custom_normals,
    )
    export_glb(args.output, args.position_quantization)
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "position_quantization": args.position_quantization,
                "repair": report,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

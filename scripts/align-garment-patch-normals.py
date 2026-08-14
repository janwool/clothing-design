#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components, visited = [], set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue, component = deque([polygon.index]), []
        visited.add(polygon.index)
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def align_object(
    obj: bpy.types.Object,
    max_faces: int,
    snap_to_shell: bool = False,
    surface_offset_ratio: float = 0.0,
    smooth_all: bool = False,
) -> dict[str, object]:
    mesh = obj.data
    components = face_components(mesh)
    main_faces = [face for component in components if len(component) > max_faces for face in component]
    patches = [component for component in components if len(component) <= max_faces]
    if not main_faces or not patches:
        return {"object": obj.name, "patches": len(patches), "loops_aligned": 0}

    vertices = [vertex.co.copy() for vertex in mesh.vertices]
    polygons = [list(mesh.polygons[index].vertices) for index in main_faces]
    bvh = BVHTree.FromPolygons(vertices, polygons, all_triangles=True)
    mesh.calc_normals_split()
    custom_normals = [loop.normal.copy() for loop in mesh.loops]
    loops_aligned = 0
    maximum_distance = 0.0
    maximum_normal_correction = 0.0
    bounds = [vertex.co for vertex in mesh.vertices]
    diagonal = (Vector((max(co.x for co in bounds), max(co.y for co in bounds), max(co.z for co in bounds))) -
                Vector((min(co.x for co in bounds), min(co.y for co in bounds), min(co.z for co in bounds)))).length
    surface_offset = diagonal * surface_offset_ratio

    for component in patches:
        component_vertices = {
            vertex_index for face_index in component for vertex_index in mesh.polygons[face_index].vertices
        }
        center = sum((mesh.vertices[index].co for index in component_vertices), Vector()) / len(component_vertices)
        location, surface_normal, _, distance = bvh.find_nearest(center)
        if surface_normal is None:
            continue
        maximum_distance = max(maximum_distance, distance)
        surface_normal.normalize()
        if snap_to_shell:
            normal_correction = (location - center).dot(surface_normal) + surface_offset
            maximum_normal_correction = max(maximum_normal_correction, abs(normal_correction))
            correction = surface_normal * normal_correction
            for vertex_index in component_vertices:
                mesh.vertices[vertex_index].co += correction
        for face_index in component:
            for loop_index in mesh.polygons[face_index].loop_indices:
                # The repair components sit directly over a missing section of the
                # garment shell. Match the nearest intact shell normal explicitly;
                # preserving the patch's imported sign can keep a flipped repair
                # triangle dark in realtime viewers even when the material is
                # double-sided.
                custom_normals[loop_index] = surface_normal
                loops_aligned += 1

    if smooth_all:
        if mesh.has_custom_normals:
            mesh.free_normals_split()
        mesh.use_auto_smooth = False
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    else:
        mesh.use_auto_smooth = True
        mesh.normals_split_custom_set(custom_normals)
    mesh.update()
    return {
        "object": obj.name,
        "patches": len(patches),
        "loops_aligned": loops_aligned,
        "maximum_surface_distance": maximum_distance,
        "maximum_normal_correction": maximum_normal_correction,
        "surface_offset": surface_offset,
        "smooth_all": smooth_all,
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_texcoords=True,
        export_normals=True, export_materials="EXPORT", export_apply=False,
        export_yup=True, export_image_format="AUTO",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Align tiny repair-patch normals to the nearest garment surface.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-faces", type=int, default=99)
    parser.add_argument("--snap-to-shell", action="store_true")
    parser.add_argument("--surface-offset-ratio", type=float, default=0.00012)
    parser.add_argument("--smooth-all", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    reports = [
        align_object(
            obj,
            args.max_faces,
            snap_to_shell=args.snap_to_shell,
            surface_offset_ratio=args.surface_offset_ratio,
            smooth_all=args.smooth_all,
        )
        for obj in objects
    ]
    export_glb(args.output)
    print(json.dumps({"input": str(args.input), "output": str(args.output), "objects": reports}, indent=2))


if __name__ == "__main__":
    main()

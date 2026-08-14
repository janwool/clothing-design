#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def parse_points(value: str) -> list[Vector]:
    points = [
        Vector(tuple(float(coordinate) for coordinate in item.split(",")))
        for item in value.split(";")
        if item.strip()
    ]
    if len(points) < 3 or any(len(point) != 3 for point in points):
        raise ValueError("--points requires at least three semicolon-separated x,y,z points")
    return points


def export_glb(path: Path) -> None:
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
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def patch_object(
    obj: bpy.types.Object,
    points: list[Vector],
    offset: float,
    thickness: float,
) -> dict[str, object]:
    mesh = obj.data
    normal = Vector()
    for polygon in mesh.polygons:
        center = polygon.center
        if min((center - point).length for point in points) < 0.2:
            normal += polygon.normal * polygon.area
    if normal.length_squared == 0:
        normal = (points[1] - points[0]).cross(points[2] - points[0])
    normal.normalize()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    front_vertices = [bm.verts.new(point + normal * offset) for point in points]
    back_vertices = [
        bm.verts.new(point + normal * (offset - thickness))
        for point in points
    ]
    vertices = [*front_vertices, *back_vertices]
    bm.verts.index_update()
    faces = []
    for index in range(1, len(front_vertices) - 1):
        face = bm.faces.new((front_vertices[0], front_vertices[index], front_vertices[index + 1]))
        if face.normal.dot(normal) < 0:
            face.normal_flip()
        face.smooth = True
        faces.append(face)
        back_face = bm.faces.new((back_vertices[0], back_vertices[index], back_vertices[index + 1]))
        if back_face.normal.dot(normal) > 0:
            back_face.normal_flip()
        back_face.smooth = True
        faces.append(back_face)
    for index in range(len(points)):
        next_index = (index + 1) % len(points)
        side = bm.faces.new((
            front_vertices[index],
            front_vertices[next_index],
            back_vertices[next_index],
            back_vertices[index],
        ))
        side.smooth = True
        faces.append(side)

    uv_center = Vector((0.5, 0.5))
    uv_radius = 0.008
    for face in faces:
        for loop in face.loops:
            point_index = vertices.index(loop.vert) % len(points)
            angle = 6.283185307179586 * point_index / len(points)
            loop[uv_layer].uv = uv_center + Vector((
                uv_radius * math.cos(angle),
                uv_radius * math.sin(angle),
            ))

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)
    return {
        "object": obj.name,
        "vertices_added": len(vertices),
        "faces_added": len(faces),
        "normal": list(normal),
        "offset": offset,
        "thickness": thickness,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Cover a tiny view gap with a local garment-surface patch.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--points", required=True)
    parser.add_argument("--offset", type=float, default=0.002)
    parser.add_argument("--thickness", type=float, default=0.001)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    report = patch_object(obj, parse_points(args.points), args.offset, args.thickness)
    export_glb(args.output)
    print(json.dumps({"input": str(args.input), "output": str(args.output), **report}, indent=2))


if __name__ == "__main__":
    main()

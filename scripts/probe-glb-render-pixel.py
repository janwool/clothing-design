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
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], world[axis])
                maximum[axis] = max(maximum[axis], world[axis])
    return (minimum + maximum) * 0.5, maximum - minimum


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Ray-cast a QA-render pixel back to a GLB face index.")
    parser.add_argument("input", type=Path)
    parser.add_argument("x", type=float)
    parser.add_argument("y", type=float)
    parser.add_argument("--width", type=int, default=1200)
    parser.add_argument("--height", type=int, default=1500)
    parser.add_argument("--target-local", help="Override the QA target with mesh-local x,y,z")
    parser.add_argument(
        "--target-scale",
        type=float,
        default=0.08,
        help="Scale the model-wide camera span when --target-local is used",
    )
    parser.add_argument(
        "--view",
        choices=("front", "back", "left", "right", "cover", "closeup"),
        default="closeup",
    )
    parser.add_argument("--compact", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    center, size = bounds(objects)
    largest = max(size)

    view = {
        "front": (Vector((0, -1, 0.08)), 1.18, 0.0),
        "back": (Vector((0, 1, 0.08)), 1.18, 0.0),
        "left": (Vector((-1, 0, 0.08)), 1.18, 0.0),
        "right": (Vector((1, 0, 0.08)), 1.18, 0.0),
        "cover": (Vector((-0.42, -1, 0.16)), 1.18, 0.0),
        "closeup": (Vector((-0.2, -1.0, 0.06)), 0.56, 0.18),
    }[args.view]
    direction, ortho_scale, target_height = view
    direction.normalize()
    if args.target_local:
        values = tuple(float(value) for value in args.target_local.split(","))
        if len(values) != 3:
            raise ValueError("--target-local must contain x,y,z")
        target = objects[0].matrix_world @ Vector(values)
        largest *= args.target_scale
        ortho_scale = 1.18
    else:
        target = center + Vector((0, 0, largest * target_height))
    camera_data = bpy.data.cameras.new("Probe Camera")
    camera = bpy.data.objects.new("Probe Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = target + direction * largest * 2.3
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = largest * ortho_scale
    look_at(camera, target)
    bpy.context.scene.camera = camera
    bpy.context.scene.render.resolution_x = args.width
    bpy.context.scene.render.resolution_y = args.height
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()

    u = args.x / args.width
    v = args.y / args.height
    aspect = args.width / args.height
    local_origin = Vector((
        (u - 0.5) * camera.data.ortho_scale * aspect,
        (0.5 - v) * camera.data.ortho_scale,
        -1.0,
    ))
    origin = camera.matrix_world @ local_origin
    ray_direction = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))

    obj = objects[0]
    inverse = obj.matrix_world.inverted()
    local_origin = inverse @ origin
    local_direction = (inverse.to_3x3() @ ray_direction).normalized()
    hit, location, normal, face_index = obj.ray_cast(local_origin, local_direction)
    components = face_components(obj.data)
    face_component = {
        component_face: component_index
        for component_index, component in enumerate(components)
        for component_face in component
    }
    component_index = face_component.get(face_index) if hit else None
    light_occluders = []
    if hit:
        light_positions = {
            "key": center + Vector((-largest * 1.4, -largest * 1.7, largest * 2.2)),
            "fill": center + Vector((largest * 1.5, -largest * 1.25, largest * 1.15)),
            "rim": center + Vector((largest * 0.4, largest * 1.8, largest * 1.7)),
        }
        inverse = obj.matrix_world.inverted()
        for light_name, light_world in light_positions.items():
            light_local = inverse @ light_world
            to_light = light_local - location
            light_distance = to_light.length
            light_direction = to_light.normalized()
            shadow_hit, shadow_location, _, shadow_face = obj.ray_cast(
                location + light_direction * 0.0005,
                light_direction,
                distance=max(light_distance - 0.0005, 0.0),
            )
            light_occluders.append({
                "light": light_name,
                "hit": shadow_hit,
                "face_index": shadow_face if shadow_hit else None,
                "component_index": face_component.get(shadow_face) if shadow_hit else None,
                "component_faces": len(components[face_component[shadow_face]]) if shadow_hit else None,
                "distance": (shadow_location - location).length if shadow_hit else None,
            })
    nearby_small_components = []
    if hit:
        for index, component in enumerate(components):
            if len(component) > 99:
                continue
            vertex_indices = {
                vertex_index
                for component_face in component
                for vertex_index in obj.data.polygons[component_face].vertices
            }
            distance = min((obj.data.vertices[index].co - location).length for index in vertex_indices)
            nearby_small_components.append({
                "component_index": index,
                "faces": len(component),
                "minimum_vertex_distance": distance,
            })
        nearby_small_components.sort(key=lambda row: row["minimum_vertex_distance"])
    neighboring_faces = []
    polygon_vertex_details = []
    interpolated_uv = None
    if hit:
        hit_polygon = obj.data.polygons[face_index]
        uv_layer = obj.data.uv_layers.active
        if uv_layer is not None and len(hit_polygon.loop_indices) == 3:
            positions = [obj.data.vertices[index].co for index in hit_polygon.vertices]
            uvs = [uv_layer.data[index].uv.to_3d() for index in hit_polygon.loop_indices]
            interpolated_uv = list(
                barycentric_transform(location, *positions, *uvs)[:2]
            )
        hit_edges = set(hit_polygon.edge_keys)
        for polygon in obj.data.polygons:
            if polygon.index != face_index and hit_edges.intersection(polygon.edge_keys):
                neighboring_faces.append({
                    "face_index": polygon.index,
                    "area": polygon.area,
                    "normal": list(polygon.normal),
                })
        for vertex_index in hit_polygon.vertices:
            adjacent_vertices = {
                other_vertex
                for edge in obj.data.edges
                if vertex_index in edge.vertices
                for other_vertex in edge.vertices
                if other_vertex != vertex_index
            }
            polygon_vertex_details.append({
                "vertex_index": vertex_index,
                "coordinate": list(obj.data.vertices[vertex_index].co),
                "normal": list(obj.data.vertices[vertex_index].normal),
                "adjacent_vertices": [
                    {"vertex_index": index, "coordinate": list(obj.data.vertices[index].co)}
                    for index in sorted(adjacent_vertices)
                ],
            })
    payload = {
        "hit": hit,
        "pixel": [args.x, args.y],
        "bounds_center": list(center),
        "bounds_size": list(size),
        "camera_location": list(camera.location),
        "ray_origin": list(origin),
        "ray_direction": list(ray_direction),
        "location": list(obj.matrix_world @ location) if hit else None,
        "local_location": list(location) if hit else None,
        "normal": list(normal) if hit else None,
        "face_index": face_index if hit else None,
        "component_index": component_index,
        "component_faces": len(components[component_index]) if component_index is not None else None,
        "light_occluders": light_occluders,
        "object": obj.name if obj else None,
        "polygon_vertices": list(obj.data.polygons[face_index].vertices) if hit else None,
        "polygon_vertex_details": polygon_vertex_details,
        "polygon_area": obj.data.polygons[face_index].area if hit else None,
        "interpolated_uv": interpolated_uv,
        "neighboring_faces": neighboring_faces,
        "nearby_small_components": nearby_small_components[:8],
    }
    if args.compact:
        payload = {
            key: payload[key]
            for key in (
                "hit", "pixel", "location", "local_location", "normal",
                "face_index", "component_index", "component_faces", "interpolated_uv",
            )
        }
    print(json.dumps(payload, indent=2), flush=True)


if __name__ == "__main__":
    main()

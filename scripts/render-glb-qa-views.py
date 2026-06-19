#!/usr/bin/env python3
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_clay_material(objects: list[bpy.types.Object]) -> None:
    mat = bpy.data.materials.new("QA matte white")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.92, 0.92, 0.9, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.68
    mat.use_backface_culling = False
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector, Vector]:
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world[axis])
                maxs[axis] = max(maxs[axis], world[axis])
    center = (mins + maxs) * 0.5
    size = maxs - mins
    return center, size, maxs


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_scene(objects: list[bpy.types.Object]) -> tuple[Vector, float]:
    center, size, _ = bounds(objects)
    largest = max(size.x, size.y, size.z)

    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.eevee.taa_render_samples = 32
    bpy.context.scene.render.resolution_x = 1200
    bpy.context.scene.render.resolution_y = 1400
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.render.film_transparent = True

    light_data = bpy.data.lights.new("Key", "AREA")
    light = bpy.data.objects.new("Key", light_data)
    bpy.context.collection.objects.link(light)
    light.location = center + Vector((-largest * 1.4, -largest * 1.7, largest * 2.2))
    light.data.energy = 520
    light.data.size = largest * 1.7

    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill = bpy.data.objects.new("Fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = center + Vector((largest * 1.8, largest * 1.2, largest * 1.3))
    fill.data.energy = 90
    fill.data.size = largest * 2.5

    return center, largest


def render_view(output: Path, center: Vector, largest: float, name: str, direction: Vector) -> None:
    cam_data = bpy.data.cameras.new(f"Camera {name}")
    camera = bpy.data.objects.new(f"Camera {name}", cam_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + direction.normalized() * largest * 2.3
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = largest * 1.18
    look_at(camera, center)
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(output / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    glb = Path(argv[0])
    output = Path(argv[1]) if len(argv) > 1 else Path("/tmp/glb-qa-views")
    output.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    set_clay_material(objects)
    center, largest = setup_scene(objects)

    views = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "left": Vector((-1, 0, 0.08)),
        "right": Vector((1, 0, 0.08)),
        "top-oblique": Vector((0.3, -1, 0.55)),
    }
    for name, direction in views.items():
        render_view(output, center, largest, name, direction)
    print(f"rendered={output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import math
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
RENDER_STANDARD_PATH = ROOT / "public/config/design3d-render-standard.json"


def load_render_standard() -> dict:
    return json.loads(RENDER_STANDARD_PATH.read_text(encoding="utf-8"))


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


def tune_fabric_materials(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        for material in obj.data.materials:
            if not material or not material.use_nodes:
                continue
            bsdf = next(
                (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
                None,
            )
            if not bsdf:
                continue
            if "Sheen" in bsdf.inputs:
                bsdf.inputs["Sheen"].default_value = 0.24
            if "Sheen Tint" in bsdf.inputs:
                bsdf.inputs["Sheen Tint"].default_value = 0.18
            if "Specular" in bsdf.inputs:
                bsdf.inputs["Specular"].default_value = 0.28


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


def setup_scene(
    objects: list[bpy.types.Object],
    keep_material: bool,
    light_multiplier: float,
) -> tuple[Vector, float]:
    standard = load_render_standard()
    center, size, _ = bounds(objects)
    largest = max(size.x, size.y, size.z)

    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.eevee.taa_render_samples = 32
    bpy.context.scene.render.resolution_x = int(standard["output"]["width"])
    bpy.context.scene.render.resolution_y = int(standard["output"]["height"])
    bpy.context.scene.view_settings.view_transform = standard["colorManagement"]["viewTransform"] if keep_material else "Filmic"
    bpy.context.scene.view_settings.look = standard["colorManagement"]["look"]
    bpy.context.scene.view_settings.exposure = float(standard["colorManagement"]["exposure"]) if keep_material else 0.0
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.eevee.use_gtao = True
    bpy.context.scene.eevee.gtao_distance = largest * 0.8
    bpy.context.scene.eevee.gtao_factor = 0.75

    world = bpy.context.scene.world or bpy.data.worlds.new("Studio World")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        ambient = standard["ambient"]
        background.inputs["Color"].default_value = (*ambient["color"], 1.0)
        background.inputs["Strength"].default_value = float(ambient["strength"]) if keep_material else 0.08

    lights = standard["lights"] if keep_material else [
        {
            "name": "Key",
            "positionScale": [-1.4, -1.7, 2.2],
            "energy": 520,
            "sizeScale": 1.7,
            "color": [1.0, 0.93, 0.84],
        },
        {
            "name": "Fill",
            "positionScale": [1.5, -1.25, 1.15],
            "energy": 90,
            "sizeScale": 2.5,
            "color": [0.82, 0.9, 1.0],
        },
    ]
    normalization = standard.get("lightingNormalization", {})
    reference_bounds = max(float(normalization.get("referenceBounds", largest)), 0.0001)
    standard_multiplier = float(normalization.get("energyMultiplier", 1.0)) if keep_material else 1.0
    scale_compensation = (largest / reference_bounds) ** 2
    for light_config in lights:
        light_data = bpy.data.lights.new(light_config["name"], "AREA")
        light = bpy.data.objects.new(light_config["name"], light_data)
        bpy.context.collection.objects.link(light)
        light.location = center + Vector(tuple(largest * float(value) for value in light_config["positionScale"]))
        light.data.energy = (
            float(light_config["energy"])
            * standard_multiplier
            * scale_compensation
            * light_multiplier
        )
        light.data.size = largest * float(light_config["sizeScale"])
        light.data.color = tuple(float(value) for value in light_config["color"])
        light.data.use_shadow = True
        look_at(light, center)

    return center, largest


def render_view(output: Path, center: Vector, largest: float, name: str, direction: Vector) -> None:
    standard = load_render_standard()
    cam_data = bpy.data.cameras.new(f"Camera {name}")
    camera = bpy.data.objects.new(f"Camera {name}", cam_data)
    bpy.context.collection.objects.link(camera)
    target = center.copy()
    if name == "material-closeup":
        target += Vector((0, 0, largest * 0.18))
    camera.location = target + direction.normalized() * largest * float(standard["camera"]["distanceScale"])
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = largest * (0.56 if name == "material-closeup" else float(standard["camera"]["orthographicScale"]))
    look_at(camera, target)
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(output / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    keep_material = "--keep-material" in argv
    cover_only = "--cover-only" in argv
    closeup_only = "--closeup-only" in argv
    front_only = "--front-only" in argv
    frame = next((int(arg.split("=", 1)[1]) for arg in argv if arg.startswith("--frame=")), 1)
    view_only = next((arg.split("=", 1)[1] for arg in argv if arg.startswith("--view=")), None)
    target_local_arg = next((arg.split("=", 1)[1] for arg in argv if arg.startswith("--target-local=")), None)
    target_scale = next((float(arg.split("=", 1)[1]) for arg in argv if arg.startswith("--target-scale=")), 0.08)
    light_multiplier = next(
        (float(arg.split("=", 1)[1]) for arg in argv if arg.startswith("--light-multiplier=")),
        1.0,
    )
    argv = [
        arg for arg in argv
        if arg not in {"--keep-material", "--cover-only", "--closeup-only", "--front-only"}
        and not arg.startswith("--frame=")
        and not arg.startswith("--view=")
        and not arg.startswith("--target-local=")
        and not arg.startswith("--target-scale=")
        and not arg.startswith("--light-multiplier=")
    ]
    glb = Path(argv[0])
    output = Path(argv[1]) if len(argv) > 1 else Path("/tmp/glb-qa-views")
    output.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    bpy.context.scene.frame_set(frame)
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not keep_material:
        set_clay_material(objects)
    else:
        tune_fabric_materials(objects)
    center, largest = setup_scene(objects, keep_material, light_multiplier)

    if target_local_arg is not None:
        target_local = Vector(tuple(float(value) for value in target_local_arg.split(",")))
        center = objects[0].matrix_world @ target_local
        largest *= target_scale

    views = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "left": Vector((-1, 0, 0.08)),
        "right": Vector((1, 0, 0.08)),
        "top-oblique": Vector((0.3, -1, 0.55)),
        "cover": Vector(tuple(load_render_standard()["camera"]["direction"])),
        "material-closeup": Vector((-0.2, -1, 0.06)),
    }
    if view_only is not None:
        if view_only not in views:
            raise ValueError(f"Unknown --view={view_only}; expected one of {sorted(views)}")
        views = {view_only: views[view_only]}
    elif target_local_arg is not None and front_only:
        views = {"front": views["front"]}
    elif target_local_arg is not None:
        views = {
            "front": views["front"],
            "back": views["back"],
            "left": views["left"],
            "right": views["right"],
        }
    elif cover_only:
        views = {"cover": views["cover"]}
    elif closeup_only:
        views = {"material-closeup": views["material-closeup"]}
    elif front_only:
        views = {"front": views["front"]}
    for name, direction in views.items():
        render_view(output, center, largest, name, direction)
    print(f"rendered={output}")


if __name__ == "__main__":
    main()

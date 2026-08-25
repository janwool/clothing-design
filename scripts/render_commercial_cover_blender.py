#!/usr/bin/env python3
"""Blender-side renderer for transparent commercial catalog covers.

The module is intentionally single-model and deterministic. Blender MCP imports
it and calls ``render_cover`` for every catalog asset so failures stay isolated
and every result can be audited independently.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STANDARD = ROOT / "public/config/design3d-render-standard.json"


def _clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Imported GLBs can leave many unused materials/images behind in a long MCP
    # session. Purging them keeps batch memory stable without touching files.
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.images,
    ):
        for datablock in list(collection):
            if datablock.users == 0:
                collection.remove(datablock)


def _mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def _world_corners(objects: list[bpy.types.Object]) -> list[Vector]:
    corners: list[Vector] = []
    for obj in objects:
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not corners:
        raise RuntimeError("The GLB contains no renderable mesh bounds")
    return corners


def _bounds(corners: list[Vector]) -> tuple[Vector, Vector]:
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for corner in corners:
        for axis in range(3):
            mins[axis] = min(mins[axis], corner[axis])
            maxs[axis] = max(maxs[axis], corner[axis])
    return (mins + maxs) * 0.5, maxs - mins


def _look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def _commercial_material(objects: list[bpy.types.Object], standard: dict) -> None:
    config = standard.get("material", {})
    material = bpy.data.materials.new("Commercial neutral fabric")
    material.use_nodes = True
    material.use_backface_culling = False
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError("Principled BSDF node is unavailable")

    base = config.get("baseColor", [0.82, 0.83, 0.84])
    bsdf.inputs["Base Color"].default_value = (*map(float, base), 1.0)
    bsdf.inputs["Roughness"].default_value = float(config.get("roughness", 0.68))
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = float(config.get("specularIorLevel", 0.3))
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = float(config.get("specularIorLevel", 0.3))
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = float(config.get("sheenWeight", 0.18))
    elif "Sheen" in bsdf.inputs:
        bsdf.inputs["Sheen"].default_value = float(config.get("sheenWeight", 0.18))

    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(material)


def _setup_scene(standard: dict, center: Vector, largest: float) -> None:
    scene = bpy.context.scene
    output = standard["output"]
    color = standard["colorManagement"]

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = int(output["width"])
    scene.render.resolution_y = int(output["height"])
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30

    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = int(standard.get("samples", 64))

    try:
        scene.view_settings.view_transform = color.get("viewTransform", "AgX")
    except TypeError:
        scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = color.get("look", "AgX - Medium High Contrast")
    except TypeError:
        pass
    scene.view_settings.exposure = float(color.get("exposure", 0.7))

    world = scene.world or bpy.data.worlds.new("Commercial studio world")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    ambient = standard["ambient"]
    background.inputs["Color"].default_value = (*map(float, ambient["color"]), 1.0)
    background.inputs["Strength"].default_value = float(ambient["strength"])

    normalization = standard.get("lightingNormalization", {})
    reference = max(float(normalization.get("referenceBounds", largest)), 1e-6)
    multiplier = float(normalization.get("energyMultiplier", 1.0))
    scale_compensation = (largest / reference) ** 2
    for config in standard["lights"]:
        data = bpy.data.lights.new(config["name"], "AREA")
        light = bpy.data.objects.new(config["name"], data)
        bpy.context.collection.objects.link(light)
        light.location = center + Vector(
            tuple(largest * float(value) for value in config["positionScale"])
        )
        data.energy = float(config["energy"]) * multiplier * scale_compensation
        data.shape = "DISK"
        data.size = largest * float(config["sizeScale"])
        data.color = tuple(map(float, config["color"]))
        data.use_shadow = True
        _look_at(light, center)


def _setup_camera(
    standard: dict,
    corners: list[Vector],
    center: Vector,
    largest: float,
) -> tuple[bpy.types.Object, tuple[float, float]]:
    direction = Vector(tuple(map(float, standard["camera"]["direction"]))).normalized()
    camera_data = bpy.data.cameras.new("Commercial cover camera")
    camera = bpy.data.objects.new("Commercial cover camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + direction * largest * float(standard["camera"].get("distanceScale", 2.3))
    _look_at(camera, center)
    camera_data.type = "ORTHO"
    camera_data.clip_start = max(largest * 0.001, 0.001)
    camera_data.clip_end = max(largest * 10.0, 100.0)

    # Use the rotation written above directly. Reading matrix_world here can
    # still expose the pre-update transform in Blender background sessions.
    rotation = camera.rotation_euler.to_quaternion()
    right = rotation @ Vector((1.0, 0.0, 0.0))
    up = rotation @ Vector((0.0, 1.0, 0.0))
    xs = [(corner - center).dot(right) for corner in corners]
    ys = [(corner - center).dot(up) for corner in corners]
    projected_width = max(xs) - min(xs)
    projected_height = max(ys) - min(ys)
    canvas_aspect = float(standard["output"]["width"]) / float(standard["output"]["height"])
    margin = float(standard["camera"].get("orthographicScale", 1.16))
    camera_data.ortho_scale = max(projected_height, projected_width / canvas_aspect) * margin
    bpy.context.scene.camera = camera
    return camera, (projected_width, projected_height)


def render_cover(
    glb_path: str | Path,
    output_png: str | Path,
    standard_path: str | Path = DEFAULT_STANDARD,
) -> dict:
    glb_path = Path(glb_path).resolve()
    output_png = Path(output_png).resolve()
    standard_path = Path(standard_path).resolve()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)

    standard = json.loads(standard_path.read_text(encoding="utf-8"))
    output_png.parent.mkdir(parents=True, exist_ok=True)
    _clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    bpy.context.scene.frame_set(1)
    objects = _mesh_objects()
    if not objects:
        raise RuntimeError(f"No mesh objects in {glb_path}")

    _commercial_material(objects, standard)
    corners = _world_corners(objects)
    center, size = _bounds(corners)
    largest = max(size)
    _setup_scene(standard, center, largest)
    camera, projected = _setup_camera(standard, corners, center, largest)

    bpy.context.scene.render.filepath = str(output_png)
    bpy.ops.render.render(write_still=True)
    result = {
        "glb": str(glb_path),
        "png": str(output_png),
        "objects": len(objects),
        "vertices": sum(len(obj.data.vertices) for obj in objects),
        "faces": sum(len(obj.data.polygons) for obj in objects),
        "bounds": [round(float(value), 6) for value in size],
        "projected": [round(float(value), 6) for value in projected],
        "orthoScale": round(float(camera.data.ortho_scale), 6),
        "engine": bpy.context.scene.render.engine,
        "viewTransform": bpy.context.scene.view_settings.view_transform,
        "look": bpy.context.scene.view_settings.look,
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    if len(argv) < 2:
        raise SystemExit("Usage: blender ... -- <model.glb> <cover.png> [standard.json]")
    render_cover(argv[0], argv[1], argv[2] if len(argv) > 2 else DEFAULT_STANDARD)


if __name__ == "__main__":
    main()

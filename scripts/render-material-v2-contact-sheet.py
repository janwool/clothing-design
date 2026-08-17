#!/usr/bin/env python3
"""Render all generated material-v2 maps in Blender for visual QA."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


MATERIALS = [
    ("cotton-jersey", "Cotton Jersey"),
    ("rib-knit", "Rib Knit"),
    ("french-terry", "French Terry"),
    ("fleece", "Fleece"),
    ("poplin", "Poplin"),
    ("linen", "Linen"),
    ("denim", "Denim"),
    ("twill", "Cotton Twill"),
    ("wool-blend", "Wool Blend"),
    ("nylon-ripstop", "Nylon Ripstop"),
    ("satin-silk", "Satin Silk"),
    ("velvet", "Velvet"),
]


def look_at(obj, target=(0.0, 0.0, 0.0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def load_image(path: Path, color_space: str):
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = color_space
    return image


def build_material(root: Path, material_id: str):
    material = bpy.data.materials.new(material_id)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value = 0.0
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base_path = root / material_id / "basecolor.webp"
    normal_path = root / material_id / "normal.webp"
    if (root / material_id / "basecolor.webp.png").exists():
        base_path = root / material_id / "basecolor.webp.png"
    if (root / material_id / "normal.webp.png").exists():
        normal_path = root / material_id / "normal.webp.png"

    base = nodes.new("ShaderNodeTexImage")
    base.image = load_image(base_path, "sRGB")
    base.interpolation = "Linear"
    base.extension = "REPEAT"
    links.new(base.outputs["Color"], shader.inputs["Base Color"])

    roughness = nodes.new("ShaderNodeTexImage")
    roughness.image = load_image(root / material_id / "roughness.png", "Non-Color")
    roughness.interpolation = "Linear"
    roughness.extension = "REPEAT"
    links.new(roughness.outputs["Color"], shader.inputs["Roughness"])

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.image = load_image(normal_path, "Non-Color")
    normal_texture.interpolation = "Linear"
    normal_texture.extension = "REPEAT"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.28
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

    return material


def add_label(text: str, location):
    bpy.ops.object.text_add(location=location, rotation=(math.radians(90), 0, 0))
    label = bpy.context.object
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.align_y = "CENTER"
    label.data.size = 0.30
    label.data.extrude = 0.005
    label.data.materials.append(build_label_material())


def build_label_material():
    name = "Label Ink"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    material = bpy.data.materials.new(name)
    material.diffuse_color = (0.028, 0.031, 0.029, 1.0)
    return material


def add_area_light(name: str, location, energy: float, size: float):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light)


def main():
    project_root = Path(__file__).resolve().parents[1]
    material_root = project_root / "public/materials-v2"
    output_path = project_root / "artifacts/generated-material-v2-contact-sheet.png"
    if "--" in sys.argv:
        arguments = sys.argv[sys.argv.index("--") + 1 :]
        if arguments:
            material_root = Path(arguments[0]).resolve()
        if len(arguments) > 1:
            output_path = Path(arguments[1]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if bpy.app.version >= (4, 2, 0) else "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output_path)
    scene.view_settings.look = "AgX - Medium High Contrast" if bpy.app.version >= (4, 0, 0) else "Medium High Contrast"

    world = bpy.data.worlds.new("Warm Paper") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.76, 0.70, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45

    columns = 4
    x_positions = (-4.5, -1.5, 1.5, 4.5)
    z_positions = (3.0, 0.0, -3.0)
    for index, (material_id, label) in enumerate(MATERIALS):
        column = index % columns
        row = index // columns
        location = (x_positions[column], 0.0, z_positions[row])
        bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, location=location)
        sphere = bpy.context.object
        sphere.name = label
        sphere.scale = (1.03, 0.72, 1.03)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.shade_smooth()
        sphere.data.materials.append(build_material(material_root, material_id))
        add_label(label, (location[0], -0.78, location[2] - 1.35))

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0.9, 0))
    backdrop = bpy.context.object
    backdrop.rotation_euler = (math.radians(90), 0, 0)
    backdrop_material = bpy.data.materials.new("Paper Backdrop")
    backdrop_material.diffuse_color = (0.89, 0.875, 0.83, 1.0)
    backdrop.data.materials.append(backdrop_material)

    camera_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.location = (0, -19.0, 0.10)
    camera.data.lens = 52
    look_at(camera, (0, 0, -0.15))

    add_area_light("Key", (-6.0, -7.0, 8.0), 1250, 5.0)
    add_area_light("Fill", (7.0, -5.0, 3.0), 900, 4.0)
    add_area_light("Top", (0.0, 1.0, 10.0), 800, 4.0)

    bpy.ops.render.render(write_still=True)
    print(output_path)


if __name__ == "__main__":
    main()

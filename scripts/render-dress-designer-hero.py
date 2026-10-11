"""Render the landing hero from three published platform GLBs with Blender.

Usage: Blender --background --python scripts/render-dress-designer-hero.py
Source GLBs belong in tmp/dress-hero-v1; output frames are encoded separately.
"""
from pathlib import Path
import os
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'tmp/dress-hero-v1'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8 if os.environ.get('DRESS_HERO_PREVIEW') else 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 25 if os.environ.get('DRESS_HERO_PREVIEW') else 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.84, .84, .84, 1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .5
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = -.4
scene.view_settings.gamma = 1

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .58
    return mat

white = material('Ivory', (.82, .79, .72))
slate = material('Slate', (.19, .23, .26))
charcoal = material('Charcoal', (.028, .03, .032))

groups = []
for slug, x, y, height, tilt, rotation, elevation in [
    ('tailored-one-piece-dress-3d-model', -.95, .65, 2.65, -.30, -.38, .60),
    ('classic-one-piece-dress-3d-model', -.10, -.7, 3.05, .08, .24, .15),
    ('lightweight-one-piece-dress-3d-model', .90, .55, 2.8, .30, -.36, .28),
]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(WORK / (slug + '.glb')))
    imported = set(bpy.data.objects) - before
    meshes = [o for o in imported if o.type == 'MESH']
    bpy.context.view_layer.update()
    bounds = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    low = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    factor = height / (high.z - low.z)
    center = (low + high) / 2
    root = bpy.data.objects.new(slug + '-group', None)
    scene.collection.objects.link(root)
    for obj in imported:
        if obj.parent not in imported:
            world = obj.matrix_world.copy()
            obj.parent = root
            obj.matrix_world = world
    root.rotation_euler = (0, tilt, rotation)
    root.scale = (factor, factor, factor)
    rotate = root.rotation_euler.to_matrix()
    root.location = Vector((x, y, elevation)) - rotate @ Vector((center.x, center.y, low.z)) * factor
    bpy.context.view_layer.update()
    print(slug, 'SOURCE', low, high, 'SCALE', factor, flush=True)
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(white)
        for poly in obj.data.polygons:
            poly.material_index = 0
    groups.append(meshes)

def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()

for name, location, energy, size in [
    ('Key', (-3, -4, 7), 240, 5),
    ('Fill', (4, -2, 5), 150, 4),
    ('Rim', (0, 3, 6), 280, 3),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.size = size
    aim(light, (0, 0, 1.6))

bpy.ops.object.camera_add(location=(0, -11, 3.5))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 6.3
aim(camera, (0, 0, 1.85))
scene.camera = camera
for state, mats in enumerate([(white, white, white), (slate, white, charcoal), (charcoal, slate, white)]):
    for group, mat in zip(groups, mats):
        for obj in group:
            obj.data.materials[0] = mat
    scene.render.filepath = str(WORK / f'state-{state}.png')
    bpy.ops.render.render(write_still=True)

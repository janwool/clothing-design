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
import bmesh
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


def _tune_commercial_materials(objects: list[bpy.types.Object], standard: dict) -> None:
    config = standard.get("material", {})
    base = config.get("baseColor", [0.82, 0.83, 0.84])
    seen: set[int] = set()
    for obj in objects:
        for material in obj.data.materials:
            if material is None or material.as_pointer() in seen:
                continue
            seen.add(material.as_pointer())
            material.use_nodes = True
            material.use_backface_culling = False
            bsdf = next(
                (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
                None,
            )
            if bsdf is None:
                continue
            # Catalog covers use a neutral fabric color while retaining the
            # imported roughness, normal, alpha, and material-slot semantics.
            # This prevents a few source GLBs with blue/tan color maps from
            # breaking the otherwise consistent white storefront grid.
            if config.get("neutralizeBaseColor", False):
                for link in list(bsdf.inputs["Base Color"].links):
                    material.node_tree.links.remove(link)
                bsdf.inputs["Base Color"].default_value = (*map(float, base), 1.0)
            elif not bsdf.inputs["Base Color"].is_linked:
                bsdf.inputs["Base Color"].default_value = (*map(float, base), 1.0)
            if not bsdf.inputs["Roughness"].is_linked:
                bsdf.inputs["Roughness"].default_value = float(config.get("roughness", 0.68))
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = float(config.get("specularIorLevel", 0.3))
            elif "Specular" in bsdf.inputs:
                bsdf.inputs["Specular"].default_value = float(config.get("specularIorLevel", 0.3))
            if "Sheen Weight" in bsdf.inputs:
                bsdf.inputs["Sheen Weight"].default_value = float(config.get("sheenWeight", 0.18))
            elif "Sheen" in bsdf.inputs:
                bsdf.inputs["Sheen"].default_value = float(config.get("sheenWeight", 0.18))
            normal_multiplier = float(config.get("normalStrengthMultiplier", 1.0))
            normal_max = float(config.get("normalStrengthMax", 1.0))
            for node in material.node_tree.nodes:
                if node.type != "NORMAL_MAP":
                    continue
                current = float(node.inputs["Strength"].default_value)
                if current > 0.0:
                    node.inputs["Strength"].default_value = min(current * normal_multiplier, normal_max)


def _brighten_bottom_thickness(
    objects: list[bpy.types.Object],
    standard: dict,
    min_z: float,
    largest: float,
) -> int:
    config = standard.get("bottomEdge", {})
    if not config.get("enabled", False):
        return 0

    threshold = min_z + largest * float(config.get("heightRatio", 0.018))
    if config.get("mode") == "hide-thickness":
        changed = 0
        for obj in objects:
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            faces = [
                face
                for face in mesh.faces
                if (obj.matrix_world @ face.calc_center_median()).z <= threshold
            ]
            changed += len(faces)
            if faces:
                bmesh.ops.delete(mesh, geom=faces, context="FACES")
                mesh.to_mesh(obj.data)
                obj.data.update()
            mesh.free()
        return changed

    base_color = config.get("baseColor", [0.98, 0.98, 0.97])
    emission_strength = float(config.get("emissionStrength", 0.08))
    changed = 0
    for obj in objects:
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        material_map: dict[int, int] = {}
        for polygon in obj.data.polygons:
            world_center = obj.matrix_world @ polygon.center
            if world_center.z > threshold:
                continue
            source_index = min(polygon.material_index, max(len(obj.data.materials) - 1, 0))
            if source_index not in material_map:
                source = obj.data.materials[source_index] if obj.data.materials else None
                material = source.copy() if source else bpy.data.materials.new("Bright bottom thickness")
                material.name = f"{source.name if source else 'Fabric'} - bright bottom thickness"
                material.use_nodes = True
                bsdf = next(
                    (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
                    None,
                )
                if bsdf:
                    if not bsdf.inputs["Base Color"].is_linked:
                        bsdf.inputs["Base Color"].default_value = (*map(float, base_color), 1.0)
                    if "Emission Color" in bsdf.inputs:
                        bsdf.inputs["Emission Color"].default_value = (*map(float, base_color), 1.0)
                    if "Emission Strength" in bsdf.inputs:
                        bsdf.inputs["Emission Strength"].default_value = emission_strength
                obj.data.materials.append(material)
                material_map[source_index] = len(obj.data.materials) - 1
            polygon.material_index = material_map[source_index]
            changed += 1
    return changed


def _setup_scene(standard: dict, center: Vector, largest: float) -> None:
    scene = bpy.context.scene
    output = standard["output"]
    color = standard["colorManagement"]

    engine = standard.get("engine", "BLENDER_EEVEE")
    scene.render.engine = engine
    scene.render.resolution_x = int(output["width"])
    scene.render.resolution_y = int(output["height"])
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30

    if engine == "CYCLES":
        cycles_addon = bpy.context.preferences.addons.get("cycles")
        requested_device = standard.get("cyclesDevice", "CPU")
        if cycles_addon and requested_device == "GPU":
            preferences = cycles_addon.preferences
            try:
                preferences.compute_device_type = "METAL"
                preferences.get_devices()
                for device in preferences.devices:
                    device.use = device.type == "METAL"
                scene.cycles.device = "GPU"
            except Exception:
                scene.cycles.device = "CPU"
        else:
            scene.cycles.device = "CPU"
        scene.cycles.samples = int(standard.get("samples", 32))
        scene.cycles.use_adaptive_sampling = True
        scene.cycles.adaptive_threshold = float(standard.get("adaptiveThreshold", 0.035))
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 6
        scene.cycles.diffuse_bounces = 2
        scene.cycles.glossy_bounces = 3
        scene.cycles.transparent_max_bounces = 4
        bpy.context.view_layer.cycles.use_denoising = True
    elif hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
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


def _add_soft_contact_shadow(
    standard: dict,
    center: Vector,
    size: Vector,
    min_z: float,
) -> bpy.types.Object | None:
    config = standard.get("shadow", {})
    if not config.get("enabled", True):
        return None

    largest = max(size)
    if config.get("mode") == "cycles-shadow-catcher":
        bpy.ops.mesh.primitive_plane_add(
            size=2.0,
            location=(
                center.x,
                center.y + size.y * float(config.get("backOffset", 0.08)),
                min_z - largest * float(config.get("heightOffset", 0.006)),
            ),
        )
        shadow = bpy.context.active_object
        shadow.name = "Commercial Cycles shadow catcher"
        shadow.scale = (largest * 1.8, largest * 1.8, 1.0)
        shadow.is_shadow_catcher = True
        material = bpy.data.materials.new("Commercial shadow catcher surface")
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            surface_color = config.get("surfaceColor", [0.95, 0.95, 0.95])
            bsdf.inputs["Base Color"].default_value = (*map(float, surface_color), 1.0)
            bsdf.inputs["Roughness"].default_value = 1.0
        shadow.data.materials.append(material)
        return shadow

    bpy.ops.mesh.primitive_circle_add(
        vertices=128,
        radius=1.0,
        fill_type="NGON",
        location=(
            center.x,
            center.y + size.y * float(config.get("backOffset", 0.18)),
            min_z - largest * float(config.get("heightOffset", 0.006)),
        ),
    )
    shadow = bpy.context.active_object
    shadow.name = "Commercial soft contact shadow"
    shadow.scale = (
        max(size.x * float(config.get("widthScale", 0.66)), largest * 0.18),
        max(size.y * float(config.get("depthScale", 0.66)), largest * 0.13),
        1.0,
    )

    material = bpy.data.materials.new("Commercial transparent contact shadow")
    material.use_nodes = True
    material.use_backface_culling = False
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    elif hasattr(material, "blend_method"):
        material.blend_method = "BLEND"

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = (0.02, 0.025, 0.035, 1.0)
    principled.inputs["Roughness"].default_value = 1.0
    texcoord = nodes.new("ShaderNodeTexCoord")
    distance = nodes.new("ShaderNodeVectorMath")
    distance.operation = "DISTANCE"
    distance.inputs[1].default_value = (0.5, 0.5, 0.5)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = float(config.get("coreRadius", 0.08))
    ramp.color_ramp.elements[0].color = (1.0, 1.0, 1.0, float(config.get("opacity", 0.2)))
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 0.0)
    links.new(texcoord.outputs["Generated"], distance.inputs[0])
    links.new(distance.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(ramp.outputs["Alpha"], principled.inputs["Alpha"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    shadow.data.materials.append(material)
    return shadow


def _setup_shadow_compositor(standard: dict) -> None:
    config = standard.get("shadow", {})
    if not config.get("enabled") or config.get("mode") != "cycles-shadow-catcher":
        return

    scene = bpy.context.scene
    bpy.context.view_layer.use_pass_object_index = True
    scene.use_nodes = True
    tree = getattr(scene, "node_tree", None) or scene.compositing_node_group
    if tree is None:
        tree = bpy.data.node_groups.new("Commercial shadow compositor", "CompositorNodeTree")
        scene.compositing_node_group = tree
    if not any(
        item.item_type == "SOCKET" and item.in_out == "OUTPUT" and item.name == "Image"
        for item in tree.interface.items_tree
    ):
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    nodes = tree.nodes
    links = tree.links
    for node in list(nodes):
        nodes.remove(node)

    render_layers = nodes.new("CompositorNodeRLayers")
    object_mask = nodes.new("CompositorNodeIDMask")
    if "Index" in object_mask.inputs:
        object_mask.inputs["Index"].default_value = 1
    if "Anti-Alias" in object_mask.inputs:
        object_mask.inputs["Anti-Alias"].default_value = True

    cutoff = nodes.new("ShaderNodeMath")
    cutoff.operation = "SUBTRACT"
    cutoff.use_clamp = True
    cutoff.inputs[1].default_value = float(config.get("alphaCutoff", 0.015))

    shadow_opacity = nodes.new("ShaderNodeMath")
    shadow_opacity.operation = "MULTIPLY"
    shadow_opacity.use_clamp = True
    shadow_opacity.inputs[1].default_value = float(config.get("opacity", 0.18))

    merged_alpha = nodes.new("ShaderNodeMath")
    merged_alpha.operation = "MAXIMUM"
    merged_alpha.use_clamp = True

    set_alpha = nodes.new("CompositorNodeSetAlpha")
    if hasattr(set_alpha, "mode"):
        set_alpha.mode = "REPLACE_ALPHA"
    group_output = nodes.new("NodeGroupOutput")

    links.new(render_layers.outputs["IndexOB"], object_mask.inputs["ID value"])
    links.new(render_layers.outputs["Alpha"], cutoff.inputs[0])
    links.new(cutoff.outputs[0], shadow_opacity.inputs[0])
    links.new(object_mask.outputs["Alpha"], merged_alpha.inputs[0])
    links.new(shadow_opacity.outputs[0], merged_alpha.inputs[1])
    links.new(render_layers.outputs["Image"], set_alpha.inputs["Image"])
    links.new(merged_alpha.outputs[0], set_alpha.inputs["Alpha"])
    links.new(set_alpha.outputs["Image"], group_output.inputs["Image"])


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

    _tune_commercial_materials(objects, standard)
    for obj in objects:
        obj.pass_index = 1
    corners = _world_corners(objects)
    center, size = _bounds(corners)
    min_z = min(corner.z for corner in corners)
    largest = max(size)
    brightened_bottom_faces = _brighten_bottom_thickness(objects, standard, min_z, largest)
    _setup_scene(standard, center, largest)
    _add_soft_contact_shadow(standard, center, size, min_z)
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
        "brightenedBottomFaces": brightened_bottom_faces,
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

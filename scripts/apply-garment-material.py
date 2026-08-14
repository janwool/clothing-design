#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def load_texture(path: Path, color_space: str) -> bpy.types.Image:
    image = bpy.data.images.load(str(path.resolve()), check_existing=False)
    image.colorspace_settings.name = color_space
    return image


def material_map_path(material_dir: Path, stem: str, image_format: str) -> Path:
    extension = "jpg" if image_format == "jpeg" else "png"
    return material_dir / f"{stem}.{extension}"


def build_material(
    name: str,
    material_dir: Path,
    roughness: float,
    normal_strength: float,
    image_format: str,
    texture_repeat: float,
    texture_rotation: float,
    sheen: float,
    specular: float,
    metallic: float,
    use_normal_map: bool,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (420, 0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Sheen" in bsdf.inputs:
        bsdf.inputs["Sheen"].default_value = sheen
    if "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = specular
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    texture_coordinates = nodes.new("ShaderNodeTexCoord")
    texture_coordinates.location = (-900, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-680, 0)
    mapping.vector_type = "POINT"
    mapping.inputs["Scale"].default_value = (texture_repeat, texture_repeat, 1.0)
    mapping.inputs["Rotation"].default_value[2] = math.radians(texture_rotation)
    links.new(texture_coordinates.outputs["UV"], mapping.inputs["Vector"])

    base_texture = nodes.new("ShaderNodeTexImage")
    base_texture.name = "Garment Base Color"
    base_texture.location = (-420, 180)
    base_texture.extension = "REPEAT"
    base_texture.image = load_texture(material_map_path(material_dir, "basecolor", image_format), "sRGB")
    links.new(mapping.outputs["Vector"], base_texture.inputs["Vector"])
    links.new(base_texture.outputs["Color"], bsdf.inputs["Base Color"])

    roughness_texture = nodes.new("ShaderNodeTexImage")
    roughness_texture.name = "Garment Roughness"
    roughness_texture.location = (-420, -60)
    roughness_texture.extension = "REPEAT"
    roughness_texture.image = load_texture(material_map_path(material_dir, "roughness", image_format), "Non-Color")
    links.new(mapping.outputs["Vector"], roughness_texture.inputs["Vector"])
    links.new(roughness_texture.outputs["Color"], bsdf.inputs["Roughness"])

    if use_normal_map:
        normal_texture = nodes.new("ShaderNodeTexImage")
        normal_texture.name = "Garment Normal"
        normal_texture.location = (-420, -300)
        normal_texture.extension = "REPEAT"
        normal_texture.image = load_texture(material_map_path(material_dir, "normal", image_format), "Non-Color")
        links.new(mapping.outputs["Vector"], normal_texture.inputs["Vector"])
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (80, -260)
        normal_map.inputs["Strength"].default_value = normal_strength
        links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)

    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    components = []
    visited = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def assign_materials(
    objects: list[bpy.types.Object],
    body_material: bpy.types.Material,
    collar_material: bpy.types.Material | None,
    collar_component_max_faces: int,
    collar_component_indices: set[int] | None,
    collar_source_material_indices: set[int] | None,
    collar_exclude_y_range: tuple[float, float] | None,
    collar_exclude_y_components: set[int] | None,
) -> dict[str, int]:
    counts = {"body_components": 0, "collar_components": 0, "mixed_components": 0}
    for obj in objects:
        components = face_components(obj.data)
        source_materials = [polygon.material_index for polygon in obj.data.polygons]
        obj.data.materials.clear()
        obj.data.materials.append(body_material)
        if collar_material is not None:
            obj.data.materials.append(collar_material)
        if collar_source_material_indices is not None:
            for polygon in obj.data.polygons:
                polygon.material_index = (
                    1 if source_materials[polygon.index] in collar_source_material_indices else 0
                )
            for component in components:
                selected = sum(
                    source_materials[polygon_index] in collar_source_material_indices
                    for polygon_index in component
                )
                if selected == 0:
                    counts["body_components"] += 1
                elif selected == len(component):
                    counts["collar_components"] += 1
                else:
                    counts["mixed_components"] += 1
            continue

        for component_index, component in enumerate(components):
            selected_explicitly = (
                collar_component_indices is not None and component_index in collar_component_indices
            )
            selected_by_size = (
                collar_component_indices is None and len(component) <= collar_component_max_faces
            )
            use_collar = collar_material is not None and (selected_explicitly or selected_by_size)
            material_index = 1 if use_collar else 0
            excluded_faces = 0
            for polygon_index in component:
                polygon = obj.data.polygons[polygon_index]
                exclude_face = False
                if (
                    use_collar
                    and collar_exclude_y_range is not None
                    and collar_exclude_y_components is not None
                    and component_index in collar_exclude_y_components
                ):
                    center_y = sum(obj.data.vertices[index].co.y for index in polygon.vertices) / len(polygon.vertices)
                    exclude_face = collar_exclude_y_range[0] <= center_y <= collar_exclude_y_range[1]
                polygon.material_index = 0 if exclude_face else material_index
                excluded_faces += int(exclude_face)
            if use_collar and excluded_faces:
                counts["mixed_components"] += 1
            else:
                counts["collar_components" if use_collar else "body_components"] += 1
    return counts


def export_glb(path: Path, position_quantization: int = 14) -> None:
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


def add_sheen_extension(
    path: Path,
    sheen: float,
    sheen_roughness: float,
    secondary_sheen: float | None = None,
    secondary_sheen_roughness: float | None = None,
) -> None:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"Unsupported GLB: {path}")

    chunks = []
    offset = 12
    document = None
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk_data = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk_data.rstrip(b"\x00 \t\r\n"))
        else:
            chunks.append((chunk_type, chunk_data))
    if document is None:
        raise ValueError(f"Missing GLB JSON chunk: {path}")

    extensions_used = document.setdefault("extensionsUsed", [])
    if "KHR_materials_sheen" not in extensions_used:
        extensions_used.append("KHR_materials_sheen")
    for index, material in enumerate(document.get("materials", [])):
        material_sheen = secondary_sheen if index == 1 and secondary_sheen is not None else sheen
        material_sheen_roughness = (
            secondary_sheen_roughness
            if index == 1 and secondary_sheen_roughness is not None
            else sheen_roughness
        )
        material.setdefault("extensions", {})["KHR_materials_sheen"] = {
            "sheenColorFactor": [material_sheen, material_sheen, material_sheen],
            "sheenRoughnessFactor": material_sheen_roughness,
        }

    json_data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_data += b" " * ((4 - len(json_data) % 4) % 4)
    output_chunks = [(0x4E4F534A, json_data), *chunks]
    total_length = 12 + sum(8 + len(chunk_data) for _, chunk_data in output_chunks)
    payload = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    for chunk_type, chunk_data in output_chunks:
        payload.extend(struct.pack("<II", len(chunk_data), chunk_type))
        payload.extend(chunk_data)
    path.write_bytes(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply a PBR textile set to a garment GLB without changing its geometry or UVs.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("material_dir", type=Path)
    parser.add_argument("--material-name", default="Cotton jersey")
    parser.add_argument("--roughness", type=float, default=0.86)
    parser.add_argument("--normal-strength", type=float, default=0.22)
    parser.add_argument(
        "--omit-normal-map",
        action="store_true",
        help="Do not embed/link the normal map, avoiding glTF tangent splits on repaired faces.",
    )
    parser.add_argument("--image-format", choices=("png", "jpeg"), default="jpeg")
    parser.add_argument("--texture-repeat", type=float, default=4.0)
    parser.add_argument("--texture-rotation", type=float, default=0.0)
    parser.add_argument("--sheen", type=float, default=0.18)
    parser.add_argument("--sheen-roughness", type=float, default=0.72)
    parser.add_argument("--specular", type=float, default=0.34)
    parser.add_argument("--metallic", type=float, default=0.0)
    parser.add_argument("--collar-material-dir", type=Path)
    parser.add_argument("--collar-material-name", default="Cotton rib collar")
    parser.add_argument("--collar-normal-strength", type=float, default=0.12)
    parser.add_argument("--collar-roughness", type=float)
    parser.add_argument("--collar-sheen", type=float)
    parser.add_argument("--collar-sheen-roughness", type=float)
    parser.add_argument("--collar-specular", type=float)
    parser.add_argument("--collar-metallic", type=float, default=0.0)
    parser.add_argument("--collar-texture-repeat", type=float, default=3.0)
    parser.add_argument("--collar-texture-rotation", type=float, default=90.0)
    parser.add_argument("--collar-component-max-faces", type=int, default=200)
    parser.add_argument(
        "--collar-component-indices",
        help="Comma-separated connected-component indices. Overrides the face-count heuristic.",
    )
    parser.add_argument(
        "--collar-source-material-indices",
        help="Comma-separated imported material-slot indices to map to the secondary material.",
    )
    parser.add_argument(
        "--collar-exclude-y-range",
        help="Local Y min,max range to keep on the body material for selected trim components.",
    )
    parser.add_argument(
        "--collar-exclude-y-components",
        help="Comma-separated component indices affected by --collar-exclude-y-range.",
    )
    parser.add_argument(
        "--position-quantization",
        type=int,
        default=14,
        help="Draco position quantization bits; raise this for very small stitch geometry.",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    required_stems = ["basecolor", "roughness"] + ([] if args.omit_normal_map else ["normal"])
    required = [
        material_map_path(args.material_dir, stem, args.image_format)
        for stem in required_stems
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing material maps: {', '.join(missing)}")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    material = build_material(
        args.material_name,
        args.material_dir,
        args.roughness,
        args.normal_strength,
        args.image_format,
        args.texture_repeat,
        args.texture_rotation,
        args.sheen,
        args.specular,
        args.metallic,
        not args.omit_normal_map,
    )
    collar_material = None
    if args.collar_material_dir:
        collar_required = [
            material_map_path(args.collar_material_dir, stem, args.image_format)
            for stem in required_stems
        ]
        collar_missing = [str(path) for path in collar_required if not path.exists()]
        if collar_missing:
            raise FileNotFoundError(f"Missing collar material maps: {', '.join(collar_missing)}")
        collar_material = build_material(
            args.collar_material_name,
            args.collar_material_dir,
            args.collar_roughness if args.collar_roughness is not None else args.roughness,
            args.collar_normal_strength,
            args.image_format,
            args.collar_texture_repeat,
            args.collar_texture_rotation,
            args.collar_sheen if args.collar_sheen is not None else args.sheen,
            args.collar_specular if args.collar_specular is not None else args.specular,
            args.collar_metallic,
            not args.omit_normal_map,
        )
    collar_component_indices = None
    if args.collar_component_indices:
        collar_component_indices = {
            int(value.strip())
            for value in args.collar_component_indices.split(",")
            if value.strip()
        }
    collar_source_material_indices = None
    if args.collar_source_material_indices:
        if collar_material is None:
            raise ValueError("--collar-source-material-indices requires --collar-material-dir")
        collar_source_material_indices = {
            int(value.strip())
            for value in args.collar_source_material_indices.split(",")
            if value.strip()
        }
    collar_exclude_y_range = None
    if args.collar_exclude_y_range:
        values = [float(value.strip()) for value in args.collar_exclude_y_range.split(",")]
        if len(values) != 2 or values[0] > values[1]:
            raise ValueError("--collar-exclude-y-range must be min,max")
        collar_exclude_y_range = (values[0], values[1])
    collar_exclude_y_components = None
    if args.collar_exclude_y_components:
        collar_exclude_y_components = {
            int(value.strip())
            for value in args.collar_exclude_y_components.split(",")
            if value.strip()
        }
    component_counts = assign_materials(
        objects,
        material,
        collar_material,
        args.collar_component_max_faces,
        collar_component_indices,
        collar_source_material_indices,
        collar_exclude_y_range,
        collar_exclude_y_components,
    )
    export_glb(args.output, args.position_quantization)
    add_sheen_extension(
        args.output,
        args.sheen,
        args.sheen_roughness,
        args.collar_sheen,
        args.collar_sheen_roughness,
    )
    print(
        json.dumps(
            {
                "input": str(args.input),
                "output": str(args.output),
                "objects": len(objects),
                "material": args.material_name,
                "material_dir": str(args.material_dir),
                "roughness": args.roughness,
                "normal_strength": args.normal_strength,
                "normal_map_embedded": not args.omit_normal_map,
                "image_format": args.image_format,
                "texture_repeat": args.texture_repeat,
                "texture_rotation": args.texture_rotation,
                "sheen": args.sheen,
                "sheen_roughness": args.sheen_roughness,
                "specular": args.specular,
                "metallic": args.metallic,
                "collar_material_dir": str(args.collar_material_dir) if args.collar_material_dir else None,
                "collar_normal_strength": args.collar_normal_strength if collar_material else None,
                "collar_roughness": args.collar_roughness if collar_material else None,
                "collar_sheen": args.collar_sheen if collar_material else None,
                "collar_sheen_roughness": args.collar_sheen_roughness if collar_material else None,
                "collar_specular": args.collar_specular if collar_material else None,
                "collar_metallic": args.collar_metallic if collar_material else None,
                "collar_texture_repeat": args.collar_texture_repeat if collar_material else None,
                "collar_texture_rotation": args.collar_texture_rotation if collar_material else None,
                "collar_component_indices": sorted(collar_component_indices)
                if collar_component_indices is not None
                else None,
                "collar_source_material_indices": sorted(collar_source_material_indices)
                if collar_source_material_indices is not None
                else None,
                "collar_exclude_y_range": collar_exclude_y_range,
                "collar_exclude_y_components": sorted(collar_exclude_y_components)
                if collar_exclude_y_components is not None
                else None,
                "position_quantization": args.position_quantization,
                **component_counts,
                "geometry_changed": False,
                "uv_changed": False,
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

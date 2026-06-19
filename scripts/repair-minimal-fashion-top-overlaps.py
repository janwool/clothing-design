#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def connected_face_components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    edge_faces = defaultdict(list)
    for face in bm.faces:
        for edge in face.edges:
            edge_faces[edge].append(face)
    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components = []
    seen = set()
    for face in bm.faces:
        if face in seen:
            continue
        queue = deque([face])
        seen.add(face)
        component = []
        while queue:
            current = queue.popleft()
            component.append(current)
            for other in neighbors[current]:
                if other not in seen:
                    seen.add(other)
                    queue.append(other)
        components.append(component)
    return components


def bbox_for(component: list[bmesh.types.BMFace]):
    verts = {vert for face in component for vert in face.verts}
    xs = [vert.co.x for vert in verts]
    ys = [vert.co.y for vert in verts]
    zs = [vert.co.z for vert in verts]
    return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))


def bbox_iou(a, b) -> float:
    ix = max(0.0, min(a[3], b[3]) - max(a[0], b[0]))
    iy = max(0.0, min(a[4], b[4]) - max(a[1], b[1]))
    iz = max(0.0, min(a[5], b[5]) - max(a[2], b[2]))
    inter = ix * iy * iz
    va = max(1e-9, (a[3] - a[0]) * (a[4] - a[1]) * (a[5] - a[2]))
    vb = max(1e-9, (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]))
    return inter / max(1e-9, va + vb - inter)


def remove_duplicates_and_tiny(obj: bpy.types.Object, min_area: float, min_faces: int, duplicate_iou: float) -> tuple[int, int]:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    ranked = []
    for component in connected_face_components(bm):
        area = sum(face.calc_area() for face in component)
        ranked.append(
            {
                "area": area,
                "faces": len(component),
                "bbox": bbox_for(component),
                "component": component,
            }
        )
    ranked.sort(key=lambda item: item["area"], reverse=True)

    kept = []
    faces_to_delete = []
    removed_tiny = 0
    removed_duplicates = 0
    for item in ranked:
        if item["area"] < min_area or item["faces"] < min_faces:
            faces_to_delete.extend(item["component"])
            removed_tiny += 1
            continue
        duplicate = False
        for other in kept:
            area_ratio = min(item["area"], other["area"]) / max(item["area"], other["area"])
            if area_ratio >= 0.92 and bbox_iou(item["bbox"], other["bbox"]) >= duplicate_iou:
                duplicate = True
                break
        if duplicate:
            faces_to_delete.extend(item["component"])
            removed_duplicates += 1
        else:
            kept.append(item)

    if faces_to_delete:
        bmesh.ops.delete(bm, geom=faces_to_delete, context="FACES")
        bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not vert.link_faces], context="VERTS")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return removed_duplicates, removed_tiny


def add_thickness(obj: bpy.types.Object, thickness: float) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    solidify = obj.modifiers.new("Safe garment thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0
    solidify.use_even_offset = False
    solidify.use_quality_normals = False
    solidify.use_rim_only = False
    solidify.material_offset = 0
    solidify.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    weighted = obj.modifiers.new("Soft cloth normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True
    weighted.weight = 25
    bpy.ops.object.modifier_apply(modifier=weighted.name)


def export_glb(path: Path) -> None:
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove overlapping duplicate garment pieces from minimal fashion top source.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--duplicate-iou", type=float, default=0.88)
    parser.add_argument("--min-area", type=float, default=0.05)
    parser.add_argument("--min-faces", type=int, default=100)
    parser.add_argument("--thickness", type=float, default=0.024)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    duplicate_total = 0
    tiny_total = 0
    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        duplicates, tiny = remove_duplicates_and_tiny(obj, args.min_area, args.min_faces, args.duplicate_iou)
        duplicate_total += duplicates
        tiny_total += tiny
        add_thickness(obj, args.thickness)
    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print(f"removed_duplicates={duplicate_total}")
    print(f"removed_tiny={tiny_total}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def pack_object_uv(obj: bpy.types.Object, margin: float) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def export_glb(path: Path) -> None:
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )

def add_thickness(objects: list[bpy.types.Object], thickness: float) -> None:
    if thickness <= 0:
        return
    for obj in objects:
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
        obj.select_set(False)

def remove_zero_area_faces(objects: list[bpy.types.Object], min_area: float) -> int:
    removed = 0
    for obj in objects:
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        faces = [face for face in bm.faces if face.calc_area() <= min_area]
        removed += len(faces)
        if faces:
            bmesh.ops.delete(bm, geom=faces, context="FACES")
            loose_verts = [vert for vert in bm.verts if not vert.link_faces]
            if loose_verts:
                bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
            bm.normal_update()
            bm.to_mesh(mesh)
            mesh.update()
        bm.free()
    return removed


def qpoint(uv: tuple[float, float], precision: int = 6) -> tuple[int, int]:
    scale = 10**precision
    return (round(uv[0] * scale), round(uv[1] * scale))


def point_to_svg(point: tuple[int, int], size: int, precision: int = 6) -> tuple[float, float]:
    scale = 10**precision
    u = point[0] / scale
    v = point[1] / scale
    return (u * size, (1.0 - v) * size)


def collect_boundary_segments(mesh: bpy.types.Mesh) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return []

    edge_counts: dict[tuple[tuple[int, int], tuple[int, int]], int] = defaultdict(int)
    oriented: dict[tuple[tuple[int, int], tuple[int, int]], tuple[tuple[int, int], tuple[int, int]]] = {}
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        for index, loop_index in enumerate(loops):
            next_loop_index = loops[(index + 1) % len(loops)]
            a = qpoint(tuple(uv_layer.data[loop_index].uv))
            b = qpoint(tuple(uv_layer.data[next_loop_index].uv))
            if a == b:
                continue
            key = tuple(sorted((a, b)))
            edge_counts[key] += 1
            oriented.setdefault(key, (a, b))

    return [oriented[key] for key, count in edge_counts.items() if count == 1]


def chain_segments(segments: list[tuple[tuple[int, int], tuple[int, int]]]) -> list[list[tuple[int, int]]]:
    adjacency: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    unused = set()
    for a, b in segments:
        adjacency[a].append(b)
        adjacency[b].append(a)
        unused.add(tuple(sorted((a, b))))

    paths = []
    while unused:
        edge = next(iter(unused))
        start, second = edge
        path = [start, second]
        unused.remove(edge)

        for extend_front in (False, True):
            while True:
                current = path[0] if extend_front else path[-1]
                previous = path[1] if extend_front and len(path) > 1 else path[-2] if len(path) > 1 else None
                next_point = None
                for candidate in adjacency[current]:
                    key = tuple(sorted((current, candidate)))
                    if key in unused and candidate != previous:
                        next_point = candidate
                        break
                if next_point is None:
                    break
                unused.remove(tuple(sorted((current, next_point))))
                if extend_front:
                    path.insert(0, next_point)
                else:
                    path.append(next_point)
        paths.append(path)
    return paths


def polygon_area(points: list[tuple[int, int]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for a, b in zip(points, points[1:] + points[:1]):
        area += a[0] * b[1] - b[0] * a[1]
    return abs(area) / 2.0


def path_to_d(points: list[tuple[int, int]], size: int) -> str:
    coords = [point_to_svg(point, size) for point in points]
    if not coords:
        return ""
    pieces = [f"M {coords[0][0]:.2f},{coords[0][1]:.2f}"]
    pieces.extend(f"L {x:.2f},{y:.2f}" for x, y in coords[1:])
    if points[0] == points[-1] or (len(points) > 2 and points[0] in (points[-1],)):
        pieces.append("Z")
    else:
        first = coords[0]
        last = coords[-1]
        if math.hypot(first[0] - last[0], first[1] - last[1]) < 0.75:
            pieces.append("Z")
    return " ".join(pieces)


def export_svg(path: Path, objects: list[bpy.types.Object], size: int, min_area: float) -> int:
    segments = []
    for obj in objects:
        segments.extend(collect_boundary_segments(obj.data))
    paths = chain_segments(segments)
    paths = [path for path in paths if polygon_area(path) >= min_area]
    paths.sort(key=polygon_area, reverse=True)

    body = [
        f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">',
        '  <g fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for path_points in paths:
        d = path_to_d(path_points, size)
        if d:
            body.append(f'    <path d="{html.escape(d, quote=True)}"/>')
    body.extend(["  </g>", "</svg>", ""])
    path.write_text("\n".join(body), encoding="utf-8")
    return len(paths)


def main() -> None:
    parser = argparse.ArgumentParser(description="Repack GLB UV islands and export matching SVG island outlines.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("output_svg", type=Path)
    parser.add_argument("--margin", type=float, default=0.012)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--min-svg-area", type=float, default=4.0)
    parser.add_argument("--thickness", type=float, default=0.0)
    parser.add_argument("--min-face-area", type=float, default=1e-12)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        if obj.data.uv_layers.active:
            pack_object_uv(obj, args.margin)

    svg_paths = export_svg(args.output_svg, mesh_objects, args.size, args.min_svg_area)
    add_thickness(mesh_objects, args.thickness)
    removed_zero_area_faces = remove_zero_area_faces(mesh_objects, args.min_face_area)
    export_glb(args.output_glb)
    print(f"input={args.input}")
    print(f"output_glb={args.output_glb}")
    print(f"output_svg={args.output_svg}")
    print(f"meshes={len(mesh_objects)}")
    print(f"svg_paths={svg_paths}")
    print(f"margin={args.margin}")
    print(f"thickness={args.thickness}")
    print(f"removed_zero_area_faces={removed_zero_area_faces}")


if __name__ == "__main__":
    main()

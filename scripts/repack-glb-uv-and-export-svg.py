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


def pack_object_uv(obj: bpy.types.Object, margin: float, rotate: bool) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=rotate, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def export_glb(path: Path, position_quantization: int = 14) -> None:
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
        export_draco_position_quantization=position_quantization,
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


def collect_boundary_segments(
    mesh: bpy.types.Mesh,
    face_indices: set[int] | None = None,
) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return []

    edge_counts: dict[tuple[tuple[int, int], tuple[int, int]], int] = defaultdict(int)
    oriented: dict[tuple[tuple[int, int], tuple[int, int]], tuple[tuple[int, int], tuple[int, int]]] = {}
    seen_uv_polygons: set[tuple[tuple[int, int], ...]] = set()
    for poly in mesh.polygons:
        if face_indices is not None and poly.index not in face_indices:
            continue
        loops = list(poly.loop_indices)
        uv_polygon = tuple(qpoint(tuple(uv_layer.data[loop_index].uv)) for loop_index in loops)
        if polygon_area(list(uv_polygon)) < 1.0:
            continue
        polygon_key = tuple(sorted(uv_polygon))
        if polygon_key in seen_uv_polygons:
            continue
        seen_uv_polygons.add(polygon_key)
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


def collect_uv_island_faces(mesh: bpy.types.Mesh) -> list[list[int]]:
    """Return UV-continuous face groups without assuming UV seams split vertices."""
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return []

    def position_key(vertex_index: int, precision: int = 7):
        scale = 10**precision
        coordinate = mesh.vertices[vertex_index].co
        return tuple(round(float(value) * scale) for value in coordinate)

    edge_faces: dict[
        tuple[tuple[tuple[int, int, int], tuple[int, int]], ...],
        list[tuple[int, tuple[int, int], tuple[int, int]]],
    ] = defaultdict(list)
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        for index, loop_index in enumerate(loops):
            next_loop_index = loops[(index + 1) % len(loops)]
            start_vertex = mesh.loops[loop_index].vertex_index
            end_vertex = mesh.loops[next_loop_index].vertex_index
            start_uv = qpoint(tuple(uv_layer.data[loop_index].uv))
            end_uv = qpoint(tuple(uv_layer.data[next_loop_index].uv))
            edge_key = tuple(sorted((
                (position_key(start_vertex), start_uv),
                (position_key(end_vertex), end_uv),
            )))
            edge_faces[edge_key].append(
                (
                    poly.index,
                    start_uv,
                    end_uv,
                )
            )

    neighbors: dict[int, set[int]] = defaultdict(set)
    for entries in edge_faces.values():
        if len(entries) != 2:
            continue
        (face_a, a0, a1), (face_b, b0, b1) = entries
        if (a0 == b0 and a1 == b1) or (a0 == b1 and a1 == b0):
            neighbors[face_a].add(face_b)
            neighbors[face_b].add(face_a)

    islands = []
    visited = set()
    for poly in mesh.polygons:
        if poly.index in visited:
            continue
        queue = deque([poly.index])
        visited.add(poly.index)
        island = []
        while queue:
            face_index = queue.popleft()
            island.append(face_index)
            for neighbor in neighbors[face_index]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        islands.append(island)
    return islands


def convex_hull(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Create a deterministic outline for a closed UV shell with no seam boundary."""
    unique = sorted(set(points))
    if len(unique) <= 2:
        return unique

    def cross(origin, first, second):
        return (
            (first[0] - origin[0]) * (second[1] - origin[1])
            - (first[1] - origin[1]) * (second[0] - origin[0])
        )

    lower = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    hull = lower[:-1] + upper[:-1]
    return hull + [hull[0]] if hull else []


def closed_uv_island_hulls(mesh: bpy.types.Mesh) -> list[list[tuple[int, int]]]:
    """Find UV islands omitted by boundary extraction and supply one hull each."""
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return []

    all_segments = collect_boundary_segments(mesh)
    boundary_points = {point for segment in all_segments for point in segment}
    hulls = []
    for face_indices in collect_uv_island_faces(mesh):
        points = [
            qpoint(tuple(uv_layer.data[loop_index].uv))
            for face_index in face_indices
            for loop_index in mesh.polygons[face_index].loop_indices
        ]
        if points and not any(point in boundary_points for point in points):
            hull = convex_hull(points)
            if len(hull) >= 4:
                hulls.append(hull)
    return hulls


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


def polygon_area_svg_pixels(points: list[tuple[int, int]], size: int, precision: int = 6) -> float:
    """Return polygon area in rendered SVG pixels rather than quantized UV units."""
    scale = size / (10**precision)
    return polygon_area(points) * scale * scale


def path_span_svg_pixels(points: list[tuple[int, int]], size: int, precision: int = 6) -> float:
    """Return the smaller rendered dimension so collapsed seam strips can be omitted."""
    if not points:
        return 0.0
    scale = size / (10**precision)
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(max(xs) - min(xs), max(ys) - min(ys)) * scale


def path_effective_thickness_svg_pixels(
    points: list[tuple[int, int]],
    size: int,
    precision: int = 6,
) -> float:
    """Reject long doubled seam lines whose bounding boxes look like large panels."""
    if len(points) < 3:
        return 0.0
    scale = size / (10**precision)
    perimeter = sum(
        math.hypot(b[0] - a[0], b[1] - a[1]) * scale
        for a, b in zip(points, points[1:] + points[:1])
    )
    if perimeter <= 0:
        return 0.0
    return 2.0 * polygon_area_svg_pixels(points, size, precision) / perimeter


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


def export_svg(
    path: Path,
    objects: list[bpy.types.Object],
    size: int,
    min_area: float,
    outer_contours_only: bool = False,
    min_island_faces: int = 0,
    include_material_indices: set[int] | None = None,
    min_span: float = 1.5,
) -> int:
    paths = []
    for obj in objects:
        mesh = obj.data
        uv_layer = mesh.uv_layers.active
        if uv_layer is None:
            continue
        for island in collect_uv_island_faces(mesh):
            if len(island) < min_island_faces:
                continue
            if include_material_indices is not None and not all(
                mesh.polygons[face_index].material_index in include_material_indices
                for face_index in island
            ):
                continue
            face_indices = set(island)
            segments = collect_boundary_segments(mesh, face_indices)
            island_paths = chain_segments(segments)
            if island_paths:
                if outer_contours_only:
                    closed_paths = [
                        island_path
                        for island_path in island_paths
                        if (
                            len(island_path) >= 4
                            and island_path[0] == island_path[-1]
                            and polygon_area_svg_pixels(island_path, size) >= min_area
                            and path_span_svg_pixels(island_path, size) >= min_span
                            and path_effective_thickness_svg_pixels(island_path, size) >= min_span
                        )
                    ]
                    if closed_paths:
                        paths.append(max(closed_paths, key=polygon_area))
                    else:
                        # Thick garment shells commonly map coincident inner and outer
                        # faces to the same UVs.  De-duplicating those faces can leave
                        # several open boundary chains; choosing the longest one emits
                        # an unusable broken SVG line.  Fall back to one complete hull
                        # for that UV island instead.
                        island_points = [
                            qpoint(tuple(uv_layer.data[loop_index].uv))
                            for face_index in island
                            for loop_index in mesh.polygons[face_index].loop_indices
                        ]
                        hull = convex_hull(island_points)
                        if len(hull) >= 4:
                            paths.append(hull)
                else:
                    paths.extend(island_paths)
                continue
            points = [
                qpoint(tuple(uv_layer.data[loop_index].uv))
                for face_index in island
                for loop_index in mesh.polygons[face_index].loop_indices
            ]
            hull = convex_hull(points)
            if len(hull) >= 4:
                paths.append(hull)
    paths = [
        path
        for path in paths
        if (
            len(path) >= 4
            and path[0] == path[-1]
            and polygon_area_svg_pixels(path, size) >= min_area
            and path_span_svg_pixels(path, size) >= min_span
            and path_effective_thickness_svg_pixels(path, size) >= min_span
        )
    ]
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
    parser.add_argument("--min-svg-area", type=float, default=50.0)
    parser.add_argument(
        "--min-svg-span",
        type=float,
        default=1.5,
        help="Omit closed SVG contours thinner than this rendered pixel span.",
    )
    parser.add_argument("--thickness", type=float, default=0.0)
    parser.add_argument("--min-face-area", type=float, default=1e-12)
    parser.add_argument(
        "--position-quantization",
        type=int,
        default=14,
        help="Draco position quantization bits; raise this for very small stitch geometry.",
    )
    parser.add_argument(
        "--keep-orientation",
        action="store_true",
        help="Pack islands without rotating the imported garment-piece orientation.",
    )
    parser.add_argument(
        "--preserve-layout",
        action="store_true",
        help="Keep the imported UV coordinates instead of packing islands again.",
    )
    parser.add_argument(
        "--svg-only",
        action="store_true",
        help="Extract the SVG without re-exporting the GLB.",
    )
    parser.add_argument(
        "--outer-contours-only",
        action="store_true",
        help="Export one largest outline per UV island and omit internal seam/hole loops.",
    )
    parser.add_argument(
        "--min-island-faces",
        type=int,
        default=0,
        help="Omit repair plugs or detail islands with fewer faces from the SVG only.",
    )
    parser.add_argument(
        "--include-material-indices",
        help="Comma-separated material indices to include in the SVG only.",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    include_material_indices = None
    if args.include_material_indices:
        include_material_indices = {
            int(value.strip())
            for value in args.include_material_indices.split(",")
            if value.strip()
        }

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        if obj.data.uv_layers.active and not args.preserve_layout:
            pack_object_uv(obj, args.margin, rotate=not args.keep_orientation)

    svg_paths = export_svg(
        args.output_svg,
        mesh_objects,
        args.size,
        args.min_svg_area,
        outer_contours_only=args.outer_contours_only,
        min_island_faces=args.min_island_faces,
        include_material_indices=include_material_indices,
        min_span=args.min_svg_span,
    )
    removed_zero_area_faces = 0
    if not args.svg_only:
        add_thickness(mesh_objects, args.thickness)
        removed_zero_area_faces = remove_zero_area_faces(mesh_objects, args.min_face_area)
        export_glb(args.output_glb, args.position_quantization)
    print(f"input={args.input}")
    print(f"output_glb={args.output_glb}")
    print(f"output_svg={args.output_svg}")
    print(f"meshes={len(mesh_objects)}")
    print(f"svg_paths={svg_paths}")
    print(f"margin={args.margin}")
    print(f"thickness={args.thickness}")
    print(f"removed_zero_area_faces={removed_zero_area_faces}")
    print(f"position_quantization={args.position_quantization}")
    print(f"preserve_layout={args.preserve_layout}")
    print(f"keep_orientation={args.keep_orientation}")
    print(f"svg_only={args.svg_only}")
    print(f"outer_contours_only={args.outer_contours_only}")
    print(f"min_island_faces={args.min_island_faces}")
    print(f"include_material_indices={include_material_indices}")
    print(f"min_svg_area={args.min_svg_area}")
    print(f"min_svg_span={args.min_svg_span}")


if __name__ == "__main__":
    main()

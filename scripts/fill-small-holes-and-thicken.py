#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def boundary_edge_loops(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMEdge]]:
    boundary_edges = [edge for edge in bm.edges if edge.is_boundary]
    adjacency = defaultdict(list)
    for edge in boundary_edges:
        a, b = edge.verts
        adjacency[a].append(edge)
        adjacency[b].append(edge)

    loops = []
    visited = set()
    for edge in boundary_edges:
        if edge in visited:
            continue
        loop_edges = []
        current_edge = edge
        current_vert = edge.verts[0]
        while current_edge and current_edge not in visited:
            visited.add(current_edge)
            loop_edges.append(current_edge)
            next_vert = current_edge.other_vert(current_vert)
            candidates = [item for item in adjacency[next_vert] if item not in visited]
            current_vert = next_vert
            current_edge = candidates[0] if candidates else None
        loops.append(loop_edges)
    return loops


def loop_length(edges: list[bmesh.types.BMEdge]) -> float:
    return sum(edge.calc_length() for edge in edges)


def fill_small_holes(obj: bpy.types.Object, max_length: float, max_edges: int) -> int:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    filled = 0
    loops = boundary_edge_loops(bm)
    for edges in loops:
        if len(edges) < 3:
            continue
        if len(edges) > max_edges:
            continue
        if loop_length(edges) > max_length:
            continue
        try:
            result = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            if result.get("faces"):
                filled += 1
        except Exception:
            continue

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return filled


def add_safe_thickness(obj: bpy.types.Object, thickness: float) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    solidify = obj.modifiers.new("Safe filled garment thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0
    solidify.use_even_offset = False
    solidify.use_quality_normals = False
    solidify.use_rim_only = False
    solidify.material_offset = 0
    solidify.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=solidify.name)

    weighted = obj.modifiers.new("Soft cloth edge normals", "WEIGHTED_NORMAL")
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
    parser = argparse.ArgumentParser(description="Fill small mesh holes, preserve garment openings, and add safe thickness.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-hole-length", type=float, default=0.2)
    parser.add_argument("--max-hole-edges", type=int, default=12)
    parser.add_argument("--thickness", type=float, default=0.024)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    total_filled = 0
    for obj in mesh_objects:
        total_filled += fill_small_holes(obj, args.max_hole_length, args.max_hole_edges)
        add_safe_thickness(obj, args.thickness)
    export_glb(args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print(f"meshes={len(mesh_objects)}")
    print(f"filled_small_holes={total_filled}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Repair the miscatalogued soft hat used by model 107.

The thin source consists of four authored pattern panels whose duplicated
geometric seam edges were solidified independently in the batch asset.  Join
only those proven two-face contacts, soften the resulting serrated seam ridge,
preserve the single 130-edge hat opening, rebuild four pattern UV islands and
then add fabric thickness to the coherent surface.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id107_hat_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def relax_verified_seams(
    bm: bmesh.types.BMesh,
    seam_factor: float,
    ring_factor: float,
    iterations: int,
) -> dict[str, object]:
    seam_vertices = {vertex for edge in bm.edges if edge.seam for vertex in edge.verts}
    boundary_vertices = {
        vertex for edge in bm.edges if edge.is_boundary for vertex in edge.verts
    }
    seam_vertices -= boundary_vertices
    ring_vertices = {
        neighbor
        for vertex in seam_vertices
        for edge in vertex.link_edges
        for neighbor in edge.verts
        if neighbor not in seam_vertices and neighbor not in boundary_vertices
    }

    max_displacement = 0.0
    for _iteration in range(iterations):
        updates: dict[bmesh.types.BMVert, Vector] = {}
        for vertices, factor in (
            (seam_vertices, seam_factor),
            (ring_vertices, ring_factor),
        ):
            if factor <= 0:
                continue
            for vertex in vertices:
                neighbors = {
                    neighbor
                    for edge in vertex.link_edges
                    for neighbor in edge.verts
                    if neighbor is not vertex
                }
                if not neighbors:
                    continue
                average = sum((neighbor.co for neighbor in neighbors), Vector()) / len(neighbors)
                updates[vertex] = vertex.co.lerp(average, factor)
        for vertex, coordinate in updates.items():
            max_displacement = max(max_displacement, (coordinate - vertex.co).length)
            vertex.co = coordinate
        bm.normal_update()

    return {
        "seam_edges": sum(edge.seam for edge in bm.edges),
        "seam_vertices": len(seam_vertices),
        "one_ring_vertices": len(ring_vertices),
        "boundary_vertices_preserved": len(boundary_vertices),
        "iterations": iterations,
        "seam_factor": seam_factor,
        "ring_factor": ring_factor,
        "max_single_step_displacement": round(max_displacement, 9),
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--pattern-surface-output", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--uv-margin", type=float, default=0.018)
    parser.add_argument("--seam-factor", type=float, default=0.32)
    parser.add_argument("--ring-factor", type=float, default=0.08)
    parser.add_argument("--iterations", type=int, default=2)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    source = helpers.topology(bm)
    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        uv_owner_min_faces=100,
    )
    sewn = helpers.topology(bm)
    relaxation = relax_verified_seams(
        bm,
        args.seam_factor,
        args.ring_factor,
        args.iterations,
    )
    relaxed = helpers.topology(bm)
    bm.to_mesh(obj.data)
    bm.free()

    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    rebuilt_uv = helpers.rebuild_physical_uv(obj, args.uv_margin)
    helpers.export_glb(args.pattern_surface_output, args.position_quantization)
    helpers.add_thickness(obj, args.thickness)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened = helpers.topology(bm)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    helpers.export_glb(args.output, args.position_quantization)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "join only exact two-face panel seams, relax only the verified seam "
            "and its immediate ring, preserve the single hat-opening boundary"
        ),
        "source": source,
        "weld": weld,
        "sewn": sewn,
        "relaxation": relaxation,
        "relaxed": relaxed,
        "rebuilt_uv": rebuilt_uv,
        "thickness": args.thickness,
        "thickened": thickened,
        "pattern_surface_output": str(args.pattern_surface_output),
        "position_quantization": args.position_quantization,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Repair the blazer catalogued as ``relaxed-loose-woven-top-panel-layout``.

The thin source is an authored blazer split into 689 indexed components even
though exact positions reveal only two physical garment groups.  Solidifying
those fragments independently produced thousands of four-face junctions and
the visible pin pits along the side panels.  This model-specific rebuild sews
only unambiguous same-material two-face seams, preserves sixteen measured
pattern owners, and adds fabric thickness only after the surface is coherent.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bmesh
import bpy


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("garment_seam_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--uv-margin", type=float, default=0.012)
    parser.add_argument("--position-quantization", type=int, default=22)
    parser.add_argument(
        "--pattern-surface-output",
        type=Path,
        help="Optionally export the sewn, UV-rebuilt thin pattern surface before adding thickness.",
    )
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
    if source["faces"] != 84195 or source["components"] != 689:
        raise RuntimeError(f"Unexpected ID96 source structure: {source}")

    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        uv_owner_min_faces=100,
    )
    repaired = helpers.topology(bm)
    expected_weld = {
        "unambiguous_same_material_seams": 4220,
        "vertices_merged": 4146,
        "three_plus_layer_contacts_preserved": 0,
        "uv_major_components": 16,
    }
    for key, expected in expected_weld.items():
        if weld[key] != expected:
            raise RuntimeError(f"Unexpected {key}: {weld[key]} (expected {expected})")
    if (
        repaired["components"] != 2
        or repaired["boundary_edges"] != 977
        or repaired["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Unexpected sewn topology: {repaired}")

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
    if rebuilt_uv["islands"] != 16:
        raise RuntimeError(f"Expected sixteen authored UV owners: {rebuilt_uv}")
    if args.pattern_surface_output:
        helpers.export_glb(args.pattern_surface_output, args.position_quantization)
    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened = helpers.topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    if (
        thickened["components"] != 2
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Final topology is not closed and manifold: {thickened}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "return to the thin blazer; sew only exact same-material edges "
            "shared by exactly two faces; preserve sixteen pattern owners; "
            "then add 0.004 centered thickness"
        ),
        "diagnosis": {
            "indexed_source_components": 689,
            "physical_source_groups": 2,
            "major_pattern_owners": 16,
            "old_failure": (
                "independent fragment solidify produced 2940 position-welded "
                "multi-face edges and dense side-panel pin pits"
            ),
        },
        "tolerance": args.tolerance,
        "thickness": args.thickness,
        "source": source,
        "weld": weld,
        "repaired": repaired,
        "rebuilt_uv": rebuilt_uv,
        "pattern_surface_output": (
            str(args.pattern_surface_output) if args.pattern_surface_output else None
        ),
        "thickened": thickened,
        "thickened_uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

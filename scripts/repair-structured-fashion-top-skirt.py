#!/usr/bin/env python3
"""Repair the skirt catalogued as ``structured-fashion-top``.

The clean thin source contains 22 substantial authored panels and four tiny
surface-continuation fragments.  The old asset solidified all 26 indexed
pieces before joining their exact seams, turning those fragments into the
right-waist spike and two hard triangular pits.  This model-specific rebuild
sews only unambiguous same-material edges shared by exactly two faces, keeps
the eleven deliberate layered garment groups separate, rebuilds upright UV
patterns, and only then adds a restrained fabric thickness.
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
    if source["faces"] != 51186 or source["components"] != 26:
        raise RuntimeError(f"Unexpected ID95 source structure: {source}")

    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        uv_owner_min_faces=100,
    )
    repaired = helpers.topology(bm)
    expected_weld = {
        "unambiguous_same_material_seams": 581,
        "vertices_merged": 592,
        "three_plus_layer_contacts_preserved": 0,
    }
    for key, expected in expected_weld.items():
        if weld[key] != expected:
            raise RuntimeError(f"Unexpected {key}: {weld[key]} (expected {expected})")
    if repaired["components"] != 11 or repaired["true_nonmanifold_edges"] != 0:
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
    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened = helpers.topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    if thickened["boundary_edges"] or thickened["true_nonmanifold_edges"]:
        raise RuntimeError(f"Final topology is not closed and manifold: {thickened}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "return to the thin source; sew only exact same-material edges "
            "shared by exactly two faces; preserve eleven layered garment "
            "groups; rebuild UVs; then add 0.004 centered thickness"
        ),
        "diagnosis": {
            "substantial_authored_panels": 22,
            "surface_continuation_fragments": 4,
            "old_failure": (
                "solidifying all 26 indexed pieces independently produced "
                "the right-waist spike and two triangular pits"
            ),
        },
        "tolerance": args.tolerance,
        "thickness": args.thickness,
        "source": source,
        "weld": weld,
        "repaired": repaired,
        "rebuilt_uv": rebuilt_uv,
        "thickened": thickened,
        "thickened_uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

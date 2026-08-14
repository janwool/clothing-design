#!/usr/bin/env python3
"""Repair catalog model ID 103 without solidifying its 842 fragments separately.

The thin source is one long coat assembly split into three physical groups:
four inner/body pattern owners, ten outer coat owners with hundreds of sleeve
and fold continuations, and three collar pieces.  Only exact two-face seams
are sewn.  The three garment groups and their seventeen UV owners remain
separate, and centered thickness is added after the surface is coherent.
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
    spec = importlib.util.spec_from_file_location("id103_repair_helpers", path)
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
    parser.add_argument("--pattern-surface-output", type=Path)
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
    if source["faces"] != 40071 or source["components"] != 842:
        raise RuntimeError(f"Unexpected ID103 thin source: {source}")

    weld = helpers.selective_same_layer_weld(
        bm,
        args.tolerance,
        uv_owner_min_faces=700,
    )
    repaired = helpers.topology(bm)
    expected_weld = {
        "unambiguous_same_material_seams": 7119,
        "vertices_merged": 7260,
        "three_plus_layer_contacts_preserved": 0,
        "uv_major_components": 14,
        "uv_owner_groups": 17,
        "authored_cloth_seam_edges": 1630,
    }
    for key, expected in expected_weld.items():
        if weld[key] != expected:
            raise RuntimeError(f"Unexpected {key}: {weld[key]} (expected {expected})")
    if (
        repaired["components"] != 3
        or repaired["boundary_edges"] != 913
        or repaired["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Unexpected sewn ID103 topology: {repaired}")

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
    if rebuilt_uv["islands"] != 17:
        raise RuntimeError(f"Expected seventeen measured UV owners: {rebuilt_uv}")
    if args.pattern_surface_output:
        helpers.export_glb(args.pattern_surface_output, args.position_quantization)

    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    thickened_before_normals = helpers.topology(bm)
    original_normals = [face.normal.copy() for face in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    normal_faces_changed = sum(
        before.dot(face.normal) < 0.9999
        for before, face in zip(original_normals, bm.faces)
    )
    thickened = helpers.topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)
    if (
        thickened["components"] != 3
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(f"Final ID103 topology is not closed and manifold: {thickened}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "sew only 7119 exact two-face continuation seams; preserve four inner, "
            "ten outer and three collar UV owners; add centered 0.004 thickness only "
            "after the three garment surfaces are coherent"
        ),
        "diagnosis": {
            "indexed_source_components": 842,
            "physical_source_groups": 3,
            "pattern_owners": {
                "inner_body": 4,
                "outer_coat": 10,
                "collar": 3,
                "total": 17,
            },
            "old_failure": (
                "independent fragment solidify left 469 position-welded groups and "
                "1224 multi-face edges, visible as serrated pits around both sleeves"
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
        "thickened_before_normal_recalculation": thickened_before_normals,
        "faces_changed_by_closed_shell_normal_recalculation": normal_faces_changed,
        "thickened": thickened,
        "thickened_uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

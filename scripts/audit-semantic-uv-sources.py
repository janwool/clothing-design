#!/usr/bin/env python3
"""Summarize the authored UV/SVG structure for the semantic UV rebuild set."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


AUDIT = load_module("source_uv_audit", ROOT / "scripts" / "audit-garment-model.py")
UV_HELPER = load_module("source_uv_helper", ROOT / "scripts" / "repack-glb-uv-and-export-svg.py")


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def object_report(obj: bpy.types.Object) -> dict[str, object]:
    mesh = obj.data
    if not mesh.uv_layers:
        return {"name": obj.name, "faces": len(mesh.polygons), "uv_present": False}
    layer = mesh.uv_layers.active
    triangles = AUDIT.triangulated_uvs(mesh)
    zero_faces = {
        face_index
        for face_index, triangle in triangles
        if AUDIT.triangle_area(*triangle) <= 1e-16
    }
    zero = sum(AUDIT.triangle_area(*triangle) <= 1e-16 for _face, triangle in triangles)
    total_physical_area = sum(polygon.area for polygon in mesh.polygons)
    zero_physical_area = sum(mesh.polygons[index].area for index in zero_faces)
    values = [item.uv for item in layer.data]
    strict = AUDIT.collect_topology_uv_island_faces(mesh)
    welded = UV_HELPER.collect_uv_island_faces(mesh)
    return {
        "name": obj.name,
        "faces": len(mesh.polygons),
        "triangles": len(triangles),
        "uv_present": True,
        "zero_area_triangles": zero,
        "zero_area_ratio": zero / max(1, len(triangles)),
        "zero_area_faces": len(zero_faces),
        "zero_face_physical_area": zero_physical_area,
        "zero_face_physical_area_ratio": zero_physical_area / max(1e-30, total_physical_area),
        "strict_islands": len(strict),
        "welded_islands": len(welded),
        "topology_components": len(AUDIT.face_components(mesh)),
        "bounds": [
            min(value.x for value in values), max(value.x for value in values),
            min(value.y for value in values), max(value.y for value in values),
        ],
        "out_of_bounds_loops": sum(
            value.x < -1e-7 or value.x > 1.0000001 or value.y < -1e-7 or value.y > 1.0000001
            for value in values
        ),
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    config = json.loads(args.config.read_text())
    manifest = json.loads(args.manifest.read_text())
    glb_by_id = {row["remoteId"]: Path(row["source"]) for row in manifest["assets"] if row["field"] == "file_url"}
    svg_by_id = {row["remoteId"]: Path(row["source"]) for row in manifest["assets"] if row["field"] == "texture_url"}
    models = []
    for index, model in enumerate(config["models"], start=1):
        clear_scene()
        glb = glb_by_id[model["id"]]
        svg = svg_by_id[model["id"]]
        bpy.ops.import_scene.gltf(filepath=str(glb.resolve()))
        svg_root = ET.parse(svg).getroot()
        svg_paths = sum(node.tag.rsplit("}", 1)[-1] == "path" for node in svg_root.iter())
        report = {
            "id": model["id"],
            "slug": model["slug"],
            "actual_type": model["actualType"],
            "glb": str(glb.resolve()),
            "svg": str(svg.resolve()),
            "svg_paths": svg_paths,
            "objects": [object_report(obj) for obj in bpy.context.scene.objects if obj.type == "MESH"],
        }
        models.append(report)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"models": models}, indent=2) + "\n")
        zero = sum(row.get("zero_area_triangles", 0) for row in report["objects"])
        triangles = sum(row.get("triangles", 0) for row in report["objects"])
        welded = sum(row.get("welded_islands", 0) for row in report["objects"])
        print(f"[{index}/{len(config['models'])}] {model['id']} paths={svg_paths} islands={welded} zero={zero}/{triangles}", flush=True)


if __name__ == "__main__":
    main()

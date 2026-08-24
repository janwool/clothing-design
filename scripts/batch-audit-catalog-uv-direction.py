#!/usr/bin/env python3
"""Audit every GLB/SVG pair in a prepared catalog inside one Blender process."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bpy


def load_helper(path: Path):
    spec = importlib.util.spec_from_file_location("audit_glb_uv_direction", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def purge_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("catalog", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-faces", type=int, default=50000)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args(argv)

    helper = load_helper(Path(__file__).with_name("audit-glb-uv-direction.py"))
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    models = catalog["models"][args.start :]
    if args.limit > 0:
        models = models[: args.limit]
    results = []

    args.output.parent.mkdir(parents=True, exist_ok=True)
    for position, model in enumerate(models, start=1):
        purge_scene()
        try:
            bpy.ops.import_scene.gltf(filepath=str(Path(model["glb"]).resolve()))
            objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
            audit = helper.audit(objects, args.max_faces, Path(model["svg"]))
            result = {**model, "status": "ok", **audit}
        except Exception as error:  # Keep a complete catalog report after one bad asset.
            result = {**model, "status": "error", "error": f"{type(error).__name__}: {error}"}
        results.append(result)
        args.output.write_text(
            json.dumps({"catalog": str(args.catalog.resolve()), "results": results}, indent=2) + "\n",
            encoding="utf-8",
        )
        vertical = result.get("vertical", {})
        print(
            f"[{position}/{len(models)}] {model['id']} {model['slug']} "
            f"status={result['status']} v_mean={vertical.get('mean', 'n/a')} "
            f"v_positive={vertical.get('positive_fraction', 'n/a')}",
            flush=True,
        )

    print(json.dumps({"output": str(args.output.resolve()), "models": len(results)}, indent=2), flush=True)


if __name__ == "__main__":
    main()

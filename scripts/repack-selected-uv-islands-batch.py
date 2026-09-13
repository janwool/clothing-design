#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=ROOT / "scripts" / "selected-uv-island-pack-config.json")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "deployments" / "catalog-20260906-selected-uv-island-pack-v1")
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    summary = []
    for model in config["models"]:
        slug = model["slug"]
        output_glb = args.output / "glb" / f"{slug}.glb"
        output_svg = args.output / "texture" / f"{slug}.svg"
        report = args.output / "reports" / f"{slug}.json"
        if args.skip_existing and output_glb.exists() and output_svg.exists() and report.exists():
            print(f"SKIP {model['id']} {slug}", flush=True)
            payload = json.loads(report.read_text())
            payload["id"] = model["id"]
            payload["slug"] = slug
            payload.setdefault("pack_operator", "bpy.ops.uv.pack_islands")
            payload.setdefault("pack_visible_only", bool(model.get("packVisibleOnly")))
            summary.append(payload)
            continue
        print(f"START {model['id']} {slug}", flush=True)
        command = [
            str(BLENDER), "--background", "--factory-startup",
            "--python", str(ROOT / "scripts" / "repack-authored-uv-islands.py"), "--",
            str(ROOT / model["input"]), str(output_glb), str(output_svg),
            "--report", str(report), "--margin", "0.008",
            "--min-svg-area", "4", "--min-svg-span", "1.5",
            "--skip-overlap-audit", "--preserve-collapsed",
        ]
        if model.get("packVisibleOnly"):
            command.append("--pack-visible-only")
        subprocess.run(command, cwd=ROOT, check=True)
        payload = json.loads(report.read_text())
        payload["id"] = model["id"]
        payload["slug"] = slug
        summary.append(payload)
        print(f"DONE {model['id']} paths={payload['svg']['paths']}", flush=True)
    destination = args.output / "rebuild-summary.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({"version": config["version"], "models": summary}, indent=2) + "\n")
    print(destination, flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Batch driver for the authored-panel-preserving semantic UV rebuild."""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "artifacts" / "deployments" / "catalog-20260829-semantic-uv-preserved-v2"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=ROOT / "scripts" / "semantic-uv-rebuild-preserved-config.json")
    parser.add_argument("--manifest", type=Path, default=ROOT / "artifacts" / "deployments" / "catalog-20260825-commercial-uv-all-v1" / "publish-manifest.json")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--blender", type=Path, default=Path("/Volumes/Blender/Blender.app/Contents/MacOS/Blender"))
    parser.add_argument("--ids", default="")
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    manifest = json.loads(args.manifest.read_text())
    selected = {int(value) for value in args.ids.split(",") if value.strip()}
    models = [model for model in config["models"] if not selected or model["id"] in selected]
    source_by_id = {
        asset["remoteId"]: Path(asset["source"])
        for asset in manifest["assets"]
        if asset["field"] == "file_url"
    }
    for folder in ("glb", "texture", "reports", "logs", "previews"):
        (args.output / folder).mkdir(parents=True, exist_ok=True)

    def rebuild(model: dict[str, object]) -> dict[str, object]:
        model_id = int(model["id"])
        slug = str(model["slug"])
        output_glb = args.output / "glb" / f"{slug}.glb"
        output_svg = args.output / "texture" / f"{slug}.svg"
        report = args.output / "reports" / f"{slug}.json"
        log = args.output / "logs" / f"{model_id:03d}-{slug}.log"
        command = [
            str(args.blender), "--background", "--python",
            str(ROOT / "scripts" / "rebuild-preserved-semantic-uv-svg.py"), "--",
            str(source_by_id[model_id]), str(output_glb), str(output_svg),
            "--slug", slug,
            "--actual-type", str(model["actualType"]),
            "--report", str(report),
            "--max-svg-paths", str(model.get("maxSvgPaths", 32)),
            "--min-svg-faces", str(model.get("minSvgFaces", 3)),
        ]
        if model.get("excludeObjects"):
            command.extend(["--exclude-objects", ",".join(model["excludeObjects"])])
        if model.get("nonEditableObjects"):
            command.extend(["--noneditable-objects", ",".join(model["nonEditableObjects"])])
        if model.get("wholeIslandUnwrap"):
            command.append("--whole-island-unwrap")
        if model.get("positionWeldedSmartUnwrap"):
            command.append("--position-welded-smart-unwrap")
        if model.get("positionWeldedGrouping"):
            command.append("--position-welded-grouping")
        if model.get("positionWeldedXatlasUnwrap"):
            command.append("--position-welded-xatlas-unwrap")
        if model.get("uvReferenceGlb"):
            command.extend(["--uv-reference-glb", str(ROOT / str(model["uvReferenceGlb"]))])
        if model.get("uvReferenceSvg"):
            command.extend(["--uv-reference-svg", str(ROOT / str(model["uvReferenceSvg"]))])
        if model.get("deduplicateGeometryFaces"):
            command.append("--deduplicate-geometry-faces")
        if config.get("paperPatternLayout") or model.get("paperPatternLayout"):
            command.append("--paper-pattern-layout")
        started = time.monotonic()
        result = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        log.write_text(result.stdout)
        succeeded = (
            result.returncode == 0
            and report.exists()
            and output_glb.exists()
            and output_svg.exists()
            and "Traceback (most recent call last)" not in result.stdout
        )
        row = {
            "id": model_id,
            "slug": slug,
            "status": "ok" if succeeded else "failed",
            "seconds": round(time.monotonic() - started, 2),
            "log": str(log.resolve()),
        }
        if report.exists():
            payload = json.loads(report.read_text())
            row.update({
                "source_islands": payload.get("source_islands"),
                "islands": payload.get("islands"),
                "svg_paths": payload.get("svg_paths"),
                "preserved_uv_shape_max_error": payload.get("preserved_uv_shape_max_error"),
            })
        return row

    rows = []
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as executor:
        futures = [executor.submit(rebuild, model) for model in models]
        for future in as_completed(futures):
            row = future.result()
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
    rows.sort(key=lambda row: row["id"])
    summary = {
        "version": config["version"],
        "models": rows,
        "ok": sum(row["status"] == "ok" for row in rows),
        "failed": sum(row["status"] == "failed" for row in rows),
    }
    (args.output / "rebuild-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    if summary["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

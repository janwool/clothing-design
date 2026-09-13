#!/usr/bin/env python3
"""Run semantic UV rebuilds in isolated Blender processes."""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=ROOT / "scripts" / "semantic-uv-rebuild-config.json")
    parser.add_argument(
        "--manifest", type=Path,
        default=ROOT / "artifacts" / "deployments" / "catalog-20260825-commercial-uv-all-v1" / "publish-manifest.json",
    )
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "artifacts" / "deployments" / "catalog-20260829-semantic-uv-v1",
    )
    parser.add_argument("--blender", type=Path, default=Path("/Volumes/Blender/Blender.app/Contents/MacOS/Blender"))
    parser.add_argument("--ids", default="")
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--skip-existing", action="store_true")
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
        if args.skip_existing and output_glb.exists() and output_svg.exists() and report.exists():
            return {"id": model_id, "slug": slug, "status": "skipped", "seconds": 0}
        command = [
            str(args.blender), "--background", "--python",
            str(ROOT / "scripts" / "rebuild-semantic-uv-svg.py"), "--",
            str(source_by_id[model_id]), str(output_glb), str(output_svg),
            "--slug", slug, "--actual-type", str(model.get("actualType", "garment")),
            "--report", str(report), "--min-svg-faces", str(model.get("minSvgFaces", 3)),
            "--max-svg-paths", str(model.get("maxSvgPaths", 96)),
            "--uv-sliver-epsilon", str(model.get("uvSliverEpsilon", 1e-16)),
        ]
        if model.get("excludeObjects"):
            command.extend(["--exclude-objects", ",".join(model["excludeObjects"])])
        if model.get("nonEditableObjects"):
            command.extend(["--noneditable-objects", ",".join(model["nonEditableObjects"])])
        if model.get("forceSmartProjectAll", config.get("forceSmartProjectAllDefault", False)):
            command.append("--force-smart-project-all")
        started = time.monotonic()
        result = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        log.write_text(result.stdout)
        row = {
            "id": model_id, "slug": slug,
            "status": "ok" if result.returncode == 0 else "failed",
            "returncode": result.returncode,
            "seconds": round(time.monotonic() - started, 2),
            "source": str(source_by_id[model_id]),
            "log": str(log),
        }
        if report.exists():
            payload = json.loads(report.read_text())
            row.update({
                "islands": payload.get("islands"),
                "svg_paths": payload.get("svg_paths"),
                "uv_bounds": payload.get("uv_bounds"),
                "removed_uv_slivers": payload.get("removed_uv_slivers"),
            })
        return row

    rows = []
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as executor:
        futures = {executor.submit(rebuild, model): model for model in models}
        for future in as_completed(futures):
            row = future.result()
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
    rows.sort(key=lambda row: row["id"])
    summary = {
        "version": config["version"], "models": rows,
        "ok": sum(row["status"] in ("ok", "skipped") for row in rows),
        "failed": sum(row["status"] == "failed" for row in rows),
    }
    (args.output / "rebuild-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    if summary["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

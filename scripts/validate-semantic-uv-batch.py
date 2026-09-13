#!/usr/bin/env python3
"""Run post-export semantic UV validation for a candidate catalog."""

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
        "--candidate", type=Path,
        default=ROOT / "artifacts" / "deployments" / "catalog-20260829-semantic-uv-v1",
    )
    parser.add_argument("--blender", type=Path, default=Path("/Volumes/Blender/Blender.app/Contents/MacOS/Blender"))
    parser.add_argument("--ids", default="")
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    manifest = json.loads(args.manifest.read_text())
    selected = {int(value) for value in args.ids.split(",") if value.strip()}
    models = [model for model in config["models"] if not selected or model["id"] in selected]
    sources = {
        asset["remoteId"]: Path(asset["source"])
        for asset in manifest["assets"] if asset["field"] == "file_url"
    }

    def validate(model: dict[str, object]) -> dict[str, object]:
        model_id = int(model["id"])
        slug = str(model["slug"])
        glb = args.candidate / "glb" / f"{slug}.glb"
        svg = args.candidate / "texture" / f"{slug}.svg"
        report = args.candidate / "reports" / f"{slug}.json"
        output = args.candidate / "reports" / f"{slug}-validation.json"
        log = args.candidate / "logs" / f"{model_id:03d}-{slug}-validation.log"
        if not all(path.exists() for path in (glb, svg, report)):
            return {"id": model_id, "slug": slug, "status": "missing"}
        command = [
            str(args.blender), "--background", "--python",
            str(ROOT / "scripts" / "validate-semantic-uv-svg.py"), "--",
            str(glb), str(svg), str(report), str(sources[model_id]),
            "--output", str(output),
        ]
        started = time.monotonic()
        result = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        log.write_text(result.stdout)
        payload = json.loads(output.read_text()) if output.exists() else {}
        return {
            "id": model_id, "slug": slug,
            "status": "pass" if result.returncode == 0 and payload.get("pass") else "fail",
            "seconds": round(time.monotonic() - started, 2),
            "failures": payload.get("failures", ["validator_did_not_produce_report"]),
            "geometry_deformed": payload.get("geometry_deformed"),
            "report": str(output), "log": str(log),
        }

    rows = []
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as executor:
        futures = [executor.submit(validate, model) for model in models]
        for future in as_completed(futures):
            row = future.result()
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
    rows.sort(key=lambda row: row["id"])
    summary = {
        "version": config["version"], "models": rows,
        "passed": sum(row["status"] == "pass" for row in rows),
        "failed": sum(row["status"] != "pass" for row in rows),
    }
    (args.candidate / "validation-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    if summary["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

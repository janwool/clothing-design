#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parent.parent
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
RENDER_SCRIPT = ROOT / "scripts/render-glb-qa-views.py"
COMPOSITE_SCRIPT = ROOT / "scripts/composite-model-cover.py"
STANDARD_PATH = ROOT / "public/config/design3d-render-standard.json"
DEPLOYMENT_DIR = ROOT / "artifacts/deployments/catalog-20260814-neutral-glb-v1/remaining-covers"
MANIFEST_PATH = DEPLOYMENT_DIR / "prepared-models.json"
RENDER_DIR = DEPLOYMENT_DIR / "render"
READY_DIR = DEPLOYMENT_DIR / "ready"


def validate_cover(path: Path, expected_size: tuple[int, int]) -> dict[str, object]:
    image = Image.open(path).convert("RGB")
    if image.size != expected_size:
        raise ValueError(f"Unexpected cover size {image.size}, expected {expected_size}")
    mean = tuple(round(value, 2) for value in ImageStat.Stat(image).mean)
    if max(mean) < 30 or min(mean) > 253:
        raise ValueError(f"Implausible cover brightness: mean={mean}")
    return {"size": list(image.size), "meanRgb": list(mean)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the remaining online-only catalog covers.")
    parser.add_argument("--id-min", type=int, default=109)
    parser.add_argument("--id-max", type=int, default=124)
    args = parser.parse_args()

    standard = json.loads(STANDARD_PATH.read_text(encoding="utf-8"))
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    models = [model for model in payload["models"] if args.id_min <= int(model["id"]) <= args.id_max]
    if not models:
        raise RuntimeError("No models selected")
    expected_size = (int(standard["output"]["width"]), int(standard["output"]["height"]))
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    READY_DIR.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, object]] = []
    for index, model in enumerate(models, 1):
        work_dir = RENDER_DIR / f"{int(model['id']):03d}-{model['slug']}"
        work_dir.mkdir(parents=True, exist_ok=True)
        output = READY_DIR / f"{model['slug']}-neutral-v1.webp"
        print(f"[{index}/{len(models)}] rendering {model['id']}: {model['slug']}", flush=True)
        with (work_dir / "render.log").open("w", encoding="utf-8") as log:
            render = subprocess.run(
                [
                    str(BLENDER), "--background", "--python", str(RENDER_SCRIPT), "--",
                    str(model["neutralGlb"]), str(work_dir), "--keep-material", "--cover-only",
                ],
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        if render.returncode != 0:
            raise RuntimeError(f"Blender failed for {model['id']} with exit code {render.returncode}")
        subprocess.run(
            [
                "python3", str(COMPOSITE_SCRIPT), str(work_dir / "cover.png"), str(output),
                "--background", str(standard["output"]["background"]),
                "--quality", str(standard["output"]["quality"]),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        validation = validate_cover(output, expected_size)
        results.append({
            "id": model["id"], "slug": model["slug"], "cover": str(output), **validation,
        })
        print(f"[{index}/{len(models)}] rendered {output.name}", flush=True)

    summary = {
        "standard": standard["version"],
        "idMin": args.id_min,
        "idMax": args.id_max,
        "selected": len(models),
        "success": len(results),
        "failed": 0,
        "finished": datetime.now().isoformat(timespec="seconds"),
        "results": results,
    }
    summary_path = DEPLOYMENT_DIR / f"render-summary-{args.id_min}-{args.id_max}.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: summary[key] for key in ("idMin", "idMax", "selected", "success", "failed")}), flush=True)


if __name__ == "__main__":
    main()

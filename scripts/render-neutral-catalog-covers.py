#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "database.sqlite"
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
RENDER_SCRIPT = ROOT / "scripts/render-glb-qa-views.py"
COMPOSITE_SCRIPT = ROOT / "scripts/composite-model-cover.py"
STANDARD_PATH = ROOT / "public/config/design3d-render-standard.json"
OUTPUT_ROOT = ROOT / "artifacts/deployments/catalog-20260814-neutral-glb-v1/neutral-covers"
PREVIEW_ROOT = ROOT / "public/uploads/preview"
VERSION = "20260814-neutral-standard1"


def fetch_rows(id_min: int, id_max: int) -> list[sqlite3.Row]:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """SELECT id,slug,file_url,image_url FROM models_3d
           WHERE id BETWEEN ? AND ? ORDER BY id""",
        (id_min, id_max),
    ).fetchall()
    connection.close()
    return rows


def local_glb_path(file_url: str) -> Path:
    pathname = urlsplit(file_url).path
    if not pathname.startswith("/uploads/glb/"):
        raise ValueError(f"Unexpected local GLB URL: {file_url}")
    path = ROOT / "public" / pathname.lstrip("/")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def validate_cover(path: Path, expected_size: tuple[int, int]) -> dict[str, object]:
    image = Image.open(path).convert("RGB")
    if image.size != expected_size:
        raise ValueError(f"Unexpected cover size {image.size}, expected {expected_size}")
    stats = ImageStat.Stat(image)
    mean = tuple(round(value, 2) for value in stats.mean)
    extrema = image.getextrema()
    if max(mean) < 30 or min(mean) > 253:
        raise ValueError(f"Implausible cover brightness: mean={mean}")
    return {"size": list(image.size), "meanRgb": list(mean), "extrema": [list(item) for item in extrema]}


def update_database(model_id: int, image_url: str) -> None:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    with connection:
        connection.execute(
            "UPDATE models_3d SET image_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (image_url, model_id),
        )
    connection.close()


def append_state(payload: dict[str, object]) -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "state.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Render neutral catalog covers using the shared Blender studio standard.")
    parser.add_argument("--id-min", type=int, default=2)
    parser.add_argument("--id-max", type=int, default=107)
    args = parser.parse_args()

    if not BLENDER.is_file():
        raise FileNotFoundError(BLENDER)
    standard = json.loads(STANDARD_PATH.read_text(encoding="utf-8"))
    expected_size = (int(standard["output"]["width"]), int(standard["output"]["height"]))
    background = str(standard["output"]["background"])
    quality = int(standard["output"]["quality"])
    rows = fetch_rows(args.id_min, args.id_max)
    if not rows:
        raise RuntimeError("No models selected")

    success = 0
    failures: list[dict[str, object]] = []
    for index, row in enumerate(rows, 1):
        started = datetime.now().isoformat(timespec="seconds")
        work_dir = OUTPUT_ROOT / f"{row['id']:03d}-{row['slug']}"
        work_dir.mkdir(parents=True, exist_ok=True)
        log_path = work_dir / "render.log"
        try:
            source = local_glb_path(row["file_url"])
            basename = source.stem
            destination = PREVIEW_ROOT / f"{basename}.webp"
            pending = PREVIEW_ROOT / f"{basename}.pending.webp"
            pending.unlink(missing_ok=True)
            command = [
                str(BLENDER), "--background", "--python", str(RENDER_SCRIPT), "--",
                str(source), str(work_dir), "--keep-material", "--cover-only",
            ]
            print(f"[{index}/{len(rows)}] rendering {row['id']}: {row['slug']}", flush=True)
            with log_path.open("w", encoding="utf-8") as log:
                result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode != 0:
                raise RuntimeError(f"Blender exited with {result.returncode}")
            transparent = work_dir / "cover.png"
            if not transparent.is_file():
                raise FileNotFoundError(transparent)
            subprocess.run(
                [
                    "python3", str(COMPOSITE_SCRIPT), str(transparent), str(pending),
                    "--background", background, "--quality", str(quality),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            validation = validate_cover(pending, expected_size)
            os.replace(pending, destination)
            public_url = f"/uploads/preview/{destination.name}?v={VERSION}"
            update_database(int(row["id"]), public_url)
            payload = {
                "id": row["id"], "slug": row["slug"], "status": "success",
                "source": str(source), "output": str(destination), "image_url": public_url,
                "standard": standard["version"], "started": started,
                "finished": datetime.now().isoformat(timespec="seconds"), **validation,
            }
            append_state(payload)
            success += 1
            print(f"[{index}/{len(rows)}] updated {row['slug']} -> {public_url}", flush=True)
        except Exception as error:
            failure = {
                "id": row["id"], "slug": row["slug"], "status": "failed",
                "error": str(error), "started": started,
                "finished": datetime.now().isoformat(timespec="seconds"),
            }
            append_state(failure)
            failures.append(failure)
            print(f"[{index}/{len(rows)}] FAILED {row['id']} {row['slug']}: {error}", flush=True)

    summary = {
        "standard": standard["version"], "idMin": args.id_min, "idMax": args.id_max,
        "selected": len(rows), "success": success, "failed": len(failures),
        "failures": failures, "finished": datetime.now().isoformat(timespec="seconds"),
    }
    summary_path = OUTPUT_ROOT / f"summary-{args.id_min}-{args.id_max}.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

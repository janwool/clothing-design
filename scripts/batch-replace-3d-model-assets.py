#!/usr/bin/env python3
"""Resumable catalog-wide 3D asset replacement pipeline."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageColor


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "database.sqlite"
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
WORKER = ROOT / "scripts/process-model-asset-blender.py"
BATCH_ROOT = ROOT / "artifacts/model-repair/_batch"
RUN_ROOT = BATCH_ROOT / "catalog-replacement-20260808"
PUBLIC_GLB = ROOT / "public/uploads/glb"
PUBLIC_PREVIEW = ROOT / "public/uploads/preview"
PUBLIC_TEXTURE = ROOT / "public/uploads/texture"
VERSION = "20260808-batch1"
SKIP_IDS = {1, 8, 23, 98, 99, 100}


def material_profiles() -> dict[str, dict[str, object]]:
    cotton = ROOT / "artifacts/model-repair/classic-crew-neck-t-shirt-3d-model/materials/cotton-jersey-v7"
    wool = ROOT / "artifacts/model-repair/tailored-layered-blazer/materials/warm-greige-worsted"
    modal = ROOT / "artifacts/model-repair/classic-crew-neck-t-shirt-3d-model/materials/modal-stretch-ai/optimized-glb"
    generated = BATCH_ROOT / "materials/pbr"
    return {
        "cotton": dict(material_dir=str(cotton), material_name="Soft cotton textile", roughness=.86, normal_strength=.22, texture_repeat=4.0, texture_rotation=0.0, sheen=.18, sheen_roughness=.74, specular=.34, motion_strength=.0022),
        "wool": dict(material_dir=str(wool), material_name="Worsted wool", roughness=.88, normal_strength=.34, texture_repeat=3.0, texture_rotation=0.0, sheen=.22, sheen_roughness=.78, specular=.31, motion_strength=.0018),
        "modal": dict(material_dir=str(modal), material_name="Modal stretch jersey", roughness=.84, normal_strength=.18, texture_repeat=4.0, texture_rotation=0.0, sheen=.28, sheen_roughness=.72, specular=.36, motion_strength=.0025),
        "leather": dict(material_dir=str(generated / "matte-nappa-leather"), material_name="Matte nappa leather", roughness=.62, normal_strength=.42, texture_repeat=2.5, texture_rotation=0.0, sheen=.06, sheen_roughness=.48, specular=.42, motion_strength=0.0),
        "fleece": dict(material_dir=str(generated / "stone-cotton-fleece"), material_name="Brushed cotton fleece", roughness=.92, normal_strength=.30, texture_repeat=3.5, texture_rotation=0.0, sheen=.26, sheen_roughness=.88, specular=.28, motion_strength=.0025),
        "nylon": dict(material_dir=str(generated / "slate-micro-ripstop"), material_name="Micro ripstop nylon", roughness=.58, normal_strength=.26, texture_repeat=3.0, texture_rotation=0.0, sheen=.12, sheen_roughness=.48, specular=.44, motion_strength=.0012),
        "canvas": dict(material_dir=str(generated / "khaki-cotton-canvas"), material_name="Cotton canvas", roughness=.84, normal_strength=.44, texture_repeat=3.0, texture_rotation=0.0, sheen=.05, sheen_roughness=.82, specular=.30, motion_strength=0.0),
        "denim": dict(material_dir=str(generated / "medium-indigo-denim"), material_name="Indigo denim", roughness=.78, normal_strength=.48, texture_repeat=3.5, texture_rotation=0.0, sheen=.12, sheen_roughness=.76, specular=.31, motion_strength=.0014),
    }


def profile_for(row: sqlite3.Row) -> str:
    text = f"{row['name']} {row['slug']} {row['category']}".lower()
    if "leather" in text:
        return "leather"
    if "puffer" in text or "nylon" in text:
        return "nylon"
    category = row["category"].lower()
    if category == "hoodie":
        return "fleece"
    if category in {"pants", "skirt"}:
        return "denim"
    if category in {"bag", "hat"}:
        return "canvas"
    if category in {"coat", "blazer", "jacket"}:
        return "wool"
    if category == "underwear":
        return "modal"
    return "cotton"


def validate_materials(profiles: dict[str, dict[str, object]]) -> None:
    missing = []
    for key, profile in profiles.items():
        directory = Path(str(profile["material_dir"]))
        for stem in ("basecolor", "roughness", "normal"):
            path = directory / f"{stem}.jpg"
            if not path.exists():
                missing.append(f"{key}: {path}")
    if missing:
        raise FileNotFoundError("Missing material maps:\n" + "\n".join(missing))


def fetch_rows(ids: set[int] | None) -> list[sqlite3.Row]:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT id,name,slug,category,file_url,image_url,texture_url,status FROM models_3d WHERE status='active' ORDER BY id"
    ).fetchall()
    connection.close()
    return [row for row in rows if row["id"] not in SKIP_IDS and (ids is None or row["id"] in ids)]


def source_path(row: sqlite3.Row) -> Path:
    raw_url = row["file_url"].split("?", 1)[0]
    if raw_url.startswith("/"):
        path = ROOT / "public" / raw_url.lstrip("/")
        if not path.exists():
            raise FileNotFoundError(path)
        return path

    source_dir = BATCH_ROOT / "sources"
    source_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(urlsplit(raw_url).path).suffix or ".glb"
    destination = source_dir / f"{row['slug']}{suffix}"
    if destination.exists() and destination.stat().st_size > 1024:
        return destination
    pending = destination.with_suffix(destination.suffix + ".download")
    subprocess.run(
        ["curl", "-L", "--fail", "--retry", "3", "--output", str(pending), raw_url],
        check=True,
    )
    os.replace(pending, destination)
    return destination


def composite_cover(source: Path, destination: Path) -> None:
    foreground = Image.open(source).convert("RGBA")
    color = ImageColor.getrgb("#F4F1EA")
    background = Image.new("RGBA", foreground.size, (*color, 255))
    result = Image.alpha_composite(background, foreground).convert("RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    pending = destination.with_suffix(".pending.webp")
    result.save(pending, "WEBP", quality=88, method=6)
    os.replace(pending, destination)


def output_paths(row: sqlite3.Row) -> dict[str, Path]:
    basename = f"{row['slug']}-fabric-v1"
    return {
        "glb": PUBLIC_GLB / f"{basename}.glb",
        "preview": PUBLIC_PREVIEW / f"{basename}.webp",
        "svg": PUBLIC_TEXTURE / f"{basename}.svg",
        "pending_glb": PUBLIC_GLB / f"{basename}.pending.glb",
        "pending_svg": PUBLIC_TEXTURE / f"{basename}.pending.svg",
        "cover_dir": RUN_ROOT / "covers" / row["slug"],
        "report": RUN_ROOT / "reports" / f"{row['id']:03d}-{row['slug']}.json",
    }


def public_urls(row: sqlite3.Row) -> tuple[str, str, str]:
    basename = f"{row['slug']}-fabric-v1"
    return (
        f"/uploads/glb/{basename}.glb?v={VERSION}",
        f"/uploads/preview/{basename}.webp?v={VERSION}",
        f"/uploads/texture/{basename}.svg?v={VERSION}",
    )


def update_database(row: sqlite3.Row) -> None:
    file_url, image_url, texture_url = public_urls(row)
    connection = sqlite3.connect(DB_PATH)
    with connection:
        connection.execute(
            "UPDATE models_3d SET file_url=?, image_url=?, texture_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'",
            (file_url, image_url, texture_url, row["id"]),
        )
    connection.close()


def append_state(payload: dict[str, object]) -> None:
    RUN_ROOT.mkdir(parents=True, exist_ok=True)
    with (RUN_ROOT / "state.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False) + "\n")


def create_backup(rows: list[sqlite3.Row]) -> None:
    backup_dir = RUN_ROOT / "backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    database_backup = backup_dir / "database.sqlite.before-catalog-replacement"
    if not database_backup.exists():
        source = sqlite3.connect(DB_PATH)
        destination = sqlite3.connect(database_backup)
        source.backup(destination)
        destination.close()
        source.close()
    metadata_backup = backup_dir / "models_3d.before.json"
    backup_connection = sqlite3.connect(database_backup)
    backup_connection.row_factory = sqlite3.Row
    backup_rows = backup_connection.execute(
        "SELECT id,name,slug,category,file_url,image_url,texture_url,status FROM models_3d WHERE status='active' ORDER BY id"
    ).fetchall()
    backup_connection.close()
    metadata_backup.write_text(
        json.dumps([dict(row) for row in backup_rows], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def process_one(index: int, total: int, row: sqlite3.Row, profiles: dict[str, dict[str, object]], no_db: bool, force: bool) -> str:
    paths = output_paths(row)
    for directory in (PUBLIC_GLB, PUBLIC_PREVIEW, PUBLIC_TEXTURE, paths["cover_dir"], paths["report"].parent):
        directory.mkdir(parents=True, exist_ok=True)

    profile_key = profile_for(row)
    profile = {"key": profile_key, **profiles[profile_key]}
    complete = all(paths[key].exists() for key in ("glb", "preview", "svg", "report"))
    if complete and not force:
        if not no_db:
            update_database(row)
        print(f"[{index}/{total}] resume {row['id']} {row['slug']} ({profile_key})", flush=True)
        return "resumed"

    source = source_path(row)
    print(f"[{index}/{total}] process {row['id']} {row['slug']} ({profile_key})", flush=True)
    for key in ("pending_glb", "pending_svg"):
        paths[key].unlink(missing_ok=True)
    command = [
        str(BLENDER), "--background", "--python", str(WORKER), "--",
        "--input", str(source),
        "--output-glb", str(paths["pending_glb"]),
        "--output-svg", str(paths["pending_svg"]),
        "--cover-dir", str(paths["cover_dir"]),
        "--report", str(paths["report"]),
        "--profile", json.dumps(profile, ensure_ascii=False, separators=(",", ":")),
    ]
    log_path = RUN_ROOT / "logs" / f"{row['id']:03d}-{row['slug']}.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = datetime.now().isoformat(timespec="seconds")
    with log_path.open("w", encoding="utf-8") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        append_state({"id": row["id"], "slug": row["slug"], "status": "failed", "started": started, "finished": datetime.now().isoformat(timespec="seconds"), "log": str(log_path)})
        raise RuntimeError(f"Blender failed with exit {result.returncode}; see {log_path}")

    cover_png = paths["cover_dir"] / "cover.png"
    if not all(path.exists() and path.stat().st_size > 0 for path in (paths["pending_glb"], paths["pending_svg"], cover_png, paths["report"])):
        raise RuntimeError(f"Incomplete outputs for {row['slug']}")
    composite_cover(cover_png, paths["preview"])
    os.replace(paths["pending_glb"], paths["glb"])
    os.replace(paths["pending_svg"], paths["svg"])
    if not no_db:
        update_database(row)
    append_state({
        "id": row["id"], "slug": row["slug"], "profile": profile_key,
        "status": "success", "started": started, "finished": datetime.now().isoformat(timespec="seconds"),
        "file_url": public_urls(row)[0], "image_url": public_urls(row)[1], "texture_url": public_urls(row)[2],
        "report": str(paths["report"]),
    })
    return "success"


def parse_ids(value: str | None) -> set[int] | None:
    if not value:
        return None
    return {int(item.strip()) for item in value.split(",") if item.strip()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Replace catalog GLBs, covers and UV SVGs with resumable Blender processing.")
    parser.add_argument("--ids", help="Comma-separated model IDs. Omit to process every non-placeholder, non-repaired model.")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--no-db", action="store_true", help="Generate assets without changing catalog URLs.")
    parser.add_argument("--force", action="store_true", help="Rebuild outputs that already have a successful report.")
    args = parser.parse_args()

    if not BLENDER.exists():
        raise FileNotFoundError(BLENDER)
    profiles = material_profiles()
    validate_materials(profiles)
    rows = fetch_rows(parse_ids(args.ids))
    if args.limit is not None:
        rows = rows[: args.limit]
    if not rows:
        print("No models selected.")
        return
    create_backup(rows)
    RUN_ROOT.mkdir(parents=True, exist_ok=True)
    (RUN_ROOT / "plan.json").write_text(
        json.dumps([
            {**dict(row), "profile": profile_for(row), "urls": public_urls(row)} for row in rows
        ], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    counts = {"success": 0, "resumed": 0, "failed": 0}
    failures = []
    for index, row in enumerate(rows, 1):
        try:
            status = process_one(index, len(rows), row, profiles, args.no_db, args.force)
            counts[status] += 1
        except Exception as error:
            counts["failed"] += 1
            failures.append({"id": row["id"], "slug": row["slug"], "error": str(error)})
            print(f"[{index}/{len(rows)}] FAILED {row['id']} {row['slug']}: {error}", file=sys.stderr, flush=True)

    summary = {
        "selected": len(rows),
        "complete": counts["success"] + counts["resumed"],
        **counts,
        "failures": failures,
        "finished": datetime.now().isoformat(timespec="seconds"),
    }
    (RUN_ROOT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

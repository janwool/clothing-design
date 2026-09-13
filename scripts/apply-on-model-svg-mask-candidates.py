#!/usr/bin/env python3
"""Apply a reviewed SVG-mask candidate batch through the editor API."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = ROOT / "database.sqlite"
QUEUE_PATH = ROOT / "public/config/on-model-svg-mask-queue.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate_directory", type=Path)
    parser.add_argument("--apply", action="store_true", help="Perform writes; otherwise only preflight")
    parser.add_argument("--origin", default="http://localhost:3100")
    return parser.parse_args()


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def request_json(url: str, svg_data: str) -> dict:
    payload = json.dumps({"svgData": svg_data}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="PUT",
        headers={
            "Content-Type": "application/json",
            "X-Requested-With": "SVGMaskEditor",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    args = parse_args()
    candidate_directory = args.candidate_directory.resolve()
    records = json.loads((candidate_directory / "manifest.json").read_text(encoding="utf-8"))
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))["items"]
    queue_by_id = {item["id"]: item for item in queue}
    connection = sqlite3.connect(DATABASE_PATH)
    results: list[dict] = []

    preflight: list[tuple[dict, Path, str]] = []
    for record in records:
        item_id = record["id"]
        item_directory = candidate_directory / f"{record['index']:03d}-{item_id}"
        svg_path = item_directory / "mask.svg"
        svg_data = svg_path.read_text(encoding="utf-8").strip()
        row = connection.execute(
            "SELECT svg_data, updated_at FROM on_model_mockup_svg_masks WHERE asset_name = ?",
            (item_id,),
        ).fetchone()
        expected_updated_at = record.get("databaseUpdatedAt")
        current_updated_at = row[1] if row else None
        if current_updated_at != expected_updated_at:
            results.append({
                "index": record["index"],
                "id": item_id,
                "status": "preserved-newer-database-version",
                "expectedUpdatedAt": expected_updated_at,
                "currentUpdatedAt": current_updated_at,
            })
            print(f"[{record['index']:03d}] PRESERVE {item_id}: database revision changed")
            continue
        preflight.append((record, svg_path, svg_data))
        print(f"[{record['index']:03d}] READY {item_id}: {sha256(svg_data)[:12]}")

    if not args.apply:
        print(f"Preflight complete: {len(preflight)} ready, {len(results)} preserved")
        return

    for record, _svg_path, svg_data in preflight:
        item_id = record["id"]
        url = f"{args.origin.rstrip('/')}/api/on-model-svg-masks/{urllib.parse.quote(item_id)}"
        try:
            response = request_json(url, svg_data)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Apply failed for {item_id}: HTTP {error.code}: {detail}") from error
        if not response.get("success"):
            raise RuntimeError(f"Apply failed for {item_id}: {response}")

        served_url = f"{args.origin.rstrip('/')}/api/on-model-svg-masks/{urllib.parse.quote(item_id)}.svg"
        with urllib.request.urlopen(served_url, timeout=30) as served_response:
            served_svg = served_response.read().decode("utf-8").strip()
        if sha256(served_svg) != sha256(svg_data):
            raise RuntimeError(f"Read-after-write checksum mismatch for {item_id}")

        fallback_path = ROOT / "public" / queue_by_id[item_id]["svgMask"].lstrip("/")
        fallback_path.write_text(svg_data + "\n", encoding="utf-8")
        results.append({
            "index": record["index"],
            "id": item_id,
            "status": "applied",
            "updatedAt": response.get("updatedAt"),
            "sha256": sha256(svg_data),
            "regionCount": response.get("regionCount"),
            "nodeCount": response.get("nodeCount"),
        })
        print(
            f"[{record['index']:03d}] APPLIED {item_id}: "
            f"{response.get('regionCount')} regions, {response.get('nodeCount')} nodes"
        )

    output_path = candidate_directory / "apply-results.json"
    output_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(f"Apply complete: {sum(result['status'] == 'applied' for result in results)} applied, "
          f"{sum(result['status'] != 'applied' for result in results)} preserved")


if __name__ == "__main__":
    main()

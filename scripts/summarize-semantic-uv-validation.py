#!/usr/bin/env python3
"""Aggregate preserved semantic UV rebuild and post-export validation reports."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    rows = []
    for model in config["models"]:
        slug = model["slug"]
        rebuild_path = args.candidate / "reports" / f"{slug}.json"
        validation_path = args.candidate / "reports" / f"{slug}-validation.json"
        rebuild = json.loads(rebuild_path.read_text())
        validation = json.loads(validation_path.read_text())
        objects = validation.get("objects", {})
        rows.append(
            {
                "id": model["id"],
                "slug": slug,
                "actual_type": model.get("actualType"),
                "pass": validation.get("pass", False),
                "failures": validation.get("failures", []),
                "svg_paths": rebuild.get("svg_paths", 0),
                "preserved_uv_shape_max_error": rebuild.get("preserved_uv_shape_max_error"),
                "repaired_face_ratio": rebuild.get("repaired_face_ratio"),
                "geometry_deformed": validation.get("geometry_deformed", True),
                "zero_area_triangles": sum(value.get("zero_area_triangles", 0) for value in objects.values()),
                "overlap_pairs": sum(value.get("triangle_overlap_pairs", 0) for value in objects.values()),
                "out_of_bounds": sum(value.get("out_of_bounds", 0) for value in objects.values()),
                "negative_editable_islands": rebuild.get("editable_vertical_islands", {}).get("negative", 0),
                "max_geometry_distance": max(
                    (value.get("max_candidate_to_source_distance") or 0.0 for value in objects.values()),
                    default=0.0,
                ),
            }
        )

    payload = {
        "version": config.get("version"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate": str(args.candidate.resolve()),
        "total": len(rows),
        "passed": sum(row["pass"] for row in rows),
        "failed": sum(not row["pass"] for row in rows),
        "total_svg_paths": sum(row["svg_paths"] for row in rows),
        "total_zero_area_triangles": sum(row["zero_area_triangles"] for row in rows),
        "total_overlap_pairs": sum(row["overlap_pairs"] for row in rows),
        "total_out_of_bounds": sum(row["out_of_bounds"] for row in rows),
        "total_negative_editable_islands": sum(row["negative_editable_islands"] for row in rows),
        "geometry_deformed_models": sum(row["geometry_deformed"] for row in rows),
        "max_preserved_uv_shape_error": max(
            (row["preserved_uv_shape_max_error"] or 0.0 for row in rows),
            default=0.0,
        ),
        "max_geometry_distance": max((row["max_geometry_distance"] for row in rows), default=0.0),
        "models": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({key: value for key, value in payload.items() if key != "models"}, indent=2))


if __name__ == "__main__":
    main()

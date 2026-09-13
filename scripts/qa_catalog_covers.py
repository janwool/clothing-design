#!/usr/bin/env python3
"""Validate catalog cover dimensions, alpha, framing, brightness, and inventory."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat


def _expected_slugs(manifest: Path) -> list[str]:
    data = json.loads(manifest.read_text(encoding="utf-8"))
    return sorted(
        {
            str(asset["slug"])
            for asset in data.get("assets", [])
            if asset.get("field") == "file_url" and asset.get("slug")
        }
    )


def _inspect(path: Path, model_path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    model = Image.open(model_path).convert("RGBA")
    alpha = image.getchannel("A")
    model_alpha = model.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    model_bbox = model_alpha.point(lambda value: 255 if value >= 16 else 0).getbbox()
    issues: list[str] = []
    if image.size != (1200, 1500):
        issues.append("wrong-size")
    if bbox is None or model_bbox is None:
        issues.append("empty-alpha")
        return {"path": str(path), "issues": issues}

    left, top, right, bottom = model_bbox
    width = right - left
    height = bottom - top
    width_ratio = width / image.width
    height_ratio = height / image.height
    if min(left, top, image.width - right, image.height - bottom) < 4:
        issues.append("model-clipped")
    if width_ratio < 0.32 and height_ratio < 0.32:
        issues.append("model-too-small")

    opaque = model_alpha.point(lambda value: 255 if value >= 128 else 0)
    white = Image.new("RGB", model.size, "white")
    white.paste(model.convert("RGB"), mask=opaque)
    crop = white.crop(model_bbox)
    mean_rgb = ImageStat.Stat(crop).mean
    luminance = 0.2126 * mean_rgb[0] + 0.7152 * mean_rgb[1] + 0.0722 * mean_rgb[2]
    chroma = max(mean_rgb) - min(mean_rgb)
    if luminance < 155:
        issues.append("model-too-dark")
    if luminance > 252:
        issues.append("model-overexposed")
    if chroma > 12:
        issues.append("model-color-cast")

    return {
        "path": str(path),
        "size": list(image.size),
        "bbox": list(bbox),
        "modelBBox": list(model_bbox),
        "widthRatio": round(width_ratio, 4),
        "heightRatio": round(height_ratio, 4),
        "luminance": round(luminance, 2),
        "chroma": round(chroma, 2),
        "alphaExtrema": list(alpha.getextrema()),
        "issues": issues,
    }


def _contact_sheets(records: list[dict[str, object]], output_dir: Path) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    page_size = 25
    cell_w, cell_h = 240, 300
    for page, start in enumerate(range(0, len(records), page_size), 1):
        sheet = Image.new("RGB", (cell_w * 5, cell_h * 5), (244, 246, 248))
        draw = ImageDraw.Draw(sheet)
        for offset, record in enumerate(records[start : start + page_size]):
            source = Image.open(str(record["path"])).convert("RGBA")
            tile = Image.new("RGBA", (cell_w, cell_h), (244, 246, 248, 255))
            preview = source.copy()
            preview.thumbnail((cell_w - 20, cell_h - 48), Image.Resampling.LANCZOS)
            tile.alpha_composite(preview, ((cell_w - preview.width) // 2, 8))
            x = (offset % 5) * cell_w
            y = (offset // 5) * cell_h
            sheet.paste(tile.convert("RGB"), (x, y))
            slug = Path(str(record["path"])).stem
            label = slug if len(slug) <= 34 else slug[:31] + "..."
            color = (178, 32, 32) if record.get("issues") else (35, 39, 47)
            draw.text((x + 8, y + cell_h - 34), label, fill=color)
        path = output_dir / f"covers-contact-sheet-{page:02d}.jpg"
        sheet.save(path, quality=93)
        paths.append(str(path))
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--covers", required=True, type=Path)
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--contact-sheets", required=True, type=Path)
    args = parser.parse_args()

    expected = _expected_slugs(args.manifest)
    records: list[dict[str, object]] = []
    missing: list[str] = []
    for slug in expected:
        cover = args.covers / f"{slug}.webp"
        model = args.models / f"{slug}.png"
        if not cover.is_file() or not model.is_file():
            missing.append(slug)
            continue
        record = _inspect(cover, model)
        record["slug"] = slug
        records.append(record)

    sheets = _contact_sheets(records, args.contact_sheets)
    issue_records = [record for record in records if record.get("issues")]
    report = {
        "expected": len(expected),
        "checked": len(records),
        "missing": missing,
        "issueCount": len(issue_records),
        "issues": issue_records,
        "contactSheets": sheets,
        "records": records,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("expected", "checked", "missing", "issueCount")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

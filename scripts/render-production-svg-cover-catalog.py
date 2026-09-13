#!/usr/bin/env python3
"""Render every production D1 model's current SVG and cover side by side."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import math
import subprocess
import tempfile
import time
import urllib.request
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size, index=0)
    return ImageFont.load_default()


def safe_slug(value: object, model_id: object) -> str:
    slug = str(value or f"model-{model_id}")
    return "".join(char if char.isalnum() or char in "._-" else "-" for char in slug)


def download(url: object, path: Path) -> dict[str, object]:
    value = str(url or "").strip()
    if not value:
        return {"ok": False, "url": value, "error": "missing URL", "path": None}
    if path.exists() and path.stat().st_size > 0:
        data = path.read_bytes()
        return {
            "ok": True,
            "url": value,
            "status": 200,
            "content_type": "cached after production download",
            "etag": None,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "path": str(path.resolve()),
            "reused": True,
        }
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(value, headers={"User-Agent": "CLOZ-production-catalog-QA/1.0"})
            with urllib.request.urlopen(request, timeout=120) as response:
                data = response.read()
                status = response.status
                content_type = response.headers.get("Content-Type", "")
                etag = response.headers.get("ETag")
            if not data:
                raise ValueError("empty response")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return {
                "ok": True,
                "url": value,
                "status": status,
                "content_type": content_type,
                "etag": etag,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "path": str(path.resolve()),
                "reused": False,
            }
        except Exception as error:  # Retry transient CDN/TLS failures.
            last_error = error
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
    # Keep all production rows visible in the QA sheet.
    return {"ok": False, "url": value, "error": str(last_error), "path": None}


def contained(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    source = image.convert("RGBA")
    source.thumbnail(size, Image.Resampling.LANCZOS)
    plate = Image.new("RGBA", size, "white")
    plate.alpha_composite(source, ((size[0] - source.width) // 2, (size[1] - source.height) // 2))
    return plate.convert("RGB")


def placeholder(size: tuple[int, int], message: str) -> Image.Image:
    image = Image.new("RGB", size, "#fff4f4")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline="#ef4444", width=3)
    draw.text((18, size[1] // 2 - 12), message[:36], fill="#b91c1c", font=font(17, bold=True))
    return image


def shorten(value: object, length: int) -> str:
    text = str(value or "")
    return text if len(text) <= length else text[: length - 1] + "…"


def render_sheet(
    records: list[dict[str, object]],
    output: Path,
    title: str,
    subtitle: str,
    raster_by_slug: dict[str, Path],
    columns: int = 5,
) -> None:
    rows = math.ceil(len(records) / columns)
    cell_w, cell_h = 640, 470
    title_h = 110
    canvas = Image.new("RGB", (columns * cell_w, title_h + rows * cell_h), "#eef1f5")
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 18), title, fill="#111827", font=font(32, bold=True))
    draw.text((30, 61), subtitle, fill="#4b5563", font=font(18))

    label_font = font(17, bold=True)
    meta_font = font(14)
    side_font = font(15, bold=True)
    panel_size = (282, 340)

    for index, record in enumerate(records):
        col, row = index % columns, index // columns
        x0, y0 = col * cell_w, title_h + row * cell_h
        has_issue = not record["svg"]["ok"] or not record["cover"]["ok"]
        border = "#ef4444" if has_issue else "#cbd2dc"
        draw.rounded_rectangle(
            (x0 + 9, y0 + 7, x0 + cell_w - 9, y0 + cell_h - 9),
            radius=12,
            fill="white",
            outline=border,
            width=3 if has_issue else 2,
        )
        draw.text(
            (x0 + 22, y0 + 17),
            f"ID {record['id']}  {shorten(record['slug'], 46)}",
            fill="#111827",
            font=label_font,
        )
        draw.text(
            (x0 + 22, y0 + 43),
            f"{shorten(record['name'], 38)} · {shorten(record['category'], 22)} · {record['status']}",
            fill="#6b7280",
            font=meta_font,
        )
        draw.text((x0 + 22, y0 + 70), "线上 SVG", fill="#1d4ed8", font=side_font)
        draw.text((x0 + 336, y0 + 70), "线上封面", fill="#047857", font=side_font)

        slug = str(record["safe_slug"])
        if record["svg"]["ok"] and slug in raster_by_slug:
            svg_image = contained(Image.open(raster_by_slug[slug]), panel_size)
        else:
            svg_image = placeholder(panel_size, "SVG 缺失或无法读取")
        if record["cover"]["ok"]:
            try:
                cover_image = contained(Image.open(Path(record["cover"]["path"])), panel_size)
            except Exception as error:
                record["cover"]["ok"] = False
                record["cover"]["error"] = f"image decode: {error}"
                cover_image = placeholder(panel_size, "封面无法解码")
        else:
            cover_image = placeholder(panel_size, "封面缺失或无法读取")

        left_xy = (x0 + 20, y0 + 102)
        right_xy = (x0 + 334, y0 + 102)
        canvas.paste(svg_image, left_xy)
        canvas.paste(cover_image, right_xy)
        draw.rectangle((*left_xy, left_xy[0] + panel_size[0], left_xy[1] + panel_size[1]), outline="#d5dbe4", width=2)
        draw.rectangle((*right_xy, right_xy[0] + panel_size[0], right_xy[1] + panel_size[1]), outline="#d5dbe4", width=2)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path, help="Master contact-sheet PNG")
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--pages-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--page-size", type=int, default=25)
    parser.add_argument("--jobs", type=int, default=12)
    args = parser.parse_args()

    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    records: list[dict[str, object]] = []
    jobs: list[tuple[int, str, object, Path]] = []
    for model in snapshot["models"]:
        slug = safe_slug(model.get("slug"), model.get("id"))
        record = {
            "id": model.get("id"),
            "name": model.get("name"),
            "slug": model.get("slug") or slug,
            "safe_slug": slug,
            "category": model.get("category"),
            "status": model.get("status"),
            "updated_at": model.get("updated_at"),
            "svg": None,
            "cover": None,
        }
        index = len(records)
        records.append(record)
        jobs.append((index, "svg", model.get("texture_url"), args.cache_dir / "svg" / f"{slug}.svg"))
        jobs.append((index, "cover", model.get("image_url"), args.cache_dir / "cover" / f"{slug}.image"))

    def run(job: tuple[int, str, object, Path]) -> tuple[int, str, dict[str, object]]:
        index, kind, url, path = job
        return index, kind, download(url, path)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for index, kind, result in pool.map(run, jobs):
            records[index][kind] = result

    svg_paths = [Path(record["svg"]["path"]) for record in records if record["svg"]["ok"]]
    raster_by_slug: dict[str, Path] = {}
    with tempfile.TemporaryDirectory(prefix="production-svg-previews-") as directory:
        raster_dir = Path(directory)
        if svg_paths:
            subprocess.run(
                ["qlmanage", "-t", "-s", "900", "-o", str(raster_dir), *map(str, svg_paths)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        for record in records:
            if record["svg"]["ok"]:
                preview = raster_dir / f"{record['safe_slug']}.svg.png"
                if preview.exists():
                    raster_by_slug[str(record["safe_slug"])] = preview
                else:
                    record["svg"]["ok"] = False
                    record["svg"]["error"] = "Quick Look preview missing"

        queried = datetime.fromisoformat(snapshot["queriedAt"].replace("Z", "+00:00")).astimezone()
        subtitle = f"Cloudflare D1 当前绑定 · 查询时间 {queried:%Y-%m-%d %H:%M:%S %Z} · 左 SVG / 右封面"
        render_sheet(records, args.output, f"线上全部模型 SVG / 封面对照 — {len(records)} 项", subtitle, raster_by_slug)

        args.pages_dir.mkdir(parents=True, exist_ok=True)
        page_count = math.ceil(len(records) / args.page_size)
        page_paths = []
        for page in range(page_count):
            start = page * args.page_size
            end = min(start + args.page_size, len(records))
            page_path = args.pages_dir / f"production-svg-cover-page-{page + 1:02d}.png"
            render_sheet(
                records[start:end],
                page_path,
                f"线上模型 SVG / 封面对照 — 第 {page + 1}/{page_count} 页",
                f"ID 顺序 · 第 {start + 1}–{end} 项 · {subtitle}",
                raster_by_slug,
            )
            page_paths.append(str(page_path.resolve()))

    issues = [
        {"id": record["id"], "slug": record["slug"], "svg": record["svg"], "cover": record["cover"]}
        for record in records
        if not record["svg"]["ok"] or not record["cover"]["ok"]
    ]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(
            {
                "source": snapshot["source"],
                "queriedAt": snapshot["queriedAt"],
                "models": len(records),
                "active": sum(record["status"] == "active" for record in records),
                "svgDownloaded": sum(bool(record["svg"]["ok"]) for record in records),
                "coversDownloaded": sum(bool(record["cover"]["ok"]) for record in records),
                "issueCount": len(issues),
                "issues": issues,
                "master": str(args.output.resolve()),
                "pages": page_paths,
                "records": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"master": str(args.output.resolve()), "pages": page_paths, "issues": len(issues)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

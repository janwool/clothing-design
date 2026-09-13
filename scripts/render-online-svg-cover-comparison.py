#!/usr/bin/env python3
"""Download published SVG/cover pairs and render a side-by-side review sheet."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size, index=0)
    return ImageFont.load_default()


def download(url: str, path: Path) -> dict[str, object]:
    request = urllib.request.Request(url, headers={"User-Agent": "CLOZ-UV-QA/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
        status = response.status
        content_type = response.headers.get("Content-Type", "")
        etag = response.headers.get("ETag")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {
        "url": url,
        "status": status,
        "content_type": content_type,
        "etag": etag,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "path": str(path.resolve()),
    }


def contained(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGBA")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    plate = Image.new("RGBA", size, "white")
    x = (size[0] - image.width) // 2
    y = (size[1] - image.height) // 2
    plate.alpha_composite(image, (x, y))
    return plate.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("publish_manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--download-report", type=Path)
    args = parser.parse_args()

    selected = json.loads(args.config.read_text(encoding="utf-8"))["models"]
    published = json.loads(args.publish_manifest.read_text(encoding="utf-8"))["models"]
    published_by_id = {item["remoteId"]: item for item in published}

    records: list[dict[str, object]] = []
    for model in selected:
        item = published_by_id.get(model["id"])
        if item is None:
            raise SystemExit(f"Missing published item ID {model['id']}")
        urls = item["urls"]
        slug = model["slug"]
        svg_path = args.cache_dir / "svg" / f"{slug}.svg"
        cover_path = args.cache_dir / "cover" / f"{slug}.webp"
        records.append(
            {
                "id": model["id"],
                "slug": slug,
                "actualType": model["actualType"],
                "svg": download(urls["texture_url"], svg_path),
                "cover": download(urls["image_url"], cover_path),
            }
        )

    with tempfile.TemporaryDirectory(prefix="online-svg-previews-") as directory:
        raster_dir = Path(directory)
        svg_paths = [Path(record["svg"]["path"]) for record in records]
        subprocess.run(
            ["qlmanage", "-t", "-s", "900", "-o", str(raster_dir), *map(str, svg_paths)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        columns = 4
        rows = math.ceil(len(records) / columns)
        cell_w, cell_h = 700, 520
        title_h = 104
        canvas = Image.new("RGB", (columns * cell_w, title_h + rows * cell_h), "#eef1f5")
        draw = ImageDraw.Draw(canvas)
        draw.text((30, 20), "线上 SVG / 模型封面对照 — 28 项", fill="#111827", font=font(32, bold=True))
        draw.text((30, 62), "左：当前 CDN SVG    右：当前 CDN 模型封面", fill="#4b5563", font=font(20))

        label_font = font(18, bold=True)
        type_font = font(15)
        side_font = font(16, bold=True)
        panel_size = (310, 390)

        for index, record in enumerate(records):
            col, row = index % columns, index // columns
            x0, y0 = col * cell_w, title_h + row * cell_h
            draw.rounded_rectangle(
                (x0 + 10, y0 + 8, x0 + cell_w - 10, y0 + cell_h - 10),
                radius=12,
                fill="white",
                outline="#cbd2dc",
                width=2,
            )
            draw.text((x0 + 24, y0 + 20), f"ID {record['id']}  {record['slug']}", fill="#111827", font=label_font)
            draw.text((x0 + 24, y0 + 47), str(record["actualType"]), fill="#6b7280", font=type_font)
            draw.text((x0 + 24, y0 + 78), "线上 SVG", fill="#1d4ed8", font=side_font)
            draw.text((x0 + 366, y0 + 78), "模型封面", fill="#047857", font=side_font)

            svg_preview = raster_dir / f"{record['slug']}.svg.png"
            if not svg_preview.exists():
                raise SystemExit(f"Quick Look failed for {record['slug']}")
            svg_image = contained(Image.open(svg_preview), panel_size)
            cover_image = contained(Image.open(Path(record["cover"]["path"])), panel_size)
            left_xy = (x0 + 20, y0 + 108)
            right_xy = (x0 + 362, y0 + 108)
            canvas.paste(svg_image, left_xy)
            canvas.paste(cover_image, right_xy)
            draw.rectangle((*left_xy, left_xy[0] + panel_size[0], left_xy[1] + panel_size[1]), outline="#d5dbe4", width=2)
            draw.rectangle((*right_xy, right_xy[0] + panel_size[0], right_xy[1] + panel_size[1]), outline="#d5dbe4", width=2)

        args.output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(args.output, optimize=True)

    report_path = args.download_report or args.output.with_suffix(".json")
    report_path.write_text(
        json.dumps(
            {
                "source_manifest": str(args.publish_manifest.resolve()),
                "count": len(records),
                "output": str(args.output.resolve()),
                "records": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(args.output.resolve())
    print(report_path.resolve())


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build reviewable garment-mask SVG candidates without mutating the database."""

from __future__ import annotations

import argparse
import html
import json
import re
import sqlite3
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / "public/config/on-model-svg-mask-queue.json"
DATABASE_PATH = ROOT / "database.sqlite"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, required=True, help="One-based first queue item")
    parser.add_argument("--end", type=int, required=True, help="One-based final queue item")
    parser.add_argument("--output", type=Path, required=True, help="Candidate output directory")
    parser.add_argument("--epsilon", type=float, default=0.9, help="SVG contour simplification in pixels")
    parser.add_argument("--grabcut-iterations", type=int, default=6)
    return parser.parse_args()


def parse_mask(svg_data: str, height: int, width: int) -> np.ndarray:
    mask = np.zeros((height, width), np.uint8)
    for tag in re.findall(r"<path\b[^>]+>", svg_data):
        kind_match = re.search(r'data-mask-kind="([^"]+)"', tag)
        points_match = re.search(r'data-mask-points="([^"]+)"', tag)
        if not kind_match or not points_match:
            continue
        points = np.array([
            [round(float(value)) for value in pair.split(",")]
            for pair in points_match.group(1).split()
        ], np.int32)
        cv2.fillPoly(mask, [points], 0 if kind_match.group(1) == "subtract" else 255)
    return mask


def enclosed_hole_fill(mask: np.ndarray, maximum_area: int) -> np.ndarray:
    result = mask.copy()
    count, labels, stats, _ = cv2.connectedComponentsWithStats(cv2.bitwise_not(result), 8)
    height, width = result.shape
    for index in range(1, count):
        x, y, box_width, box_height, area = stats[index]
        enclosed = x > 0 and y > 0 and x + box_width < width and y + box_height < height
        if enclosed and area <= maximum_area:
            result[labels == index] = 255
    return result


def remove_tiny_components(mask: np.ndarray) -> np.ndarray:
    """Remove cleanup fragments while retaining meaningful occluded garment pieces."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        return mask
    largest_area = int(stats[1:, cv2.CC_STAT_AREA].max())
    minimum_area = max(32, round(largest_area * 0.001))
    result = np.zeros_like(mask)
    for index in range(1, count):
        if int(stats[index, cv2.CC_STAT_AREA]) >= minimum_area:
            result[labels == index] = 255
    return result


def component_count(mask: np.ndarray) -> int:
    count, _labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    return sum(int(stats[index, cv2.CC_STAT_AREA]) >= 20 for index in range(1, count))


def refine_mask(base: np.ndarray, old: np.ndarray, iterations: int) -> tuple[np.ndarray, dict]:
    height, width = old.shape
    old_fg = old > 0
    if not old_fg.any():
        return old.copy(), {"threshold": None, "reason": "empty source mask"}

    kernel_3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    expansion = max(18, round(min(height, width) * 0.032))
    allowed_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (expansion * 2 + 1, expansion * 2 + 1))
    allowed = cv2.dilate(old, allowed_kernel) > 0

    blue, green, red = cv2.split(base.astype(np.int16))
    luma = (blue + green + red) / 3.0
    chroma = np.maximum(np.maximum(blue, green), red) - np.minimum(np.minimum(blue, green), red)

    core = cv2.erode(old, kernel_5, iterations=2) > 0
    ring = (cv2.dilate(old, allowed_kernel) > 0) & ~old_fg
    neutral_core = core & (chroma < 42)
    neutral_ring = ring & (chroma < 35)
    foreground_values = luma[neutral_core]
    background_values = luma[neutral_ring]
    foreground_level = float(np.percentile(foreground_values, 62)) if foreground_values.size else 225.0
    background_level = float(np.percentile(background_values, 55)) if background_values.size else 185.0
    threshold = float(np.clip((foreground_level + background_level) / 2.0, 185.0, 225.0))

    definite_white = allowed & (luma >= threshold + 5) & (chroma < 34)
    probable_white = allowed & (luma >= threshold - 18) & (chroma < 42)
    skin = (red > blue + 22) & (red > green + 7) & (chroma > 28)
    dark = luma < 62

    grabcut = np.full(old.shape, cv2.GC_BGD, np.uint8)
    grabcut[allowed] = cv2.GC_PR_BGD
    grabcut[old_fg] = cv2.GC_PR_FGD
    grabcut[probable_white] = cv2.GC_PR_FGD
    grabcut[core] = cv2.GC_FGD
    grabcut[definite_white] = cv2.GC_FGD
    grabcut[allowed & (skin | dark)] = cv2.GC_BGD

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        base,
        grabcut,
        None,
        background_model,
        foreground_model,
        iterations,
        cv2.GC_INIT_WITH_MASK,
    )
    candidate = np.where(
        (grabcut == cv2.GC_FGD) | (grabcut == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
    kept = np.zeros_like(candidate)
    distance_from_old = cv2.distanceTransform((~old_fg).astype(np.uint8), cv2.DIST_L2, 5)
    for index in range(1, count):
        component = labels == index
        area = int(stats[index, cv2.CC_STAT_AREA])
        overlap = int(np.count_nonzero(component & old_fg))
        close = float(distance_from_old[component].min()) <= 4.0 if component.any() else False
        white_support = int(np.count_nonzero(component & definite_white))
        if overlap > 0 or (area >= 35 and close and white_support >= 20):
            kept[component] = 255

    kept = cv2.morphologyEx(kept, cv2.MORPH_OPEN, kernel_3)
    kept = enclosed_hole_fill(kept, max(350, round(np.count_nonzero(kept) * 0.003)))
    kept = cv2.medianBlur(kept, 3)
    kept = np.where(kept > 127, 255, 0).astype(np.uint8)
    kept = remove_tiny_components(kept)
    return kept, {
        "threshold": round(threshold, 2),
        "foregroundLevel": round(foreground_level, 2),
        "backgroundLevel": round(background_level, 2),
        "expansion": expansion,
    }


def contour_depth(hierarchy: np.ndarray, index: int) -> int:
    depth = 0
    parent = int(hierarchy[index][3])
    while parent >= 0:
        depth += 1
        parent = int(hierarchy[parent][3])
    return depth


def number(value: float) -> str:
    rounded = round(float(value), 2)
    return str(int(rounded)) if rounded.is_integer() else f"{rounded:.2f}".rstrip("0").rstrip(".")


def editable_svg(mask: np.ndarray, title: str, epsilon: float) -> tuple[str, int, int]:
    height, width = mask.shape
    contours, tree = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    hierarchy = tree[0] if tree is not None else []
    regions: list[tuple[str, np.ndarray, float]] = []
    for index, contour in enumerate(contours):
        area = abs(float(cv2.contourArea(contour)))
        if area < 20:
            continue
        points = cv2.approxPolyDP(contour, max(0.0, epsilon), True)
        if len(points) < 3:
            continue
        kind = "subtract" if contour_depth(hierarchy, index) % 2 else "add"
        regions.append((kind, points.reshape(-1, 2), area))
    regions.sort(key=lambda region: (region[0] == "subtract", -region[2]))

    add_index = cut_index = node_count = 0
    add_paths: list[str] = []
    cut_paths: list[str] = []
    for kind, points, _area in regions:
        if kind == "subtract":
            cut_index += 1
            identifier = f"cut-{cut_index}"
        else:
            add_index += 1
            identifier = f"region-{add_index}"
        node_count += len(points)
        serialized = " ".join(f"{number(x)},{number(y)}" for x, y in points)
        commands = [f"M {number(points[0][0])} {number(points[0][1])}"]
        commands.extend(f"L {number(x)} {number(y)}" for x, y in points[1:])
        markup = (
            f'    <path id="{identifier}" data-mask-kind="{kind}" data-mask-smoothing="0" '
            f'data-mask-points="{serialized}" d="{" ".join(commands)} Z"/>'
        )
        (cut_paths if kind == "subtract" else add_paths).append(markup)

    safe_title = html.escape(title)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{safe_title}">',
        f"  <title>{safe_title}</title>",
        f'  <rect width="{width}" height="{height}" fill="#000000"/>',
        '  <g id="mask-add" fill="#ffffff" shape-rendering="geometricPrecision">',
        *add_paths,
        "  </g>",
        '  <g id="mask-subtract" fill="#000000" shape-rendering="geometricPrecision">',
        *cut_paths,
        "  </g>",
        "</svg>",
        "",
    ]
    return "\n".join(lines), add_index + cut_index, node_count


def verified_editable_svg(
    mask: np.ndarray,
    title: str,
    preferred_epsilon: float,
) -> tuple[str, int, int, dict]:
    """Use the sparsest editable contour that stays within one diagonal pixel."""
    height, width = mask.shape
    epsilon_options = [preferred_epsilon, 0.7, 0.5, 0.35, 0.0]
    tried: set[float] = set()
    last_result = None
    for epsilon in epsilon_options:
        epsilon = max(0.0, min(float(epsilon), preferred_epsilon))
        if epsilon in tried:
            continue
        tried.add(epsilon)
        svg, region_count, node_count = editable_svg(mask, title, epsilon)
        rasterized = parse_mask(svg, height, width)
        missing_distance = cv2.distanceTransform(
            (rasterized == 0).astype(np.uint8), cv2.DIST_L2, 5
        )
        extra_distance = cv2.distanceTransform(
            (mask == 0).astype(np.uint8), cv2.DIST_L2, 5
        )
        maximum_inset = float(missing_distance[mask > 0].max()) if np.any(mask > 0) else 0.0
        maximum_outset = float(extra_distance[rasterized > 0].max()) if np.any(rasterized > 0) else 0.0
        different_pixels = int(np.count_nonzero(cv2.bitwise_xor(mask, rasterized)))
        last_result = (
            svg,
            region_count,
            node_count,
            {
                "vectorEpsilon": epsilon,
                "vectorDifferentPixels": different_pixels,
                "vectorMaximumInset": round(maximum_inset, 3),
                "vectorMaximumOutset": round(maximum_outset, 3),
            },
        )
        if maximum_inset <= 1.5 and maximum_outset <= 1.5:
            return last_result
    assert last_result is not None
    return last_result


def overlay_image(base: np.ndarray, mask: np.ndarray) -> np.ndarray:
    overlay = base.copy()
    foreground = mask > 0
    red = np.zeros_like(base)
    red[:, :, 2] = 255
    overlay[foreground] = (base[foreground] * 0.55 + red[foreground] * 0.45).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(overlay, contours, -1, (0, 0, 255), 2, cv2.LINE_AA)
    return overlay


def main() -> None:
    args = parse_args()
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))["items"]
    start = max(1, args.start)
    end = min(len(queue), args.end)
    if end < start:
        raise SystemExit("End must not precede start")
    args.output.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    manifest: list[dict] = []
    cards: list[np.ndarray] = []

    for number_index in range(start, end + 1):
        item = queue[number_index - 1]
        base_path = ROOT / "public" / item["baseImage"].lstrip("/")
        base = cv2.imread(str(base_path))
        if base is None:
            raise RuntimeError(f"Unable to read {base_path}")
        row = connection.execute(
            "SELECT svg_data, updated_at FROM on_model_mockup_svg_masks WHERE asset_name = ?",
            (item["id"],),
        ).fetchone()
        source_svg = row[0] if row else (ROOT / "public" / item["svgMask"].lstrip("/")).read_text(encoding="utf-8")
        old = parse_mask(source_svg, base.shape[0], base.shape[1])
        candidate, details = refine_mask(base, old, args.grabcut_iterations)
        svg, region_count, node_count, vector_details = verified_editable_svg(
            candidate,
            f"{item['label']} garment mask",
            args.epsilon,
        )

        item_dir = args.output / f"{number_index:03d}-{item['id']}"
        item_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(item_dir / "mask.png"), candidate)
        cv2.imwrite(str(item_dir / "overlay.png"), overlay_image(base, candidate))
        (item_dir / "mask.svg").write_text(svg, encoding="utf-8")

        old_area = int(np.count_nonzero(old))
        new_area = int(np.count_nonzero(candidate))
        union = int(np.count_nonzero((old > 0) | (candidate > 0)))
        intersection = int(np.count_nonzero((old > 0) & (candidate > 0)))
        delta_ratio = (new_area - old_area) / max(1, old_area)
        iou = intersection / max(1, union)
        old_components = component_count(old)
        new_components = component_count(candidate)
        flags = []
        if abs(delta_ratio) > 0.12:
            flags.append("area-change")
        if iou < 0.88:
            flags.append("low-iou")
        if abs(new_components - old_components) > 2:
            flags.append("component-change")
        record = {
            "index": number_index,
            "id": item["id"],
            "databaseUpdatedAt": row[1] if row else None,
            "oldArea": old_area,
            "newArea": new_area,
            "deltaRatio": round(delta_ratio, 5),
            "iou": round(iou, 5),
            "oldComponents": old_components,
            "newComponents": new_components,
            "regions": region_count,
            "nodes": node_count,
            "flags": flags,
            **vector_details,
            **details,
        }
        manifest.append(record)

        overlay = cv2.imread(str(item_dir / "overlay.png"))
        thumb = cv2.resize(overlay, (205, 307), interpolation=cv2.INTER_AREA)
        cv2.rectangle(thumb, (0, 0), (204, 42), (18, 18, 18), -1)
        cv2.putText(thumb, f"{number_index:03d} {item['id'][:20]}", (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.31, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(thumb, f"d {delta_ratio:+.1%}  iou {iou:.3f}", (5, 31), cv2.FONT_HERSHEY_SIMPLEX, 0.31, (220, 220, 220), 1, cv2.LINE_AA)
        if flags:
            cv2.circle(thumb, (195, 12), 5, (0, 0, 255), -1)
        cards.append(thumb)
        print(f"[{number_index:03d}] {item['id']}: {delta_ratio:+.2%}, IoU {iou:.4f}, {region_count} regions, {node_count} nodes{f' FLAG {flags}' if flags else ''}")

    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    columns = min(5, len(cards))
    rows = (len(cards) + columns - 1) // columns
    sheet = np.full((rows * 307, columns * 205, 3), 235, np.uint8)
    for index, card in enumerate(cards):
        row, column = divmod(index, columns)
        sheet[row * 307:(row + 1) * 307, column * 205:(column + 1) * 205] = card
    cv2.imwrite(str(args.output / f"contact-{start:03d}-{end:03d}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()

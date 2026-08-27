#!/usr/bin/env python3
"""Remove non-garment fragments from on-model masks without losing fabric panels."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public/config/on-model-mockup-assets.json"
ASSET_DIR = ROOT / "public/images/mockups/on-model/generated"
GRABCUT_PANEL_ASSETS = {
    "model-122-lightweight-hooded-puffer-vest-from3d-v1",
    "puffer-jacket-male-front",
    "structured-blazer-female-action",
}
BRIGHT_GARMENT_GUARD_ASSETS = {
    "open-front-blazer-female-front",
}
VISUAL_SOFT_ALPHA_STROKES = {
    # This generated photograph has an unusually deep fold where the right
    # sleeve overlaps the body. Keep the fabric colored, but reduce tint inside
    # the fold so it reads as depth instead of a solid blue strip. Coordinates
    # are normalized to keep the correction resolution-independent.
    "model-004-roll-sleeve-henley-from3d-v1": ({
        "points": (
            (0.6045, 0.2930),
            (0.6035, 0.3320),
            (0.6065, 0.3710),
            (0.6115, 0.3970),
            (0.6175, 0.4245),
        ),
        "radius": 0.0042,
        "strength": 0.52,
        "dark_start": 224,
        "dark_full": 92,
    },),
}


@dataclass
class Component:
    ys: np.ndarray
    xs: np.ndarray
    area: int
    neutral_ratio: float
    skin_ratio: float
    span_width: int
    span_height: int
    left: int
    top: int
    right: int
    bottom: int


def infer_region(record):
    region = str(record.get("garmentType", "")).lower()
    if region in {"head", "accessory", "upper", "lower", "full"}:
        return region
    name = record["assetName"].lower()
    if any(word in name for word in ("cap", "hat", "headpiece", "headscarf")):
        return "head"
    if "sling" in name or "bag" in name:
        return "accessory"
    if any(word in name for word in ("pants", "trouser", "jogger", "legging", "shorts", "skirt")):
        return "lower"
    if any(word in name for word in ("dress", "jumpsuit", "romper", "gown", "robe", "coat", "poncho", "cape")):
        return "full"
    return "upper"


def color_classes(rgb):
    image = Image.fromarray(rgb, "RGB")
    hsv = np.asarray(image.convert("HSV"))
    ycbcr = np.asarray(image.convert("YCbCr"))
    hue, saturation, value = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    # Pillow exposes Y, Cb, Cr (OpenCV's similarly named conversion is Y, Cr, Cb).
    cb, cr = ycbcr[:, :, 1], ycbcr[:, :, 2]
    neutral = (saturation <= 78) & (value >= 112)
    skin = (
        (cr >= 132) & (cr <= 182) & (cb >= 74) & (cb <= 138)
        & (saturation >= 66) & (value >= 48)
        & ((hue <= 32) | (hue >= 245))
    )
    return neutral, skin


def connected_components(binary, neutral, skin):
    binary = np.asarray(binary, dtype=np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    components = []
    for label in range(1, count):
        left, top, span_width, span_height, area = stats[label]
        ys, xs = np.where(labels == label)
        components.append(Component(
            ys,
            xs,
            int(area),
            float(neutral[ys, xs].mean()),
            float(skin[ys, xs].mean()),
            int(span_width),
            int(span_height),
            int(left),
            int(top),
            int(left + span_width - 1),
            int(top + span_height - 1),
        ))
    return sorted(components, key=lambda item: item.area, reverse=True)


def select_components(components, region, name):
    if not components:
        return [], []
    largest = components[0]
    retained, removed = [largest], []
    coordinated_set = any(token in name for token in ("-set-", "maxi-set", "skirt-set"))
    multi_panel = any(token in name for token in ("vest", "jacket", "blazer", "coat", "puffer", "open-front"))
    for component in components[1:]:
        ratio = component.area / max(1, largest.area)
        keep = ratio >= 0.08 and component.neutral_ratio >= 0.30 and component.skin_ratio <= 0.34
        if region == "lower":
            keep = False
        if region == "full" and not coordinated_set and not multi_panel:
            keep = False
        if multi_panel:
            keep = ratio >= 0.032 and component.neutral_ratio >= 0.22 and component.skin_ratio <= 0.50
            slenderness = min(component.span_width, component.span_height) / max(
                component.span_width, component.span_height
            )
            if slenderness < 0.16 and not any(token in name for token in ("strap", "tie")):
                keep = False
        if coordinated_set:
            keep = ratio >= 0.055 and component.neutral_ratio >= 0.26 and component.skin_ratio <= 0.36
        if region in {"head", "accessory"}:
            keep = ratio >= 0.055 and component.neutral_ratio >= 0.38 and component.skin_ratio <= 0.22
        detached_below = (
            region == "upper"
            and component.top > largest.bottom + max(2, round(largest.span_height * 0.025))
            and not any(token in name for token in ("tie", "scarf", "strap", "tail", "tunic"))
        )
        if detached_below:
            keep = False
        (retained if keep else removed).append(component)
    return retained, removed


def component_mask(shape, components):
    output = np.zeros(shape, dtype=np.uint8)
    for component in components:
        output[component.ys, component.xs] = 255
    return output


def recover_missing_white_panels(selected, rgb, neutral, skin, region, name):
    """Recover omitted panels using the trusted mask as GrabCut supervision."""
    if name not in GRABCUT_PANEL_ASSETS or not np.any(selected):
        return selected, 0
    source_selected = selected > 0
    ys, xs = np.where(source_selected)
    height, width = selected.shape
    pad_x = max(18, round((xs.max() - xs.min() + 1) * 0.42))
    pad_y = max(18, round((ys.max() - ys.min() + 1) * 0.34))
    left, right = max(1, int(xs.min()) - pad_x), min(width - 2, int(xs.max()) + pad_x)
    top, bottom = max(1, int(ys.min()) - pad_y), min(height - 2, int(ys.max()) + pad_y)
    roi = np.zeros_like(selected, dtype=bool)
    roi[top:bottom + 1, left:right + 1] = True
    brightness = rgb.astype(np.float32).mean(axis=2)
    grabcut_mask = np.full(selected.shape, cv2.GC_BGD, dtype=np.uint8)
    grabcut_mask[roi] = cv2.GC_PR_BGD
    grabcut_mask[roi & neutral & (brightness >= 130)] = cv2.GC_PR_FGD
    grabcut_mask[source_selected & roi] = cv2.GC_PR_FGD
    core = np.asarray(Image.fromarray(selected, "L").filter(ImageFilter.MinFilter(5))) > 0
    grabcut_mask[core] = cv2.GC_FGD
    grabcut_mask[skin] = cv2.GC_BGD
    grabcut_mask[roi & (brightness < 80) & ~source_selected] = cv2.GC_BGD
    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(
        cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR),
        grabcut_mask,
        None,
        background_model,
        foreground_model,
        6,
        cv2.GC_INIT_WITH_MASK,
    )
    recovered_mask = np.isin(grabcut_mask, (cv2.GC_FGD, cv2.GC_PR_FGD))
    recovered_mask |= source_selected
    recovered_components = connected_components(recovered_mask, neutral, skin)
    retained, _ = select_components(recovered_components, region, name)
    recovered_selected = component_mask(selected.shape, retained)
    recovered = int(np.count_nonzero((recovered_selected > 0) & ~source_selected))
    return recovered_selected, recovered


def refine_white_garment_boundary(selected, rgb, neutral, skin, region, name):
    """Use the source photograph to reject studio pixels inside a coarse mask.

    Generated white garments can be separated reliably from the neutral studio
    when the existing semantic mask supplies the region and bright fabric
    supplies definite foreground seeds. This removes background wedges between
    sleeves and the torso as well as the pale fringe outside cuffs and collars.
    """
    if region != "upper" or not np.any(selected):
        return selected, 0
    source = selected > 0
    source_area = int(np.count_nonzero(source))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    outer_guard = cv2.dilate(source.astype(np.uint8), kernel, iterations=2) > 0
    inner_core = cv2.erode(source.astype(np.uint8), kernel, iterations=2) > 0
    brightness = rgb.astype(np.float32).mean(axis=2)
    strong_fabric = inner_core & neutral & ~skin & (brightness >= 172)
    if np.count_nonzero(strong_fabric) < max(32, round(source_area * 0.08)):
        return selected, 0

    grabcut_mask = np.full(selected.shape, cv2.GC_BGD, dtype=np.uint8)
    grabcut_mask[outer_guard] = cv2.GC_PR_BGD
    grabcut_mask[source] = cv2.GC_PR_FGD
    grabcut_mask[strong_fabric] = cv2.GC_FGD
    grabcut_mask[skin] = cv2.GC_BGD
    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(
        cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR),
        grabcut_mask,
        None,
        background_model,
        foreground_model,
        6,
        cv2.GC_INIT_WITH_MASK,
    )
    candidate = np.isin(grabcut_mask, (cv2.GC_FGD, cv2.GC_PR_FGD)) & source
    candidate_components = connected_components(candidate, neutral, skin)
    retained, _ = select_components(candidate_components, region, name)
    cleaned = component_mask(selected.shape, retained)
    cleaned_area = int(np.count_nonzero(cleaned))
    removed = source_area - cleaned_area
    # A photographic refinement should trim a boundary, never replace a large
    # part of the semantic garment. Fall back when the color model is uncertain.
    if cleaned_area < round(source_area * 0.84):
        return selected, 0
    return cleaned, removed


def fill_non_skin_holes(selected, neutral, skin):
    """Restore enclosed pocket/fold gaps while preserving skin and true cutouts."""
    background_components = connected_components(selected == 0, neutral, skin)
    height, width = selected.shape
    maximum_area = max(24, round(np.count_nonzero(selected) * 0.012))
    filled = 0
    for component in background_components:
        if component.area > maximum_area or component.skin_ratio >= 0.22:
            continue
        if component.top == 0 or component.left == 0 or component.bottom == height - 1 or component.right == width - 1:
            continue
        selected[component.ys, component.xs] = 255
        filled += component.area
    return selected, filled


def remove_thin_connected_overflow(selected, neutral, skin, region, name):
    """Break hairline bridges before retaining the actual garment panels.

    Some generated masks join hands or background islands to a sleeve with a
    one-pixel trail. Connected-component filtering alone cannot remove those
    shapes because they appear to be part of the main garment. A small opening
    breaks only those hairline bridges; the retained core is then expanded back
    over the original mask so real photographic garment edges stay intact.
    """
    if region != "upper" or any(
        token in name for token in ("strap", "tie", "scarf", "fringe", "cami", "spaghetti")
    ):
        return selected, 0
    binary = (selected > 0).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    opened_components = connected_components(opened > 0, neutral, skin)
    retained, _ = select_components(opened_components, region, name)
    if not retained:
        return selected, 0
    core = component_mask(selected.shape, retained)
    guard = cv2.dilate(core, kernel, iterations=2) > 0
    cleaned = np.where((selected > 0) & guard, 255, 0).astype(np.uint8)
    return cleaned, int(np.count_nonzero(selected) - np.count_nonzero(cleaned))


def constrain_to_bright_garment(selected, rgb, name):
    """Remove a large neutral studio patch fused to a known white garment."""
    if name not in BRIGHT_GARMENT_GUARD_ASSETS:
        return selected, 0
    brightness = rgb.astype(np.float32).mean(axis=2)
    bright_core = ((selected > 0) & (brightness >= 215)).astype(np.uint8)
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    bright_core = cv2.morphologyEx(bright_core, cv2.MORPH_CLOSE, close_kernel)
    edge_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    guard = cv2.dilate(bright_core, edge_kernel, iterations=1) > 0
    cleaned = np.where((selected > 0) & guard, 255, 0).astype(np.uint8)
    return cleaned, int(np.count_nonzero(selected) - np.count_nonzero(cleaned))


def trim_semantic_overflow(selected, neutral, region, name):
    """Trim attached trousers/footwear that color segmentation joined to a garment."""
    binary = selected > 0
    row_area = binary.sum(axis=1)
    height, width = binary.shape
    active_rows = np.where(row_area > 0)[0]
    if not len(active_rows):
        return selected, 0
    removed = 0
    if region == "upper":
        # A shirt or jacket can acquire narrow mask trails below both cuffs and
        # the torso hem. Find the last genuinely broad garment row, then remove
        # only a small, narrow continuation below it. Substantial long sleeves,
        # asymmetric panels, and real garment tails exceed this safety budget.
        broad_threshold = max(
            6,
            round(width * 0.09),
            round(float(row_area.max()) * 0.18),
        )
        broad_rows = np.where(row_area >= broad_threshold)[0]
        if len(broad_rows):
            bottom = int(broad_rows.max())
            cutoff = min(height, bottom + 3)
            tail_area = int(np.count_nonzero(selected[cutoff:, :]))
            total_area = int(np.count_nonzero(selected))
            if tail_area and tail_area <= round(total_area * 0.08):
                removed += tail_area
                selected[cutoff:, :] = 0
                binary = selected > 0
                row_area = binary.sum(axis=1)
                active_rows = np.where(row_area > 0)[0]
                if not len(active_rows):
                    return selected, removed
    if region == "lower":
        # Lower-body masks sometimes remain connected to a dark top through a
        # narrow triangle above the waistband. Keep a small allowance for the
        # real waist contour, but remove the thin continuation above it.
        threshold = max(4, round(width * 0.052), round(float(row_area.max()) * 0.14))
        broad_rows = np.where(row_area >= threshold)[0]
        if len(broad_rows):
            waist = int(broad_rows.min())
            cutoff = max(0, waist - 3)
            removed += int(np.count_nonzero(selected[:cutoff, :]))
            selected[:cutoff, :] = 0
            binary = selected > 0
            row_area = binary.sum(axis=1)
            active_rows = np.where(row_area > 0)[0]
            if not len(active_rows):
                return selected, removed
    is_short_lower = region == "lower" and any(token in name for token in ("skirt", "shorts"))
    if region in {"upper", "lower", "full"} and not is_short_lower:
        # White garment pixels remain neutral even in folds. Shoes and exposed legs
        # below the hem do not, so the last sustained neutral row is the true bottom.
        # This retains pointed and asymmetric hems that a horizontal width rule cuts.
        neutral_area = (binary & neutral).sum(axis=1)
        neutral_share = neutral_area / np.maximum(1, row_area)
        minimum_row = int(active_rows.min() + (active_rows.max() - active_rows.min()) * 0.45)
        valid = np.where(
            (np.arange(height) >= minimum_row)
            & (row_area >= max(3, round(width * 0.012)))
            & (neutral_share >= 0.18)
        )[0]
        if len(valid):
            bottom = int(valid.max())
            cutoff = min(height, bottom + 3)
            tail = selected[cutoff:, :]
            tail_area = int(np.count_nonzero(tail))
            # Only trim when the tail is a small continuation, never a substantial
            # skirt panel, trouser leg, cape point, or train.
            maximum_tail_fraction = 0.35 if region == "upper" else 0.16
            if tail_area and tail_area <= int(np.count_nonzero(selected) * maximum_tail_fraction):
                removed += tail_area
                selected[cutoff:, :] = 0
    return selected, removed


def apply_visual_soft_alpha_strokes(refined, rgb, name):
    """Apply reviewed, feathered opacity corrections without binary cutouts.

    These strokes are reserved for photographic folds whose meaning is clear
    visually but ambiguous to semantic segmentation. Each stroke sets a soft
    upper bound on alpha, so rerunning refinement is idempotent and can never
    turn a garment panel into a hard white hole.
    """
    strokes = VISUAL_SOFT_ALPHA_STROKES.get(name)
    if not strokes:
        return refined, 0
    height, width = refined.shape
    luminance = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    output = refined.copy()
    changed = np.zeros_like(refined, dtype=bool)
    for stroke in strokes:
        centerline = np.zeros_like(refined, dtype=np.uint8)
        points = np.asarray([
            (round(x * width), round(y * height)) for x, y in stroke["points"]
        ], dtype=np.int32)
        radius = max(2, round(stroke["radius"] * min(width, height)))
        cv2.polylines(
            centerline,
            [points],
            isClosed=False,
            color=255,
            thickness=max(1, radius),
            lineType=cv2.LINE_AA,
        )
        feather = cv2.GaussianBlur(
            centerline.astype(np.float32) / 255.0,
            (0, 0),
            sigmaX=max(1.0, radius * 0.82),
        )
        maximum = float(feather.max())
        if maximum > 0:
            feather /= maximum
        dark_range = max(1, stroke["dark_start"] - stroke["dark_full"])
        tone = np.clip((stroke["dark_start"] - luminance) / dark_range, 0.0, 1.0)
        reduction = float(stroke["strength"]) * feather * tone
        target = np.rint(255.0 * (1.0 - reduction)).astype(np.uint8)
        updated = np.minimum(output, target)
        changed |= updated != output
        output = updated
    return output, int(np.count_nonzero(changed))


def refine_mask(base, mask, record, person_alpha=None):
    width, height = mask.size
    scale = min(1.0, 512 / max(width, height))
    size = max(64, round(width * scale)), max(64, round(height * scale))
    rgb = np.asarray(base.convert("RGB").resize(size, Image.Resampling.LANCZOS))
    source = np.asarray(mask.convert("L").resize(size, Image.Resampling.BILINEAR))
    if person_alpha is not None:
        person_work = np.asarray(
            person_alpha.convert("L").resize(size, Image.Resampling.BILINEAR),
            dtype=np.uint8,
        )
        source = np.minimum(source, person_work)
    neutral, skin = color_classes(rgb)
    components = connected_components(source >= 128, neutral, skin)
    region = infer_region(record)
    retained, removed = select_components(components, region, record["assetName"].lower())
    selected = component_mask(source.shape, retained)
    selected, recovered_white_pixels = recover_missing_white_panels(
        selected, rgb, neutral, skin, region, record["assetName"].lower()
    )
    selected, photographic_boundary_pixels_removed = refine_white_garment_boundary(
        selected, rgb, neutral, skin, region, record["assetName"].lower()
    )

    # Remove hands and faces that remain connected to sleeves, hats, or scarves.
    skin_only = skin & ~neutral & (selected > 0)
    if np.any(skin_only):
        skin_map = Image.fromarray((skin_only * 255).astype(np.uint8), "L")
        skin_map = skin_map.filter(ImageFilter.MaxFilter(3))
        selected[np.asarray(skin_map) > 0] = 0
    selected, thin_overflow_pixels_removed = remove_thin_connected_overflow(
        selected, neutral, skin, region, record["assetName"].lower()
    )
    selected, neutral_studio_pixels_removed = constrain_to_bright_garment(
        selected, rgb, record["assetName"].lower()
    )
    is_short_lower = region == "lower" and any(
        token in record["assetName"].lower() for token in ("skirt", "shorts")
    )
    if is_short_lower:
        # Legs or dark tights can touch a skirt/short hem and therefore remain a
        # single component. Use the white-garment color field as a local guard,
        # dilated enough to retain seams, folds, and photographic edge pixels.
        complex_hem = any(
            token in record["assetName"].lower()
            for token in ("pleat", "layered", "asymmetric", "handkerchief", "wrap", "circle")
        )
        if not complex_hem:
            white_seed = neutral & (selected > 0) & (rgb.astype(np.float32).mean(axis=2) >= 165)
            neutral_guard = Image.fromarray((white_seed * 255).astype(np.uint8), "L")
            neutral_guard = neutral_guard.filter(ImageFilter.MinFilter(9)).filter(
                ImageFilter.MaxFilter(9)
            )
            neutral_guard = neutral_guard.filter(ImageFilter.MaxFilter(13))
            selected[np.asarray(neutral_guard) == 0] = 0
    # Removing skin disconnects hands, legs, and footwear from the garment.
    # Re-run component selection now so these pieces can be dropped without
    # flattening a diagonal, pointed, or asymmetric garment edge.
    post_skin_components = connected_components(selected > 0, neutral, skin)
    post_skin_retained, post_skin_removed = select_components(
        post_skin_components, region, record["assetName"].lower()
    )
    selected = component_mask(source.shape, post_skin_retained)
    selected, hole_pixels_filled = fill_non_skin_holes(selected, neutral, skin)
    selected, semantic_pixels_removed = trim_semantic_overflow(
        selected, neutral, region, record["assetName"].lower()
    )
    selected_image = Image.fromarray(selected, "L")
    selected_image = selected_image.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    # Bilinear upscaling restores a soft photographic edge. Do not dilate the
    # working mask here: one working pixel becomes several export pixels and
    # creates the visible color fringe this pass is intended to remove.
    limiter = selected_image.resize((width, height), Image.Resampling.BILINEAR)
    limiter = limiter.filter(ImageFilter.GaussianBlur(radius=max(0.45, min(width, height) / 2200)))
    original = np.asarray(mask.convert("L"), dtype=np.uint8)
    limiter_pixels = np.asarray(limiter, dtype=np.uint8)
    refined = np.minimum(original, limiter_pixels)
    if recovered_white_pixels:
        refined = np.where(original >= 3, refined, limiter_pixels).astype(np.uint8)
    person_full = None
    if person_alpha is not None:
        person_full = np.asarray(
            person_alpha.convert("L").resize((width, height), Image.Resampling.BILINEAR),
            dtype=np.uint8,
        )
        refined = np.minimum(refined, person_full)

    fragile_edge = any(
        token in record["assetName"].lower()
        for token in ("strap", "tie", "scarf", "fringe", "cami", "spaghetti")
    )
    if region in {"upper", "lower", "full"} and not fragile_edge:
        # Pull the semantic edge one export pixel inside the garment, then
        # recover only bright neutral fabric immediately beside it. This keeps
        # white collar and cuff pixels while rejecting gray studio wedges and
        # skin around the hands and neckline.
        edge_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        refined = cv2.erode(refined, edge_kernel, iterations=1)
        base_rgb = np.asarray(base.convert("RGB"))
        hsv = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2HSV)
        ycrcb = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2YCrCb)
        full_skin = (
            (ycrcb[:, :, 1] >= 132) & (ycrcb[:, :, 1] <= 182)
            & (ycrcb[:, :, 2] >= 74) & (ycrcb[:, :, 2] <= 138)
            & (hsv[:, :, 1] >= 42) & (hsv[:, :, 2] >= 48)
        )
        skin_guard = cv2.dilate(full_skin.astype(np.uint8), edge_kernel, iterations=1) > 0
        near_skin = cv2.dilate(
            full_skin.astype(np.uint8),
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)),
            iterations=1,
        ) > 0
        person_guard = person_full >= 96 if person_full is not None else np.ones_like(full_skin)
        bright_fabric = (
            (hsv[:, :, 1] <= 70) & (hsv[:, :, 2] >= 170)
            & person_guard & ~skin_guard
        )
        collar_fabric = (
            (hsv[:, :, 1] <= 45) & (hsv[:, :, 2] >= 205)
            & near_skin & ~full_skin
        )
        recovery_guard = cv2.dilate(
            (refined >= 96).astype(np.uint8),
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
            iterations=1,
        ) > 0
        refined = np.where(
            recovery_guard & (bright_fabric | collar_fabric), 255, refined
        ).astype(np.uint8)
        # A 1.5px subpixel feather removes the stair-step contour left by the
        # segmentation raster without moving the semantic garment boundary.
        # The editor's inward opacity curve then discards the faint outer tail,
        # so arm gaps and exposed skin stay untouched.
        refined = cv2.GaussianBlur(refined, (0, 0), sigmaX=1.5)
    refined, visually_softened_pixels = apply_visual_soft_alpha_strokes(
        refined,
        np.asarray(base.convert("RGB")),
        record["assetName"].lower(),
    )
    refined[refined < 3] = 0
    original_area = int(np.count_nonzero(original >= 128))
    refined_area = int(np.count_nonzero(refined >= 128))
    return Image.fromarray(refined, "L"), {
        "assetName": record["assetName"],
        "region": region,
        "componentsBefore": len(components),
        "componentsRetained": len(retained),
        "componentsRemoved": len(removed) + len(post_skin_removed),
        "postSkinComponents": len(post_skin_components),
        "postSkinComponentsRetained": len(post_skin_retained),
        "skinPixelsRemovedAtWorkingSize": int(np.count_nonzero(skin_only)),
        "thinOverflowPixelsRemovedAtWorkingSize": thin_overflow_pixels_removed,
        "neutralStudioPixelsRemovedAtWorkingSize": neutral_studio_pixels_removed,
        "whitePanelPixelsRecoveredAtWorkingSize": recovered_white_pixels,
        "photographicBoundaryPixelsRemovedAtWorkingSize": photographic_boundary_pixels_removed,
        "holePixelsFilledAtWorkingSize": hole_pixels_filled,
        "semanticPixelsRemovedAtWorkingSize": semantic_pixels_removed,
        "visuallySoftenedPixels": visually_softened_pixels,
        "originalCoverage": original_area / (width * height),
        "refinedCoverage": refined_area / (width * height),
        "removedFractionOfMask": max(0, original_area - refined_area) / max(1, original_area),
    }


def update_record(record, mask):
    updated = dict(record)
    binary = np.asarray(mask) >= 128
    ys, xs = np.where(binary)
    width, height = mask.size
    updated["coverage"] = round(float(binary.mean()), 6)
    if len(xs):
        padding = max(2, round(min(width, height) * 0.006))
        updated["render"] = [
            max(0, int(xs.min()) - padding), max(0, int(ys.min()) - padding),
            min(width, int(xs.max()) + 1 + padding), min(height, int(ys.max()) + 1 + padding),
        ]
    method = str(record.get("method", "existing"))
    if "commercial-refine-v10" not in method:
        updated["method"] = f"{method}+commercial-refine-v10"
    return updated


def atomic_save(image, path):
    temporary = path.with_name(f".{path.name}.tmp.png")
    image.save(temporary, format="PNG", optimize=True)
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--asset-dir", type=Path, default=ASSET_DIR)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--force", action="store_true",
        help="Reprocess masks already marked commercial-refine-v10.",
    )
    parser.add_argument(
        "--asset", action="append", default=[],
        help="Only process the named asset (repeatable).",
    )
    parser.add_argument(
        "--region", choices=("head", "accessory", "upper", "lower", "full"),
        help="Only process assets in this garment region.",
    )
    parser.add_argument("--start-index", type=int, default=1)
    parser.add_argument("--end-index", type=int)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--foreground-model",
        default="u2net_human_seg",
        help="Human segmentation model used to preserve true arm and body cutouts; pass none to disable.",
    )
    args = parser.parse_args()
    remove_background = None
    foreground_session = None
    if args.foreground_model.lower() != "none":
        try:
            from rembg import new_session, remove
        except ImportError as error:
            raise SystemExit(
                "Foreground-aware mask refinement requires rembg and onnxruntime. "
                "Install requirements-on-model-mockups.txt or pass --foreground-model none."
            ) from error
        foreground_session = new_session(args.foreground_model)
        remove_background = remove
    manifest = json.loads(args.manifest.read_text())
    reports, updated_assets = [], []
    for index, record in enumerate(manifest["assets"], start=1):
        if index < args.start_index or (args.end_index and index > args.end_index):
            updated_assets.append(record)
            continue
        if args.region and infer_region(record) != args.region:
            updated_assets.append(record)
            continue
        if args.asset and record["assetName"] not in args.asset:
            updated_assets.append(record)
            continue
        if "commercial-refine-v10" in str(record.get("method", "")) and not args.force:
            updated_assets.append(record)
            print(
                f"[{index:03d}/{len(manifest['assets']):03d}] {record['assetName']}: "
                "already refined; skipped"
            )
            continue
        base_path = args.asset_dir / Path(record["baseImageUrl"]).name
        mask_path = args.asset_dir / Path(record["maskImageUrl"]).name
        depth_path = args.asset_dir / Path(record["depthImageUrl"]).name
        base_image = Image.open(base_path)
        person_alpha = None
        if remove_background is not None:
            person_alpha = remove_background(
                base_image.convert("RGB"), session=foreground_session, only_mask=True
            )
            if not isinstance(person_alpha, Image.Image):
                person_alpha = Image.fromarray(np.asarray(person_alpha, dtype=np.uint8))
        refined, report = refine_mask(
            base_image, Image.open(mask_path), record, person_alpha=person_alpha
        )
        reports.append(report)
        updated_assets.append(update_record(record, refined))
        if args.apply:
            atomic_save(refined, mask_path)
            depth = np.asarray(Image.open(depth_path).convert("L"), dtype=np.uint8).copy()
            depth[np.asarray(refined) < 4] = 128
            atomic_save(Image.fromarray(depth, "L"), depth_path)
        print(
            f"[{index:03d}/{len(manifest['assets']):03d}] {record['assetName']}: "
            f"removed {report['removedFractionOfMask']:.2%}, "
            f"components {report['componentsBefore']} -> {report['componentsRetained']}"
        )
    if args.apply:
        manifest["assets"] = updated_assets
        temporary = args.manifest.with_name(f".{args.manifest.name}.tmp")
        temporary.write_text(json.dumps(manifest, indent=2) + "\n")
        os.replace(temporary, args.manifest)
    if args.report:
        args.report.write_text(json.dumps({"assets": reports}, indent=2) + "\n")
    print(
        f"Refined {sum(item['removedFractionOfMask'] > 0 for item in reports)} masks; "
        f"removed {sum(item['componentsRemoved'] for item in reports)} disconnected components."
    )
    if not args.apply:
        print("Dry run only. Pass --apply to write masks, depth maps, and manifest metadata.")


if __name__ == "__main__":
    main()

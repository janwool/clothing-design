#!/usr/bin/env python3
"""Build a reusable shirt mask and fold/depth map from a generated model photo."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def scaled_points(points: list[tuple[float, float]], width: int, height: int) -> np.ndarray:
    return np.array(
        [[round(x * width), round(y * height)] for x, y in points],
        dtype=np.int32,
    )


def largest_seeded_component(binary: np.ndarray, seed: tuple[float, float]) -> np.ndarray:
    height, width = binary.shape
    seed_x = min(width - 1, max(0, round(seed[0] * width)))
    seed_y = min(height - 1, max(0, round(seed[1] * height)))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    label = labels[seed_y, seed_x]
    if label == 0 and count > 1:
        label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return np.where(labels == label, 255, 0).astype(np.uint8)


def build_mask(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    garment_outline = scaled_points(
        [
            (0.420, 0.245),
            (0.384, 0.266),
            (0.335, 0.276),
            (0.253, 0.296),
            (0.219, 0.330),
            (0.190, 0.458),
            (0.201, 0.476),
            (0.264, 0.488),
            (0.250, 0.752),
            (0.258, 0.779),
            (0.320, 0.793),
            (0.500, 0.800),
            (0.676, 0.792),
            (0.705, 0.766),
            (0.731, 0.488),
            (0.792, 0.476),
            (0.840, 0.460),
            (0.770, 0.296),
            (0.657, 0.273),
            (0.585, 0.249),
            (0.548, 0.266),
            (0.500, 0.307),
            (0.447, 0.269),
        ],
        width,
        height,
    )

    mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    cv2.fillPoly(mask, [garment_outline], cv2.GC_PR_FGD)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    value = hsv[:, :, 2]
    saturation = hsv[:, :, 1]
    likely_white = (value >= 182) & (saturation <= 58)
    inside_outline = np.zeros_like(mask, dtype=np.uint8)
    cv2.fillPoly(inside_outline, [garment_outline], 255)
    mask[(inside_outline > 0) & likely_white] = cv2.GC_FGD

    torso_seed = scaled_points(
        [
            (0.315, 0.355),
            (0.685, 0.355),
            (0.700, 0.735),
            (0.300, 0.735),
        ],
        width,
        height,
    )
    left_sleeve_seed = scaled_points(
        [(0.240, 0.335), (0.335, 0.300), (0.350, 0.455), (0.220, 0.445)],
        width,
        height,
    )
    right_sleeve_seed = scaled_points(
        [(0.650, 0.300), (0.755, 0.330), (0.810, 0.445), (0.660, 0.455)],
        width,
        height,
    )
    for seed_polygon in (torso_seed, left_sleeve_seed, right_sleeve_seed):
        seed_area = np.zeros_like(mask, dtype=np.uint8)
        cv2.fillPoly(seed_area, [seed_polygon], 255)
        mask[(seed_area > 0) & likely_white] = cv2.GC_FGD

    neck_background = scaled_points(
        [
            (0.397, 0.115),
            (0.603, 0.115),
            (0.585, 0.245),
            (0.500, 0.299),
            (0.415, 0.245),
        ],
        width,
        height,
    )
    cv2.fillPoly(mask, [neck_background], cv2.GC_BGD)

    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(
        image,
        mask,
        None,
        background_model,
        foreground_model,
        8,
        cv2.GC_INIT_WITH_MASK,
    )

    binary = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)
    binary = largest_seeded_component(binary, (0.50, 0.55))
    binary = cv2.morphologyEx(
        binary,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
    )
    binary = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
    )

    feathered = cv2.GaussianBlur(binary, (0, 0), 1.15)
    feathered[inside_outline == 0] = 0
    return feathered


def build_depth(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    lab_luminance = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    smooth = cv2.bilateralFilter(lab_luminance, 11, 26, 26)
    broad_light = cv2.GaussianBlur(smooth, (0, 0), 35)
    fabric_detail = smooth - broad_light

    y_grid, x_grid = np.mgrid[0:height, 0:width].astype(np.float32)
    normalized_x = (x_grid / max(1, width - 1) - 0.5) / 0.34
    torso_curve = np.clip(1.0 - normalized_x**2, -0.55, 1.0)
    vertical_curve = np.clip(
        1.0 - ((y_grid / max(1, height - 1) - 0.55) / 0.42) ** 2,
        -0.3,
        1.0,
    )

    depth = 128.0 + torso_curve * 31.0 + vertical_curve * 7.0 + fabric_detail * 2.35
    depth = cv2.GaussianBlur(depth, (0, 0), 1.2)
    depth = np.clip(depth, 44, 220).astype(np.uint8)
    depth[mask < 4] = 128
    return depth


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--mask-out", required=True, type=Path)
    parser.add_argument("--depth-out", required=True, type=Path)
    args = parser.parse_args()

    image = cv2.imread(str(args.input), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"Could not read input image: {args.input}")

    mask = build_mask(image)
    depth = build_depth(image, mask)
    args.mask_out.parent.mkdir(parents=True, exist_ok=True)
    args.depth_out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.mask_out), mask)
    cv2.imwrite(str(args.depth_out), depth)

    coverage = float(np.count_nonzero(mask > 127)) / float(mask.size)
    print(
        f"Generated {args.mask_out} and {args.depth_out} "
        f"({image.shape[1]}x{image.shape[0]}, mask coverage {coverage:.1%})"
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate garment masks and fold-depth maps for standardized on-model photos."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np


PROFILES = {
    "crewneck-tee": {
        "outline": [(0.42, 0.25), (0.35, 0.27), (0.25, 0.30), (0.18, 0.47), (0.27, 0.49),
                    (0.25, 0.80), (0.72, 0.80), (0.73, 0.49), (0.84, 0.47), (0.76, 0.30),
                    (0.65, 0.27), (0.58, 0.25), (0.56, 0.27), (0.50, 0.30), (0.44, 0.27)],
        "negative": [[(0.41, 0.20), (0.59, 0.20), (0.57, 0.27), (0.50, 0.30), (0.43, 0.27)]],
        "seed": (0.50, 0.58),
    },
    "polo-shirt": {
        "outline": [(0.40, 0.24), (0.34, 0.27), (0.25, 0.30), (0.18, 0.47), (0.27, 0.49),
                    (0.25, 0.80), (0.72, 0.80), (0.73, 0.49), (0.84, 0.47), (0.76, 0.30),
                    (0.65, 0.27), (0.60, 0.24), (0.56, 0.29), (0.50, 0.32), (0.44, 0.29)],
        "negative": [[(0.42, 0.19), (0.58, 0.19), (0.56, 0.28), (0.50, 0.31), (0.44, 0.28)]],
        "seed": (0.50, 0.58),
    },
    "long-sleeve": {
        "outline": [(0.42, 0.25), (0.34, 0.28), (0.25, 0.31), (0.17, 0.58), (0.16, 0.78),
                    (0.25, 0.79), (0.31, 0.52), (0.26, 0.80), (0.72, 0.80), (0.68, 0.52),
                    (0.75, 0.79), (0.83, 0.78), (0.84, 0.58), (0.76, 0.31), (0.66, 0.28),
                    (0.58, 0.25), (0.56, 0.27), (0.50, 0.30), (0.44, 0.27)],
        "negative": [[(0.41, 0.19), (0.59, 0.19), (0.57, 0.27), (0.50, 0.30), (0.43, 0.27)]],
        "seed": (0.50, 0.58),
    },
    "pullover-hoodie": {
        "outline": [(0.36, 0.22), (0.29, 0.28), (0.22, 0.32), (0.15, 0.59), (0.16, 0.79),
                    (0.25, 0.80), (0.31, 0.53), (0.27, 0.79), (0.72, 0.79), (0.68, 0.53),
                    (0.75, 0.80), (0.83, 0.79), (0.85, 0.59), (0.78, 0.32), (0.70, 0.28),
                    (0.64, 0.22), (0.61, 0.31), (0.50, 0.34), (0.39, 0.31)],
        "negative": [[(0.40, 0.14), (0.60, 0.14), (0.60, 0.30), (0.50, 0.34), (0.40, 0.30)]],
        "seed": (0.50, 0.60),
    },
    "button-shirt": {
        "outline": [(0.40, 0.24), (0.33, 0.28), (0.24, 0.31), (0.15, 0.58), (0.16, 0.79),
                    (0.25, 0.79), (0.31, 0.52), (0.26, 0.81), (0.73, 0.81), (0.68, 0.52),
                    (0.75, 0.79), (0.83, 0.79), (0.85, 0.58), (0.76, 0.31), (0.67, 0.28),
                    (0.60, 0.24), (0.56, 0.29), (0.50, 0.32), (0.44, 0.29)],
        "negative": [[(0.41, 0.16), (0.59, 0.16), (0.57, 0.28), (0.50, 0.32), (0.43, 0.28)]],
        "seed": (0.50, 0.58),
    },
    "one-piece-dress": {
        "outline": [(0.42, 0.21), (0.34, 0.23), (0.29, 0.26), (0.27, 0.34), (0.33, 0.35),
                    (0.36, 0.44), (0.27, 0.80), (0.73, 0.80), (0.64, 0.44), (0.67, 0.35),
                    (0.73, 0.34), (0.71, 0.26), (0.66, 0.23), (0.58, 0.21), (0.56, 0.23),
                    (0.50, 0.25), (0.44, 0.23)],
        "negative": [[(0.40, 0.12), (0.60, 0.12), (0.58, 0.22), (0.50, 0.25), (0.42, 0.22)]],
        "seed": (0.50, 0.55),
    },
    "tank-top": {
        "outline": [(0.42, 0.25), (0.34, 0.27), (0.31, 0.34), (0.35, 0.42), (0.29, 0.72),
                    (0.71, 0.72), (0.65, 0.42), (0.69, 0.34), (0.66, 0.27), (0.58, 0.25),
                    (0.56, 0.28), (0.50, 0.31), (0.44, 0.28)],
        "negative": [[(0.40, 0.18), (0.60, 0.18), (0.58, 0.27), (0.50, 0.31), (0.42, 0.27)]],
        "seed": (0.50, 0.53),
    },
    "womens-blouse": {
        "outline": [(0.41, 0.25), (0.32, 0.28), (0.24, 0.31), (0.16, 0.57), (0.17, 0.80),
                    (0.25, 0.81), (0.31, 0.52), (0.26, 0.78), (0.74, 0.78), (0.69, 0.52),
                    (0.75, 0.81), (0.83, 0.80), (0.84, 0.57), (0.76, 0.31), (0.68, 0.28),
                    (0.59, 0.25), (0.56, 0.29), (0.50, 0.32), (0.44, 0.29)],
        "negative": [[(0.41, 0.17), (0.59, 0.17), (0.57, 0.28), (0.50, 0.32), (0.43, 0.28)]],
        "seed": (0.50, 0.56),
    },
    "trench-coat": {
        "outline": [(0.40, 0.19), (0.33, 0.21), (0.27, 0.25), (0.25, 0.52), (0.29, 0.58),
                    (0.35, 0.58), (0.30, 0.76), (0.70, 0.76), (0.65, 0.58), (0.71, 0.58),
                    (0.75, 0.52), (0.73, 0.25), (0.67, 0.21), (0.60, 0.19), (0.56, 0.24),
                    (0.50, 0.27), (0.44, 0.24)],
        "negative": [[(0.40, 0.08), (0.60, 0.08), (0.58, 0.20), (0.50, 0.27), (0.42, 0.20)]],
        "seed": (0.50, 0.52),
    },
    "puffer-jacket": {
        "outline": [(0.40, 0.22), (0.30, 0.27), (0.21, 0.31), (0.10, 0.63), (0.12, 0.81),
                    (0.25, 0.82), (0.31, 0.53), (0.25, 0.80), (0.75, 0.80), (0.69, 0.53),
                    (0.75, 0.82), (0.88, 0.81), (0.90, 0.63), (0.79, 0.31), (0.70, 0.27),
                    (0.60, 0.22), (0.58, 0.29), (0.50, 0.31), (0.42, 0.29)],
        "negative": [[(0.39, 0.08), (0.61, 0.08), (0.60, 0.24), (0.50, 0.30), (0.40, 0.24)]],
        "seed": (0.50, 0.55),
    },
    "tailored-pants": {
        "outline": [(0.34, 0.41), (0.31, 0.48), (0.31, 0.89), (0.43, 0.90), (0.48, 0.56),
                    (0.50, 0.52), (0.52, 0.56), (0.57, 0.90), (0.69, 0.89), (0.69, 0.48),
                    (0.66, 0.41)],
        "negative": [],
        "seed": (0.40, 0.56),
    },
    "classic-skirt": {
        "outline": [(0.39, 0.34), (0.31, 0.38), (0.27, 0.77), (0.73, 0.77), (0.69, 0.38),
                    (0.61, 0.34)],
        "negative": [],
        "seed": (0.50, 0.56),
    },
    "open-front-blazer": {
        "outline": [(0.40, 0.19), (0.32, 0.21), (0.27, 0.25), (0.27, 0.51), (0.35, 0.51),
                    (0.36, 0.31), (0.34, 0.50), (0.66, 0.50), (0.64, 0.31), (0.65, 0.51),
                    (0.73, 0.51), (0.73, 0.25), (0.68, 0.21), (0.60, 0.19)],
        "negative": [[(0.44, 0.17), (0.56, 0.17), (0.55, 0.27), (0.54, 0.50),
                      (0.46, 0.50), (0.45, 0.27)]],
        "seeds": [(0.39, 0.35), (0.61, 0.35)],
    },
    "leather-jacket": {
        "outline": [(0.40, 0.20), (0.32, 0.22), (0.28, 0.26), (0.28, 0.52), (0.35, 0.52),
                    (0.36, 0.34), (0.35, 0.48), (0.65, 0.48), (0.64, 0.34), (0.65, 0.52),
                    (0.72, 0.52), (0.72, 0.26), (0.68, 0.22), (0.60, 0.20)],
        "negative": [[(0.43, 0.13), (0.57, 0.13), (0.57, 0.22), (0.50, 0.24), (0.43, 0.22)]],
        "seed": (0.50, 0.37),
    },
    "turtleneck": {
        "outline": [(0.46, 0.18), (0.54, 0.18), (0.56, 0.20), (0.64, 0.22), (0.69, 0.25),
                    (0.71, 0.51), (0.64, 0.53), (0.63, 0.32), (0.65, 0.51), (0.35, 0.51),
                    (0.37, 0.32), (0.36, 0.53), (0.29, 0.51), (0.31, 0.25), (0.36, 0.22),
                    (0.44, 0.20)],
        "negative": [],
        "seeds": [(0.50, 0.21), (0.50, 0.37)],
    },
    "puff-sleeve-blouse": {
        "outline": [(0.41, 0.20), (0.31, 0.22), (0.24, 0.26), (0.24, 0.39), (0.31, 0.40),
                    (0.32, 0.31), (0.30, 0.51), (0.70, 0.51), (0.68, 0.31), (0.69, 0.40),
                    (0.76, 0.39), (0.76, 0.26), (0.69, 0.22), (0.59, 0.20), (0.55, 0.24),
                    (0.50, 0.28), (0.45, 0.24)],
        "negative": [[(0.42, 0.14), (0.58, 0.14), (0.56, 0.23), (0.50, 0.28), (0.44, 0.23)]],
        "seed": (0.50, 0.38),
    },
    "utility-shirt-dress": {
        "outline": [(0.42, 0.19), (0.32, 0.21), (0.29, 0.25), (0.28, 0.43), (0.35, 0.44),
                    (0.36, 0.30), (0.34, 0.66), (0.66, 0.66), (0.64, 0.30), (0.65, 0.44),
                    (0.72, 0.43), (0.71, 0.25), (0.68, 0.21), (0.58, 0.19), (0.55, 0.22),
                    (0.50, 0.25), (0.45, 0.22)],
        "negative": [[(0.42, 0.13), (0.58, 0.13), (0.56, 0.21), (0.50, 0.25), (0.44, 0.21)]],
        "seed": (0.50, 0.45),
    },
    "relaxed-pants": {
        "outline": [(0.35, 0.40), (0.31, 0.43), (0.31, 0.92), (0.44, 0.93), (0.48, 0.56),
                    (0.50, 0.52), (0.52, 0.56), (0.56, 0.93), (0.69, 0.92), (0.69, 0.43),
                    (0.65, 0.40)],
        "negative": [],
        "seed": (0.40, 0.58),
    },
    "quarter-zip-action": {
        "outline": [(0.43, 0.17), (0.35, 0.21), (0.29, 0.25), (0.25, 0.49), (0.31, 0.53),
                    (0.37, 0.31), (0.36, 0.50), (0.60, 0.49), (0.66, 0.43), (0.70, 0.29),
                    (0.66, 0.22), (0.58, 0.19), (0.55, 0.17)],
        "negative": [[(0.43, 0.10), (0.59, 0.10), (0.57, 0.19), (0.51, 0.23), (0.44, 0.18)]],
        "seed": (0.50, 0.36),
    },
    "henley-seated": {
        "outline": [(0.42, 0.21), (0.30, 0.24), (0.22, 0.29), (0.14, 0.46), (0.22, 0.49),
                    (0.31, 0.35), (0.28, 0.52), (0.61, 0.52), (0.69, 0.36), (0.73, 0.49),
                    (0.80, 0.46), (0.72, 0.28), (0.64, 0.24), (0.56, 0.21), (0.54, 0.25),
                    (0.49, 0.27), (0.44, 0.25)],
        "negative": [[(0.40, 0.13), (0.58, 0.13), (0.57, 0.23), (0.49, 0.27), (0.42, 0.23)]],
        "seed": (0.49, 0.38),
    },
    "belted-shirt-jacket-action": {
        "outline": [(0.40, 0.15), (0.31, 0.18), (0.27, 0.23), (0.28, 0.38), (0.39, 0.38),
                    (0.30, 0.57), (0.71, 0.57), (0.66, 0.40), (0.72, 0.43), (0.76, 0.38),
                    (0.70, 0.20), (0.62, 0.17), (0.56, 0.15), (0.54, 0.19), (0.49, 0.21),
                    (0.44, 0.18)],
        "negative": [[(0.40, 0.09), (0.59, 0.09), (0.57, 0.17), (0.49, 0.21), (0.42, 0.17)]],
        "seed": (0.50, 0.43),
    },
    "layered-skirt-action": {
        "outline": [(0.39, 0.37), (0.33, 0.40), (0.26, 0.72), (0.33, 0.78), (0.54, 0.78),
                    (0.64, 0.76), (0.79, 0.70), (0.69, 0.41), (0.61, 0.37)],
        "negative": [],
        "seed": (0.50, 0.56),
    },
    "long-coat-action": {
        "outline": [(0.40, 0.19), (0.31, 0.22), (0.27, 0.27), (0.28, 0.52), (0.36, 0.52),
                    (0.34, 0.68), (0.69, 0.66), (0.64, 0.53), (0.70, 0.55), (0.72, 0.28),
                    (0.68, 0.22), (0.59, 0.19), (0.55, 0.24), (0.50, 0.29), (0.45, 0.24)],
        "negative": [[(0.40, 0.10), (0.60, 0.10), (0.57, 0.21), (0.50, 0.29), (0.43, 0.21)]],
        "seed": (0.50, 0.43),
    },
    "structured-blazer-action": {
        "outline": [(0.39, 0.18), (0.32, 0.21), (0.29, 0.25), (0.31, 0.52), (0.39, 0.55),
                    (0.39, 0.34), (0.38, 0.53), (0.67, 0.54), (0.63, 0.33), (0.66, 0.49),
                    (0.73, 0.50), (0.73, 0.25), (0.69, 0.21), (0.61, 0.18)],
        "negative": [[(0.43, 0.11), (0.59, 0.11), (0.58, 0.21), (0.56, 0.50),
                      (0.46, 0.50), (0.44, 0.22)]],
        "seeds": [(0.40, 0.36), (0.62, 0.36)],
    },
    "panel-tee-candid": {
        "outline": [(0.43, 0.17), (0.34, 0.20), (0.29, 0.24), (0.30, 0.33), (0.36, 0.34),
                    (0.34, 0.50), (0.62, 0.51), (0.66, 0.34), (0.72, 0.32), (0.70, 0.23),
                    (0.62, 0.19), (0.56, 0.17), (0.54, 0.20), (0.49, 0.22), (0.44, 0.20)],
        "negative": [[(0.41, 0.10), (0.59, 0.10), (0.57, 0.19), (0.49, 0.22), (0.42, 0.19)]],
        "seed": (0.50, 0.36),
    },
    "tie-neck-blouse-candid": {
        "outline": [(0.43, 0.16), (0.35, 0.19), (0.32, 0.24), (0.31, 0.49), (0.37, 0.50),
                    (0.38, 0.30), (0.36, 0.47), (0.65, 0.47), (0.64, 0.31), (0.66, 0.45),
                    (0.72, 0.46), (0.75, 0.28), (0.70, 0.20), (0.61, 0.17), (0.56, 0.16),
                    (0.54, 0.23), (0.49, 0.26), (0.45, 0.22)],
        "negative": [[(0.42, 0.09), (0.60, 0.09), (0.58, 0.18), (0.49, 0.26), (0.43, 0.18)]],
        "seed": (0.50, 0.36),
    },
    "lightweight-trench-candid": {
        "outline": [(0.42, 0.15), (0.34, 0.18), (0.28, 0.24), (0.27, 0.52), (0.34, 0.55),
                    (0.36, 0.34), (0.36, 0.69), (0.74, 0.67), (0.65, 0.53), (0.72, 0.57),
                    (0.77, 0.51), (0.70, 0.22), (0.64, 0.17), (0.57, 0.15), (0.55, 0.21),
                    (0.50, 0.27), (0.45, 0.21)],
        "negative": [[(0.41, 0.07), (0.60, 0.07), (0.58, 0.17), (0.50, 0.27), (0.43, 0.16)]],
        "seed": (0.50, 0.43),
    },
    "structured-pants-candid": {
        "outline": [(0.36, 0.41), (0.33, 0.45), (0.36, 0.91), (0.48, 0.91), (0.49, 0.56),
                    (0.51, 0.52), (0.54, 0.57), (0.65, 0.91), (0.73, 0.89), (0.66, 0.45),
                    (0.63, 0.41)],
        "negative": [],
        "seed": (0.42, 0.57),
    },
    "modern-dress-candid": {
        "outline": [(0.42, 0.18), (0.32, 0.21), (0.25, 0.28), (0.18, 0.54), (0.24, 0.56),
                    (0.30, 0.36), (0.26, 0.77), (0.40, 0.80), (0.61, 0.77), (0.86, 0.70),
                    (0.68, 0.35), (0.75, 0.54), (0.81, 0.52), (0.68, 0.24), (0.59, 0.19),
                    (0.56, 0.18), (0.54, 0.20), (0.49, 0.22), (0.44, 0.20)],
        "negative": [[(0.40, 0.11), (0.59, 0.11), (0.57, 0.19), (0.49, 0.22), (0.42, 0.19)]],
        "seed": (0.50, 0.51),
    },
    "longline-blazer-candid": {
        "outline": [(0.41, 0.16), (0.33, 0.19), (0.29, 0.25), (0.27, 0.55), (0.36, 0.61),
                    (0.37, 0.33), (0.36, 0.58), (0.66, 0.58), (0.63, 0.32), (0.65, 0.57),
                    (0.72, 0.57), (0.72, 0.24), (0.67, 0.19), (0.59, 0.16)],
        "negative": [[(0.43, 0.09), (0.59, 0.09), (0.57, 0.19), (0.55, 0.55),
                      (0.45, 0.55), (0.44, 0.19)]],
        "seeds": [(0.39, 0.36), (0.62, 0.36)],
    },
}


def scaled_points(points, width, height):
    return np.array([[round(x * width), round(y * height)] for x, y in points], dtype=np.int32)


def seeded_component(binary, seed=None, seeds=None):
    height, width = binary.shape
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    requested_seeds = seeds or [seed]
    selected_labels = set()
    for point in requested_seeds:
        sx = min(width - 1, max(0, round(point[0] * width)))
        sy = min(height - 1, max(0, round(point[1] * height)))
        label = int(labels[sy, sx])
        if label > 0:
            selected_labels.add(label)
    if not selected_labels and count > 1:
        selected_labels.add(1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])))
    return np.where(np.isin(labels, list(selected_labels)), 255, 0).astype(np.uint8)


def fill_small_internal_holes(binary, max_area=1800):
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return binary
    repaired = binary.copy()
    for index, contour in enumerate(contours):
        parent = hierarchy[0][index][3]
        if parent >= 0 and cv2.contourArea(contour) <= max_area:
            cv2.drawContours(repaired, [contour], -1, 255, thickness=cv2.FILLED)
    return repaired


def build_mask(image, profile):
    height, width = image.shape[:2]
    outline = scaled_points(profile["outline"], width, height)
    grab_mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    cv2.fillPoly(grab_mask, [outline], cv2.GC_PR_FGD)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    likely_white = (hsv[:, :, 2] >= 205) & (hsv[:, :, 1] <= 52)
    inside = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(inside, [outline], 255)
    grab_mask[(inside > 0) & likely_white] = cv2.GC_FGD

    for polygon in profile.get("negative", []):
        cv2.fillPoly(grab_mask, [scaled_points(polygon, width, height)], cv2.GC_BGD)

    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(image, grab_mask, None, background_model, foreground_model, 8, cv2.GC_INIT_WITH_MASK)

    binary = np.where(
        (grab_mask == cv2.GC_FGD) | (grab_mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)
    binary = seeded_component(binary, profile.get("seed"), profile.get("seeds"))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    binary = fill_small_internal_holes(binary)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    feathered = cv2.GaussianBlur(binary, (0, 0), 1.1)
    feathered[inside == 0] = 0
    return feathered


def build_depth(image, mask):
    height, width = mask.shape
    luminance = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    smooth = cv2.bilateralFilter(luminance, 11, 26, 26)
    broad = cv2.GaussianBlur(smooth, (0, 0), 35)
    detail = smooth - broad

    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    nx = (xx / max(1, width - 1) - 0.5) / 0.34
    torso_curve = np.clip(1.0 - nx**2, -0.55, 1.0)
    vertical_curve = np.clip(1.0 - ((yy / max(1, height - 1) - 0.55) / 0.42) ** 2, -0.3, 1.0)
    depth = 128.0 + torso_curve * 31.0 + vertical_curve * 7.0 + detail * 2.35
    depth = np.clip(cv2.GaussianBlur(depth, (0, 0), 1.2), 44, 220).astype(np.uint8)
    depth[mask < 4] = 128
    return depth


LOWER_GARMENT_WORDS = (
    "pants", "trouser", "jogger", "legging", "shorts", "cycling", "skirt",
)
FULL_GARMENT_WORDS = (
    "dress", "jumpsuit", "romper", "gown", "robe", "coat", "poncho", "cape",
    "maxi-set", "skirt-set",
)
HEAD_GARMENT_TOKENS = {"cap", "hat", "headpiece", "headscarf"}
MANUAL_ASSET_PROFILES = {
    "crewneck-tee-male-front": "crewneck-tee",
    "polo-shirt-male-front": "polo-shirt",
    "long-sleeve-crewneck-male-front": "long-sleeve",
    "pullover-hoodie-male-front": "pullover-hoodie",
    "button-shirt-male-front": "button-shirt",
    "one-piece-dress-female-front": "one-piece-dress",
    "tank-top-female-front": "tank-top",
    "womens-blouse-front": "womens-blouse",
    "trench-coat-female-front": "trench-coat",
    "puffer-jacket-male-front": "puffer-jacket",
    "tailored-pants-male-front": "tailored-pants",
    "classic-skirt-female-front": "classic-skirt",
    "open-front-blazer-female-front": "open-front-blazer",
    "leather-jacket-androgynous-front": "leather-jacket",
    "turtleneck-nonbinary-front": "turtleneck",
    "puff-sleeve-blouse-female-front": "puff-sleeve-blouse",
    "utility-shirt-dress-female-front": "utility-shirt-dress",
    "relaxed-pants-male-front": "relaxed-pants",
    "quarter-zip-walking-male-front": "quarter-zip-action",
    "henley-wheelchair-male-front": "henley-seated",
    "belted-shirt-jacket-female-action": "belted-shirt-jacket-action",
    "layered-skirt-female-walking": "layered-skirt-action",
    "long-coat-male-walking": "long-coat-action",
    "structured-blazer-female-action": "structured-blazer-action",
    "panel-tee-european-male-candid": "panel-tee-candid",
    "tie-neck-blouse-european-female": "tie-neck-blouse-candid",
    "lightweight-trench-mediterranean-female": "lightweight-trench-candid",
    "structured-pants-european-male": "structured-pants-candid",
    "modern-dress-american-female": "modern-dress-candid",
    "longline-blazer-nordic-male": "longline-blazer-candid",
}


def infer_garment_region(asset_name):
    name = asset_name.lower()
    tokens = set(name.split("-"))
    if tokens & HEAD_GARMENT_TOKENS or "hood-scarf" in name:
        return "head"
    if "sling" in name or "bag" in name:
        return "accessory"
    if any(word in name for word in FULL_GARMENT_WORDS):
        return "full"
    if any(word in name for word in LOWER_GARMENT_WORDS):
        return "lower"
    return "upper"


def region_limits(region):
    return {
        "head": (0.00, 0.36),
        "accessory": (0.14, 0.78),
        "upper": (0.10, 0.78),
        "lower": (0.28, 0.98),
        "full": (0.10, 0.98),
    }[region]


def largest_relevant_components(binary, strong, region):
    height, width = binary.shape
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    y_min, y_max = region_limits(region)
    minimum_area = max(80, round(width * height * 0.00055))
    selected = []
    scored = []
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < minimum_area:
            continue
        cx, cy = centroids[label]
        if not (0.03 * width <= cx <= 0.97 * width and y_min * height <= cy <= y_max * height):
            continue
        component = labels == label
        strong_pixels = int(np.count_nonzero(strong & component))
        if strong_pixels < max(18, round(area * 0.012)):
            continue
        center_distance = abs(cx / width - 0.5)
        score = area * (1.15 - min(0.65, center_distance)) + strong_pixels * 1.8
        scored.append((score, label, area))

    if not scored:
        return np.zeros_like(binary)

    scored.sort(reverse=True)
    if region == "head":
        return np.where(labels == scored[0][1], 255, 0).astype(np.uint8)
    largest_area = scored[0][2]
    for _, label, area in scored:
        if area >= max(minimum_area, largest_area * 0.035):
            selected.append(label)

    return np.where(np.isin(labels, selected), 255, 0).astype(np.uint8)


def build_automatic_mask(image, asset_name, person_alpha=None):
    """Segment the white target garment while excluding the model and studio background."""
    original_height, original_width = image.shape[:2]
    scale = min(1.0, 560.0 / max(original_height, original_width))
    work_width = max(64, round(original_width * scale))
    work_height = max(64, round(original_height * scale))
    work = cv2.resize(image, (work_width, work_height), interpolation=cv2.INTER_AREA)
    region = infer_garment_region(asset_name)
    y_min, y_max = region_limits(region)

    hsv = cv2.cvtColor(work, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    ycrcb = cv2.cvtColor(work, cv2.COLOR_BGR2YCrCb)
    cr = ycrcb[:, :, 1]
    cb = ycrcb[:, :, 2]
    skin = (
        (cr >= 132) & (cr <= 182) & (cb >= 74) & (cb <= 138)
        & (saturation >= 42) & (value >= 48)
    )
    skin = cv2.dilate(
        np.where(skin, 255, 0).astype(np.uint8),
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
    ) > 0
    yy, xx = np.mgrid[0:work_height, 0:work_width]
    if person_alpha is not None:
        person_small = cv2.resize(person_alpha, (work_width, work_height), interpolation=cv2.INTER_AREA)
        person = person_small >= 36
    else:
        # Deterministic fallback for environments without the optional human
        # segmentation model. The production batch uses u2net_human_seg.
        person_seed = np.full((work_height, work_width), cv2.GC_BGD, dtype=np.uint8)
        x0, x1 = round(work_width * 0.055), round(work_width * 0.945)
        y0, y1 = round(work_height * 0.015), round(work_height * 0.985)
        person_seed[y0:y1, x0:x1] = cv2.GC_PR_FGD
        central = (
            (xx >= work_width * 0.27) & (xx <= work_width * 0.73)
            & (yy >= work_height * 0.05) & (yy <= work_height * 0.90)
        )
        distinctive = central & ((saturation >= 45) | (value <= 125))
        person_seed[distinctive] = cv2.GC_FGD
        border = max(2, round(min(work_width, work_height) * 0.018))
        person_seed[:border, :] = cv2.GC_BGD
        person_seed[-border:, :] = cv2.GC_BGD
        person_seed[:, :border] = cv2.GC_BGD
        person_seed[:, -border:] = cv2.GC_BGD
        bg_model = np.zeros((1, 65), dtype=np.float64)
        fg_model = np.zeros((1, 65), dtype=np.float64)
        cv2.grabCut(work, person_seed, None, bg_model, fg_model, 4, cv2.GC_INIT_WITH_MASK)
        person = (person_seed == cv2.GC_FGD) | (person_seed == cv2.GC_PR_FGD)

    if region == "head":
        skin_exclusion = skin & (saturation >= 70)
    elif region == "full" and any(
        word in asset_name.lower() for word in ("coat", "cape", "poncho", "robe", "puffer")
    ):
        skin_exclusion = skin & (saturation >= 64)
    else:
        skin_exclusion = skin
    permissive_saturation = 135 if region == "head" else 92
    permissive_value = 88 if region == "head" else 118
    strong_saturation = 112 if region == "head" else 58
    strong_value = 132 if region == "head" else 158

    # The generated catalog consistently uses a white/neutral target garment and
    # darker styling pieces. A permissive neutral threshold retains shaded folds;
    # strong neutral highlights identify which connected components are garments.
    roi = (yy >= work_height * y_min) & (yy <= work_height * y_max)
    permissive = (
        person & roi & ~skin_exclusion
        & (saturation <= permissive_saturation) & (value >= permissive_value)
    )
    strong = (
        person & roi & ~skin_exclusion
        & (saturation <= strong_saturation) & (value >= strong_value)
    )
    permissive_u8 = np.where(permissive, 255, 0).astype(np.uint8)
    permissive_u8 = cv2.morphologyEx(
        permissive_u8,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
        iterations=2,
    )
    permissive_u8 = fill_small_internal_holes(permissive_u8, max_area=900)
    selected = largest_relevant_components(permissive_u8, strong, region)

    coverage = float(np.count_nonzero(selected)) / float(selected.size)
    if coverage < 0.008:
        fallback = person & roi & ~skin_exclusion & (saturation <= 145) & (value >= 76)
        fallback_u8 = np.where(fallback, 255, 0).astype(np.uint8)
        selected = largest_relevant_components(fallback_u8, strong, region)

    selected = cv2.morphologyEx(
        selected,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
    )
    selected = fill_small_internal_holes(selected, max_area=1200)
    full_size = cv2.resize(selected, (original_width, original_height), interpolation=cv2.INTER_LINEAR)
    feather_sigma = max(0.8, min(original_width, original_height) / 1050.0)
    return cv2.GaussianBlur(full_size, (0, 0), feather_sigma)


def calculate_placement(mask, region):
    binary = np.where(mask > 127, 255, 0).astype(np.uint8)
    ys, xs = np.nonzero(binary)
    height, width = mask.shape
    if len(xs) == 0:
        return {
            "artwork": [width // 2, round(height * 0.48), round(width * 0.42), round(height * 0.38)],
            "render": [0, 0, width, height],
            "defaults": [48, 34],
            "coverage": 0.0,
        }

    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    box_width, box_height = right - left, bottom - top
    print_band = {
        "head": (0.15, 0.80),
        "accessory": (0.18, 0.82),
        "upper": (0.20, 0.72),
        "lower": (0.12, 0.58),
        "full": (0.14, 0.52),
    }[region]
    band_top = top + round(box_height * print_band[0])
    band_bottom = top + round(box_height * print_band[1])
    candidate = binary.copy()
    candidate[:band_top, :] = 0
    candidate[band_bottom:, :] = 0
    distance = cv2.distanceTransform(candidate, cv2.DIST_L2, 5)
    if float(distance.max()) > 0:
        center_y, center_x = np.unravel_index(int(np.argmax(distance)), distance.shape)
        local_radius = float(distance[center_y, center_x])
    else:
        center_x, center_y = (left + right) // 2, (top + bottom) // 2
        local_radius = box_width * 0.22

    base_width = round(min(box_width * 0.58, max(width * 0.16, local_radius * 2.7)))
    max_height = round(min(box_height * 0.58, max(height * 0.16, base_width * 1.15)))
    padding = max(2, round(min(width, height) * 0.006))
    coverage = float(np.count_nonzero(binary)) / float(binary.size)
    return {
        "artwork": [int(center_x), int(center_y), int(base_width), int(max_height)],
        "render": [
            max(0, left - padding),
            max(0, top - padding),
            min(width, right + padding),
            min(height, bottom + padding),
        ],
        "defaults": [48, 34],
        "coverage": round(coverage, 6),
    }


def asset_name_from_base(path):
    suffix = "-base.png"
    if not path.name.endswith(suffix):
        raise ValueError(f"Expected a {suffix} input: {path}")
    return path.name[:-len(suffix)]


def build_metadata(base_path, mask_path, depth_path, method):
    image = cv2.imread(str(base_path), cv2.IMREAD_COLOR)
    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if image is None or mask is None:
        raise ValueError(f"Could not inspect generated maps for {base_path}")
    asset_name = asset_name_from_base(base_path)
    region = infer_garment_region(asset_name)
    placement = calculate_placement(mask, region)
    model_match = re.match(r"model-(\d+)-", asset_name)
    return {
        "assetName": asset_name,
        "modelId": int(model_match.group(1)) if model_match else None,
        "garmentType": region,
        "title": asset_name.replace("-", " ").title(),
        "baseImageUrl": f"/images/mockups/on-model/generated/{base_path.name}",
        "maskImageUrl": f"/images/mockups/on-model/generated/{mask_path.name}",
        "depthImageUrl": f"/images/mockups/on-model/generated/{depth_path.name}",
        "canvasWidth": image.shape[1],
        "canvasHeight": image.shape[0],
        "artwork": placement["artwork"],
        "render": placement["render"],
        "defaults": placement["defaults"],
        "coverage": placement["coverage"],
        "method": method,
    }


def create_human_segmentation_session(model_name):
    if model_name == "grabcut":
        return None, None
    try:
        from rembg import new_session, remove
    except ImportError as error:
        raise SystemExit(
            "Human segmentation requires rembg and onnxruntime. Install "
            "requirements-on-model-mockups.txt or pass --foreground-model grabcut."
        ) from error
    return new_session(model_name), remove


def generate_batch(
    input_dir,
    metadata_out,
    overwrite=False,
    foreground_model="u2net_human_seg",
    only_region=None,
    overwrite_manual=False,
    match_pattern=None,
):
    records = []
    base_paths = sorted(input_dir.glob("*-base.png"))
    if not base_paths:
        raise SystemExit(f"No *-base.png files found in {input_dir}")
    previous_methods = {}
    if metadata_out.exists():
        previous_manifest = json.loads(metadata_out.read_text())
        previous_methods = {
            record["assetName"]: record.get("method", "existing")
            for record in previous_manifest.get("assets", [])
        }
    matches_requested_filter = lambda name: (
        (only_region is None or infer_garment_region(name) == only_region)
        and (match_pattern is None or re.search(match_pattern, name))
    )
    needs_generation = any(
        (overwrite and matches_requested_filter(asset_name_from_base(path)))
        or not (input_dir / f"{asset_name_from_base(path)}-mask.png").exists()
        or not (input_dir / f"{asset_name_from_base(path)}-depth.png").exists()
        for path in base_paths
    )
    session, remove_background = (
        create_human_segmentation_session(foreground_model) if needs_generation else (None, None)
    )

    for index, base_path in enumerate(base_paths, start=1):
        asset_name = asset_name_from_base(base_path)
        mask_path = input_dir / f"{asset_name}-mask.png"
        depth_path = input_dir / f"{asset_name}-depth.png"
        method = (
            "manual-profile-v1"
            if asset_name in MANUAL_ASSET_PROFILES
            else previous_methods.get(asset_name, "existing")
        )
        selected_for_overwrite = (
            overwrite
            and matches_requested_filter(asset_name)
            and (overwrite_manual or asset_name not in MANUAL_ASSET_PROFILES)
        )
        if selected_for_overwrite or not mask_path.exists() or not depth_path.exists():
            image = cv2.imread(str(base_path), cv2.IMREAD_COLOR)
            if image is None:
                raise SystemExit(f"Could not read input image: {base_path}")
            person_alpha = None
            if session is not None:
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                person_alpha = remove_background(rgb, session=session, only_mask=True)
                person_alpha = np.asarray(person_alpha, dtype=np.uint8)
            mask = build_automatic_mask(image, asset_name, person_alpha=person_alpha)
            depth = build_depth(image, mask)
            cv2.imwrite(str(mask_path), mask)
            cv2.imwrite(str(depth_path), depth)
            method = "automatic-white-garment-v1"
        record = build_metadata(base_path, mask_path, depth_path, method)
        records.append(record)
        print(
            f"[{index:03d}/{len(base_paths):03d}] {asset_name}: "
            f"{record['canvasWidth']}x{record['canvasHeight']}, "
            f"mask {record['coverage']:.1%}, {method}"
        )

    preferred_by_model = {}
    for record in records:
        if record["modelId"] is None:
            continue
        rank = ("-v2-" in record["assetName"], "-v1-" not in record["assetName"], record["assetName"])
        current = preferred_by_model.get(record["modelId"])
        if current is None or rank > current[0]:
            preferred_by_model[record["modelId"]] = (rank, record["assetName"])
    preferred_names = {value[1] for value in preferred_by_model.values()}
    for record in records:
        record["preferredForModel"] = record["assetName"] in preferred_names

    metadata_out.parent.mkdir(parents=True, exist_ok=True)
    metadata_out.write_text(json.dumps({"version": 1, "assets": records}, indent=2) + "\n")
    print(f"Wrote {len(records)} asset records to {metadata_out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path)
    parser.add_argument("--profile", choices=sorted(PROFILES))
    parser.add_argument("--mask-out", type=Path)
    parser.add_argument("--depth-out", type=Path)
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--metadata-out", type=Path)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--foreground-model", default="u2net_human_seg")
    parser.add_argument("--only-region", choices=("head", "accessory", "upper", "lower", "full"))
    parser.add_argument("--overwrite-manual", action="store_true")
    parser.add_argument("--match", help="Only overwrite asset names matching this regular expression")
    args = parser.parse_args()

    if args.input_dir:
        if args.input or args.profile or args.mask_out or args.depth_out:
            parser.error("--input-dir cannot be combined with single-profile arguments")
        metadata_out = args.metadata_out or Path("public/config/on-model-mockup-assets.json")
        generate_batch(
            args.input_dir,
            metadata_out,
            overwrite=args.overwrite,
            foreground_model=args.foreground_model,
            only_region=args.only_region,
            overwrite_manual=args.overwrite_manual,
            match_pattern=args.match,
        )
        return

    if not all((args.input, args.profile, args.mask_out, args.depth_out)):
        parser.error("single mode requires --input, --profile, --mask-out, and --depth-out")

    image = cv2.imread(str(args.input), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"Could not read input image: {args.input}")

    mask = build_mask(image, PROFILES[args.profile])
    depth = build_depth(image, mask)
    args.mask_out.parent.mkdir(parents=True, exist_ok=True)
    args.depth_out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.mask_out), mask)
    cv2.imwrite(str(args.depth_out), depth)
    coverage = float(np.count_nonzero(mask > 127)) / float(mask.size)
    print(f"{args.profile}: {image.shape[1]}x{image.shape[0]}, mask coverage {coverage:.1%}")


if __name__ == "__main__":
    main()

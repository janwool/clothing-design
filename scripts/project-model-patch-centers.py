#!/usr/bin/env python3
"""Project repair-report patch centers into the standard QA camera views."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def bounds(objects):
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], world[axis])
                maximum[axis] = max(maximum[axis], world[axis])
    return (minimum + maximum) * 0.5, max(maximum - minimum)


def look_at(camera, target):
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def camera_for_view(center, largest, direction, name):
    data = bpy.data.cameras.new(f"Projection {name}")
    camera = bpy.data.objects.new(f"Projection {name}", data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + direction.normalized() * largest * 2.3
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = largest * 1.18
    look_at(camera, center)
    return camera


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("repair_report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    obj = objects[0]
    center, largest = bounds(objects)
    scene = bpy.context.scene
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1500
    scene.render.resolution_percentage = 100
    directions = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "left": Vector((-1, 0, 0.08)),
        "right": Vector((1, 0, 0.08)),
    }
    cameras = {
        name: camera_for_view(center, largest, direction, name)
        for name, direction in directions.items()
    }
    source = json.loads(args.repair_report.read_text(encoding="utf-8"))
    rows = []
    for patch in source["objects"][0]["patches"]:
        world = obj.matrix_world @ Vector(patch["center"])
        projections = {}
        for name, camera in cameras.items():
            projected = world_to_camera_view(scene, camera, world)
            projections[name] = {
                "x": round(float(projected.x * scene.render.resolution_x), 2),
                "y": round(float((1.0 - projected.y) * scene.render.resolution_y), 2),
                "depth": round(float(projected.z), 6),
            }
        rows.append(
            {
                "source_component": patch["source_component"],
                "faces": patch["faces"],
                "center": patch["center"],
                "projections": projections,
            }
        )
    result = {"input": str(args.input), "repair_report": str(args.repair_report), "patches": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

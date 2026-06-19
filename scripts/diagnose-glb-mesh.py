#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def diagnose(path: Path) -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    print(f"FILE {path} objects={len(objects)}")
    for obj in objects:
        mesh = obj.data
        verts = [obj.matrix_world @ vert.co for vert in mesh.vertices]
        if verts:
            dims = tuple(
                max(v[axis] for v in verts) - min(v[axis] for v in verts)
                for axis in range(3)
            )
        else:
            dims = (0.0, 0.0, 0.0)

        max_edge = 0.0
        max_edge_vertices = None
        long_edges = 0
        for edge in mesh.edges:
            a = verts[edge.vertices[0]]
            b = verts[edge.vertices[1]]
            length = (a - b).length
            if length > max_edge:
                max_edge = length
                max_edge_vertices = (edge.vertices[0], edge.vertices[1], a.copy(), b.copy())
            if length > 0.08:
                long_edges += 1

        print(
            "OBJ "
            f"{obj.name} verts={len(mesh.vertices)} faces={len(mesh.polygons)} "
            f"edges={len(mesh.edges)} dims={tuple(round(v, 4) for v in dims)} "
            f"max_edge={max_edge:.4f} edges_gt_0_08={long_edges}"
        )
        if max_edge_vertices:
            v1, v2, a, b = max_edge_vertices
            print(
                "MAX_EDGE "
                f"verts=({v1},{v2}) "
                f"a=({a.x:.4f},{a.y:.4f},{a.z:.4f}) "
                f"b=({b.x:.4f},{b.y:.4f},{b.z:.4f})"
            )


def main() -> None:
    for arg in sys.argv[sys.argv.index("--") + 1 :]:
        diagnose(Path(arg))


if __name__ == "__main__":
    main()

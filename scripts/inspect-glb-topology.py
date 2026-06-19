#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def inspect(path: Path) -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    print(f"FILE {path} objects={len(objects)}")

    for obj in objects:
        mesh = obj.data
        edge_face_counts = {tuple(sorted(edge.vertices)): 0 for edge in mesh.edges}
        for poly in mesh.polygons:
            verts = list(poly.vertices)
            for index, start in enumerate(verts):
                end = verts[(index + 1) % len(verts)]
                key = tuple(sorted((start, end)))
                edge_face_counts[key] = edge_face_counts.get(key, 0) + 1

        boundary_edges = sum(1 for count in edge_face_counts.values() if count == 1)
        nonmanifold_edges = sum(1 for count in edge_face_counts.values() if count > 2)
        loose_edges = sum(1 for count in edge_face_counts.values() if count == 0)

        zero_area = sum(1 for poly in mesh.polygons if poly.area < 1e-10)
        materials = []
        for mat in obj.data.materials:
            if not mat:
                continue
            materials.append(
                {
                    "name": mat.name,
                    "use_nodes": mat.use_nodes,
                    "blend_method": mat.blend_method,
                    "use_backface_culling": mat.use_backface_culling,
                    "show_transparent_back": getattr(mat, "show_transparent_back", None),
                    "alpha": mat.diffuse_color[3] if mat.diffuse_color else None,
                }
            )

        print(
            f"OBJ {obj.name} verts={len(mesh.vertices)} faces={len(mesh.polygons)} "
            f"edges={len(mesh.edges)} boundary_edges={boundary_edges} "
            f"nonmanifold_edges={nonmanifold_edges} loose_edges={loose_edges} "
            f"zero_area_faces={zero_area}"
        )
        print(f"MATERIALS {materials}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    for arg in argv:
        inspect(Path(arg))


if __name__ == "__main__":
    main()

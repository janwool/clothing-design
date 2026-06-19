#!/usr/bin/env python3
from __future__ import annotations

import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces = defaultdict(list)
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        for index, start in enumerate(verts):
            end = verts[(index + 1) % len(verts)]
            edge_faces[tuple(sorted((start, end)))].append(poly.index)

    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    visited = set()
    components = []
    for poly in mesh.polygons:
        if poly.index in visited:
            continue
        queue = deque([poly.index])
        visited.add(poly.index)
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def inspect(path: Path) -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    print(f"FILE {path}")
    for obj in objects:
        mesh = obj.data
        components = face_components(mesh)
        rows = []
        for faces in components:
            area = sum(mesh.polygons[index].area for index in faces)
            verts = set()
            for index in faces:
                verts.update(mesh.polygons[index].vertices)
            rows.append((len(faces), len(verts), area))
        rows.sort(key=lambda item: item[2], reverse=True)
        print(f"OBJ {obj.name} components={len(rows)} faces={len(mesh.polygons)}")
        for index, (faces, verts, area) in enumerate(rows[:60], 1):
            print(f"{index:02d} faces={faces} verts={verts} area={area:.8f}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    for arg in argv:
        inspect(Path(arg))


if __name__ == "__main__":
    main()

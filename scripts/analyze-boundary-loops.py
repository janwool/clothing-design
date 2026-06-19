#!/usr/bin/env python3
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def boundary_loops(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_counts = defaultdict(int)
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        for index, start in enumerate(verts):
            end = verts[(index + 1) % len(verts)]
            edge_counts[tuple(sorted((start, end)))] += 1

    adjacency = defaultdict(list)
    for (a, b), count in edge_counts.items():
        if count == 1:
            adjacency[a].append(b)
            adjacency[b].append(a)

    loops = []
    visited_edges = set()
    for start, neighbors in adjacency.items():
        for neighbor in neighbors:
            edge_key = tuple(sorted((start, neighbor)))
            if edge_key in visited_edges:
                continue

            loop = [start]
            prev = None
            current = start
            nxt = neighbor
            while True:
                visited_edges.add(tuple(sorted((current, nxt))))
                prev, current = current, nxt
                loop.append(current)
                choices = [v for v in adjacency[current] if v != prev]
                if not choices:
                    break
                nxt = choices[0]
                if current == start or tuple(sorted((current, nxt))) in visited_edges:
                    break
            loops.append(loop)
    return loops


def inspect(path: Path) -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    print(f"FILE {path}")
    for obj in objects:
        mesh = obj.data
        loops = boundary_loops(mesh)
        rows = []
        for loop in loops:
            coords = [mesh.vertices[index].co for index in loop if index < len(mesh.vertices)]
            if not coords:
                continue
            length = 0.0
            for a, b in zip(coords, coords[1:]):
                length += (a - b).length
            rows.append((len(set(loop)), length))
        rows.sort(key=lambda item: item[1], reverse=True)
        print(f"OBJ {obj.name} boundary_loops={len(rows)}")
        for threshold in [0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0]:
            count = sum(1 for _, length in rows if length <= threshold)
            print(f"threshold<={threshold:.1f} count={count}")
        for index, (verts, length) in enumerate(rows[:40], 1):
            print(f"{index:02d} verts={verts} length={length:.5f}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    for arg in argv:
        inspect(Path(arg))


if __name__ == "__main__":
    main()

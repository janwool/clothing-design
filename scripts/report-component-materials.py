#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bpy


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    components: list[list[int]] = []
    visited: set[int] = set()
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        component: list[int] = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in neighbors[face]:
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        components.append(component)
    return components


def report(path: Path) -> dict[str, object]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = []
    for obj in (item for item in bpy.context.scene.objects if item.type == "MESH"):
        mesh = obj.data
        rows = []
        for index, faces in enumerate(face_components(mesh)):
            vertices = {vertex for face in faces for vertex in mesh.polygons[face].vertices}
            coordinates = [mesh.vertices[vertex].co for vertex in vertices]
            minimum = [min(co[axis] for co in coordinates) for axis in range(3)]
            maximum = [max(co[axis] for co in coordinates) for axis in range(3)]
            material_counts = Counter(mesh.polygons[face].material_index for face in faces)
            rows.append(
                {
                    "index": index,
                    "faces": len(faces),
                    "vertices": len(vertices),
                    "surface_area": round(sum(mesh.polygons[face].area for face in faces), 9),
                    "center": [round((minimum[axis] + maximum[axis]) * 0.5, 6) for axis in range(3)],
                    "bbox": [round(value, 6) for value in minimum + maximum],
                    "material_faces": {str(key): value for key, value in sorted(material_counts.items())},
                }
            )
        objects.append(
            {
                "object": obj.name,
                "materials": [material.name if material else None for material in mesh.materials],
                "components": rows,
            }
        )
    return {"input": str(path), "objects": objects}


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    if len(argv) not in {1, 2}:
        raise SystemExit("usage: blender --background --python report-component-materials.py -- input.glb [output.json]")
    payload = json.dumps(report(Path(argv[0])), ensure_ascii=False, indent=2)
    if len(argv) == 2:
        output = Path(argv[1])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
        print(f"output={output}", flush=True)
    else:
        print(payload, flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def face_components(mesh: bpy.types.Mesh) -> tuple[list[list[int]], list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    components: list[list[int]] = []
    face_component = [-1] * len(mesh.polygons)
    for polygon in mesh.polygons:
        if face_component[polygon.index] != -1:
            continue
        component_index = len(components)
        queue = deque([polygon.index])
        face_component[polygon.index] = component_index
        component: list[int] = []
        while queue:
            face_index = queue.popleft()
            component.append(face_index)
            for neighbor in neighbors[face_index]:
                if face_component[neighbor] == -1:
                    face_component[neighbor] = component_index
                    queue.append(neighbor)
        components.append(component)
    return components, face_component


def boundary_groups(edges: list[bmesh.types.BMEdge]) -> list[list[bmesh.types.BMEdge]]:
    vertex_edges: dict[bmesh.types.BMVert, set[bmesh.types.BMEdge]] = defaultdict(set)
    for edge in edges:
        for vertex in edge.verts:
            vertex_edges[vertex].add(edge)
    groups: list[list[bmesh.types.BMEdge]] = []
    pending = set(edges)
    while pending:
        seed = pending.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for neighbor in vertex_edges[vertex]:
                    if neighbor in pending:
                        pending.remove(neighbor)
                        queue.append(neighbor)
                        group.append(neighbor)
        groups.append(group)
    return groups


def rounded(values) -> list[float]:
    return [round(float(value), 6) for value in values]


def main() -> None:
    parser = argparse.ArgumentParser(description="Map boundary loops and zero-area faces to components/materials.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--zero-area-threshold", type=float, default=1e-10)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    reports = []
    for obj in objects:
        mesh = obj.data
        components, face_component = face_components(mesh)
        component_materials = [
            Counter(mesh.polygons[face_index].material_index for face_index in component)
            for component in components
        ]
        zero_area = [
            polygon.index
            for polygon in mesh.polygons
            if polygon.area <= args.zero_area_threshold
        ]

        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        groups = boundary_groups([edge for edge in bm.edges if edge.is_boundary])
        loop_reports = []
        for index, group in enumerate(groups):
            vertices = {vertex for edge in group for vertex in edge.verts}
            linked_faces = {face for edge in group for face in edge.link_faces}
            center = sum((vertex.co for vertex in vertices), Vector()) / len(vertices)
            minimum = Vector((min(vertex.co[axis] for vertex in vertices) for axis in range(3)))
            maximum = Vector((max(vertex.co[axis] for vertex in vertices) for axis in range(3)))
            component_counts = Counter(face_component[face.index] for face in linked_faces)
            material_counts = Counter(face.material_index for face in linked_faces)
            loop_reports.append(
                {
                    "index": index,
                    "edges": len(group),
                    "vertices": len(vertices),
                    "perimeter": round(sum(edge.calc_length() for edge in group), 9),
                    "center": rounded(center),
                    "bbox": rounded((*minimum, *maximum)),
                    "adjacent_components": [
                        {
                            "index": component_index,
                            "boundary_faces": count,
                            "component_faces": len(components[component_index]),
                            "component_materials": dict(component_materials[component_index]),
                        }
                        for component_index, count in component_counts.most_common()
                    ],
                    "adjacent_materials": dict(material_counts),
                }
            )
        bm.free()

        zero_component_counts = Counter(face_component[index] for index in zero_area)
        zero_material_counts = Counter(mesh.polygons[index].material_index for index in zero_area)
        reports.append(
            {
                "object": obj.name,
                "faces": len(mesh.polygons),
                "components": len(components),
                "boundary_edges": sum(item["edges"] for item in loop_reports),
                "boundary_groups": loop_reports,
                "zero_area_threshold": args.zero_area_threshold,
                "zero_area_faces": len(zero_area),
                "zero_area_by_material": dict(zero_material_counts),
                "zero_area_by_component": [
                    {
                        "index": component_index,
                        "zero_area_faces": count,
                        "component_faces": len(components[component_index]),
                        "component_materials": dict(component_materials[component_index]),
                    }
                    for component_index, count in zero_component_counts.most_common()
                ],
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"input": str(args.input), "objects": reports}, indent=2), encoding="utf-8")
    print(f"output={args.output}")


if __name__ == "__main__":
    main()

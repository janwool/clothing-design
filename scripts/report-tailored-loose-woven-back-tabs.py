#!/usr/bin/env python3
"""Compare ID101's healthy and corrupted paired back-waist tabs."""

from __future__ import annotations

import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


def components(mesh):
    edge_faces = defaultdict(list)
    for polygon in mesh.polygons:
        for edge in polygon.edge_keys:
            edge_faces[edge].append(polygon.index)
    neighbors = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    unseen = set(range(len(mesh.polygons)))
    result = []
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        queue = deque([seed])
        found = []
        while queue:
            face = queue.popleft()
            found.append(face)
            for other in neighbors[face]:
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        result.append(found)
    return result


def vertex_set(mesh, faces):
    return sorted({vertex for face in faces for vertex in mesh.polygons[face].vertices})


def stats(mesh, faces):
    vertices = vertex_set(mesh, faces)
    coordinates = [mesh.vertices[index].co.copy() for index in vertices]
    center = sum(coordinates, Vector()) / len(coordinates)
    minimum = Vector((min(co[axis] for co in coordinates) for axis in range(3)))
    maximum = Vector((max(co[axis] for co in coordinates) for axis in range(3)))
    return vertices, coordinates, center, minimum, maximum


def rounded(values):
    return [round(float(value), 9) for value in values]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    source = Path(argv[0])
    output = Path(argv[1])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    groups = components(mesh)
    healthy, corrupt = 15, 18
    hv, hc, hcenter, hmin, hmax = stats(mesh, groups[healthy])
    cv, cc, ccenter, cmin, cmax = stats(mesh, groups[corrupt])
    plane_x = (hcenter.x + ccenter.x) * 0.5
    mirrored = [Vector((2 * plane_x - co.x, co.y, co.z)) for co in hc]
    tree = KDTree(len(cc))
    for local, coordinate in enumerate(cc):
        tree.insert(coordinate, local)
    tree.balance()
    distances = [float(tree.find(coordinate)[2]) for coordinate in mirrored]
    healthy_faces = sorted(
        tuple(vertex - min(hv) for vertex in mesh.polygons[face].vertices)
        for face in groups[healthy]
    )
    corrupt_faces = sorted(
        tuple(vertex - min(cv) for vertex in mesh.polygons[face].vertices)
        for face in groups[corrupt]
    )
    corrupt_faces_reversed = sorted(tuple(reversed(face)) for face in corrupt_faces)
    report = {
        "input": str(source),
        "healthy_component": healthy,
        "corrupt_component": corrupt,
        "faces": {"healthy": len(groups[healthy]), "corrupt": len(groups[corrupt])},
        "vertices": {"healthy": len(hv), "corrupt": len(cv)},
        "healthy": {"center": rounded(hcenter), "minimum": rounded(hmin), "maximum": rounded(hmax)},
        "corrupt": {"center": rounded(ccenter), "minimum": rounded(cmin), "maximum": rounded(cmax)},
        "mirror_plane_x": round(float(plane_x), 9),
        "topology_index_order": {
            "same_winding": healthy_faces == corrupt_faces,
            "reversed_winding": healthy_faces == corrupt_faces_reversed,
        },
        "mirrored_to_corrupt_nearest_distance": {
            "minimum": round(min(distances), 9),
            "mean": round(sum(distances) / len(distances), 9),
            "maximum": round(max(distances), 9),
        },
        "healthy_vertex_indices": hv,
        "corrupt_vertex_indices": cv,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if not key.endswith("indices")}, indent=2))


if __name__ == "__main__":
    main()

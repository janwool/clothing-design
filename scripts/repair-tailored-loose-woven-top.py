#!/usr/bin/env python3
"""Repair the 28 local patch solids in catalog model ID 101.

The garment is physically closed.  Its visible black chips are not absent
triangles: they are individually closed, six-to-fourteen-vertex repair solids
whose imported split normals were inherited from neighboring cloth and point
through the wrong faces on their sharp sidewalls/caps.  Removing these pieces
exposes the recessed construction below.  Preserve every face and replace only
the loop normals on the diagnosed <=24-face repair solids with their own
outward polygon normals.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy


EXPECTED_SMALL = {
    0: 12,
    2: 16,
    5: 8,
    6: 8,
    7: 12,
    10: 8,
    11: 8,
    13: 8,
    19: 12,
    21: 8,
    22: 12,
    24: 8,
    25: 12,
    27: 8,
    29: 8,
    30: 12,
    31: 12,
    34: 8,
    35: 12,
    36: 12,
    38: 12,
    39: 24,
    41: 8,
    42: 8,
    45: 8,
    47: 8,
    50: 8,
    51: 12,
}


def face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_key].append(polygon.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edge_faces.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)

    components = []
    unseen = {polygon.index for polygon in mesh.polygons}
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        queue = deque([seed])
        component = []
        while queue:
            face = queue.popleft()
            component.append(face)
            for other in sorted(neighbors[face]):
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        components.append(component)
    return components


def indexed_topology(mesh: bpy.types.Mesh) -> dict[str, int]:
    edge_counts: dict[tuple[int, int], int] = defaultdict(int)
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_counts[edge_key] += 1
    return {
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "boundary_edges": sum(count == 1 for count in edge_counts.values()),
        "nonmanifold_edges": sum(count != 2 for count in edge_counts.values()),
    }


def alignment(mesh: bpy.types.Mesh, faces: list[int]) -> dict[str, float | int]:
    mesh.calc_normals_split()
    values = [
        float(mesh.polygons[face].normal.dot(mesh.loops[loop].normal))
        for face in faces
        for loop in mesh.polygons[face].loop_indices
    ]
    return {
        "loops": len(values),
        "negative": sum(value < 0.0 for value in values),
        "below_half": sum(value < 0.5 for value in values),
        "minimum": round(min(values), 9),
        "mean": round(sum(values) / len(values), 9),
        "maximum": round(max(values), 9),
    }


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=True,
        export_frame_range=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=position_quantization,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
    mesh = obj.data
    source_topology = indexed_topology(mesh)
    if source_topology != {
        "vertices": 60280,
        "faces": 120444,
        "boundary_edges": 0,
        "nonmanifold_edges": 0,
    }:
        raise RuntimeError(f"Unexpected ID101 source topology: {source_topology}")

    components = face_components(mesh)
    if len(components) != 53:
        raise RuntimeError(f"Expected 53 ID101 components, found {len(components)}")
    actual_small = {
        index: len(faces)
        for index, faces in enumerate(components)
        if len(faces) <= 24
    }
    if actual_small != EXPECTED_SMALL:
        raise RuntimeError(f"Unexpected ID101 repair-solid set: {actual_small}")

    small_faces = [face for index in EXPECTED_SMALL for face in components[index]]
    substantial_faces = [
        face
        for index, faces in enumerate(components)
        if index not in EXPECTED_SMALL
        for face in faces
    ]
    before = {
        "repair_solids": alignment(mesh, small_faces),
        "substantial_garment": alignment(mesh, substantial_faces),
    }
    mesh.calc_normals_split()
    original_normals = [loop.normal.copy() for loop in mesh.loops]
    replacement = list(original_normals)
    repaired_loops = 0
    for face_index in small_faces:
        polygon = mesh.polygons[face_index]
        for loop_index in polygon.loop_indices:
            replacement[loop_index] = polygon.normal.copy()
            repaired_loops += 1

    mesh.use_auto_smooth = True
    mesh.normals_split_custom_set(replacement)
    mesh.update()
    after = {
        "repair_solids": alignment(mesh, small_faces),
        "substantial_garment": alignment(mesh, substantial_faces),
    }
    substantial_loops = [
        loop
        for face in substantial_faces
        for loop in mesh.polygons[face].loop_indices
    ]
    zero_source_loops = [
        loop for loop in substantial_loops if original_normals[loop].length_squared < 0.25
    ]
    zero_source_loop_set = set(zero_source_loops)
    preserved_dots = [
        float(original_normals[loop].dot(mesh.loops[loop].normal))
        for loop in substantial_loops
        if loop not in zero_source_loop_set
    ]
    substantial_preservation = {
        "loops": len(substantial_loops),
        "zero_length_source_loops_ignored": len(zero_source_loops),
        "nonzero_loops_compared": len(preserved_dots),
        "below_0_99999": sum(value < 0.99999 for value in preserved_dots),
        "minimum_dot": round(min(preserved_dots), 9),
        "mean_dot": round(sum(preserved_dots) / len(preserved_dots), 9),
    }
    if after["repair_solids"]["negative"] != 0 or after["repair_solids"]["below_half"] != 0:
        raise RuntimeError(f"ID101 patch normals remain invalid: {after['repair_solids']}")
    if substantial_preservation["below_0_99999"] != 0:
        raise RuntimeError(
            "ID101 substantial garment split normals changed: "
            f"{substantial_preservation}"
        )
    final_topology = indexed_topology(mesh)
    if final_topology != source_topology:
        raise RuntimeError(f"ID101 topology changed during normal repair: {final_topology}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "preserve all geometry; replace split normals only on the 28 "
            "diagnosed <=24-face repair solids; preserve every substantial "
            "garment loop normal byte-for-byte"
        ),
        "source_topology": source_topology,
        "components": len(components),
        "repair_component_faces": EXPECTED_SMALL,
        "repair_components": len(EXPECTED_SMALL),
        "repair_faces": len(small_faces),
        "repaired_loops": repaired_loops,
        "before": before,
        "after": after,
        "substantial_normal_preservation": substantial_preservation,
        "final_topology": final_topology,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

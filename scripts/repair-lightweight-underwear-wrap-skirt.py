#!/usr/bin/env python3
"""Repair the catalog item mislabeled as lightweight underwear.

The original asset is an eight-piece open-front wrap skirt.  Four pairs of
panels share exact authored seam vertices, but the previous repair solidified
all eight disconnected pieces before welding those seams.  The resulting
24 mm shells overlap along the waist and side seams and create the visible
dents and loose one-triangle fragments.  This repair welds only the exact
coincident seam positions, preserves every remaining boundary as an authored
opening/hem, and then adds a much lighter garment thickness to the four
resulting pieces.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


EXPECTED_SOURCE_COMPONENTS = 8
EXPECTED_SOURCE_FACES = 53752
EXPECTED_WELDED_COMPONENTS = 4
EXPECTED_WELDED_VERTICES = 27476
EXPECTED_OPEN_BOUNDARY_EDGES = 1192
EXPECTED_SEAM_WELDS = 409
CONTACT_CLEARANCE = 3e-5
CONTACT_POINTS = [
    Vector((-0.04931, 1.637873, 1.047662)),
    Vector((-0.051326, 1.54333, 1.056175)),
]


def components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    pending = set(bm.faces)
    result: list[list[bmesh.types.BMFace]] = []
    while pending:
        seed = min(pending, key=lambda face: face.index)
        pending.remove(seed)
        queue = deque([seed])
        faces = [seed]
        while queue:
            face = queue.popleft()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in pending:
                        pending.remove(linked)
                        queue.append(linked)
                        faces.append(linked)
        result.append(faces)
    return result


def topology(bm: bmesh.types.BMesh) -> dict[str, int]:
    return {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "components": len(components(bm)),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "true_nonmanifold_edges": sum(
            not edge.is_boundary and not edge.is_manifold for edge in bm.edges
        ),
    }


def boundary_branches(bm: bmesh.types.BMesh) -> list[dict[str, object]]:
    component_rows = components(bm)
    component_by_face = {
        face: index for index, faces in enumerate(component_rows) for face in faces
    }
    rows = []
    for vertex in bm.verts:
        boundary_edges = [edge for edge in vertex.link_edges if edge.is_boundary]
        linked_components = sorted({component_by_face[face] for face in vertex.link_faces})
        if len(boundary_edges) > 2 or len(linked_components) > 1:
            rows.append(
                {
                    "vertex": vertex.index,
                    "coordinate": [round(float(value), 9) for value in vertex.co],
                    "boundary_edge_degree": len(boundary_edges),
                    "linked_face_components": linked_components,
                    "linked_faces": sorted(face.index for face in vertex.link_faces),
                }
            )
    return rows


def source_contact_rows(bm: bmesh.types.BMesh, tolerance: float) -> list[dict[str, object]]:
    component_rows = components(bm)
    component_by_face = {
        face: index for index, faces in enumerate(component_rows) for face in faces
    }
    rows = []
    for point in CONTACT_POINTS:
        matches = [vertex for vertex in bm.verts if (vertex.co - point).length <= tolerance]
        rows.append(
            {
                "target": [round(float(value), 9) for value in point],
                "vertices": [
                    {
                        "vertex": vertex.index,
                        "coordinate": [round(float(value), 9) for value in vertex.co],
                        "linked_face_components": sorted(
                            {component_by_face[face] for face in vertex.link_faces}
                        ),
                        "linked_faces": sorted(face.index for face in vertex.link_faces),
                        "average_normal": [
                            round(float(value), 9)
                            for value in sum(
                                (face.normal for face in vertex.link_faces), Vector()
                            ).normalized()
                        ],
                    }
                    for vertex in matches
                ],
            }
        )
    return rows


def separate_point_contacts(bm: bmesh.types.BMesh, tolerance: float) -> list[dict[str, object]]:
    """Separate two waist/skirt vertices that only touch at a point.

    Source component 3 is nudged 30 microns along its local face normal.  This
    is far below a visible garment detail but greater than the topology audit
    tolerance, so Solidify no longer turns each point contact into a
    four-face edge.
    """
    component_rows = components(bm)
    component_by_face = {
        face: index for index, faces in enumerate(component_rows) for face in faces
    }
    moved = []
    for point in CONTACT_POINTS:
        matches = [vertex for vertex in bm.verts if (vertex.co - point).length <= tolerance]
        if len(matches) != 2:
            raise RuntimeError(f"Expected two source vertices at point contact {point}, found {len(matches)}")
        candidate = next(
            (
                vertex
                for vertex in matches
                if {component_by_face[face] for face in vertex.link_faces} == {3}
            ),
            None,
        )
        if candidate is None:
            raise RuntimeError(f"Could not identify component-3 point contact at {point}")
        normal = sum((face.normal for face in candidate.link_faces), Vector()).normalized()
        before = candidate.co.copy()
        candidate.co += normal * CONTACT_CLEARANCE
        moved.append(
            {
                "vertex": candidate.index,
                "before": [round(float(value), 9) for value in before],
                "after": [round(float(value), 9) for value in candidate.co],
                "normal": [round(float(value), 9) for value in normal],
                "clearance": CONTACT_CLEARANCE,
            }
        )
    return moved


def add_thickness(obj: bpy.types.Object, thickness: float) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Wrap skirt fabric thickness", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 0.0
    modifier.use_even_offset = False
    modifier.use_quality_normals = False
    modifier.use_rim_only = False
    modifier.material_offset = 0
    modifier.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def export_glb(path: Path, position_quantization: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=False,
        export_yup=True,
        export_image_format="AUTO",
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
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.008)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    source = topology(bm)
    source_contacts = source_contact_rows(bm, args.tolerance)
    if source["components"] != EXPECTED_SOURCE_COMPONENTS or source["faces"] != EXPECTED_SOURCE_FACES:
        raise RuntimeError(f"Unexpected source topology: {source}")

    separated_point_contacts = separate_point_contacts(bm, args.tolerance)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=args.tolerance)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    welded = topology(bm)
    welded_boundary_branches = boundary_branches(bm)
    expected = {
        "vertices": EXPECTED_WELDED_VERTICES,
        "components": EXPECTED_WELDED_COMPONENTS,
        "boundary_edges": EXPECTED_OPEN_BOUNDARY_EDGES,
        "true_nonmanifold_edges": 0,
    }
    for key, value in expected.items():
        if welded[key] != value:
            raise RuntimeError(f"Unexpected welded {key}: {welded[key]} != {value}; topology={welded}")
    if source["vertices"] - welded["vertices"] != EXPECTED_SEAM_WELDS:
        raise RuntimeError(
            f"Unexpected seam weld count: {source['vertices'] - welded['vertices']} "
            f"!= {EXPECTED_SEAM_WELDS}"
        )
    if welded_boundary_branches:
        raise RuntimeError(f"Point-contact boundary branches remain: {welded_boundary_branches}")

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    thickened = topology(bm)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "separate two diagnosed waist/skirt point contacts, weld 409 exact "
            "authored seam splits before solidifying, and preserve the 1,192 "
            "remaining wrap opening, waist, and hem boundary edges"
        ),
        "tolerance": args.tolerance,
        "thickness": args.thickness,
        "source": source,
        "source_contacts": source_contacts,
        "separated_point_contacts": separated_point_contacts,
        "vertices_welded": source["vertices"] - welded["vertices"],
        "welded": welded,
        "welded_boundary_branches": welded_boundary_branches,
        "thickened": thickened,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

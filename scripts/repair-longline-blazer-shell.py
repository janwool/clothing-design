#!/usr/bin/env python3
"""Rebuild ID99 from its thin authored blazer surfaces.

The previous catalog asset solidified four detached shoulder scraps together
with the fourteen real pattern shells, left two coincident 24-vertex front
princess seams topologically open, and used enough thickness to create more
than a thousand same-shell contacts along the folded front panels.  This
model-specific repair removes exactly the four diagnosed 3--5 face scraps,
stitches only those two verified front seams, keeps the fourteen authored UV
pieces, and rebuilds a restrained centered fabric thickness before orienting
every resulting closed shell outside.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy


def load_helpers():
    path = Path(__file__).with_name("repair-casual-skirt-topology.py")
    spec = importlib.util.spec_from_file_location("id99_garment_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load topology helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rounded_bounds(faces):
    vertices = {vertex for face in faces for vertex in face.verts}
    minimum = [min(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    maximum = [max(vertex.co[axis] for vertex in vertices) for axis in range(3)]
    return [round(float(value), 6) for value in minimum + maximum]


def nonmanifold_edge_details(bm):
    details = []
    for edge in bm.edges:
        if edge.is_boundary or edge.is_manifold:
            continue
        details.append(
            {
                "vertices": [vertex.index for vertex in edge.verts],
                "coordinates": [
                    [round(float(value), 7) for value in vertex.co]
                    for vertex in edge.verts
                ],
                "length": round(edge.calc_length(), 9),
                "linked_faces": [face.index for face in edge.link_faces],
                "linked_face_count": len(edge.link_faces),
            }
        )
    return details


def stitch_front_princess_seams(bm, components):
    """Join the two exact duplicate boundary chains on the blazer fronts.

    Each main front surface contains a 24-vertex princess seam whose two sides
    occupy identical coordinates but were never welded.  Solidify therefore
    builds two overlapping side walls and exposes a black slit in the viewer.
    Detect the chains by their component sizes and measured coordinate ranges,
    validate their exact pair signature, then weld only those pairs.
    """

    specs = [
        {
            "side": "right front",
            "component_faces": 6357,
            "minimum": (0.99, -1.30, 0.90),
            "maximum": (1.35, 0.95, 1.35),
        },
        {
            "side": "left front",
            "component_faces": 6299,
            "minimum": (-1.35, -1.30, 0.90),
            "maximum": (-0.99, 0.95, 1.15),
        },
    ]
    report = []
    targetmap = {}
    for spec in specs:
        matches = [faces for faces in components if len(faces) == spec["component_faces"]]
        if len(matches) != 1:
            raise RuntimeError(
                f"Unexpected ID99 {spec['side']} component signature: "
                f"{[len(faces) for faces in matches]}"
            )
        faces = matches[0]
        vertices = {vertex for face in faces for vertex in face.verts}
        candidates = [
            vertex
            for vertex in vertices
            if any(edge.is_boundary for edge in vertex.link_edges)
            and all(
                spec["minimum"][axis] <= vertex.co[axis] <= spec["maximum"][axis]
                for axis in range(3)
            )
        ]
        by_coordinate = defaultdict(list)
        for vertex in candidates:
            key = tuple(round(float(value), 7) for value in vertex.co)
            by_coordinate[key].append(vertex)
        pairs = []
        for coordinate, group in by_coordinate.items():
            if len(group) == 1:
                continue
            if len(group) != 2:
                raise RuntimeError(
                    f"Unexpected ID99 {spec['side']} duplicate group at {coordinate}: "
                    f"{[vertex.index for vertex in group]}"
                )
            first, second = sorted(group, key=lambda vertex: vertex.index)
            distance = float((first.co - second.co).length)
            if distance > 1e-7 or set(first.link_edges).intersection(second.link_edges):
                raise RuntimeError(
                    f"Invalid ID99 {spec['side']} seam pair "
                    f"{first.index}/{second.index} at distance {distance}"
                )
            pairs.append((first, second, coordinate, distance))
        pairs.sort(key=lambda item: item[2][1], reverse=True)
        if len(pairs) != 24:
            raise RuntimeError(
                f"Expected 24 ID99 {spec['side']} seam pairs, found {len(pairs)}"
            )
        if not (
            0.90 < pairs[0][2][1] < 0.95
            and -1.30 < pairs[-1][2][1] < -1.25
        ):
            raise RuntimeError(
                f"Unexpected ID99 {spec['side']} seam extent: "
                f"{pairs[0][2]} to {pairs[-1][2]}"
            )
        for first, second, _coordinate, _distance in pairs:
            targetmap[second] = first
        report.append(
            {
                "side": spec["side"],
                "component_faces": len(faces),
                "pairs": len(pairs),
                "first_coordinate": list(pairs[0][2]),
                "last_coordinate": list(pairs[-1][2]),
                "source_vertex_pairs": [
                    [first.index, second.index] for first, second, _, _ in pairs
                ],
                "maximum_pair_distance": max(distance for *_, distance in pairs),
            }
        )

    bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return report


def separate_shared_point_contacts(obj, bm, components, distance):
    """Split the two shoulder bow-tie vertices into their boundary fans."""
    scale = 1_000_000.0
    component_face_sets = [set(faces) for faces in components]

    def face_fans(vertex, allowed_faces):
        remaining = set(vertex.link_faces).intersection(allowed_faces)
        fans = []
        while remaining:
            seed = min(remaining, key=lambda face: face.index)
            remaining.remove(seed)
            stack = [seed]
            fan = [seed]
            while stack:
                face = stack.pop()
                for edge in face.edges:
                    if vertex not in edge.verts:
                        continue
                    for linked in edge.link_faces:
                        if linked in remaining:
                            remaining.remove(linked)
                            stack.append(linked)
                            fan.append(linked)
            fans.append(sorted(fan, key=lambda face: face.index))
        return sorted(fans, key=lambda fan: fan[0].index)

    fan_index = {}
    bowties = []
    for component_index, faces in enumerate(components):
        component_vertices = {vertex for face in faces for vertex in face.verts}
        for vertex in component_vertices:
            fans = face_fans(vertex, component_face_sets[component_index])
            for index, fan in enumerate(fans):
                for face in fan:
                    fan_index[(component_index, vertex, face)] = index
            if len(fans) <= 1:
                continue
            position = [float(value) for value in vertex.co]
            if (
                abs(position[0]) > 2.4
                and 2.90 < position[1] < 3.00
                and -0.40 < position[2] < -0.30
            ):
                bowties.append((component_index, vertex, fans))
    if len(bowties) != 2 or any(len(fans) != 2 for _, _, fans in bowties):
        raise RuntimeError(
            "Unexpected ID99 shoulder bow-tie signature: "
            f"{[(component, vertex.index, len(fans)) for component, vertex, fans in bowties]}"
        )
    selected_bowties = {
        (component, vertex): fans
        for component, vertex, fans in bowties
    }

    uv_layer = bm.loops.layers.uv.active
    vertices = []
    polygons = []
    polygon_materials = []
    polygon_uvs = []
    vertex_map = {}
    contact_report = []
    for component_index, faces in enumerate(components):
        for face in sorted(faces, key=lambda item: item.index):
            polygon = []
            face_uvs = []
            for loop in face.loops:
                fan = fan_index[(component_index, loop.vert, face)]
                key = (component_index, loop.vert, fan)
                if key not in vertex_map:
                    coordinate = loop.vert.co.copy()
                    bowtie_fans = selected_bowties.get((component_index, loop.vert))
                    if bowtie_fans and fan > 0:
                        local_faces = bowtie_fans[fan]
                        normal = sum((linked.normal for linked in local_faces), loop.vert.normal.copy() * 0.0)
                        if normal.length <= 1e-12:
                            raise RuntimeError("ID99 bow-tie fan has no usable local normal")
                        normal.normalize()
                        coordinate += normal * distance * fan
                    vertex_map[key] = len(vertices)
                    vertices.append(tuple(float(value) for value in coordinate))
                polygon.append(vertex_map[key])
                if uv_layer is not None:
                    face_uvs.append(tuple(float(value) for value in loop[uv_layer].uv))
            polygons.append(polygon)
            polygon_materials.append(face.material_index)
            polygon_uvs.append(face_uvs)

    for component, vertex, fans in sorted(bowties, key=lambda item: item[1].co.x):
        contact_report.append(
            {
                "source_vertex": vertex.index,
                "coordinate": [round(float(value), 7) for value in vertex.co],
                "component": component,
                "fan_faces": [[face.index for face in fan] for fan in fans],
                "separation": distance,
            }
        )

    old_mesh = obj.data
    mesh = bpy.data.meshes.new(f"{old_mesh.name} ID99 point-separated")
    mesh.from_pydata(vertices, [], polygons)
    mesh.materials.clear()
    for material in old_mesh.materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, polygon_materials):
        polygon.material_index = material_index
        polygon.use_smooth = True
    if uv_layer is not None:
        target_uv = mesh.uv_layers.new(name="UVMap")
        for polygon, face_uvs in zip(mesh.polygons, polygon_uvs):
            for offset, uv in enumerate(face_uvs):
                target_uv.data[polygon.loop_start + offset].uv = uv
    obj.data = mesh
    bpy.data.meshes.remove(old_mesh)
    mesh.validate(verbose=False, clean_customdata=True)
    mesh.update(calc_edges=True, calc_edges_loose=True)
    return contact_report


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--thickness", type=float, default=0.004)
    parser.add_argument("--position-quantization", type=int, default=22)
    args = parser.parse_args(argv)

    helpers = load_helpers()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh object, found {len(objects)}")
    obj = objects[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    source = helpers.topology(bm)
    expected = {
        "vertices": 19333,
        "faces": 36548,
        "components": 18,
        "boundary_edges": 2090,
        "true_nonmanifold_edges": 0,
    }
    for key, value in expected.items():
        if source[key] != value:
            raise RuntimeError(f"Unexpected ID99 source {key}: {source[key]} (expected {value})")

    components = helpers.components(bm)
    scraps = [
        (index, faces)
        for index, faces in enumerate(components)
        if len(faces) <= 5
    ]
    signature = sorted(len(faces) for _, faces in scraps)
    if signature != [3, 3, 5, 5]:
        raise RuntimeError(f"Unexpected ID99 scrap signature: {signature}")
    removed = [
        {
            "component": index,
            "faces": len(faces),
            "vertices": len({vertex for face in faces for vertex in face.verts}),
            "bbox": rounded_bounds(faces),
        }
        for index, faces in scraps
    ]
    bmesh.ops.delete(
        bm,
        geom=[face for _, faces in scraps for face in faces],
        context="FACES",
    )
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    # Centered Solidify is insensitive to the chosen side, but every open
    # pattern piece must be internally consistent before the offset is made.
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    after_scrap_removal = helpers.topology(bm)
    if after_scrap_removal["components"] != 14:
        raise RuntimeError(f"Expected fourteen authored ID99 pieces: {after_scrap_removal}")
    retained_components = helpers.components(bm)
    stitched_front_seams = stitch_front_princess_seams(bm, retained_components)
    after_front_seam_stitching = helpers.topology(bm)
    expected_after_stitching = {
        "vertices": 19263,
        "faces": 36532,
        "components": 14,
        "boundary_edges": 1970,
        "true_nonmanifold_edges": 0,
    }
    for key, value in expected_after_stitching.items():
        if after_front_seam_stitching[key] != value:
            raise RuntimeError(
                f"Unexpected ID99 topology after front seam stitching for {key}: "
                f"{after_front_seam_stitching[key]} (expected {value})"
            )
    retained_components = helpers.components(bm)
    point_separation = separate_shared_point_contacts(
        obj,
        bm,
        retained_components,
        0.0001,
    )
    bm.free()
    obj.data.validate(verbose=False, clean_customdata=True)
    if obj.data.has_custom_normals:
        obj.data.free_normals_split()
    obj.data.use_auto_smooth = False
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    helpers.add_thickness(obj, args.thickness)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    thickened = helpers.topology(bm)
    thickened_nonmanifold = nonmanifold_edge_details(bm)
    if (
        thickened["components"] != 14
        or thickened["boundary_edges"] != 0
        or thickened["true_nonmanifold_edges"] != 0
    ):
        raise RuntimeError(
            "ID99 restrained thickness did not close cleanly: "
            f"{thickened}; edges={thickened_nonmanifold}"
        )
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update(calc_edges=True, calc_edges_loose=True)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": (
            "remove only the four measured 3--5-face shoulder scraps from the "
            "thin source; stitch only the two diagnosed exact duplicate 24-vertex "
            "front princess seams; preserve fourteen authored pattern shells and "
            "UVs; rebuild centered restrained fabric thickness"
        ),
        "source": source,
        "removed_scraps": removed,
        "after_scrap_removal": after_scrap_removal,
        "stitched_front_seams": stitched_front_seams,
        "after_front_seam_stitching": after_front_seam_stitching,
        "point_separation": point_separation,
        "thickness": args.thickness,
        "thickened": thickened,
        "thickened_nonmanifold": thickened_nonmanifold,
        "uv_islands": len(helpers.uv_islands(obj.data)),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    helpers.export_glb(args.output, args.position_quantization)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Repair the mislabeled relaxed-long-coat asset (a two-piece jumpsuit).

The original thin export contains 18 garment panels plus 49 small detached
pieces.  Thirty-nine are repair covers whose boundaries match holes exactly;
the other ten are legitimate ankle/cuff transition patches and must remain
separate.  This model-specific repair welds only the 39 proven covers, then a
separate seam pass closes the seven doubled pants-side ruptures.  Intentional
garment openings and the ten authored transitions stay untouched.  A centered
Solidify pass can then rebuild fabric thickness without creating plugs/tunnels.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def connected_face_components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    pending = set(bm.faces)
    result: list[list[bmesh.types.BMFace]] = []
    while pending:
        seed = min(pending, key=lambda face: face.index)
        pending.remove(seed)
        queue = deque([seed])
        component = [seed]
        while queue:
            face = queue.popleft()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in pending:
                        pending.remove(linked)
                        queue.append(linked)
                        component.append(linked)
        result.append(component)
    result.sort(key=lambda faces: min(face.index for face in faces))
    return result


def component_boundary(component: list[bmesh.types.BMFace]) -> tuple[list[bmesh.types.BMEdge], list[bmesh.types.BMVert]]:
    faces = set(component)
    edges = sorted(
        {
            edge
            for face in component
            for edge in face.edges
            if sum(linked in faces for linked in edge.link_faces) == 1
        },
        key=lambda edge: edge.index,
    )
    vertices = sorted({vertex for edge in edges for vertex in edge.verts}, key=lambda vertex: vertex.index)
    return edges, vertices


def bbox(vertices: list[bmesh.types.BMVert]) -> list[float]:
    return [
        *[min(vertex.co[axis] for vertex in vertices) for axis in range(3)],
        *[max(vertex.co[axis] for vertex in vertices) for axis in range(3)],
    ]


def center(vertices: list[bmesh.types.BMVert]) -> Vector:
    return sum((vertex.co for vertex in vertices), Vector()) / len(vertices)


def build_tree(vertices: list[bmesh.types.BMVert]) -> tuple[KDTree, list[bmesh.types.BMVert]]:
    ordered = sorted(vertices, key=lambda vertex: vertex.index)
    tree = KDTree(len(ordered))
    for index, vertex in enumerate(ordered):
        tree.insert(vertex.co, index)
    tree.balance()
    return tree, ordered


def boundary_edge_count(bm: bmesh.types.BMesh) -> int:
    return sum(edge.is_boundary for edge in bm.edges)


def boundary_groups(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMEdge]]:
    boundary = {edge for edge in bm.edges if edge.is_boundary}
    groups = []
    while boundary:
        seed = boundary.pop()
        queue = deque([seed])
        group = [seed]
        while queue:
            edge = queue.popleft()
            for vertex in edge.verts:
                for linked in vertex.link_edges:
                    if linked in boundary:
                        boundary.remove(linked)
                        queue.append(linked)
                        group.append(linked)
        groups.append(group)
    groups.sort(key=lambda group: tuple(round(value, 9) for value in center(
        list({vertex for edge in group for vertex in edge.verts})
    )))
    return groups


def ordered_boundary_cycle(group: list[bmesh.types.BMEdge]) -> list[bmesh.types.BMVert]:
    """Return one simple boundary ring in edge order."""
    edge_set = set(group)
    vertices = {vertex for edge in group for vertex in edge.verts}
    neighbors = {
        vertex: sorted(
            {
                other
                for edge in vertex.link_edges
                if edge in edge_set
                for other in edge.verts
                if other is not vertex
            },
            key=lambda item: item.index,
        )
        for vertex in vertices
    }
    if any(len(items) != 2 for items in neighbors.values()):
        raise RuntimeError("Pants-side rupture is not a simple closed boundary ring")
    start = min(vertices, key=lambda vertex: vertex.index)
    ordered = [start]
    previous = None
    current = start
    while True:
        following = next(vertex for vertex in neighbors[current] if vertex is not previous)
        if following is start:
            break
        if following in ordered:
            raise RuntimeError("Pants-side rupture boundary repeated before closing")
        ordered.append(following)
        previous, current = current, following
    if len(ordered) != len(vertices):
        raise RuntimeError("Pants-side rupture boundary walk did not visit every vertex")
    return ordered


def doubled_slit_pairs(ordered: list[bmesh.types.BMVert]) -> tuple[list[tuple[bmesh.types.BMVert, bmesh.types.BMVert]], tuple[bmesh.types.BMVert, bmesh.types.BMVert], float]:
    """Find the two tips and opposing near-coincident vertices of a doubled slit."""
    count = len(ordered)
    if count % 2:
        raise RuntimeError(f"Doubled slit must have an even boundary count, got {count}")
    half = count // 2
    candidates = []
    for tip_index in range(half):
        pairs = [
            (
                ordered[(tip_index + step) % count],
                ordered[(tip_index - step) % count],
            )
            for step in range(1, half)
        ]
        distances = [(left.co - right.co).length for left, right in pairs]
        candidates.append(
            (
                max(distances, default=0.0),
                sum(distances),
                tip_index,
                pairs,
            )
        )
    max_gap, _total_gap, tip_index, pairs = min(candidates, key=lambda item: (item[0], item[1]))
    tips = ordered[tip_index], ordered[(tip_index + half) % count]
    return pairs, tips, float(max_gap)


def stitch_pants_side_slits(bm: bmesh.types.BMesh) -> list[dict[str, object]]:
    """Stitch seven narrow doubled seams without spanning them with cap faces."""
    groups = boundary_groups(bm)
    selected = []
    for index, group in enumerate(groups):
        vertices = list({vertex for edge in group for vertex in edge.verts})
        bounds = bbox(vertices)
        perimeter = sum(edge.calc_length() for edge in group)
        right_side_rupture = (
            len(group) <= 42
            and perimeter < 5.3
            and bounds[0] > 1.7
            and bounds[1] > -7.4
            and bounds[4] < 0.3
            and bounds[2] > 0.1
        )
        left_side_rupture = (
            len(group) == 36
            and perimeter < 4.3
            and bounds[3] < -2.6
            and bounds[1] > -6.1
            and bounds[4] < -3.8
            and bounds[2] > -0.1
            and bounds[5] < 0.1
        )
        if right_side_rupture or left_side_rupture:
            selected.append((index, group, vertices, bounds, perimeter))
    expected_edge_counts = [4, 4, 10, 10, 36, 42, 42]
    if len(selected) != 7 or sorted(len(group) for _i, group, _v, _b, _p in selected) != expected_edge_counts:
        raise RuntimeError(
            "Expected seven pants-side rupture rings (4,4,10,10,36,42,42 edges); "
            f"found {[(index, len(group)) for index, group, _v, _b, _p in selected]}"
        )

    target_map = {}
    rows = []
    for index, group, vertices, bounds, perimeter in selected:
        try:
            ordered = ordered_boundary_cycle(group)
        except RuntimeError as error:
            boundary_degrees = Counter(
                sum(edge in set(group) for edge in vertex.link_edges)
                for vertex in vertices
            )
            raise RuntimeError(
                f"Boundary group {index} ({len(group)} edges) cannot be ordered: {error}; "
                f"boundary degree distribution {dict(sorted(boundary_degrees.items()))}"
            ) from error
        pairs, tips, max_gap = doubled_slit_pairs(ordered)
        if max_gap > 0.01:
            raise RuntimeError(
                f"Boundary group {index} is not a narrow doubled slit; maximum opposing gap is {max_gap:.6f}"
            )
        for source, target in pairs:
            midpoint = (source.co + target.co) * 0.5
            source.co = midpoint
            target.co = midpoint
            target_map[source] = target
        rows.append(
            {
                "boundary_group": index,
                "edges": len(group),
                "perimeter": round(float(perimeter), 8),
                "center": [round(float(value), 6) for value in center(vertices)],
                "bbox": [round(float(value), 6) for value in bounds],
                "slit_tip_vertices": [tips[0].index, tips[1].index],
                "opposing_vertex_pairs": len(pairs),
                "maximum_opposing_gap": round(max_gap, 8),
                "faces_created": 0,
                "repair_method": "midpoint weld opposing sides of narrow doubled seam",
                "action": "stitch one diagnosed pants-side seam rupture; preserve unrelated garment openings",
            }
        )
    bmesh.ops.weld_verts(bm, targetmap=target_map)
    return rows


def apply_thickness(obj: bpy.types.Object, thickness: float) -> None:
    if thickness <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Rebuilt jumpsuit fabric thickness", "SOLIDIFY")
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
        filepath=str(path),
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


def repair_object(
    obj: bpy.types.Object,
    max_patch_faces: int,
    tolerance: float,
    thickness: float,
    inspect_only: bool,
    sew_panel_seams: bool,
    repair_side_slits: bool,
    preserve_panel_uv_seams: bool,
) -> dict[str, object]:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    components = connected_face_components(bm)
    patch_components = [component for component in components if len(component) <= max_patch_faces]
    garment_components = [component for component in components if len(component) > max_patch_faces]
    if len(patch_components) != 49 or len(garment_components) != 18:
        raise RuntimeError(
            f"Unexpected component structure: {len(garment_components)} garment panels and "
            f"{len(patch_components)} repair patches"
        )

    garment_face_set = {face for component in garment_components for face in component}
    garment_component_by_face = {
        face: component_index
        for component_index, component in enumerate(garment_components)
        for face in component
    }
    garment_boundary_vertices = sorted(
        {
            vertex
            for edge in bm.edges
            if edge.is_boundary and any(face in garment_face_set for face in edge.link_faces)
            for vertex in edge.verts
        },
        key=lambda vertex: vertex.index,
    )
    tree, candidates = build_tree(garment_boundary_vertices)
    uv_layer = bm.loops.layers.uv.active
    boundary_before = boundary_edge_count(bm)
    target_map: dict[bmesh.types.BMVert, bmesh.types.BMVert] = {}
    rows = []
    unmatched = []
    patch_boundary_uvs_aligned = 0

    for source_component_index, patch in [
        (components.index(component), component) for component in patch_components
    ]:
        patch_edges, patch_vertices = component_boundary(patch)
        if not patch_edges or not patch_vertices:
            raise RuntimeError(f"Patch component {source_component_index} has no closed boundary")
        distances = []
        target_components = Counter()
        target_indices = []
        patch_target_map = {}
        patch_face_set = set(patch)
        for vertex in patch_vertices:
            _coordinate, candidate_index, distance = tree.find(vertex.co)
            target = candidates[candidate_index]
            linked_garment_faces = [face for face in target.link_faces if face in garment_face_set]
            if not linked_garment_faces:
                raise RuntimeError(f"Patch {source_component_index} matched a non-garment vertex")
            target_components.update(garment_component_by_face[face] for face in linked_garment_faces)
            if uv_layer is not None:
                target_uvs = [
                    tuple(round(float(value), 9) for value in loop[uv_layer].uv)
                    for face in linked_garment_faces
                    for loop in face.loops
                    if loop.vert is target
                ]
                if target_uvs:
                    chosen_uv = Counter(target_uvs).most_common(1)[0][0]
                    for loop in vertex.link_loops:
                        if loop.face in patch_face_set:
                            loop[uv_layer].uv = chosen_uv
                            patch_boundary_uvs_aligned += 1
            patch_target_map[vertex] = target
            target_indices.append(target.index)
            distances.append(float(distance))

        within_tolerance = max(distances) <= tolerance
        unique_targets = len(set(target_indices)) == len(target_indices)
        accepted = within_tolerance and unique_targets
        if accepted:
            target_map.update(patch_target_map)
        else:
            unmatched.append(source_component_index)
        ordered_distances = sorted(distances)
        rows.append(
            {
                "source_component": source_component_index,
                "faces": len(patch),
                "vertices": len({vertex for face in patch for vertex in face.verts}),
                "boundary_edges": len(patch_edges),
                "boundary_vertices": len(patch_vertices),
                "center": [round(float(value), 6) for value in center(patch_vertices)],
                "bbox": [round(float(value), 6) for value in bbox(patch_vertices)],
                "min_weld_distance": round(min(distances), 10),
                "median_weld_distance": round(ordered_distances[len(ordered_distances) // 2], 10),
                "max_weld_distance": round(max(distances), 10),
                "unique_target_vertices": len(set(target_indices)),
                "target_garment_components": dict(sorted(target_components.items())),
                "action": (
                    "weld original patch boundary to its matching hole loop"
                    if accepted
                    else "inspect: nearest-vertex mapping is not safe"
                ),
            }
        )

    unmatched_rows = [row for row in rows if row["source_component"] in unmatched]
    if unmatched and not inspect_only:
        # These ten components are the authored transition strips between the
        # four pants panels and four ankle cuffs.  They legitimately do not map
        # one-to-one onto a single hole loop.  Keep their shape and sew only the
        # coordinates that are already shared with neighboring strips/panels.
        if any(row["bbox"][4] > -7.1 for row in unmatched_rows):
            raise RuntimeError(
                f"Unsafe non-cuff patch mappings {unmatched}; inspect before repairing"
            )
        for row in unmatched_rows:
            row["action"] = "preserve authored ankle transition patch as its own cloth shell"
    if not inspect_only:
        bmesh.ops.weld_verts(bm, targetmap=target_map)
        sewn_uv_loops_unified = 0
        if sew_panel_seams:
            # The seven pants-side defects are narrow doubled seam ruptures,
            # not conventional holes. First sew exact panel coordinates, then
            # pair and midpoint-weld the two sides of each remaining slit. UVs
            # at every welded vertex must become single-valued or glTF will
            # split the topology back open during export.
            vertices_before_exact_seam_weld = len(bm.verts)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=tolerance)
            exact_seam_vertices_welded = vertices_before_exact_seam_weld - len(bm.verts)
            side_slit_repairs = stitch_pants_side_slits(bm) if repair_side_slits else []
            if uv_layer is not None and not preserve_panel_uv_seams:
                for vertex in bm.verts:
                    loops = [loop for loop in vertex.link_loops if loop.face.is_valid]
                    values = [
                        tuple(round(float(value), 9) for value in loop[uv_layer].uv)
                        for loop in loops
                    ]
                    if len(set(values)) <= 1:
                        continue
                    chosen = Counter(values).most_common(1)[0][0]
                    for loop in loops:
                        loop[uv_layer].uv = chosen
                        sewn_uv_loops_unified += 1
        else:
            exact_seam_vertices_welded = 0
            side_slit_repairs = []
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    else:
        exact_seam_vertices_welded = 0
        sewn_uv_loops_unified = 0
        side_slit_repairs = []
    bm.normal_update()
    boundary_after_weld = boundary_edge_count(bm)
    components_after_weld = len(connected_face_components(bm))
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False, clean_customdata=True)
    if mesh.has_custom_normals:
        mesh.free_normals_split()
    mesh.use_auto_smooth = False
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update(calc_edges=True, calc_edges_loose=True)

    if not inspect_only:
        apply_thickness(obj, thickness)
    return {
        "object": obj.name,
        "components_before": len(components),
        "garment_components": len(garment_components),
        "repair_patches": len(patch_components),
        "patch_face_distribution": dict(sorted(Counter(len(component) for component in patch_components).items())),
        "patch_boundary_vertices_welded": len(target_map),
        "patch_boundary_uv_loops_aligned": patch_boundary_uvs_aligned,
        "additional_exact_seam_vertices_welded": exact_seam_vertices_welded,
        "sewn_panel_uv_loops_unified": sewn_uv_loops_unified,
        "panel_seams_sewn": sew_panel_seams,
        "pants_side_slits_repaired": repair_side_slits,
        "panel_uv_seams_preserved": preserve_panel_uv_seams,
        "unmatched_patch_components": unmatched,
        "boundary_edges_before": boundary_before,
        "boundary_edges_after_patch_weld": boundary_after_weld,
        "components_after_patch_weld": components_after_weld,
        "pants_side_seam_repairs": side_slit_repairs,
        "thickness": thickness,
        "inspect_only": inspect_only,
        "patches": rows,
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--max-patch-faces", type=int, default=20)
    parser.add_argument("--tolerance", type=float, default=1e-5)
    parser.add_argument("--thickness", type=float, default=0.0)
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--sew-panel-seams", action="store_true")
    parser.add_argument("--repair-side-slits", action="store_true")
    parser.add_argument("--preserve-panel-uv-seams", action="store_true")
    parser.add_argument("--position-quantization", type=int, default=18)
    args = parser.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one joined mesh object, found {len(objects)}")
    object_report = repair_object(
        objects[0],
        args.max_patch_faces,
        args.tolerance,
        args.thickness,
        args.inspect_only,
        args.sew_panel_seams,
        args.repair_side_slits,
        args.preserve_panel_uv_seams,
    )
    export_glb(args.output.resolve(), args.position_quantization)
    report = {
        "input": str(args.input),
        "output": str(args.output),
        "repair_basis": "39 exact repair covers welded individually; 10 authored ankle transitions preserved",
        "objects": [object_report],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

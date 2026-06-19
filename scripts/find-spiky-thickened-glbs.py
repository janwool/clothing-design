#!/usr/bin/env python3
from __future__ import annotations

import csv
import sys
from pathlib import Path

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mesh_stats(path: Path) -> dict[str, float | int]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

    all_verts = []
    max_edge = 0.0
    total_vertices = 0
    total_faces = 0

    for obj in objects:
        mesh = obj.data
        verts = [obj.matrix_world @ vert.co for vert in mesh.vertices]
        all_verts.extend(verts)
        total_vertices += len(mesh.vertices)
        total_faces += len(mesh.polygons)

        for edge in mesh.edges:
            a = verts[edge.vertices[0]]
            b = verts[edge.vertices[1]]
            max_edge = max(max_edge, (a - b).length)

    if all_verts:
        dims = [
            max(v[axis] for v in all_verts) - min(v[axis] for v in all_verts)
            for axis in range(3)
        ]
    else:
        dims = [0.0, 0.0, 0.0]

    largest = max(dims) if dims else 0.0
    return {
        "objects": len(objects),
        "vertices": total_vertices,
        "faces": total_faces,
        "dim_x": dims[0],
        "dim_y": dims[1],
        "dim_z": dims[2],
        "largest": largest,
        "max_edge": max_edge,
    }


def ratio(a: float, b: float) -> float:
    return a / b if b else 0.0


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    root = Path(argv[0]) if argv else Path("public/uploads/glb")
    output = Path(argv[1]) if len(argv) > 1 else Path("spiky-glb-report.csv")
    limit = int(argv[2]) if len(argv) > 2 else 0

    rows = []
    files = [
        current
        for current in sorted(root.glob("*.glb"))
        if not current.name.endswith(".bak-thin.glb") and not current.name.endswith("-thick.glb")
    ]
    if limit:
        files = files[:limit]

    for index, current in enumerate(files, 1):
        backup = current.with_name(current.stem + ".bak-thin.glb")
        if not backup.exists():
            rows.append({
                "filename": current.name,
                "status": "missing_backup",
            })
            continue

        thin = mesh_stats(backup)
        thick = mesh_stats(current)

        largest_ratio = ratio(float(thick["largest"]), float(thin["largest"]))
        max_edge_ratio = ratio(float(thick["max_edge"]), float(thin["max_edge"]))
        axis_ratio = max(
            ratio(float(thick["dim_x"]), float(thin["dim_x"])),
            ratio(float(thick["dim_y"]), float(thin["dim_y"])),
            ratio(float(thick["dim_z"]), float(thin["dim_z"])),
        )

        suspicious = (
            largest_ratio > 1.25
            or axis_ratio > 1.35
            or (
                float(thick["max_edge"]) > float(thin["largest"]) * 0.35
                and max_edge_ratio > 2.0
            )
        )

        rows.append({
            "filename": current.name,
            "status": "suspicious" if suspicious else "ok",
            "largest_ratio": f"{largest_ratio:.4f}",
            "axis_ratio": f"{axis_ratio:.4f}",
            "max_edge_ratio": f"{max_edge_ratio:.4f}",
            "thin_largest": f"{float(thin['largest']):.4f}",
            "thick_largest": f"{float(thick['largest']):.4f}",
            "thin_max_edge": f"{float(thin['max_edge']):.4f}",
            "thick_max_edge": f"{float(thick['max_edge']):.4f}",
            "thin_vertices": thin["vertices"],
            "thick_vertices": thick["vertices"],
            "thin_faces": thin["faces"],
            "thick_faces": thick["faces"],
        })
        print(
            f"{index}/{len(files)} {rows[-1]['status']}: {current.name} "
            f"largest_ratio={largest_ratio:.3f} axis_ratio={axis_ratio:.3f} "
            f"max_edge_ratio={max_edge_ratio:.3f}",
            flush=True,
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = sorted({key for row in rows for key in row.keys()})
    with output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    suspicious_count = sum(1 for row in rows if row.get("status") == "suspicious")
    print(f"\nscanned={len(rows)} suspicious={suspicious_count} report={output}", flush=True)


if __name__ == "__main__":
    main()

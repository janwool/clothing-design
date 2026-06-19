import sys
import bpy
import bmesh


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh objects found")
    return meshes


def fill_boundary_holes(obj, max_loop_edges=8):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    boundary_edges = [edge for edge in bm.edges if edge.is_boundary]
    visited = set()
    filled = 0

    for start in boundary_edges:
        if start in visited:
            continue
        stack = [start]
        loop = []
        visited.add(start)
        while stack:
            edge = stack.pop()
            loop.append(edge)
            for vert in edge.verts:
                for linked in vert.link_edges:
                    if linked.is_boundary and linked not in visited:
                        visited.add(linked)
                        stack.append(linked)
        if 2 < len(loop) <= max_loop_edges:
            try:
                bmesh.ops.holes_fill(bm, edges=loop, sides=0)
                filled += 1
            except ValueError:
                pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj.select_set(False)
    return filled


def ordered_boundary_loops(mesh):
    edge_counts = {}
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        for index, start in enumerate(verts):
            end = verts[(index + 1) % len(verts)]
            key = tuple(sorted((start, end)))
            edge_counts[key] = edge_counts.get(key, 0) + 1

    adjacency = {}
    for (start, end), count in edge_counts.items():
        if count == 1:
            adjacency.setdefault(start, []).append(end)
            adjacency.setdefault(end, []).append(start)

    loops = []
    visited = set()
    for start, neighbors in adjacency.items():
        for neighbor in neighbors:
            edge_key = tuple(sorted((start, neighbor)))
            if edge_key in visited:
                continue

            loop = [start]
            previous = None
            current = start
            next_vertex = neighbor
            while True:
                visited.add(tuple(sorted((current, next_vertex))))
                previous, current = current, next_vertex
                if current == start:
                    break
                loop.append(current)
                choices = [item for item in adjacency[current] if item != previous]
                if not choices:
                    break
                next_vertex = choices[0]
                if tuple(sorted((current, next_vertex))) in visited:
                    break
            loops.append(loop)
    return loops


def fill_remaining_triangle_boundaries(obj):
    mesh = obj.data
    loops = ordered_boundary_loops(mesh)
    triangle_loops = [loop for loop in loops if len(set(loop)) == 3]
    if not triangle_loops:
        return 0

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    added = 0
    for loop in triangle_loops:
        verts = [bm.verts[index] for index in loop[:3]]
        try:
            bm.faces.new(verts)
            added += 1
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return added


def remove_isolated_boundary_triangles(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    remove_faces = [
        face
        for face in bm.faces
        if len(face.verts) == 3 and all(edge.is_boundary for edge in face.edges)
    ]
    if remove_faces:
        bmesh.ops.delete(bm, geom=remove_faces, context="FACES")
        bm.to_mesh(mesh)
        mesh.update()
    bm.free()
    return len(remove_faces)


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_apply=False,
        export_yup=True,
    )


def main():
    if "--" not in sys.argv:
        raise SystemExit("Usage: blender --background --python fill-glb-boundary-holes.py -- input.glb output.glb")
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Usage: blender --background --python fill-glb-boundary-holes.py -- input.glb output.glb")

    src, dst = args
    clear_scene()
    meshes = import_glb(src)
    total = 0
    for obj in meshes:
        total += fill_boundary_holes(obj)
        total += fill_remaining_triangle_boundaries(obj)
        total += remove_isolated_boundary_triangles(obj)
    export_glb(dst)
    print(f"filled_boundary_holes={total}")


if __name__ == "__main__":
    main()

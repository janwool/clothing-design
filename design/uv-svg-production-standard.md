# Commercial UV / SVG Production Standard

## Scope

This standard applies to every catalog GLB and its editable SVG UV template. Each model is reviewed individually in Blender against the exact GLB published for that catalog entry. Batch heuristics, threshold-based flipping, and generated pass/fail decisions are not accepted as production evidence.

## Coordinate contract

- GLB texture coordinate set: `TEXCOORD_0` / Blender active render UV map.
- SVG canvas: `viewBox="0 0 1024 1024"`.
- Mapping: `svgX = u * 1024`, `svgY = (1 - v) * 1024`.
- SVG top is the garment panel's physical top; SVG bottom is its physical hem/cuff edge.
- Left and right use the wearer's left and right, not the viewer's.
- Artwork and readable test text must not appear mirrored from the outside of the garment.

## Semantic panel contract

- Every editable panel is one closed outer contour with a stable `id` and `data-panel` value.
- Main names use garment meaning, for example `front-body`, `back-body`, `wearer-left-sleeve`, `wearer-right-sleeve`, `collar`, `wearer-left-cuff`, `wearer-right-cuff`, `placket`, and `hem-band`.
- Repeated parts append a stable numeric suffix only when garment semantics cannot distinguish them.
- Seam guides, darts, stitch lines, holes, and tiny disconnected triangles are not editable panels.
- Interior or hidden geometry is excluded unless it is intentionally printable and independently named.

## UV island merge contract

- Audit every pair of exposed regions for shared mesh topology before considering a merge.
- Stitch only islands that share real mesh edges, represent one continuous physical surface, keep one verified exterior direction, and remain non-overlapping after the stitch.
- Do not merge independent sewn panels, layered pocket parts, facings, welts, cords, bindings, interior shells, or left/right and front/back counterparts merely to reduce the SVG path count.
- A compound SVG path or common label is not evidence of a merged UV island. The GLB UV topology and the SVG outline must describe the same result.
- Record the stitched region names, shared-edge evidence, loop count, overlap check and post-export Blender render in the per-model review. If no pair is stitchable, record that result explicitly.

## Blender acceptance checks

1. Open the exact published GLB in Blender's UV Editing workspace.
2. Confirm the active render UV map is the map exported as `TEXCOORD_0`.
3. Inspect every island against the selected 3D faces and assign its garment meaning.
4. Reject zero-area UVs, collapsed rows, unintended overlaps, out-of-range coordinates, stray islands, and mixed front/back faces in one semantic panel.
5. Keep body and sleeve panels upright. Narrow construction pieces may be rotated only when their `data-orientation` records the rotation and their exterior artwork direction remains defined.
6. Apply unique panel colors and readable `FRONT`, `BACK`, `LEFT`, `RIGHT`, and `TOP` test marks.
7. Inspect front, back, wearer-left, and wearer-right 3D views. Text must be readable and panel colors must stay on the named physical part.
8. Export the GLB and SVG together, reopen the exported GLB, and repeat the four-view check before publishing.

## Per-model evidence

Each model receives a folder under `artifacts/uv-production-qa/<slug>/` containing the original UV Editor capture, corrected UV Editor capture, four directional renders, a texture-orientation render, and `review.md` with the source and output asset hashes.

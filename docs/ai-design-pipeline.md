# AI garment design

The existing detail-page conversation calls `POST /api/ai-render-export` with `mode: "design"` and `target: "texture"`.

## Flow

1. The browser loads the selected garment's existing SVG template and UV transform. It assigns every editable SVG path a unique color and adds local direction arrows. It rasterizes the same layout without changing path geometry or panel placement.
2. On the selected garment's actual model-viewer, the browser captures white front/back views and colored front/back/left/right views. Texture slots, base color factors, camera and controls are restored in `finally`.
3. The backend generates a front/back design concept from the white garment, current design screenshot, user's brief and up to four reference images.
4. A second generation receives that concept, the colored atlas, the four actual colored model views and the dynamic color legend. Its prompt requests garment-part identification and artwork orientation from those references. No clothing slug, theme, semantic panel ID or fixed print rotation is used.
5. The final atlas is stored through the existing image library/storage flow. The response includes `image.textureDataUrl`, `image.conceptDataUrl` and `image.workflow: "concept-to-uv"`. The browser applies the atlas through the editor's existing UV transform and history. Application errors restore the previous artwork and base color texture.

## Request context

`designContext` contains:

```json
{
  "panels": [{ "id": 0, "color": "#ff8800" }],
  "whiteViews": { "front": "data:image/jpeg;base64,...", "back": "data:image/jpeg;base64,..." },
  "colorViews": [
    { "view": "front", "image": "data:image/jpeg;base64,..." },
    { "view": "back", "image": "data:image/jpeg;base64,..." },
    { "view": "left", "image": "data:image/jpeg;base64,..." },
    { "view": "right", "image": "data:image/jpeg;base64,..." }
  ]
}
```

The request also includes `image` (current design screenshot), `uvTemplate` (PNG guide atlas), `prompt`, optional `referenceImages` and `modelSlug` (filename only). Authentication, image signatures, unique panel IDs/colors, required views and the 9 MB combined decoded input limit are checked before generation. Design generation reserves 20 credits atomically from the existing account credit pool for the entire two-stage request. Insufficient balance returns `INSUFFICIENT_CREDITS` and opens the existing subscription upgrade dialog with the 20-credit design requirement; unsuccessful generation or persistence releases the reservation. Successful responses include `usage.creditsCharged` and `usage.creditsRemaining`. Design access depends on credits rather than export-plan access. The normal render-export and concept-only modes remain available.

## Configuration

`AI_DESIGN_IMAGE_MODEL` selects the provider image model on local Node or Workers; the existing configured provider default remains the fallback. Existing Cloudflare AI binding or account/token/gateway configuration and object storage are required. The browser allows seven minutes for the two-stage request. No Blender is used.

## Verification and limits

- Backend tests exercise stage ordering, dynamic themes and panel legends, configurable image model, invalid mapping context, provider failure without saving a partial texture, authentication and storage behavior. The provider is mocked in these tests; no live provider generation was performed for this implementation.
- Browser preparation was checked on a 29-path hoodie and a 12-path T-shirt. Both produce white views and four colored views; the latest camera restoration check passes.
- The pipeline requires an existing garment SVG and the editor's supported UV mapping, with at most 512 editable paths. It does not generate missing UVs or add support for independent multi-atlas materials.
- Semantic mapping and border fidelity still depend on the image model. The backend validates image format, not visual seam alignment or spelling. The earlier local Halloween experiment needed corrections; this generic pipeline does not promise exact reconstruction on every garment.
- The selected broader regression run passes 48 of 53 checks. Five existing assertions fail in lighting presets, editor/runtime version expectations, save/apply helper expectations and keyboard nudging. Those unrelated assertions were not rewritten as part of this work.

Browser evidence is saved under `output/ai-design-backend-validation/`.

## Guide fill regression

Arrow patterns use `preserveAspectRatio="none"` so their backing paint covers the entire rectangular tile. SVG's default `meet` created transparent horizontal gaps, which appeared as white stripes in the model references and could be copied into the generated design. The backend prompt also explicitly excludes guide artifacts from the design. Browser validation on the 12-panel T-shirt sampled 570 interior pixels with zero white pixels; see `output/ai-design-backend-validation/guide-no-bands.json` and the corresponding screenshot. Existing generated atlases are raster images and retain the old stripes until regenerated.

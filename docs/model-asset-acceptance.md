# Production model acceptance

The production D1 table `model_asset_reviews` is the authoritative acceptance record.
Models with `review_status = 'qualified'` and `skip_processing = 1` must be excluded
from repair, UV regeneration, optimization, and asset replacement queues.

Query the production database before preparing a batch:

```sql
SELECT m.id, m.slug FROM models_3d m
JOIN model_asset_reviews r ON r.model_id = m.id
WHERE r.review_status = 'qualified' AND r.skip_processing = 1;
```

`protect_qualified_model_asset_urls` rejects changes to approved GLB/SVG URLs.
Do not overwrite the objects at the approved versioned R2 keys. Reprocessing requires
explicit user authorization to clear the exclusion and review the model again.
The review row records approved URLs, SHA-256 hashes, approval time, user authorization,
and verification evidence. Public model availability continues to use `models_3d.status`.

Model 225 (`b42a1ab90447`) was explicitly accepted by the user on 2026-09-19.
Release evidence: `artifacts/deployments/tshirt-225-qualified-20260919/`.
The original Blender source was `artifacts/v16-online-uv/v16-sleeves-connected.blend`.

The user explicitly authorized the cuff repair GLB release on 2026-09-19.
Current Blender source: `artifacts/v16-online-uv/v16-cuff-continuous.blend`.
Current release evidence: `artifacts/deployments/tshirt-225-cuff-20260919/`.
The SVG is unchanged; the production review retains `qualified` and `skip_processing = 1`.

Model 224 (`1dcf321db602`) was explicitly accepted by the user on 2026-09-21.
The approved V26 GLB closes the sleeve-to-body gaps while preserving the validated UV data.
The existing production SVG URL was retained. Release evidence:
`artifacts/deployments/tshirt-224-qualified-20260921/`.

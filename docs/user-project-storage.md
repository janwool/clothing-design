# User project storage

Saved user content is split between D1/SQLite and Cloudflare R2:

- `user_images` stores ownership and metadata for uploaded artwork, generated previews, and AI Try-on results (`purpose = 'try-on-result'`).
- `ai_try_on_results` links each saved result to its user image, source 3D model/project, selected model, and AI model.
- `design_projects` stores 3D or white-mockup editor state. Image fields in `design_data` are URLs, never Base64 payloads.
- R2 objects use `users/{userId}/images/{year}/{month}/{purpose}/{uuid}.{ext}` keys.

Run the user-content migrations against the production D1 database before deployment:

```sh
npx wrangler d1 execute clothing-design --remote --file migrations/0005_user_projects.sql
npx wrangler d1 execute clothing-design --remote --file migrations/0008_ai_try_on_results.sql
```

The application also creates these tables lazily so local SQLite development works without a separate migration command.

Set `SESSION_SECRET` to a long random Worker secret (`npx wrangler secret put SESSION_SECRET`). The existing R2 variables or the Worker `OBJECT_FILE` binding are used for uploads. The public R2/custom-domain response must allow the site origin through CORS because the editors reload saved images into canvas:

```json
[
  {
    "AllowedOrigins": ["https://www.cloz-design.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

# User project storage

Saved user content is split between D1/SQLite and Cloudflare R2:

- `user_images` stores ownership and metadata for uploaded artwork and generated previews.
- `design_projects` stores 3D or white-mockup editor state. Image fields in `design_data` are URLs, never Base64 payloads.
- R2 objects use `users/{userId}/images/{year}/{month}/{purpose}/{uuid}.{ext}` keys.

Run `migrations/0005_user_projects.sql` against the production D1 database before deployment:

```sh
npx wrangler d1 execute clothing-design --remote --file migrations/0005_user_projects.sql
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

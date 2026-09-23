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

## Project deletion

User deletion sets `design_projects.deleted_at` and preserves the project data and uploaded assets. Deleted projects are excluded from user lists and cannot be opened, saved, renamed, or duplicated by the user. The admin project library includes them and displays their deletion time.

Creation allowances count all project records, including deleted ones: Free remains limited to three lifetime creations; paid monthly creation counts also include deletions. Administrator permanent deletion still removes the record and releases its counted allowance.

Migration `0011_project_soft_delete.sql` adds the nullable deletion timestamp. Apply it before starting the updated app when using SQL migrations. The runtime schema initializer also upgrades existing SQLite/D1 tables automatically if the column is missing; do not reapply the ALTER migration after that automatic upgrade. Previously hard-deleted records cannot be recovered by this change.

## Administrator design preview

The admin project library has a **View design** link that opens the source editor and loads saved design data, including soft-deleted projects. This preview disables project saves and image writes through the shared project client, as well as mockup autosave. It does not impersonate the owner.

Set `ADMIN_EMAILS` to a comma-separated list of administrator login emails (Worker secret or local environment). The preview, design-data, and owner-scoped texture endpoints deny access unless the current database user's email is on that list. With no list configured they deny all access. The pre-existing admin dashboard still uses its existing login-only gate; this change adds stricter authorization to design inspection.

## Cover upload authorization

A `project-preview` upload to `/api/user-images` must include `projectId` for an existing, non-deleted project owned by the signed-in user. Each editor first creates the project through `/api/projects`, which enforces creation allowances, then uploads its cover with that ID. A rejected creation or dismissed upgrade dialog must not trigger cover rendering/upload. After upgrading, retrying creation checks the server's current entitlement before proceeding.

Existing projects can replace their covers without consuming another creation allowance; storage limits still apply. Older clients sending no project ID receive a project-limit response if over quota, or a reload-required validation error otherwise. They cannot upload an orphan cover.

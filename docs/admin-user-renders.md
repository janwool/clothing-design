# User render image library

The admin sidebar's **User Renders** entry opens `/admin/renders`. It lists
saved `user_images` records with purpose `ai-render-export`, newest first,
with 30 images per page. The route requires an administrator whose current
database email is in `ADMIN_EMAILS`, and responses use private, no-store caching.

Search matches the stored filename, image ID, owner name, or owner email.
Pagination preserves the search. Summary counts and storage cover saved
renders only; uploaded artwork, previews, textures and try-on results are
excluded. Existing renders appear automatically; no data migration or image
generation is needed. Failed generations and unsaved browser previews have
no saved record and are not shown.

Cards show the original image, owner, filename, generation date, file size,
format and ID. Open original opens the stored file in a separate tab. Broken
thumbnails show Preview unavailable while retaining the original-file link.
The existing User Uploads library also has a Product renders filter.

The built-in imagegen design and exact prompt are saved in
`design-mockups/user-renders/admin-user-renders-v1.png` and the adjacent
`.prompt.json`. Implementation preserves the existing admin's summary-card
colors, rounded cards and complete navigation rather than the mockup's
simplified sidebar. It uses a three-column desktop grid, two columns at
intermediate widths, and a single column on narrow screens. All metrics and
images come from stored records, rather than the design's illustrative data.

Validation covers filtered SQL results, owner search, parameterized inputs,
pagination bounds, errors, and both Node and Worker template rendering.
Browser checks against D1 showed four existing renders from two users;
owner search, no-results and clear-filter behavior worked. Desktop and 375px
mobile layouts were inspected; mobile document width did not overflow.
The Worker build passes. Application code has not been deployed to production.

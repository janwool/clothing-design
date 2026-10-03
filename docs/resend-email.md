# Admin email sending

Open `/admin/email` with an account listed in `ADMIN_EMAILS`. Authorization uses
its current database identity on every request; submissions also require a
session CSRF token. Credentials never appear in page HTML or logs.

## Recipients

The default is **All users**. **Select users** supports searching names and
addresses, selecting the filtered results, and clearing selection. **Email
addresses** accepts up to 1,000 comma, semicolon, or whitespace-separated
addresses. Selected users are resolved on the server. Invalid user addresses
are skipped and duplicate addresses are sent once. Each recipient receives
an individual email and cannot see the other recipients.

Submitting creates an immutable snapshot of recipients, subject, message and
sender. New registrations do not change an existing campaign. Plain-text
messages also receive escaped HTML formatting. No messages are sent merely
by opening this page.

## Configuration and deployment state

The verified Resend domain is `cloz-design.com`. The **ClozDesign Admin Email**
credential has Sending access limited to that domain. Its secret has been
saved to ignored `.env.local` and the `clothing-design` Cloudflare Worker.
The configured sender is `ClozDesign <notifications@cloz-design.com>` and
reply-to is `support@cloz-design.com`; mailbox availability is separate from
Resend's sending-domain verification.

`RESEND_API_KEY` must remain a secret. `RESEND_FROM_EMAIL` and
`RESEND_REPLY_TO` are ordinary Worker variables in `wrangler.toml`. Optional
`RESEND_PROXY_URL` only affects local Node development and is ignored by the
Worker. Restart the local application after code or environment changes.

The implementation and one-minute cron schedule are developed locally.
**The application code and cron have not been deployed to production.**
The checkout also contains unrelated in-progress changes, which should be
reviewed separately before deploying the complete Worker.

## Queue and recovery

SQLite/D1 tables `admin_email_campaigns`, `admin_email_batches`, and
`admin_email_runner` are created automatically. Batches contain 20 individually
addressed messages. A database lease coordinates runners. The local app runs
the queue once per minute; the Worker uses its scheduled handler. A manual
local run is available through `node scripts/process-email-queue.js`.

Each invocation processes up to three batches. Sending continues after the
page is closed. Refresh history to see progress. **Accepted** means Resend
accepted the request, rather than confirmed delivery. Delivery and bounce
information remains in Resend; no delivery webhook is installed.

Retries reuse immutable payloads and the same provider idempotency keys.
Interrupted or uncertain attempts are recovered after three minutes with up
to three automatic attempts. Definitive provider errors pause the remaining
batches of that campaign; **Retry remaining** resumes eligible recipients and
skips accepted batches. Retries stop after 23 hours from the first attempt,
within Resend's 24-hour idempotency window. Check old unconfirmed attempts in
Resend before composing a replacement message. Legacy single-message records
remain readable and recoverable.

## Validation and design

`node --test test/admin-email.test.js` passes 11 tests covering administrator
access, CSRF, immutable snapshots, concurrent submissions, address deduplication,
selected-user validation, runner coordination, provider failures, quota pauses,
retry expiry, and persistence failure after provider acceptance. The Worker
build passes. Real Resend single and batch requests to `delivered@resend.dev`
were accepted; the batch result was persisted in D1. No campaign was sent to
registered users during development.

Desktop and 375px mobile compose/configuration/history were visually inspected.
Search empty states, filtered selection, clear selection, and manual-address
counts were checked in the browser. The mobile document has no horizontal
overflow. The design generated before implementation is saved at
`design-mockups/resend-email/admin-email-bulk-v2.png`, with its prompt alongside.
The implementation uses the existing navigation and actual configuration and
history, with responsive cards for campaign progress.

The full existing suite previously reported three unrelated failures in
`generated-assets.test.js` and `model-designer-camera.test.js`, involving saved
3D camera/lighting values. Those sources were not changed by this task.

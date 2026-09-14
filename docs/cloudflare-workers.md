# Cloudflare Workers Deployment

This project is an Express/EJS server app. Deploy it as a Cloudflare Worker, not as a static Cloudflare Pages project.

## Cloudflare project settings

- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Worker entry: configured in `wrangler.toml` as `dist/worker.mjs`
- Static assets: configured in `wrangler.toml` as `public`
- D1 database: configured in `wrangler.toml` as binding `DB`

## Required environment variables

Set these in Cloudflare Workers settings:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_URL`
- `SESSION_SECRET`

Google sign-in additionally requires Worker secrets named `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. Create a Google OAuth client with the Web application type
and register this exact production redirect URI:

```text
https://www.cloz-design.com/auth/google/callback
```

Then configure the Worker without committing either value:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

For local development, add the same names to `.env` and register
`http://localhost:3000/auth/google/callback` on the Google OAuth client. An explicit
`GOOGLE_REDIRECT_URI` can override the request-derived callback when needed.

The database layer uses the D1 binding named `DB`. Do not rely on the D1 REST API variables for production Workers.

## Local development

Use the existing Express server:

```sh
npm start
```

To test the Worker locally after Wrangler is available:

```sh
npm run worker:dev
```

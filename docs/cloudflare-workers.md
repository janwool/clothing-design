# Cloudflare Workers Deployment

This project is an Express/EJS server app. Deploy it as a Cloudflare Worker, not as a static Cloudflare Pages project.

## Cloudflare project settings

- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Worker entry: configured in `wrangler.toml` as `src/worker.mjs`
- Static assets: configured in `wrangler.toml` as `public`

## Required environment variables

Set these in Cloudflare Workers settings:

- `DB_TYPE=d1`
- `D1_DATABASE_ID`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_URL`
- `SESSION_SECRET`

Alternatively, bind a D1 database as `DB`. The database layer will prefer the `DB` binding when it is available, and fall back to the D1 REST variables above.

## Local development

Use the existing Express server:

```sh
npm start
```

To test the Worker locally after Wrangler is available:

```sh
npm run worker:dev
```

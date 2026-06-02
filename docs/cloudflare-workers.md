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

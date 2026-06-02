import { httpServerHandler } from 'cloudflare:node';

let handlerPromise;

function applyEnvironment(env) {
  globalThis.__WORKER_ENV__ = env;
  process.env.CF_WORKER = 'true';
  process.env.DB_TYPE = env.DB_TYPE || 'd1';

  const keys = [
    'D1_DATABASE_ID',
    'CF_ACCOUNT_ID',
    'CF_API_TOKEN',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_URL',
    'SESSION_SECRET'
  ];

  for (const key of keys) {
    if (env[key]) {
      process.env[key] = env[key];
    }
  }
}

async function getHandler(env) {
  applyEnvironment(env);

  if (!handlerPromise) {
    handlerPromise = import('../app-core.js').then(mod => {
      const app = mod.default || mod;
      app.listen(3000);
      return httpServerHandler({ port: 3000 });
    });
  }

  return handlerPromise;
}

export default {
  async fetch(request, env, ctx) {
    const handler = await getHandler(env);
    if (typeof handler.fetch === 'function') {
      return handler.fetch(request, env, ctx);
    }
    return handler(request, env, ctx);
  }
};

import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';

function applyEnvironment(workerEnv) {
  globalThis.__WORKER_ENV__ = workerEnv;
  process.env.CF_WORKER = 'true';
  process.env.DB_TYPE = workerEnv.DB_TYPE || 'd1';

  const keys = [
    'D1_DATABASE_ID',
    'CF_ACCOUNT_ID',
    'CF_API_TOKEN',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_URL',
    'PUBLIC_SITE_ORIGIN',
    'SESSION_SECRET'
  ];

  for (const key of keys) {
    if (workerEnv[key]) {
      process.env[key] = workerEnv[key];
    }
  }
}

applyEnvironment(env);

const mod = await import('../app-core.js');
const app = mod.default || mod;

app.listen(3000);

export default httpServerHandler({ port: 3000 });

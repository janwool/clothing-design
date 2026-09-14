function environmentValue(name) {
  return process.env[name] ?? globalThis.__WORKER_ENV__?.[name] ?? '';
}

function enabled(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value || '').trim());
}

function isAiTryOnEnabled() {
  return enabled(environmentValue('AI_TRY_ON_ENABLED'));
}

module.exports = {
  isAiTryOnEnabled
};

function env(key) {
  return globalThis.__WORKER_ENV__?.[key] || process.env[key] || '';
}

let localProxy;
function proxyOptions() {
  const url = env('RESEND_PROXY_URL');
  if (!url || globalThis.__WORKER_ENV__) return {};
  if (!localProxy) {
    const nodeRequire = eval('require');
    localProxy = new (nodeRequire('undici').ProxyAgent)(url);
  }
  return { dispatcher: localProxy };
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
}

function getEmailConfig() {
  const from = String(env('RESEND_FROM_EMAIL')).trim();
  const address = from.match(/<([^<>]+)>$/)?.[1] || from;
  const replyTo = String(env('RESEND_REPLY_TO')).trim();
  return {
    apiKey: env('RESEND_API_KEY'), from, replyTo,
    ready: Boolean(env('RESEND_API_KEY') && validEmail(address) && !/[\r\n]/.test(from) && (!replyTo || validEmail(replyTo))),
    domain: validEmail(address) ? address.split('@')[1] : '',
    keyConfigured: Boolean(env('RESEND_API_KEY'))
  };
}

function validateMessage(input) {
  const value = {
    to: String(input?.to || '').trim().toLowerCase(),
    subject: String(input?.subject || '').trim(),
    text: String(input?.text || '').trim(),
    replyTo: String(input?.replyTo || '').trim().toLowerCase()
  };
  if (!validEmail(value.to)) throw new Error('Enter one valid recipient email address.');
  if (!value.subject || value.subject.length > 200 || /[\r\n]/.test(value.subject)) throw new Error('Enter a subject of 1–200 characters without line breaks.');
  if (!value.text || value.text.length > 20000) throw new Error('Enter a message of 1–20,000 characters.');
  if (value.replyTo && !validEmail(value.replyTo)) throw new Error('Enter a valid reply-to email address.');
  return value;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function messagePayload(value, config = getEmailConfig()) {
  return {
    from: config.from, to: [value.to], subject: value.subject, text: value.text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1d1d1f;max-width:600px;margin:auto"><p style="font-weight:700">ClozDesign</p><div>${escapeHtml(value.text).replace(/\n/g, '<br>')}</div></div>`,
    ...((value.replyTo || config.replyTo) ? { reply_to: value.replyTo || config.replyTo } : {})
  };
}

async function sendEmail(payload, requestId, fetchImpl = fetch) {
  const config = getEmailConfig();
  if (!config.ready) throw Object.assign(new Error('Email sending is not configured.'), { status: 503, uncertain: false });
  let response;
  let data;
  try {
    response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `cloz-admin/${requestId}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), ...proxyOptions()
    });
    data = await response.json();
  } catch {
    throw Object.assign(new Error('The sending result could not be confirmed. Retry this record to check safely.'), { status: 502, uncertain: true });
  }
  if (!response.ok || !data.id) {
    const uncertain = response.status >= 500 || response.status === 409 || response.ok;
    const messages = {
      401: 'The email service credentials were rejected. Contact the administrator.',
      403: 'The sender address or sending permission was rejected. Check the verified domain in Resend.',
      422: 'The email service rejected this message. Check the sender and recipient addresses.',
      429: 'The sending limit has been reached. Wait before retrying this record.'
    };
    throw Object.assign(new Error(uncertain ? 'The sending result could not be confirmed. Retry this record to check safely.' : messages[response.status] || 'The email service rejected this message.'), { status: 502, uncertain });
  }
  return { id: data.id };
}

async function sendBatch(payload, requestId, fetchImpl = fetch) {
  const config = getEmailConfig();
  if (!config.ready) throw Object.assign(new Error('Email sending is not configured.'), { uncertain: false });
  let response, data;
  try {
    response = await fetchImpl('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `cloz-bulk/${requestId}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), ...proxyOptions()
    });
    data = await response.json();
  } catch {
    throw Object.assign(new Error('The sending result is unconfirmed. Retry using the saved message.'), { uncertain: true });
  }
  if (!response.ok) {
    const uncertain = response.status >= 500 || response.status === 409;
    const error = response.status === 429 ? 'Resend sending quota or rate limit reached. Retry after the limit resets.'
      : response.status === 403 ? 'Resend rejected the sender domain or sending permission.'
        : response.status === 401 ? 'Resend rejected the service credentials.'
          : uncertain ? 'The sending result is unconfirmed. Retry using the saved message.'
            : 'Resend rejected this batch. Check the sending configuration and addresses.';
    throw Object.assign(new Error(error), { uncertain, quota: response.status === 429 });
  }
  if (!Array.isArray(data.data) || data.data.length !== payload.length || data.data.some(item => !item?.id)) {
    throw Object.assign(new Error('The batch result is incomplete. Retry using the saved message.'), { uncertain: true });
  }
  return data.data.map(item => item.id);
}

module.exports = { getEmailConfig, validEmail, validateMessage, messagePayload, sendEmail, sendBatch };

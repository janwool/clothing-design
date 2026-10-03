const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { randomUUID } = require('node:crypto');
const project = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloz-email-test-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_TYPE = 'sqlite';
process.env.ADMIN_EMAILS = 'owner@example.test';
process.env.RESEND_API_KEY = 're_test_secret';
process.env.RESEND_FROM_EMAIL = 'ClozDesign <notifications@cloz-design.com>';
process.env.RESEND_REPLY_TO = 'support@cloz-design.com';
const db = require('../lib/db');
const { validateMessage, messagePayload, sendEmail } = require('../lib/resend-email');
const realFetch = global.fetch;
let server, origin, calls = [], provider;
global.fetch = async (url, options) => {
  if (!['https://api.resend.com/emails', 'https://api.resend.com/emails/batch'].includes(url)) return realFetch(url, options);
  calls.push(options);
  return provider(options);
};
const accepted = () => ({ ok: true, status: 200, json: async () => ({ id: 'provider-id' }) });

before(async () => {
  await db.run('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT)');
  await db.run("INSERT INTO users VALUES (1, 'owner@example.test', 'Owner'), (2, 'customer@example.test', 'Customer')");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: req.headers['x-test-user'] === 'anonymous' ? null : { id: Number(req.headers['x-test-user'] || 1) }, emailCsrf: 'csrf-test' };
    res.locals.i18next = { language: 'en' };
    next();
  });
  app.set('views', path.join(project, 'views'));
  app.set('view engine', 'ejs');
  app.use('/admin/email', require('../routes/admin-email'));
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  origin = `http://127.0.0.1:${server.address().port}`;
  await realFetch(`${origin}/admin/email`);
});
after(async () => {
  global.fetch = realFetch;
  await new Promise(resolve => server.close(resolve));
  process.chdir(originalCwd);
  fs.rmSync(temp, { recursive: true, force: true });
});
function post(endpoint, body, headers = {}) {
  return realFetch(`${origin}/admin/email${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test', ...headers }, body: JSON.stringify(body) });
}
const message = () => ({ requestId: randomUUID(), to: 'person@example.test', subject: 'Your design', text: 'Hello <script>alert(1)</script>\nYour design is ready.' });

test('validates recipients, subject header injection, reply-to, and body limits; escapes email HTML', () => {
  assert.throws(() => validateMessage({ ...message(), to: 'one@example.test,two@example.test' }));
  assert.throws(() => validateMessage({ ...message(), subject: 'Hello\r\nBcc: other@example.test' }));
  assert.throws(() => validateMessage({ ...message(), replyTo: 'invalid' }));
  assert.throws(() => validateMessage({ ...message(), text: 'x'.repeat(20001) }));
  const payload = messagePayload(validateMessage(message()));
  assert.ok(!payload.html.includes('<script>'));
  assert.match(payload.html, /&lt;script&gt;/);
  assert.equal(payload.reply_to, 'support@cloz-design.com');
});

test('only verified administrators can access email pages and send; CSRF failures do not send', async () => {
  for (const [user, code] of [['anonymous', 401], ['2', 403]]) {
    assert.equal((await realFetch(`${origin}/admin/email`, { headers: { 'X-Test-User': user } })).status, code);
    assert.equal((await post('/send', message(), { 'X-Test-User': user })).status, code);
    assert.equal((await post('/campaigns', message(), { 'X-Test-User': user })).status, code);
  }
  const count = calls.length;
  assert.equal((await post('/send', message(), { 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal(calls.length, count);
});

const campaignsApi = require('../lib/admin-email-campaigns');
const acceptBatch = options => ({ ok:true, status:200, json:async () => ({data:JSON.parse(options.body).map((item, index)=>({id:`provider-${index}`}))}) });
test('all-users is the default; recipient snapshot deduplicates addresses and survives repeat submissions and new users', async () => {
  for(let id=3;id<=45;id++) await db.run('INSERT INTO users VALUES (?, ?, ?)',[id, id===3 ? 'CUSTOMER@example.test' : id===4 ? 'invalid' : `user${id}@example.test`, `User ${id}`]);
  const input = {...message(), audience:'all'};
  const results = await Promise.all([post('/campaigns',input),post('/campaigns',input)]);
  assert.ok(results.every(response=>response.status===202));
  const first=await results[0].json();
  assert.equal(first.total,43);
  const batches=await db.all('SELECT * FROM admin_email_batches WHERE campaign_id = ? ORDER BY batch_index',[first.id]);
  assert.equal(batches.length,3);
  const payloads=batches.flatMap(row=>JSON.parse(row.payload));
  assert.equal(new Set(payloads.map(row=>row.to[0])).size,43);
  assert.ok(payloads.every(row=>row.to.length===1 && !row.cc && !row.bcc));
  await db.run("INSERT INTO users VALUES (46, 'new@example.test', 'New user')");
  assert.equal((await (await post('/campaigns', input)).json()).total,43);
  provider=acceptBatch;calls=[];
  await Promise.all([campaignsApi.processCampaignQueue({maxBatches:1}),campaignsApi.processCampaignQueue({maxBatches:1})]);
  assert.equal(calls.length,1);
  await campaignsApi.processCampaignQueue({maxBatches:3});
  const history=await campaignsApi.campaignHistory();
  const record=history.find(row=>row.id===first.id);
  assert.equal(record.accepted,43);
  assert.equal(record.status,'Accepted');
});

test('selected users are resolved on the server; manual lists reject invalid addresses and deduplicate', async () => {
  const selected=await (await post('/campaigns',{...message(),audience:'selected',userIds:[1,2,2]})).json();
  assert.equal(selected.total,2);
  assert.equal((await post('/campaigns',{...message(),audience:'selected',userIds:[999]})).status,400);
  const manual=await (await post('/campaigns',{...message(),audience:'manual',addresses:'One@example.test,one@example.test\ntwo@example.test'})).json();
  assert.equal(manual.total,2);
  assert.equal((await post('/campaigns',{...message(),audience:'manual',addresses:'one@example.test,invalid'})).status,400);
  provider=acceptBatch;
  await campaignsApi.processCampaignQueue({maxBatches:3});
});

test('quota failure pauses remaining recipients; retry skips accepted batches and reuses the batch key', async () => {
  const input={...message(),audience:'manual',addresses:Array.from({length:41},(_,i)=>`quota${i}@example.test`).join(',')};
  const created=await campaignsApi.createCampaign(input,1);
  calls=[]; provider=acceptBatch;
  await campaignsApi.processCampaignQueue({maxBatches:1});
  provider=()=>({ok:false,status:429,json:async()=>({message:'limit exceeded'})});
  await campaignsApi.processCampaignQueue({maxBatches:3});
  const record=(await campaignsApi.campaignHistory()).find(row=>row.id===created.id);
  assert.equal(record.accepted,20);assert.equal(record.failed,21);
  await assert.rejects(campaignsApi.retryCampaign(created.id),/Wait three minutes/);
  await db.run("UPDATE admin_email_batches SET updated_at = datetime('now', '-4 minutes') WHERE campaign_id = ?",[created.id]);
  await campaignsApi.retryCampaign(created.id);
  provider=acceptBatch;
  await campaignsApi.processCampaignQueue({maxBatches:3});
  assert.equal(calls[1].headers['Idempotency-Key'],calls[2].headers['Idempotency-Key']);
  assert.equal(calls[1].body,calls[2].body);
  assert.equal((await campaignsApi.campaignHistory()).find(row=>row.id===created.id).accepted,41);
});

test('interrupted batch persistence is recovered with the same payload; retry window prevents duplicates', async () => {
  const input={...message(),audience:'manual',addresses:'uncertain@example.test'};
  const created=await campaignsApi.createCampaign(input,1);
  calls=[];provider=acceptBatch;
  const originalRun=db.run;
  db.run=(sql,params)=>sql.includes('provider_ids = ?') ? Promise.reject(new Error('persistence unavailable')) : originalRun(sql,params);
  try {await assert.rejects(campaignsApi.processCampaignQueue({maxBatches:1}));} finally {db.run=originalRun;}
  await db.run("UPDATE admin_email_batches SET updated_at = datetime('now', '-4 minutes') WHERE campaign_id = ?",[created.id]);
  await campaignsApi.processCampaignQueue({maxBatches:1});
  assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
  const late=await campaignsApi.createCampaign({...message(),audience:'manual',addresses:'late@example.test'},1);
  await db.run("UPDATE admin_email_batches SET status='unknown', first_attempt_at=datetime('now','-24 hours'), updated_at=datetime('now','-4 minutes') WHERE campaign_id=?",[late.id]);
  const count=calls.length;
  await assert.rejects(campaignsApi.retryCampaign(late.id));
  await campaignsApi.processCampaignQueue({maxBatches:1});
  assert.equal(calls.length,count);
});

test('sends through Resend, persists acceptance, and deduplicates concurrent submissions', async () => {
  calls = []; provider = accepted;
  const input = message();
  const responses = await Promise.all([post('/send', input), post('/send', input)]);
  assert.ok(responses.some(response => response.status === 200));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['Idempotency-Key'], `cloz-admin/${input.requestId}`);
  const record = await db.get('SELECT * FROM admin_emails WHERE id = ?', [input.requestId]);
  assert.equal(record.status, 'accepted');
  assert.equal(record.provider_id, 'provider-id');
  assert.equal((await post('/send', input)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await post('/send', { ...input, text: 'Changed content' })).status, 409);
});

test('network uncertainty is persisted; retry reuses the original payload and key; late retries are blocked', async () => {
  calls = []; provider = async () => { throw new Error('network down'); };
  const input = message();
  const response = await post('/send', input);
  assert.equal((await response.json()).status, 'unknown');
  assert.equal((await post(`/${input.requestId}/retry`, {})).status, 409);
  await db.run("UPDATE admin_emails SET updated_at = datetime('now', '-1 minute') WHERE id = ?", [input.requestId]);
  provider = accepted;
  assert.equal((await post(`/${input.requestId}/retry`, {})).status, 200);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  const old = message(); provider = async () => { throw new Error('network down'); };
  await post('/send', old);
  await db.run("UPDATE admin_emails SET created_at = datetime('now', '-24 hours'), updated_at = datetime('now', '-1 minute') WHERE id = ?", [old.requestId]);
  const count = calls.length;
  assert.equal((await post(`/${old.requestId}/retry`, {})).status, 409);
  assert.equal(calls.length, count);
});

test('persistence failure after provider acceptance does not report a rejection or lose retry identity', async () => {
  provider = accepted; calls = [];
  const originalRun = db.run;
  const input = message();
  db.run = (sql, params) => sql.includes("SET status = 'accepted'") ? Promise.reject(new Error('write failure')) : originalRun(sql, params);
  try { assert.equal((await post('/send', input)).status, 500); } finally { db.run = originalRun; }
  assert.equal((await db.get('SELECT status FROM admin_emails WHERE id = ?', [input.requestId])).status, 'pending');
  await db.run("UPDATE admin_emails SET updated_at = datetime('now', '-1 minute') WHERE id = ?", [input.requestId]);
  assert.equal((await post(`/${input.requestId}/retry`, {})).status, 200);
  assert.equal(calls[0].body, calls[1].body);
});

test('provider rejection is sanitized and missing configuration never contacts Resend', async () => {
  await assert.rejects(sendEmail({}, randomUUID(), async () => ({ ok: false, status: 403, json: async () => ({ message: 'private secret details' }) })), error => !error.uncertain && !error.message.includes('private'));
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const count = calls.length;
  try { assert.equal((await post('/send', message())).status, 503); } finally { process.env.RESEND_API_KEY = key; }
  assert.equal(calls.length, count);
  const response = await realFetch(`${origin}/admin/email`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Sending history/);
  assert.ok(!html.includes(key));
});

test('email page renders both configuration and history states in the production Worker engine', () => {
  const templates = require('../src/worker-templates.cjs');
  for (const ready of [false, true]) {
    const html = templates.render('admin/email', {
      title: 'Email', page: 'admin-email', i18next: { language: 'en' },
      campaigns: [], emailUsers: [{id:1, name:'Owner', email:'owner@example.test'}],
      config: { ready, from: 'ClozDesign <notifications@cloz-design.com>', domain: 'cloz-design.com', keyConfigured: ready, replyTo: '' },
      items: ready ? [{ id: randomUUID(), recipient: 'person@example.test', subject: '<script>', status: 'accepted', provider_id: 'provider-id', error: null, created_at: '2026-10-03 10:00:00' }] : [],
      error: '', historyPage: 1, pageCount: 1, csrf: 'csrf-test'
    });
    assert.match(html, ready ? /Sending enabled/ : /Configuration required/);
    assert.match(html, ready ? /&lt;script&gt;/ : /No messages yet/);
  }
});

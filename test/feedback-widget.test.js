const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateFeedbackPayload } = require('../lib/feedback');

const root = path.join(__dirname, '..');
const header = fs.readFileSync(path.join(root, 'views', 'partials', 'header.ejs'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'views', 'partials', 'footer.ejs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'feedback-widget.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'js', 'feedback-widget.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app-core.js'), 'utf8');
const route = fs.readFileSync(path.join(root, 'routes', 'feedback.js'), 'utf8');

test('mounts one global right-side feedback control without a visible form title', () => {
  assert.match(header, /feedback-widget\.css/);
  assert.match(footer, /data-feedback-widget/);
  assert.match(footer, /data-feedback-panel role="dialog"/);
  assert.match(footer, /placeholder="Email"/);
  assert.match(footer, /placeholder="Tell us what you think…"/);
  assert.doesNotMatch(footer, /<h[1-6][^>]*>[^<]*Feedback/i);
  assert.match(styles, /position: fixed/);
  assert.match(styles, /right: max\(18px/);
  assert.match(script, /fetch\('\/api\/feedback'/);
});

test('prefills the feedback email for signed-in users', () => {
  assert.match(footer, /value="<%= user && user\.email \? user\.email : '' %>"/);
});

test('validates anonymous feedback and falls back to the signed-in account email', () => {
  const anonymous = validateFeedbackPayload({
    email: ' Designer@Example.com ',
    message: '  Please add more outerwear models.  ',
    sourceUrl: '/mockups'
  });
  assert.equal(anonymous.valid, true);
  assert.equal(anonymous.value.email, 'designer@example.com');

  const signedIn = validateFeedbackPayload(
    { email: '', message: 'The editor is useful.' },
    { id: 7, email: 'owner@example.com' }
  );
  assert.equal(signedIn.valid, true);
  assert.equal(signedIn.value.email, 'owner@example.com');

  assert.equal(validateFeedbackPayload({ email: 'invalid', message: '' }).valid, false);
});

test('stores feedback through a rate-limited API route', () => {
  assert.match(app, /app\.use\('\/api\/feedback', require\('\.\/routes\/feedback'\)\)/);
  assert.match(route, /MAX_SUBMISSIONS_PER_WINDOW = 5/);
  assert.match(route, /INSERT INTO feedback_submissions/);
  assert.match(route, /req\.session\?\.user\?\.id/);
});

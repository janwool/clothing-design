const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, limit) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, limit);
}

function validateFeedbackPayload(body = {}, sessionUser = null) {
  const sessionEmail = cleanText(sessionUser && sessionUser.email, 180).toLowerCase();
  const email = cleanText(body.email, 180).toLowerCase() || sessionEmail;
  const message = cleanText(body.message, 2000);
  const website = cleanText(body.website, 200);
  const sourceUrl = cleanText(body.sourceUrl, 500);
  const errors = [];

  if (!EMAIL_PATTERN.test(email)) errors.push('Enter a valid email address.');
  if (message.length < 3) errors.push('Tell us a little more about your feedback.');

  return {
    valid: errors.length === 0,
    errors,
    value: { email, message, website, sourceUrl }
  };
}

module.exports = {
  validateFeedbackPayload
};

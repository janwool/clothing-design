const OPENING_OFFER = Object.freeze({
  code: 'OPEN50',
  percentOff: 50,
  expiresAt: '2026-11-30T16:00:00Z',
  deadlineLabel: 'Nov 30, 2026 · 23:59 UTC+8',
  subscriptionCycles: 1
});

function getOpeningOffer(now = Date.now()) {
  return Number(now) < Date.parse(OPENING_OFFER.expiresAt) ? OPENING_OFFER : null;
}

module.exports = { OPENING_OFFER, getOpeningOffer };

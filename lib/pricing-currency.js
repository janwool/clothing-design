// Dodo amounts use the currency's minor unit (JPY has no fractional unit).
function currencyDigits(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}

function normalizeCurrency(value) {
  const currency = String(value || '').toUpperCase();
  return Intl.supportedValuesOf('currency').includes(currency) ? currency : null;
}

function normalizeCountry(value) {
  const country = String(value || '').toUpperCase();
  return /^[A-Z]{2}$/.test(country) && !['XX', 'T1'].includes(country) ? country : null;
}

module.exports = { currencyDigits, normalizeCurrency, normalizeCountry };

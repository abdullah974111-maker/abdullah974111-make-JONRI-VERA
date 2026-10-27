const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents) {
  return money.format((cents ?? 0) / 100);
}

export function parseDollarsToCents(value) {
  const amount = Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount * 100);
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString();
}

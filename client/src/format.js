export const ROUNDS = 5;
export const MAX_SCORE = 5000;

export function usd(cents, { compact = false } = {}) {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: compact && Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// "SOLD SEP 2026" tag like pricepoint; "RELEASED 2017" for sets (a Jan-1 date means we only know the year).
export function soldLabel(dateStr, prefix = 'SOLD') {
  const d = new Date(dateStr + 'T00:00:00');
  const yearOnly = dateStr.endsWith('-01-01') && prefix !== 'SOLD';
  return yearOnly ? `${prefix} ${d.getFullYear()}` : `${prefix} ${d.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
}

// Bucket a round score into a tier used for the sidebar dots.
export function tier(score) {
  if (score == null) return 'empty';
  if (score >= MAX_SCORE) return 'perfect';
  if (score >= 4000) return 'great';
  if (score >= 2500) return 'ok';
  if (score > 0) return 'far';
  return 'miss';
}

export function total(scores = []) {
  return scores.reduce((a, b) => a + b, 0);
}

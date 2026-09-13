// PricePoint rules: exact = 5000, 2x over/under = 2500. 5000 * min/max fits both.
export const MAX_SCORE = 5000;
export const ROUNDS = 5;

export function scoreGuess(guessCents, priceCents) {
  if (!Number.isFinite(guessCents) || guessCents <= 0 || priceCents <= 0) return 0;
  const ratio = Math.min(guessCents, priceCents) / Math.max(guessCents, priceCents);
  return Math.round(MAX_SCORE * ratio);
}

// hints: rounds where the player took the hint; those rounds lose `hintCost` of their score.
export function scoreAll(guesses, items, hints = [], hintCost = 0) {
  return guesses.map((g, i) => {
    const s = items[i] ? scoreGuess(g, items[i].price_cents) : 0;
    return hints.includes(i) ? Math.round(s * (1 - hintCost)) : s;
  });
}

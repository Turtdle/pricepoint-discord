// Which edition this deployment is. One image, one codebase; GAME picks the puzzle source and the branding.
const GAMES = {
  pricepoint: {
    id: 'pricepoint',
    title: 'PricePoint',
    brand: 'PRICEPOINT.GG',
    tagPrefix: 'SOLD', // "SOLD SEP 2026"
    priceLabel: 'sold for',
    hint: "new puzzle when pricepoint.gg posts tomorrow's",
    accent: '#f2a33a',
    accentDark: '#b9741c',
    source: 'pricepoint',
    hintCost: 0, // no hints in this edition
    hintLabel: '',
  },
  lego: {
    id: 'lego',
    title: 'BrickPoint',
    brand: 'BRICKPOINT',
    tagPrefix: 'RELEASED', // "RELEASED 2017"
    priceLabel: 'retail price',
    hint: 'new puzzle at midnight Pacific',
    accent: '#ffd500',
    accentDark: '#c7a600',
    source: 'lego',
    hintCost: 0.1, // revealing the piece count costs 10% of that round's score
    hintLabel: 'piece count',
  },
};

export const GAME = GAMES[process.env.GAME] || GAMES.pricepoint;
export const SOURCE = process.env.PUZZLE_SOURCE || GAME.source;

// What the browser gets to see.
export function publicGame() {
  const { id, title, brand, tagPrefix, priceLabel, hint, accent, accentDark, hintCost, hintLabel } = GAME;
  return { id, title, brand, tagPrefix, priceLabel, hint, accent, accentDark, hintCost, hintLabel };
}

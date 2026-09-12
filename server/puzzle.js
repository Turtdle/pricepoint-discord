import { SOURCE } from './game.js';
import * as pricepoint from './sources/pricepoint.js';
import * as lego from './sources/lego.js';
import * as local from './sources/local.js';

const source = { pricepoint, lego, local }[SOURCE];
if (!source) throw new Error(`unknown PUZZLE_SOURCE "${SOURCE}"`);

const cache = new Map(); // no -> { items, imageUrls } | { error }
const NEGATIVE_TTL_MS = 30_000; // "not available" is re-checked every 30s

// Thrown when the puzzle isn't available (usually: today's isn't published yet).
export class PuzzleUnavailable extends Error {
  status = 503;
}

// The current puzzle number: the newest candidate the source can actually serve.
export async function todayNumber() {
  for (const no of source.candidates()) {
    try {
      await getPuzzle(no);
      return no;
    } catch {
      /* try the previous one */
    }
  }
  throw new PuzzleUnavailable('no puzzle available');
}

// Returns the raw items (with real prices). Never send this to a client unfiltered.
export async function getPuzzle(no) {
  if (!Number.isInteger(no) || no < 1) throw new Error('bad puzzle number');
  const cached = cache.get(no);
  if (cached) {
    if (cached.error) throw cached.error;
    return cached;
  }

  let items;
  try {
    items = await source.load(no);
  } catch (err) {
    console.warn(`[puzzle] ${SOURCE} #${no} failed:`, err.message);
    const error = new PuzzleUnavailable(`puzzle #${no} is not available yet`);
    cache.set(no, { error });
    setTimeout(() => cache.get(no)?.error === error && cache.delete(no), NEGATIVE_TTL_MS).unref();
    throw error;
  }

  // Discord's iframe blocks external hosts, so images go through our /img proxy.
  const imageUrls = items.map((it) => it.image_url || null);
  items = items.map((it, i) => ({ ...it, image_url: it.image_url ? `/img/${no}/${i + 1}` : null }));

  const entry = { items, imageUrls };
  cache.set(no, entry);
  return entry;
}

// Strip the answer before handing a puzzle to the browser.
export function publicView(entry) {
  return entry.items.map(({ price_cents, source_url, ...rest }) => rest);
}

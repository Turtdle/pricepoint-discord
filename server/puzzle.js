import { readFile } from 'node:fs/promises';

const EPOCH = '2026-07-29'; // puzzle #1
const SOURCE = process.env.PUZZLE_SOURCE || 'pricepoint';
const cache = new Map(); // no -> { items, imageUrls } | { error }
const NEGATIVE_TTL_MS = 30_000; // "not published yet" is re-checked every 30s

// Thrown when the upstream puzzle isn't available (usually: today's isn't published yet).
export class PuzzleUnavailable extends Error {
  status = 503;
}

// Same formula PricePoint's client uses: days since epoch (calendar date) + 1.
export function puzzleNumberFor(dateStr) {
  return (Date.parse(dateStr) - Date.parse(EPOCH)) / 864e5 + 1;
}

async function fromPricePoint(no) {
  const res = await fetch(`https://pricepoint.gg/api/puzzle/${no}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`pricepoint ${res.status}`);
  return res.json();
}

async function fromLocal(no) {
  const all = JSON.parse(await readFile(new URL('./data/local-puzzles.json', import.meta.url), 'utf8'));
  return all[(no - 1) % all.length].map((it) => ({ ...it }));
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
  if (SOURCE === 'local') {
    items = await fromLocal(no);
  } else {
    try {
      items = await fromPricePoint(no);
    } catch (err) {
      console.warn(`[puzzle] pricepoint fetch failed for #${no}:`, err.message);
      const error = new PuzzleUnavailable(`puzzle #${no} is not available yet`);
      cache.set(no, { error });
      setTimeout(() => cache.get(no)?.error === error && cache.delete(no), NEGATIVE_TTL_MS).unref();
      throw error;
    }
  }

  // Discord's iframe blocks external hosts, so images go through our /img proxy.
  // pricepoint.gg serves `${image_url}.webp` (and .avif); the bare path 404s.
  const imageUrls = items.map((it) => (it.image_url ? `${it.image_url}.webp` : null));
  items = items.map((it, i) => ({ ...it, image_url: it.image_url ? `/img/${no}/${i + 1}` : null }));

  const entry = { items, imageUrls };
  cache.set(no, entry);
  return entry;
}

// Strip the answer before handing a puzzle to the browser.
export function publicView(entry) {
  return entry.items.map(({ price_cents, source_url, ...rest }) => rest);
}

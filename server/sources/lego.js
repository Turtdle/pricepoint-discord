// LEGO edition: five sets a day from one (seeded) release year, spread across price tiers.
// Data from Brickset's API when BRICKSET_API_KEY is set, otherwise a bundled pool of well-known sets.
import { readFile } from 'node:fs/promises';

const EPOCH = '2026-09-11'; // puzzle #1
const TZ = process.env.GAME_TZ || 'America/Los_Angeles'; // the day rolls over at midnight here
const KEY = process.env.BRICKSET_API_KEY;
const YEARS = { from: 2005, to: new Date().getFullYear() - 1 }; // last year's sets have settled prices
const ROUNDS = 5;

const localDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // yyyy-mm-dd

export function numberFor(dateStr) {
  return (Date.parse(dateStr) - Date.parse(EPOCH)) / 864e5 + 1;
}

export function candidates() {
  return [numberFor(localDate())];
}

// Deterministic PRNG so every server instance picks the same sets for the same day.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yearCache = new Map(); // year -> normalized sets

// One Brickset call per 500 sets; a year is 2–3 pages, cached for the life of the process.
async function bricksetYear(year) {
  if (yearCache.has(year)) return yearCache.get(year);
  const sets = [];
  for (let page = 1; page <= 4; page++) {
    const params = JSON.stringify({ year: String(year), pageSize: 500, pageNumber: page, orderBy: 'Number' });
    const url = `https://brickset.com/api/v3.asmx/getSets?apiKey=${encodeURIComponent(KEY)}&userHash=&params=${encodeURIComponent(params)}`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`brickset ${res.status}`);
    const data = await res.json();
    if (data.status !== 'success') throw new Error(`brickset: ${data.message || data.status}`);
    for (const s of data.sets || []) sets.push(normalize(s));
    if ((data.sets || []).length < 500) break;
  }
  const usable = sets.filter(Boolean);
  yearCache.set(year, usable);
  return usable;
}

function normalize(s) {
  const price = s.LEGOCom?.US?.retailPrice;
  const img = s.image?.imageURL;
  if (!price || !img || !s.pieces || s.pieces < 30) return null;
  if (/^(Gear|Books|Duplo|Education|Promotional|Service Packs|Bulk Bricks)$/i.test(s.theme || '')) return null;
  return {
    number: `${s.number}-${s.numberVariant ?? 1}`,
    name: s.name,
    year: s.year,
    theme: s.theme,
    pieces: s.pieces,
    price_cents: Math.round(price * 100),
    image_url: img,
  };
}

let localPool = null;
async function local() {
  localPool ??= JSON.parse(await readFile(new URL('../data/lego-sets.json', import.meta.url), 'utf8'));
  return localPool;
}

// One set per price band, cheapest first (PricePoint orders its items that way too). A band with nothing
// in it borrows from the nearest priced sets so we always get five.
const BANDS = [
  [0, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, 25000],
  [25000, Infinity],
];
function pick(sets, rnd) {
  const sorted = [...sets].sort((a, b) => a.price_cents - b.price_cents);
  const used = new Set();
  const out = [];
  for (const [lo, hi] of BANDS) {
    let pool = sorted.filter((s) => s.price_cents >= lo && s.price_cents < hi && !used.has(s));
    if (!pool.length) {
      const mid = hi === Infinity ? lo * 2 : (lo + hi) / 2;
      pool = sorted.filter((s) => !used.has(s)).sort((a, b) => Math.abs(a.price_cents - mid) - Math.abs(b.price_cents - mid)).slice(0, 5);
    }
    const s = pool[Math.floor(rnd() * pool.length)];
    used.add(s);
    out.push(s);
  }
  return out.sort((a, b) => a.price_cents - b.price_cents);
}

export async function load(no) {
  const rnd = mulberry32(no * 7919);
  let sets;
  if (KEY) {
    // Try a seeded year; if it's thin (or Brickset hiccups), walk to neighbouring years.
    const span = YEARS.to - YEARS.from + 1;
    let year = YEARS.from + Math.floor(rnd() * span);
    for (let attempt = 0; attempt < 4; attempt++, year = YEARS.from + ((year - YEARS.from + 1) % span)) {
      try {
        sets = await bricksetYear(year);
        if (sets.length >= 25) break;
      } catch (err) {
        console.warn(`[lego] brickset ${year} failed:`, err.message);
      }
      sets = null;
    }
  }
  if (!sets) sets = await local();

  return pick(sets, rnd).map((s) => ({
    title: `${s.number.replace(/-1$/, '')} ${s.name}`,
    description: `${s.pieces.toLocaleString('en-US')} pieces · ${s.theme}`,
    sale_date: `${s.year}-01-01`,
    price_cents: s.price_cents,
    source_url: `https://brickset.com/sets/${s.number}`,
    image_url: s.image_url,
  }));
}

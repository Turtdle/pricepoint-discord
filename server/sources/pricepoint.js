// pricepoint.gg's daily puzzle (unofficial endpoint).
const EPOCH = '2026-07-29'; // puzzle #1

// Same formula PricePoint's client uses: days since epoch (calendar date) + 1.
export function numberFor(dateStr) {
  return (Date.parse(dateStr) - Date.parse(EPOCH)) / 864e5 + 1;
}

// Which puzzle numbers might be "today", most recent first. PricePoint publishes some hours after UTC midnight,
// so we probe downward and use the newest one that exists.
export function candidates() {
  const n = numberFor(new Date().toISOString().slice(0, 10)) + 1;
  return [n, n - 1, n - 2];
}

export async function load(no) {
  const res = await fetch(`https://pricepoint.gg/api/puzzle/${no}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`pricepoint ${res.status}`);
  const items = await res.json();
  // Their images live at `${image_url}.webp` (and .avif); the bare path 404s.
  return items.map((it) => ({ ...it, image_url: it.image_url ? `${it.image_url}.webp` : null }));
}

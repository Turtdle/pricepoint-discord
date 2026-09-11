// Bundled sample puzzles, for development without network access. Cycles through the file by puzzle number.
import { readFile } from 'node:fs/promises';

const EPOCH = '2026-07-29';

export function candidates() {
  return [(Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(EPOCH)) / 864e5 + 1];
}

export async function fetch(no) {
  const all = JSON.parse(await readFile(new URL('../data/local-puzzles.json', import.meta.url), 'utf8'));
  return all[(no - 1) % all.length].map((it) => ({ ...it }));
}

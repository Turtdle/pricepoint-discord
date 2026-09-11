import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getPuzzle } from './puzzle.js';
import { scoreAll, ROUNDS } from './scoring.js';

const RESULTS_PATH = new URL('./data/results.json', import.meta.url);
const ONLINE_MS = 8000; // a client polls every 2s; silence longer than this = offline

// results[roomKey][userId] = { name, avatar, guesses, scores, updatedAt }
let results = {};
try {
  results = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
} catch {
  results = {};
}

// `${roomKey}:${userId}` -> last poll time. In-memory only; presence is transient anyway.
const lastSeen = new Map();

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(new URL('./data/', import.meta.url), { recursive: true });
    await writeFile(RESULTS_PATH, JSON.stringify(results));
  }, 500);
}

// Rooms are per voice channel per day, so friends coming back later see the same board.
export function roomKey({ guildId, channelId, no }) {
  return `${guildId || 'dm'}:${channelId}:${no}`;
}

export function touch(key, userId) {
  lastSeen.set(`${key}:${userId}`, Date.now());
}

function reveals(mine, items) {
  return mine.guesses.map((_, i) => ({
    round: i,
    price_cents: items[i].price_cents,
    source_url: items[i].source_url,
    score: mine.scores[i],
  }));
}

// Registers the player in the room and returns their own progress (so a refresh doesn't lose it).
export async function join({ key, no, user }) {
  results[key] ??= {};
  const mine = (results[key][user.id] ??= { guesses: [], scores: [], updatedAt: Date.now() });
  mine.name = user.name;
  mine.avatar = user.avatar;
  scheduleSave();
  touch(key, user.id);

  const { items } = await getPuzzle(no);
  return { guesses: mine.guesses, reveals: reveals(mine, items) };
}

// What everyone in the room sees: per-round scores only, never guesses or prices.
export function snapshot(key) {
  const now = Date.now();
  const players = Object.entries(results[key] || {}).map(([id, r]) => ({
    id,
    name: r.name,
    avatar: r.avatar,
    scores: r.scores,
    done: r.scores.length >= ROUNDS,
    online: now - (lastSeen.get(`${key}:${id}`) || 0) < ONLINE_MS,
    updatedAt: r.updatedAt,
  }));
  players.sort((a, b) => (b.online - a.online) || (b.updatedAt - a.updatedAt));
  return { players };
}

// Returns the reveal for this round (only the guesser learns the real price), or null if out of rounds.
export async function submitGuess({ key, no, userId, guessCents }) {
  const mine = results[key]?.[userId];
  if (!mine || mine.guesses.length >= ROUNDS) return null;

  const { items } = await getPuzzle(no);
  const round = mine.guesses.length;
  mine.guesses.push(guessCents);
  mine.scores = scoreAll(mine.guesses, items);
  mine.updatedAt = Date.now();
  scheduleSave();
  touch(key, userId);

  return reveals(mine, items)[round];
}

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getPuzzle } from './puzzle.js';
import { scoreAll, ROUNDS } from './scoring.js';
import * as announce from './announce.js';

const RESULTS_PATH = new URL('./data/results.json', import.meta.url);
const ONLINE_MS = 8000; // a client polls every 2s; silence longer than this = offline

// players[roomKey][userId] = { name, avatar, guesses, scores, updatedAt }
// meta[roomKey]           = { no, guildId, channelId, messageId }   (messageId = the posted results card)
let players = {};
let meta = {};
try {
  const data = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
  if (data.version === 2) ({ players, meta } = data);
  else players = data; // pre-v2 file: just the players map
} catch {
  /* fresh start */
}

// `${roomKey}:${userId}` -> last poll time. In-memory only; presence is transient anyway.
const lastSeen = new Map();

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(new URL('./data/', import.meta.url), { recursive: true });
    await writeFile(RESULTS_PATH, JSON.stringify({ version: 2, players, meta }));
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
export async function join({ key, no, guildId, channelId, user }) {
  players[key] ??= {};
  meta[key] ??= { no, guildId, channelId, messageId: null };
  const mine = (players[key][user.id] ??= { guesses: [], scores: [], updatedAt: Date.now() });
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
  const list = Object.entries(players[key] || {}).map(([id, r]) => ({
    id,
    name: r.name,
    avatar: r.avatar,
    scores: r.scores,
    done: r.scores.length >= ROUNDS,
    online: now - (lastSeen.get(`${key}:${id}`) || 0) < ONLINE_MS,
    updatedAt: r.updatedAt,
  }));
  list.sort((a, b) => (b.online - a.online) || (b.updatedAt - a.updatedAt));
  return { players: list };
}

// Finished players, best score first — what goes on the channel card.
export function finished(key) {
  return snapshot(key)
    .players.filter((p) => p.done)
    .sort((a, b) => b.scores.reduce((x, y) => x + y, 0) - a.scores.reduce((x, y) => x + y, 0));
}

// Returns the reveal for this round (only the guesser learns the real price), or null if out of rounds.
export async function submitGuess({ key, no, userId, guessCents }) {
  const mine = players[key]?.[userId];
  if (!mine || mine.guesses.length >= ROUNDS) return null;

  const { items } = await getPuzzle(no);
  const round = mine.guesses.length;
  mine.guesses.push(guessCents);
  mine.scores = scoreAll(mine.guesses, items);
  mine.updatedAt = Date.now();
  scheduleSave();
  touch(key, userId);

  if (mine.scores.length >= ROUNDS) announceRoom(key); // fire and forget
  return reveals(mine, items)[round];
}

// One announce at a time per room so two near-simultaneous finishes don't post two cards.
const announcing = new Map();
function announceRoom(key) {
  const m = meta[key];
  if (!announce.enabled || !m?.channelId || m.channelId === 'local') return;
  const next = (announcing.get(key) || Promise.resolve())
    .then(async () => {
      const id = await announce.postOrEdit({ no: m.no, channelId: m.channelId, players: finished(key), messageId: m.messageId });
      if (id !== m.messageId) {
        m.messageId = id;
        scheduleSave();
      }
    })
    .catch((err) => console.warn('[announce]', err.message));
  announcing.set(key, next);
}

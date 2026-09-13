import * as storage from './storage.js';
import { getPuzzle } from './puzzle.js';
import { scoreAll, ROUNDS } from './scoring.js';
import { GAME } from './game.js';
import * as announce from './announce.js';

const ONLINE_MS = 8000; // a client polls every 2s; silence longer than this = offline

// players[roomKey][userId] = { name, avatar, guesses, scores, updatedAt }
// meta[roomKey]           = { no, guildId, channelId, messageId }   (messageId = the posted results card)
// drops[`${guild}:${channel}`]  = last puzzle number we announced ("#47 is out!") in that channel
let players = {};
let meta = {};
let drops = {};
{
  const data = await storage.load();
  if (data?.version === 2) ({ players, meta, drops = {} } = data);
  else if (data) players = data; // pre-v2 file: just the players map
}

const TZ = process.env.GAME_TZ || 'America/Los_Angeles';
const monthKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date(ms));

// `${roomKey}:${userId}` -> last poll time. In-memory only; presence is transient anyway.
const lastSeen = new Map();

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storage.save({ version: 2, players, meta, drops }), 500);
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
    description: items[i].description || '',
    score: mine.scores[i],
    hint: (mine.hints || []).includes(i),
  }));
}

// Hints the player has already taken, with their text, so a refresh shows them again.
function hintsTaken(mine, items) {
  return (mine.hints || []).map((i) => ({ round: i, text: items[i]?.description || '' }));
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

  // A card that never got posted (bot was missing, Discord was down, ...) gets another go on the next open.
  if (!meta[key].messageId && finished(key).length) announceRoom(key);

  // Joining must work even while today's puzzle isn't published yet, so only load it if there's progress to replay.
  if (!mine.guesses.length && !(mine.hints || []).length) return { guesses: [], reveals: [], hints: [] };
  const { items } = await getPuzzle(no);
  return { guesses: mine.guesses, reveals: reveals(mine, items), hints: hintsTaken(mine, items) };
}

// Reveal the hint (e.g. piece count) for the round the player is on; costs GAME.hintCost of that round's score.
export async function useHint({ key, no, userId }) {
  const mine = players[key]?.[userId];
  if (!mine || mine.guesses.length >= ROUNDS || !GAME.hintCost) return null;
  const round = mine.guesses.length;
  mine.hints ??= [];
  if (!mine.hints.includes(round)) {
    mine.hints.push(round);
    scheduleSave();
  }
  const { items } = await getPuzzle(no);
  return { round, text: items[round]?.description || '' };
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
  mine.scores = scoreAll(mine.guesses, items, mine.hints || [], GAME.hintCost);
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

// ---- daily drop announcements ----

const total = (scores) => scores.reduce((a, b) => a + b, 0);

// Channels worth telling about a new puzzle: anyone opened the activity there in the last two weeks.
export function activeChannels(todayNo) {
  const seen = new Map();
  for (const [key, m] of Object.entries(meta)) {
    if (!m?.channelId || m.channelId === 'local' || m.no < todayNo - 14) continue;
    seen.set(`${m.guildId || 'dm'}:${m.channelId}`, { guildId: m.guildId, channelId: m.channelId });
  }
  return [...seen.values()];
}

export const getDrop = (chKey) => drops[chKey];
export function setDrop(chKey, no) {
  drops[chKey] = no;
  scheduleSave();
}

// Everything the recap card needs for one channel, as of puzzle `todayNo` (yesterday = todayNo - 1).
export function channelStats(guildId, channelId, todayNo) {
  const prefix = `${guildId || 'dm'}:${channelId}:`;
  const finishedByNo = new Map(); // no -> [{ id, name, avatar, scores, total, updatedAt }]
  for (const [key, room] of Object.entries(players)) {
    if (!key.startsWith(prefix)) continue;
    const no = Number(key.slice(prefix.length));
    const fin = Object.entries(room)
      .filter(([, p]) => p.scores.length >= ROUNDS)
      .map(([id, p]) => ({ id, name: p.name, avatar: p.avatar, scores: p.scores, total: total(p.scores), updatedAt: p.updatedAt }));
    if (fin.length) finishedByNo.set(no, fin);
  }

  const yesterday = (finishedByNo.get(todayNo - 1) || []).sort((a, b) => b.total - a.total);

  let streak = 0;
  for (let n = todayNo - 1; finishedByNo.has(n); n--) streak++;
  let longest = 0;
  for (const n of [...finishedByNo.keys()].sort((a, b) => a - b)) {
    let run = 0;
    for (let k = n; finishedByNo.has(k); k++) run++;
    longest = Math.max(longest, run);
  }

  const month = monthKey(Date.now());
  const perUser = new Map();
  let sum = 0, count = 0;
  for (const [no, fin] of finishedByNo) {
    if (no >= todayNo) continue;
    for (const p of fin) {
      if (monthKey(p.updatedAt) !== month) continue;
      const u = perUser.get(p.id) || { id: p.id, name: p.name, avatar: p.avatar, days: 0, pts: 0 };
      u.days++;
      u.pts += p.total;
      u.name = p.name;
      u.avatar = p.avatar;
      perUser.set(p.id, u);
      sum += p.total;
      count++;
    }
  }
  const standings = [...perUser.values()].sort((a, b) => b.pts - a.pts);
  const monthLabel = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short' }).format(new Date()).toUpperCase();

  return { yesterdayNo: todayNo - 1, yesterday, streak, longest, avg: count ? Math.round(sum / count) : 0, standings, month: monthLabel };
}

// Forget rooms older than two months so the S3 object stays small.
export function prune(todayNo) {
  let removed = 0;
  for (const key of Object.keys(meta)) {
    if (meta[key]?.no < todayNo - 60) {
      delete meta[key];
      delete players[key];
      removed++;
    }
  }
  if (removed) scheduleSave();
}

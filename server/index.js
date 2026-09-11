import express from 'express';
import { randomUUID, createPublicKey, verify } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPuzzle, publicView } from './puzzle.js';
import * as rooms from './rooms.js';
import { renderCard, enabled as announceEnabled } from './announce.js';

const PORT = Number(process.env.PORT) || 3001;
const ALLOW_ANON = process.env.ALLOW_ANON === '1';
const DIST = fileURLToPath(new URL('../client/dist', import.meta.url));

const app = express();

// Entry Point command handler. With APP_HANDLER Discord asks us what to do when someone hits Launch;
// answering LAUNCH_ACTIVITY (12) opens the activity without posting a "Game Invitation" message.
// Needs the raw body for Ed25519 verification, so it's registered before express.json().
const pubKey = process.env.DISCORD_PUBLIC_KEY
  ? createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(process.env.DISCORD_PUBLIC_KEY, 'hex')]),
      format: 'der',
      type: 'spki',
    })
  : null;

app.post('/api/interactions', express.raw({ type: '*/*' }), (req, res) => {
  if (!pubKey) return res.sendStatus(501);
  const sig = req.get('x-signature-ed25519');
  const ts = req.get('x-signature-timestamp');
  if (!sig || !ts) return res.sendStatus(401);
  let ok = false;
  try {
    ok = verify(null, Buffer.concat([Buffer.from(ts), req.body]), pubKey, Buffer.from(sig, 'hex'));
  } catch {}
  if (!ok) return res.sendStatus(401);

  const interaction = JSON.parse(req.body.toString());
  if (interaction.type === 1) return res.json({ type: 1 }); // PING
  if (interaction.type === 2 && interaction.data?.type === 4) return res.json({ type: 12 }); // Entry Point -> LAUNCH_ACTIVITY
  res.json({ type: 4, data: { content: 'Nothing to do here — open the activity from the Apps menu.', flags: 64 } });
});

app.use(express.json());

// Client id is served at runtime so the built image isn't tied to one Discord app.
app.get('/api/config', (_req, res) => res.json({ clientId: process.env.DISCORD_CLIENT_ID || '' }));

// Discord Embedded App SDK: browser gets a code from authorize(), we swap it for a token.
app.post('/api/token', async (req, res) => {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: req.body.code,
  });
  const r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const { access_token } = await r.json();
  res.json({ access_token });
});

app.get('/api/puzzle/:no', async (req, res) => {
  try {
    const entry = await getPuzzle(Number(req.params.no));
    res.set('cache-control', 'public, max-age=300');
    res.json(publicView(entry));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Image proxy — Discord's activity iframe can't load external hosts directly.
app.get('/img/:no/:i', async (req, res) => {
  try {
    const { imageUrls } = await getPuzzle(Number(req.params.no));
    const src = imageUrls[Number(req.params.i) - 1];
    if (!src) return res.sendStatus(404);
    const r = await fetch(src, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.sendStatus(r.status);
    res.set('content-type', r.headers.get('content-type') || 'image/jpeg');
    res.set('cache-control', 'public, max-age=86400');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.sendStatus(502);
  }
});

// ---- rooms: plain HTTP + short polling (the host doesn't pass WebSockets) ----

async function verifyUser(token) {
  const r = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) {
    console.warn(`[session] token verify failed: ${r.status}`);
    return null;
  }
  const u = await r.json();
  return {
    id: u.id,
    name: u.global_name || u.username,
    avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
  };
}

// sid -> { user, key, no }. In-memory: a restart just makes clients re-join (they handle 401).
const sessions = new Map();

app.post('/api/session', async (req, res) => {
  const { access_token, anon, no, guildId, channelId } = req.body || {};
  let user = null;
  if (access_token) user = await verifyUser(access_token);
  else if (ALLOW_ANON && anon?.name) user = { id: `anon:${anon.name}`, name: String(anon.name).slice(0, 32), avatar: null };
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const n = Number(no);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'bad puzzle number' });

  const key = rooms.roomKey({ guildId, channelId, no: n });
  const sid = randomUUID();
  sessions.set(sid, { user, key, no: n });
  console.log(`[session] ${user.name} joined ${key}`);

  const me = await rooms.join({ key, no: n, guildId, channelId, user });
  res.json({ sid, ...me, room: rooms.snapshot(key) });
});

// Preview of the results card that gets posted to the channel (handy for checking the rendering).
app.get('/api/card', async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const list = rooms.finished(s.key);
  if (!list.length) return res.status(404).json({ error: 'nobody has finished yet' });
  res.set('content-type', 'image/png');
  res.send(await renderCard(s.no, list));
});

function getSession(req, res) {
  const s = sessions.get(req.query.sid || req.body?.sid);
  if (!s) res.status(401).json({ error: 'no session' });
  return s;
}

app.get('/api/room', (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  rooms.touch(s.key, s.user.id);
  res.set('cache-control', 'no-store');
  res.json(rooms.snapshot(s.key));
});

app.post('/api/guess', async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const cents = Math.round(Number(req.body.guessCents));
  if (!Number.isFinite(cents) || cents < 0) return res.status(400).json({ error: 'bad guess' });
  const reveal = await rooms.submitGuess({ key: s.key, no: s.no, userId: s.user.id, guessCents: cents });
  if (!reveal) return res.status(409).json({ error: 'no rounds left' });
  res.json({ reveal, room: rooms.snapshot(s.key) });
});

// Legal pages (Discord's developer portal wants public ToS / privacy URLs).
const PUBLIC = fileURLToPath(new URL('./public', import.meta.url));
app.get('/terms', (_req, res) => res.sendFile(`${PUBLIC}/terms.html`));
app.get('/privacy', (_req, res) => res.sendFile(`${PUBLIC}/privacy.html`));
app.use(express.static(PUBLIC));

if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('/{*path}', (_req, res) => res.sendFile(`${DIST}/index.html`));
}

app.listen(PORT, () =>
  console.log(
    `server on http://localhost:${PORT} (source=${process.env.PUZZLE_SOURCE || 'pricepoint'}, anon=${ALLOW_ANON}, channel-cards=${announceEnabled})`,
  ),
);

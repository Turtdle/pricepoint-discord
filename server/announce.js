// Posts (and keeps editing) a results card in the Discord channel, like the Wordle/Connections apps do.
import { existsSync, readdirSync } from 'node:fs';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { ROUNDS, MAX_SCORE } from './scoring.js';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_CLIENT_ID;
const API = 'https://discord.com/api/v10';

export const enabled = Boolean(TOKEN && APP_ID);

// The Alpine image has no fonts by default; the Dockerfile installs DejaVu and we register it here.
for (const dir of ['/usr/share/fonts/dejavu', '/usr/share/fonts/TTF', '/usr/share/fonts/truetype/dejavu']) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f.startsWith('DejaVuSans') && f.endsWith('.ttf')) GlobalFonts.registerFromPath(`${dir}/${f}`, 'DejaVu Sans');
}
const FONT = '"DejaVu Sans", Arial, Helvetica, sans-serif';

const COLORS = {
  bg: '#0b0b0b',
  card: '#161616',
  edge: '#2c2c2c',
  text: '#f2f2f2',
  muted: '#8f8f8f',
  orange: '#f2a33a',
  perfect: '#4ade80',
  great: '#58c26a',
  ok: '#e0c14a',
  far: '#c9782e',
  miss: '#3a3a3a',
  empty: '#242424',
};

function tierColor(score) {
  if (score == null) return COLORS.empty;
  if (score >= MAX_SCORE) return COLORS.perfect;
  if (score >= 4000) return COLORS.great;
  if (score >= 2500) return COLORS.ok;
  if (score > 0) return COLORS.far;
  return COLORS.miss;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

async function fetchAvatar(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return await loadImage(Buffer.from(await r.arrayBuffer()));
  } catch {
    return null;
  }
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// players: [{ name, avatar, scores }] — render a horizontal strip of player cards.
export async function renderCard(no, players) {
  const PAD = 24, CARD_W = 136, CARD_H = 196, GAP = 12, TITLE_H = 56;
  const n = Math.max(players.length, 1);
  const W = PAD * 2 + n * CARD_W + (n - 1) * GAP;
  const H = TITLE_H + CARD_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  roundRect(ctx, 0, 0, W, H, 16);
  ctx.fill();

  ctx.fillStyle = COLORS.orange;
  ctx.font = `bold 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PricePoint #${no}`, W / 2, TITLE_H / 2 + 4);

  const avatars = await Promise.all(players.map((p) => fetchAvatar(p.avatar)));

  players.forEach((p, i) => {
    const x = PAD + i * (CARD_W + GAP);
    const y = TITLE_H;

    ctx.fillStyle = COLORS.card;
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, CARD_W, CARD_H, 12);
    ctx.fill();
    ctx.stroke();

    // avatar
    const cx = x + CARD_W / 2, cy = y + 44, r = 28;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatars[i]) {
      ctx.drawImage(avatars[i], cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = COLORS.orange;
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText((p.name || '?').slice(0, 1).toUpperCase(), cx, cy + 1);
    }
    ctx.restore();

    // name
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(ellipsize(ctx, p.name || 'player', CARD_W - 20), cx, y + 92);

    // round squares
    const sq = 18, sgap = 5;
    const total = ROUNDS * sq + (ROUNDS - 1) * sgap;
    let sx = cx - total / 2;
    for (let k = 0; k < ROUNDS; k++) {
      ctx.fillStyle = tierColor(p.scores[k]);
      roundRect(ctx, sx, y + 112, sq, sq, 4);
      ctx.fill();
      sx += sq + sgap;
    }

    // score
    const sum = p.scores.reduce((a, b) => a + b, 0);
    ctx.fillStyle = p.scores.length >= ROUNDS ? COLORS.orange : COLORS.muted;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(sum.toLocaleString('en-US'), cx, y + 158);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`/ ${(MAX_SCORE * ROUNDS).toLocaleString('en-US')}`, cx, y + 176);
  });

  return canvas.encode('png');
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || 'Someone';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Creates the channel message the first time, edits it afterwards. Returns the message id (or the old one on failure).
export async function postOrEdit({ no, channelId, players, messageId }) {
  const png = await renderCard(no, players);
  const payload = {
    content: `${joinNames(players.map((p) => p.name))} ${players.length === 1 ? 'was' : 'were'} playing PricePoint #${no}`,
    embeds: [], // plain attachment, no embed frame (the orange bar + indent)
    attachments: [{ id: 0, filename: 'pricepoint.png' }],
    components: [
      // Primary (blue) button; the click comes back to /api/interactions, which answers LAUNCH_ACTIVITY.
      { type: 1, components: [{ type: 2, style: 1, label: 'Play now!', custom_id: 'play' }] },
    ],
    allowed_mentions: { parse: [] },
  };

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'pricepoint.png');

  const url = messageId ? `${API}/channels/${channelId}/messages/${messageId}` : `${API}/channels/${channelId}/messages`;
  const r = await fetch(url, { method: messageId ? 'PATCH' : 'POST', headers: { authorization: `Bot ${TOKEN}` }, body: form });
  if (!r.ok) {
    console.warn(`[announce] ${messageId ? 'edit' : 'post'} failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
    // A deleted message comes back 404; drop the id so the next finish posts fresh.
    return r.status === 404 ? null : messageId || null;
  }
  return (await r.json()).id;
}

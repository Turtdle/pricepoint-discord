// The daily "new puzzle is out" post: yesterday's results, season standings, streaks — like the Connections app.
import { createCanvas } from '@napi-rs/canvas';
import { COLORS, FONT, roundRect, fetchAvatar, tierColor, ellipsize, TOKEN, API } from './announce.js';
import { GAME } from './game.js';
import { ROUNDS } from './scoring.js';

const TZ = process.env.GAME_TZ || 'America/Los_Angeles';

function monthLabel(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short' }).format(d).toUpperCase();
}
function dateLabel(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(d);
}

function drawAvatar(ctx, img, name, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = COLORS.orange;
    ctx.font = `bold ${Math.round(r)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name || '?').slice(0, 1).toUpperCase(), cx, cy + 1);
  }
  ctx.restore();
}

// stats: { yesterdayNo, yesterday: [{id,name,avatar,scores,total}], streak, longest, avg,
//          standings: [{id,name,avatar,days,pts}], month }
export async function renderRecap(stats) {
  const W = 640, PAD = 22, HEAD = 96, ROW = 34, PANEL_TITLE = 26;
  const rowsL = Math.max(stats.yesterday.length, 1), rowsR = Math.max(stats.standings.length, 1);
  const rows = Math.min(Math.max(rowsL, rowsR), 6);
  const H = HEAD + PANEL_TITLE + rows * ROW + PAD;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  roundRect(ctx, 0, 0, W, H, 16);
  ctx.fill();

  // header
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `11px ${FONT}`;
  ctx.fillText(`${GAME.title.toUpperCase()} · DAILY RECAP`, PAD, 24);
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText(`Puzzle #${stats.yesterdayNo}`, PAD, 52);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `12px ${FONT}`;
  const played = stats.yesterday.length;
  ctx.fillText(`${dateLabel(new Date(Date.now() - 864e5))} · ${played ? `${played} played` : 'nobody played'}`, PAD, 76);

  // stat boxes, right-aligned
  const boxes = [
    { v: `${stats.streak}d`, l: 'STREAK' },
    { v: `${stats.longest}d`, l: 'LONGEST' },
    { v: stats.avg ? stats.avg.toLocaleString('en-US') : '—', l: 'AVG PTS' },
  ];
  let bx = W - PAD;
  for (const b of [...boxes].reverse()) {
    const bw = 84;
    bx -= bw;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.orange;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(b.v, bx + bw / 2, 44);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `10px ${FONT}`;
    ctx.fillText(b.l, bx + bw / 2, 66);
    if (b !== boxes[0]) {
      ctx.fillStyle = COLORS.edge;
      ctx.fillRect(bx, 34, 1, 40);
    }
    bx -= 8;
  }

  // panels
  const gap = 16, pw = (W - PAD * 2 - gap) / 2, py = HEAD;
  const panel = (x, title, drawRow, count, empty) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillText(title, x, py + 8);
    if (!count) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(empty, x, py + PANEL_TITLE + ROW / 2);
      return;
    }
    for (let i = 0; i < Math.min(count, 6); i++) {
      const y = py + PANEL_TITLE + i * ROW;
      ctx.fillStyle = COLORS.card;
      roundRect(ctx, x, y, pw, ROW - 6, 8);
      ctx.fill();
      drawRow(i, x, y + (ROW - 6) / 2);
    }
  };

  const avatars = new Map();
  for (const p of [...stats.yesterday, ...stats.standings]) if (!avatars.has(p.id)) avatars.set(p.id, await fetchAvatar(p.avatar));

  const nameAndRank = (i, p, x, cy, maxName) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = i === 0 ? COLORS.orange : COLORS.muted;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText(String(i + 1), x + 10, cy);
    drawAvatar(ctx, avatars.get(p.id), p.name, x + 36, cy, 11);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(ellipsize(ctx, p.name, maxName), x + 54, cy);
  };

  panel(PAD, "YESTERDAY'S RESULTS", (i, x, cy) => {
    const p = stats.yesterday[i];
    nameAndRank(i, p, x, cy, pw - 190);
    let sx = x + pw - 118;
    for (let k = 0; k < ROUNDS; k++) {
      ctx.fillStyle = tierColor(p.scores[k]);
      roundRect(ctx, sx, cy - 5, 10, 10, 2);
      ctx.fill();
      sx += 13;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = i === 0 ? COLORS.orange : COLORS.text;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(p.total.toLocaleString('en-US'), x + pw - 10, cy);
  }, stats.yesterday.length, 'nobody finished yesterday');

  panel(PAD + pw + gap, `SEASON STANDINGS · ${stats.month}`, (i, x, cy) => {
    const p = stats.standings[i];
    nameAndRank(i, p, x, cy, pw - 150);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`${p.days}d`, x + pw - 70, cy);
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(p.pts.toLocaleString('en-US'), x + pw - 10, cy);
  }, stats.standings.length, 'no games this month yet');

  return canvas.encode('png');
}

export function recapText(no, stats) {
  const head = `**${GAME.title} #${no} is out!**`;
  if (!stats.yesterday.length) return `${head} Nobody played yesterday — fresh start today.`;
  if (stats.streak >= 2) return `${head} Your group is on a **${stats.streak}-day streak!** 🔥 Here are yesterday's results:`;
  return `${head} Here are yesterday's results:`;
}

export async function postRecap({ channelId, no, stats }) {
  const png = await renderRecap(stats);
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({
      content: recapText(no, stats),
      embeds: [],
      attachments: [{ id: 0, filename: 'recap.png' }],
      components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Play now!', custom_id: 'play' }] }],
      allowed_mentions: { parse: [] },
    }),
  );
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'recap.png');
  const r = await fetch(`${API}/channels/${channelId}/messages`, { method: 'POST', headers: { authorization: `Bot ${TOKEN}` }, body: form });
  if (!r.ok) console.warn(`[recap] post failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  else console.log(`[recap] posted #${no} recap to ${channelId}`);
  return r.ok;
}

export { monthLabel };

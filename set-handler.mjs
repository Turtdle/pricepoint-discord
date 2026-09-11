#!/usr/bin/env node
// Switch the app's Entry Point ("Launch") command to APP_HANDLER so Discord stops posting
// "Game Invitation" messages and asks our /api/interactions endpoint instead.
// Reads DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN from .env; prints no secrets. Usage: node set-handler.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const { DISCORD_CLIENT_ID: APP, DISCORD_BOT_TOKEN: TOKEN } = env;
if (!APP || !TOKEN) {
  console.error('need DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN in .env');
  process.exit(1);
}

const api = (path, init = {}) =>
  fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: { authorization: `Bot ${TOKEN}`, 'content-type': 'application/json', ...init.headers },
  });

const list = await api(`/applications/${APP}/commands`);
if (!list.ok) {
  console.error('list commands failed', list.status, await list.text());
  process.exit(1);
}
const commands = await list.json();
const entry = commands.find((c) => c.type === 4);
if (!entry) {
  console.error('no Entry Point command found — enable Activities in the developer portal first');
  process.exit(1);
}
console.log(`entry point "${entry.name}" handler=${entry.handler} -> 1 (APP_HANDLER)`);

const r = await api(`/applications/${APP}/commands/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ handler: 1 }) });
if (!r.ok) {
  console.error('patch failed', r.status, await r.text());
  process.exit(1);
}
console.log(`done: handler=${(await r.json()).handler}`);

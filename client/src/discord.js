import { DiscordSDK } from '@discord/embedded-app-sdk';

const params = new URLSearchParams(location.search);

// Inside Discord the page is served from <client_id>.discordsays.com and gets ?frame_id=...
export const inDiscord = params.has('frame_id') || location.hostname.endsWith('discordsays.com');

// Everything to our backend has to go through Discord's proxy prefix when embedded.
export const base = inDiscord ? '/.proxy' : '';


const EPOCH = '2026-07-29';
const pad = (n) => String(n).padStart(2, '0');

// Puzzle number for the local calendar day, matching pricepoint.gg.
export function todayNumber(d = new Date()) {
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return (Date.parse(local) - Date.parse(EPOCH)) / 864e5 + 1;
}

// Resolves to { user, guildId, channelId, access_token? , anon? }.
export async function connectDiscord() {
  if (!inDiscord) {
    // Plain browser: fake identity from ?user=Name so you can test with several tabs.
    const name = params.get('user') || 'you';
    return {
      anon: { name },
      guildId: 'local',
      channelId: params.get('room') || 'local',
      user: { id: `anon:${name}`, name, avatar: null },
    };
  }

  const { clientId } = await fetch(`${base}/api/config`).then((r) => r.json());
  if (!clientId) throw new Error('server has no DISCORD_CLIENT_ID configured');
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const r = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status}`);
  const { access_token } = await r.json();

  const auth = await sdk.commands.authenticate({ access_token });
  const u = auth.user;

  return {
    access_token,
    guildId: sdk.guildId,
    channelId: sdk.channelId || sdk.instanceId,
    user: {
      id: u.id,
      name: u.global_name || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
    },
  };
}

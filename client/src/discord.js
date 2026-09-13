import { DiscordSDK } from '@discord/embedded-app-sdk';

const params = new URLSearchParams(location.search);

// Inside Discord the page is served from <client_id>.discordsays.com and gets ?frame_id=...
export const inDiscord = params.has('frame_id') || location.hostname.endsWith('discordsays.com');

// Everything to our backend has to go through Discord's proxy prefix when embedded.
export const base = inDiscord ? '/.proxy' : '';

// The server returns empty 5xx bodies for a few seconds during a redeploy; retry instead of choking on them.
export async function fetchJson(url, init, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return await r.json();
      if (r.status < 500 || i >= tries - 1) throw new Error(`${url.replace(base, '')} → ${r.status}`);
    } catch (e) {
      if (i >= tries - 1) throw e;
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
}

// No-login web play: a random id kept in this browser plus a display name the player picks once.
const WEB_ID_KEY = 'pp_web_id';
const WEB_NAME_KEY = 'pp_web_name';
function webIdentity() {
  let id = null;
  let name = '';
  try {
    id = localStorage.getItem(WEB_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(WEB_ID_KEY, id);
    }
    name = localStorage.getItem(WEB_NAME_KEY) || '';
  } catch {
    id = id || crypto.randomUUID(); // storage blocked: still playable, just not remembered
  }
  return { id, name };
}
export function saveWebName(name) {
  try {
    localStorage.setItem(WEB_NAME_KEY, name);
  } catch {}
}

// Resolves to { user, guildId, channelId, access_token? | anon? | web?, needsName? }.
export async function connectDiscord(clientId) {
  if (!inDiscord) {
    if (params.has('user')) {
      // Dev: fake identity from ?user=Name so you can test with several tabs (needs ALLOW_ANON on the server).
      const name = params.get('user');
      return { anon: { name }, guildId: 'local', channelId: params.get('room') || 'local', user: { id: `anon:${name}`, name, avatar: null } };
    }
    const web = webIdentity();
    return { web, needsName: !web.name, guildId: 'web', channelId: 'lobby', user: { id: `web:${web.id}`, name: web.name || 'you', avatar: null } };
  }

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

  const { access_token } = await fetchJson(`${base}/api/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });

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

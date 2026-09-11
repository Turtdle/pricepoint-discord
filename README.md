# PricePoint for Discord

A Discord Activity (the games under the 🚀 **Apps** button in a voice channel) that plays
[pricepoint.gg](https://pricepoint.gg)'s daily "guess what it sold for" puzzle. Everyone plays at their own
pace; a sidebar shows who in the channel is playing right now and how each of their five rounds went —
same idea as the NYT Wordle activity.

- `client/` — React + Vite, uses `@discord/embedded-app-sdk`
- `server/` — Express. OAuth code→token swap, puzzle fetch/cache, image proxy, per-channel rooms (clients poll every 2s; App Runner does not pass WebSockets)
- Puzzle source is pluggable (`PUZZLE_SOURCE=pricepoint|local`); prices never leave the server until you guess.

## 1. Discord app

1. <https://discord.com/developers/applications> → **New Application**.
2. **OAuth2** → copy *Client ID* and reset/copy *Client Secret*.
3. **Activities → Getting Started** → enable Activities.
4. **Activities → URL Mappings** → add a root mapping: prefix `/`, target = your public hostname
   (the cloudflared URL from step 3 below, without `https://`).
5. **Activities → Settings** → enable *Default Entry Point Command* so it shows up in the Apps menu.
6. **OAuth2 → Redirects** → add `https://127.0.0.1` (required placeholder; the SDK handles the real redirect).
7. **General Information** → set *Terms of Service URL* to `https://<your host>/terms` and *Privacy Policy URL* to
   `https://<your host>/privacy` (served by the app from `server/public/`).
8. **Bot** → *Reset Token* → put it in `.env` as `DISCORD_BOT_TOKEN`. This is what posts the results card into the
   channel when people finish (like the Wordle app does). Skip it and the game still works, nothing gets posted.
9. **Installation** → *Guild Install* → scopes `applications.commands` + `bot`, bot permissions *Send Messages*,
   *Embed Links*, *Attach Files* → copy the install link → open it to add the app to your server.

## 2. Local config

```bash
cp .env.example .env
```

Fill in `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

## 3. Run

Discord only loads activities over HTTPS, so expose the Vite dev server with a tunnel:

```bash
npm run dev
```

```bash
cloudflared tunnel --url http://localhost:5173
```

Put the `*.trycloudflare.com` hostname it prints into the URL Mapping from step 1.4. Then in Discord: join a
voice channel → 🚀 Apps → your app.

The tunnel URL changes every restart of `cloudflared`; update the mapping when it does (or use a named tunnel).

### Test in a plain browser (no Discord)

Set `ALLOW_ANON=1` in `.env`, then open a few tabs:

- <http://localhost:5173/?user=sam>
- <http://localhost:5173/?user=alex>

Each tab is a fake player in the same room, so you can watch the sidebar update live.

## 4. Production (AWS App Runner)

Live at <https://ezikbrhxwq.us-east-1.awsapprunner.com> — App Runner service `pricepoint-discord`, `us-east-1`,
0.25 vCPU / 0.5 GB, pulling `pricepoint-discord:latest` from ECR with auto-deploy on.

Redeploy after a code change:

```bash
./deploy.sh
```

(`docker build` without buildx attestations + push; App Runner picks up the new `:latest` automatically.)

Config lives in the App Runner console → *Configuration → Environment variables*: `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `PUZZLE_SOURCE`, `ALLOW_ANON`. Saving triggers a redeploy.

The container's disk is ephemeral, so `server/data/results.json` (the day's scoreboard) is lost on each redeploy.

To run it anywhere else: `npm run build && npm start` serves `client/dist` plus the API on `PORT` (default 3001).

## How it works

- **Puzzle number** = days since `2026-07-29` (local calendar date) + 1 — the same formula PricePoint's client uses.
- **Rooms** are keyed `guild:channel:puzzleNo`, so friends who open the activity later in the same channel see the
  earlier results. Results persist in `server/data/results.json`.
- **Scoring**: `round(5000 × min(guess, price) / max(guess, price))` — exact = 5000, 2× off = 2500, matching the
  two data points PricePoint publishes.
- The sidebar only ever receives per-round *scores*, never guesses or prices, so watching someone play doesn't
  leak the answer.
- Inside Discord every request to the backend goes through the `/.proxy/` prefix; images are re-served from
  `/img/:no/:i` because the activity iframe's CSP blocks third-party hosts.

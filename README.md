# PricePoint for Discord

A Discord Activity that plays [pricepoint.gg](https://pricepoint.gg)'s daily "guess what it sold for" puzzle.
Everyone plays at their own pace; a sidebar shows who in the channel is playing right now and how each of their
five rounds went, and a results card is posted to the channel as people finish.

## How it works

- **Puzzle number** = days since `2026-07-29` (local calendar date) + 1, the same formula PricePoint's client uses,
  so a new puzzle arrives at each player's local midnight.
- **Puzzle source** is pluggable (`PUZZLE_SOURCE=pricepoint|local`). Prices never leave the server until you guess;
  the browser only ever receives titles and images.
- **Images** are re-served from `/img/:no/:i` because the activity iframe's CSP blocks third-party hosts.
- **Scoring**: `round(5000 × min(guess, price) / max(guess, price))` — exact = 5000, 2× off = 2500, matching the
  two data points PricePoint publishes.
- **Rooms** are keyed `guild:channel:puzzleNo`, so friends who open the activity later in the same channel see the
  earlier results. Progress lives on the server, so a refresh restores it.
- **Live sidebar** is 2-second HTTP polling (`POST /api/session`, `GET /api/room`, `POST /api/guess`). It only ever
  carries per-round *scores*, never guesses or prices, so watching someone play doesn't leak the answer.
- **Channel card**: when a player finishes, the bot posts a PNG (rendered with `@napi-rs/canvas`) of everyone who
  has finished, and edits that same message as more people finish. Requires `DISCORD_BOT_TOKEN`; without it,
  nothing is posted.
- Inside Discord every request to the backend goes through the `/.proxy/` prefix required by the Embedded App SDK.

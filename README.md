# PricePoint for Discord

A Discord Activity that plays [pricepoint.gg](https://pricepoint.gg)'s daily "guess what it sold for" puzzle.
Everyone plays at their own pace; a sidebar shows who in the channel is playing right now and how each of their
five rounds went, and a results card is posted to the channel as people finish.

Two editions run from the same code and image, selected with `GAME=pricepoint|lego`:

- **PricePoint** — pricepoint.gg's daily five items.
- **BrickPoint** — five LEGO sets a day, all from one (seeded) release year, spread across price tiers. Data comes
  from [Brickset](https://brickset.com)'s API (`BRICKSET_API_KEY`), with a bundled pool of well-known sets as the
  fallback. Guess the US retail price at release. The day rolls over at midnight in `GAME_TZ`.

## How it works

- **Which puzzle is "today"**: the newest one pricepoint.gg has published (`GET /api/today` probes downward from
  `days since 2026-07-29 + 1`). Our day rolls over exactly when theirs does, and everyone in a channel is on the
  same puzzle regardless of timezone. The client re-checks every minute and switches over live.
- **Puzzle source** is pluggable (`PUZZLE_SOURCE=pricepoint|local`). Prices never leave the server until you guess;
  the browser only ever receives titles and images.
- **Images** are re-served from `/img/:no/:i` because the activity iframe's CSP blocks third-party hosts.
- **Scoring**: `round(5000 × min(guess, price) / max(guess, price))` — exact = 5000, 2× off = 2500, matching the
  two data points PricePoint publishes.
- **Hints** (BrickPoint): the piece count is hidden; a *show piece count* button reveals it for that round at the
  cost of 10% of the round's score. The server strips the hint from the puzzle payload and applies the deduction,
  so it can't be bypassed client-side.
- **Rooms** are keyed `guild:channel:puzzleNo`, so friends who open the activity later in the same channel see the
  earlier results. Progress lives on the server, so a refresh restores it.
- **Live sidebar** is 2-second HTTP polling (`POST /api/session`, `GET /api/room`, `POST /api/guess`). It only ever
  carries per-round *scores*, never guesses or prices, so watching someone play doesn't leak the answer.
- **Daily recap**: when the puzzle number advances, every channel that played in the last two weeks gets a
  "#N is out!" post with a card — yesterday's ranked results, season standings for the month, streak (consecutive
  days someone finished), longest streak, group average — plus a Play now! button.
- **Channel card**: when a player finishes, the bot posts a PNG (rendered with `@napi-rs/canvas`) of everyone who
  has finished, and edits that same message as more people finish. Requires `DISCORD_BOT_TOKEN`; without it,
  nothing is posted.
- Inside Discord every request to the backend goes through the `/.proxy/` prefix required by the Embedded App SDK.

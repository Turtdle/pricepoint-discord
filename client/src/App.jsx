import { useCallback, useEffect, useRef, useState } from 'react';
import { connectDiscord, base, fetchJson, saveWebName } from './discord.js';
import NamePrompt from './components/NamePrompt.jsx';
import { transition } from './transition.js';
import { ROUNDS } from './format.js';
import Sidebar from './components/Sidebar.jsx';
import Game from './components/Game.jsx';
import Summary from './components/Summary.jsx';

const POLL_MS = 2000; // room / sidebar
const TODAY_MS = 60000; // how often to ask which puzzle is current

const sortReveals = (list) => [...list].sort((a, b) => a.round - b.round);

export default function App() {
  const [game, setGame] = useState(null); // edition branding from the server
  const [no, setNo] = useState(null); // current puzzle number, decided by the server
  const [notYet, setNotYet] = useState(false);
  const [session, setSession] = useState(null);
  const [items, setItems] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [reveals, setReveals] = useState([]); // { round, price_cents, source_url, score }
  const [pending, setPending] = useState(null); // reveal awaiting the player's NEXT
  const [hints, setHints] = useState({}); // round -> revealed hint text (costs points)
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const noRef = useRef(null);
  const sidRef = useRef(null);
  const stageRef = useRef(null);

  // Scale the fixed 300x450 device to fill the stage (Discord activity windows vary a lot).
  useEffect(() => {
    const stage = stageRef.current;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      const avail = width > 640 ? width - 2 * 180 : width; // keep clear of the floating sidebar, stay centered
      const scale = Math.max(0.5, Math.min(avail / 300, height / 450) * 0.94);
      stage.style.setProperty('--scale', scale.toFixed(3));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // 1. edition config, then identity (the Discord SDK needs the client id from the server)
  useEffect(() => {
    fetchJson(`${base}/api/config`)
      .then((cfg) => {
        setGame(cfg.game);
        document.title = cfg.game.title;
        document.documentElement.style.setProperty('--orange', cfg.game.accent);
        document.documentElement.style.setProperty('--orange-dark', cfg.game.accentDark);
        document.documentElement.dataset.game = cfg.game.id;
        return connectDiscord(cfg.clientId);
      })
      .then(setSession)
      .catch((e) => setError(`Discord: ${e.message}`));
  }, []);

  // 2. which puzzle is "today". Re-checked every minute so the game rolls over when PricePoint posts the next one.
  useEffect(() => {
    let timer;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`${base}/api/today`, { cache: 'no-store' });
        if (cancelled) return;
        if (r.ok) {
          const { no: latest } = await r.json();
          setNotYet(false);
          if (latest !== noRef.current) {
            noRef.current = latest;
            transition(() => {
              setItems(null);
              setGuesses([]);
              setReveals([]);
              setHints({});
              setPending(null);
              setNo(latest);
            });
          }
        } else if (r.status === 503 && noRef.current === null) {
          setNotYet(true);
        }
      } catch {
        /* transient; next check retries */
      }
      timer = setTimeout(check, noRef.current === null ? 5000 : TODAY_MS);
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // 3. the puzzle itself
  useEffect(() => {
    if (no == null) return;
    let timer;
    let cancelled = false;
    const load = async () => {
      let r;
      try {
        r = await fetch(`${base}/api/puzzle/${no}`, { cache: 'no-store' });
      } catch {
        timer = setTimeout(load, 3000);
        return;
      }
      if (cancelled) return;
      if (r.status >= 500) {
        timer = setTimeout(load, 3000); // deploy cutover or upstream hiccup
        return;
      }
      if (!r.ok) return setError(`Puzzle: ${r.status}`);
      const data = await r.json();
      transition(() => setItems(data));
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [no]);

  // Join the room. The server is the source of truth for progress, so this also restores state
  // after a refresh, and is re-run whenever the server forgets our session (401).
  const joinRoom = useCallback(async () => {
    const r = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        no,
        guildId: session.guildId,
        channelId: session.channelId,
        access_token: session.access_token,
        anon: session.anon,
        web: session.web,
      }),
    });
    if (r.status === 401) throw new Error('Not authorized to join this room.');
    if (!r.ok) throw new Error(`join failed (${r.status})`);
    const data = await r.json();
    sidRef.current = data.sid;
    transition(() => {
      setGuesses(data.guesses);
      setReveals(sortReveals(data.reveals));
      setHints(Object.fromEntries((data.hints || []).map((h) => [h.round, h.text])));
      setPlayers(data.room.players);
    });
  }, [session, no]);

  // Reveal the hint for the current round (the server docks the round's score).
  const useHint = async () => {
    try {
      const r = await fetch(`${base}/api/hint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sid: sidRef.current }),
      });
      if (!r.ok) return;
      const { round, text } = await r.json();
      setHints((h) => ({ ...h, [round]: text }));
    } catch (e) {
      console.warn(e);
    }
  };

  // 4. poll the room for the live sidebar
  useEffect(() => {
    if (!session || session.needsName || no == null) return;
    let stopped = false;
    sidRef.current = null;
    joinRoom().catch((e) => setError(e.message));

    const tick = async () => {
      if (stopped || !sidRef.current) return;
      try {
        const r = await fetch(`${base}/api/room?sid=${sidRef.current}`, { cache: 'no-store' });
        if (r.status === 401) return joinRoom(); // server restarted
        if (r.ok) setPlayers((await r.json()).players);
      } catch {
        /* transient network error; next tick retries */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [session, no, joinRoom]);

  const submitGuess = async (guessCents) => {
    setGuesses((g) => [...g, guessCents]);
    try {
      const r = await fetch(`${base}/api/guess`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sid: sidRef.current, guessCents }),
      });
      if (r.status === 401) return joinRoom(); // resyncs guesses from the server
      if (!r.ok) throw new Error(`guess failed (${r.status})`);
      const { reveal, room } = await r.json();
      transition(() => {
        setReveals((list) => sortReveals([...list.filter((x) => x.round !== reveal.round), reveal]));
        setPending(reveal);
        setPlayers(room.players);
      });
    } catch (e) {
      setGuesses((g) => g.slice(0, -1)); // let them retry
      console.warn(e);
    }
  };

  const done = guesses.length >= ROUNDS && reveals.length >= ROUNDS && !pending;

  return (
    <div className="app">
      <Sidebar players={players} me={session?.user} />
      <main className="stage" ref={stageRef}>
        <div className="device">
          {error ? (
            <div className="notice error">{error}</div>
          ) : notYet ? (
            <div className="notice">
              today's puzzle isn't out yet
              <br />
              <small>checking again soon</small>
            </div>
          ) : session?.needsName && game ? (
            <NamePrompt
              game={game}
              onSubmit={(name) => {
                saveWebName(name);
                setSession({ ...session, needsName: false, web: { ...session.web, name }, user: { ...session.user, name } });
              }}
            />
          ) : !session || !items || !game ? (
            <div className="notice">loading…</div>
          ) : done ? (
            <Summary no={no} game={game} items={items} guesses={guesses} reveals={reveals} />
          ) : (
            <Game
              no={no}
              game={game}
              items={items}
              guesses={guesses}
              reveals={reveals}
              pending={pending}
              hints={hints}
              onHint={useHint}
              onGuess={submitGuess}
              onNext={() => transition(() => setPending(null))}
            />
          )}
        </div>
      </main>
    </div>
  );
}

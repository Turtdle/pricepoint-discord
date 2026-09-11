import { useCallback, useEffect, useRef, useState } from 'react';
import { connectDiscord, todayNumber, base, fetchJson } from './discord.js';
import { transition } from './transition.js';
import { ROUNDS } from './format.js';
import Sidebar from './components/Sidebar.jsx';
import Game from './components/Game.jsx';
import Summary from './components/Summary.jsx';

const POLL_MS = 2000;

const sortReveals = (list) => [...list].sort((a, b) => a.round - b.round);

export default function App() {
  const [no] = useState(todayNumber);
  const [session, setSession] = useState(null);
  const [items, setItems] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [reveals, setReveals] = useState([]); // { round, price_cents, source_url, score }
  const [pending, setPending] = useState(null); // reveal awaiting the player's NEXT
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
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

  // 1. identity + 2. today's puzzle, in parallel
  useEffect(() => {
    connectDiscord().then(setSession).catch((e) => setError(`Discord: ${e.message}`));
    fetchJson(`${base}/api/puzzle/${no}`)
      .then((items) => transition(() => setItems(items)))
      .catch((e) => setError(`Puzzle: ${e.message}`));
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
      }),
    });
    if (r.status === 401) throw new Error('Not authorized to join this room.');
    if (!r.ok) throw new Error(`join failed (${r.status})`);
    const data = await r.json();
    sidRef.current = data.sid;
    transition(() => {
      setGuesses(data.guesses);
      setReveals(sortReveals(data.reveals));
      setPlayers(data.room.players);
    });
  }, [session, no]);

  // 3. poll the room for the live sidebar
  useEffect(() => {
    if (!session) return;
    let stopped = false;
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
  }, [session, joinRoom]);

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
          ) : !session || !items ? (
            <div className="notice">loading…</div>
          ) : done ? (
            <Summary no={no} items={items} guesses={guesses} reveals={reveals} />
          ) : (
            <Game
              no={no}
              items={items}
              guesses={guesses}
              reveals={reveals}
              pending={pending}
              onGuess={submitGuess}
              onNext={() => transition(() => setPending(null))}
            />
          )}
        </div>
      </main>
    </div>
  );
}

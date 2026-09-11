import { useEffect, useState } from 'react';
import { usd, tier, total, MAX_SCORE, ROUNDS } from '../format.js';

// Time until the player's local midnight, which is when todayNumber() rolls over.
function untilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((next - now) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function Summary({ no, items, guesses, reveals }) {
  const [countdown, setCountdown] = useState(untilMidnight);
  const scores = reveals.map((r) => r.score);
  const sum = total(scores);

  useEffect(() => {
    const id = setInterval(() => setCountdown(untilMidnight()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header className="bar">
        <span className="brand">PRICEPOINT.GG</span>
        <span className="no">#{no}</span>
        <span className="points">{sum.toLocaleString()} points</span>
      </header>

      <div className="summary">
        <div className="big-score">
          {sum.toLocaleString()}
          <small> / {(MAX_SCORE * ROUNDS).toLocaleString()}</small>
        </div>

        <ol className="results">
          {items.map((it, i) => (
            <li key={i} className={`result t-${tier(scores[i])}`}>
              <span className="result-title">{it.title}</span>
              <span className="result-nums">
                <span className="guessed">{usd(guesses[i], { compact: true })}</span>
                <span className="arrow">→</span>
                <span className="actual">{usd(reveals[i].price_cents, { compact: true })}</span>
              </span>
              <span className="result-score">+{scores[i].toLocaleString()}</span>
            </li>
          ))}
        </ol>

        <p className="hint">new puzzle at midnight · in {countdown}</p>
      </div>
    </>
  );
}

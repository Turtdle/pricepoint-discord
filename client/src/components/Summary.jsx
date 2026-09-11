import { usd, tier, total, MAX_SCORE, ROUNDS } from '../format.js';

export default function Summary({ no, items, guesses, reveals }) {
  const scores = reveals.map((r) => r.score);
  const sum = total(scores);

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
            <li key={i} className={`result t-${tier(scores[i])}`} style={{ '--i': i }}>
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

        <p className="hint">new puzzle when pricepoint.gg posts tomorrow's</p>
      </div>
    </>
  );
}

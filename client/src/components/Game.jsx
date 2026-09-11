import { useEffect, useState } from 'react';
import { base } from '../discord.js';
import { ROUNDS, usd, soldLabel, total, tier } from '../format.js';
import NumPad from './NumPad.jsx';

// `pending` is the reveal for the guess just made; it stays on screen until NEXT.
export default function Game({ no, items, guesses, reveals, pending, onGuess, onNext }) {
  const round = guesses.length; // index of the item being guessed
  const [raw, setRaw] = useState(''); // digits + optional '.' as typed
  const waiting = round > reveals.length && !pending; // guess sent, answer not back yet

  const cents = Math.round(parseFloat(raw || '0') * 100);
  const canGuess = raw !== '' && cents > 0 && !waiting;

  const press = (k) => {
    if (k === 'back') return setRaw((r) => r.slice(0, -1));
    if (k === 'clear') return setRaw('');
    if (k === '.') return setRaw((r) => (r.includes('.') ? r : (r || '0') + '.'));
    setRaw((r) => {
      const next = r + k;
      const [, dec = ''] = next.split('.');
      if (dec.length > 2 || next.replace('.', '').length > 9) return r;
      return next.replace(/^0+(?=\d)/, '');
    });
  };

  const guess = () => {
    if (!canGuess) return;
    onGuess(cents);
    setRaw('');
  };

  useEffect(() => {
    const onKey = (e) => {
      if (pending) {
        if (e.key === 'Enter') onNext();
        return;
      }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === '.') press('.');
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') guess();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Preload the next image while the player thinks.
  useEffect(() => {
    const n = items[round + 1];
    if (n?.image_url) new Image().src = base + n.image_url;
  }, [round, items]);

  // While a guess is in flight `round` has already advanced, so keep showing the item just guessed
  // (otherwise the next item flashes for a moment before the reveal lands).
  const shownItem = pending ? items[pending.round] : waiting ? items[round - 1] : items[round];

  return (
    <>
      <header className="bar">
        <span className="brand">PRICEPOINT.GG</span>
        <span className="no">#{no}</span>
        <div className="rounds">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <span key={i} className={`ring ${i < round ? 'filled' : ''} ${i === round ? 'current' : ''}`} />
          ))}
        </div>
        <span className="points">{total(reveals.map((r) => r.score)).toLocaleString()} points</span>
      </header>

      <div className="card">
        <div className="photo-wrap">
          {shownItem.image_url ? (
            <>
              <img className="photo-bg" src={base + shownItem.image_url} alt="" aria-hidden />
              <img className="photo" src={base + shownItem.image_url} alt="" />
            </>
          ) : (
            <div className="photo placeholder">?</div>
          )}
          <span className="sold">{soldLabel(shownItem.sale_date)}</span>
        </div>
        <div className="caption" title={shownItem.title}>{shownItem.title}</div>
      </div>

      {waiting ? (
        <div className="reveal" />
      ) : pending ? (
        <div className="reveal">
          <div className="reveal-row">
            <span className="label">your guess</span>
            <span className="value">{usd(guesses[pending.round])}</span>
          </div>
          <div className="reveal-row">
            <span className="label">sold for</span>
            <span className="value actual">{usd(pending.price_cents)}</span>
          </div>
          <div className={`reveal-score t-${tier(pending.score)}`}>+{pending.score.toLocaleString()}</div>
          <button className="cta" onClick={onNext} autoFocus>
            {round >= ROUNDS ? 'RESULTS' : 'NEXT'}
          </button>
        </div>
      ) : (
        <>
          <div className="input-row">
            <div className="key small spacer" />
            <div className={`display ${raw ? 'active' : ''}`}>{raw ? `$${raw}` : '$0'}</div>
            <button className="key small danger" onClick={() => press('back')} title="backspace">
              ⌫
            </button>
          </div>
          <NumPad onPress={press} onGuess={guess} canGuess={canGuess} />
        </>
      )}
    </>
  );
}

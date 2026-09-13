import { useState } from 'react';

// First visit on the web (no Discord): pick a name for the lobby sidebar. Remembered in this browser.
export default function NamePrompt({ game, onSubmit }) {
  const [name, setName] = useState('');
  const ok = name.trim().length >= 2;
  const submit = (e) => {
    e.preventDefault();
    if (ok) onSubmit(name.trim().slice(0, 20));
  };
  return (
    <>
      <header className="bar">
        <span className="brand">{game.brand}</span>
      </header>
      <form className="name-prompt" onSubmit={submit}>
        <p className="name-title">pick a name</p>
        <p className="name-sub">shows on the lobby leaderboard · no account needed</p>
        <input
          className="name-input"
          autoFocus
          maxLength={20}
          placeholder="your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(e)}
        />
        <button className="cta" type="submit" disabled={!ok}>
          PLAY
        </button>
      </form>
    </>
  );
}

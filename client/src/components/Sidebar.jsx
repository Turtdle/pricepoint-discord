import { ROUNDS, tier, total } from '../format.js';

function Avatar({ p }) {
  return p.avatar ? (
    <img className="avatar" src={p.avatar} alt="" />
  ) : (
    <div className="avatar fallback">{p.name.slice(0, 1).toUpperCase()}</div>
  );
}

function Dots({ scores }) {
  return (
    <div className="dots">
      {Array.from({ length: ROUNDS }, (_, i) => (
        <span key={i} className={`dot ${tier(scores[i])}`} />
      ))}
    </div>
  );
}

// The live strip: everyone in this channel who has opened today's puzzle.
export default function Sidebar({ players, me }) {
  return (
    <aside className="sidebar">
      {players.map((p) => {
        const isMe = me && p.id === me.id;
        const status = p.done ? 'done' : p.online ? 'live' : 'idle';
        return (
          <div key={p.id} className={`player ${status} ${isMe ? 'me' : ''}`} title={p.name}>
            <div className="avatar-wrap">
              <Avatar p={p} />
              {p.online && <span className="presence" />}
            </div>
            <div className="player-body">
              <div className="player-name">{isMe ? 'you' : p.name}</div>
              <Dots scores={p.scores} />
              <div className="player-score">
                {p.scores.length ? total(p.scores).toLocaleString() : status === 'live' ? 'playing…' : '—'}
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

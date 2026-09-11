const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];

export default function NumPad({ onPress, onGuess, canGuess }) {
  return (
    <div className="numpad">
      {KEYS.map((k) => (
        <button key={k} className="key" onClick={() => onPress(k)}>
          {k}
        </button>
      ))}
      <button className="key guess" disabled={!canGuess} onClick={onGuess}>
        GUESS
      </button>
    </div>
  );
}

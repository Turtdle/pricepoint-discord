import { useEffect, useState } from 'react';

// Counts from 0 to `value` with an ease-out, like the score tick-up in most daily games.
export default function CountUp({ value, ms = 650 }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return shown.toLocaleString();
}

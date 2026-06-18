// =============================================================================
// rng — сид-генератор (mulberry32). Детерминизм критичен: один и тот же seed
// даёт повторяемый прогон, чтобы свипы параметров каната были сравнимы.
// =============================================================================

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,                                   // [0, 1)
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // случайный единичный вектор
    unit: () => {
      const a = next() * Math.PI * 2;
      return { x: Math.cos(a), y: Math.sin(a) };
    },
  };
}

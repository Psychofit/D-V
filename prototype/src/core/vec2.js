// =============================================================================
// vec2 — минимальная 2D-векторная математика на простых объектах {x, y}.
// Прототипный масштаб (десятки сущностей) → выделяем новые объекты ради ясности,
// производительность здесь не узкое место.
// =============================================================================

export const v = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });

export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function norm(a) {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

// Единичный вектор из a в b.
export function dir(a, b) {
  return norm(sub(b, a));
}

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;

// =============================================================================
// darkness — шкала тьмы = "канат" (GDD §4).
//
// Питается ЧИСТЫМ вложением очков: net = darkInvested - lightInvested.
// • net <= deadzone  → мир светлый (darkness стремится к 0).
//   Это и есть "нейтральный ранний мир возникает сам" (§4): на старте вложено ноль
//   → шкале нечем питаться → светло по построению.
// • Мёртвая зона (deadzonePoints) у нуля — гистерезис из §4: ранний мир не дрожит
//   от первых же потраченных очков пары быстрых D.
// • Сглаживание (smoothing) — чтобы значение шло к цели плавно, а не скачком.
//
// darkness ∈ [0,1]: 0 = полностью светло, 1 = полностью темно.
// =============================================================================

import { clamp, lerp } from '../core/vec2.js';

export function targetDarkness(world) {
  const { normalizer, deadzonePoints } = world.cfg.darkness;
  const net = world.darkInvested - world.lightInvested;
  const effective = Math.max(0, net - deadzonePoints); // мёртвая зона у нуля
  return clamp(effective / normalizer, 0, 1);
}

export function updateDarkness(world, dt) {
  const { smoothing } = world.cfg.darkness;
  const target = targetDarkness(world);
  // экспоненциальное подтягивание к цели, устойчивое к величине dt
  const t = 1 - Math.exp(-smoothing * dt);
  world.darkness = lerp(world.darkness, target, t);
}

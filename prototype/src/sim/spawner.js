// =============================================================================
// spawner — враги спавнятся из ЦЕНТРА поля (GDD §7): давят на D и V одновременно
// и поровну с первой секунды.
//
// Ось "СОСТАВ" (§3): частота спавна растёт по ходу сессии (как далеко зашли).
// Ось "ИНТЕНСИВНОСТЬ" (тьма) НЕ здесь — она в combat (урон/скорость атаки), §3:
// "тьма добавляет требовательности к координации, а не HP".
// =============================================================================

import { makeEnemy } from './entities.js';

export function updateSpawner(world, dt) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;
  if (world.enemies.length >= world.cfg.world.maxEnemies) {
    world.spawnTimer = 0.25;
    return;
  }

  const s = world.cfg.spawn;
  const progress = Math.min(1, world.time / world.cfg.world.sessionMaxSeconds);
  // интервал убывает со временем (ось "состав") И с числом игроков (толпа → больше врагов)
  const players = Math.max(1, world.players.filter((p) => p.alive).length);
  const crowd = players / s.refPlayers;
  const interval = s.baseInterval / ((1 + s.intervalSessionGain * progress) * crowd);
  world.spawnTimer = interval;

  const cx = world.cfg.world.width / 2;
  const cy = world.cfg.world.height / 2;
  for (let i = 0; i < s.burst; i++) {
    const off = world.rng.unit();
    const r = world.rng.range(0, s.centerJitter);
    const type = pickType(world, progress);
    world.stats.spawnedByType[type] = (world.stats.spawnedByType[type] || 0) + 1;
    if (type === 'fat') world.stats.fatSpawned++;
    world.enemies.push(makeEnemy(world, { x: cx + off.x * r, y: cy + off.y * r }, type));
  }
}

// Состав (§3): вес типа рампится от 0 (до порога прогресса) до weightMax; рой — базовый вес 1.
// Обобщён по ключам spawn.mix — новые типы добавляются только в конфиге.
function pickType(world, progress) {
  const ramp = (m) => (progress < m.start ? 0 : m.weightMax * (progress - m.start) / (1 - m.start));
  const mix = world.cfg.spawn.mix;
  const types = Object.keys(mix);
  const weights = types.map((t) => ramp(mix[t]));
  const total = 1 + weights.reduce((a, b) => a + b, 0); // swarm — базовый вес 1
  let roll = world.rng.next() * total;
  for (let i = 0; i < types.length; i++) {
    if ((roll -= weights[i]) < 0) return types[i];
  }
  return 'swarm';
}

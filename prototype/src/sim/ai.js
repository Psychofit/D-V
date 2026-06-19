// =============================================================================
// ai — боты ведут обе стороны, чтобы канат бежал автономно и его можно было
// наблюдать (главная задача среза, GDD §12). Боты не должны быть гениальны —
// они должны правдоподобно отыгрывать ГЛАГОЛ роли (§1):
//
// • D — "уничтожать": лезет к врагу на дистанцию выстрела, жмётся к V на низком hp,
//   жадно вкладывается в урон (тянет мир к тьме).
// • V — "спасать": держит V-кромку (близко к D для хила, вне ближнего боя §2),
//   лечит D под огнём (так зарабатывает), вкладывается в свет.
// • Враг — идёт на ближайшего игрока (открытый вопрос §11.3 — позже "самый ценный").
// =============================================================================

import { add, sub, scale, norm, dist, dir } from '../core/vec2.js';
import { fireProjectile, pulseAttack, pickEnemyTarget } from './combat.js';
import { canBuyNode, buyNode } from './economy.js';

function nearestEnemy(world, pos, type = null) {
  let best = null, bd = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (type && e.type !== type) continue;
    const d = dist(pos, e.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function nearestAlly(world, self, faction) {
  let best = null, bd = Infinity;
  for (const p of world.players) {
    if (!p.alive || p === self || p.faction !== faction) continue;
    const d = dist(self.pos, p.pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function setMove(p, desiredDir, dt) {
  const d = norm(desiredDir);
  p.vel = scale(d, p.speed);
}

export function updateAI(world, dt) {
  for (const e of world.enemies) enemyAI(world, e);
  for (const p of world.players) {
    if (!p.alive || p.controlled) continue; // управляемого человеком не трогаем
    if (p.faction === 'D') dAI(world, p, dt);
    else vAI(world, p, dt);
  }
}

function enemyAI(world, e) {
  const target = pickEnemyTarget(world, e); // охотник/дальнобой → V, прочие → ближайший (§3)
  if (!target) { e.vel = { x: 0, y: 0 }; return; }
  // тьма ускоряет врага → он догоняет кайтящего D (§3, замыкает канат)
  const speed = e.speed * (1 + world.darkness * e.speedDarkGain);

  if (e.attackKind === 'ranged') {
    // держит дистанцию ~80% дальности стрельбы: достаёт V, но не лезет в ближний бой
    const d = dist(e.pos, target.pos);
    const want = e.fireRange * 0.8;
    if (d > want * 1.1) e.vel = scale(dir(e.pos, target.pos), speed);       // подойти на дистанцию
    else if (d < want * 0.7) e.vel = scale(dir(target.pos, e.pos), speed);  // отойти (кайт от клинча)
    else e.vel = { x: 0, y: 0 };
  } else {
    e.vel = scale(dir(e.pos, target.pos), speed);                            // ближний/охотник — на цель
  }
}

function dAI(world, d, dt) {
  const cfg = world.cfg.ai;
  // D фокусит толстяка как приоритетную угрозу (за потолком V, добивается только D §2)
  const enemy = nearestEnemy(world, d.pos, 'fat') || nearestEnemy(world, d.pos);
  const medic = nearestAlly(world, d, 'V');
  const lowHp = d.hp < cfg.dRetreatHp * d.maxHp;

  if (lowHp && medic) {
    // жизнь в чужих руках — жмёмся к V (§1: у D нет кнопки спасения)
    setMove(d, dir(d.pos, medic.pos), dt);
  } else if (enemy) {
    if (world.cfg.D.weapon === 'pulse') dPulseEngage(world, d, enemy, dt);
    else dShotEngage(world, d, enemy, dt);
  } else {
    d.vel = { x: 0, y: 0 };
  }

  // вложение в урон → тянет мир к тьме (§4). Отзывчивый D придерживает тьму,
  // когда мир уже темнее порога (§10: баланс как своекорыстный оптимум).
  if (world.darkness < cfg.dDarkStopAt && canBuyNode(world, d)) buyNode(world, d);
}

function dShotEngage(world, d, enemy, dt) {
  const cfg = world.cfg.ai;
  const dd = dist(d.pos, enemy.pos);
  if (dd > cfg.dEngageRange) setMove(d, dir(d.pos, enemy.pos), dt);            // подойти
  else if (dd < cfg.dEngageRange * 0.7) setMove(d, dir(enemy.pos, d.pos), dt);// отойти (кайт)
  else d.vel = { x: 0, y: 0 };
  if (dd <= world.cfg.D.shotRange) fireProjectile(world, d, dir(d.pos, enemy.pos));
}

function dPulseEngage(world, d, enemy, dt) {
  // Пульсер НЫРЯЕТ в упор (§2): встаёт вплотную в свалку → ест урон → нуждается в V.
  const pc = world.cfg.D.pulse;
  const dd = dist(d.pos, enemy.pos);
  if (dd > pc.range * 0.55) setMove(d, dir(d.pos, enemy.pos), dt);            // подойти вплотную
  else d.vel = { x: 0, y: 0 };
  if (dd <= pc.range + enemy.radius) pulseAttack(world, d, dir(d.pos, enemy.pos));
}

function vAI(world, v, dt) {
  const cfg = world.cfg.ai;
  const ward = nearestAlly(world, v, 'D'); // подопечный D
  const enemy = nearestEnemy(world, v.pos);

  // --- Позиция на V-кромке (§2) ---
  if (enemy && dist(v.pos, enemy.pos) < cfg.vDangerDistance) {
    // слишком близко враг — отступаем (иначе сработает "все V мертвы")
    setMove(v, dir(enemy.pos, v.pos), dt);
  } else if (ward) {
    // держаться рядом с D, но с дальней от врага стороны
    let desiredPos;
    if (enemy) {
      const away = norm(sub(ward.pos, enemy.pos)); // направление "от врага" за спину D
      desiredPos = add(ward.pos, scale(away, cfg.vKromkaDistance));
    } else {
      desiredPos = add(ward.pos, scale(norm(sub(v.pos, ward.pos)), cfg.vKromkaDistance));
    }
    const toDesired = sub(desiredPos, v.pos);
    if (dist(v.pos, desiredPos) > 8) setMove(v, toDesired, dt);
    else v.vel = { x: 0, y: 0 };
  } else {
    v.vel = { x: 0, y: 0 };
  }

  // --- Выстрел = хил/урон одним снарядом (§2) ---
  if (ward && ward.hp < ward.maxHp && dist(v.pos, ward.pos) <= world.cfg.V.shotRange) {
    // лечим раненого D (основной доход V, §5)
    fireProjectile(world, v, dir(v.pos, ward.pos));
  } else if (enemy && dist(v.pos, enemy.pos) <= world.cfg.V.shotRange) {
    // D целый — попутно жжём врага (мелочь — добыча V, §2)
    fireProjectile(world, v, dir(v.pos, enemy.pos));
  }

  // вложение в свет → тянет мир обратно (вторая чаша каната, §4)
  if (cfg.investEagerness >= 1 && canBuyNode(world, v)) buyNode(world, v);
}

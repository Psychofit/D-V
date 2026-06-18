// =============================================================================
// combat — резолв боя (GDD §2, §3, §5).
//
// • D: прицельный снаряд урона. Бьёт только врагов (никакого friendly fire).
// • V: ОДИН снаряд лечит союзника-D / жжёт врага — смотря в кого попал (§2).
//   Лечит только D, не V (§5: "за хил D, не за хил друг друга" + закрывает фарм пары V).
// • Эффективный хил: платим только за реально восстановленные HP (оверхил = 0, §5).
// • Тьма = интенсивность: враг в тьме бьёт БОЛЬНЕЕ и ЧАЩЕ, но не толще (§3).
// =============================================================================

import { add, scale, dist, norm } from '../core/vec2.js';
import { makeProjectile } from './entities.js';
import { payKill, payEffectiveHeal } from './economy.js';

// Выстрел игрока в направлении aimDir (единичный вектор). Уважает кулдаун.
export function fireProjectile(world, player, aimDir) {
  if (player.shotCooldown > 0) return false;
  const d = norm(aimDir);
  if (d.x === 0 && d.y === 0) return false;

  const cfg = world.cfg[player.faction];
  const isD = player.faction === 'D';
  const muzzle = add(player.pos, scale(d, player.radius + cfg.projectileRadius + 1));

  world.projectiles.push(makeProjectile(world, {
    faction: player.faction,
    effect: isD ? 'damage' : 'heal',
    ownerId: player.id,
    pos: muzzle,
    vel: scale(d, cfg.projectileSpeed),
    power: isD ? player.shotDamage : player.healPower,
    radius: cfg.projectileRadius,
    range: cfg.shotRange,
  }));

  player.shotCooldown = cfg.shotInterval;
  return true;
}

export function updateCooldowns(world, dt) {
  for (const p of world.players) if (p.shotCooldown > 0) p.shotCooldown -= dt;
  for (const e of world.enemies) if (e.attackCooldown > 0) e.attackCooldown -= dt;
}

// Враги бьют в упор. Тьма делает удары больнее и чаще (§3).
export function updateEnemyAttacks(world, dt) {
  const ec = world.cfg.enemy;
  const dmgMul = 1 + world.darkness * ec.damageDarkGain;
  const spdMul = 1 + world.darkness * ec.attackSpeedDarkGain;

  for (const e of world.enemies) {
    if (!e.alive || e.attackCooldown > 0) continue;
    // ближайший живой игрок в зоне удара
    let target = null, best = Infinity;
    for (const p of world.players) {
      if (!p.alive) continue;
      const dd = dist(e.pos, p.pos);
      if (dd < best) { best = dd; target = p; }
    }
    if (target && best <= e.radius + target.radius + ec.attackRange) {
      target.hp -= ec.contactDamage * dmgMul;
      e.attackCooldown = ec.attackInterval / spdMul;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        world.events.push({ t: world.time, type: 'death', faction: target.faction, id: target.id });
      }
    }
  }
}

export function updateProjectiles(world, dt) {
  for (const pr of world.projectiles) {
    if (!pr.alive) continue;
    const step = scale(pr.vel, dt);
    pr.pos = add(pr.pos, step);
    pr.traveled += Math.hypot(step.x, step.y);
    if (pr.traveled >= pr.range) { pr.alive = false; continue; }

    if (pr.effect === 'damage') resolveDamageProjectile(world, pr);
    else resolveHealProjectile(world, pr);
  }
}

function resolveDamageProjectile(world, pr) {
  // D-снаряд: ближайший задетый враг
  let hit = null, best = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const dd = dist(pr.pos, e.pos);
    if (dd <= pr.radius + e.radius && dd < best) { best = dd; hit = e; }
  }
  if (!hit) return;

  const owner = world.findPlayer(pr.ownerId);
  hit.hp -= pr.power;
  if (owner) owner.totalDamageDone += pr.power;
  pr.alive = false;
  if (hit.hp <= 0) {
    hit.alive = false;
    payKill(world, owner); // валюта добившему (§4, §5)
  }
}

function resolveHealProjectile(world, pr) {
  // V-снаряд: ближайшая задетая цель среди врагов (жечь) и СОЮЗНЫХ D (лечить).
  // Что окажется на пути первым — то и получит эффект (позиционная драма V, §2).
  let hit = null, best = Infinity, isEnemy = false;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const dd = dist(pr.pos, e.pos);
    if (dd <= pr.radius + e.radius && dd < best) { best = dd; hit = e; isEnemy = true; }
  }
  for (const p of world.players) {
    if (!p.alive || p.faction !== 'D') continue; // лечим только D (§5)
    const dd = dist(pr.pos, p.pos);
    if (dd <= pr.radius + p.radius && dd < best) { best = dd; hit = p; isEnemy = false; }
  }
  if (!hit) return;

  const owner = world.findPlayer(pr.ownerId);
  pr.alive = false;

  if (isEnemy) {
    // жжёт врага — V слабее в добивании (burnFactor), это специализация, не уценка (§2)
    const burn = pr.power * world.cfg.V.burnFactor;
    hit.hp -= burn;
    if (owner) owner.totalDamageDone += burn;
    if (hit.hp <= 0) {
      hit.alive = false;
      payKill(world, owner);
    }
  } else {
    // лечит D — платим ТОЛЬКО за эффективные HP (оверхил = 0, §5)
    const before = hit.hp;
    hit.hp = Math.min(hit.maxHp, hit.hp + pr.power);
    const effective = hit.hp - before;
    if (owner) payEffectiveHeal(world, owner, effective);
  }
}

// Снять мёртвых и улетевшие снаряды.
export function sweepDead(world) {
  world.enemies = world.enemies.filter((e) => e.alive);
  world.projectiles = world.projectiles.filter((p) => p.alive);
  // мёртвых игроков НЕ удаляем (одна жизнь/сессия §7) — оставляем для подсчёта крахов
}

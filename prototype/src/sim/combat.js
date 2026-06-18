// =============================================================================
// combat — резолв боя (GDD §2, §3, §5).
//
// • D: прицельный снаряд урона. Бьёт только врагов (никакого friendly fire).
// • V: ОДИН снаряд лечит союзника-D / жжёт врага — смотря в кого попал (§2).
//   Лечит только D, не V (§5: "за хил D, не за хил друг друга" + закрывает фарм пары V).
// • Эффективный хил: платим только за реально восстановленные HP (оверхил = 0, §5).
// • Тьма = интенсивность: враг в тьме бьёт БОЛЬНЕЕ и ЧАЩЕ, но не толще (§3).
// =============================================================================

import { add, sub, scale, dist, len, norm } from '../core/vec2.js';
import { makeProjectile } from './entities.js';
import { payKill, payEffectiveHeal } from './economy.js';

// Выстрел игрока в направлении aimDir (единичный вектор). Уважает кулдаун.
export function fireProjectile(world, player, aimDir) {
  if (player.shotCooldown > 0) return false;
  const d = norm(aimDir);
  if (d.x === 0 && d.y === 0) return false;

  const cfg = world.cfg[player.faction];
  const isD = player.faction === 'D';
  const area = !isD && cfg.areaHeal;            // V с прокачкой в площадь (§2)
  const muzzle = add(player.pos, scale(d, player.radius + cfg.projectileRadius + 1));

  world.projectiles.push(makeProjectile(world, {
    faction: player.faction,
    effect: isD ? 'damage' : area ? 'area' : 'heal',
    ownerId: player.id,
    pos: muzzle,
    vel: scale(d, cfg.projectileSpeed),
    power: isD ? player.shotDamage : player.healPower,
    radius: cfg.projectileRadius,
    // площадь бьёт ближе (§2: короче радиус, ближе к клинчу)
    range: isD ? cfg.shotRange : area ? cfg.shotRange * cfg.area.rangeFactor : cfg.shotRange,
  }));

  player.shotCooldown = cfg.shotInterval;
  return true;
}

// Пульс D (§2): мгновенная конусная атака В УПОР. Бьёт сильнее выстрела и по площади
// конуса, но требует стоять вплотную → D ест урон → V на нём больше зарабатывает.
// Метка V множит и урон пульса (вклад V = умноженный удар D).
export function pulseAttack(world, player, aimDir) {
  if (player.shotCooldown > 0) return false;
  const d = norm(aimDir);
  if (d.x === 0 && d.y === 0) return false;
  const pc = world.cfg.D.pulse;
  const cosHalf = Math.cos(pc.coneHalfAngle);

  for (const e of world.enemies) {
    if (!e.alive) continue;
    const to = sub(e.pos, player.pos);
    const dd = len(to);
    if (dd > pc.range + e.radius) continue;
    const cos = dd > 1e-6 ? (to.x * d.x + to.y * d.y) / dd : 1;
    if (cos < cosHalf) continue;                 // вне конуса перед лицом
    const dmg = pc.damage * (e.markedUntil > world.time ? world.cfg.mark.damageMul : 1);
    e.hp -= dmg;
    player.totalDamageDone += dmg;
    if (e.hp <= 0) killEnemy(world, e, player);
  }
  player.shotCooldown = pc.interval;
  player.pulseFx = { t: world.time, aim: d };      // транзиентный след для рендера
  return true;
}

export function updateCooldowns(world, dt) {
  for (const p of world.players) if (p.shotCooldown > 0) p.shotCooldown -= dt;
  for (const e of world.enemies) if (e.attackCooldown > 0) e.attackCooldown -= dt;
}

// Враги бьют в упор. Тьма делает удары больнее и чаще (§3). Статы — по типу врага.
export function updateEnemyAttacks(world, dt) {
  for (const e of world.enemies) {
    if (!e.alive || e.attackCooldown > 0) continue;
    const dmgMul = 1 + world.darkness * e.damageDarkGain;
    const spdMul = 1 + world.darkness * e.attackSpeedDarkGain;
    // ближайший живой игрок в зоне удара
    let target = null, best = Infinity;
    for (const p of world.players) {
      if (!p.alive) continue;
      const dd = dist(e.pos, p.pos);
      if (dd < best) { best = dd; target = p; }
    }
    if (target && best <= e.radius + target.radius + e.attackRange) {
      target.hp -= e.contactDamage * dmgMul;
      e.attackCooldown = e.attackInterval / spdMul;
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

    if (pr.effect === 'area') { updateAreaProjectile(world, pr); continue; }
    if (pr.traveled >= pr.range) { pr.alive = false; continue; }
    if (pr.effect === 'damage') resolveDamageProjectile(world, pr);
    else resolveHealProjectile(world, pr);
  }
}

// Площадной снаряд V (§2): детонирует там, где есть кого лечить — когда СОЮЗНЫЙ D
// входит в радиус импульса (или на макс. дальности). Затем импульс по радиусу: лечит
// ВСЕХ D и жжёт/метит ВСЕХ врагов в нём. Площадь не блокируется толпой → V зарабатывает
// хилом в скученном бою (одноцель — перехватывается врагами на пути к D).
function updateAreaProjectile(world, pr) {
  const R = world.cfg.V.area.radius;
  let nearAlly = false;
  for (const p of world.players) {
    if (p.alive && p.faction === 'D' && dist(pr.pos, p.pos) <= R) { nearAlly = true; break; }
  }
  if (nearAlly || pr.traveled >= pr.range) {
    detonateArea(world, pr);
    pr.alive = false;
  }
}

function detonateArea(world, pr) {
  const owner = world.findPlayer(pr.ownerId);
  const a = world.cfg.V.area;
  const R = a.radius;

  // лечим всех D в радиусе — платим за эффективные HP (оверхил = 0, §5)
  for (const p of world.players) {
    if (!p.alive || p.faction !== 'D' || dist(pr.pos, p.pos) > R) continue;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + pr.power * a.healFactor);
    if (owner) payEffectiveHeal(world, owner, p.hp - before);
  }
  // жжём + метим всех врагов в радиусе (по толстяку — потолок толщины §2)
  for (const e of world.enemies) {
    if (!e.alive || dist(pr.pos, e.pos) > R) continue;
    e.markedUntil = world.time + world.cfg.mark.duration;
    const thickness = e.type === 'fat' ? world.cfg.V.fatBurnFactor : 1;
    const burn = pr.power * a.burnFactor * thickness;
    e.hp -= burn;
    if (owner) owner.totalDamageDone += burn;
    if (e.hp <= 0) killEnemy(world, e, owner);
  }
}

// Общая смерть врага: пометить, посчитать толстяков, заплатить добившему.
function killEnemy(world, enemy, killer) {
  enemy.alive = false;
  if (enemy.type === 'fat') world.stats.fatKilled++;
  payKill(world, killer); // валюта добившему (§4, §5)
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
  // метка V множит урон D (§2: вклад V = умноженный выстрел D)
  const dmg = pr.power * (hit.markedUntil > world.time ? world.cfg.mark.damageMul : 1);
  hit.hp -= dmg;
  if (owner) owner.totalDamageDone += dmg;
  pr.alive = false;
  if (hit.hp <= 0) killEnemy(world, hit, owner);
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
    // V СТАВИТ МЕТКУ на врага (§2): почти не жжёт сам, но даёт D бить сильнее.
    // Так V добивает толстяка не своим уроном, а множителем урона D.
    hit.markedUntil = world.time + world.cfg.mark.duration;
    // потолок по толщине (§2): по толстяку burn V почти ноль — он за его потолком
    const thickness = hit.type === 'fat' ? world.cfg.V.fatBurnFactor : 1;
    const burn = pr.power * world.cfg.V.burnFactor * thickness;
    hit.hp -= burn;
    if (owner) owner.totalDamageDone += burn;
    if (hit.hp <= 0) killEnemy(world, hit, owner);
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

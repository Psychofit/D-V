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

// Осада босса (§босс): боты распределяются по кольцу вокруг центра (по id, золотым углом)
// и бьют в ядро — как кольца вращаются, бреши своего цвета периодически впускают их выстрелы.
function bossSiege(world, p, dt) {
  const b = world.boss, t = world.time;
  // распределены по кольцу (золотой угол по id); вьюжим дистанцию и угол → уклонение от пуль
  const want = 290 + Math.sin(t * 1.6 + p.id) * 48;
  const ang = p.id * 2.39996 + Math.sin(t * 0.7 + p.id * 2) * 0.5;
  const desired = { x: b.pos.x + Math.cos(ang) * want, y: b.pos.y + Math.sin(ang) * want };
  if (dist(p.pos, desired) > 10) setMove(p, dir(p.pos, desired), dt); else p.vel = { x: 0, y: 0 };
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

  if (e.attackKind === 'ranged' || e.attackKind === 'none') {
    // дальнобой держит дистанцию стрельбы; глушитель — standoff, накрывая бой зоной (§3)
    const d = dist(e.pos, target.pos);
    const want = e.attackKind === 'ranged' ? e.fireRange * 0.8 : e.standoff;
    if (d > want * 1.1) e.vel = scale(dir(e.pos, target.pos), speed);       // подойти на дистанцию
    else if (d < want * 0.7) e.vel = scale(dir(target.pos, e.pos), speed);  // отойти (не лезть в клинч)
    else e.vel = { x: 0, y: 0 };
  } else {
    e.vel = scale(dir(e.pos, target.pos), speed);                            // ближний/охотник — на цель
  }
}

function dAI(world, d, dt) {
  const cfg = world.cfg.ai;
  if (world.boss && world.boss.phase === 'active') {     // §босс: осада + стрельба в ядро
    bossSiege(world, d, dt);
    fireProjectile(world, d, dir(d.pos, world.boss.pos));
    if (world.darkness < cfg.dDarkStopAt && canBuyNode(world, d)) buyNode(world, d);
    return;
  }
  // D фокусит толстяка как приоритетную угрозу (за потолком V, добивается только D §2)
  const enemy = nearestEnemy(world, d.pos, 'fat') || nearestEnemy(world, d.pos);
  const medic = nearestAlly(world, d, 'V');
  const lowHp = d.hp < cfg.dRetreatHp * d.maxHp;

  if (lowHp && medic) {
    // жизнь в чужих руках — жмёмся к V (§1: у D нет кнопки спасения)
    setMove(d, dir(d.pos, medic.pos), dt);
  } else if (enemy) {
    if (d.loadout.weapon === 'pulse') dPulseEngage(world, d, enemy, dt);
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

// Подопечный V: РАНЕНЫЙ D в зоне хила (фронтлайн, что кровит), иначе ближайший. Фокус на
// тех, кому хил нужен, держит танкующих пульсеров живыми (§2: доходный пациент). Разные V
// РАСПРЕДЕЛЯЮТСЯ по раненым D (анти-дубль по id) — критично для одноцели (не лечить одного впятером).
function pickWard(world, v) {
  const range = world.cfg.V.shotRange;
  const hurt = [];
  let nearest = null, nd = Infinity;
  for (const p of world.players) {
    if (!p.alive || p.faction !== 'D') continue;
    const d = dist(v.pos, p.pos);
    if (d < nd) { nd = d; nearest = p; }
    if (d <= range && p.hp < p.maxHp) hurt.push(p);
  }
  if (!hurt.length) return nearest;
  hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp); // самые раненые впереди
  return hurt[v.id % hurt.length];                      // распределяем V по раненым целям
}

function vAI(world, v, dt) {
  const cfg = world.cfg.ai;
  if (world.boss && world.boss.phase === 'active') {     // §босс: осада; лечим раненых D, иначе бьём ядро
    bossSiege(world, v, dt);
    const w = pickWard(world, v);
    if (w && w.hp < w.maxHp * 0.7 && dist(v.pos, w.pos) <= world.cfg.V.shotRange) fireProjectile(world, v, dir(v.pos, w.pos));
    else fireProjectile(world, v, dir(v.pos, world.boss.pos));
    if (cfg.investEagerness >= 1 && canBuyNode(world, v)) buyNode(world, v);
    return;
  }
  const ward = pickWard(world, v); // приоритет — самый раненый D (фронтлайн), §2
  const enemy = nearestEnemy(world, v.pos);

  // --- Позиция на V-кромке (§2): площадь близко (охват/риск), одноцель далеко (безопасность) ---
  const kromka = v.loadout.heal === 'single' ? cfg.vKromkaSingle : cfg.vKromkaDistance;
  if (enemy && dist(v.pos, enemy.pos) < cfg.vDangerDistance) {
    // слишком близко враг — отступаем (иначе сработает "все V мертвы")
    setMove(v, dir(enemy.pos, v.pos), dt);
  } else if (ward) {
    // держаться рядом с D, но с дальней от врага стороны
    let desiredPos;
    if (enemy) {
      const away = norm(sub(ward.pos, enemy.pos)); // направление "от врага" за спину D
      desiredPos = add(ward.pos, scale(away, kromka));
    } else {
      desiredPos = add(ward.pos, scale(norm(sub(v.pos, ward.pos)), kromka));
    }
    const toDesired = sub(desiredPos, v.pos);
    if (dist(v.pos, desiredPos) > 8) setMove(v, toDesired, dt);
    else v.vel = { x: 0, y: 0 };
  } else {
    v.vel = { x: 0, y: 0 };
  }

  // --- Выстрел (§2) ---
  if (ward && ward.hp < ward.maxHp && dist(v.pos, ward.pos) <= world.cfg.V.shotRange) {
    // лечим раненого D (основной доход V, §5) — у обеих веток
    fireProjectile(world, v, dir(v.pos, ward.pos));
  } else if (v.loadout.heal === 'area' && enemy && dist(v.pos, enemy.pos) <= world.cfg.V.shotRange) {
    // площадь: D целый — попутно жжём/метим врага охватом (одноцель — чистый хилер, не палит)
    fireProjectile(world, v, dir(v.pos, enemy.pos));
  }

  // вложение в свет → тянет мир обратно (вторая чаша каната, §4)
  if (cfg.investEagerness >= 1 && canBuyNode(world, v)) buyNode(world, v);
}

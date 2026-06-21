// =============================================================================
// world — состояние сессии + оркестрация одного шага симуляции.
//
// Старт (GDD §7): D и V — по разным углам, враги — из центра. Воссоединение D с V —
// встроенная цель. Одна жизнь на сессию, без респавна (§6, §7).
// Крахи (§6): "все V мертвы" → ярость D и гибель; "все D мертвы" → тихое угасание.
// =============================================================================

import { makeRng } from '../core/rng.js';
import { makePlayer, makeBoss } from './entities.js';
import { updateDarkness } from './darkness.js';
import { updateSpawner } from './spawner.js';
import { updateBoss } from './boss.js';
import { updateAI } from './ai.js';
import {
  updateCooldowns, updateEnemyAttacks, updateProjectiles, updateSuppression, sweepDead, updateRift,
} from './combat.js';
import { clamp } from '../core/vec2.js';

export function createWorld(cfg, seed = 1) {
  const W = cfg.world.width, H = cfg.world.height, m = 80;
  const world = {
    cfg,
    seed,
    rng: makeRng(seed),
    time: 0,
    nextId: 1,
    players: [],
    enemies: [],
    projectiles: [],
    // канат (§4):
    darkInvested: 0,
    lightInvested: 0,
    darkness: 0,
    spawnTimer: 0,
    // статус сессии:
    running: true,
    status: 'running',  // running | collapse-D | collapse-V | collapse-both
    fury: false,        // вспышка "все V мертвы" (§6)
    boss: null,         // активный босс (§босс) — занимает центр, гасит разлом-опасность
    bossDefeated: false,// босс уже повержен в этой сессии (повторно не появится)
    totalEarned: 0,     // валовой доход популяции («общие очки») — триггер появления босса
    events: [],
    stats: { vIncomeAccum: 0, fatSpawned: 0, fatKilled: 0, spawnedByType: {} },
    findPlayer(id) {
      for (const p of this.players) if (p.id === id) return p;
      return null;
    },
  };

  // §7: D и V стартуют кластерами по разным углам (враги — из центра).
  const spread = cfg.session.cornerSpread;
  const cluster = (faction, corner, n) => {
    for (let i = 0; i < n; i++) {
      const pos = {
        x: clamp(corner.x + (world.rng.next() - 0.5) * spread, m, W - m),
        y: clamp(corner.y + (world.rng.next() - 0.5) * spread, m, H - m),
      };
      world.players.push(makePlayer(world, faction, pos));
    }
  };
  cluster('D', { x: m, y: H - m }, cfg.session.numD);   // нижний-левый угол
  cluster('V', { x: W - m, y: m }, cfg.session.numV);   // верхний-правый угол

  // §8: боты приносят билды по распределению cfg.loadouts (выбор сайдгрейдов до старта).
  // Выбор независим на игрока → в сессии живёт смесь билдов.
  const lo = cfg.loadouts;
  for (const p of world.players) {
    if (p.faction === 'D') {
      p.loadout.weapon = world.rng.next() < lo.D.pulseFraction ? 'pulse' : 'shot';
      p.loadout.provoker = world.rng.next() < lo.D.provokerFraction;
    } else {
      p.loadout.heal = world.rng.next() < lo.V.areaFraction ? 'area' : 'single';
    }
  }
  return world;
}

// §босс: «Сомнения» появляются при достижении популяцией порога «общих очков».
function maybeSpawnBoss(world) {
  if (world.boss || world.bossDefeated || !world.cfg.boss) return;
  if (world.totalEarned >= world.cfg.boss.appearAtPoints) {
    world.boss = makeBoss(world);
    // отбросить ВСЕХ игроков из центра к стенам — чтобы никто не застрял внутри босса
    const W = world.cfg.world.width, H = world.cfg.world.height, cx = W / 2, cy = H / 2;
    const safe = world.boss.rings[world.boss.rings.length - 1].radius + 180;
    for (const p of world.players) {
      if (!p.alive) continue;
      let dx = p.pos.x - cx, dy = p.pos.y - cy, d = Math.hypot(dx, dy);
      if (d < 1) { const a = world.rng.next() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      const nd = Math.max(d, safe) + 520;          // мощный отброс наружу (к стенам)
      p.pos = {
        x: clamp(cx + (dx / d) * nd, p.radius, W - p.radius),
        y: clamp(cy + (dy / d) * nd, p.radius, H - p.radius),
      };
    }
    world.events.push({ t: world.time, type: 'boss-appear', id: world.boss.id });
  }
}

function integrate(world, dt) {
  const W = world.cfg.world.width, H = world.cfg.world.height;
  const move = (o) => {
    o.pos.x = clamp(o.pos.x + o.vel.x * dt, o.radius, W - o.radius);
    o.pos.y = clamp(o.pos.y + o.vel.y * dt, o.radius, H - o.radius);
  };
  for (const p of world.players) if (p.alive) move(p);
  for (const e of world.enemies) move(e);
}

// §6: "все V мертвы" → урон D взлетает, но D начинают терять hp и тоже гибнут.
function applyFury(world, dt) {
  const c = world.cfg.crash;
  const vAlive = world.players.some((p) => p.faction === 'V' && p.alive);
  const dAlive = world.players.some((p) => p.faction === 'D' && p.alive);

  if (!vAlive && dAlive && !world.fury) {
    world.fury = true;
    world.events.push({ t: world.time, type: 'all-V-dead' });
    for (const p of world.players) if (p.faction === 'D') p.shotDamage *= c.furyDamageMul;
  }
  if (world.fury) {
    for (const p of world.players) {
      if (p.faction === 'D' && p.alive) {
        p.hp -= c.furyDecayPerSec * dt;
        if (p.hp <= 0) {
          p.hp = 0; p.alive = false;
          world.events.push({ t: world.time, type: 'death', faction: 'D', id: p.id });
        }
      }
    }
  }
}

function checkCrash(world) {
  const dAlive = world.players.some((p) => p.faction === 'D' && p.alive);
  const vAlive = world.players.some((p) => p.faction === 'V' && p.alive);
  if (dAlive && vAlive) return;
  if (!dAlive && !vAlive) world.status = world.fury ? 'collapse-V' : 'collapse-both';
  else if (!dAlive) world.status = 'collapse-D'; // §6: тихое угасание смысла
  else return; // !vAlive, но D ещё живы — идёт вспышка ярости, не терминально
  world.running = false;
  world.events.push({ t: world.time, type: world.status });
}

export function stepWorld(world, dt) {
  if (!world.running) return;
  world.time += dt;

  updateDarkness(world, dt);   // канат → darkness
  maybeSpawnBoss(world);       // §босс: появление при «общих очках» (валовой доход)
  if (!world.boss) updateSpawner(world, dt); // босс занимает центр → обычный спавн молчит
  updateCooldowns(world, dt);
  updateAI(world, dt);         // боты: движение, выстрелы, вложения
  integrate(world, dt);        // движение игроков и врагов
  updateEnemyAttacks(world, dt);
  updateBoss(world, dt);       // §босс: вращение колец + bullet hell
  updateRift(world, dt);       // §7: центр-разлом ранит задержавшихся (при живом боссе гаснет)
  updateProjectiles(world, dt);// движение снарядов + попадания + выплаты
  updateSuppression(world);    // §3 глушитель: снять метки V в зоне (хил давится в самом хиле)
  applyFury(world, dt);        // §6 вспышка
  sweepDead(world);
  checkCrash(world);
}

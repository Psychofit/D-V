// =============================================================================
// boss — первый босс «СОМНЕНИЯ» (§босс). Огромный многогранник в центре, два
// вращающихся кольца-щита с брешами. Снаряд ранит ядро, только пройдя бреши СВОЕГО
// цвета на ОБОИХ кольцах: КРАСНАЯ брешь — для D, СИНЯЯ — для V (напротив). Так D и V
// бьют с разных сторон в свои окна — кооперация (§1). Атака — bullet hell.
//
// Сим-ядро остаётся чистым: босс — обычные данные, эффекты/звук берутся диффингом.
// =============================================================================

import { add, scale } from '../core/vec2.js';
import { makeProjectile } from './entities.js';

// Угловая разница в [0, π].
function angDiff(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

// Проходит ли снаряд фракции через брешь кольца в данном угле.
// D-брешь у angle ≈ ring.angle; V-брешь — напротив (ring.angle + π).
function ringPasses(ring, angle, faction) {
  const gapCenter = faction === 'D' ? ring.angle : ring.angle + Math.PI;
  return angDiff(angle, gapCenter) <= ring.gapHalf;
}

function bossBullet(world, b, ang, f, darkMul) {
  if (world.projectiles.length >= f.maxBullets) return;     // предохранитель плотности
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  world.projectiles.push(makeProjectile(world, {
    faction: 'enemy', effect: 'enemyShot', ownerId: b.id,
    pos: add(b.pos, scale(dir, b.radius + 8)),
    vel: scale(dir, f.bulletSpeed),
    power: f.bulletDamage * darkMul,
    radius: f.bulletRadius,
    range: f.bulletRange,
  }));
}

export function updateBoss(world, dt) {
  const b = world.boss;
  if (!b || !b.alive) return;
  if (b.phase === 'intro') {                                // драм-пауза: имя на экране, босс молчит
    if (world.time - b.spawnT >= world.cfg.boss.introSeconds) b.phase = 'active';
    return;
  }
  for (const r of b.rings) r.angle += r.speed * dt;         // вращение колец (окна ходят)

  const f = world.cfg.boss.fire;
  const darkMul = 1 + world.darkness * f.bulletDarkGain;
  b.radialT -= dt;
  if (b.radialT <= 0) {                                     // радиальное кольцо снарядов
    b.radialT += f.radialInterval;
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < f.radialCount; i++) bossBullet(world, b, off + (i / f.radialCount) * Math.PI * 2, f, darkMul);
  }
  b.spiralT -= dt;
  if (b.spiralT <= 0) {                                     // вращающаяся спираль
    b.spiralT += f.spiralInterval;
    b.spiralAngle += f.spiralStep;
    for (let a = 0; a < f.spiralArms; a++) bossBullet(world, b, b.spiralAngle + (a / f.spiralArms) * Math.PI * 2, f, darkMul);
  }
}

// Взаимодействие снаряда игрока с боссом. Возвращает true, если снаряд «принадлежит»
// боссу в этот кадр (его не надо резолвить обычным образом). Вызывается из combat.
export function tryBossHit(world, pr) {
  const b = world.boss;
  if (!b || !b.alive || b.phase !== 'active') return false;
  if (pr.faction !== 'D' && pr.faction !== 'V') return false;
  const dx = pr.pos.x - b.pos.x, dy = pr.pos.y - b.pos.y;
  const d2 = dx * dx + dy * dy;
  const outer = b.rings[b.rings.length - 1].radius;
  if (d2 > outer * outer) return false;                     // ещё не у колец — не наш

  if (!pr.bossEvaluated) {                                  // однократная проверка брешей при входе
    pr.bossEvaluated = true;
    const angle = Math.atan2(dy, dx);
    if (b.rings.every((r) => ringPasses(r, angle, pr.faction))) {
      pr.bossPass = true;                                   // прошёл бреши своего цвета на всех кольцах
    } else {
      pr.alive = false;                                     // упёрся в щит
      b.shieldFx = { t: world.time, x: pr.pos.x, y: pr.pos.y, faction: pr.faction };
      return true;
    }
  }

  const inner = b.rings[0].radius - 6;
  if (pr.bossPass && d2 <= inner * inner) {                 // достиг ядра → урон
    const dmg = pr.faction === 'D'
      ? pr.power * world.cfg.boss.dDamageFactor
      : world.cfg.V.healPower * world.cfg.boss.vDamageFactor;
    b.hp -= dmg;
    pr.alive = false;
    b.hitFx = { t: world.time, faction: pr.faction };
    if (b.hp <= 0) killBoss(world, pr);
    return true;
  }
  return true;                                              // внутри колец — снаряд наш (летит к ядру)
}

function killBoss(world, pr) {
  const b = world.boss;
  b.alive = false;
  b.hp = 0;
  const killer = pr && world.findPlayer(pr.ownerId);
  if (killer) killer.currency += world.cfg.boss.killReward;
  world.events.push({ t: world.time, type: 'boss-dead', id: b.id });
  world.boss = null;            // центр освобождён → обычный спавн и разлом-опасность вернулись
  world.bossDefeated = true;    // в этой сессии больше не появится
}

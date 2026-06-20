// =============================================================================
// renderer — облик прототипа (браузерный слой, сим-ядро не трогает).
//
// Цельное оформление: тьма как НАСТРОЕНИЕ (фон-градиент + виньетка + центр-разлом),
// и силуэты фракций как РАЗНЫЕ СУЩНОСТИ:
//   D — массивный гранёный гексагон с раскалённым ядром (железо, тяжесть, разрушение);
//   V — округлый, полупрозрачный, с эфирным свечением (свет, спасение).
// Импакт-эффекты (effects.js) накладываются поверх (рябь V / земля D / тряска экрана).
// =============================================================================

const lerpC = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (a, b, t) => `rgb(${lerpC(a[0], b[0], t)},${lerpC(a[1], b[1], t)},${lerpC(a[2], b[2], t)})`;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function disc(x, y, rad, fill, stroke, w = 2) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  // --- атмосфера -----------------------------------------------------------
  function paintBackground(W, H, darkness) {
    const inner = mix([228, 231, 240], [24, 21, 32], darkness); // центр чуть светлее
    const outer = mix([203, 207, 220], [9, 8, 14], darkness);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(-16, -16, W + 32, H + 32);
  }

  function centerRift(cx, cy, darkness, time, jitter) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
    const R = jitter * (2.4 + pulse * 1.2);
    const a = 0.06 + darkness * 0.45;                 // в тьме разлом пылает
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(220,70,90,${a})`);
    g.addColorStop(0.45, `rgba(110,35,110,${a * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(180,80,120,${0.15 + darkness * 0.35})`;
    ctx.lineWidth = 1; disc(cx, cy, jitter, null, ctx.strokeStyle, 1);
  }

  function vignette(W, H, darkness) {
    const a = 0.12 + darkness * 0.6;                  // тьма «сжимается» с краёв
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, 'rgba(6,6,14,0)');
    g.addColorStop(1, `rgba(5,4,11,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // --- силуэты фракций -----------------------------------------------------
  function drawD(x, y, r) {                            // гексагон с раскалённым ядром
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, '#ff9a55'); g.addColorStop(0.55, '#e5484d'); g.addColorStop(1, '#7a1f24');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#2a1012'; ctx.stroke();
  }

  function drawV(x, y, r) {                            // эфирный, со свечением-ореолом
    const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.1);
    halo.addColorStop(0, 'rgba(95,209,255,0.32)'); halo.addColorStop(1, 'rgba(95,209,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    body.addColorStop(0, '#cdf1ff'); body.addColorStop(0.5, '#54b6ff'); body.addColorStop(1, '#2c74c8');
    ctx.globalAlpha = 0.92; ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(205,240,255,0.85)'; ctx.stroke();
  }

  function hpRing(p, x, y, r) {
    const frac = Math.max(0, p.hp / p.maxHp);
    ctx.beginPath();
    ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.lineWidth = 3;
    ctx.strokeStyle = frac > 0.4 ? '#5ee08a' : '#ff5a5f';
    ctx.stroke();
  }

  // --- кадр ----------------------------------------------------------------
  function draw(world, effects) {
    const W = world.cfg.world.width, H = world.cfg.world.height, d = world.darkness;
    const so = effects ? effects.screenOffset() : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(so.x, so.y);

    paintBackground(W, H, d);
    const cx = W / 2, cy = H / 2;
    centerRift(cx, cy, d, world.time, world.cfg.spawn.centerJitter);

    // зоны глушителя (§3) — мёртвая зона хила
    for (const e of world.enemies) {
      if (!e.alive || e.type !== 'suppressor') continue;
      const r = e.suppressRadius * (1 + d * e.suppressRadiusDarkGain);
      const g = ctx.createRadialGradient(e.pos.x, e.pos.y, r * 0.3, e.pos.x, e.pos.y, r);
      g.addColorStop(0, 'rgba(150,40,150,0.02)'); g.addColorStop(1, 'rgba(120,40,120,0.16)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(180,90,180,0.4)'; ctx.stroke();
    }

    if (effects) effects.drawGround(ctx);            // наземные ударные волны D

    // снаряды — энергичные точки со слабым свечением
    for (const pr of world.projectiles) {
      const c = pr.effect === 'damage' ? '255,210,63' : pr.effect === 'enemyShot' ? '255,85,102' : '82,255,184';
      const g = ctx.createRadialGradient(pr.pos.x, pr.pos.y, 0, pr.pos.x, pr.pos.y, pr.radius * 2.4);
      g.addColorStop(0, `rgba(${c},0.9)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pr.pos.x, pr.pos.y, pr.radius * 2.4, 0, Math.PI * 2); ctx.fill();
      disc(pr.pos.x, pr.pos.y, pr.radius * 0.7, `rgb(${c})`, null);
    }

    // враги — твари тьмы: цвет по типу, светлая кромка (читаемость на тёмном фоне)
    const ec = { swarm: '#34343f', fat: '#6e2f42', hunter: '#d9863b', ranged: '#5a59b0', suppressor: '#9a3d9a' };
    for (const e of world.enemies) {
      disc(e.pos.x, e.pos.y, e.radius, ec[e.type] || '#34343f', `rgba(220,210,230,${0.15 + d * 0.25})`, 1.5);
      if (e.markedUntil > world.time) disc(e.pos.x, e.pos.y, e.radius + 3, null, '#52ffb8', 2);
      if (e.type === 'fat') {
        const frac = Math.max(0, e.hp / e.maxHp);
        ctx.beginPath();
        ctx.arc(e.pos.x, e.pos.y, e.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      }
    }

    // игроки — силуэты фракций
    for (const p of world.players) {
      if (!p.alive) {
        ctx.strokeStyle = 'rgba(140,140,150,0.5)'; ctx.lineWidth = 2;
        const r = p.radius;
        ctx.beginPath();
        ctx.moveTo(p.pos.x - r, p.pos.y - r); ctx.lineTo(p.pos.x + r, p.pos.y + r);
        ctx.moveTo(p.pos.x + r, p.pos.y - r); ctx.lineTo(p.pos.x - r, p.pos.y + r);
        ctx.stroke();
        continue;
      }
      const fx = effects ? effects.entityFx(p.id) : { dx: 0, dy: 0, scale: 1 };
      const x = p.pos.x + fx.dx, y = p.pos.y + fx.dy, r = p.radius * fx.scale;

      if (p.pulseFx && world.time - p.pulseFx.t < 0.12) {       // конус Пульса D
        const pc = world.cfg.D.pulse, ang = Math.atan2(p.pulseFx.aim.y, p.pulseFx.aim.x);
        const alpha = 0.45 * (1 - (world.time - p.pulseFx.t) / 0.12);
        const g = ctx.createRadialGradient(x, y, 0, x, y, pc.range);
        g.addColorStop(0, `rgba(255,180,90,${alpha})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.arc(x, y, pc.range, ang - pc.coneHalfAngle, ang + pc.coneHalfAngle); ctx.closePath(); ctx.fill();
      }

      if (p.faction === 'D') drawD(x, y, r); else drawV(x, y, r);
      if (p.controlled) disc(x, y, r + 2, null, '#fff', 2);     // твой персонаж
      if (p.loadout.provoker) disc(x, y, r + 8, null, '#ffb454', 1.5); // аггро-роль §7
      hpRing(p, x, y, r);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(p.faction, x, y + 4);
    }

    if (effects) effects.drawOver(ctx);              // рябь V, свечение хила, смерти
    ctx.restore();

    vignette(W, H, d);                               // тьма сжимается с краёв (экранно)
    if (effects) effects.drawScreen(ctx, W, H);      // вспышка ярости §6
  }

  return { draw };
}

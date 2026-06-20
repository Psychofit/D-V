// =============================================================================
// renderer — НАМЕРЕННО примитивный рендер (визуал отложен на потом).
// Задача — видеть геймплей и канат, а не красоту: фон тонируется тьмой (видимая
// шкала §4), сущности — простые фигуры. Всё рисуется в мировых координатах 1:1.
// =============================================================================

const lerpC = (a, b, t) => Math.round(a + (b - a) * t);

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function bg(darkness) {
    // светлый мир (§4 "светел по построению") → тёмный
    const r = lerpC(228, 16, darkness);
    const g = lerpC(230, 16, darkness);
    const b = lerpC(238, 26, darkness);
    return `rgb(${r},${g},${b})`;
  }

  function disc(x, y, rad, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function hpRing(p, x, y, r) {
    const frac = Math.max(0, p.hp / p.maxHp);
    ctx.beginPath();
    ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.lineWidth = 3;
    ctx.strokeStyle = frac > 0.4 ? '#4ad66d' : '#e5484d';
    ctx.stroke();
  }

  function draw(world, effects) {
    const W = world.cfg.world.width, H = world.cfg.world.height;
    const so = effects ? effects.screenOffset() : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(so.x, so.y);
    ctx.fillStyle = bg(world.darkness);
    ctx.fillRect(-16, -16, W + 32, H + 32);

    // центр спавна (§7) — откуда давят враги
    const cx = W / 2, cy = H / 2;
    ctx.strokeStyle = `rgba(150,150,160,${0.25 + world.darkness * 0.4})`;
    ctx.lineWidth = 1;
    disc(cx, cy, world.cfg.spawn.centerJitter, null, ctx.strokeStyle);
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // зоны глушителя (§3) — "мёртвая зона" хила, под сущностями
    for (const e of world.enemies) {
      if (!e.alive || e.type !== 'suppressor') continue;
      const r = e.suppressRadius * (1 + world.darkness * e.suppressRadiusDarkGain);
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,40,120,0.10)';
      ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,80,170,0.4)'; ctx.stroke();
    }

    // НАЗЕМНЫЙ слой импакта (ударные волны/пыль D) — под сущностями
    if (effects) effects.drawGround(ctx);

    // снаряды: D-урон жёлтый, V-хил/площадь зелёный, вражеский — красный (входящая угроза)
    for (const pr of world.projectiles) {
      const c = pr.effect === 'damage' ? '#ffd23f' : pr.effect === 'enemyShot' ? '#ff5566' : '#52ffb8';
      disc(pr.pos.x, pr.pos.y, pr.radius, c, null);
    }

    // враги: цвет по типу (§3). рой/толстяк/охотник/дальнобой/глушитель
    const enemyColor = {
      swarm: '#3a3a44', fat: '#6e2f42', hunter: '#d9863b', ranged: '#5a59b0', suppressor: '#9a3d9a',
    };
    for (const e of world.enemies) {
      disc(e.pos.x, e.pos.y, e.radius, enemyColor[e.type] || '#3a3a44', '#000');
      if (e.markedUntil > world.time) {            // метка V (§2): D бьёт сильнее
        ctx.beginPath();
        ctx.arc(e.pos.x, e.pos.y, e.radius + 3, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = '#52ffb8'; ctx.stroke();
      }
      if (e.type === 'fat') {                       // полоска hp толстяка — виден фокус D
        const frac = Math.max(0, e.hp / e.maxHp);
        ctx.beginPath();
        ctx.arc(e.pos.x, e.pos.y, e.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      }
    }

    // игроки
    for (const p of world.players) {
      if (!p.alive) {
        ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
        const r = p.radius;
        ctx.beginPath();
        ctx.moveTo(p.pos.x - r, p.pos.y - r); ctx.lineTo(p.pos.x + r, p.pos.y + r);
        ctx.moveTo(p.pos.x + r, p.pos.y - r); ctx.lineTo(p.pos.x - r, p.pos.y + r);
        ctx.stroke();
        continue;
      }
      // импакт-фактура (§визуал): V дрожит (jitter), D — стальной вес-пульс масштаба
      const fx = effects ? effects.entityFx(p.id) : { dx: 0, dy: 0, scale: 1 };
      const x = p.pos.x + fx.dx, y = p.pos.y + fx.dy, r = p.radius * fx.scale;

      // конус Пульса D (§2) — транзиентный след
      if (p.pulseFx && world.time - p.pulseFx.t < 0.12) {
        const pc = world.cfg.D.pulse;
        const ang = Math.atan2(p.pulseFx.aim.y, p.pulseFx.aim.x);
        const alpha = 0.4 * (1 - (world.time - p.pulseFx.t) / 0.12);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, pc.range, ang - pc.coneHalfAngle, ang + pc.coneHalfAngle);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,210,63,${alpha})`;
        ctx.fill();
      }
      const fill = p.faction === 'D' ? '#e5484d' : '#3e9bff';
      disc(x, y, r, fill, p.controlled ? '#fff' : '#0008');
      if (p.loadout.provoker) {                 // аггро-роль §7 — оранжевое кольцо
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#d9863b'; ctx.stroke();
      }
      hpRing(p, x, y, r);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.faction, x, y + 4);
    }

    // ВЕРХНИЙ слой импакта (рябь V, свечение хила, попадания, смерти) — над сущностями
    if (effects) effects.drawOver(ctx);
    ctx.restore();
    // полноэкранная вспышка ярости §6 (не трясётся вместе с миром)
    if (effects) effects.drawScreen(ctx, W, H);
  }

  return { draw };
}

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

  function hpRing(p) {
    const frac = Math.max(0, p.hp / p.maxHp);
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.lineWidth = 3;
    ctx.strokeStyle = frac > 0.4 ? '#4ad66d' : '#e5484d';
    ctx.stroke();
  }

  function draw(world) {
    const W = world.cfg.world.width, H = world.cfg.world.height;
    ctx.fillStyle = bg(world.darkness);
    ctx.fillRect(0, 0, W, H);

    // центр спавна (§7) — откуда давят враги
    const cx = W / 2, cy = H / 2;
    ctx.strokeStyle = `rgba(150,150,160,${0.25 + world.darkness * 0.4})`;
    ctx.lineWidth = 1;
    disc(cx, cy, world.cfg.spawn.centerJitter, null, ctx.strokeStyle);
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // снаряды
    for (const pr of world.projectiles) {
      disc(pr.pos.x, pr.pos.y, pr.radius,
        pr.effect === 'damage' ? '#ffd23f' : '#52ffb8', null);
    }

    // враги (толстяк §2 — крупнее и иного цвета)
    for (const e of world.enemies) {
      disc(e.pos.x, e.pos.y, e.radius, e.type === 'fat' ? '#6e2f42' : '#3a3a44', '#000');
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
      const fill = p.faction === 'D' ? '#e5484d' : '#3e9bff';
      disc(p.pos.x, p.pos.y, p.radius, fill, p.controlled ? '#fff' : '#0008');
      hpRing(p);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.faction, p.pos.x, p.pos.y + 4);
    }
  }

  return { draw };
}

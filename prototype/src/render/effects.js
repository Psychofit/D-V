// =============================================================================
// effects — браузерный слой ИМПАКТА (game-feel). Сим-ядро не трогает (детерминизм
// и headless-производительность сохранены): эффекты рождаются ДИФФИНГОМ состояния
// мира между кадрами (упал hp → урон, вырос → хил, исчез враг → смерть).
//
// Фракционная фактура (ключевая идея): D и V принимают урон ПРОТИВОПОЛОЖНО —
//   V — хрупкие: силуэт ДРОЖИТ и расходится РЯБЬЮ (эфирные).
//   D — стальные колоссы: сами не дрогнут (короткий «вес»-пульс), а ЗЕМЛЯ вокруг
//       подрагивает (наземная ударная волна + пыль). Экран трясёт от СВОИХ ударов.
// =============================================================================

const rnd = (a, b) => a + Math.random() * (b - a);

export function createEffects() {
  let parts = [];                 // частицы: {style, layer, x,y, r,vr, life,maxLife, color,width, vx,vy,grav}
  const entFx = new Map();        // id -> {kind:'jitter'|'pulse', mag, t, maxT}
  let shake = 0;                  // тряска экрана (затухает)
  let flash = 0;                  // полноэкранная вспышка ярости (§6)
  const prevHp = new Map();       // id -> hp (игроки)
  const prevEnemies = new Map();  // id -> {x,y,type}
  let furySeen = false;
  let lastPulseT = -1;            // антидубль Пульса по кадрам

  const add = (p) => { if (parts.length < 400) parts.push(p); };

  function ripple(x, y, color, n, baseR, speed) { // расходящиеся кольца (рябь V)
    for (let i = 0; i < n; i++) {
      add({ style: 'ring', layer: 'over', x, y, r: baseR + i * 6, vr: speed, life: 0.5, maxLife: 0.5, color, width: 2 });
    }
  }
  function groundRing(x, y, mag) {                // наземная ударная волна (D)
    add({ style: 'ring', layer: 'ground', x, y, r: 8, vr: 240 + mag * 60, life: 0.45, maxLife: 0.45, color: '180,150,110', width: 3 });
    for (let i = 0; i < 5 + mag * 2; i++) {       // пыль
      const a = rnd(0, Math.PI * 2), s = rnd(40, 120 + mag * 30);
      add({ style: 'dot', layer: 'ground', x, y, r: rnd(1.5, 3), vr: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 120, life: 0.5, maxLife: 0.5, color: '160,135,100' });
    }
  }
  function glow(x, y, color, r0) {                // мягкое свечение (хил)
    add({ style: 'glow', layer: 'over', x, y, r: r0, vr: 30, life: 0.4, maxLife: 0.4, color, width: 0 });
  }
  function pop(x, y, big) {                        // смерть врага
    add({ style: 'ring', layer: 'over', x, y, r: 4, vr: big ? 260 : 150, life: 0.35, maxLife: 0.35, color: big ? '230,120,120' : '170,170,180', width: 2 });
    for (let i = 0; i < (big ? 10 : 5); i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(50, big ? 220 : 120);
      add({ style: 'dot', layer: 'over', x, y, r: rnd(1, big ? 3 : 2), vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 0, life: 0.35, maxLife: 0.35, color: big ? '210,110,110' : '150,150,160' });
    }
  }

  function setEnt(id, kind, mag, maxT) { entFx.set(id, { kind, mag, t: maxT, maxT }); }

  function onPlayerDamage(p, dmg, isHuman) {
    const mag = Math.min(1.5, dmg / 18);
    if (p.faction === 'V') {                       // хрупкий: дрожь + рябь
      setEnt(p.id, 'jitter', 2 + mag * 4, 0.28);
      ripple(p.pos.x, p.pos.y, '90,170,255', 2, p.radius + 2, 120 + mag * 80);
    } else {                                        // стальной колосс: вес-пульс + земля
      setEnt(p.id, 'pulse', mag, 0.22);
      groundRing(p.pos.x, p.pos.y, mag);
      if (isHuman) shake = Math.max(shake, 5 + mag * 6);
    }
  }
  function onPlayerHeal(p, amt) {
    glow(p.pos.x, p.pos.y, '82,255,184', p.radius + 4);
  }

  function observe(world, humanId) {
    for (const p of world.players) {
      const prev = prevHp.get(p.id);
      if (prev !== undefined && p.alive) {
        const d = p.hp - prev;
        if (d < -0.5) onPlayerDamage(p, -d, p.id === humanId);
        else if (d > 0.5) onPlayerHeal(p, d);
      }
      prevHp.set(p.id, p.alive ? p.hp : prev);
    }
    // смерти врагов
    const cur = new Map();
    for (const e of world.enemies) cur.set(e.id, e);
    for (const [id, e] of prevEnemies) {
      if (!cur.has(id)) pop(e.x, e.y, e.type === 'fat');
    }
    prevEnemies.clear();
    for (const e of world.enemies) prevEnemies.set(e.id, { x: e.pos.x, y: e.pos.y, type: e.type });
    // Пульс игрока-человека → тряска + земля (одно срабатывание на удар)
    const hp = world.players.find((p) => p.id === humanId);
    if (hp && hp.pulseFx && hp.pulseFx.t !== lastPulseT && world.time - hp.pulseFx.t < 0.2) {
      lastPulseT = hp.pulseFx.t;
      shake = Math.max(shake, 6); groundRing(hp.pos.x, hp.pos.y, 1);
    }
    // вспышка ярости §6 (все V мертвы)
    if (world.fury && !furySeen) { furySeen = true; flash = 1; }
    if (!world.fury) furySeen = false;
  }

  function update(dt) {
    for (const p of parts) {
      p.life -= dt;
      if (p.vr) p.r += p.vr * dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.grav) p.vy += p.grav * dt; }
    }
    parts = parts.filter((p) => p.life > 0);
    for (const [id, f] of entFx) { f.t -= dt; if (f.t <= 0) entFx.delete(id); }
    shake = Math.max(0, shake - dt * 40);
    flash = Math.max(0, flash - dt * 1.5);
  }

  // смещение/масштаб сущности: V дрожит (jitter), D — короткий вес-пульс масштаба
  function entityFx(id) {
    const f = entFx.get(id);
    if (!f) return { dx: 0, dy: 0, scale: 1 };
    const k = f.t / f.maxT;
    if (f.kind === 'jitter') return { dx: rnd(-1, 1) * f.mag * k, dy: rnd(-1, 1) * f.mag * k, scale: 1 };
    return { dx: 0, dy: 0, scale: 1 + 0.22 * f.mag * k }; // вес-пульс: мгновенный, спадает к 1
  }
  function screenOffset() {
    if (shake < 0.1) return { x: 0, y: 0 };
    return { x: rnd(-1, 1) * shake, y: rnd(-1, 1) * shake };
  }

  function drawLayer(ctx, layer) {
    for (const p of parts) {
      if (p.layer !== layer) continue;
      const a = Math.max(0, p.life / p.maxLife);
      if (p.style === 'ring') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${p.color},${a})`; ctx.lineWidth = p.width * a; ctx.stroke();
      } else if (p.style === 'glow') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(${p.color},${0.5 * a})`); g.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else { // dot
        ctx.fillStyle = `rgba(${p.color},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawScreen(ctx, w, h) {
    if (flash <= 0) return;
    ctx.fillStyle = `rgba(229,72,77,${0.35 * flash})`; ctx.fillRect(0, 0, w, h);
  }

  return {
    observe, update, entityFx, screenOffset,
    drawGround: (ctx) => drawLayer(ctx, 'ground'),
    drawOver: (ctx) => drawLayer(ctx, 'over'),
    drawScreen,
  };
}

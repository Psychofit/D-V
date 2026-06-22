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

  function riftHazard(cx, cy, darkness, time, rc) {   // §7: видимо ОПАСНАЯ зона разлома (анти-кемп)
    const r = rc.radius * (1 + darkness * rc.radiusDarkGain);
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(229,72,77,0)');
    g.addColorStop(0.7, `rgba(229,72,77,${0.04 + darkness * 0.06})`);
    g.addColorStop(1, `rgba(255,80,90,${0.1 + darkness * 0.12})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(time * 0.5);   // пульсирующая опасная кромка
    ctx.strokeStyle = `rgba(255,90,100,${0.4 + pulse * 0.35})`;
    ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
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

  // --- твари тьмы: силуэт по типу (роль читается формой) -------------------
  // Рой массовый → дёшево (без градиентов); редкие крупные типы — богаче.
  // Анимация: фаза по e.id, ориентация по e.vel; в тьме кромки/ядра ярче (§3).
  function polyTo(pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawSwarm(e, d, t) {            // осколок роя: мелкий, гранёный, вертится
    const r = e.radius;
    ctx.save(); ctx.translate(e.pos.x, e.pos.y); ctx.rotate(t * 1.3 + e.id);
    const pts = [];
    for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3, rad = i % 2 ? r * 0.45 : r * 1.15; pts.push([Math.cos(an) * rad, Math.sin(an) * rad]); }
    polyTo(pts);
    ctx.fillStyle = '#2b2b36'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(150,150,205,${0.3 + d * 0.45})`; ctx.stroke();
    disc(0, 0, r * 0.26, `rgba(180,180,225,${0.4 + d * 0.45})`, null);
    ctx.restore();
  }

  function drawFat(e, d, t) {              // бронированный исполин: гранёная туша, раскалённая трещина, дышит
    const r = e.radius * (1 + Math.sin(t * 1.6 + e.id) * 0.03);
    ctx.save(); ctx.translate(e.pos.x, e.pos.y);
    const pts = [];
    for (let i = 0; i < 8; i++) { const an = Math.PI / 8 + i * Math.PI / 4; pts.push([Math.cos(an) * r, Math.sin(an) * r]); }
    polyTo(pts);
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, '#7a2236'); g.addColorStop(1, '#37121d');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#190a0f'; ctx.stroke();
    ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(18,8,12,0.7)';   // бронешвы
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(an) * r * 0.34, Math.sin(an) * r * 0.34); ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); ctx.stroke(); }
    const ca = 0.4 + d * 0.5 + Math.sin(t * 1.6 + e.id) * 0.12;   // ядро пышет в тьме
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
    cg.addColorStop(0, `rgba(255,150,90,${ca})`); cg.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHunter(e, d) {              // клин-охотник: стреловидный, по вектору рывка, со смазкой
    const sp = Math.hypot(e.vel.x, e.vel.y), r = e.radius;
    ctx.save(); ctx.translate(e.pos.x, e.pos.y); ctx.rotate(sp > 1 ? Math.atan2(e.vel.y, e.vel.x) : 0);
    if (sp > 1) {                                    // хвост-смазка по ходу
      const lg = ctx.createLinearGradient(0, 0, -r * 2.6, 0);
      lg.addColorStop(0, `rgba(224,150,74,${0.35 + d * 0.2})`); lg.addColorStop(1, 'rgba(224,150,74,0)');
      ctx.fillStyle = lg; polyTo([[-r * 0.2, -r * 0.5], [-r * 2.6, 0], [-r * 0.2, r * 0.5]]); ctx.fill();
    }
    polyTo([[r * 1.45, 0], [-r * 0.6, -r * 0.95], [-r * 0.1, 0], [-r * 0.6, r * 0.95]]); // ласточкин хвост
    ctx.fillStyle = '#251a10'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(232,152,72,${0.6 + d * 0.4})`; ctx.stroke();
    disc(r * 0.45, 0, r * 0.2, `rgba(255,185,95,${0.7 + d * 0.3})`, null); // горящий глаз у острия
    ctx.restore();
  }

  function drawRanged(e, d, t, world) {    // глаз-дальнобой: парящее око; зрачок смотрит на жертву и разгорается перед выстрелом
    const tgt = e.targetId != null ? world.players.find((p) => p.id === e.targetId) : null;
    const lx = tgt ? tgt.pos.x - e.pos.x : e.vel.x, ly = tgt ? tgt.pos.y - e.pos.y : e.vel.y;
    const r = e.radius;
    ctx.save(); ctx.translate(e.pos.x, e.pos.y); ctx.rotate(Math.atan2(ly, lx) || 0);
    ctx.beginPath();                                 // миндалевидное веко
    ctx.moveTo(-r * 1.45, 0); ctx.quadraticCurveTo(0, -r * 1.05, r * 1.45, 0); ctx.quadraticCurveTo(0, r * 1.05, -r * 1.45, 0); ctx.closePath();
    ctx.fillStyle = '#1b1b30'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(120,118,205,${0.5 + d * 0.4})`; ctx.stroke();
    const ready = 1 - Math.min(1, e.attackCooldown / 0.5); // ~0.5с разгорания перед выстрелом
    disc(r * 0.5, 0, r * 0.5, 'rgba(140,130,255,0.22)', null);
    disc(r * 0.55, 0, r * 0.3, `rgba(195,175,255,${0.55 + ready * 0.45})`, null);
    ctx.restore();
  }

  function drawSuppressor(e, d, t) {       // глушащая клякса: аморфная, пульсирует, ядро-пустота гасит свет
    const r = e.radius * (1 + Math.sin(t * 2 + e.id) * 0.05), N = 16;
    ctx.save(); ctx.translate(e.pos.x, e.pos.y);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const an = i / N * Math.PI * 2;
      const rr = r * (1 + 0.16 * Math.sin(an * 3 + t * 2 + e.id) + 0.08 * Math.sin(an * 5 - t * 1.3));
      i ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.2);
    g.addColorStop(0, '#5e2160'); g.addColorStop(1, '#2a1030');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(190,90,200,${0.4 + d * 0.4})`; ctx.stroke();
    const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);  // пустота, гасящая свет
    hole.addColorStop(0, 'rgba(4,2,7,0.92)'); hole.addColorStop(1, 'rgba(4,2,7,0)');
    ctx.fillStyle = hole; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const enemyDraw = { swarm: drawSwarm, fat: drawFat, hunter: drawHunter, ranged: drawRanged, suppressor: drawSuppressor };

  // --- босс «Сомнения» (§босс): многогранник + кольца-щиты с брешами ---------
  function drawBossRing(x, y, r) {                  // солид-щит + бреши: красная (D), синяя (V) напротив
    const gh = r.gapHalf, dGap = r.angle, vGap = r.angle + Math.PI;
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(95,85,115,0.55)';   // солидные дуги между брешами
    ctx.beginPath(); ctx.arc(x, y, r.radius, dGap + gh, vGap - gh); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r.radius, vGap + gh, dGap - gh + Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 8;                                             // бреши-окна (куда бить)
    ctx.strokeStyle = 'rgba(229,72,77,0.95)';
    ctx.beginPath(); ctx.arc(x, y, r.radius, dGap - gh, dGap + gh); ctx.stroke();
    ctx.strokeStyle = 'rgba(84,182,255,0.95)';
    ctx.beginPath(); ctx.arc(x, y, r.radius, vGap - gh, vGap + gh); ctx.stroke();
  }

  function drawBoss(world) {
    const b = world.boss, x = b.pos.x, y = b.pos.y, t = world.time, N = 48;
    ctx.beginPath();                                 // гладко извивающееся тело (амёба)
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      // радиус как функция УГЛА на ЦЕЛЫХ гармониках → шов на a=2π сходится с a=0 без разрыва;
      // время двигает фазы гармоник → плавное извивание, а не дёрганые вершины
      const rr = b.radius * (1
        + 0.10 * Math.sin(3 * a + t * 1.3)
        + 0.06 * Math.sin(5 * a - t * 1.0)
        + 0.04 * Math.sin(2 * a + t * 0.6));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(x, y, 4, x, y, b.radius * 1.2);
    g.addColorStop(0, '#3a1430'); g.addColorStop(0.6, '#1c0d22'); g.addColorStop(1, '#0a0512');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(150,60,140,0.6)'; ctx.stroke();
    const hit = b.hitFx && t - b.hitFx.t < 0.12 ? 0.5 : 0;        // мигание ядра при попадании
    const core = 0.5 + 0.5 * Math.sin(t * 2.2) + hit;
    const cg = ctx.createRadialGradient(x, y, 0, x, y, b.radius * 0.55);
    cg.addColorStop(0, `rgba(225,85,125,${0.5 + core * 0.4})`); cg.addColorStop(1, 'rgba(120,30,90,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, b.radius * 0.55, 0, Math.PI * 2); ctx.fill();
    for (const r of b.rings) drawBossRing(x, y, r);
  }

  function drawBossOverlay(world, W, H) {            // экранно: драм-имя при появлении + полоса hp
    const b = world.boss, introT = world.time - b.spawnT, dur = world.cfg.boss.introSeconds;
    let a = 0;
    if (b.phase === 'intro') a = introT < 0.5 ? introT / 0.5 : introT > dur - 1 ? Math.max(0, dur - introT) : 1;
    if (a > 0) {
      ctx.fillStyle = `rgba(6,4,10,${a * 0.5})`; ctx.fillRect(0, 0, W, H); // драм-затемнение сцены
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(180,40,80,0.85)'; ctx.shadowBlur = 32;       // зловещее свечение имени
      ctx.fillStyle = `rgba(240,220,232,${a})`; ctx.font = 'bold 120px Georgia, serif';
      ctx.fillText(b.name, W / 2, H / 2 - 8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(212,142,168,${a * 0.95})`; ctx.font = 'italic 46px Georgia, serif';
      ctx.fillText(b.subtitle, W / 2, H / 2 + 74);
    }
    if (b.phase === 'active') {
      const bw = W * 0.5, bx = (W - bw) / 2, by = 40, bh = 16;
      ctx.fillStyle = 'rgba(10,8,14,0.7)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#2a1020'; ctx.fillRect(bx, by, bw, bh);
      const lg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      lg.addColorStop(0, '#7a1f4a'); lg.addColorStop(1, '#e5484d');
      ctx.fillStyle = lg; ctx.fillRect(bx, by, bw * Math.max(0, b.hp / b.maxHp), bh);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8e2'; ctx.font = 'bold 20px monospace';
      ctx.fillText(b.name, W / 2, by + bh + 22);
    }
    ctx.textAlign = 'left';
  }

  // маркер управляемого игрока: пульсирующее кольцо + подпрыгивающий шеврон над головой
  function youMarker(x, y, r, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.45})`;
    ctx.beginPath(); ctx.arc(x, y, r + 5 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    const cy0 = y - r - 13 - Math.sin(t * 4) * 3;     // шеврон вниз (указывает на тебя), подпрыгивает
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x, cy0 + 8); ctx.lineTo(x - 6, cy0 - 3); ctx.lineTo(x + 6, cy0 - 3); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  }

  // миникарта (правый-нижний угол): весь мир + враги/босс/союзники, ТЫ — ярко, рамка вида камеры
  function drawMinimap(world, cam, VW, VH) {
    const W = world.cfg.world.width, H = world.cfg.world.height;
    const mw = 190, mh = mw * H / W, mx = VW - mw - 14, my = VH - mh - 14, s = mw / W;
    const px = (wx) => mx + wx * s, py = (wy) => my + wy * s;
    ctx.fillStyle = 'rgba(10,9,16,0.72)'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(120,120,150,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = 'rgba(229,72,90,0.5)'; ctx.beginPath(); ctx.arc(px(W / 2), py(H / 2), 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(205,95,95,0.85)';
    for (const e of world.enemies) if (e.alive) ctx.fillRect(px(e.pos.x) - 1, py(e.pos.y) - 1, 2, 2);
    if (world.boss) { ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(px(world.boss.pos.x), py(world.boss.pos.y), 5, 0, Math.PI * 2); ctx.fill(); }
    for (const p of world.players) {
      if (!p.alive || p.controlled) continue;
      ctx.fillStyle = p.faction === 'D' ? 'rgba(229,100,107,0.9)' : 'rgba(95,191,230,0.9)';
      ctx.beginPath(); ctx.arc(px(p.pos.x), py(p.pos.y), 1.7, 0, Math.PI * 2); ctx.fill();
    }
    const vw2 = cam.vw / (2 * cam.zoom), vh2 = cam.vh / (2 * cam.zoom); // рамка «что на экране»
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(px(cam.x - vw2), py(cam.y - vh2), vw2 * 2 * s, vh2 * 2 * s);
    const me = world.players.find((p) => p.controlled && p.alive);
    if (me) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px(me.pos.x), py(me.pos.y), 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(me.pos.x), py(me.pos.y), 6, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // --- кадр ----------------------------------------------------------------
  function draw(world, effects, camera) {
    const W = world.cfg.world.width, H = world.cfg.world.height, d = world.darkness;
    const cam = camera || { x: W / 2, y: H / 2, zoom: 1, vw: W, vh: H }; // headless: весь мир
    const VW = cam.vw, VH = cam.vh;
    const so = effects ? effects.screenOffset() : { x: 0, y: 0 };

    ctx.fillStyle = '#0a0a0f'; ctx.fillRect(0, 0, VW, VH);   // база вне мира
    ctx.save();                                              // --- мировой слой под камерой ---
    ctx.translate(VW / 2 + so.x, VH / 2 + so.y);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    paintBackground(W, H, d);
    const cx = W / 2, cy = H / 2;
    centerRift(cx, cy, d, world.time, world.cfg.spawn.centerJitter);
    if (!world.boss && world.cfg.rift) riftHazard(cx, cy, d, world.time, world.cfg.rift);

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
    if (world.boss) drawBoss(world);                 // §босс: тело + кольца-щиты (под пулями/игроками)

    // снаряды — со следом (motion-blur), свечением и ядром
    for (const pr of world.projectiles) {
      const c = pr.effect === 'damage' ? '255,210,63' : pr.effect === 'enemyShot' ? '255,85,102' : '82,255,184';
      const sp = Math.hypot(pr.vel.x, pr.vel.y) || 1;
      const len = Math.min(34, sp * 0.05);
      const tx = pr.pos.x - (pr.vel.x / sp) * len, ty = pr.pos.y - (pr.vel.y / sp) * len;
      const lg = ctx.createLinearGradient(pr.pos.x, pr.pos.y, tx, ty);
      lg.addColorStop(0, `rgba(${c},0.55)`); lg.addColorStop(1, `rgba(${c},0)`);
      ctx.strokeStyle = lg; ctx.lineWidth = pr.radius * 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pr.pos.x, pr.pos.y); ctx.lineTo(tx, ty); ctx.stroke();
      const g = ctx.createRadialGradient(pr.pos.x, pr.pos.y, 0, pr.pos.x, pr.pos.y, pr.radius * 2.4);
      g.addColorStop(0, `rgba(${c},0.9)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pr.pos.x, pr.pos.y, pr.radius * 2.4, 0, Math.PI * 2); ctx.fill();
      disc(pr.pos.x, pr.pos.y, pr.radius * 0.7, `rgb(${c})`, null);
    }

    // враги — твари тьмы: силуэт по типу (роль читается формой) + игровые подсказки
    for (const e of world.enemies) {
      (enemyDraw[e.type] || drawSwarm)(e, d, world.time, world);
      if (e.markedUntil > world.time) {              // метка V (§2): вращающийся ретикл «взято на мушку»
        ctx.save(); ctx.translate(e.pos.x, e.pos.y); ctx.rotate(world.time * 1.6);
        ctx.strokeStyle = '#52ffb8'; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, e.radius + 6, i * Math.PI / 2 - 0.32, i * Math.PI / 2 + 0.32); ctx.stroke(); }
        ctx.restore();
      }
      if (e.type === 'fat') {                         // порог-дуга hp толстяка (за потолком V — добивает D §2)
        const frac = Math.max(0, e.hp / e.maxHp);
        ctx.beginPath();
        ctx.arc(e.pos.x, e.pos.y, e.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
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
      if (p.loadout.provoker) disc(x, y, r + 8, null, '#ffb454', 1.5); // аггро-роль §7
      if (p.controlled) youMarker(x, y, r, world.time);        // твой персонаж — кольцо + шеврон
      hpRing(p, x, y, r);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(p.faction, x, y + 4);
    }

    if (effects) effects.drawOver(ctx);              // рябь V, свечение хила, смерти
    ctx.restore();                                   // --- конец мирового слоя ---

    vignette(VW, VH, d);                             // тьма сжимается с краёв (экранно)
    if (world.boss) drawBossOverlay(world, VW, VH);  // §босс: драм-имя + полоса hp (экранно)
    if (effects) effects.drawScreen(ctx, VW, VH);    // вспышка ярости §6
    drawMinimap(world, cam, VW, VH);                 // обзор всей арены + «ты»
  }

  return { draw };
}

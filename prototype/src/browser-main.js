// =============================================================================
// browser-main — играбельная оболочка прототипа (фигуры-плейсхолдеры, §визуал позже).
// Боты ведут обе стороны; можно "вселиться" в D или V и щупать канат руками —
// проверить ставку §10: тянет ли своекорыстная игра к равновесию.
// =============================================================================

import { CONFIG } from './config.js';
import { createWorld, stepWorld } from './sim/world.js';
import { fireProjectile, pulseAttack } from './sim/combat.js';
import { createRenderer } from './render/renderer.js';
import { createHud } from './render/hud.js';
import { createRecorder } from './telemetry/recorder.js';

const cfg = structuredClone(CONFIG); // локальная глубокая копия (тумблеры живые, общий CONFIG не трогаем)
const canvas = document.getElementById('game');
canvas.width = cfg.world.width;
canvas.height = cfg.world.height;

const renderer = createRenderer(canvas);
const hud = createHud(document.getElementById('hud'));

let world, recorder;
function reset() {
  world = createWorld(cfg, (Math.random() * 1e9) | 0);
  recorder = createRecorder(0.5);
  recorder.maybeSample(world);
}
reset();

// --- управление и "вселение" ------------------------------------------------
let paused = false;
let speed = 1;
let possessed = null;             // 'D' | 'V' | null
const keys = new Set();
const mouse = { x: cfg.world.width / 2, y: cfg.world.height / 2, down: false };

function controlledPlayer() {
  if (!possessed) return null;
  return world.players.find((p) => p.faction === possessed && p.alive) || null;
}

function applyInput() {
  // снять флаг controlled со всех, выставить только текущему
  for (const p of world.players) p.controlled = false;
  const p = controlledPlayer();
  if (!p) return;
  p.controlled = true;

  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  const l = Math.hypot(dx, dy);
  p.vel = l > 0 ? { x: (dx / l) * p.speed, y: (dy / l) * p.speed } : { x: 0, y: 0 };

  if (mouse.down) {
    const aim = { x: mouse.x - p.pos.x, y: mouse.y - p.pos.y };
    if (aim.x || aim.y) {
      if (p.faction === 'D' && cfg.D.weapon === 'pulse') pulseAttack(world, p, aim);
      else fireProjectile(world, p, aim);
    }
  }
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === '1') possessed = 'D';
  else if (k === '2') possessed = 'V';
  else if (k === '0') possessed = null;
  else if (k === ' ') { paused = !paused; e.preventDefault(); }
  else keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
}
canvas.addEventListener('mousemove', toWorld);
canvas.addEventListener('mousedown', (e) => { toWorld(e); mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; });

// кнопки/тумблеры
const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
bind('btn-pause', () => { paused = !paused; });
bind('btn-reset', () => reset());
bind('btn-speed', (e) => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; e.target.textContent = `скорость ×${speed}`; });
document.getElementById('chk-responsive')?.addEventListener('change', (e) => {
  cfg.ai.dDarkStopAt = e.target.checked ? 0.6 : 2.0; // живой тумблер отзывчивого D (§10)
});

// --- цикл с фиксированным шагом ---------------------------------------------
const dt = cfg.world.dt;
let acc = 0, prev = performance.now();
function frame(now) {
  const real = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  if (!paused) {
    acc += real * speed;
    let steps = 0;
    while (acc >= dt && steps < 8 * speed) {
      applyInput();
      stepWorld(world, dt);
      recorder.maybeSample(world);
      acc -= dt; steps++;
    }
  }
  renderer.draw(world);
  hud.update(world, recorder);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

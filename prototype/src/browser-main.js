// =============================================================================
// browser-main — играбельная оболочка прототипа (фигуры-плейсхолдеры, §визуал позже).
// Боты ведут обе стороны; можно "вселиться" в D или V и щупать канат руками —
// проверить ставку §10: тянет ли своекорыстная игра к равновесию.
// =============================================================================

import { CONFIG } from './config.js';
import { createWorld, stepWorld } from './sim/world.js';
import { fireProjectile, pulseAttack } from './sim/combat.js';
import { createRenderer } from './render/renderer.js';
import { createEffects } from './render/effects.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './render/hud.js';
import { createRecorder } from './telemetry/recorder.js';
import {
  ACHIEVEMENTS, availableBuilds, loadProgress, saveProgress, resetProgress,
  checkNewAchievements, applyAchievement,
} from './progression/achievements.js';

const cfg = structuredClone(CONFIG); // локальная глубокая копия (тумблеры живые, общий CONFIG не трогаем)
const canvas = document.getElementById('game');
canvas.width = cfg.world.width;
canvas.height = cfg.world.height;

const renderer = createRenderer(canvas);
const effects = createEffects();
const audio = createAudio();
const hud = createHud(document.getElementById('hud'));

let world, recorder;
let breatherShown = false, breatherAt = 0; // §передышка: окно прокачки после босса (раз за сессию)
function reset() {
  world = createWorld(cfg, (Math.random() * 1e9) | 0);
  recorder = createRecorder(0.5);
  recorder.maybeSample(world);
  effects.reset();   // сбросить диффы прошлого мира → без всплеска ложных смертей/звуков
  breatherShown = false; breatherAt = 0;
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
      if (p.faction === 'D' && p.loadout.weapon === 'pulse') pulseAttack(world, p, aim);
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
bind('btn-sound', (e) => {                              // тумблер звука (включается жестом — autoplay-политика)
  const on = audio.setEnabled(!audio.isEnabled());
  e.target.textContent = `звук: ${on ? 'вкл' : 'выкл'}`;
  e.target.classList.toggle('on', on);
});
document.getElementById('chk-responsive')?.addEventListener('change', (e) => {
  cfg.ai.dDarkStopAt = e.target.checked ? 0.6 : 2.0; // живой тумблер отзывчивого D (§10)
});

// --- меню билда и ачивки (§8) -----------------------------------------------
let progress = loadProgress();
const human = { faction: 'D', weapon: 'shot', provoker: false, heal: 'area' };
const overlay = document.getElementById('menu-overlay');

function fixHumanBuild() {
  const av = availableBuilds(human.faction, progress);
  if (human.faction === 'D') {
    if (!av.weapons.includes(human.weapon)) human.weapon = 'shot';
    if (!av.canAggro) human.provoker = false;
  } else if (!av.heals.includes(human.heal)) human.heal = 'area';
}

function chip(cls, sel, locked, label, sub, data) {
  return `<div class="chip ${cls} ${sel ? 'sel' : ''} ${locked ? 'locked' : ''}" ${data}>` +
    `${label}${locked ? ' 🔒' : ''}<small>${sub}</small></div>`;
}

// глифы силуэтов (эхо игровых сущностей): D — гранёный гексагон с ядром, V — круг с ореолом
const GLYPH_D = '<svg viewBox="0 0 34 34" width="30" height="30">' +
  '<polygon points="29.1,24 17,31 4.9,24 4.9,10 17,3 29.1,10" fill="#e5484d" stroke="#2a1012" stroke-width="2"/>' +
  '<circle cx="17" cy="17" r="4.5" fill="#ff9a55"/></svg>';
const GLYPH_V = '<svg viewBox="0 0 34 34" width="30" height="30">' +
  '<circle cx="17" cy="17" r="15" fill="#54b6ff" fill-opacity="0.16"/>' +
  '<circle cx="17" cy="17" r="9.5" fill="#54b6ff" stroke="#cdf0ff" stroke-width="1.4" stroke-opacity="0.85"/>' +
  '<circle cx="13.5" cy="13.5" r="2.6" fill="#eaf8ff" fill-opacity="0.8"/></svg>';

function facCard(fac, sel, glyph, title, sub) {
  return `<div class="fac ${fac} ${sel ? 'sel' : ''}" data-fac="${fac}">` +
    `<span class="fac-g">${glyph}</span>` +
    `<span class="fac-tx"><b>${title}</b><small>${sub}</small></span></div>`;
}

function renderMenu() {
  fixHumanBuild();
  const av = availableBuilds(human.faction, progress);
  const isD = human.faction === 'D';
  let html = `<div class="menu-row"><div class="lbl">Фракция — раздельные пулы ачивок §8</div><div class="fac-tabs">` +
    facCard('D', isD, GLYPH_D, 'D — уничтожать', 'высокий урон, жизнь в руках V') +
    facCard('V', !isD, GLYPH_V, 'V — спасать', 'хил-экономика, легче на старте §9') + `</div></div>`;

  if (isD) {
    html += `<div class="menu-row"><div class="lbl">Оружие</div><div class="chips">` +
      chip('D', human.weapon === 'shot', false, 'Выстрел', 'дальний, безопасный', 'data-w="shot"') +
      chip('D', human.weapon === 'pulse', !av.weapons.includes('pulse'), 'Пульс', 'конус в упор, риск', 'data-w="pulse"') +
      `</div></div>`;
    html += `<div class="menu-row"><div class="lbl">Роль</div><div class="chips">` +
      chip('D', !human.provoker, false, 'Дамагер', 'чистый урон', 'data-ag="0"') +
      chip('D', human.provoker, !av.canAggro, 'Провокатор', 'стягивает врагов с V (аггро §7)', 'data-ag="1"') +
      `</div></div>`;
  } else {
    html += `<div class="menu-row"><div class="lbl">Ветка хила</div><div class="chips">` +
      chip('V', human.heal === 'area', false, 'Площадь', 'охват, вблизи (надёжно)', 'data-h="area"') +
      chip('V', human.heal === 'single', !av.heals.includes('single'), 'Одноцель', 'точный, далеко, пробивает глушитель', 'data-h="single"') +
      `</div></div>`;
  }

  html += `<div class="menu-row"><div class="lbl">Достижения ${human.faction} (по навыку, без гринда §8)</div><div class="ach-list">` +
    ACHIEVEMENTS.filter((a) => a.faction === human.faction).map((a) => {
      const done = progress.achieved.includes(a.id);
      return `<div class="ach ${done ? 'done' : ''}"><span class="mk">${done ? '✓' : '·'}</span>` +
        `<span class="t">${a.title}</span><span class="d">${a.desc}</span>` +
        `${a.unlocks ? `<span class="u">→ ${a.unlocks}</span>` : ''}</div>`;
    }).join('') + `</div></div>`;

  const el = document.getElementById('menu-content');
  el.innerHTML = html;
  el.querySelectorAll('[data-fac],[data-w],[data-ag],[data-h]').forEach((c) => {
    if (c.classList.contains('locked')) return;
    c.onclick = () => {
      if (c.dataset.fac) human.faction = c.dataset.fac;
      else if (c.dataset.w) human.weapon = c.dataset.w;
      else if (c.dataset.ag) human.provoker = c.dataset.ag === '1';
      else if (c.dataset.h) human.heal = c.dataset.h;
      renderMenu();
    };
  });
  const sb = document.getElementById('btn-start');   // кнопка старта в цвет выбранной фракции
  if (sb) sb.className = `primary ${human.faction}`;
}

function openMenu() { paused = true; overlay.style.display = 'flex'; renderMenu(); }

function applyHumanBuild() {
  possessed = human.faction;
  const p = world.players.find((pl) => pl.faction === human.faction && pl.alive);
  if (!p) return;
  if (human.faction === 'D') { p.loadout.weapon = human.weapon; p.loadout.provoker = human.provoker; }
  else p.loadout.heal = human.heal;
}

function startGame() {
  overlay.style.display = 'none';
  reset();
  applyHumanBuild();
  paused = false;
}

// --- передышка: прокачка статов после победы над боссом (§прокачка) ----------
// Пока — общие статы (скорость и т.п.), чтобы обкатать саму систему. Применяется к
// управляемому игроку. Открывается раз за сессию, через паузу-передышку.
const UPGRADES = [
  { id: 'speed', title: 'Скорость', sub: '+15% к скорости передвижения', apply: (p) => { p.speed *= 1.15; } },
  { id: 'vitality', title: 'Живучесть', sub: '+30 к макс. HP, полное лечение', apply: (p) => { p.maxHp += 30; p.hp = p.maxHp; } },
  { id: 'power', title: 'Сила', sub: '+20% урона (D) / силы хила (V)', apply: (p) => { if (p.faction === 'D') p.shotDamage *= 1.2; else p.healPower *= 1.2; } },
];
const upgradeOverlay = document.getElementById('upgrade-overlay');
function renderUpgrade() {
  const el = document.getElementById('upgrade-content');
  el.innerHTML = '<div class="up-opts">' + UPGRADES.map((u) =>
    `<div class="up-opt" data-up="${u.id}"><b>${u.title}</b><small>${u.sub}</small></div>`).join('') + '</div>';
  el.querySelectorAll('.up-opt').forEach((c) => { c.onclick = () => chooseUpgrade(c.dataset.up); });
}
function openBreather() { paused = true; upgradeOverlay.style.display = 'flex'; renderUpgrade(); }
function chooseUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  const p = controlledPlayer();
  if (u && p) u.apply(p);
  upgradeOverlay.style.display = 'none';
  paused = false;
}

function toast(a) {
  const c = document.getElementById('toasts');
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = `<b>🏆 ${a.title}</b><small>${a.desc}${a.unlocks ? ` — открыто: ${a.unlocks}` : ''}</small>`;
  c.appendChild(d);
  setTimeout(() => d.remove(), 5000);
}

function trackAchievements() {
  const p = controlledPlayer();
  if (!p) return;
  const newly = checkNewAchievements(p, p.faction, progress);
  if (!newly.length) return;
  for (const a of newly) { applyAchievement(a, progress); toast(a); }
  saveProgress(progress);
}

bind('btn-menu', openMenu);
bind('btn-start', startGame);
bind('btn-reset-progress', () => { progress = resetProgress(); renderMenu(); });

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
    trackAchievements(); // §8: засчитать достижения игрока, открыть сайдгрейды
    const evs = effects.observe(world, controlledPlayer()?.id); // импакт диффингом состояния
    audio.handle(evs);                                          // те же события — в звук
    // §передышка: после гибели босса — окно прокачки (с задержкой 1.2с, чтобы доиграл взрыв)
    if (world.bossDefeated && !breatherShown && breatherAt === 0) breatherAt = performance.now() + 1200;
  }
  if (breatherAt && !breatherShown && performance.now() >= breatherAt) { breatherShown = true; breatherAt = 0; openBreather(); }
  audio.update(world);   // гул тьмы следует за darkness (звучит и на паузе)
  effects.update(real);
  renderer.draw(world, effects);
  hud.update(world, recorder);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
openMenu(); // старт — экран выбора билда (§8)

// безвредный хук для инспекции/скриншотов (доступ к текущему миру/звуку из консоли)
if (typeof window !== 'undefined') { window.dvWorld = () => world; window.dvAudio = audio; }

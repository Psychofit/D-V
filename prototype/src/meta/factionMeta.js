// =============================================================================
// factionMeta — петля выбора фракции МЕЖДУ сессиями (GDD §5, §7, §9, §10).
//
// Над одиночной сессией: пул из ~20 игроков (§7) переигрывает серию сессий. Между
// ними каждый выбирает фракцию по ПОДУШЕВОМУ доходу прошлой сессии — тянется к
// выгодной (дефицитной) стороне (§10). Это и есть та самокоррекция, которой нет
// внутри сессии при фиксированном счёте.
//
// Два инструмента:
//   measureLandscape — подушевой доход D и V в зависимости от расклада D:V.
//                      Сердце вопроса: возникает ли "премия за дефицит" §5
//                      (меньшинство зарабатывает больше → выбор тянет к балансу)?
//   runDynamics      — собственно петля выбора; сходится популяция или сваливается?
// =============================================================================

import { createWorld, stepWorld } from '../sim/world.js';
import { withOverrides } from '../config.js';
import { makeRng } from '../core/rng.js';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// Один прогон сессии при заданном раскладе → подушевой доход и контекст.
export function runOneSession(cfg, seed, seconds) {
  const world = createWorld(cfg, seed);
  const dt = cfg.world.dt;
  while (world.running && world.time < seconds) stepWorld(world, dt);

  const perCapIncome = (f) => {
    const ps = world.players.filter((p) => p.faction === f);
    return ps.length ? ps.reduce((a, p) => a + p.incomeTotal, 0) / ps.length : 0;
  };
  const survFrac = (f) => {
    const ps = world.players.filter((p) => p.faction === f);
    return ps.length ? ps.filter((p) => p.alive).length / ps.length : 0;
  };
  const incomeBy = (f, field) =>
    world.players.filter((p) => p.faction === f).reduce((a, p) => a + p[field], 0);
  const vTot = incomeBy('V', 'incomeTotal');
  return {
    payoffD: perCapIncome('D'), payoffV: perCapIncome('V'),
    survD: survFrac('D'), survV: survFrac('V'),
    vHealShare: vTot > 1e-6 ? incomeBy('V', 'incomeHeal') / vTot : 0, // доля дохода V с ХИЛА (а не убийств)
    darkness: world.darkness, endT: world.time, status: world.status,
  };
}

// Ландшафт: подушевой доход D и V по раскладам D:V (усреднён по repeats сидам).
export function measureLandscape(baseCfg, opts = {}) {
  const N = opts.totalPlayers ?? baseCfg.meta.totalPlayers;
  const seconds = opts.sessionSeconds ?? baseCfg.meta.sessionSeconds;
  const repeats = opts.repeats ?? 3;
  const seed = opts.seed ?? 1;
  const splits = opts.splits ?? [2, 4, 6, 8, 10, 12, 14, 16, 18];

  const rows = [];
  for (const nD of splits) {
    const nV = N - nD;
    if (nD < 1 || nV < 1) continue;
    let pD = 0, pV = 0, dk = 0, sD = 0, sV = 0, hs = 0;
    for (let r = 0; r < repeats; r++) {
      const cfg = withOverrides(baseCfg, { session: { numD: nD, numV: nV } });
      const s = runOneSession(cfg, seed + nD * 131 + r, seconds);
      pD += s.payoffD; pV += s.payoffV; dk += s.darkness; sD += s.survD; sV += s.survV; hs += s.vHealShare;
    }
    rows.push({
      nD, nV, fD: nD / N,
      payoffD: pD / repeats, payoffV: pV / repeats,
      ratio: (pV / repeats) / Math.max(1e-6, pD / repeats), // V/D подушевой доход
      darkness: dk / repeats, survD: sD / repeats, survV: sV / repeats,
      vHealShare: hs / repeats,
    });
  }
  return rows;
}

// Ключ билда игрока (§8): что за сайдгрейды он принёс.
function buildKey(p) {
  if (p.faction === 'D') return `D ${p.loadout.weapon}${p.loadout.provoker ? '+агро' : ''}`;
  return `V ${p.loadout.heal}`;
}

// Горизонтальность сайдгрейдов (§8): подушевой доход и выживаемость по билдам в СМЕШАННЫХ
// сессиях. Если внутри фракции какой-то билд доходнее/живучее прочих — он "лучший", а не
// "иной" (нарушение §8: все взяли бы его → перекос каната). Прогоняется на миксе билдов.
export function measureBuilds(baseCfg, opts = {}) {
  const seconds = opts.sessionSeconds ?? baseCfg.meta.sessionSeconds;
  const repeats = opts.repeats ?? 8;
  const seed = opts.seed ?? 1;
  const numD = opts.numD ?? 10, numV = opts.numV ?? 10;

  const acc = {};
  for (let r = 0; r < repeats; r++) {
    const cfg = withOverrides(baseCfg, { session: { numD, numV } });
    const world = createWorld(cfg, seed + r * 17);
    const dt = cfg.world.dt;
    while (world.running && world.time < seconds) stepWorld(world, dt);
    for (const p of world.players) {
      const k = buildKey(p);
      const a = acc[k] || (acc[k] = { faction: p.faction, income: 0, heal: 0, n: 0, alive: 0 });
      a.income += p.incomeTotal; a.heal += p.incomeHeal; a.n++; a.alive += p.alive ? 1 : 0;
    }
  }
  const rows = Object.entries(acc).map(([build, a]) => ({
    build, faction: a.faction, n: a.n,
    income: a.income / a.n, alive: a.alive / a.n,
    healShare: a.heal / Math.max(1e-6, a.income),
  }));
  rows.sort((x, y) => (x.faction === y.faction ? y.income - x.income : x.faction < y.faction ? -1 : 1));
  return rows;
}

// Ландшафт пейоффа БИЛДА D (выстрел vs Пульс) по доле пульсеров (§8/§10). Аналог
// ландшафта фракций: возникает ли "премия за дефицит билда" — pulse доходнее, когда
// пульсеров мало (команде нужен танк/AoE)? Если да → выбор билда сходится к миксу.
export function measureBuildLandscape(baseCfg, opts = {}) {
  const seconds = opts.sessionSeconds ?? baseCfg.meta.sessionSeconds;
  const repeats = opts.repeats ?? 8;
  const seed = opts.seed ?? 1;
  const numD = opts.numD ?? 10, numV = opts.numV ?? 10;
  const fractions = opts.fractions ?? [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];

  const rows = [];
  for (const pf of fractions) {
    let pI = 0, pN = 0, pA = 0, sI = 0, sN = 0, sA = 0, dark = 0;
    for (let r = 0; r < repeats; r++) {
      const cfg = withOverrides(baseCfg, { session: { numD, numV }, loadouts: { D: { pulseFraction: pf } } });
      const world = createWorld(cfg, seed + Math.round(pf * 100) + r * 17);
      const dt = cfg.world.dt;
      while (world.running && world.time < seconds) stepWorld(world, dt);
      dark += world.darkness;
      for (const p of world.players) {
        if (p.faction !== 'D') continue;
        if (p.loadout.weapon === 'pulse') { pI += p.incomeTotal; pN++; pA += p.alive ? 1 : 0; }
        else { sI += p.incomeTotal; sN++; sA += p.alive ? 1 : 0; }
      }
    }
    const pulse = pI / Math.max(1, pN), shot = sI / Math.max(1, sN);
    rows.push({
      pf, pulseIncome: pulse, shotIncome: shot,
      ratio: pulse / Math.max(1e-6, shot),
      pulseAlive: pA / Math.max(1, pN), shotAlive: sA / Math.max(1, sN),
      darkness: dark / repeats,
    });
  }
  return rows;
}

// Один прогон с ТОЧНЫМ набором оружия D (массив weapons) → подушевой доход pulse/shot.
function runSessionWithWeapons(baseCfg, weapons, numV, seed, seconds) {
  const numD = weapons.length;
  const cfg = withOverrides(baseCfg, { session: { numD, numV }, loadouts: { V: { areaFraction: 1 } } });
  const world = createWorld(cfg, seed);
  const ds = world.players.filter((p) => p.faction === 'D');
  ds.forEach((p, i) => { p.loadout.weapon = weapons[i]; });   // переопределяем точно
  const dt = cfg.world.dt;
  while (world.running && world.time < seconds) stepWorld(world, dt);
  let pI = 0, pN = 0, sI = 0, sN = 0;
  for (const p of ds) {
    if (p.loadout.weapon === 'pulse') { pI += p.incomeTotal; pN++; } else { sI += p.incomeTotal; sN++; }
  }
  return { payoffPulse: pI / Math.max(1, pN), payoffShot: sI / Math.max(1, sN), darkness: world.darkness };
}

function rechooseWeapon(weapons, payoffPulse, payoffShot, meta, rng) {
  const aP = (Math.max(1e-6, payoffPulse) * meta.pulseAttract) ** meta.beta;
  const aS = Math.max(1e-6, payoffShot) ** meta.beta;
  const pPulse = aP / (aP + aS);
  const next = weapons.slice();
  for (let i = 0; i < next.length; i++) {
    if (rng.next() > meta.switchFrac) continue;
    next[i] = rng.next() < pPulse ? 'pulse' : 'shot';
  }
  if (!next.includes('pulse')) next[0] = 'pulse'; // ≥1 пульсер (иначе тёмный коллапс)
  return next;
}

// Петля ВЫБОРА БИЛДА D (§8/§10): игроки между сессиями выбирают Пульс/Выстрел по доходу билда.
// Сходится к здоровому миксу — или сваливается в all-shot (фрирайд)?
export function runBuildDynamics(baseCfg, seed = 1) {
  const meta = baseCfg.meta;
  const rng = makeRng((seed ^ 0x1357) >>> 0);
  const numD = 10, numV = 10;
  let weapons = Array.from({ length: numD }, (_, i) => (i < numD / 2 ? 'pulse' : 'shot'));
  const history = [];
  for (let r = 0; r < meta.rounds; r++) {
    const pf = weapons.filter((w) => w === 'pulse').length / numD;
    const s = runSessionWithWeapons(baseCfg, weapons, numV, seed + r * 1009, meta.sessionSeconds);
    history.push({ round: r, pf, payoffPulse: round(s.payoffPulse), payoffShot: round(s.payoffShot), darkness: round(s.darkness) });
    weapons = rechooseWeapon(weapons, s.payoffPulse, s.payoffShot, meta, rng);
  }
  return { history, verdict: classifyBuild(history) };
}

export function classifyBuild(history) {
  const f = history.map((h) => h.pf);
  const tail = f.slice(Math.floor(f.length * 0.3));
  const mean = avg(tail), lo = Math.min(...tail), hi = Math.max(...tail);
  let label;
  if (mean <= 0.15) label = 'COLLAPSE→all-shot';
  else if (mean >= 0.85) label = 'COLLAPSE→all-pulse';
  else label = 'MIX';
  return { label, meanPf: round(mean), min: round(lo), max: round(hi) };
}

// Ветки хила V по ПЛОТНОСТИ боя (§2: одноцель=ранняя/разреженная фаза, площадь=поздняя/скученная;
// "кривая синхронизирована с дугой сессии"). Свип numD=numV: где какая ветка тянет симбиоз.
export function measureVHealByDensity(baseCfg, opts = {}) {
  const seconds = opts.sessionSeconds ?? baseCfg.meta.sessionSeconds;
  const repeats = opts.repeats ?? 6;
  const seed = opts.seed ?? 1;
  const densities = opts.densities ?? [2, 4, 6, 8, 10];
  const rows = [];
  for (const n of densities) {
    const out = {};
    for (const branch of ['area', 'single']) {
      let dSurv = 0, dark = 0, vInc = 0;
      for (let r = 0; r < repeats; r++) {
        const cfg = withOverrides(baseCfg, { session: { numD: n, numV: n }, loadouts: { V: { areaFraction: branch === 'area' ? 1 : 0 } } });
        const world = createWorld(cfg, seed + n * 31 + r);
        const dt = cfg.world.dt;
        while (world.running && world.time < seconds) stepWorld(world, dt);
        const ds = world.players.filter((p) => p.faction === 'D');
        dSurv += ds.filter((p) => p.alive).length / Math.max(1, ds.length);
        dark += world.darkness;
        const vs = world.players.filter((p) => p.faction === 'V');
        vInc += vs.reduce((a, p) => a + p.incomeTotal, 0) / Math.max(1, vs.length);
      }
      out[branch] = { dSurv: dSurv / repeats, dark: dark / repeats, vInc: vInc / repeats };
    }
    rows.push({ n, area: out.area, single: out.single });
  }
  return rows;
}

// Выбор фракции: правило Льюса по подушевому доходу + привлекательность V (§9) + рацио.
function rechoose(factions, payoffD, payoffV, meta, rng) {
  const N = factions.length;
  const aD = Math.max(1e-6, payoffD) ** meta.beta;
  const aV = (Math.max(1e-6, payoffV) * meta.vAttract) ** meta.beta;
  const pD = aD / (aD + aV);

  let nD = factions.filter((f) => f === 'D').length;
  let nV = N - nD;
  const next = factions.slice();
  for (let i = 0; i < N; i++) {
    if (rng.next() > meta.switchFrac) continue;          // инерция: не переобдумывает
    let choice = rng.next() < pD ? 'D' : 'V';
    if (meta.joinRuleStrength > 0) {                     // §7: не присоединиться к тяжёлой стороне
      const heavier = nD > nV ? 'D' : nV > nD ? 'V' : null;
      if (heavier && choice === heavier && rng.next() < meta.joinRuleStrength)
        choice = heavier === 'D' ? 'V' : 'D';
    }
    if (next[i] !== choice) {
      if (next[i] === 'D') { nD--; nV++; } else { nV--; nD++; }
      next[i] = choice;
    }
  }
  // §7: сессия всегда смешанная — не допускаем вырождения в одну фракцию
  if (nD === 0) next[0] = 'D';
  if (nV === 0) next[next.length - 1] = 'V';
  return next;
}

// Петля выбора фракции через серию сессий.
export function runDynamics(baseCfg, seed = 1) {
  const meta = baseCfg.meta;
  const N = meta.totalPlayers;
  const rng = makeRng(seed ^ 0x9e3779b9);
  let factions = Array.from({ length: N }, (_, i) => (i < N / 2 ? 'D' : 'V'));
  const history = [];

  for (let r = 0; r < meta.rounds; r++) {
    const nD = factions.filter((f) => f === 'D').length;
    const nV = N - nD;
    const cfg = withOverrides(baseCfg, { session: { numD: clamp(nD, 1, N - 1), numV: clamp(nV, 1, N - 1) } });
    const s = runOneSession(cfg, seed + r * 1009, meta.sessionSeconds);
    history.push({
      round: r, nD, nV, fD: nD / N,
      payoffD: round(s.payoffD), payoffV: round(s.payoffV),
      darkness: round(s.darkness), survD: round(s.survD), survV: round(s.survV),
    });
    factions = rechoose(factions, s.payoffD, s.payoffV, meta, rng);
  }
  return { history, verdict: classifyMeta(history) };
}

// Сходится ли доля D к балансу, сваливается в край или колеблется?
export function classifyMeta(history) {
  const f = history.map((h) => h.fD);
  const warm = Math.floor(f.length * 0.3);
  const tail = f.slice(warm);
  if (tail.length < 4) return { label: 'INCONCLUSIVE' };

  const mean = avg(tail);
  const lo = Math.min(...tail), hi = Math.max(...tail), range = hi - lo;
  let peak = -Infinity, dd = 0, tr = Infinity, ru = 0;
  for (const x of tail) {
    peak = Math.max(peak, x); dd = Math.max(dd, peak - x);
    tr = Math.min(tr, x); ru = Math.max(ru, x - tr);
  }
  const hasReturns = dd >= 0.12 && ru >= 0.12;

  let label;
  if (mean >= 0.85) label = 'COLLAPSE→all-D';
  else if (mean <= 0.15) label = 'COLLAPSE→all-V';
  else if (range < 0.18) label = (mean >= 0.4 && mean <= 0.6) ? 'CONVERGE→BALANCE' : 'CONVERGE→SKEW';
  else if (hasReturns) label = 'OSCILLATES';
  else label = 'WANDERS';

  return { label, meanFd: round(mean), range: round(range), min: round(lo), max: round(hi) };
}

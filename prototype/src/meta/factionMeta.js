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

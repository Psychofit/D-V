// =============================================================================
// run-sim — headless-прогон симуляционного ядра в Node (GDD §12).
//
// Запуск:  node tools/run-sim.js [--sessions=N] [--seconds=T] [--seed=S]
//                                [--sample=I] [--verbose] [--csv=path]
//
// Печатает по сессии: исход + метрики + sparkline шкалы тьмы, и сводку по всем.
// Единственный вопрос среза: канат КОЛЕБЛЕТСЯ вокруг центра или СВАЛИВАЕТСЯ?
// =============================================================================

import { writeFileSync } from 'node:fs';
import { CONFIG, withOverrides } from '../src/config.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createRecorder, classify, sparkline } from '../src/telemetry/recorder.js';

function parseArgs(argv) {
  const a = { sessions: 8, seconds: CONFIG.world.sessionMaxSeconds, seed: 1, sample: 1.0, verbose: false, csv: null, sets: [] };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const m = rest[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const [, k, val] = m;
    if (k === 'verbose') a.verbose = true;
    else if (k === 'csv') a.csv = val ?? 'sim-run.csv';
    else if (k === 'set') a.sets.push(val ?? rest[++i]); // --set path=val ИЛИ --set=path=val, повторяемо
    else if (k in a) a[k] = Number(val);
  }
  return a;
}

// Собрать объект-оверрайд из списка "a.b.c=val" (для свипов §11: "решается ТОЛЬКО прототипом").
function buildOverrides(sets) {
  const root = {};
  for (const s of sets) {
    const [path, raw] = s.split('=');
    const val = Number(raw);
    const keys = path.split('.');
    let node = root;
    for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]] ??= {};
    node[keys[keys.length - 1]] = Number.isNaN(val) ? raw : val;
  }
  return root;
}

function runSession(cfg, seed, seconds, sampleInterval) {
  const world = createWorld(cfg, seed);
  const rec = createRecorder(sampleInterval);
  const dt = cfg.world.dt;
  rec.maybeSample(world);
  while (world.running && world.time < seconds) {
    stepWorld(world, dt);
    rec.maybeSample(world);
  }
  return { world, rec, result: classify(world, rec) };
}

function dumpCsv(path, rec) {
  const head = 'time,darkness,net,darkInvested,lightInvested,dCurrency,vCurrency,vIncomeRate,enemies,dHp,vHp';
  const rows = rec.samples.map((s) =>
    [s.t, s.darkness, s.net, s.darkInvested, s.lightInvested, s.dCurrency, s.vCurrency, s.vIncomeRate, s.enemies, s.dHp, s.vHp]
      .map((x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)).join(','));
  writeFileSync(path, [head, ...rows].join('\n'));
}

const args = parseArgs(process.argv);
const overrides = buildOverrides(args.sets);
const cfg = withOverrides(CONFIG, overrides);

console.log('='.repeat(78));
console.log('D / V — headless-прогон каната (GDD §12).  Вопрос: колеблется или сваливается?');
console.log(`сессий=${args.sessions}  длина=${args.seconds}с  seed0=${args.seed}  шаг сэмпла=${args.sample}с`);
if (args.sets.length) console.log('оверрайды:', args.sets.join('  '));
console.log('Шкала sparkline: " " светло (0) → "@" темно (1)');
console.log('='.repeat(78));

const shapeTally = {};
const endTally = {};
let firstRec = null;
let sumEnd = 0;

for (let i = 0; i < args.sessions; i++) {
  const seed = args.seed + i;
  const { world, rec, result } = runSession(cfg, seed, args.seconds, args.sample);
  if (i === 0) firstRec = rec;
  shapeTally[result.shape] = (shapeTally[result.shape] || 0) + 1;
  endTally[result.ending] = (endTally[result.ending] || 0) + 1;
  sumEnd += result.endT ?? world.time;

  const line =
    `seed ${String(seed).padStart(3)} | ${result.shape.padEnd(11)} | ` +
    `конец: ${(result.ending ?? '').padEnd(20)} | t=${String(Math.round(result.endT ?? world.time)).padStart(3)}с | ` +
    `corr=${(result.corr ?? 0).toFixed(2)} откат=${String(Math.round(result.drawdown ?? 0)).padStart(3)} ` +
    `net∈[${Math.round(result.netMin ?? 0)},${Math.round(result.netMax ?? 0)}]`;
  console.log(line);
  console.log('   net │ ' + sparkline(rec, 'net'));
  if (args.verbose) console.log('   метрики:', JSON.stringify(result));
}

console.log('='.repeat(78));
console.log('СВОДКА — ФОРМА каната (главный вопрос §12):');
for (const [label, n] of Object.entries(shapeTally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${label.padEnd(12)} ${n}/${args.sessions}`);
console.log('СВОДКА — концовки сессий (§6/§7, контекст — не вердикт):');
for (const [label, n] of Object.entries(endTally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${label.padEnd(20)} ${n}/${args.sessions}`);
console.log(`  средняя длина сессии: ${Math.round(sumEnd / args.sessions)}с`);
console.log('');
console.log('Чтение (§12): OSCILLATES/STABLE = канат держится у центра → есть игра.');
console.log('              DRIFT→DARK/LIGHT  = монотонно сваливается в край → крутить config.js.');
console.log('='.repeat(78));

if (args.csv && firstRec) {
  dumpCsv(args.csv, firstRec);
  console.log(`CSV первой сессии записан: ${args.csv}`);
}

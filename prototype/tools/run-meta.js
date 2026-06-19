// =============================================================================
// run-meta — петля выбора фракции между сессиями (GDD §5, §7, §9, §10).
//
//   node tools/run-meta.js --landscape          # подушевой доход D/V по раскладам
//   node tools/run-meta.js --dynamics           # петля выбора (по умолчанию)
//   node tools/run-meta.js --set meta.joinRuleStrength=1   # включить правило входа §7
//
// Вопрос: рациональный выбор фракции тянет популяцию к балансу — или сваливает в край?
// =============================================================================

import { CONFIG, withOverrides } from '../src/config.js';
import {
  measureLandscape, runDynamics, measureBuilds, measureBuildLandscape, runBuildDynamics,
} from '../src/meta/factionMeta.js';

function parseArgs(argv) {
  const a = { mode: 'dynamics', seed: 1, series: 5, sets: [], splits: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const m = rest[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const [, k, val] = m;
    if (['landscape', 'dynamics', 'builds', 'buildscape', 'builddyn'].includes(k)) a.mode = k;
    else if (k === 'set') a.sets.push(val ?? rest[++i]);
    else if (k === 'splits') a.splits = (val ?? rest[++i]).split(',').map(Number);
    else if (k in a) a[k] = Number(val);
  }
  return a;
}

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

const bar = (frac, w = 24) => {
  const n = Math.round(clamp(frac, 0, 1) * w);
  return '█'.repeat(n) + '·'.repeat(w - n);
};
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

function sparkFd(history, width = 60) {
  const chars = ' .:-=+*#%@';
  const step = Math.max(1, Math.floor(history.length / width));
  let out = '';
  for (let i = 0; i < history.length; i += step) {
    const t = clamp(history[i].fD, 0, 1);
    out += chars[Math.min(chars.length - 1, Math.floor(t * (chars.length - 1)))];
  }
  return out;
}

const args = parseArgs(process.argv);
const overrides = buildOverrides(args.sets);
const cfg = withOverrides(CONFIG, overrides);

console.log('='.repeat(80));
console.log('D / V — петля выбора фракции между сессиями (GDD §5, §7, §9, §10).');
if (args.sets.length) console.log('оверрайды:', args.sets.join('  '));

if (args.mode === 'landscape') {
  console.log('ЛАНДШАФТ подушевого дохода: возникает ли "премия за дефицит" §5?');
  console.log(`всего игроков=${cfg.meta.totalPlayers}  сессия=${cfg.meta.sessionSeconds}с`);
  console.log('='.repeat(80));
  console.log('  D/ V | подуш.доход D | подуш.доход V | V/D  | тьма | V:хил% | доходнее');
  const rows = measureLandscape(cfg, { seed: args.seed, splits: args.splits ?? undefined });
  for (const r of rows) {
    console.log(
      `  ${String(r.nD).padStart(2)}/${String(r.nV).padStart(2)} | ` +
      `${r.payoffD.toFixed(1).padStart(12)} | ${r.payoffV.toFixed(1).padStart(12)} | ` +
      `${r.ratio.toFixed(2).padStart(4)} | ${r.darkness.toFixed(2)} | ` +
      `${(r.vHealShare * 100).toFixed(0).padStart(5)}% | ${r.payoffV > r.payoffD ? 'V' : 'D'}`);
  }
  // Равновесие выбора там, где V/D ≈ 1. Премия за дефицит §5 = V становится доходнее
  // именно когда V в меньшинстве (правые строки). Проверяем, пересекает ли V/D единицу.
  const maxRatio = Math.max(...rows.map((r) => r.ratio));
  const minRatio = Math.min(...rows.map((r) => r.ratio));
  const crosses = maxRatio >= 1 && minRatio < 1;
  console.log('='.repeat(80));
  console.log(`V/D подушевого дохода: размах [${minRatio.toFixed(2)} … ${maxRatio.toFixed(2)}] ` +
    `(точка баланса выбора — где V/D≈1).`);
  if (maxRatio < 1)
    console.log('→ V НИГДЕ не доходнее D → выбор сваливает популяцию в all-D. ' +
      'Премия за дефицит §5 присутствует ПО НАПРАВЛЕНИЮ (V/D растёт при дефиците V), но СЛАБА по магнитуде.');
  else if (crosses)
    console.log('→ V/D пересекает 1 → есть точка равновесия → выбор может сходиться к балансу.');
  else
    console.log('→ V доходнее везде → коллапс в all-V.');
} else if (args.mode === 'builddyn') {
  // Петля выбора билда D (§8/§10): сходится к миксу или сваливается в all-shot?
  const runs = [];
  for (let i = 0; i < args.series; i++) runs.push(runBuildDynamics(cfg, args.seed + i));
  console.log(`ВЫБОР БИЛДА D (Пульс/Выстрел): серий=${args.series} раундов=${cfg.meta.rounds} ` +
    `β=${cfg.meta.beta} pulseAttract=${cfg.meta.pulseAttract} switch=${cfg.meta.switchFrac}`);
  console.log('Шкала pf (доля Пульса): " " all-shot (0) → "@" all-pulse (1). Здоровый микс = середина.');
  console.log('='.repeat(80));
  const tally = {};
  for (let i = 0; i < runs.length; i++) {
    const { history, verdict } = runs[i];
    tally[verdict.label] = (tally[verdict.label] || 0) + 1;
    const last = history[history.length - 1];
    console.log(`серия ${i + 1} | ${verdict.label.padEnd(17)} | pf→${(verdict.meanPf ?? 0).toFixed(2)} ` +
      `| финал pulse=${Math.round(last.pf * 10)}/10 тьма=${last.darkness.toFixed(2)}`);
    console.log('   pf │ ' + sparkFd(history.map((h) => ({ fD: h.pf }))));
  }
  console.log('='.repeat(80));
  console.log('СВОДКА:');
  for (const [label, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`  ${label.padEnd(18)} ${n}/${runs.length}`);
  console.log('');
  console.log('MIX = выбор билда сам держит смесь танков/дамагеров → сайдгрейд горизонтален (§8).');
  console.log('COLLAPSE→all-shot = фрирайд побеждает → нужен сильнее пейофф пульсера / премия дефицита.');
} else if (args.mode === 'buildscape') {
  // Ландшафт пейоффа билда D (§8/§10): доходнее ли Пульс, когда пульсеров мало?
  console.log('ЛАНДШАФТ билда D (выстрел vs Пульс): есть ли "премия за дефицит билда"?');
  console.log(`10D/10V, сессия=${cfg.meta.sessionSeconds}с. pulse/shot>1 при дефиците пульсеров → выбор сойдётся.`);
  console.log('='.repeat(80));
  console.log('  доля pulse | доход pulse | доход shot | pulse/shot | выжив p/s  | тьма');
  const rows = measureBuildLandscape(cfg, { seed: args.seed });
  for (const r of rows) {
    console.log(`  ${r.pf.toFixed(2).padStart(10)} | ${r.pulseIncome.toFixed(0).padStart(11)} | ` +
      `${r.shotIncome.toFixed(0).padStart(10)} | ${r.ratio.toFixed(2).padStart(10)} | ` +
      `${(r.pulseAlive * 100).toFixed(0)}%/${(r.shotAlive * 100).toFixed(0)}%`.padStart(10) + ` | ${r.darkness.toFixed(2)}`);
  }
  const lo = rows[0].ratio, hi = rows[rows.length - 1].ratio; // при малой доле pulse vs большой
  console.log('='.repeat(80));
  console.log(`pulse/shot при дефиците пульсеров=${lo.toFixed(2)}, при избытке=${hi.toFixed(2)}.`);
  console.log(lo > 1 && lo > hi
    ? '→ Премия за дефицит билда ЕСТЬ (Пульс ценен, когда редок) → выбор билда сойдётся к миксу.'
    : '→ Премии нет: shot выгоднее даже при дефиците пульсеров → выбор сваливает в all-shot (как было с фракцией).');
} else if (args.mode === 'builds') {
  // Горизонтальность сайдгрейдов (§8): мешаем билды 50/50 (user --set перебивает),
  // меряем подушевой доход и выживаемость по билдам. Доминирующий билд = нарушение §8.
  const mixDefault = { loadouts: { D: { pulseFraction: 0.5, provokerFraction: 0.5 }, V: { areaFraction: 0.5 } } };
  const buildCfg = withOverrides(withOverrides(CONFIG, mixDefault), overrides);
  console.log('ГОРИЗОНТАЛЬНОСТЬ билдов §8: доминирует ли какой-то сайдгрейд?');
  console.log(`микс билдов 50/50, сессия=${buildCfg.meta.sessionSeconds}с`);
  console.log('='.repeat(80));
  console.log('  билд                | подуш.доход | выжив. | V:хил%');
  const rows = measureBuilds(buildCfg, { seed: args.seed });
  for (const r of rows) {
    console.log(`  ${r.build.padEnd(20)}| ${r.income.toFixed(1).padStart(11)} | ` +
      `${(r.alive * 100).toFixed(0).padStart(5)}% | ${r.faction === 'V' ? (r.healShare * 100).toFixed(0) + '%' : '—'}`);
  }
  console.log('='.repeat(80));
  for (const fac of ['D', 'V']) {
    const fr = rows.filter((r) => r.faction === fac);
    if (fr.length < 2) continue;
    const inc = fr.map((r) => r.income);
    const ratio = Math.max(...inc) / Math.max(1e-6, Math.min(...inc));
    const top = fr.reduce((a, b) => (b.income > a.income ? b : a));
    console.log(`  ${fac}: разброс дохода ×${ratio.toFixed(2)} (лидер: ${top.build}). ` +
      (ratio < 1.6 ? 'ГОРИЗОНТАЛЬНО (§8 ок).' : 'билд доминирует → проверить §8.'));
  }
} else {
  const runs = [];
  for (let i = 0; i < args.series; i++) runs.push(runDynamics(cfg, args.seed + i));
  console.log(`ДИНАМИКА выбора: серий=${args.series}  раундов=${cfg.meta.rounds}  ` +
    `β=${cfg.meta.beta} vAttract=${cfg.meta.vAttract} switch=${cfg.meta.switchFrac} joinRule=${cfg.meta.joinRuleStrength}`);
  console.log('Шкала fD (доля D): " " все V (0) → "@" все D (1).  Баланс = середина.');
  console.log('='.repeat(80));
  const tally = {};
  for (let i = 0; i < runs.length; i++) {
    const { history, verdict } = runs[i];
    tally[verdict.label] = (tally[verdict.label] || 0) + 1;
    const last = history[history.length - 1];
    console.log(
      `серия ${i + 1} | ${verdict.label.padEnd(17)} | fD→${(verdict.meanFd ?? 0).toFixed(2)} ` +
      `размах=${(verdict.range ?? 0).toFixed(2)} | финал D/V=${last.nD}/${last.nV} тьма=${last.darkness.toFixed(2)}`);
    console.log('   fD │ ' + sparkFd(history));
  }
  console.log('='.repeat(80));
  console.log('СВОДКА:');
  for (const [label, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`  ${label.padEnd(18)} ${n}/${runs.length}`);
  console.log('');
  console.log('CONVERGE→BALANCE = популяция сама держит ~10/10 → самокоррекция §10 работает.');
  console.log('COLLAPSE→all-D/V = выбор сваливает популяцию в край → стимулов/правил мало.');
}
console.log('='.repeat(80));

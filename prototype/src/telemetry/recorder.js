// =============================================================================
// recorder — телеметрия среза (GDD §12). Логируем то, что просит документ:
// положение шкалы во времени, баланс вложенных очков D/V, доход V, события крахов.
//
// И КЛАССИФИКАТОР: главный (и единственный) вопрос среза — канат "колеблется
// вокруг центра" или "сваливается" в один край. Классификатор даёт метку + числа,
// а sparkline — чтобы отличить глазами, как и предписывает §12.
// =============================================================================

export function createRecorder(sampleInterval = 1.0) {
  return {
    sampleInterval,
    nextSampleAt: 0,
    lastIncomeAccum: 0,
    samples: [],

    maybeSample(world) {
      if (world.time + 1e-9 < this.nextSampleAt) return;
      this.nextSampleAt += this.sampleInterval;

      const sumCur = (f) =>
        world.players.filter((p) => p.faction === f).reduce((a, p) => a + p.currency, 0);
      const hpFrac = (f) => {
        const ps = world.players.filter((p) => p.faction === f);
        const alive = ps.filter((p) => p.alive);
        if (!alive.length) return 0;
        return alive.reduce((a, p) => a + p.hp / p.maxHp, 0) / alive.length;
      };

      const incomeRate =
        (world.stats.vIncomeAccum - this.lastIncomeAccum) / this.sampleInterval;
      this.lastIncomeAccum = world.stats.vIncomeAccum;

      const aliveCount = (f) => world.players.filter((p) => p.faction === f && p.alive).length;
      this.samples.push({
        t: world.time,
        darkness: world.darkness,
        net: world.darkInvested - world.lightInvested,
        darkInvested: world.darkInvested,
        lightInvested: world.lightInvested,
        dCurrency: sumCur('D'),
        vCurrency: sumCur('V'),
        vIncomeRate: incomeRate,
        enemies: world.enemies.length,
        fatAlive: world.enemies.reduce((a, e) => a + (e.type === 'fat' ? 1 : 0), 0),
        dCount: aliveCount('D'),
        vCount: aliveCount('V'),
        dHp: hpFrac('D'),
        vHp: hpFrac('V'),
      });
    },
  };
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => {
  if (a.length < 2) return 0;
  const m = avg(a);
  return Math.sqrt(avg(a.map((x) => (x - m) ** 2)));
};

const pearson = (xs, ys) => {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = avg(xs), my = avg(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  return dx2 === 0 || dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2);
};

// Классификация. Главный вопрос §12 — про ФОРМУ траектории каната (net = dark-light
// очки), а НЕ про то, чем кончилась сессия (крах — естественный конец §7).
// Поэтому считаем shape (форму шкалы) и ending (концовку) РАЗДЕЛЬНО.
//
//   shape: DRIFT→DARK / DRIFT→LIGHT — монотонный дрейф в край БЕЗ возврата = "сваливается".
//          OSCILLATES — есть значимые возвраты к центру = "колеблется" (есть игра).
//          STABLE — почти плато (узкий диапазон) = тоже устойчивый баланс.
//          WANDERS — без ясного тренда, но и без возвратов (неубедительно).
export function classify(world, recorder, opts = {}) {
  const ending =
    world.status === 'collapse-V' ? 'погибли-все-V(тьма)' :
    world.status === 'collapse-D' ? 'погибли-все-D(свет)' :
    world.status === 'collapse-both' ? 'погибли-обе' : 'выжили';

  const net = recorder.samples.map((s) => s.net);
  const warm = Math.floor(net.length * 0.1);   // отбросить разогрев
  const tail = net.slice(warm);
  if (tail.length < 6) return { shape: 'INCONCLUSIVE', ending, endT: round(world.time) };

  const idx = tail.map((_, i) => i);
  const corr = pearson(idx, tail);             // +1 монотонный рост, ~0 нет тренда, -1 спад
  const mean = avg(tail), sd = std(tail);
  const lo = Math.min(...tail), hi = Math.max(...tail);
  const range = hi - lo;

  // максимальный откат от бегущего пика — "возврат" каната (§12: дрейф "без возврата")
  let peak = -Infinity, drawdown = 0, trough = Infinity, runup = 0;
  for (const x of tail) {
    peak = Math.max(peak, x); drawdown = Math.max(drawdown, peak - x);
    trough = Math.min(trough, x); runup = Math.max(runup, x - trough);
  }
  const returnThresh = Math.max(opts.returnPoints ?? 8, range * (opts.returnFrac ?? 0.25));
  const hasReturns = drawdown >= returnThresh && runup >= returnThresh;

  // "убежал в край" = net ушёл далеко за шкалу (норму тьмы). Если остался у центра —
  // канат держится (есть игра), даже при слабом тренде (§12: дрейф = уход "без возврата").
  const norm = world.cfg.darkness.normalizer;
  const ranAway = hi > norm * 2.5 || lo < -norm * 2.5;

  let shape;
  if (range < (opts.flatPoints ?? 6)) shape = 'STABLE';
  else if (hasReturns) shape = 'OSCILLATES';
  else if (!ranAway && range < norm * 2) shape = 'BOUNDED';   // держится у центра
  else if (corr > 0.8) shape = 'DRIFT→DARK';
  else if (corr < -0.8) shape = 'DRIFT→LIGHT';
  else shape = 'WANDERS';

  return {
    shape, ending,
    corr: round(corr), drawdown: round(drawdown),
    mean: round(mean), std: round(sd), netMin: round(lo), netMax: round(hi),
    endT: round(world.time),
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

// ASCII-sparkline поля во времени. Для 'darkness' шкала фиксирована [0,1];
// для 'net' (истинное положение каната) — авто-масштаб по диапазону прогона,
// чтобы форма была видна даже когда darkness насыщена. (§12: "отличать глазами".)
export function sparkline(recorder, field = 'net', width = 72) {
  const chars = ' .:-=+*#%@';
  const s = recorder.samples;
  if (!s.length) return '(нет данных)';
  let min = 0, max = 1;
  if (field !== 'darkness') {
    const vals = s.map((x) => x[field]);
    min = Math.min(...vals); max = Math.max(...vals);
    if (max - min < 1e-9) max = min + 1;
  }
  const step = Math.max(1, Math.floor(s.length / width));
  let out = '';
  for (let i = 0; i < s.length; i += step) {
    const t = (s[i][field] - min) / (max - min);
    out += chars[Math.min(chars.length - 1, Math.max(0, Math.floor(t * (chars.length - 1))))];
  }
  return out;
}

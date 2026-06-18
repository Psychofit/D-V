// =============================================================================
// hud — приборная панель: то, что §12 велит логировать, показано вживую —
// положение шкалы тьмы, баланс вложенных очков D/V, доход V, статус крахов,
// и график net(t) — главный измеритель "колеблется или сваливается".
// =============================================================================

export function createHud(root) {
  root.innerHTML = `
    <div class="dv-panel">
      <div class="dv-row"><span>Тьма (канат)</span><span id="dv-darkv">0.00</span></div>
      <div class="dv-bar"><div id="dv-darkbar"></div></div>
      <div class="dv-row"><span>net (D−V очки)</span><b id="dv-net">0</b></div>
      <div class="dv-row dv-dim"><span>вложено D / V</span><span><b id="dv-di">0</b> / <b id="dv-li">0</b></span></div>
      <div class="dv-row dv-dim"><span>валюта D / V</span><span><b id="dv-dc">0</b> / <b id="dv-vc">0</b></span></div>
      <div class="dv-row dv-dim"><span>доход V</span><span id="dv-vinc">0.0/с</span></div>
      <div class="dv-row dv-dim"><span>живых D / V</span><span><b id="dv-dn">0</b> / <b id="dv-vn">0</b></span></div>
      <div class="dv-row dv-dim"><span>враги (толст) / t</span><span><b id="dv-en">0</b> (<span id="dv-fat">0</span>) / <span id="dv-t">0</span>с</span></div>
      <div class="dv-row"><span>статус</span><b id="dv-status">running</b></div>
      <canvas id="dv-chart" width="264" height="88"></canvas>
      <div class="dv-cap">net(t): ↑тьма ↓свет. Ровно/колеблется = есть игра; монотонный дрейф = сваливается (§12)</div>
    </div>`;

  const $ = (id) => root.querySelector(id);
  const els = {
    darkv: $('#dv-darkv'), darkbar: $('#dv-darkbar'), net: $('#dv-net'),
    di: $('#dv-di'), li: $('#dv-li'), dc: $('#dv-dc'), vc: $('#dv-vc'),
    vinc: $('#dv-vinc'), en: $('#dv-en'), fat: $('#dv-fat'), t: $('#dv-t'),
    dn: $('#dv-dn'), vn: $('#dv-vn'), status: $('#dv-status'), chart: $('#dv-chart'),
  };
  const cctx = els.chart.getContext('2d');

  function drawChart(recorder, cfg) {
    const w = els.chart.width, h = els.chart.height;
    cctx.clearRect(0, 0, w, h);
    cctx.fillStyle = '#0d0d12'; cctx.fillRect(0, 0, w, h);
    const s = recorder.samples;
    if (s.length < 2) return;

    const nets = s.map((x) => x.net);
    let min = Math.min(0, ...nets), max = Math.max(cfg.darkness.normalizer, ...nets);
    if (max - min < 1) max = min + 1;
    const X = (i) => (i / (s.length - 1)) * (w - 2) + 1;
    const Y = (v) => h - 2 - ((v - min) / (max - min)) * (h - 4);

    // линия нуля (паритет) и верх шкалы (полная тьма)
    cctx.strokeStyle = '#333'; cctx.lineWidth = 1;
    cctx.beginPath(); cctx.moveTo(0, Y(0)); cctx.lineTo(w, Y(0)); cctx.stroke();
    cctx.strokeStyle = '#3a2030';
    cctx.beginPath(); cctx.moveTo(0, Y(cfg.darkness.normalizer)); cctx.lineTo(w, Y(cfg.darkness.normalizer)); cctx.stroke();

    // сама траектория net
    cctx.strokeStyle = '#ffb454'; cctx.lineWidth = 1.5;
    cctx.beginPath();
    s.forEach((x, i) => { const px = X(i), py = Y(x.net); i ? cctx.lineTo(px, py) : cctx.moveTo(px, py); });
    cctx.stroke();
  }

  function update(world, recorder) {
    const sumCur = (f) => world.players.filter((p) => p.faction === f).reduce((a, p) => a + p.currency, 0);
    const last = recorder.samples[recorder.samples.length - 1] || {};
    els.darkv.textContent = world.darkness.toFixed(2);
    els.darkbar.style.width = `${Math.round(world.darkness * 100)}%`;
    els.net.textContent = (world.darkInvested - world.lightInvested).toFixed(0);
    els.di.textContent = world.darkInvested.toFixed(0);
    els.li.textContent = world.lightInvested.toFixed(0);
    els.dc.textContent = sumCur('D').toFixed(0);
    els.vc.textContent = sumCur('V').toFixed(0);
    els.vinc.textContent = `${(last.vIncomeRate ?? 0).toFixed(1)}/с`;
    els.dn.textContent = world.players.filter((p) => p.faction === 'D' && p.alive).length;
    els.vn.textContent = world.players.filter((p) => p.faction === 'V' && p.alive).length;
    els.en.textContent = world.enemies.length;
    els.fat.textContent = world.enemies.reduce((a, e) => a + (e.type === 'fat' ? 1 : 0), 0);
    els.t.textContent = world.time.toFixed(0);
    els.status.textContent = world.fury && world.running ? 'ЯРОСТЬ (все V мертвы)' : world.status;
    els.status.style.color = world.running ? '#4ad66d' : '#e5484d';
    drawChart(recorder, world.cfg);
  }

  return { update };
}

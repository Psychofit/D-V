// =============================================================================
// hud — приборная панель в общем мрачном стиле игры. То, что §12 велит логировать,
// показано вживую: положение каната, баланс вложенных очков D/V, доход V, крахи,
// и график net(t) — главный измеритель "колеблется или сваливается".
//
// Канат — герой панели: центр = паритет, вправо ТЬМА (D, красный), влево СВЕТ
// (V, бирюзовый). График net повторяет ту же ось (верх — тьма, низ — свет), так
// HUD читается как часть мира, а не как отладочная выгрузка.
// =============================================================================

export function createHud(root) {
  root.innerHTML = `
    <div class="dv-panel">
      <div class="dv-head">
        <span class="dv-title">Канат тьмы</span>
        <span class="dv-dk"><b id="dv-darkv">0.00</b> тьма</span>
      </div>
      <div class="dv-tug">
        <span class="dv-tug-end v">V·свет</span>
        <div class="dv-tug-track">
          <div class="dv-tug-half v"></div><div class="dv-tug-half d"></div>
          <div id="dv-tug-fill" class="dv-tug-fill d"></div>
          <div class="dv-tug-center"></div>
          <div id="dv-tug-knot" class="dv-tug-knot"></div>
        </div>
        <span class="dv-tug-end d">тьма·D</span>
      </div>
      <div class="dv-row"><span class="dv-dim">net (D−V очки)</span><b id="dv-net">0</b></div>
      <canvas id="dv-chart"></canvas>
      <div class="dv-cap">↑ тьма · ↓ свет · центр — паритет. Колеблется = есть игра; дрейф в край = сваливается (§12)</div>
      <div class="dv-grid">
        <div class="dv-row dv-dim"><span>вложено</span><span><b class="d" id="dv-di">0</b> / <b class="v" id="dv-li">0</b></span></div>
        <div class="dv-row dv-dim"><span>валюта</span><span><b class="d" id="dv-dc">0</b> / <b class="v" id="dv-vc">0</b></span></div>
        <div class="dv-row dv-dim"><span>живых</span><span><b class="d" id="dv-dn">0</b> / <b class="v" id="dv-vn">0</b></span></div>
        <div class="dv-row dv-dim"><span>доход V</span><span id="dv-vinc">0.0/с</span></div>
        <div class="dv-row dv-dim"><span>враги (толст)</span><span><b id="dv-en">0</b> (<span id="dv-fat">0</span>)</span></div>
        <div class="dv-row dv-dim"><span>время</span><span><b id="dv-t">0</b>с</span></div>
      </div>
      <div class="dv-status-row"><span class="dv-dim">статус</span><b id="dv-status" class="dv-pill">идёт бой</b></div>
    </div>`;

  const $ = (id) => root.querySelector(id);
  const els = {
    darkv: $('#dv-darkv'), net: $('#dv-net'),
    tugFill: $('#dv-tug-fill'), tugKnot: $('#dv-tug-knot'),
    di: $('#dv-di'), li: $('#dv-li'), dc: $('#dv-dc'), vc: $('#dv-vc'),
    vinc: $('#dv-vinc'), en: $('#dv-en'), fat: $('#dv-fat'), t: $('#dv-t'),
    dn: $('#dv-dn'), vn: $('#dv-vn'), status: $('#dv-status'), chart: $('#dv-chart'),
  };

  // график рисуем в 2× буфере (резкость), логические координаты — CW×CH
  const CW = 264, CH = 92;
  els.chart.width = CW * 2; els.chart.height = CH * 2;
  const cctx = els.chart.getContext('2d');
  cctx.scale(2, 2);

  function drawChart(recorder, cfg) {
    cctx.clearRect(0, 0, CW, CH);
    cctx.fillStyle = '#0c0b12'; cctx.fillRect(0, 0, CW, CH);
    const s = recorder.samples;
    const norm = cfg.darkness.normalizer;
    const nets = s.map((x) => x.net);
    let min = Math.min(-2, ...nets), max = Math.max(norm, ...nets);
    if (max - min < 1) max = min + 1;
    const X = (i) => (s.length < 2 ? 0 : (i / (s.length - 1)) * CW);
    const Y = (v) => CH - ((v - min) / (max - min)) * CH;
    const y0 = Math.max(0, Math.min(CH, Y(0)));    // паритет (net=0)

    // зоны: над паритетом — тьма (красноватая), под — свет (бирюзовая)
    let g = cctx.createLinearGradient(0, 0, 0, y0);
    g.addColorStop(0, 'rgba(229,72,77,0.18)'); g.addColorStop(1, 'rgba(229,72,77,0.02)');
    cctx.fillStyle = g; cctx.fillRect(0, 0, CW, y0);
    g = cctx.createLinearGradient(0, y0, 0, CH);
    g.addColorStop(0, 'rgba(84,182,255,0.02)'); g.addColorStop(1, 'rgba(84,182,255,0.16)');
    cctx.fillStyle = g; cctx.fillRect(0, y0, CW, CH - y0);

    // линия насыщения тьмы (normalizer) — пунктир
    if (norm <= max && norm >= min) {
      cctx.strokeStyle = 'rgba(229,72,77,0.4)'; cctx.setLineDash([3, 3]); cctx.lineWidth = 1;
      cctx.beginPath(); cctx.moveTo(0, Y(norm)); cctx.lineTo(CW, Y(norm)); cctx.stroke(); cctx.setLineDash([]);
    }
    // паритет
    cctx.strokeStyle = 'rgba(205,205,225,0.45)'; cctx.lineWidth = 1;
    cctx.beginPath(); cctx.moveTo(0, y0); cctx.lineTo(CW, y0); cctx.stroke();
    if (s.length < 2) return;

    // траектория каната — янтарная линия со свечением
    cctx.strokeStyle = '#ffb454'; cctx.lineWidth = 1.6; cctx.lineJoin = 'round';
    cctx.shadowColor = 'rgba(255,180,84,0.55)'; cctx.shadowBlur = 4;
    cctx.beginPath();
    s.forEach((x, i) => { const px = X(i), py = Y(x.net); i ? cctx.lineTo(px, py) : cctx.moveTo(px, py); });
    cctx.stroke(); cctx.shadowBlur = 0;

    // голова — светящаяся точка текущего положения каната
    const lx = X(s.length - 1), ly = Y(nets[nets.length - 1]);
    const gg = cctx.createRadialGradient(lx, ly, 0, lx, ly, 6);
    gg.addColorStop(0, 'rgba(255,214,128,0.95)'); gg.addColorStop(1, 'rgba(255,180,84,0)');
    cctx.fillStyle = gg; cctx.beginPath(); cctx.arc(lx, ly, 6, 0, Math.PI * 2); cctx.fill();
    cctx.fillStyle = '#ffd98a'; cctx.beginPath(); cctx.arc(lx, ly, 2, 0, Math.PI * 2); cctx.fill();
  }

  function update(world, recorder) {
    const sumCur = (f) => world.players.filter((p) => p.faction === f).reduce((a, p) => a + p.currency, 0);
    const last = recorder.samples[recorder.samples.length - 1] || {};
    const net = world.darkInvested - world.lightInvested;

    els.darkv.textContent = world.darkness.toFixed(2);
    els.net.textContent = net.toFixed(0);
    els.net.style.color = net > 0.5 ? '#e5666b' : net < -0.5 ? '#5fbfe6' : '#c9c9d6';

    // канат-тяга: позиция узла = net / normalizer, центр = паритет
    const pos = Math.max(-1, Math.min(1, net / world.cfg.darkness.normalizer));
    const pct = (pos * 0.5 + 0.5) * 100;
    els.tugKnot.style.left = `${pct}%`;
    els.tugFill.style.left = `${Math.min(pct, 50)}%`;
    els.tugFill.style.width = `${Math.abs(pct - 50)}%`;
    els.tugFill.className = `dv-tug-fill ${pos >= 0 ? 'd' : 'v'}`;

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

    const st = els.status;
    if (world.fury && world.running) { st.textContent = 'ЯРОСТЬ — все V мертвы'; st.className = 'dv-pill fury'; }
    else if (world.running) { st.textContent = 'идёт бой'; st.className = 'dv-pill'; }
    else {
      const lbl = { 'collapse-V': 'крах: тьма поглотила', 'collapse-D': 'крах: свет угас', 'collapse-both': 'крах: пали обе' };
      st.textContent = lbl[world.status] || world.status; st.className = 'dv-pill bad';
    }
    drawChart(recorder, world.cfg);
  }

  return { update };
}

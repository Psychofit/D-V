// =============================================================================
// audio — браузерный слой ЗВУКА (процедурный, без ассетов: синтез на лету через
// WebAudio). Парный к effects.js: питается теми же СОБЫТИЯМИ кадра (их возвращает
// effects.observe) — связь только через плоский список данных, без зависимости.
//
// Фракционная фактура и на слух (как силуэты — на глаз):
//   D — стальной колосс: низкие, металлические, тяжёлые удары.
//   V — хрупкий, эфирный: высокие, звонкие, кристаллические.
// Тьма как НАСТРОЕНИЕ: фоновый гул нарастает с darkness (светлый мир тих,
// тёмный — давит), в глубокой тьме подмешивается тревожный обертон.
//
// Звук по умолчанию ВЫКЛ и включается явно (тумблер) — браузеры всё равно не дают
// автозвук до жеста пользователя, так что сюрприза нет. Дросселирование по типам +
// компрессор удерживают громкость при «толпе» из десятков стрелков.
// =============================================================================

export function createAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null, master = null, enabled = false, noiseBuf = null;
  let droneGain = null, droneFilter = null, droneOvertone = null;
  const last = {};                       // антиспам по типам: время последнего срабатывания

  function ensure() {
    if (ctx || !AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor(); // предохранитель от клиппинга на толпе
    master.connect(comp); comp.connect(ctx.destination);
    const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n); // 1с белого шума (общий)
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    buildDrone();
  }

  function buildDrone() {                 // непрерывный гул тьмы (гейн ведётся из update)
    droneGain = ctx.createGain(); droneGain.gain.value = 0;
    droneFilter = ctx.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 220;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 52;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 53.7; // биения → «живой» гул
    const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 104; // тревожный обертон
    droneOvertone = ctx.createGain(); droneOvertone.gain.value = 0;                    // подмешивается в тьме
    o1.connect(droneFilter); o2.connect(droneFilter); o3.connect(droneOvertone); droneOvertone.connect(droneFilter);
    droneFilter.connect(droneGain); droneGain.connect(master);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08; // «дыхание» фильтра
    const lfoG = ctx.createGain(); lfoG.gain.value = 55; lfo.connect(lfoG); lfoG.connect(droneFilter.frequency);
    o1.start(); o2.start(); o3.start(); lfo.start();
  }

  function ramp(param, to, t) {
    const now = ctx.currentTime; const v = Math.max(0.0001, param.value);
    param.cancelScheduledValues(now); param.setValueAtTime(v, now);
    param.exponentialRampToValueAtTime(Math.max(0.0001, to), now + t);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) { ensure(); if (!ctx) return false; if (ctx.state === 'suspended') ctx.resume(); ramp(master.gain, 0.9, 0.25); }
    else if (ctx) ramp(master.gain, 0.0001, 0.25);
    return enabled;
  }

  // фоновый гул следует за тьмой; вызывается каждый кадр
  function update(world) {
    if (!ctx) return;
    const d = world.darkness;
    const now = ctx.currentTime;
    droneGain.gain.setTargetAtTime(0.02 + d * 0.16, now, 0.3);
    droneOvertone.gain.setTargetAtTime(d * d * 0.06, now, 0.5);   // тревога копится в глубокой тьме
  }

  // --- синтез one-shot'ов ---------------------------------------------------
  function env(node, peak, dur, attack = 0.005) {
    const g = ctx.createGain(); const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    node.connect(g); g.connect(master);
  }
  function tone({ freq, type = 'sine', dur = 0.12, peak = 0.15, sweep = 0, detune = 0 }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
    const now = ctx.currentTime;
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), now + dur);
    env(o, peak, dur); o.start(now); o.stop(now + dur + 0.03);
  }
  function noise({ dur = 0.15, peak = 0.15, filter = 'lowpass', freq = 800, q = 1, sweep = 0 }) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const now = ctx.currentTime;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), now + dur);
    s.connect(f); env(f, peak, dur); s.start(now); s.stop(now + dur + 0.03);
  }

  const ok = (k, gap) => { const now = ctx.currentTime; if (last[k] && now - last[k] < gap) return false; last[k] = now; return true; };
  const vary = (f) => f * (0.94 + Math.random() * 0.12); // лёгкий разброс высоты → «толпа», не пулемёт

  function handle(evs) {
    if (!ctx || !enabled || !evs || !evs.length) return;
    for (const e of evs) {
      switch (e.type) {
        case 'shoot':                                   // выстрел: D щелчок · V воздушный · враг глухой
          if (e.src === 'damage') { if (ok('sd', 0.035)) { tone({ freq: vary(150), type: 'square', dur: 0.07, peak: 0.08, sweep: 0.6 }); noise({ dur: 0.05, peak: 0.05, filter: 'highpass', freq: 1800 }); } }
          else if (e.src === 'enemyShot') { if (ok('se', 0.05)) noise({ dur: 0.08, peak: 0.05, filter: 'bandpass', freq: vary(520), q: 2 }); }
          else if (ok('sv', 0.04)) tone({ freq: vary(720), type: 'sine', dur: 0.12, peak: 0.06, sweep: 1.5 });
          break;
        case 'dmg':
          if (e.faction === 'V') {                       // хрупкий звон (две расстроенные синусы + шипение)
            if (ok('dv', 0.04)) {
              tone({ freq: vary(1180), type: 'sine', dur: 0.18, peak: 0.10 + e.mag * 0.06 });
              tone({ freq: vary(1480), type: 'sine', dur: 0.16, peak: 0.05, detune: 8 });
              noise({ dur: 0.06, peak: 0.04, filter: 'highpass', freq: 3000 });
            }
          } else if (ok('dd', 0.04)) {                   // стальной колосс: низкий металлический удар
            tone({ freq: vary(95), type: 'triangle', dur: 0.22, peak: 0.16 + e.mag * 0.08, sweep: 0.5 });
            noise({ dur: 0.14, peak: 0.10 + e.mag * 0.05, filter: 'lowpass', freq: vary(440), sweep: 0.5 });
          }
          break;
        case 'heal':                                     // тёплый тон (квинта), мягкий
          if (ok('heal', 0.05)) { tone({ freq: 523, type: 'sine', dur: 0.3, peak: 0.05 + e.mag * 0.03 }); tone({ freq: 784, type: 'sine', dur: 0.3, peak: 0.035 }); }
          break;
        case 'enemy-hit':                                // короткий тик попадания
          if (ok('hit', 0.045)) noise({ dur: 0.04, peak: 0.045, filter: 'bandpass', freq: vary(2600), q: 3 });
          break;
        case 'enemy-death':
          if (e.big) { if (ok('bigdeath', 0.05)) { tone({ freq: vary(70), type: 'sine', dur: 0.4, peak: 0.24, sweep: 0.4 }); noise({ dur: 0.3, peak: 0.13, filter: 'lowpass', freq: 600, sweep: 0.4 }); } } // тяжёлый бум толстяка
          else if (ok('death', 0.04)) noise({ dur: 0.12, peak: 0.07, filter: 'lowpass', freq: vary(900), sweep: 0.5 });
          break;
        case 'pulse':                                    // вжух конуса D + низкий толчок
          if (ok('pulse', 0.08)) { noise({ dur: 0.25, peak: 0.15, filter: 'lowpass', freq: 1200, sweep: 0.25 }); tone({ freq: vary(110), type: 'sawtooth', dur: 0.18, peak: 0.1, sweep: 0.5 }); }
          break;
        case 'repulse':                                  // толстяк: тяжёлая волна отброса (низкий бум + гул)
          if (ok('repulse', 0.12)) { tone({ freq: vary(80), type: 'sine', dur: 0.35, peak: 0.22, sweep: 0.5 }); noise({ dur: 0.3, peak: 0.16, filter: 'lowpass', freq: 900, sweep: 0.4 }); }
          break;
        case 'boss-appear':                              // §босс: низкий зловещий гул, медленно вверх
          tone({ freq: 44, type: 'sine', dur: 3.0, peak: 0.3, sweep: 1.7 });
          tone({ freq: 66, type: 'sine', dur: 3.0, peak: 0.16, detune: -12 });
          noise({ dur: 2.5, peak: 0.08, filter: 'lowpass', freq: 220 });
          break;
        case 'boss-dead':                                // §босс: тяжёлый обвал
          tone({ freq: 90, type: 'sine', dur: 1.2, peak: 0.3, sweep: 0.3 });
          tone({ freq: 140, type: 'sawtooth', dur: 0.8, peak: 0.16, sweep: 0.4 });
          noise({ dur: 0.8, peak: 0.2, filter: 'lowpass', freq: 1000, sweep: 0.3 });
          break;
        case 'fury':                                     // §6: резкий диссонантный кластер + бум
          tone({ freq: 160, type: 'sawtooth', dur: 0.7, peak: 0.15 });
          tone({ freq: 226, type: 'sawtooth', dur: 0.7, peak: 0.13, detune: 20 });
          tone({ freq: 95, type: 'sine', dur: 0.8, peak: 0.2, sweep: 0.5 });
          noise({ dur: 0.5, peak: 0.16, filter: 'lowpass', freq: 800 });
          break;
      }
    }
  }

  return { setEnabled, isEnabled: () => enabled, handle, update };
}

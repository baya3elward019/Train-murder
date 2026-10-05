/* القطار الأخير — الصوت
   كل الأصوات متولّدة بالكود (WebAudio)، فمفيش ملفات لازم تتحمّل.
   عايز تستعمل ملف حقيقي بدل صوت؟ حطه في فولدر audio/ وسجّله هنا:
     LT.audio.files.door = 'audio/door.mp3';
   أي id له ملف هيتشغل من الملف، والباقي يفضل متولّد. */
(() => {
  'use strict';
  const LT = window.LT = window.LT || {};
  let ac = null, master = null, noiseBuf = null;
  const loops = {}, buffers = {};

  const A = LT.audio = {
    files: {},           // id -> مسار ملف صوت (اختياري)
    volume: 0.7,
    ready: false,

    init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = A.volume; master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        A.ready = true;
        Object.keys(A.files).forEach(load);
        A.loop('train', true); A.loop('rain', true);
        setInterval(() => { if (loops.train && loops.train.on) { A.play('clack'); } }, 920);
      } catch (e) { ac = null; }
    },
    setVolume(v) { A.volume = v; if (master) master.gain.value = v; },

    /* صوت لمرة واحدة */
    play(id, opt) {
      if (!ac) return;
      if (buffers[id]) { const s = ac.createBufferSource(); s.buffer = buffers[id]; s.connect(master); s.start(); return; }
      const fn = ONE[id];
      if (fn) fn(opt || {});
    },
    /* صوت مستمر: تشغيل أو إيقاف */
    loop(id, on, level) {
      if (!ac) return;
      let L = loops[id];
      if (!L) { if (!LOOP[id]) return; L = loops[id] = LOOP[id](); L.on = false; }
      L.on = on;
      L.gain.gain.setTargetAtTime(on ? (level == null ? L.level : level) : 0, ac.currentTime, 0.4);
    },
    level(id, v) { const L = loops[id]; if (L && ac) L.gain.gain.setTargetAtTime(v, ac.currentTime, 0.1); }
  };

  function load(id) {
    fetch(A.files[id]).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { buffers[id] = buf; }).catch(() => { /* نرجع للصوت المتولّد */ });
  }

  /* ---------- أدوات التوليد ---------- */
  function noise(loop) { const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = !!loop; return n; }
  function filt(type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function burst(delay, vol, freq, len, type) {
    const n = noise(), b = filt(type || 'lowpass', freq), g = ac.createGain(), t = ac.currentTime + delay;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(b).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + len + 0.05);
  }
  function tone(delay, freq, len, vol, type, slide) {
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.05);
  }
  function mkLoop(build, level) {
    const g = ac.createGain(); g.gain.value = 0; g.connect(master);
    build(g);
    return { gain: g, level };
  }

  const LOOP = {
    train: () => mkLoop(g => { const n = noise(true); n.connect(filt('lowpass', 170)).connect(g); n.start(); }, 0.5),
    rain: () => mkLoop(g => { const n = noise(true); n.connect(filt('highpass', 5200)).connect(g); n.start(); }, 0.03),
    wind: () => mkLoop(g => {
      const n = noise(true), b = filt('bandpass', 420, 2.5), lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 0.18; lg.gain.value = 180; lfo.connect(lg).connect(b.frequency); lfo.start();
      n.connect(b).connect(g); n.start();
    }, 0.12),
    drone: () => mkLoop(g => {
      [55, 82.4, 110.6].forEach((f, i) => { const o = ac.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; const og = ac.createGain(); og.gain.value = i ? 0.25 : 0.5; o.connect(og).connect(g); o.start(); });
    }, 0.07),
    tick: () => mkLoop(g => {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'square'; o.frequency.value = 1900; og.gain.value = 0;
      const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1;
      const sh = ac.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) c[i] = i > 250 ? 1 : 0; sh.curve = c;
      lfo.connect(sh).connect(og.gain); o.connect(og).connect(g); o.start(); lfo.start();
    }, 0.05),
    static: () => mkLoop(g => { const n = noise(true); n.connect(filt('bandpass', 2200, 0.8)).connect(g); n.start(); }, 0.08),
    carrier: () => mkLoop(g => { const o = ac.createOscillator(); o.frequency.value = 620; o.connect(g); o.start(); }, 0.03)
  };

  const ONE = {
    clack: () => { burst(0, 0.16, 420, 0.07); burst(0.14, 0.11, 420, 0.07); },
    step: () => { burst(0, 0.22, 260, 0.09); burst(0.28, 0.2, 240, 0.09); burst(0.56, 0.2, 260, 0.09); },
    door: () => { burst(0, 0.35, 900, 0.12, 'bandpass'); tone(0.02, 140, 0.25, 0.12, 'triangle', 70); burst(0.3, 0.4, 300, 0.2); },
    clue: () => { tone(0, 660, 0.5, 0.08); tone(0.09, 990, 0.6, 0.07); tone(0.2, 1320, 0.8, 0.05); },
    link: () => { tone(0, 523, 0.3, 0.07, 'triangle'); tone(0.12, 784, 0.5, 0.07, 'triangle'); },
    nope: () => { tone(0, 180, 0.2, 0.08, 'triangle', 120); },
    blip: o => { tone(0, (o.pitch || 200) * (0.94 + Math.random() * 0.12), 0.05, 0.035, 'square'); },
    page: () => { burst(0, 0.12, 3000, 0.16, 'highpass'); },
    warn: () => { tone(0, 220, 0.9, 0.09, 'sawtooth', 110); tone(0.05, 233, 0.9, 0.07, 'sawtooth', 116); },
    bell: () => { tone(0, 1568, 0.9, 0.06); tone(0.01, 2093, 0.7, 0.04); tone(0.25, 1568, 0.9, 0.05); },
    thunder: () => { burst(0.2, 0.55, 110, 1.6); burst(0.5, 0.35, 70, 2.2); },
    chime: () => { tone(0, 440, 1.6, 0.06); tone(0, 554, 1.6, 0.04); },
    stab: () => { tone(0, 98, 1.8, 0.12, 'sawtooth', 49); burst(0, 0.3, 200, 0.6); },
    safe: () => { burst(0, 0.3, 1800, 0.04, 'bandpass'); },
    open: () => { burst(0, 0.4, 500, 0.15); tone(0.1, 330, 0.6, 0.06); tone(0.2, 495, 0.8, 0.06); }
  };
})();

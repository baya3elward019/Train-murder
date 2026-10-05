/* القطار الأخير — رسم المشهد
   كل الجرافيك مرسوم بالكود على canvas: العربيات الخمسة، الشخصيات، الشبابيك، المطر، الكشاف.
   الملف ده بيقرا الحالة من المحرك وما بيغيّرهاش. الواجهة بتستقبل الضغطات عن طريق S.onPick. */
(() => {
  'use strict';
  const LT = window.LT, E = LT.engine;
  const CW = 1400, FLOOR = 456, TAU = Math.PI * 2;
  const R = (a, b) => a + Math.random() * (b - a);

  const LOOKS = {
    nabil: { coat: '#4a5568', dark: '#2f3848', skin: '#dcb590', hat: 'bowler', glasses: 1, stache: '#9a9aa0', sc: 1, seed: 1 },
    safiya: { coat: '#5a2f5e', dark: '#3b1d3f', skin: '#e0b894', hat: 'wide', pearls: 1, grey: 1, lips: 1, cane: 1, sc: 0.9, seed: 2 },
    awad: { coat: '#1f3157', dark: '#131f3a', skin: '#c99a72', hat: 'cap', stache: '#2a1b12', uniform: 1, sc: 1, seed: 3 },
    layla: { coat: '#2f6b55', dark: '#1c4636', skin: '#e3bd9a', hat: 'beret', bob: 1, lips: 1, sc: 0.9, seed: 4 },
    victor: { coat: '#7a2b33', dark: '#4e1a20', skin: '#e0b894', hat: 'top', monocle: 1, beard: '#4a3626', sc: 1.04, seed: 5 },
    zakaria: { coat: '#e8e2d2', dark: '#bdb6a2', skin: '#b98660', hat: 'fez', bowtie: 1, stache: '#2a1b12', sc: 0.97, seed: 6 },
    raafat: { coat: '#d9d2bd', dark: '#a9a18a', skin: '#d8b08c', hat: 'fez', stache: '#b9b9bd', sc: 1, seed: 7 }
  };
  const WINDOWS = { first: [180, 460, 740, 1020], saloon: [180, 460, 1020], buffet: [180, 460], second: [180, 460, 740], mail: [180] };
  const LAMPS = { first: [130, 410, 690, 970, 1200], saloon: [130, 410, 960, 1260], buffet: [130, 410, 700, 1240], second: [410, 690, 960], mail: [130, 520, 900] };

  const S = LT.scene = {
    cv: null, ctx: null, W: 0, H: 0, s: 1, ox: 0, oy: 0, vw: 960,
    cam: 0, camT: 0, px: 700, py: 300, T: 0, L: 0, nextL: 8,
    light: 'on', dark: 0.18, fade: 0, fadeTarget: 0, fadeRes: null,
    tunnel: false, tun: 0, flick: 0, shadow: -1, nextShadow: 25,
    walkers: [], hover: null, active: false, idle: true, edge: 0,
    onPick: null, fxOn: true,
    CW,

    init(cv) {
      S.cv = cv; S.ctx = cv.getContext('2d');
      S.dk = document.createElement('canvas'); S.dctx = S.dk.getContext('2d');
      addEventListener('resize', S.resize); S.resize();
      let down = null, dragged = false;
      const pos = e => { const r = cv.getBoundingClientRect(), d = S.W / r.width; return [(e.clientX - r.left) * d, (e.clientY - r.top) * d]; };
      cv.addEventListener('pointerdown', e => { down = pos(e); dragged = false; S.point(down[0], down[1]); });
      cv.addEventListener('pointermove', e => {
        if (S.idle) return;
        const p = pos(e);
        if (down) {
          const dx = p[0] - down[0];
          if (dragged || Math.abs(dx) > 10 * (S.W / cv.clientWidth)) { dragged = true; S.camT -= dx / S.s; down = p; }
        }
        S.edge = e.pointerType === 'mouse' && !down ? p[0] / S.W : 0.5;
        S.point(p[0], p[1]);
      });
      const up = e => {
        if (down && !dragged && !S.idle && S.active && S.onPick) { const p = pos(e); S.point(p[0], p[1]); S.onPick(S.hit()); }
        down = null;
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', () => { down = null; });
      cv.addEventListener('pointerleave', () => { S.edge = 0.5; });
      requestAnimationFrame(frame);
    },
    resize() {
      const r = S.cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      S.W = S.cv.width = S.dk.width = Math.max(2, r.width * d | 0);
      S.H = S.cv.height = S.dk.height = Math.max(2, r.height * d | 0);
      S.s = Math.min(S.H / 540, S.W / 420);
      S.vw = S.W / S.s;
      S.oy = Math.max(0, (S.H - 540 * S.s) * 0.3);
    },
    point(sx, sy) { S.px = (sx - S.ox) / S.s; S.py = (sy - S.oy) / S.s; },
    maxCam() { return Math.max(0, CW - S.vw); },
    focus(x, snap) { S.camT = x - S.vw / 2; if (snap) { S.cam = Math.max(0, Math.min(S.maxCam(), S.camT)); S.px = Math.max(120, Math.min(CW - 120, x)); S.py = 320; } },
    lights(mode) { S.light = mode; },
    fadeTo(v) { S.fadeTarget = v; return new Promise(res => { S.fadeRes = res; }); },
    flicker() { S.flick = 1.6; },
    walk(id, fromX, toX) {
      return new Promise(res => S.walkers.push({ id, x: fromX, to: toX, res }));
    },

    /* كل اللي ممكن يتداس عليه في العربة الحالية */
    items() {
      const G = E.G, C = E.C, out = [];
      if (!G || S.idle) return out;
      const loc = G.loc, li = C.locations.findIndex(l => l.id === loc);
      C.hotspots.forEach(h => {
        if (h.loc !== loc || (h.phase !== 'both' && (h.phase || 'play') !== G.phase) || !E.cond(h.cond) || (h.hideWhen && E.cond(h.hideWhen))) return;
        out.push({ type: 'hs', id: h.id, h, x: h.x, y: h.y, r: h.r || 38, name: h.name, flash: h.flash });
      });
      if (G.phase === 'play') Object.keys(C.bags).forEach(id => {
        const b = C.chars[id].bag;
        if (b.loc === loc) out.push({ type: 'bag', id, x: b.x, y: 436, r: 36, name: b.inside || ('شنطة ' + C.chars[id].short) });
      });
      E.charsAt(loc).forEach(id => out.push({ type: 'char', id, x: S.charX(id), y: 330, name: C.chars[id].short }));
      if (li > 0) out.push({ type: 'door', dir: -1, x: 58, y: 320, name: C.locations[li - 1].name });
      if (li < C.locations.length - 1) out.push({ type: 'door', dir: 1, x: CW - 58, y: 320, name: C.locations[li + 1].name });
      return out;
    },
    charX(id) {
      const G = E.G;
      if (G.phase === 'intro') return G.pos[id].x;
      return (E.C.chars[id].slot || {})[G.loc] || 700;
    },
    hit() {
      const its = S.items(), x = S.px, y = S.py;
      let best = null, bd = 1e9;
      for (const it of its) {
        if (it.type !== 'hs' && it.type !== 'bag') continue;
        const d = Math.hypot(x - it.x, y - it.y);
        if (d < it.r && d < bd) { bd = d; best = it; }
      }
      if (best) return best;
      for (const it of its) if (it.type === 'char' && Math.abs(x - it.x) < 58 && y > 170 && y < 470) return it;
      for (const it of its) if (it.type === 'door' && Math.abs(x - it.x) < 55 && y > 150 && y < 470) return it;
      return null;
    },

    portrait(cv, id, expr) {
      const c = cv.getContext('2d'), w = cv.width, h = cv.height;
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b1b14'); g.addColorStop(1, '#120c09');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,196,110,.10)'; c.beginPath(); c.arc(w * 0.5, h * 0.42, w * 0.55, 0, TAU); c.fill();
      c.save(); c.translate(w / 2, h * 1.92); c.scale(w / 150, w / 150);
      drawChar(c, id, { bust: true, expr, look: { x: 0, y: 0 } });
      c.restore();
    }
  };

  /* ====================== أدوات رسم ====================== */
  let ctx;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const fr = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const circ = (c, x, y, r) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const lampOn = () => S.light === 'on' ? 1 : S.light === 'dim' ? 0.45 : 0;
  const flickV = x => { const f = S.flick > 0 ? (Math.sin(S.T * 40 + x) > 0 ? 1 : 0.1) : 1; return (0.8 + 0.2 * Math.sin(S.T * 9 + x) * Math.sin(S.T * 2.3)) * f * (1 - S.tun); };

  function win(x, y, w, h, open) {
    const T = S.T, c = ctx;
    c.save(); rr(x, y, w, h, 10); c.clip();
    if (S.tun > 0.5) {
      fr('#020308', x, y, w, h);
      const lx = x + w - ((T * 900 + x) % (w + 300));
      c.fillStyle = 'rgba(255,190,110,.5)'; c.fillRect(lx, y + 30, 60, 5);
    } else {
      let g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#0a1230'); g.addColorStop(1, '#22365c'); c.fillStyle = g; c.fillRect(x, y, w, h);
      if (S.L > 0) fr(`rgba(210,225,255,${S.L * 0.7})`, x, y, w, h);
      circ('#e9e4c9', 1105, 128, 16); circ('#0d1634', 1098, 123, 14);
      c.fillStyle = '#0c1730'; c.beginPath(); c.moveTo(x, y + h);
      for (let i = 0; i <= w; i += 8) { const u = i + x + T * 35; c.lineTo(x + i, y + h - 50 - Math.sin(u * 0.011) * 20 - Math.sin(u * 0.027) * 9); }
      c.lineTo(x + w, y + h); c.fill();
      c.fillStyle = '#060c1c'; c.beginPath(); c.moveTo(x, y + h);
      for (let i = 0; i <= w; i += 6) { const u = i + x + T * 230; c.lineTo(x + i, y + h - 16 - Math.abs(Math.sin(u * 0.035)) * 30 * (0.6 + 0.4 * Math.sin(u * 0.007))); }
      c.lineTo(x + w, y + h); c.fill();
      const pp = CW - ((T * 520) % (CW + 600)); c.strokeStyle = '#040814'; c.lineWidth = 5; c.beginPath(); c.moveTo(pp, y); c.lineTo(pp, y + h); c.stroke();
      const fx = ((T * 90) % 2300) - 200; fr('#ffcf7a', 1500 - fx, y + h - 60, 5, 4); fr('#ffcf7a', 1512 - fx, y + h - 60, 5, 4);
      if (S.shadow >= 0) { const sx = -80 + S.shadow * (CW + 160); circ('#01030a', sx, y + 62, 26); c.beginPath(); c.ellipse(sx, y + h + 20, 58, 100, 0, 0, TAU); c.fill(); }
      /* ضباب على القزاز من تحت */
      g = c.createLinearGradient(0, y + h - 46, 0, y + h); g.addColorStop(0, 'rgba(160,180,210,0)'); g.addColorStop(1, 'rgba(160,180,210,.16)'); c.fillStyle = g; c.fillRect(x, y + h - 46, w, 46);
    }
    if (S.fxOn) {
      c.strokeStyle = 'rgba(190,210,255,.28)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < 22; i++) { const rx = x + ((i * 61 + T * (260 + i % 4 * 50)) % (w + 40)) - 20, ry = y + ((i * 37 + T * (420 + i % 3 * 80)) % (h + 30)) - 15; c.moveTo(rx, ry); c.lineTo(rx - 7, ry + 17); }
      c.stroke();
      /* نقط مطر بتنزل على القزاز */
      c.fillStyle = 'rgba(200,220,255,.35)';
      for (let i = 0; i < 5; i++) { const dx = x + 20 + ((i * 47 + x) % (w - 40)), dy = y + ((T * (14 + i * 5) + i * 60) % h); c.fillRect(dx, dy, 1.6, 9); }
    }
    /* انعكاس نور اللمبة على القزاز */
    const lo = lampOn() * 0.07;
    if (lo > 0 && !open) { c.fillStyle = `rgba(255,214,150,${lo})`; c.beginPath(); c.moveTo(x + w * 0.1, y); c.lineTo(x + w * 0.3, y); c.lineTo(x + w * 0.05, y + h); c.lineTo(x - w * 0.15, y + h); c.fill(); c.beginPath(); c.moveTo(x + w * 0.42, y); c.lineTo(x + w * 0.5, y); c.lineTo(x + w * 0.25, y + h); c.lineTo(x + w * 0.17, y + h); c.fill(); }
    c.restore();
    c.strokeStyle = '#b88a3a'; c.lineWidth = 6; rr(x, y, w, h, 10); c.stroke();
    c.lineWidth = 3; c.beginPath();
    if (open) { c.moveTo(x, y + h * 0.36); c.lineTo(x + w, y + h * 0.36); c.moveTo(x, y + h * 0.42); c.lineTo(x + w, y + h * 0.42); }
    else { c.moveTo(x, y + h * 0.36); c.lineTo(x + w, y + h * 0.36); }
    c.stroke();
    const sw = Math.sin(T * (open ? 5 : 1.3) + x) * (open ? 14 : 4);
    c.fillStyle = '#5b1f2a';
    for (const d of [0, 1]) {
      const cx = d ? x + w + 6 : x - 6, dir = d ? -1 : 1;
      c.beginPath(); c.moveTo(cx, y - 10); c.lineTo(cx + dir * 44, y - 10); c.quadraticCurveTo(cx + dir * (30 + sw), y + h * 0.5, cx + dir * (14 + (open ? sw : 0)), y + h + 8); c.lineTo(cx, y + h + 8); c.fill();
    }
    c.fillStyle = '#b88a3a'; c.fillRect(x - 14, y - 14, w + 28, 5);
  }

  function lamp(x) {
    const v = lampOn() * flickV(x);
    fr('#b88a3a', x - 10, 62, 20, 8);
    if (v > 0.02) { circ(`rgba(255,196,110,${0.22 * v})`, x, 80, 40); circ(`rgba(255,214,140,${0.5 + 0.5 * v})`, x, 78, 8); }
    else circ('#5a4a30', x, 78, 8);
    ctx.strokeStyle = '#b88a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, 78, 11, 0, Math.PI); ctx.stroke();
  }

  function door(x, label, exists) {
    fr('#1b110b', x - 46, 150, 92, 310);
    fr(exists ? '#4a2f1d' : '#2a1b12', x - 40, 156, 80, 300);
    ctx.strokeStyle = '#b88a3a'; ctx.lineWidth = 2; ctx.strokeRect(x - 34, 250, 68, 196);
    circ('#0a1230', x, 205, 22); ctx.strokeStyle = '#b88a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, 205, 22, 0, TAU); ctx.stroke();
    if (exists) { circ('#d9a441', x + (x < 700 ? 26 : -26), 330, 5); const v = 0.5 + 0.5 * Math.sin(S.T * 2); fr(`rgba(217,164,65,${0.5 + 0.4 * v})`, x - 24, 136, 48, 9); }
  }

  function bench(x, wood) {
    if (wood) {
      fr('#3a2416', x + 8, 430, 10, 28); fr('#3a2416', x + 202, 430, 10, 28);
      for (let i = 0; i < 6; i++) fr(i % 2 ? '#6b4a2c' : '#7a5633', x, 300 + i * 17, 220, 14);
      fr('#5a3d22', x - 4, 404, 228, 26);
      return;
    }
    fr('#3a2416', x + 10, 430, 12, 28); fr('#3a2416', x + 228, 430, 12, 28);
    ctx.fillStyle = '#6d1f2b'; rr(x, 292, 250, 116, 14); ctx.fill();
    ctx.fillStyle = '#571722'; for (let i = 1; i < 4; i++) ctx.fillRect(x + i * 62, 300, 3, 100);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) circ('#d9a441', x + 32 + i * 62, 322 + j * 46, 3);
    ctx.fillStyle = '#82283a'; rr(x - 6, 400, 262, 32, 8); ctx.fill();
    fr('#efe6d0', x + 70, 286, 110, 12);
  }

  /* ====================== العربيات ====================== */
  function base(type, loc) {
    const c = ctx, C = E.C, li = C ? C.locations.findIndex(l => l.id === loc) : 1;
    const pal = { first: ['#402a1f', '#2b1b14'], saloon: ['#3a2230', '#26141c'], buffet: ['#3b2d22', '#281d15'], second: ['#2e3a33', '#1e2722'], mail: ['#31261c', '#1f1711'] }[type];
    let g = c.createLinearGradient(0, 0, 0, 460); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); c.fillStyle = g; c.fillRect(-300, -200, CW + 600, 660);
    if (type === 'saloon') { c.fillStyle = 'rgba(217,164,65,.10)'; for (let x = 0; x < CW; x += 44) for (let y = 70; y < 262; y += 44) { c.beginPath(); c.moveTo(x + ((y / 44) % 2) * 22, y); c.lineTo(x + 7 + ((y / 44) % 2) * 22, y + 9); c.lineTo(x + ((y / 44) % 2) * 22, y + 18); c.lineTo(x - 7 + ((y / 44) % 2) * 22, y + 9); c.fill(); } }
    if (type === 'mail') { c.fillStyle = '#1a130d'; for (let y = 90; y < 460; y += 46) c.fillRect(-300, y, CW + 600, 3); }
    else { c.fillStyle = 'rgba(0,0,0,.28)'; for (let x = -280; x < CW + 300; x += type === 'second' ? 36 : 70) c.fillRect(x, 270, 3, 190); }
    fr(type === 'second' ? '#3d4a41' : '#4a3424', -300, 262, CW + 600, 8);
    fr('#140c08', -300, -200, CW + 600, 258);
    c.strokeStyle = '#b88a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-300, 66); c.lineTo(CW + 300, 66); c.stroke();
    if (type === 'first' || type === 'second') for (let x = 120; x < CW - 100; x += 60) { c.beginPath(); c.moveTo(x, 66); c.lineTo(x + 10, 46); c.stroke(); }
    WINDOWS[type].forEach(x => win(x, 92, 200, 160, type === 'saloon' && x === 1020 && E.G && !E.has('window_closed')));
    LAMPS[type].forEach(lamp);
    /* الأرضية */
    if (type === 'buffet') { for (let x = -300; x < CW + 300; x += 46) for (let r = 0; r < 14; r++) fr(((x / 46 | 0) + r) % 2 ? '#2a2420' : '#c9c0aa', x, 456 + r * 34, 46, 34); g = c.createLinearGradient(0, 456, 0, 760); g.addColorStop(0, 'rgba(10,6,4,.4)'); g.addColorStop(1, 'rgba(10,6,4,.92)'); c.fillStyle = g; c.fillRect(-300, 456, CW + 600, 500); }
    else if (type === 'first' || type === 'saloon') {
      g = c.createLinearGradient(0, 456, 0, 600); g.addColorStop(0, '#4a1c24'); g.addColorStop(1, '#210b10'); c.fillStyle = g; c.fillRect(-300, 456, CW + 600, 700);
      c.strokeStyle = 'rgba(217,164,65,.2)'; c.lineWidth = 2; for (let x = -280; x < CW + 300; x += 46) { c.beginPath(); c.moveTo(x, 478); c.lineTo(x + 23, 500); c.lineTo(x + 46, 478); c.stroke(); }
    } else {
      g = c.createLinearGradient(0, 456, 0, 600); g.addColorStop(0, '#3d2c1c'); g.addColorStop(1, '#1c130b'); c.fillStyle = g; c.fillRect(-300, 456, CW + 600, 700);
      c.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 474; y < 1100; y += 22) c.fillRect(-300, y, CW + 600, 2);
    }
    door(58, '', li > 0); door(CW - 58, '', C ? li < C.locations.length - 1 : true);
  }

  function wcDoor(x) {
    fr('#1b110b', x - 46, 186, 92, 274); fr('#3a2a1d', x - 40, 192, 80, 264);
    ctx.fillStyle = '#b88a3a'; rr(x - 24, 206, 48, 20, 3); ctx.fill();
    ctx.fillStyle = '#1d1a14'; ctx.font = '700 12px "IBM Plex Sans Arabic",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('حمّام', x, 220);
    fr('#8a6a2c', x - 34, 322, 16, 16); circ('#d9a441', x - 26, 330, 4);
  }

  const CARS = {
    first() {
      bench(150); bench(520); bench(900);
      fr('#3a2416', 338, 392, 14, 64); fr('#5a3d22', 310, 388, 72, 6);
      ctx.fillStyle = '#6b4a2c'; rr(525, 34, 76, 34, 6); ctx.fill(); ctx.fillStyle = '#a8343c'; ctx.fillRect(525, 48, 76, 5);
      ctx.fillStyle = '#3d2814'; rr(700, 40, 90, 28, 4); ctx.fill();
      wcDoor(1268);
    },
    saloon() {
      /* سجادة */
      ctx.fillStyle = '#5a2030'; ctx.beginPath(); ctx.ellipse(700, 500, 420, 34, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d9a44155'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(700, 500, 396, 26, 0, 0, TAU); ctx.stroke();
      /* فتحة تهوية */
      fr('#8a6a2c', 270, 58, 60, 30); ctx.fillStyle = '#1b110b'; for (let i = 0; i < 5; i++) ctx.fillRect(276 + i * 11, 62, 6, 22);
      /* ساعة الحيطة */
      circ('#b88a3a', 705, 150, 30); circ('#efe6d0', 705, 150, 25);
      const m = E.G ? (E.C.times.base + E.G.t) : 1330, ha = (m / 720) * TAU - TAU / 4, ma = (m / 60) * TAU - TAU / 4;
      ctx.strokeStyle = '#1d1a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(705, 150); ctx.lineTo(705 + Math.cos(ha) * 13, 150 + Math.sin(ha) * 13); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(705, 150); ctx.lineTo(705 + Math.cos(ma) * 20, 150 + Math.sin(ma) * 20); ctx.stroke();
      fr('#3a2416', 700, 180, 10, 46); circ('#d9a441', 705 + Math.sin(S.T * 3.14) * 9, 228, 7);
      /* لوحة الكوبري */
      fr('#b88a3a', 795, 106, 130, 100); fr('#1c2a44', 801, 112, 118, 88); fr('#31486b', 801, 160, 118, 40);
      ctx.strokeStyle = '#0d1424'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(801, 158); ctx.lineTo(919, 158); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(801, 158); ctx.quadraticCurveTo(860, 110, 919, 158); for (let x = 815; x < 915; x += 15) { ctx.moveTo(x, 158); ctx.lineTo(x, 158 - Math.sin((x - 801) / 118 * Math.PI) * 24); } ctx.stroke();
      fr('#b88a3a', 835, 212, 50, 9);
      /* ترابيزة جانبية */
      fr('#3a2416', 372, 436, 8, 22); fr('#3a2416', 420, 436, 8, 22); fr('#5a3d22', 350, 428, 100, 9);
      /* كرسي رأفت */
      ctx.fillStyle = '#4e1a22'; rr(518, 268, 134, 170, 22); ctx.fill(); ctx.fillStyle = '#3a121a'; rr(510, 400, 150, 44, 10); ctx.fill();
      fr('#2a1b12', 520, 440, 12, 18); fr('#2a1b12', 638, 440, 12, 18);
      /* مكتب */
      fr('#2a1b12', 826, 372, 16, 86); fr('#2a1b12', 1044, 372, 16, 86);
      ctx.fillStyle = '#5a3d22'; rr(812, 360, 262, 18, 4); ctx.fill(); fr('#4a2f1d', 900, 378, 150, 62);
      ctx.strokeStyle = '#b88a3a'; ctx.lineWidth = 2; ctx.strokeRect(908, 386, 134, 46); circ('#d9a441', 975, 409, 5);
      /* أباجورة خضرا */
      const lv = lampOn() * flickV(3) + 0.25;
      fr('#b88a3a', 1052, 330, 6, 30); ctx.fillStyle = `rgba(60,140,100,${0.6 + 0.4 * Math.min(1, lv)})`; rr(1030, 312, 50, 20, 8); ctx.fill();
      circ(`rgba(180,255,200,${0.10 * lv})`, 1055, 350, 46);
      /* طقم المكتب */
      fr('#c9c9d2', 884, 350, 46, 10); circ('#1d1a14', 896, 348, 7); fr('#8a8a96', 912, 342, 9, 10);
    },
    buffet() {
      /* رفوف وازايز */
      fr('#1b110b', 780, 96, 390, 160); fr('#3a4a52', 790, 104, 370, 144);
      ctx.fillStyle = 'rgba(255,214,150,.05)'; ctx.beginPath(); ctx.moveTo(830, 104); ctx.lineTo(900, 104); ctx.lineTo(840, 248); ctx.lineTo(790, 248); ctx.fill();
      fr('#4a2f1d', 780, 172, 390, 8);
      const cols = ['#7a2b33', '#2f6b55', '#d9a441', '#3b5a8a', '#8a5a2c'];
      for (let i = 0; i < 12; i++) for (let r = 0; r < 2; r++) { const bx = 806 + i * 29, by = r ? 248 : 172; fr(cols[(i + r * 2) % 5], bx, by - 44, 14, 44); fr(cols[(i + r * 2) % 5], bx + 4, by - 58, 6, 16); fr('#efe6d0', bx + 2, by - 28, 10, 12); }
      /* لوحة الأجراس */
      fr('#1b110b', 642, 124, 96, 102); fr('#efe6d0', 648, 130, 84, 90);
      const down7 = E.G && !E.isKiller('victor') && (E.G.phase === 'play' || E.G.t >= 39);
      ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center';
      for (let i = 0; i < 8; i++) { const bx = 660 + (i % 4) * 20, by = 150 + (i / 4 | 0) * 40, dn = i === 6 && down7; fr('#1d1a14', bx - 7, by - 14, 14, 3); fr(dn ? '#a8343c' : '#8d97ad', bx - 6, by - 10 + (dn ? 10 : 0), 12, 12); ctx.fillStyle = '#1d1a14'; ctx.fillText('١٢٣٤٥٦٧٨'[i], bx, by + 24); }
      circ('#d9a441', 690, 118, 9);
      /* ترابيزات */
      for (const tx of [250, 500]) { fr('#2a1b12', tx - 4, 402, 8, 56); ctx.fillStyle = '#efe6d0'; ctx.beginPath(); ctx.ellipse(tx, 400, 62, 9, 0, 0, TAU); ctx.fill(); fr('#3a2416', tx - 98, 416, 34, 6); fr('#3a2416', tx - 96, 420, 5, 38); fr('#3a2416', tx - 70, 420, 5, 38); fr('#3a2416', tx - 98, 370, 5, 50); }
      ctx.fillStyle = '#c98a3a'; rr(240, 380, 14, 18, 2); ctx.fill();
      fr('#3a3a40', 1196, 418, 40, 40); fr('#55555c', 1192, 412, 48, 8);
    },
    buffetFront() {
      ctx.fillStyle = '#4a2f1d'; rr(750, 330, 440, 130, 6); ctx.fill();
      fr('#6b4a2c', 744, 322, 452, 14);
      ctx.strokeStyle = '#b88a3a'; ctx.lineWidth = 2; for (let x = 770; x < 1180; x += 100) ctx.strokeRect(x, 348, 84, 96);
      /* سماور */
      ctx.fillStyle = '#c9963c'; rr(812, 272, 36, 50, 8); ctx.fill(); fr('#8a6a2c', 822, 258, 16, 16); fr('#8a6a2c', 846, 296, 12, 5);
      if (S.fxOn) { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 2; i++) { const o = (S.T * 20 + i * 20) % 40; ctx.moveTo(826 + i * 8, 256 - o); ctx.quadraticCurveTo(834 + i * 8, 246 - o, 826 + i * 8, 236 - o); } ctx.stroke(); }
      for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(240,240,255,.5)'; ctx.fillRect(900 + i * 22, 308, 12, 14); }
    },
    second() {
      bench(300, true); bench(600, true);
      /* دفاية */
      fr('#2a2a2e', 140, 396, 60, 62); fr('#1a1a1e', 150, 410, 40, 26); fr('#2a2a2e', 164, 300, 12, 98);
      /* جدول المواعيد */
      fr('#efe6d0', 840, 118, 82, 118); ctx.fillStyle = '#1d1a14'; for (let i = 0; i < 8; i++) ctx.fillRect(848, 134 + i * 11, 66 - (i % 3) * 14, 2); fr('#a8343c', 848, 124, 66, 5);
      /* كابينة الكمسري */
      fr('#1b110b', 990, 186, 100, 274); fr('#2c3a55', 996, 192, 88, 264);
      ctx.fillStyle = '#b88a3a'; rr(1012, 206, 56, 20, 3); ctx.fill(); ctx.fillStyle = '#1d1a14'; ctx.font = '700 12px "IBM Plex Sans Arabic",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('الكمسري', 1040, 220);
      circ('#b88a3a', 1040, 320, 20); circ('#efe6d0', 1040, 320, 15); ctx.strokeStyle = '#1d1a14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1040, 320); ctx.lineTo(1040, 309); ctx.moveTo(1040, 320); ctx.lineTo(1048, 324); ctx.stroke();
      fr('#3a3f4a', 1096, 396, 44, 62); fr('#8a6a2c', 1114, 420, 8, 12);
      wcDoor(1268);
    },
    mail() {
      /* مكتب التلغراف */
      fr('#2a1b12', 206, 380, 14, 78); fr('#2a1b12', 424, 380, 14, 78); fr('#5a3d22', 196, 368, 252, 14);
      fr('#3a3a40', 240, 350, 62, 18); fr('#b88a3a', 256, 338, 30, 8); circ('#1d1a14', 290, 344, 5);
      fr('#efe6d0', 300, 356, 60, 4);
      /* اللاسلكي */
      ctx.fillStyle = '#3d2814'; rr(350, 312, 76, 56, 6); ctx.fill(); circ(`rgba(111,227,165,${0.5 + 0.3 * Math.sin(S.T * 3)})`, 372, 334, 11); fr('#1d1a14', 392, 324, 26, 20); circ('#b88a3a', 364, 358, 4); circ('#b88a3a', 384, 358, 4);
      ctx.strokeStyle = '#8d97ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(420, 312); ctx.lineTo(432, 250); ctx.stroke();
      fr('#b88a3a', 222, 330, 5, 38); ctx.fillStyle = 'rgba(60,140,100,.9)'; rr(206, 316, 40, 16, 6); ctx.fill();
      /* سلة الشريط */
      ctx.fillStyle = '#6b5a3c'; ctx.beginPath(); ctx.moveTo(424, 420); ctx.lineTo(468, 420); ctx.lineTo(462, 458); ctx.lineTo(430, 458); ctx.fill();
      ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(360, 358); ctx.bezierCurveTo(400, 380, 440, 380, 446, 424); ctx.stroke();
      /* شوالات */
      for (const [sx, sy] of [[510, 458], [560, 458], [536, 426]]) { ctx.fillStyle = '#8a7a5a'; ctx.beginPath(); ctx.ellipse(sx, sy - 20, 28, 24, 0, 0, TAU); ctx.fill(); fr('#6b5a3c', sx - 6, sy - 48, 12, 10); }
      /* صناديق */
      fr('#5a3d22', 690, 366, 130, 92); fr('#4a2f1d', 700, 300, 100, 66); fr('#6b4a2c', 826, 400, 70, 58);
      ctx.strokeStyle = '#2a1b12'; ctx.lineWidth = 3; ctx.strokeRect(690, 366, 130, 92); ctx.strokeRect(700, 300, 100, 66); ctx.strokeRect(826, 400, 70, 58);
      /* الخزنة */
      ctx.fillStyle = '#2f3a3f'; rr(1146, 330, 110, 128, 6); ctx.fill(); ctx.strokeStyle = '#8d97ad'; ctx.lineWidth = 3; rr(1156, 340, 90, 108, 4); ctx.stroke();
      const op = E.G && E.hasEv('file52');
      circ('#b88a3a', 1200, 392, 16); ctx.strokeStyle = '#1d1a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1200, 392); ctx.lineTo(1200 + (op ? 12 : 0), 392 - (op ? 0 : 12)); ctx.stroke();
      fr('#8d97ad', 1228, 380, 8, 26);
    },
    mailFront() {
      /* السلك الفاصل */
      fr('#2a1b12', 606, 58, 12, 400);
      ctx.strokeStyle = 'rgba(141,151,173,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let y = 70; y < 456; y += 14) { ctx.moveTo(618, y); ctx.lineTo(660, y); }
      for (let x = 622; x < 660; x += 12) { ctx.moveTo(x, 66); ctx.lineTo(x, 456); }
      ctx.stroke();
      fr('#2a1b12', 656, 58, 6, 400);
    }
  };

  /* ====================== أشياء صغيرة ====================== */
  const PROPS = {
    paper(x, y) { ctx.fillStyle = '#efe6d0'; ctx.save(); ctx.translate(x, y); ctx.rotate(-0.1); ctx.fillRect(-16, -5, 32, 10); ctx.fillStyle = '#8d97ad'; ctx.fillRect(-12, -2, 20, 1.5); ctx.fillRect(-12, 1, 14, 1.5); ctx.restore(); },
    newspaper(x, y) { ctx.fillStyle = '#d8d0b8'; ctx.save(); ctx.translate(x, y); ctx.rotate(0.06); ctx.fillRect(-24, -6, 48, 12); ctx.fillStyle = '#1d1a14'; ctx.fillRect(-20, -4, 30, 3); ctx.fillStyle = '#8d8676'; ctx.fillRect(-20, 1, 40, 1.5); ctx.restore(); },
    glass(x, y) { ctx.fillStyle = 'rgba(230,240,255,.45)'; ctx.fillRect(x - 6, y - 14, 12, 16); ctx.fillStyle = '#b06a2c'; ctx.fillRect(x - 5, y - 6, 10, 7); },
    cup(x, y) { ctx.fillStyle = '#efe6d0'; rr(x - 9, y - 8, 18, 12, 3); ctx.fill(); ctx.fillStyle = '#c9c0aa'; ctx.beginPath(); ctx.ellipse(x, y + 5, 14, 3, 0, 0, TAU); ctx.fill(); },
    briefcase(x, y) { ctx.fillStyle = '#3d2814'; rr(x - 30, y - 18, 60, 22, 3); ctx.fill(); ctx.fillStyle = '#5a3d22'; ctx.beginPath(); ctx.moveTo(x - 30, y - 18); ctx.lineTo(x - 24, y - 50); ctx.lineTo(x + 36, y - 50); ctx.lineTo(x + 30, y - 18); ctx.fill(); ctx.fillStyle = '#1b110b'; ctx.fillRect(x - 22, y - 44, 50, 22); },
    trunk(x, y) { ctx.fillStyle = '#5a3d22'; rr(x - 34, y - 26, 68, 48, 5); ctx.fill(); ctx.fillStyle = '#3d2814'; ctx.fillRect(x - 20, y - 26, 6, 48); ctx.fillRect(x + 14, y - 26, 6, 48); ctx.fillStyle = '#d9a441'; ctx.fillRect(x - 5, y - 6, 10, 8); ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#efe6d0'; ctx.fillText('V.C', x, y + 14); },
    bellbtn(x, y) { circ('#8a6a2c', x, y, 9); circ('#d9a441', x, y, 5); },
    drop(x, y) { ctx.fillStyle = '#7a1a22'; ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, TAU); ctx.fill(); },
    smear(x, y) { ctx.fillStyle = 'rgba(122,26,34,.8)'; ctx.fillRect(x - 16, y - 2, 30, 5); },
    ampoule(x, y) { ctx.fillStyle = 'rgba(220,235,255,.8)'; ctx.fillRect(x - 9, y - 2, 12, 5); ctx.fillRect(x + 6, y, 5, 3); },
    caneprint(x, y) { ctx.strokeStyle = 'rgba(20,6,8,.7)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 30 + i * 20, y - (i % 2) * 5, 5, 0, TAU); ctx.stroke(); } },
    cigar(x, y) { ctx.fillStyle = '#55555c'; ctx.beginPath(); ctx.ellipse(x, y, 16, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#a8343c'; ctx.fillRect(x - 5, y - 4, 9, 4); ctx.fillStyle = '#d9a441'; ctx.fillRect(x - 2, y - 4, 3, 4); },
    ink(x, y) { ctx.fillStyle = 'rgba(120,70,180,.85)'; ctx.beginPath(); ctx.ellipse(x, y, 6, 8, 0.4, 0, TAU); ctx.fill(); },
    button(x, y) { circ('#d9a441', x, y, 6); circ('#8a6a2c', x - 2, y, 1.2); circ('#8a6a2c', x + 2, y, 1.2); },
    bag(x, y) { ctx.fillStyle = '#5a3d22'; rr(x - 36, y - 32, 72, 52, 6); ctx.fill(); ctx.fillStyle = '#3d2814'; ctx.fillRect(x - 22, y - 32, 7, 52); ctx.fillRect(x + 15, y - 32, 7, 52); ctx.strokeStyle = '#3d2814'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y - 32, 13, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#d9a441'; ctx.fillRect(x - 5, y - 14, 10, 8); }
  };

  /* ====================== الشخصيات ====================== */
  function drawChar(c, id, o) {
    const L = LOOKS[id], T = S.T, e = o.expr || {}, br = Math.sin(T * 1.6 + L.seed) * 2, hy = -262 + br;
    const F = (col) => { c.fillStyle = col; };
    const RR = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
    const CI = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
    c.save(); c.scale(L.sc, L.sc);
    if (!o.bust) {
      F('rgba(0,0,0,.25)'); c.beginPath(); c.ellipse(0, 2, 70, 10, 0, 0, TAU); c.fill();
      F('#16161c'); c.fillRect(-30, -80, 24, 76); c.fillRect(6, -80, 24, 76);
      F('#0b0b0f'); RR(-38, -10, 36, 12, 5); RR(2, -10, 36, 12, 5);
      if (L.cane) { c.strokeStyle = '#2a1b12'; c.lineWidth = 6; c.beginPath(); c.moveTo(74, -100); c.lineTo(84, 0); c.stroke(); F('#d9a441'); CI(73, -104, 8); }
    }
    const cross = e.cross;
    F(L.dark); if (!cross) { RR(-82, -212 + br, 30, 118, 14); RR(52, -212 + br, 30, 118, 14); F(L.skin); CI(-67, -92 + br, 11); CI(67, -92 + br, 11); }
    F(L.coat); c.beginPath(); c.moveTo(-58, -218 + br); c.quadraticCurveTo(0, -236 + br, 58, -218 + br); c.lineTo(72, -52); c.lineTo(-72, -52); c.fill();
    F('#e8e2d2'); c.beginPath(); c.moveTo(-16, -226 + br); c.lineTo(16, -226 + br); c.lineTo(0, -180 + br); c.fill();
    F(L.dark); c.beginPath(); c.moveTo(-30, -228 + br); c.lineTo(0, -170 + br); c.lineTo(30, -228 + br); c.lineTo(44, -190 + br); c.lineTo(3, -150 + br); c.lineTo(3, -52); c.lineTo(-3, -52); c.lineTo(-3, -150 + br); c.lineTo(-44, -190 + br); c.fill();
    F(L.uniform ? '#d9a441' : (id === 'zakaria' || id === 'raafat') ? '#8a8676' : '#d9a441');
    for (let j = 0; j < 3; j++) { CI(14, -136 + j * 28, 4); if (L.uniform) CI(-14, -136 + j * 28, 4); }
    if (L.bowtie) { F('#1d1a14'); c.beginPath(); c.moveTo(0, -214 + br); c.lineTo(-14, -222 + br); c.lineTo(-14, -206 + br); c.fill(); c.beginPath(); c.moveTo(0, -214 + br); c.lineTo(14, -222 + br); c.lineTo(14, -206 + br); c.fill(); }
    if (L.pearls) { F('#f3efe4'); for (let j = -3; j <= 3; j++) CI(j * 7, -210 + br - Math.abs(j) * 2, 3.2); }
    if (cross) { F(L.dark); c.save(); c.translate(0, -150 + br); c.rotate(0.12); RR(-64, -14, 128, 26, 12); c.restore(); c.save(); c.translate(0, -138 + br); c.rotate(-0.12); RR(-64, -14, 128, 26, 12); c.restore(); F(L.skin); CI(-56, -128 + br, 10); CI(58, -160 + br, 10); }
    F(L.skin); c.fillRect(-10, hy + 30, 20, 18);
    if (L.bob) { F('#1a1210'); RR(-42, hy - 36, 84, 84, 26); }
    if (L.grey) { F('#9a9aa2'); CI(0, hy - 8, 40); }
    F(L.skin); c.beginPath(); c.ellipse(0, hy, 34, 40, 0, 0, TAU); c.fill();
    if (L.beard) { F(L.beard); c.beginPath(); c.ellipse(0, hy + 22, 30, 24, 0, 0, Math.PI); c.fill(); }
    /* عيون */
    const lk = o.look || { x: 0, y: 0 }, sh = e.shift ? Math.sin(T * 5) * 3 : 0;
    const dx = Math.max(-3, Math.min(3, lk.x / 30)) + sh, dy = Math.max(-2, Math.min(2, lk.y / 30));
    const bl = e.closed ? 0.1 : ((T * 1.1 + L.seed * 1.7) % 4) < 0.12 ? 0.12 : 1;
    for (const ex of [-13, 13]) {
      F('#f4f0e6'); c.beginPath(); c.ellipse(ex, hy - 5, 7, 5 * bl, 0, 0, TAU); c.fill();
      if (bl > 0.2) { F('#16110c'); CI(ex + dx, hy - 5 + dy, 2.8); }
    }
    /* حواجب: brow موجب = قلق، سالب = غضب */
    const bw = e.brow || 0;
    c.strokeStyle = L.grey || id === 'raafat' || id === 'nabil' ? '#6a6a70' : '#2a1b12'; c.lineWidth = 2.5; c.beginPath();
    c.moveTo(-21, hy - 15 - bw * 4); c.lineTo(-6, hy - 15 + bw * 4); c.moveTo(21, hy - 15 - bw * 4); c.lineTo(6, hy - 15 + bw * 4); c.stroke();
    /* بق */
    const mo = e.mouth || 0;
    c.strokeStyle = L.lips ? '#b23a48' : '#5a3526'; c.lineWidth = L.lips ? 3.5 : 2; c.beginPath(); c.moveTo(-8, hy + 20); c.quadraticCurveTo(0, hy + 20 + mo * 6, 8, hy + 20); c.stroke();
    if (L.stache) { F(L.stache); c.beginPath(); c.ellipse(-9, hy + 13, 11, 4.5, 0.3, 0, TAU); c.ellipse(9, hy + 13, 11, 4.5, -0.3, 0, TAU); c.fill(); }
    /* غطا الراس */
    F('#17171c');
    if (L.hat === 'bowler') { c.beginPath(); c.arc(0, hy - 30, 32, Math.PI, 0); c.fill(); RR(-46, hy - 32, 92, 7, 3); }
    if (L.hat === 'wide') { F(L.dark); c.beginPath(); c.ellipse(0, hy - 32, 66, 11, -0.08, 0, TAU); c.fill(); c.beginPath(); c.ellipse(0, hy - 42, 30, 17, 0, 0, TAU); c.fill(); c.strokeStyle = '#d9a441'; c.lineWidth = 4; c.beginPath(); c.moveTo(22, hy - 46); c.quadraticCurveTo(62, hy - 92, 78, hy - 62 + Math.sin(T * 2) * 3); c.stroke(); }
    if (L.hat === 'cap') { F('#1c2a4a'); RR(-36, hy - 52, 72, 24, 6); F('#0d1424'); RR(-42, hy - 32, 84, 7, 3); F('#d9a441'); CI(0, hy - 41, 6); }
    if (L.hat === 'beret') { F('#1a1210'); c.beginPath(); c.ellipse(0, hy - 26, 34, 16, 0, Math.PI, 0); c.fill(); F('#a8343c'); c.beginPath(); c.ellipse(6, hy - 38, 36, 14, -0.2, 0, TAU); c.fill(); CI(8, hy - 52, 4); }
    if (L.hat === 'top') { RR(-28, hy - 92, 56, 62, 3); RR(-46, hy - 34, 92, 8, 3); F('#a8343c'); c.fillRect(-28, hy - 44, 56, 8); }
    if (L.hat === 'fez') { F('#9c2530'); c.beginPath(); c.moveTo(-26, hy - 30); c.lineTo(-20, hy - 74); c.lineTo(20, hy - 74); c.lineTo(26, hy - 30); c.fill(); c.strokeStyle = '#17171c'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, hy - 74); c.quadraticCurveTo(22, hy - 70, 24, hy - 46 + Math.sin(T * 2) * 2); c.stroke(); }
    if (L.glasses) { c.strokeStyle = '#d9a441'; c.lineWidth = 2; c.beginPath(); c.arc(-13, hy - 5, 10, 0, TAU); c.moveTo(23, hy - 5); c.arc(13, hy - 5, 10, 0, TAU); c.moveTo(-3, hy - 5); c.lineTo(3, hy - 5); c.stroke(); }
    if (L.monocle) { c.strokeStyle = '#d9a441'; c.lineWidth = 2; c.beginPath(); c.arc(13, hy - 5, 10, 0, TAU); c.moveTo(21, hy + 2); c.quadraticCurveTo(40, hy + 40, 26, hy + 64); c.stroke(); }
    if (e.sweat) { F('rgba(190,220,255,.85)'); const sy = (T * 14) % 26; c.beginPath(); c.ellipse(30, hy - 20 + sy, 2.5, 4, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(-31, hy - 8 + ((sy + 12) % 26), 2, 3.5, 0, 0, TAU); c.fill(); }
    c.restore();
  }
  S.exprFor = id => {
    const G = E.G; if (!G || !G.stats[id]) return {};
    const st = G.stats[id], def = st.def > G.t;
    return { brow: def ? -1 : st.stress >= 2 ? 0.8 : 0, mouth: def ? -1 : st.stress >= 3 ? -0.6 : st.trust >= 3 ? 0.6 : 0, sweat: st.stress >= 4, shift: st.stress >= 3, cross: def };
  };

  function deadRaafat() {
    /* قاعد على كرسيه، راسه واقعة على صدره. مسند الكرسي بيترسم فوقه. */
    const L = LOOKS.raafat, hat = L.hat; L.hat = null;
    ctx.save(); ctx.beginPath(); ctx.rect(440, 150, 300, 290); ctx.clip(); ctx.translate(590, 524); ctx.rotate(0.13);
    drawChar(ctx, 'raafat', { bust: true, expr: { closed: true, mouth: -0.5, brow: 0.4 }, look: { x: 0, y: 60 } });
    ctx.restore(); L.hat = hat;
    ctx.fillStyle = '#3a121a'; rr(506, 396, 158, 50, 10); ctx.fill();
    ctx.fillStyle = '#4e1a22'; rr(498, 366, 30, 78, 10); ctx.fill(); rr(642, 366, 30, 78, 10); ctx.fill();
    fr('#2a1b12', 520, 442, 12, 16); fr('#2a1b12', 638, 442, 12, 16);
    ctx.fillStyle = '#9c2530'; ctx.save(); ctx.translate(688, 456); ctx.rotate(1.35); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-10, -30); ctx.lineTo(10, -30); ctx.lineTo(14, 0); ctx.fill(); ctx.restore();
  }

  /* ====================== الإطار ====================== */
  function frame(ts) {
    const t = ts / 1000, dt = Math.min(0.05, t - S.T || 0); S.T = t;
    ctx = S.ctx; S.fxOn = E.meta.fx !== false;
    const G = E.G, C = E.C, W = S.W, H = S.H;
    const loc = G && !S.idle ? G.loc : 'c2';
    const type = C ? C.locations.find(l => l.id === loc).type : 'first';
    /* الكاميرا */
    if (S.idle) { S.camT = (S.maxCam() / 2) * (1 + Math.sin(t * 0.12)); S.px = S.cam + S.vw * (0.5 + 0.3 * Math.sin(t * 0.5)); S.py = 260 + Math.sin(t * 0.8) * 100; }
    else if (S.active) { if (S.edge < 0.07) S.camT -= dt * 520; else if (S.edge > 0.93) S.camT += dt * 520; }
    S.camT = Math.max(0, Math.min(S.maxCam(), S.camT));
    S.cam += (S.camT - S.cam) * Math.min(1, dt * 9);
    S.ox = S.vw >= CW ? (W - CW * S.s) / 2 : -S.cam * S.s;
    /* إضاءة وأحداث جو */
    const target = S.light === 'on' ? 0.16 : S.light === 'dim' ? 0.8 : 0.97;
    S.dark += ((S.tunnel ? 0.985 : target) - S.dark) * Math.min(1, dt * 3);
    S.tun += ((S.tunnel ? 1 : 0) - S.tun) * Math.min(1, dt * 4);
    if (S.flick > 0) S.flick -= dt;
    if (t > S.nextL) { S.L = 1; S.nextL = t + R(10, 24); if (!S.idle || Math.random() < 0.5) LT.audio.play('thunder'); }
    S.L = Math.max(0, S.L - dt * 2.2);
    if (S.shadow < 0 && t > S.nextShadow && G && G.phase === 'play') S.shadow = 0;
    if (S.shadow >= 0) { S.shadow += dt * 0.5; if (S.shadow > 1) { S.shadow = -1; S.nextShadow = t + R(30, 60); } }
    if (S.fade !== S.fadeTarget) { const d = Math.sign(S.fadeTarget - S.fade) * dt * 2.6; S.fade = Math.abs(S.fadeTarget - S.fade) <= Math.abs(d) ? S.fadeTarget : S.fade + d; if (S.fade === S.fadeTarget && S.fadeRes) { const r = S.fadeRes; S.fadeRes = null; r(); } }

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#05070e'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(S.s, 0, 0, S.s, S.ox, S.oy);
    const sway = S.fxOn ? Math.sin(t * 2.1) * 1.5 : 0;
    ctx.save(); ctx.translate(CW / 2, 270); ctx.rotate(S.fxOn ? Math.sin(t * 1.3) * 0.002 : 0); ctx.translate(-CW / 2, -270 + sway);
    base(type, loc); CARS[type]();
    const its = S.items();
    /* شخصيات ورا الأثاث */
    const chars = its.filter(i => i.type === 'char');
    if (type === 'buffet') chars.filter(i => i.x > 760 && i.x < 1180).forEach(drawOne);
    if (CARS[type + 'Front']) CARS[type + 'Front']();
    if (type === 'saloon' && G && E.has('dead')) deadRaafat();
    /* أشياء */
    its.forEach(it => {
      if (it.type === 'bag' && !C.chars[it.id].bag.inside) PROPS.bag(it.x, it.y);
      if (it.type === 'hs' && it.h.prop && PROPS[it.h.prop] && (!it.flash || lit(it, 140))) PROPS[it.h.prop](it.x, it.y);
    });
    chars.filter(i => !(type === 'buffet' && i.x > 760 && i.x < 1180)).forEach(drawOne);
    /* اللي ماشيين */
    for (let i = S.walkers.length - 1; i >= 0; i--) {
      const w = S.walkers[i], dir = Math.sign(w.to - w.x); w.x += dir * dt * 300;
      ctx.save(); ctx.translate(w.x, 462 + Math.abs(Math.sin(t * 9)) * -4); drawChar(ctx, w.id, { look: { x: dir * 60, y: 0 } }); ctx.restore();
      if ((w.to - w.x) * dir <= 0) { S.walkers.splice(i, 1); w.res(); }
    }
    /* علامات التفاعل والاسم */
    S.hover = !S.idle && S.active ? S.hit() : null;
    if (!S.idle && S.active) its.forEach(it => {
      if (it.type !== 'hs' && it.type !== 'bag') return;
      if (it.flash ? !lit(it, 130) : (S.light !== 'on' && !lit(it, 190))) return;
      const p = 0.5 + 0.5 * Math.sin(t * 4 + it.x);
      ctx.strokeStyle = `rgba(255,224,150,${0.35 + 0.45 * p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(it.x, it.y, 9 + p * 3, 0, TAU); ctx.stroke();
      circ('rgba(255,224,150,.9)', it.x, it.y, 2.5);
    });
    if (S.hover) label(S.hover);
    ctx.restore();

    /* الضلمة والكشاف */
    const sx = S.px * S.s + S.ox, sy = S.py * S.s + S.oy, r = 210 * S.s, d = S.dctx;
    d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H); d.fillStyle = `rgba(3,5,12,${Math.max(0, S.dark - S.L * 0.5)})`; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    let g = d.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = g; d.fillRect(sx - r, sy - r, r * 2, r * 2);
    LAMPS[type].forEach(lx => { const v = lampOn() * flickV(lx) * 0.34, x = lx * S.s + S.ox, y = 80 * S.s + S.oy, r2 = 240 * S.s; if (v <= 0) return; g = d.createRadialGradient(x, y, 0, x, y, r2); g.addColorStop(0, `rgba(0,0,0,${v})`); g.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = g; d.fillRect(x - r2, y - r2, r2 * 2, r2 * 2); });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(S.dk, 0, 0);
    if (S.dark > 0.4) { ctx.globalCompositeOperation = 'screen'; g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, 'rgba(255,205,130,.16)'); g.addColorStop(1, 'rgba(255,205,130,0)'); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; }
    /* صبغة الفصل */
    const act = G ? G.act : 1;
    if (!S.idle && act >= 3) { ctx.fillStyle = act >= 5 ? `rgba(140,20,26,${0.08 + 0.04 * Math.sin(t * 2)})` : 'rgba(30,50,110,.08)'; ctx.fillRect(0, 0, W, H); }
    g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (S.fade > 0) { ctx.fillStyle = `rgba(2,3,8,${S.fade})`; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(frame);
  }
  const lit = (it, rad) => Math.hypot(S.px - it.x, S.py - it.y) < rad;
  function drawOne(it) {
    ctx.save(); ctx.translate(it.x, 462);
    drawChar(ctx, it.id, { expr: S.exprFor(it.id), look: Math.hypot(S.px - it.x, S.py - 220) < 220 ? { x: S.px - it.x, y: S.py - 200 } : { x: 0, y: 0 } });
    ctx.restore();
  }
  function label(it) {
    const y = it.type === 'char' ? 170 : it.type === 'door' ? 120 : it.y - 30, txt = it.type === 'door' ? 'باب: ' + it.name : it.name;
    ctx.font = '500 15px "IBM Plex Sans Arabic",sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(txt).width + 20, x = Math.max(S.cam + w / 2 + 6, Math.min(S.cam + S.vw - w / 2 - 6, it.x));
    ctx.fillStyle = 'rgba(7,11,22,.88)'; rr(x - w / 2, y - 20, w, 27, 4); ctx.fill(); ctx.strokeStyle = '#8a6a2c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ece2c8'; ctx.fillText(txt, x, y - 1);
  }
})();

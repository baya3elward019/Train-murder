/* القطار الأخير — محرك اللعبة
   الحالة (G)، الشروط، التأثيرات، الوقت، الأحداث، الحفظ.
   مفيش أي رسم أو DOM هنا: الواجهة بتسمع للأحداث عن طريق E.on(). */
(() => {
  'use strict';
  const LT = window.LT = window.LT || {};
  LT.cases = LT.cases || [];

  const KEY_SAVE = 'lasttrain.save.v2', KEY_META = 'lasttrain.meta.v2';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* التخزين مش متاح */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } }
  };

  function mulberry(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const hooks = {};
  let ticking = false;

  const E = LT.engine = {
    G: null, C: null,
    meta: Object.assign({ endings: {}, seenIntro: false, vol: 0.7, speed: 1, fx: true }, store.get(KEY_META) || {}),
    saveMeta() { store.set(KEY_META, E.meta); },

    on(name, fn) { (hooks[name] = hooks[name] || []).push(fn); },
    emit(name, ...args) { (hooks[name] || []).forEach(fn => fn(...args)); },

    /* ---------- بداية ونهاية ---------- */
    newGame(caseId, seed) {
      const C = E.C = LT.cases.find(c => c.id === caseId) || LT.cases[0];
      seed = seed == null ? (Math.random() * 2 ** 31) | 0 : seed;
      const G = E.G = {
        case: C.id, seed, v: C.setup(mulberry(seed)),
        t: C.times.start, loc: C.startLoc, phase: 'intro', act: 1,
        flags: {}, ev: [], fresh: {}, notes: {}, links: [], stats: {}, fired: {},
        asked: {}, done: {}, tips: {}, pos: {}, queue: [], wrongCode: 0, over: false
      };
      Object.keys(C.chars).forEach(id => { G.stats[id] = { trust: 1, stress: 0, susp: 0, def: 0 }; G.notes[id] = []; });
      return G;
    },
    beginInvestigation() {
      const G = E.G, C = E.C;
      G.phase = 'play'; G.t = C.times.invest; G.loc = C.sceneLoc; G.act = 3; G.pos = {};
      E.fx(C.onInvestigate);
      G.queue.length = 0;
      E.save();
    },
    finish(endingId) {
      E.G.over = true;
      E.meta.endings[E.G.case + ':' + endingId] = 1;
      E.saveMeta(); store.del(KEY_SAVE);
    },

    /* ---------- حفظ ---------- */
    save() { if (E.G && E.G.phase === 'play' && !E.G.over) store.set(KEY_SAVE, E.G); },
    hasSave() { const s = store.get(KEY_SAVE); return !!(s && s.case && LT.cases.find(c => c.id === s.case)); },
    load() {
      const s = store.get(KEY_SAVE);
      if (!s) return false;
      const C = LT.cases.find(c => c.id === s.case);
      if (!C) return false;
      E.C = C; E.G = s; s.queue = s.queue || [];
      return true;
    },
    clearSave() { store.del(KEY_SAVE); },

    /* ---------- قراءة الحالة ---------- */
    has(flag) { return !!E.G.flags[flag]; },
    hasEv(id) { return !!E.G.flags['ev:' + id]; },
    txt(v, ...a) { return typeof v === 'function' ? v(E.G, E, ...a) : v; },
    isKiller(id) { return E.G.v.killer === id; },
    clock(t) {
      const m = E.C.times.base + (t == null ? E.G.t : t), h = Math.floor(m / 60) % 24;
      return ((h + 11) % 12 + 1) + ':' + String(m % 60).padStart(2, '0');
    },
    timeLeft() { return Math.max(0, E.C.times.end - E.G.t); },

    /* شرط: نص ("flag", "!flag", "t>=80", "trust:nabil>=3", "killer:awad", "at:awad:c5")
       أو مصفوفة (كلها لازم تتحقق) أو {any:[...]} أو دالة. */
    cond(c) {
      const G = E.G;
      if (c == null) return true;
      if (typeof c === 'function') return !!c(G, E);
      if (Array.isArray(c)) return c.every(E.cond);
      if (typeof c === 'object') return (c.any || []).some(E.cond);
      if (c[0] === '!') return !E.cond(c.slice(1));
      let m;
      if ((m = c.match(/^t(>=|<)(\d+)$/))) return m[1] === '<' ? G.t < +m[2] : G.t >= +m[2];
      if ((m = c.match(/^(trust|stress|susp):(\w+)(>=|<)(\d+)$/))) {
        const v = G.stats[m[2]][m[1]];
        return m[3] === '<' ? v < +m[4] : v >= +m[4];
      }
      if ((m = c.match(/^killer:(\w+)$/))) return G.v.killer === m[1];
      if ((m = c.match(/^at:(\w+):(\w+)$/))) return E.charLoc(m[1]) === m[2];
      return !!G.flags[c];
    },

    charLoc(id) {
      const G = E.G, ch = E.C.chars[id];
      if (G.phase === 'intro') return G.pos[id] ? G.pos[id].loc : null;
      const sch = E.txt(ch.schedule) || [];
      let loc = null;
      for (const [t, l] of sch) if (G.t >= t) loc = l;
      return loc;
    },
    charsAt(loc) { return Object.keys(E.C.chars).filter(id => E.charLoc(id) === loc); },

    /* ---------- تغيير الحالة ---------- */
    set(flag) {
      if (E.G.flags[flag]) return;
      E.G.flags[flag] = 1; E.emit('flag', flag); E.tick();
    },
    give(id) {
      const G = E.G;
      if (G.flags['ev:' + id] || !E.C.evidence[id]) return false;
      G.flags['ev:' + id] = 1; G.ev.push(id); G.fresh[id] = 1;
      E.emit('evidence', id); E.tick();
      return true;
    },
    stat(id, key, d) {
      const s = E.G.stats[id];
      if (!s) return;
      s[key] = Math.max(0, Math.min(5, s[key] + d));
      E.emit('stat', id, key, d);
    },
    note(who, n) {
      const list = E.G.notes[who];
      if (!list) return;
      const old = n.id && list.find(x => x.id === n.id);
      if (old) { old.text = E.txt(n.text); old.struck = false; } else list.push({ id: n.id || null, text: E.txt(n.text), struck: false });
    },
    strike(who, id) { const n = (E.G.notes[who] || []).find(x => x.id === id); if (n) n.struck = true; },

    /* تأثير: {set, give, trust, stress, susp, note, strike, toast, who} أو دالة بترجّع تأثير */
    fx(f, who) {
      if (!f) return;
      if (typeof f === 'function') return E.fx(f(E.G, E), who);
      if (Array.isArray(f)) return f.forEach(x => E.fx(x, who));
      who = f.who || who;
      (f.set || []).forEach(E.set);
      (f.give || []).forEach(E.give);
      if (who) ['trust', 'stress', 'susp'].forEach(k => { if (f[k]) E.stat(who, k, f[k]); });
      if (f.note) [].concat(f.note).forEach(n => E.note(n.who || who, n));
      if (f.strike) E.strike(who, f.strike);
      if (f.toast) E.emit('toast', E.txt(f.toast));
    },

    /* الوقت بيمشي مع كل تصرف، والأحداث مربوطة بالساعة */
    spend(min) {
      const G = E.G;
      if (G.over || G.phase !== 'play') return;
      G.t += min;
      E.tick();
      E.emit('time');
      E.save();
    },
    tick() {
      const G = E.G, C = E.C;
      if (ticking || !G || G.phase !== 'play') return;
      ticking = true;
      for (const ev of C.events) {
        if (G.fired[ev.id] || G.t < E.txt(ev.t) || !E.cond(ev.cond)) continue;
        G.fired[ev.id] = 1;
        E.fx(ev.fx);
        G.queue.push({ type: 'event', id: ev.id });
      }
      for (const a of C.acts) {
        if (G.act < a.n && a.cond && E.cond(a.cond)) { G.act = a.n; G.queue.push({ type: 'act', n: a.n }); }
      }
      ticking = false;
    },
    timedOut() { return E.G.t >= E.C.times.end; },

    /* ربط دليلين على اللوحة */
    link(a, b) {
      const G = E.G, inn = (x, v) => [].concat(x).includes(v);
      const L = E.C.links.find(l => ((inn(l.a, a) && inn(l.b, b)) || (inn(l.a, b) && inn(l.b, a))) && E.cond(l.cond));
      if (!L) return null;
      if (G.links.find(x => x.id === L.id)) return { dup: true, L };
      G.links.push({ id: L.id, a, b });
      E.fx(L.fx);
      E.save();
      return { L };
    },

    secretsFound() { return Object.keys(E.C.chars).filter(id => E.has('secret:' + id)).length; },
    suspects() { return Object.keys(E.C.chars).filter(id => E.C.chars[id].suspect); }
  };
})();

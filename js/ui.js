/* القطار الأخير — الواجهة
   القوائم، الحوار، ملف القضية ولوحة الأدلة، الألعاب الصغيرة، المواجهة، والنهايات.
   كل تصرف من اللاعب بيعدّي من run() عشان ما يحصلش تصرفين في نفس الوقت. */
(() => {
  'use strict';
  const LT = window.LT, E = LT.engine, S = LT.scene, A = LT.audio;
  const $ = s => document.querySelector(s);
  const el = {};
  ['app', 'stage', 'hud', 'clk', 'left', 'track', 'act', 'loc', 'obj', 'bFile', 'fileDot', 'bAcc', 'bPause', 'mini', 'navL', 'navR', 'toasts', 'card', 'dlg', 'port', 'dn', 'dt', 'dch', 'dnext', 'sheet', 'menu'].forEach(id => { el[id] = document.getElementById(id); });

  const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const never = () => new Promise(() => { });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const TYPE_COL = { 'مادي': '#a8343c', 'شهادة': '#2f4f86', 'ملاحظة': '#2f6b55', 'مستند': '#8a6a2c', 'استنتاج': '#d9a441' };

  let G = null, C = null, busy = false, waiter = null, introObj = '', runId = 0, quiet = false;
  const sync = () => { G = E.G; C = E.C; };
  const locIdx = id => C.locations.findIndex(l => l.id === id);

  /* ====================== إشعارات وكروت ====================== */
  function toast(html, cls, life) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || ''); d.innerHTML = html;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > (innerWidth < 640 ? 2 : 4)) el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), life || 5200);
    return d;
  }
  function tip(id, text) {
    if (!G || G.tips[id]) return;
    G.tips[id] = 1;
    toast('<b>تلميح</b><br>' + esc(text), 'tip', 11600);
  }
  async function card(top, title) {
    el.card.hidden = true; void el.card.offsetWidth;
    el.card.querySelector('span').textContent = top; el.card.querySelector('h2').textContent = title;
    el.card.hidden = false; A.play('chime');
    await wait(2600); el.card.hidden = true;
  }
  E.on('toast', t => { if (!quiet) toast(esc(t)); });
  E.on('evidence', id => {
    el.fileDot.hidden = false;
    if (quiet) return;
    const ev = C.evidence[id];
    toast(`<small>${ev.type === 'استنتاج' ? 'استنتاج جديد' : 'دليل جديد'} · ${esc(ev.type)}</small><b>${esc(ev.name)}</b>`, 'ev');
    A.play('clue');
    tip('ev', 'الدليل اتحفظ في «ملف القضية». افتحه واربط أي دليلين ببعض: الربط الصح بيطلّع استنتاج جديد.');
  });
  E.on('time', () => hud());

  /* ====================== صندوق الحوار ====================== */
  let line = null, portWho = null, portExpr = null;
  setInterval(() => { if (!el.dlg.hidden && portWho) S.portrait(el.port, portWho, portExpr); }, 70);

  function speaker(who, expr) {
    const isChar = who && who !== 'me';
    el.dlg.className = who === 'me' ? 'me' : isChar ? '' : 'narr';
    el.dn.textContent = who === 'me' ? 'إنت' : isChar ? C.chars[who].short : '';
    portWho = isChar ? who : null; portExpr = expr || (isChar ? S.exprFor(who) : null);
    if (portWho) S.portrait(el.port, portWho, portExpr);
  }
  function showLine(who, text, expr) {
    return new Promise(res => {
      el.dlg.hidden = false; el.dch.innerHTML = ''; el.dch.className = ''; el.dnext.hidden = false;
      speaker(who, expr);
      const step = Math.max(1, Math.round(2 * (E.meta.speed || 1))), pitch = who && who !== 'me' ? C.chars[who].pitch : 0;
      let i = 0; el.dt.textContent = '';
      const st = line = { res, full: text, done: false, t0: performance.now() };
      st.timer = setInterval(() => {
        i += step; el.dt.textContent = text.slice(0, i);
        if (pitch && i % 6 < step) A.play('blip', { pitch });
        if (i >= text.length) endTyping();
      }, 24);
    });
  }
  function endTyping() { if (!line || line.done) return; clearInterval(line.timer); line.done = true; el.dt.textContent = line.full; }
  function advance() {
    const st = line;
    if (!st || performance.now() - st.t0 < 220) return;
    if (!st.done) return endTyping();
    line = null; el.dnext.hidden = true; st.res();
  }
  function killLine() { if (line) { clearInterval(line.timer); line = null; } }
  document.addEventListener('pointerup', e => { if (line && !e.target.closest('#sheet,#menu,#dch,.hbtn,#mini')) advance(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { if (line && el.sheet.hidden) { e.preventDefault(); advance(); } return; }
    if (!G || !el.sheet.hidden || !el.menu.hidden) return;
    if (e.key === 'ArrowLeft') neighbor(-1) && moveTo(neighbor(-1));
    if (e.key === 'ArrowRight') neighbor(1) && moveTo(neighbor(1));
    if (e.key === 'Escape') pause();
  });

  /* سطر أو أكتر. "@" في أول السطر = سرد، "> " = كلامك إنت. */
  async function say(who, text) {
    const arr = [].concat(E.txt(text)).flatMap(s => String(s).split('\n'));
    for (const raw of arr) {
      if (raw[0] === '@') await showLine(null, raw.slice(1));
      else if (raw.startsWith('> ')) await showLine('me', raw.slice(2));
      else await showLine(who, raw);
    }
  }
  function choose(opts, o) {
    o = o || {};
    return new Promise(res => {
      killLine(); el.dnext.hidden = true;
      if (el.dlg.hidden || o.title != null) { el.dlg.hidden = false; speaker(o.who || null); el.dt.textContent = o.title || ''; }
      el.dch.className = o.col ? 'col' : '';
      el.dch.innerHTML = '';
      opts.forEach((op, i) => {
        if (typeof op === 'string') op = { label: op };
        const b = document.createElement('button');
        b.className = op.cls || ''; b.innerHTML = esc(op.label) + (op.sub ? `<small>${esc(op.sub)}</small>` : '');
        b.onclick = () => { el.dch.innerHTML = ''; A.play('page'); res(i); };
        el.dch.appendChild(b);
      });
    });
  }

  /* ====================== صفحات منبثقة ====================== */
  function sheet(html, wide) {
    el.sheet.innerHTML = `<div class="pane ${wide ? 'wide' : ''}">${html}</div>`;
    el.sheet.hidden = false; el.sheet.scrollTop = 0;
    return el.sheet.firstChild;
  }
  function closeSheet() { el.sheet.hidden = true; el.sheet.innerHTML = ''; }

  /* ====================== شريط اللعب ====================== */
  function hud() {
    if (!G) return;
    const play = G.phase === 'play', left = E.timeLeft();
    el.clk.textContent = AR(E.clock());
    el.left.textContent = play ? `فاضل ${AR(left)} دقيقة على الوادي` : 'الوصول ١٢:٣٠';
    el.track.firstElementChild.style.width = (play ? (G.t - C.times.invest) / (C.times.end - C.times.invest) * 100 : 0) + '%';
    el.hud.classList.toggle('warn', play && left <= 15);
    const a = C.acts[G.act - 1];
    el.act.textContent = a.title + ' · ' + a.sub;
    el.loc.textContent = C.locations[locIdx(G.loc)].name;
    el.obj.textContent = play ? C.objective(G, E) : introObj;
    el.bAcc.hidden = el.bFile.hidden = !play;
    el.bAcc.classList.toggle('hot', G.act >= 5);
    const li = locIdx(G.loc);
    el.mini.innerHTML = C.locations.map((l, i) => `<button data-l="${l.id}" class="${i === li ? 'on' : ''} ${l.id === C.sceneLoc && play ? 'scene' : ''}" title="${esc(l.name)}" ${play ? '' : 'disabled'}>${AR(l.n)}</button>`).join('');
    el.mini.querySelectorAll('button').forEach(b => { b.onclick = () => moveTo(b.dataset.l); });
    const wm = waiter && waiter.type === 'move' ? locIdx(waiter.id) : -1;
    el.navL.disabled = li === 0 || (!play && wm !== li - 1);
    el.navR.disabled = li === C.locations.length - 1 || (!play && wm !== li + 1);
    el.navL.classList.toggle('go', !play && wm === li - 1); el.navR.classList.toggle('go', !play && wm === li + 1);
  }
  function showHud(on) { ['hud', 'mini', 'navL', 'navR'].forEach(k => { el[k].hidden = !on; }); }
  function ambience() {
    if (!A.ready) return;
    const play = !!G && G.phase === 'play' && !G.over && !S.idle;
    A.loop('wind', play && G.loc === 'c3' && !E.has('window_closed'));
    A.loop('tick', play && (G.loc === 'c3' || G.act >= 5));
    A.loop('drone', play && G.act >= 4);
  }

  /* ====================== تنفيذ التصرفات ====================== */
  async function run(fn) {
    if (busy || !G || G.over || G.phase !== 'play') return;
    const game = G;
    busy = true; S.active = false;
    try { await fn(); if (game === G) await flush(); }
    finally {
      if (game === G) {
        el.dlg.hidden = true; killLine();
        if (!G.over) { busy = false; S.active = true; }
        hud(); ambience();
      }
    }
  }
  /* الأحداث اللي وقتها جه وإحنا مشغولين بتتعرض هنا */
  async function flush() {
    while (G.queue.length && !G.over) {
      const q = G.queue.shift();
      if (q.type === 'act') { const a = C.acts.find(x => x.n === q.n); ambience(); hud(); el.dlg.hidden = true; await card(a.title, a.sub); continue; }
      const ev = C.events.find(x => x.id === q.id);
      if (ev.sfx) A.play(ev.sfx);
      if (ev.scene === 'tunnel') { S.tunnel = true; A.play('thunder'); }
      if (ev.scene === 'flicker') S.flicker();
      if (ev.say) await say(null, ev.say);
      if (ev.scene === 'tunnel') S.tunnel = false;
      if (ev.toast) toast(esc(E.txt(ev.toast)));
    }
    if (!G.over && E.timedOut()) await ending('incomplete');
  }

  function neighbor(dir) { const l = C.locations[locIdx(G.loc) + dir]; return l ? l.id : null; }
  async function doMove(to, left) {
    A.play('door'); A.play('step');
    await S.fadeTo(1);
    G.loc = to; S.focus(left ? S.CW : 0, true); hud();
    await S.fadeTo(0);
  }
  function moveTo(to) {
    if (!G || !to || to === G.loc) return;
    const li = locIdx(G.loc), ti = locIdx(to);
    if (G.phase === 'intro') {
      if (!waiter || waiter.type !== 'move' || waiter.id !== to || Math.abs(ti - li) !== 1) return;
      const w = waiter; waiter = null; S.active = false;
      doMove(to, ti < li).then(w.res);
      return;
    }
    run(async () => { await doMove(to, ti < li); E.spend(Math.abs(ti - li)); tip('time', 'كل تصرف بياخد من الوقت، والقطر ما بيستناش: ناس هتتحرك من أماكنها، وأدلة ممكن تضيع.'); });
  }

  S.onPick = hit => {
    if (!hit || !G) return;
    if (G.phase === 'intro') {
      if (!waiter) return;
      if (hit.type === 'door') return moveTo(neighbor(hit.dir));
      if ((waiter.type === 'char' && hit.type === 'char' && hit.id === waiter.id) || (waiter.type === 'hot' && hit.type === 'hs' && hit.id === waiter.id)) {
        const w = waiter; waiter = null; S.active = false; hud(); w.res();
      }
      return;
    }
    if (hit.type === 'door') return moveTo(neighbor(hit.dir));
    if (hit.type === 'char') return run(() => talk(hit.id));
    if (hit.type === 'bag') return run(() => bag(hit.id));
    if (hit.type === 'hs') return run(() => hotspot(hit.h));
  };

  /* ====================== فحص الأماكن ====================== */
  async function hotspot(h) {
    const acts = h.acts.map((a, i) => ({ a, i })).filter(x => E.cond(x.a.cond));
    if (!acts.length) return;
    let c = acts[0];
    if (acts.length > 1) {
      const k = await choose(acts.map(x => ({ label: x.a.verb, cls: 'verb', sub: x.a.cost && !G.done['hs:' + h.id + ':' + x.i] ? AR(x.a.cost) + ' د' : '' })).concat({ label: 'سيبه', cls: 'back' }), { title: h.name });
      if (k >= acts.length) return;
      c = acts[k];
    }
    if (c.a.ui === 'radio') { el.dlg.hidden = true; return radio(); }
    if (c.a.ui === 'safe') { el.dlg.hidden = true; return safeUI(); }
    const key = 'hs:' + h.id + ':' + c.i, first = !G.done[key], text = E.txt(c.a.text);
    if (first) { G.done[key] = 1; E.fx(c.a.fx); }
    await say(null, text);
    if (first && c.a.cost) E.spend(c.a.cost);
  }

  /* ====================== الحوار مع الشخصيات ====================== */
  async function reply(id, r) {
    await say(id, r.a);
    E.fx(r.fx, id);
    if (r.mercy) {
      const ch = C.chars[id];
      const k = await choose([{ label: 'هدّيه', sub: '«اللي عملته غلط، بس مش هو ده اللي بدوّر عليه دلوقتي.»' }, { label: 'هدده', sub: '«ده لوحده كفاية يوديك ورا الشمس.»' }], { col: true });
      if (k === 0) { E.stat(id, 'trust', 1); await say(id, ch.mercy.soft); }
      else { E.stat(id, 'trust', -1); E.stat(id, 'stress', 1); await say(id, ch.mercy.hard); }
    }
  }
  async function talk(id) {
    const ch = C.chars[id], st = G.stats[id];
    S.focus(S.charX(id));
    if (st.def > G.t) return say(id, ch.defensive);
    if (!E.has('met:' + id)) { E.set('met:' + id); await say(id, ch.greet); }
    else { el.dlg.hidden = false; speaker(id); el.dt.textContent = ''; }
    tip('talk', '«اسأل» بياخد دقيقتين. «اضغط» بيوتّره وبيقلل ثقته فيك. «واجهه بدليل» لما كلامه ما يركبش على حاجة معاك.');
    let cur = null, wrong = 0;
    for (;;) {
      const o = [{ k: 'ask', label: 'اسأل', cls: 'verb' }];
      if (cur && cur.press && !G.asked[id + ':press:' + cur.id]) o.push({ k: 'press', label: 'اضغط عليه', cls: 'verb', sub: 'على آخر كلام قاله' });
      if (G.ev.length) o.push({ k: 'show', label: 'واجهه بدليل', cls: 'verb' });
      if (ch.bluff && !E.has('bluffed:' + id)) o.push({ k: 'bluff', label: 'بلِّف', cls: 'verb', sub: 'بينفع لو متوتر' });
      o.push({ k: 'observe', label: 'راقبه', cls: 'verb' }, { k: 'bye', label: 'خلاص', cls: 'back' });
      const k = o[await choose(o, { who: id })].k;
      speaker(id);
      if (k === 'bye') return;
      if (k === 'observe') { await say(null, ch.observe(st)); speaker(id); continue; }
      if (k === 'ask') {
        const tops = ch.topics.filter(t => E.cond(t.cond));
        const i = await choose(tops.map(t => ({ label: (G.asked[id + ':' + t.id] ? '✓ ' : '') + t.q })).concat({ label: 'رجوع', cls: 'back' }), { who: id, col: true });
        if (i >= tops.length) continue;
        const t = tops[i], first = !G.asked[id + ':' + t.id];
        await say('me', t.q);
        if (first) { G.asked[id + ':' + t.id] = 1; E.set('asked:' + id + ':' + t.id); await reply(id, t); E.spend(2); }
        else await say(id, t.a);
        cur = t;
        if (t.id === 'where' && first) tip('contra', 'افتكر كلامه ده. لو لقيت حاجة بتقول غيره، ارجع له و«واجهه بدليل»، أو اربطهم على اللوحة.');
        continue;
      }
      if (k === 'press') {
        G.asked[id + ':press:' + cur.id] = 1;
        const cornered = st.trust <= 0;
        E.stat(id, 'stress', 1); E.stat(id, 'trust', -1); E.stat(id, 'susp', 1);
        await say('me', pick(['متأكد من الكلام ده؟', 'قولها تاني وبص في عيني.', 'الكلام ده مش مقنعني.']));
        await reply(id, cur.press);
        E.spend(1);
        if (cornered) { st.def = G.t + 8; await say(id, ch.defensive); await say(null, 'قفل على نفسه. مش هيتكلم معاك تاني قبل شوية.'); return; }
        continue;
      }
      if (k === 'bluff') {
        E.set('bluffed:' + id);
        await say('me', C.bluffQ);
        E.spend(1);
        if (st.stress >= (ch.bluff.need || 2)) { await reply(id, ch.bluff.ok(G)); A.play('link'); }
        else {
          await reply(id, ch.bluff.fail); E.stat(id, 'trust', -2); A.play('nope');
          await say(null, 'البلفة ما دخلتش عليه. كان لازم يبقى متوتر أكتر الأول.');
        }
        continue;
      }
      if (k === 'show') {
        const ev = await pickEvidence('تواجهه بإيه؟', 'رجوع');
        speaker(id);
        if (!ev) continue;
        let r = ch.shows[ev], cond = r && r.cond;
        if (r && r.ref) { r = ch.shows[r.ref]; if (cond == null) cond = r.cond; }
        if (r && E.cond(cond)) {
          const key = id + ':show:' + (ch.shows[ev].ref || ev), first = !G.asked[key];
          G.asked[key] = 1;
          await say(null, `حطيت قدامه: ${C.evidence[ev].name}.`);
          if (first) { await reply(id, r); E.spend(1); } else await say(id, r.a);
        } else {
          await say(id, pick(ch.shrug)); E.spend(1);
          if (++wrong % 3 === 0) { E.stat(id, 'trust', -1); await say(null, 'بدأ يزهق من الأدلة اللي ملهاش علاقة بيه.'); }
        }
      }
    }
  }

  /* ====================== تفتيش الشنط ====================== */
  function bagContents(id) {
    const b = C.bags[id];
    let t = b.text + (b.extra ? ' ' + b.extra : '');
    if (E.isKiller(id)) t += E.has('disposed') ? '\nوفي القاع مكان فاضي، كأن حاجة اتشالت منه بسرعة.' : '\nوتحت كل ده: ' + E.txt(C.evidence.bloody.desc).split('.')[0] + '.';
    return t;
  }
  async function bag(id) {
    const ch = C.chars[id], name = ch.bag.inside || 'شنطة ' + ch.short;
    if (E.has('bag:' + id)) return say(null, bagContents(id));
    const reveal = async () => {
      E.set('bag:' + id);
      const txt = bagContents(id);
      E.fx(C.bags[id].fx);
      if (E.isKiller(id) && !E.has('disposed')) E.give('bloody');
      await say(null, txt);
    };
    if (E.charLoc(id) !== G.loc) {
      await say(null, `${ch.short} مش هنا. فتحت ${name} براحتك.`);
      await reveal(); E.spend(2); return;
    }
    if (E.has('caught:' + id)) return say(id, 'إيدك بعيد عن حاجتي. مرة كفاية.');
    const k = await choose([{ label: 'فتّش من غير ما يشوفك', cls: 'verb', sub: AR(4) + ' د · لو شافك هيقفل عليك' }, { label: 'سيبها', cls: 'back' }], { title: `${name}. صاحبها واقف جنبها.` });
    if (k !== 0) return;
    el.dlg.hidden = true;
    const ok = await stealth(ch.short);
    E.spend(4);
    if (ok) return reveal();
    E.set('caught:' + id); E.stat(id, 'trust', -2); E.stat(id, 'stress', 1); E.stat(id, 'susp', 1);
    await say(id, 'إنت بتعمل إيه في حاجتي؟!');
    await say(null, 'اتقفشت. ضاعت دقايق في الاعتذار، ومش هتعرف تقرّب منها تاني طول ما هو موجود.');
    E.spend(3);
  }
  function stealth(name) {
    return new Promise(res => {
      const p = sheet(`<p class="sub">تفتيش في السر</p><h2>عين ${esc(name)}</h2>
        <p>دوس واستمر على الزرار والعين مقفولة. سيب إيدك أول ما تبدأ تفتح.</p>
        <div class="eye closed" id="eye"></div><div class="bar"><i id="pg"></i></div>
        <button id="hold" class="primary">دوس واستمر للتفتيش</button>`);
      let st = 'closed', tm = 1.4 + Math.random(), pr = 0, hold = false, alive = true, last = performance.now();
      const eye = p.querySelector('#eye'), hb = p.querySelector('#hold'), pg = p.querySelector('#pg');
      hb.onpointerdown = e => { e.preventDefault(); hold = true; };
      hb.onpointerup = hb.onpointerleave = hb.onpointercancel = () => { hold = false; };
      hb.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold = true; } };
      hb.onkeyup = () => { hold = false; };
      const done = v => { alive = false; closeSheet(); res(v); };
      (function loop(n) {
        if (!alive) return;
        if (el.sheet.hidden) { alive = false; return; }
        const dt = Math.min(0.1, (n - last) / 1000); last = n; tm -= dt;
        if (tm <= 0) { st = st === 'closed' ? 'warn' : st === 'warn' ? 'open' : 'closed'; tm = st === 'closed' ? 1.1 + Math.random() * 1.2 : st === 'warn' ? 0.5 : 0.8 + Math.random() * 0.7; eye.className = 'eye ' + st; }
        if (hold) {
          if (st === 'open') return done(false);
          pr += dt / 3.4; pg.style.width = Math.min(100, pr * 100) + '%';
          if (pr >= 1) return done(true);
        }
        requestAnimationFrame(loop);
      })(last);
    });
  }

  /* ====================== اللاسلكي والخزنة ====================== */
  function radio() {
    return new Promise(res => {
      if (!G.radio) G.radio = C.radio.map(() => ({ f: 15 + Math.random() * 70, a: 25 + Math.random() * 65, done: false }));
      let ch = Math.max(0, G.radio.findIndex(r => !r.done));
      const p = sheet(`<p class="sub">عربة البريد</p><h2>اللاسلكي</h2>
        <p class="mute">حرّك الموجة والقوة لحد ما خطك يطابق الخط الباهت. كل إشارة جديدة بتاخد ٣ دقايق.</p>
        <div class="row" id="chs"></div><canvas id="rc" width="600" height="150"></canvas>
        <div class="row"><label class="sl" for="rf">الموجة<input type="range" id="rf" min="0" max="100" step="0.5" value="50"></label><label class="sl" for="ra">القوة<input type="range" id="ra" min="0" max="100" step="0.5" value="50"></label></div>
        <div id="rmsg"></div><div class="row" id="ract"></div><button id="cx">اقفل اللاسلكي</button>`);
      const c = p.querySelector('#rc').getContext('2d'), rf = p.querySelector('#rf'), ra = p.querySelector('#ra'), msg = p.querySelector('#rmsg'), ract = p.querySelector('#ract');
      let alive = true, lock = 0, spent = 0;
      const text = i => { const d = C.radio[i]; return d.give ? E.txt(C.evidence[d.give].desc) : E.has('broadcast') ? '«…وصلنا يا فندم. الملف بيتقرا على الهوا دلوقتي، كلمة كلمة…»' : d.idle; };
      const chs = () => {
        p.querySelector('#chs').innerHTML = C.radio.map((r, i) => `<button data-c="${i}" class="${i === ch ? 'primary' : ''}">${esc(r.name)}${G.radio[i].done ? ' ✓' : ''}</button>`).join('');
        p.querySelectorAll('#chs button').forEach(b => { b.onclick = () => { ch = +b.dataset.c; lock = 0; chs(); }; });
        const d = C.radio[ch];
        ract.innerHTML = d.broadcast && G.radio[ch].done && E.hasEv('file52') && !E.has('broadcast') ? '<button class="primary" id="bc">اقرا ملف ١٩٥٢ على الهوا</button>' : '';
        const bc = ract.querySelector('#bc');
        if (bc) bc.onclick = () => { E.set('broadcast'); A.play('open'); toast('ملف ١٩٥٢ اتذاع على موجة «الصباح». محدش هيقدر يدفنه تاني.'); chs(); };
      };
      chs(); A.loop('static', true); A.loop('carrier', true, 0);
      p.querySelector('#cx').onclick = () => { alive = false; A.loop('static', false); A.loop('carrier', false); closeSheet(); if (spent) E.spend(spent); res(); };
      (function loop() {
        if (!alive) return;
        if (el.sheet.hidden) { alive = false; A.loop('static', false); A.loop('carrier', false); return; }
        const r = G.radio[ch], f = +rf.value, a = +ra.value, df = Math.abs(f - r.f), da = Math.abs(a - r.a), m = r.done ? 0 : Math.min(1, df / 22 + da / 30), T = performance.now() / 1000;
        c.fillStyle = '#03130c'; c.fillRect(0, 0, 600, 150); c.strokeStyle = '#123524'; c.lineWidth = 1;
        for (let x = 0; x < 600; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 150); c.stroke(); }
        const w = (fr, am, ns, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (let x = 0; x <= 600; x += 3) { const y = 75 + Math.sin(x * (0.012 + fr * 0.0009) + T * 4) * (8 + am * 0.58) + (Math.random() - 0.5) * ns; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); };
        w(r.f, r.a, 0, '#2f7a57', 2); w(r.done ? r.f : f, r.done ? r.a : a, m * 34, '#6fe3a5', 2.5);
        A.level('static', 0.02 + m * 0.1); A.level('carrier', m < 0.2 ? 0.03 * (1 - m * 5) : 0);
        if (!r.done) {
          lock = df <= 2.5 && da <= 3.5 ? lock + 1 / 60 : 0;
          if (lock > 0.8) { r.done = true; const d = C.radio[ch]; if (d.give && E.give(d.give)) spent += 3; A.play('link'); chs(); }
        }
        const full = text(ch);
        msg.textContent = r.done ? full : [...full].map((x, i) => x === ' ' ? ' ' : ((Math.sin(i * 12.9898 + Math.floor(T * 6) * 0.37) * 43758.5 % 1) + 1) % 1 < m ? '▒' : x).join('');
        requestAnimationFrame(loop);
      })();
    });
  }
  function safeUI() {
    return new Promise(res => {
      const sf = C.safe; let code = '';
      const p = sheet(`<p class="sub">عربة البريد</p><h2>الخزنة</h2><p>${esc(sf.hint)}</p>
        <div class="code" id="code"></div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${AR(n)}</button>`).join('')}<button data-n="c">مسح</button><button data-n="0">٠</button><button data-n="x">رجوع</button></div>
        <p class="mute" id="smsg">كل محاولة غلط بتاخد دقيقة.</p>`);
      const out = p.querySelector('#code'), sm = p.querySelector('#smsg');
      const draw = () => { out.textContent = AR(code).padEnd(4, '·'); };
      draw();
      p.querySelectorAll('.keypad button').forEach(b => {
        b.onclick = async () => {
          const n = b.dataset.n;
          if (n === 'x') { closeSheet(); return res(); }
          if (n === 'c') { code = ''; return draw(); }
          if (code.length >= 4) return;
          code += n; A.play('safe'); draw();
          if (code.length < 4) return;
          if (code === sf.code) { A.play('open'); closeSheet(); E.give(sf.give); await say(null, sf.open); E.spend(1); return res(); }
          A.play('nope'); sm.textContent = 'القفل ما اتحركش. ضاعت دقيقة.'; sm.className = 'bad'; code = ''; draw();
          G.wrongCode++; E.spend(1); hud();
          if (E.timedOut()) { closeSheet(); res(); }
        };
      });
    });
  }

  /* ====================== ملف القضية ====================== */
  const rot = id => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997; return (h % 50) / 10 - 2.5; };
  const evCard = (id, extra) => {
    const ev = C.evidence[id];
    return `<button class="evc ${ev.type === 'استنتاج' ? 'ded' : ''} ${G.fresh[id] ? 'new' : ''} ${extra || ''}" data-id="${id}" style="--r:${rot(id)}deg;--tc:${TYPE_COL[ev.type] || '#777'}"><small>${esc(ev.type)}</small><b>${esc(ev.name)}</b></button>`;
  };
  const evDetail = id => { const ev = C.evidence[id]; return `<small class="mute">${esc(ev.type)}</small><br><b>${esc(ev.name)}</b>\n${esc(E.txt(ev.desc))}`; };

  function fileSheet(tab) {
    if (!G || G.phase !== 'play' || busy) return;
    busy = true; S.active = false; A.play('page');
    const p = sheet(`<div class="tabs"><button data-t="board">لوحة الأدلة</button><button data-t="people">الأشخاص</button><button data-t="time">الخط الزمني</button><button class="x ghost" aria-label="اقفل">✕</button></div><div id="tabc"></div>`, true);
    const host = p.querySelector('#tabc');
    const show = t => {
      p.querySelectorAll('.tabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      ({ board: tabBoard, people: tabPeople, time: tabTime })[t](host);
    };
    p.querySelectorAll('.tabs [data-t]').forEach(b => { b.onclick = () => { A.play('page'); show(b.dataset.t); }; });
    p.querySelector('.x').onclick = () => { closeSheet(); el.fileDot.hidden = true; busy = false; S.active = true; hud(); run(async () => { }); };
    show(tab || 'board');
  }
  function tabBoard(host, msg) {
    let sel = null;
    host.innerHTML = `<p class="mute">دوس على دليل عشان تقراه. وهو متحدد، دوس على دليل تاني عشان تربطهم. الربط الصح بيطلّع استنتاج. التفكير ما بياخدش وقت.</p>
      <div class="board"><svg></svg>${G.ev.map(id => evCard(id)).join('')}</div><div class="detail" id="det">${msg || 'اختار دليل.'}</div>`;
    const board = host.querySelector('.board'), det = host.querySelector('#det');
    const lines = () => {
      const svg = board.querySelector('svg'), br = board.getBoundingClientRect();
      svg.innerHTML = G.links.map(l => {
        const a = board.querySelector(`[data-id="${l.a}"]`), b = board.querySelector(`[data-id="${l.b}"]`);
        if (!a || !b) return '';
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return `<line x1="${ra.left + ra.width / 2 - br.left}" y1="${ra.top - br.top - 2}" x2="${rb.left + rb.width / 2 - br.left}" y2="${rb.top - br.top - 2}"/>`;
      }).join('');
    };
    requestAnimationFrame(lines);
    board.querySelectorAll('.evc').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        delete G.fresh[id]; b.classList.remove('new');
        if (sel && sel !== id) {
          const r = E.link(sel, id);
          if (!r) { A.play('nope'); det.innerHTML = evDetail(id) + '<span class="res bad">مفيش علاقة واضحة بين الاتنين.</span>'; board.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); sel = null; return; }
          if (r.dup) { det.innerHTML = evDetail(id) + '<span class="res mute">الرابط ده معمول قبل كده.</span>'; board.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); sel = null; return; }
          A.play('link'); hud();
          return tabBoard(host, `<b>رابط جديد</b>\n${esc(E.txt(r.L.text))}<span class="res ok">اتضاف استنتاج على اللوحة.</span>`);
        }
        board.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
        sel = id; b.classList.add('sel'); det.style.setProperty('--tc', TYPE_COL[C.evidence[id].type]);
        det.innerHTML = evDetail(id) + '<span class="res mute">دوس على دليل تاني عشان تربطه بده.</span>';
      };
    });
  }
  const attitude = st => st.def > G.t ? ['قافل على نفسه', 'bad'] : st.stress >= 4 ? ['على آخره', 'bad'] : st.stress >= 2 ? ['متوتر', ''] : st.trust >= 3 ? ['بيثق فيك', 'ok'] : ['حذر', ''];
  function tabPeople(host) {
    const ids = Object.keys(C.chars).filter(id => C.chars[id].bio);
    host.innerHTML = '<div class="people">' + ids.map(id => {
      const ch = C.chars[id], st = G.stats[id], met = E.has('met:' + id), at = attitude(st), loc = E.charLoc(id);
      const alibi = !ch.suspect ? ['شاهد', 'ok'] : E.has('clear:' + id) ? ['مكانه مؤكد', 'ok'] : E.hasEv('d_break_' + id) ? ['كلامه اتكسر', 'bad'] : E.hasEv('c_' + id) ? ['ادعاء من غير دليل', ''] : ['لسه ما اتسألش', ''];
      return `<article class="person"><header><canvas width="150" height="170" data-p="${id}"></canvas><div><h4>${esc(ch.name)}</h4><small>${AR(ch.age)} سنة · ${esc(ch.job)}</small></div></header>
        <small>${esc(ch.bio)}</small>
        <div class="chips"><span class="chip ${alibi[1]}">${alibi[0]}</span>${met ? `<span class="chip ${at[1]}">${at[0]}</span>` : ''}${loc ? `<span class="chip">دلوقتي في: ${esc(C.locations[locIdx(loc)].name)}</span>` : ''}${E.has('secret:' + id) ? '<span class="chip bad">سره اتكشف</span>' : ''}</div>
        ${G.notes[id].length ? '<ul>' + G.notes[id].map(n => `<li class="${n.struck ? 'struck' : ''}">${esc(n.text)}</li>`).join('') + '</ul>' : '<small>لسه مفيش ملاحظات عليه.</small>'}</article>`;
    }).join('') + '</div>';
    host.querySelectorAll('canvas[data-p]').forEach(cv => S.portrait(cv, cv.dataset.p, S.exprFor(cv.dataset.p)));
  }
  function tabTime(host) {
    const rows = C.timeline.filter(r => E.cond(r.cond));
    host.innerHTML = `<p class="mute">اللي عرفته عن الليلة لحد دلوقتي. السطور بتزيد كل ما تلاقي دليل.</p>
      <div class="tl">${rows.map(r => `<time>${r.t}</time><span>${esc(E.txt(r.text))}</span>`).join('')}</div>
      <p class="sub">كل واحد بيقول كان فين الساعة ١٠:٤٠</p>
      <div class="tl">${C.suspects.map(id => `<time style="font-size:15px;direction:rtl">${esc(C.chars[id].short)}</time><span>${E.hasEv('c_' + id) ? esc(E.txt(C.evidence['c_' + id].desc)) + (E.has('clear:' + id) ? ' <b class="ok">· مؤكد</b>' : E.hasEv('d_break_' + id) ? ' <b class="bad">· اتكسر</b>' : '') : '<i class="mute">لسه ما اتسألش</i>'}</span>`).join('')}</div>`;
  }

  /* اختيار دليل (للمواجهة في الحوار وفي الاتهام) */
  function pickEvidence(title, cancel) {
    return new Promise(res => {
      let sel = null;
      const p = sheet(`<p class="sub">ملف القضية</p><h2>${esc(title)}</h2>
        <div class="board">${G.ev.map(id => evCard(id)).join('')}</div><div class="detail" id="det">اختار دليل.</div>
        <div class="row"><button class="primary" id="go" disabled>قدّم الدليل ده</button><button id="cx">${esc(cancel)}</button></div>`, true);
      const det = p.querySelector('#det'), go = p.querySelector('#go');
      p.querySelectorAll('.evc').forEach(b => {
        b.onclick = () => { p.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); sel = b.dataset.id; b.classList.add('sel'); det.innerHTML = evDetail(sel); go.disabled = false; };
      });
      go.onclick = () => { closeSheet(); res(sel); };
      p.querySelector('#cx').onclick = () => { closeSheet(); res(null); };
    });
  }

  /* ====================== الاتهام والمواجهة الأخيرة ====================== */
  function pickSuspect() {
    return new Promise(res => {
      const p = sheet(`<p class="sub">المواجهة الأخيرة</p><h2>مين القاتل؟</h2>
        <p>اتهام واحد بس. بعدها هتحتاج تثبت تلات حاجات: كان فين، إيه اللي يربطه بالسلاح، وليه عملها.</p>
        <div class="pick">${C.suspects.map(id => `<button data-i="${id}"><canvas width="150" height="170" data-p="${id}"></canvas>${esc(C.chars[id].short)}</button>`).join('')}</div>
        <div class="row" id="conf"><button id="cx">لسه بفكر</button></div>`, true);
      p.querySelectorAll('canvas[data-p]').forEach(cv => S.portrait(cv, cv.dataset.p, S.exprFor(cv.dataset.p)));
      p.querySelector('#cx').onclick = () => { closeSheet(); res(null); };
      p.querySelectorAll('[data-i]').forEach(b => {
        b.onclick = () => {
          const id = b.dataset.i;
          p.querySelector('#conf').innerHTML = `<button class="primary" id="yes">أيوه، ${esc(C.chars[id].short)}</button><button id="no">لسه بفكر</button>`;
          p.querySelector('#yes').onclick = () => { closeSheet(); res(id); };
          p.querySelector('#no').onclick = () => { closeSheet(); res(null); };
          p.querySelectorAll('[data-i]').forEach(x => { x.style.borderColor = x === b ? 'var(--brass)' : ''; });
        };
      });
    });
  }
  async function accuse() {
    const who = await pickSuspect();
    if (!who) return;
    const ch = C.chars[who];
    A.loop('drone', true, 0.12); A.play('stab');
    if (G.loc !== C.sceneLoc) await doMove(C.sceneLoc, locIdx(C.sceneLoc) < locIdx(G.loc));
    await say(null, ['جمعت الخمسة في الصالون، قدام كرسي رأفت.', `وقفت قدام ${ch.short}.`]);
    await say('me', 'إنت اللي قتلت رأفت الحلواني.');
    await say(who, ch.confront.open);
    if (!E.isKiller(who)) { await say(who, ch.confront.alibi); return ending('wrong', who); }
    let score = 0;
    for (let i = 0; i < C.accuse.rounds.length; i++) {
      const rd = C.accuse.rounds[i];
      el.dlg.hidden = true;
      const ev = await pickEvidence(rd.q, 'مفيش عندي دليل');
      if (ev) await say(null, `حطيت قدامه: ${C.evidence[ev].name}.`);
      if (ev && rd.ok(who).includes(ev)) { score++; E.stat(who, 'stress', 2); A.play('stab'); await say(who, ch.confront.r[i]); }
      else if (ev && rd.half && rd.half(who).includes(ev)) { score += 0.5; await say(null, 'الدليل ده بيقرّبه من السلاح، بس ما بيحطّوش في إيده.'); }
      else await say(null, C.accuse.miss[i]);
    }
    const all = E.secretsFound() >= C.suspects.length;
    G.score = score;
    return ending(score >= 2 ? (E.has('broadcast') ? 'secret' : score === 3 && all ? 'perfect' : 'good') : 'dark', who);
  }

  async function ending(id, who) {
    const en = C.endings[id], left = E.timeLeft(), game = G;
    E.finish(id); S.active = false; busy = true; killLine(); el.dlg.hidden = true;
    A.loop('tick', false); A.loop('wind', false); A.loop('drone', id === 'dark' || id === 'wrong' || id === 'incomplete', 0.1);
    A.play(id === 'perfect' || id === 'good' || id === 'secret' ? 'open' : 'warn');
    await card(en.kind === 'سرّية' ? 'نهاية سرّية' : 'النهاية', en.name);
    if (game !== G) return;
    const total = Object.keys(C.endings).length, got = Object.keys(C.endings).filter(k => E.meta.endings[C.id + ':' + k]).length;
    const good = ['perfect', 'good', 'secret'].includes(id);
    const p = sheet(`<span class="endkind ${good ? 'ok' : 'bad'}">نهاية ${esc(en.kind)}</span><h2>${esc(en.name)}</h2>
      ${E.txt(en.text, who).map(t => `<p>${esc(t)}</p>`).join('')}
      <div class="stats"><div><b>${AR(left)}</b><span>دقيقة فاضلة</span></div><div><b>${AR(G.ev.length)}</b><span>دليل واستنتاج</span></div><div><b>${AR(G.links.length)}</b><span>رابط على اللوحة</span></div><div><b>${AR(E.secretsFound())} من ${AR(C.suspects.length)}</b><span>أسرار اتكشفت</span></div></div>
      <p class="sub">حقيقة الليلة</p><ul class="plain">${C.truth(G).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="mute">النهايات اللي وصلت لها: ${AR(got)} من ${AR(total)}. القاتل والأدلة بيتغيروا في كل قضية جديدة.</p>
      <div class="row"><button class="primary" id="again">قضية جديدة</button><button id="tomenu">القائمة الرئيسية</button></div>`);
    p.querySelector('#again').onclick = () => { closeSheet(); startNew(true); };
    p.querySelector('#tomenu').onclick = () => { closeSheet(); toMenu(); };
  }

  /* ====================== القوائم ====================== */
  function toMenu() {
    runId++; waiter = null; killLine(); busy = false; closeSheet();
    el.dlg.hidden = true; showHud(false); el.toasts.innerHTML = '';
    S.idle = true; S.active = false; S.tunnel = false; S.fadeTarget = 0; S.lights('on'); S.walkers.length = 0;
    ['wind', 'tick', 'drone', 'static', 'carrier'].forEach(l => A.loop(l, false));
    mainMenu();
  }
  function mainMenu() {
    el.menu.hidden = false;
    el.menu.innerHTML = `<p class="kicker">لعبة تحقيق وغموض</p><h1>القطار الأخير</h1>
      <p class="tag">خريف ١٩٥٨. آخر رحلة لإكسبريس الوادي. صاحب الخط اتقتل في صالونه، والقطر مش هيقف قبل ١٢:٣٠.</p>
      <div class="items"><button id="mNew">قضية جديدة</button><button id="mCont" ${E.hasSave() ? '' : 'disabled'}>كمّل التحقيق</button><button id="mFiles">ملفات القضايا</button><button id="mHow">طريقة اللعب</button><button id="mSet">الإعدادات</button></div>
      <p class="foot">القاتل بيتغير كل قضية · التقدم بيتحفظ على الجهاز ده</p>`;
    $('#mNew').onclick = () => { A.init(); A.setVolume(E.meta.vol); startNew(); };
    $('#mCont').onclick = () => { A.init(); A.setVolume(E.meta.vol); if (E.load()) { el.menu.hidden = true; enterPlay(false); } };
    $('#mFiles').onclick = () => filesMenu();
    $('#mHow').onclick = () => howTo(false);
    $('#mSet').onclick = () => settings(false);
  }
  function filesMenu() {
    const p = sheet('<p class="sub">الأرشيف</p><h2>ملفات القضايا</h2>' + LT.cases.map(c => {
      const ends = Object.keys(c.endings);
      return `<p class="sub">${esc(c.sub)}</p><h2 style="font-size:24px">${esc(c.title)}</h2><p>${esc(c.blurb)}</p>
        <div class="endlist">${ends.map(k => E.meta.endings[c.id + ':' + k] ? `<div class="got">${esc(c.endings[k].name)}<small>نهاية ${esc(c.endings[k].kind)}</small></div>` : '<div>؟؟؟<small>نهاية لسه ما وصلتلهاش</small></div>').join('')}</div>`;
    }).join('') + '<p class="mute">كل قضية ملف بيانات مستقل في فولدر cases، فإضافة قضايا جديدة مش محتاجة تغيير في اللعبة نفسها.</p><button id="cx">رجوع</button>');
    p.querySelector('#cx').onclick = closeSheet;
  }
  function howTo(inGame) {
    const p = sheet(`<p class="sub">دليل المفتش</p><h2>طريقة اللعب</h2>
      <ul class="plain">
        <li><b>الحركة:</b> اسحب الشاشة جوه العربة. الأبواب على الطرفين، أو أرقام العربيات تحت.</li>
        <li><b>الكشاف:</b> بعد الجريمة النور بيضعف. النقط اللي بتلمع حاجات تتفحص، وبعض الأدلة ما بتبانش غير تحت الكشاف.</li>
        <li><b>الوقت:</b> الساعة بتمشي مع كل تصرف: سؤال، تفتيش، مشوار. الأحداث مربوطة بيها.</li>
        <li><b>الحوار:</b> اسأل، اضغط، واجه بدليل، بلِّف، أو راقب. كل واحد له ثقة وتوتر، وطريقتك بتغيّر اللي هيقوله.</li>
        <li><b>ملف القضية:</b> اربط دليلين على اللوحة. الربط الصح بيطلّع استنتاج، والاستنتاج نفسه دليل.</li>
        <li><b>الشنط:</b> لو صاحبها واقف، فتّش وعينه مقفولة. لو مشي، فتّش براحتك.</li>
        <li><b>الاتهام:</b> مرة واحدة، ولازم تثبت المكان والسلاح والدافع.</li>
      </ul><button id="cx">${inGame ? 'رجوع' : 'تمام'}</button>`);
    p.querySelector('#cx').onclick = () => { closeSheet(); if (inGame) pause(); };
  }
  function settings(inGame) {
    const m = E.meta;
    const p = sheet(`<p class="sub">الإعدادات</p><h2>الإعدادات</h2>
      <label class="sl" for="sv">مستوى الصوت<input type="range" id="sv" min="0" max="100" value="${Math.round(m.vol * 100)}"></label>
      <p class="sub">سرعة الكلام</p><div class="row" id="sp">${[[0.5, 'بطيء'], [1, 'عادي'], [2.5, 'سريع']].map(([v, n]) => `<button data-v="${v}" class="${m.speed === v ? 'primary' : ''}">${n}</button>`).join('')}</div>
      <p class="sub">مؤثرات الحركة (مطر، اهتزاز)</p><div class="row"><button id="fx" class="${m.fx ? 'primary' : ''}">${m.fx ? 'شغالة' : 'مقفولة'}</button></div>
      <button id="cx">${inGame ? 'رجوع' : 'تمام'}</button>`);
    p.querySelector('#sv').oninput = e => { m.vol = e.target.value / 100; A.setVolume(m.vol); E.saveMeta(); };
    p.querySelectorAll('#sp button').forEach(b => { b.onclick = () => { m.speed = +b.dataset.v; E.saveMeta(); settings(inGame); }; });
    p.querySelector('#fx').onclick = () => { m.fx = !m.fx; E.saveMeta(); settings(inGame); };
    p.querySelector('#cx').onclick = () => { closeSheet(); if (inGame) pause(); };
  }
  function pause() {
    if (!G || !el.menu.hidden || !el.sheet.hidden || G.over) return;
    const intro = G.phase === 'intro';
    const p = sheet(`<p class="sub">إيقاف مؤقت</p><h2>${esc(C.title)}</h2>
      <p class="mute">${intro ? 'المقدمة.' : 'التقدم بيتحفظ لوحده بعد كل تصرف.'}</p>
      <button class="primary" id="res">كمّل</button>${intro ? '<button id="skip">تخطّي المقدمة</button>' : ''}<button id="how">طريقة اللعب</button><button id="set">الإعدادات</button><button id="out">${intro ? 'القائمة الرئيسية' : 'احفظ واخرج للقائمة'}</button>`);
    p.querySelector('#res').onclick = closeSheet;
    p.querySelector('#how').onclick = () => howTo(true);
    p.querySelector('#set').onclick = () => settings(true);
    p.querySelector('#out').onclick = () => { E.save(); toMenu(); };
    if (intro) p.querySelector('#skip').onclick = () => { closeSheet(); startNew(true, G.seed); };
  }

  /* ====================== بداية اللعب ====================== */
  function startNew(skip, seed) {
    if (skip == null && E.meta.seenIntro) {
      const p = sheet(`<p class="sub">قضية جديدة</p><h2>تبدأ منين؟</h2><p>المقدمة بتعرّفك على الركاب وبتوريك مين اتحرك قبل الجريمة. لو لعبتها قبل كده، ادخل على التحقيق.</p>
        <button class="primary" id="a">من المقدمة</button><button id="b">على التحقيق مباشرة</button><button id="cx">رجوع</button>`);
      p.querySelector('#a').onclick = () => { closeSheet(); startNew(false); };
      p.querySelector('#b').onclick = () => { closeSheet(); startNew(true); };
      p.querySelector('#cx').onclick = closeSheet;
      return;
    }
    const token = ++runId;
    waiter = null; killLine(); el.dlg.hidden = true; el.toasts.innerHTML = ''; S.walkers.length = 0; S.tunnel = false;
    E.clearSave(); E.newGame('case01', seed); sync();
    el.menu.hidden = true; el.fileDot.hidden = true;
    if (skip) {
      S.idle = false; S.lights('dim'); showHud(false);
      const p = sheet(`<p class="sub">${esc(C.sub)}</p><h2>${esc(C.title)}</h2>${C.recap.map(t => `<p>${esc(t)}</p>`).join('')}<button class="primary" id="go">ابدأ التحقيق</button>`);
      p.querySelector('#go').onclick = () => { closeSheet(); begin(token); };
      G.loc = C.sceneLoc; E.set('dead'); S.focus(585, true);
      return;
    }
    runIntro(token);
  }
  function begin(token) {
    if (token !== runId) return;
    quiet = true; E.beginInvestigation(); quiet = false;
    E.meta.seenIntro = true; E.saveMeta();
    enterPlay(true);
  }
  function enterPlay(first) {
    sync();
    S.idle = false; S.tunnel = false; S.lights('dim'); S.fadeTarget = 0;
    busy = false; S.active = true; showHud(true); hud(); ambience();
    if (first) {
      S.focus(585, true);
      toast('ملاحظاتك عن اللي عدّى من البوفيه اتحفظت في «ملف القضية».');
      tip('flash', 'النور ضعف. حرّك الكشاف: النقط اللي بتلمع حاجات ممكن تفحصها، وفيه أدلة ما بتبانش غير لما النور ييجي عليها.');
    } else { S.focus(S.CW / 2, true); toast('رجعت للتحقيق. الساعة ' + AR(E.clock()) + '.'); run(async () => { }); }
  }
  async function runIntro(token) {
    const live = () => token === runId;
    const g = fn => (...a) => live() ? fn(...a) : never();
    S.idle = false; S.lights('on'); busy = true; S.active = false; introObj = '';
    showHud(true); S.focus(S.CW, true); hud();
    const hold = type => g(id => new Promise(res => {
      waiter = { type, id, res: () => { if (live()) res(); } }; S.active = true; hud();
      /* الكاميرا بتروح للي مستنيينه عشان اللاعب ما يتوهش */
      if (type === 'char' && G.pos[id]) S.focus(G.pos[id].x);
      if (type === 'hot') S.focus(C.hotspots.find(h => h.id === id).x);
      if (type === 'move') S.focus(locIdx(id) < locIdx(G.loc) ? 0 : S.CW);
    }));
    const api = {
      card: g(card),
      say: g(async (who, text) => { if (who && who !== 'me' && G.pos[who] && G.pos[who].loc === G.loc) S.focus(G.pos[who].x); await say(who, text); if (live()) el.dlg.hidden = true; }),
      choose: g(async opts => { const k = await choose(opts, { col: true, who: 'me', title: '' }); return k; }),
      place: g((id, loc, x) => { G.pos[id] = { loc, x }; }),
      remove: g(id => { delete G.pos[id]; }),
      time: g(t => { G.t = t; hud(); }),
      obj: g(t => { introObj = t; hud(); }),
      tip: g(tip), sfx: g(id => A.play(id)),
      lights: g(m => S.lights(m)), tunnel: g(b => { S.tunnel = b; }),
      fade: g(b => S.fadeTo(b ? 1 : 0)),
      waitChar: hold('char'), waitHot: hold('hot'), waitMove: hold('move'),
      walk: g((id, loc, a, b) => G.loc === loc ? S.walk(id, a, b) : Promise.resolve()),
      goto: g(async loc => { await doMove(loc, locIdx(loc) < locIdx(G.loc)); })
    };
    await C.intro(api, G, E);
    if (!live()) return;
    begin(token);
  }

  /* ====================== ربط الأزرار ====================== */
  el.bFile.onclick = () => fileSheet('board');
  el.bAcc.onclick = () => run(accuse);
  el.bPause.onclick = pause;
  el.dnext.onclick = e => { e.stopPropagation(); advance(); };
  el.navL.onclick = () => moveTo(neighbor(-1));
  el.navR.onclick = () => moveTo(neighbor(1));

  /* تحديث حي من غير ما التقدم يضيع (لما الصفحة تتحدث وهي مفتوحة) */
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => { E.save(); return {}; });

  S.init(el.stage);
  mainMenu();
  LT.ui = { toMenu, startNew, hud, run, talk, accuse, fileSheet, waiting: () => waiter && { type: waiter.type, id: waiter.id }, isBusy: () => busy };
})();

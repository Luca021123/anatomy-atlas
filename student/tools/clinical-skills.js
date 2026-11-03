/* Student suite — Clinical skills and reasoning: 'osce' (station simulator), 'history' (frameworks, differentials, illness scripts) and
 * 'lab-values' (adult reference ranges with quiz). Content lives in student/data/clinical-skills.js (MTData.clinicalSkills). */
(function () {
  'use strict';
  var h = MT.h, D = (self.MTData || {}).clinicalSkills;
  if (!D) { console.error('MTData.clinicalSkills missing'); return; }
  var K_ATT = 'student.osce.attempts', K_SET = 'student.osce.settings', K_HIST = 'student.history.practice', K_LAB = 'student.labs.quiz', K_LABU = 'student.labs.prefs';

  MT.css('cs', [
    '.cs-cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}',
    '.cs-card{display:flex;flex-direction:column;gap:6px;text-decoration:none;color:inherit;padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow-sm);min-height:96px}',
    '.cs-card:hover{border-color:var(--accent);box-shadow:var(--shadow)}',
    '.cs-card:focus-visible{outline:none;box-shadow:var(--focus)}',
    '.cs-card h3{font-size:1.02rem;margin:0}',
    '.cs-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.82rem;color:var(--muted)}',
    '.cs-timer{font-variant-numeric:tabular-nums;font-weight:800;font-size:clamp(2.6rem,12vw,4.6rem);line-height:1;letter-spacing:-.02em}',
    '.cs-bar{position:sticky;top:calc(var(--header-h) + 4px);z-index:5;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow);display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between}',
    '.cs-bar.warn{border-color:var(--warn);background:var(--warn-soft)}',
    '.cs-bar.over{border-color:var(--danger);background:var(--danger-soft)}',
    '.cs-bar.read{border-color:var(--info);background:var(--info-soft)}',
    '.cs-phase{font-weight:700;font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-2)}',
    '.cs-ol{padding-left:1.25rem;margin:.3rem 0} .cs-ol li{margin:.3rem 0;line-height:1.45}',
    '.cs-grp{margin:14px 0 6px;font-weight:700;font-size:.95rem;color:var(--accent-text)}',
    '.cs-check{margin:4px 0}',
    '.cs-score{font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums}',
    '.cs-quote{border-left:4px solid var(--accent);padding:6px 12px;background:var(--surface-2);border-radius:0 var(--radius-sm) var(--radius-sm) 0;font-style:italic}',
    '.cs-dx{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);padding:12px 14px;margin:8px 0}',
    '.cs-dx.m{border-left:5px solid var(--danger)} .cs-dx.c{border-left:5px solid var(--accent)} .cs-dx.u{border-left:5px solid var(--border-strong)}',
    '.cs-dx h4{margin:0 0 4px;font-size:1rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.cs-lbl{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:6px}',
    '.cs-script{display:grid;gap:8px;grid-template-columns:1fr;margin-top:8px}',
    '@media(min-width:760px){.cs-script{grid-template-columns:repeat(3,1fr)}}',
    '.cs-script>div{background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 10px;font-size:.92rem}',
    '.cs-hide{filter:blur(6px);cursor:pointer;user-select:none}',
    '.cs-nav{margin-bottom:16px}',
    '.cs-range{display:inline-block;font-variant-numeric:tabular-nums;font-weight:700}',
    '.cs-lab td,.cs-lab th{vertical-align:top}',
    '.cs-bars{display:grid;gap:8px}',
    '.cs-bar-row{display:grid;grid-template-columns:120px 1fr 52px;gap:8px;align-items:center;font-size:.9rem}',
    '@media(prefers-reduced-motion:reduce){.cs-card{transition:none}}'
  ].join('\n'));

  /* ---------- utilities ---------- */
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return MT.pad2(Math.floor(sec / 60)) + ':' + MT.pad2(sec % 60); }
  function arr(v, fb) { return Array.isArray(v) ? v : fb; }
  function navTabs(items, active, label) {
    return h('nav.tabs.cs-nav', { 'aria-label': label }, items.map(function (i) { return h('a', { href: i.href, class: i.id === active ? 'active' : '', 'aria-current': i.id === active ? 'page' : null }, i.label); }));
  }
  function bullets(list, cls) { return h('ul', { class: cls || 'cs-ol' }, list.map(function (t) { return h('li', t); })); }
  function typeLabel(id) { var t = D.stationTypes.filter(function (x) { return x.id === id; })[0]; return t ? t.label : id; }
  function typeBadge(id) { return MT.ui.badge(typeLabel(id), { history: 'info', exam: 'accent', comms: 'warn', skills: 'ok' }[id]); }
  function searchBox(value, placeholder, onInput) {
    var i = h('input', { type: 'search', 'aria-label': placeholder, placeholder: placeholder, value: value || '', autocomplete: 'off', style: 'max-width:420px' });
    i.addEventListener('input', function () { onInput(i.value); });
    return h('div.field', i);
  }

  /* ---------- audio cues (Web Audio, created on a user gesture) ---------- */
  function Beeper() {
    var ctx = null, on = true;
    function init() { try { var AC = window.AudioContext || window.webkitAudioContext; if (AC && !ctx) ctx = new AC(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { ctx = null; } }
    function tone(freq, start, dur, type, vol) {
      if (!ctx || !on) return;
      try {
        var o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + start;
        o.type = type || 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
      } catch (e) { /* ignore */ }
    }
    return {
      init: init, setOn: function (v) { on = !!v; },
      cue: function (name) {
        if (name === 'start') { tone(880, 0, 0.18); }
        else if (name === 'ready') { tone(660, 0, 0.14); tone(880, 0.2, 0.14); tone(1100, 0.4, 0.22); }
        else if (name === 'warn') { tone(740, 0, 0.16, 'triangle'); tone(740, 0.26, 0.16, 'triangle'); }
        else if (name === 'end') { tone(523, 0, 0.35, 'square', 0.18); tone(392, 0.4, 0.6, 'square', 0.18); }
      },
      close: function () { try { if (ctx) ctx.close(); } catch (e) { /* ignore */ } ctx = null; }
    };
  }

  /* ======================================================================
     OSCE
     ====================================================================== */
  function stationById(id) { return D.stations.filter(function (s) { return s.id === id; })[0]; }
  function flat(st) { var out = [], n = 0; st.groups.forEach(function (g, gi) { g.items.forEach(function (t) { out.push({ idx: n++, g: gi, text: t }); }); }); return out; }
  function loadAttempts() { var d = MT.store.get(K_ATT, null); return d && Array.isArray(d.items) ? d.items : []; }
  function saveAttempts(items) { MT.store.set(K_ATT, { v: 1, items: items.slice(-400) }); }
  function loadSettings() {
    var d = { v: 1, mins: 'auto', reading: 60, sound: true, mode: 'self' }, s = MT.store.get(K_SET, null);
    if (s && typeof s === 'object') Object.keys(d).forEach(function (k) { if (s[k] !== undefined && typeof s[k] === typeof d[k]) d[k] = s[k]; });
    if (d.mins !== 'auto' && [5, 8, 10].indexOf(d.mins) < 0) d.mins = 'auto';
    if ([0, 60, 120].indexOf(d.reading) < 0) d.reading = 60;
    return d;
  }
  var RATINGS = [{ v: 0, label: 'Clear fail' }, { v: 1, label: 'Borderline' }, { v: 2, label: 'Clear pass' }, { v: 3, label: 'Excellent' }];

  function osceLibrary(host) {
    var attempts = loadAttempts(), type = 'all', q = '', grid = h('div.cs-cards');
    var best = {}, count = {};
    attempts.forEach(function (a) { count[a.s] = (count[a.s] || 0) + 1; if (best[a.s] == null || a.pct > best[a.s]) best[a.s] = a.pct; });
    function draw() {
      MT.clear(grid);
      var list = D.stations.filter(function (s) { return (type === 'all' || s.type === type) && (!q || (s.title + ' ' + s.setting + ' ' + typeLabel(s.type)).toLowerCase().indexOf(q.toLowerCase()) >= 0); });
      if (!list.length) { grid.appendChild(MT.ui.empty('🔍', 'No stations match', 'Try a different search or category.')); return; }
      list.forEach(function (s) {
        grid.appendChild(h('a.cs-card', { href: '#/osce/' + s.id },
          h('div.cs-meta', typeBadge(s.type), h('span', s.mins + ' min'), h('span', flatCount(s) + ' marks')),
          h('h3', s.title), h('div.small.muted', s.setting),
          count[s.id] ? h('div.small', MT.ui.badge('Best ' + Math.round(best[s.id]) + '%', best[s.id] >= 70 ? 'ok' : best[s.id] >= 50 ? 'warn' : 'danger'), ' ', count[s.id] + (count[s.id] === 1 ? ' attempt' : ' attempts')) : h('div.small.muted', 'Not attempted')));
      });
    }
    function flatCount(s) { return s.groups.reduce(function (a, g) { return a + g.items.length; }, 0); }
    var counts = {}; D.stations.forEach(function (s) { counts[s.type] = (counts[s.type] || 0) + 1; });
    var chips = h('div.row', { role: 'group', 'aria-label': 'Station category', style: 'gap:6px' }, [{ id: 'all', label: 'All (' + D.stations.length + ')' }].concat(D.stationTypes.map(function (t) { return { id: t.id, label: t.label + ' (' + (counts[t.id] || 0) + ')' }; })).map(function (c) {
      var b = h('button.chip', { type: 'button', 'aria-pressed': String(c.id === type), onclick: function () { type = c.id; MT.$$('button', chips).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); draw(); } }, c.label); return b;
    }));
    host.appendChild(h('div.stack',
      h('div.row.row-between', searchBox('', 'Search stations', function (v) { q = v; draw(); }),
        h('button.btn.btn-primary', { type: 'button', onclick: function () { var s = pick(D.stations.filter(function (x) { return type === 'all' || x.type === type; })); if (s) MT.app.navigate('#/osce/' + s.id); } }, '🎲 Random station')),
      chips, grid));
    draw();
  }

  function osceProgress(host) {
    var items = loadAttempts();
    if (!items.length) { host.appendChild(MT.ui.empty('📈', 'No attempts yet', 'Finish a station and save your marks to see your progress here.')); return; }
    var avg = items.reduce(function (a, x) { return a + x.pct; }, 0) / items.length;
    var byType = {}; items.forEach(function (a) { var st = stationById(a.s); var t = st ? st.type : 'other'; (byType[t] = byType[t] || []).push(a.pct); });
    var passRate = items.filter(function (a) { return a.rating >= 2; }).length / items.length;
    var worst = {}; items.forEach(function (a) { (a.missed || []).forEach(function (i) { var k = a.s + ':' + i; worst[k] = (worst[k] || 0) + 1; }); });
    var worstList = Object.keys(worst).map(function (k) { var p = k.split(':'), st = stationById(p[0]), it = st && flat(st)[Number(p[1])]; return it ? { n: worst[k], text: it.text, st: st } : null; }).filter(Boolean).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var tried = {}; items.forEach(function (a) { tried[a.s] = true; });
    var next = D.stations.filter(function (s) { return !tried[s.id]; }).slice(0, 4);
    var bars = Object.keys(byType).map(function (t) { var m = byType[t].reduce(function (a, b) { return a + b; }, 0) / byType[t].length; return h('div.cs-bar-row', h('span', typeLabel(t)), h('div.progress', h('span', { style: 'width:' + Math.round(m) + '%' })), h('span', { style: 'text-align:right;font-variant-numeric:tabular-nums' }, Math.round(m) + '%')); });
    var list = items.slice().reverse().slice(0, 25).map(function (a) {
      var st = stationById(a.s);
      return h('tr', h('td', MT.formatDate(new Date(a.t), { month: 'short', day: 'numeric' })), h('td', st ? h('a', { href: '#/osce/' + st.id }, st.title) : a.s), h('td', a.mode === 'peer' ? 'Peer' : 'Self'), h('td', Math.round(a.pct) + '% (' + a.score + '/' + a.max + ')'), h('td', RATINGS[a.rating] ? RATINGS[a.rating].label : '—'), h('td', mmss(a.used || 0)));
    });
    host.appendChild(h('div.stack',
      h('div.grid', { style: '--min:150px' },
        h('div.card', h('div.stat', h('div.stat-value', String(items.length)), h('div.stat-label', 'Stations attempted'))),
        h('div.card', h('div.stat', h('div.stat-value', Math.round(avg) + '%'), h('div.stat-label', 'Average checklist score'))),
        h('div.card', h('div.stat', h('div.stat-value', Math.round(passRate * 100) + '%'), h('div.stat-label', 'Global rating pass or better')))),
      h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Average by station type'), h('div.cs-bars', bars)),
      worstList.length ? h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Checklist items you miss most'), h('ul.cs-ol', worstList.map(function (w) { return h('li', h('strong', w.n + '× '), w.text, h('span.muted', ' — ' + w.st.title)); }))) : null,
      next.length ? h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Not yet tried'), h('div.row', next.map(function (s) { return h('a.btn.btn-soft.btn-sm', { href: '#/osce/' + s.id }, s.title); }))) : null,
      h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Recent attempts'), h('div.table-wrap', h('table.table', h('thead', h('tr', h('th', 'Date'), h('th', 'Station'), h('th', 'Marked'), h('th', 'Score'), h('th', 'Global'), h('th', 'Time'))), h('tbody', list)))),
      h('div.row',
        h('button.btn', { type: 'button', onclick: function () { var rows = [['date', 'station', 'mode', 'score', 'max', 'percent', 'global_rating', 'seconds_used']].concat(items.map(function (a) { var st = stationById(a.s); return [a.t, st ? st.title : a.s, a.mode, a.score, a.max, Math.round(a.pct), RATINGS[a.rating] ? RATINGS[a.rating].label : '', a.used]; })); MT.download('osce-attempts.csv', rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'text/csv'); } }, 'Export CSV'),
        h('button.btn.btn-danger', { type: 'button', onclick: function () { MT.confirm('Delete all saved OSCE attempts?', { danger: true, okLabel: 'Delete' }).then(function (ok) { if (ok) { MT.store.remove(K_ATT); MT.app.navigate('#/osce/progress'); MT.app.route(); } }); } }, 'Clear history'))));
  }

  function oscePatientCard(st) {
    var p = st.patient || {};
    return h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Simulated patient / partner script'),
      p.who ? h('p', h('strong', 'Role: '), p.who) : null,
      p.opening ? h('p', h('strong', 'Opening line: '), h('span.cs-quote', p.opening)) : null,
      arr(p.info, []).length ? [h('div.cs-lbl', 'Information to give when asked'), bullets(p.info)] : null,
      arr(p.findings, []).length ? [h('div.cs-lbl', 'Examination findings to report'), bullets(p.findings)] : null,
      p.ice ? [h('div.cs-lbl', 'Ideas, concerns and expectations'), h('p', p.ice)] : null,
      p.behaviour ? [h('div.cs-lbl', 'Behaviour'), h('p', p.behaviour)] : null);
  }
  function checklistBlock(st, ticks, onChange) {
    var els = [], total = flat(st).length;
    st.groups.forEach(function (g, gi) {
      els.push(h('div.cs-grp', g.title));
      g.items.forEach(function (t) {
        var idx = flat(st).filter(function (x) { return x.g === gi && x.text === t; })[0].idx;
        var cb = h('input', { type: 'checkbox', checked: !!ticks[idx] });
        cb.addEventListener('change', function () { ticks[idx] = cb.checked; onChange(); });
        els.push(h('label.check.cs-check', cb, h('span', t)));
      });
    });
    return els;
  }

  function osceStation(host, st, ctx) {
    var S = loadSettings(), beep = Beeper(), timerId = null, wake = null, stopped = false;
    var phase = 'brief', endAt = 0, remaining = 0, paused = false, total = 0, warned = false, usedStart = 0, usedMs = 0;
    var ticks = {}, rating = null, notes = '', root = h('div.stack');
    var items = flat(st);
    var live = h('div.sr-only', { 'aria-live': 'assertive', role: 'status' });
    host.appendChild(root); host.appendChild(live);
    function stationSecs() { return (S.mins === 'auto' ? st.mins : S.mins) * 60; }
    function say(t) { live.textContent = t; }
    function lockScreen() { try { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; if (stopped) { w.release(); } }).catch(function () { /* optional */ }); } catch (e) { /* optional */ } }
    function unlock() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function startTimer(secs, nextPhase) {
      stopTimer(); total = secs * 1000; remaining = total; endAt = Date.now() + remaining; paused = false; warned = false;
      timerId = setInterval(function () {
        if (paused) return;
        remaining = Math.max(0, endAt - Date.now()); paintTimer();
        if (phase === 'running' && !warned && total > 120000 && remaining <= 60000 && remaining > 0) { warned = true; beep.cue('warn'); say('One minute remaining'); }
        if (phase === 'reading' && remaining <= 10000 && remaining > 9700) beep.cue('start');
        if (remaining <= 0) { stopTimer(); nextPhase(); }
      }, 200);
    }
    var bar = null, timeEl = null, labelEl = null, pb = null;
    function paintTimer() {
      if (!timeEl) return;
      timeEl.textContent = mmss(remaining / 1000);
      if (pb) pb.style.width = Math.max(0, Math.min(100, 100 * (1 - remaining / total))) + '%';
      if (bar) { var warn = phase === 'running' && remaining <= 60000 && total > 120000; bar.className = 'cs-bar' + (phase === 'reading' ? ' read' : warn ? ' warn' : ''); }
      if (labelEl) labelEl.textContent = phase === 'reading' ? 'Reading time' : paused ? 'Paused' : (remaining <= 60000 && total > 120000 ? 'Under one minute left' : 'Station running');
    }
    function setPhase(p) { phase = p; render(); }
    function beginReading() {
      beep.setOn(S.sound); beep.init(); lockScreen();
      if (S.reading > 0) { phase = 'reading'; render(); beep.cue('start'); say('Reading time started'); startTimer(S.reading, beginStation); }
      else beginStation();
    }
    function beginStation() {
      phase = 'running'; usedStart = Date.now(); usedMs = 0; render(); beep.cue('ready'); say('Station started. ' + Math.round(stationSecs() / 60) + ' minutes.');
      startTimer(stationSecs(), function () { beep.cue('end'); say('Time is up'); finish(true); });
    }
    function finish(timeUp) {
      usedMs = (paused ? usedMs : usedMs + (Date.now() - usedStart)); stopTimer(); unlock();
      if (!timeUp && phase === 'running') usedMs = Math.min(usedMs, stationSecs() * 1000);
      phase = 'mark'; render(); window.scrollTo(0, 0);
    }
    function togglePause() {
      if (paused) { endAt = Date.now() + remaining; paused = false; usedStart = Date.now(); }
      else { remaining = Math.max(0, endAt - Date.now()); paused = true; usedMs += Date.now() - usedStart; }
      render();
    }
    function saveAttempt() {
      var score = items.filter(function (x) { return ticks[x.idx]; }).length, max = items.length;
      var rec = { id: MT.uid('att'), s: st.id, t: new Date().toISOString(), mode: S.mode, score: score, max: max, pct: max ? score / max * 100 : 0, rating: rating == null ? 1 : rating, used: Math.round(usedMs / 1000), mins: stationSecs() / 60, notes: notes.slice(0, 600), missed: items.filter(function (x) { return !ticks[x.idx]; }).map(function (x) { return x.idx; }) };
      var all = loadAttempts(); all.push(rec); saveAttempts(all); return rec;
    }

    function timerBar(showControls) {
      timeEl = h('div.cs-timer', { role: 'timer', 'aria-label': 'Time remaining' }, mmss(remaining / 1000));
      labelEl = h('div.cs-phase');
      pb = h('span'); var prog = h('div.progress', { style: 'width:100%;margin-top:8px', 'aria-hidden': 'true' }, pb);
      bar = h('div.cs-bar', h('div', labelEl, timeEl), h('div', { style: 'flex:1 1 220px;min-width:180px' }, prog),
        showControls ? h('div.row',
          phase === 'running' ? h('button.btn', { type: 'button', onclick: togglePause }, paused ? '▶ Resume' : '⏸ Pause') : null,
          phase === 'reading' ? h('button.btn', { type: 'button', onclick: function () { stopTimer(); beginStation(); } }, 'Skip reading') : null,
          phase === 'running' ? h('button.btn.btn-primary', { type: 'button', onclick: function () { finish(false); } }, 'End station') : null) : null);
      paintTimer();
      return bar;
    }
    function instructions() { return h('div.card', h('div.cs-meta', typeBadge(st.type), h('span', st.setting)), h('h2', { style: 'font-size:1.15rem;margin-top:6px' }, 'Candidate instructions'), h('p', { style: 'font-size:1.05rem;line-height:1.55' }, st.candidate)); }

    function render() {
      MT.clear(root); bar = timeEl = labelEl = pb = null;
      if (phase === 'brief') {
        var minsSeg = MT.ui.segmented([{ value: 'auto', label: 'Station default (' + st.mins + ')' }, { value: 5, label: '5 min' }, { value: 8, label: '8 min' }, { value: 10, label: '10 min' }], S.mins, function (v) { S.mins = v; MT.store.set(K_SET, S); });
        var readSeg = MT.ui.segmented([{ value: 0, label: 'None' }, { value: 60, label: '1 min' }, { value: 120, label: '2 min' }], S.reading, function (v) { S.reading = v; MT.store.set(K_SET, S); });
        var modeSeg = MT.ui.segmented([{ value: 'self', label: 'Self-marking' }, { value: 'peer', label: 'With a partner' }], S.mode, function (v) { S.mode = v; MT.store.set(K_SET, S); render(); });
        var snd = h('input', { type: 'checkbox', checked: S.sound }); snd.addEventListener('change', function () { S.sound = snd.checked; MT.store.set(K_SET, S); });
        root.appendChild(h('div.row', h('a.btn.btn-ghost.btn-sm', { href: '#/osce' }, '← All stations')));
        root.appendChild(instructions());
        root.appendChild(h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Timing and marking'),
          h('div.stack',
            h('div.field', h('span.field-label', 'Station length'), minsSeg), h('div.field', h('span.field-label', 'Reading time before the station'), readSeg),
            h('div.field', h('span.field-label', 'Marking'), modeSeg, h('div.hint', S.mode === 'peer' ? 'Your partner plays the patient and ticks the examiner checklist during the station (they use the Partner materials below).' : 'Do the station, then mark yourself against the checklist afterwards.')),
            h('label.check', snd, h('span', 'Sound cues: start, one-minute warning and end (Web Audio, works offline)')),
            h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: beginReading }, S.reading ? '▶ Start reading time' : '▶ Start station'))));
        root.appendChild(h('details.disclosure', h('summary', 'Partner / examiner materials (spoilers for the candidate)'), h('div.disclosure-body.stack', oscePatientCard(st))));
      } else if (phase === 'reading') {
        root.appendChild(timerBar(true)); root.appendChild(instructions());
        root.appendChild(h('div.card-soft.card', h('p', h('strong', 'Reading time. '), 'Read the instructions and plan your approach. The station timer starts automatically.')));
      } else if (phase === 'running') {
        root.appendChild(timerBar(true)); root.appendChild(instructions());
        if (S.mode === 'peer') {
          root.appendChild(h('details.disclosure', { open: true }, h('summary', 'Partner: patient script'), h('div.disclosure-body.stack', oscePatientCard(st))));
          var sc = h('div.small.muted', { 'aria-live': 'polite' });
          var upd = function () { sc.textContent = items.filter(function (x) { return ticks[x.idx]; }).length + ' of ' + items.length + ' marks'; };
          root.appendChild(h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Examiner checklist'), sc, checklistBlock(st, ticks, upd))); upd();
        } else {
          root.appendChild(h('p.muted.small', 'Checklist hidden while you work. Use the pause button if you are interrupted.'));
        }
      } else if (phase === 'mark' || phase === 'review') {
        renderMark();
      }
    }
    function renderMark() {
      var summary = h('div', { 'aria-live': 'polite' });
      var upd = function () {
        var n = items.filter(function (x) { return ticks[x.idx]; }).length; MT.clear(summary);
        summary.appendChild(h('div.row', h('span.cs-score', n + ' / ' + items.length), h('span.muted', Math.round(n / items.length * 100) + '% of checklist marks')));
      };
      var rat = MT.ui.segmented(RATINGS.map(function (r) { return { value: r.v, label: r.label }; }), -1, function (v) { rating = v; });
      MT.$$('button', rat).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      var notesEl = h('textarea', { rows: 3, 'aria-label': 'Notes for next time', placeholder: 'What went well? What will you do differently?', maxlength: 600 }); notesEl.addEventListener('input', function () { notes = notesEl.value; });
      var saved = false;
      root.appendChild(h('div.card-soft.card', h('strong', 'Time used: '), mmss(usedMs / 1000) + ' of ' + mmss(stationSecs()) + (usedMs >= stationSecs() * 1000 - 500 ? ' (time up)' : '')));
      root.appendChild(h('div.card', h('h2', { style: 'font-size:1.15rem' }, S.mode === 'peer' ? 'Examiner marking' : 'Mark yourself honestly'), summary, checklistBlock(st, ticks, upd)));
      root.appendChild(h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Global rating'), h('p.muted.small', 'Overall impression, independent of the checklist (as in a real OSCE).'), rat, h('div.field', { style: 'margin-top:12px' }, h('label', 'Notes'), notesEl)));
      var saveB = h('button.btn.btn-primary.btn-lg', { type: 'button' }, 'Save attempt and see feedback');
      saveB.addEventListener('click', function () { if (saved) return; saved = true; saveB.disabled = true; var rec = saveAttempt(); MT.toast('Attempt saved', 'ok'); renderReview(rec); });
      root.appendChild(h('div.row', saveB, h('a.btn.btn-ghost', { href: '#/osce' }, 'Discard')));
      upd();
    }
    function renderReview(rec) {
      MT.clear(root); window.scrollTo(0, 0);
      var missed = rec.missed.map(function (i) { return items[i]; }).filter(Boolean);
      root.appendChild(h('div.card', h('h2', { style: 'font-size:1.15rem' }, st.title), h('div.row', h('span.cs-score', rec.score + ' / ' + rec.max), h('span.muted', Math.round(rec.pct) + '% · global: ' + RATINGS[rec.rating].label + ' · ' + (rec.mode === 'peer' ? 'peer marked' : 'self marked')))));
      root.appendChild(h('div.card', h('h2', { style: 'font-size:1.1rem' }, missed.length ? 'Marks missed (' + missed.length + ')' : 'All checklist marks achieved'), missed.length ? bullets(missed.map(function (x) { return x.text; })) : h('p', 'Excellent. Now aim for fluency under time pressure and with a different patient.')));
      root.appendChild(h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Model approach'), bullets(st.approach)));
      root.appendChild(h('div.card', h('h2', { style: 'font-size:1.1rem' }, 'Common pitfalls'), bullets(st.pitfalls)));
      root.appendChild(h('details.disclosure', h('summary', 'Simulated patient script (reference)'), h('div.disclosure-body.stack', oscePatientCard(st))));
      root.appendChild(h('div.row', h('a.btn.btn-primary', { href: '#/osce/' + st.id, onclick: function () { setTimeout(function () { MT.app.route(); }, 0); } }, 'Try again'), h('a.btn', { href: '#/osce' }, 'All stations'),
        h('a.btn.btn-soft', { href: '#/osce/progress' }, 'My progress'), h('button.btn.btn-ghost', { type: 'button', onclick: function () { MT.print(root); } }, 'Print')));
    }
    render();
    return function cleanup() { stopped = true; stopTimer(); unlock(); beep.close(); };
  }

  MT.registerTool({
    id: 'osce', title: 'OSCE simulator', category: 'clinical', icon: '🩺', order: 1,
    description: 'Timed OSCE stations with reading time, audio cues, examiner checklists, partner scripts, model approaches and a record of your scores.',
    keywords: ['osce', 'exam', 'station', 'checklist', 'communication', 'examination', 'history taking', 'practical skills', 'spikes', 'bls', 'hand hygiene', 'blood pressure', 'timer'],
    render: function (container, ctx) {
      var p = ctx.params[0], st = p && p !== 'progress' ? stationById(p) : null;
      if (st) { ctx.setTitle(st.title + ' · OSCE'); return osceStation(container, st, ctx); }
      container.appendChild(navTabs([{ id: 'lib', label: 'Stations', href: '#/osce' }, { id: 'progress', label: 'My progress', href: '#/osce/progress' }], p === 'progress' ? 'progress' : 'lib', 'OSCE sections'));
      if (p && p !== 'progress') container.appendChild(MT.ui.alert('warn', 'Station not found', 'Pick one from the list below.'));
      if (p === 'progress') osceProgress(container); else osceLibrary(container);
      container.appendChild(MT.ui.disclaimer('Stations are teaching simulations based on common medical-school OSCE formats and published guidance; follow your own school’s marking scheme and current local protocols.'));
    }
  });

  /* ======================================================================
     History-taking and differentials
     ====================================================================== */
  var TYPE_ORDER = { m: 0, c: 1, u: 2 }, TYPE_LABEL = { m: 'Can’t miss', c: 'Common', u: 'Less common' };
  function complaintById(id) { return D.complaints.filter(function (c) { return c.id === id; })[0]; }
  function typeTag(t) { return MT.ui.badge(TYPE_LABEL[t], t === 'm' ? 'danger' : t === 'c' ? 'accent' : null); }

  function histFrameworks(host) {
    host.appendChild(h('div.stack', D.frameworks.map(function (fw) {
      return h('div.card', h('h2', { style: 'font-size:1.15rem' }, fw.title), h('p.muted', fw.blurb),
        h('div.table-wrap', h('table.table', h('tbody', fw.items.map(function (it) { return h('tr', h('th', { scope: 'row', style: 'white-space:nowrap' }, it[0]), h('td', h('strong', it[1])), h('td', it[2])); })))));
    })));
    host.appendChild(h('details.disclosure', { style: 'margin-top:12px' }, h('summary', 'Sources'), h('div.disclosure-body', bullets(D.references.slice(0, 2).concat([D.references[5]])))));
  }

  function histList(host) {
    var q = '', sys = 'all', grid = h('div.cs-cards');
    var systems = []; D.complaints.forEach(function (c) { var s0 = c.system.split(' / ')[0]; if (systems.indexOf(s0) < 0) systems.push(s0); });
    function draw() {
      MT.clear(grid);
      var list = D.complaints.filter(function (c) { var txt = (c.name + ' ' + c.system + ' ' + c.dx.map(function (d) { return d.name; }).join(' ')).toLowerCase(); return (sys === 'all' || c.system.split(' / ')[0] === sys) && (!q || txt.indexOf(q.toLowerCase()) >= 0); });
      if (!list.length) { grid.appendChild(MT.ui.empty('🔍', 'No presenting complaints match', 'Try a symptom or diagnosis name.')); return; }
      list.forEach(function (c) {
        var m = c.dx.filter(function (d) { return d.type === 'm'; }).length;
        grid.appendChild(h('a.cs-card', { href: '#/history/' + c.id }, h('div.cs-meta', h('span', c.system)), h('h3', c.name), h('div.cs-meta', MT.ui.badge(m + ' can’t-miss', 'danger'), h('span', c.dx.length + ' diagnoses'))));
      });
    }
    var chips = h('div.row', { role: 'group', 'aria-label': 'System', style: 'gap:6px' }, ['all'].concat(systems).map(function (x) {
      var b = h('button.chip', { type: 'button', 'aria-pressed': String(x === sys), onclick: function () { sys = x; MT.$$('button', chips).forEach(function (y) { y.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); draw(); } }, x === 'all' ? 'All systems' : x); return b;
    }));
    host.appendChild(h('div.stack', searchBox('', 'Search a symptom or diagnosis', function (v) { q = v; draw(); }), chips, grid)); draw();
  }

  function scriptView(sc) {
    return h('div.cs-script', h('div', h('div.cs-lbl', 'Predisposing conditions'), sc[0]), h('div', h('div.cs-lbl', 'Pathophysiological insult'), sc[1]), h('div', h('div.cs-lbl', 'Clinical consequences'), sc[2]));
  }
  function histDetail(host, c) {
    var mode = 'overview', body = h('div');
    function hidden(text) { var sp = h('span.cs-hide', { tabindex: 0, role: 'button', 'aria-label': 'Reveal hidden text' }, text); var rev = function () { sp.className = ''; sp.removeAttribute('role'); sp.removeAttribute('tabindex'); }; sp.addEventListener('click', rev); sp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rev(); } }); return sp; }
    function draw() {
      MT.clear(body);
      var sorted = c.dx.slice().sort(function (a, b) { return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]; });
      sorted.forEach(function (d) {
        var sc = D.scripts[d.name], parts = [];
        if (mode === 'scripts' && sc) parts.push(scriptView(sc), h('div.cs-lbl', 'Discriminating features'), h('p', d.features));
        else if (mode === 'study') parts.push(h('div.cs-lbl', 'Discriminating features'), h('p', hidden(d.features)), h('div.cs-lbl', 'First-line investigations'), h('p', hidden(d.ix)));
        else parts.push(h('div.cs-lbl', 'Discriminating features'), h('p', { style: 'margin:.1rem 0' }, d.features), h('div.cs-lbl', 'First-line investigations'), h('p', { style: 'margin:.1rem 0' }, d.ix));
        if (mode === 'overview' && sc) parts.push(h('details.disclosure', { style: 'margin-top:8px' }, h('summary', 'Illness script'), h('div.disclosure-body', scriptView(sc))));
        body.appendChild(h('div.cs-dx.' + d.type, h('h4', d.name, typeTag(d.type)), parts));
      });
    }
    var seg = MT.ui.segmented([{ value: 'overview', label: 'Overview' }, { value: 'scripts', label: 'Illness scripts' }, { value: 'study', label: 'Study mode (hide answers)' }], mode, function (v) { mode = v; draw(); });
    host.appendChild(h('div.stack',
      h('div.row', h('a.btn.btn-ghost.btn-sm', { href: '#/history' }, '← All complaints'), h('a.btn.btn-soft.btn-sm', { href: '#/history/practice' }, 'Practice')),
      h('div.card', h('h2', { style: 'font-size:1.3rem' }, c.name), h('div.cs-meta', c.system),
        h('div', { style: 'display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:10px' }, h('div', h('div.cs-lbl', 'Key questions'), bullets(c.ask)), h('div', MT.ui.alert('danger', 'Red flags: seek senior help or act urgently', bullets(c.redFlags))))),
      h('div.card-soft.card', h('strong', 'First-line investigations overall: '), c.firstLine),
      h('div.row', h('span.field-label', 'View'), seg), body,
      h('p.small.muted', 'Differentials are a thinking aid, not a complete list or a protocol. Adapt to age, setting and local guidance. Illness scripts follow Feltovich & Barrows 1984 and Charlin et al. 2007.')));
    draw();
  }

  function histPractice(host) {
    var stats = MT.store.get(K_HIST, null); if (!stats || typeof stats !== 'object') stats = { v: 1, n: 0, ok: 0, rn: 0, rfull: 0 };
    var mode = 'which', area = h('div'), statEl = h('span.badge.badge-accent');
    function showStats() { statEl.textContent = 'Which diagnosis: ' + stats.ok + '/' + stats.n + ' · Can’t-miss recall: ' + stats.rfull + '/' + stats.rn + ' complete'; }
    function persist() { MT.store.set(K_HIST, stats); showStats(); }
    var withScript = []; D.complaints.forEach(function (c) { c.dx.forEach(function (d) { if (D.scripts[d.name]) withScript.push({ c: c, d: d }); }); });
    function which() {
      MT.clear(area);
      var it = pick(withScript), sc = D.scripts[it.d.name];
      var names = it.c.dx.map(function (d) { return d.name; }).filter(function (n) { return n !== it.d.name; });
      var opts = shuffle(shuffle(names).slice(0, 3).concat([it.d.name]));
      var done = false, fb = h('div', { 'aria-live': 'polite' });
      var choices = h('div.choice-list', { role: 'group', 'aria-label': 'Choose the most likely diagnosis' }, opts.map(function (o) {
        var b = h('button.btn', { type: 'button', style: 'justify-content:flex-start;text-align:left;height:auto;min-height:44px;padding:8px 14px' }, o);
        b.addEventListener('click', function () {
          if (done) return; done = true; var ok = o === it.d.name; stats.n++; if (ok) stats.ok++; persist();
          MT.$$('button', choices).forEach(function (x) { x.disabled = true; if (x.textContent === it.d.name) x.classList.add('btn-primary'); });
          fb.appendChild(MT.ui.alert(ok ? 'ok' : 'danger', ok ? 'Correct: ' + it.d.name : 'The answer is ' + it.d.name, h('div', scriptView(sc), h('div.cs-lbl', 'Discriminating features'), h('p', it.d.features), h('div.cs-lbl', 'First-line investigations'), h('p', it.d.ix))));
          fb.appendChild(h('div.row', { style: 'margin-top:10px' }, h('button.btn.btn-primary', { type: 'button', onclick: which }, 'Next'), h('a.btn.btn-ghost', { href: '#/history/' + it.c.id }, 'Open ' + it.c.name)));
        });
        return b;
      }));
      area.appendChild(h('div.card.stack', h('div.cs-meta', MT.ui.badge('Presenting complaint: ' + it.c.name, 'info')), h('p', { style: 'font-size:1.05rem;line-height:1.55' }, h('strong', 'Clinical picture: '), sc[2]), h('div.cs-lbl', 'Most likely diagnosis?'), choices, fb));
    }
    function recall() {
      MT.clear(area);
      var c = pick(D.complaints), m = c.dx.filter(function (d) { return d.type === 'm'; });
      var shown = false, host2 = h('div', { 'aria-live': 'polite' });
      var rev = h('button.btn.btn-primary', { type: 'button' }, 'Reveal the can’t-miss diagnoses');
      rev.addEventListener('click', function () {
        if (shown) return; shown = true; rev.disabled = true;
        host2.appendChild(h('div.stack', h('div.cs-lbl', 'Can’t-miss diagnoses'), h('ul.cs-ol', m.map(function (d) { return h('li', h('strong', d.name), ': ', d.features); })), h('div.cs-lbl', 'Red flags'), bullets(c.redFlags),
          h('p', 'How did you do?'), h('div.row',
            h('button.btn.btn-soft', { type: 'button', onclick: function () { stats.rn++; stats.rfull++; persist(); recall(); } }, 'I listed them all'),
            h('button.btn', { type: 'button', onclick: function () { stats.rn++; persist(); recall(); } }, 'I missed some'))));
      });
      area.appendChild(h('div.card.stack', h('div.cs-meta', MT.ui.badge('Recall', 'info')), h('p', { style: 'font-size:1.1rem;line-height:1.55' }, 'A patient presents with ', h('strong', c.name.toLowerCase()), '. Which diagnoses must you not miss? Say or write them down first.'), h('div.row', rev), host2));
    }
    var seg = MT.ui.segmented([{ value: 'which', label: 'Which diagnosis?' }, { value: 'recall', label: 'Can’t-miss recall' }], mode, function (v) { mode = v; if (v === 'which') which(); else recall(); });
    host.appendChild(h('div.stack', h('div.row', seg, statEl), area, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: function () { MT.confirm('Reset practice scores?', { danger: true, okLabel: 'Reset' }).then(function (ok) { if (ok) { stats = { v: 1, n: 0, ok: 0, rn: 0, rfull: 0 }; persist(); } }); } }, 'Reset scores')));
    showStats(); which();
  }

  MT.registerTool({
    id: 'history', title: 'History & differentials', category: 'clinical', icon: '📋', order: 2,
    description: 'History-taking frameworks, a differential-diagnosis builder for 34 presenting complaints with can’t-miss diagnoses, illness scripts, and quick practice.',
    keywords: ['history taking', 'socrates', 'differential diagnosis', 'ddx', 'presenting complaint', 'red flags', 'illness script', 'systems review', 'ice', 'cant miss', 'clinical reasoning'],
    render: function (container, ctx) {
      var p = ctx.params[0], c = p ? complaintById(p) : null, active = p === 'frameworks' ? 'fw' : p === 'practice' ? 'pr' : 'dx';
      container.appendChild(navTabs([{ id: 'dx', label: 'Differentials', href: '#/history' }, { id: 'fw', label: 'Frameworks', href: '#/history/frameworks' }, { id: 'pr', label: 'Practice', href: '#/history/practice' }], active, 'History sections'));
      if (c) { ctx.setTitle(c.name + ' · Differentials'); histDetail(container, c); }
      else if (p === 'frameworks') histFrameworks(container);
      else if (p === 'practice') histPractice(container);
      else { if (p) container.appendChild(MT.ui.alert('warn', 'Complaint not found', 'Choose one from the list.')); histList(container); }
      container.appendChild(MT.ui.disclaimer('For learning clinical reasoning. Real patients need a full assessment and senior supervision.'));
    }
  });

  /* ======================================================================
     Laboratory reference values
     ====================================================================== */
  function sig(x) { var a = Math.abs(x); var dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 3 : 4; return MT.fmt(x, dp, { trim: true }); }
  function siRange(t, sex) { return (sex && t.sex && t.sex[sex]) ? t.sex[sex] : [t.lo, t.hi]; }
  /** Range in the chosen unit system: { lo, hi, unit }. */
  function rng(t, sys, sex) {
    var r = siRange(t, sex);
    if (sys === 'si') return { lo: r[0], hi: r[1], unit: t.unit };
    if (t.cv) return { lo: t.cv[0], hi: t.cv[1], unit: t.convUnit };
    return { lo: r[0] == null ? null : r[0] * t.k, hi: r[1] == null ? null : r[1] * t.k, unit: t.convUnit };
  }
  function rangeText(t, sys, sex, noUnit) {
    var r = rng(t, sys, sex), u = (!noUnit && r.unit) ? ' ' + r.unit : '';
    if (t.up) return '< ' + sig(r.hi) + u;
    if (t.lowOnly) return '> ' + sig(r.lo) + u;
    return sig(r.lo) + ' to ' + sig(r.hi) + u;
  }
  function toSI(t, v, sys) { if (sys === 'si') return v; if (t.id.indexOf('hba1c') >= 0) return (v - 2.15) / 0.0915; return v / t.k; }
  function fromSI(t, v, sys) { if (sys === 'si') return v; if (t.id.indexOf('hba1c') >= 0) return v * 0.0915 + 2.15; return v * t.k; }
  function labStatus(t, value, sex) { // value in SI units
    var r = siRange(t, sex);
    if (t.up) return value > r[1] ? 'high' : 'normal';
    if (t.lowOnly) return value < r[0] ? 'low' : 'normal';
    return value < r[0] ? 'low' : value > r[1] ? 'high' : 'normal';
  }

  function labsRanges(host) {
    var prefs = MT.store.get(K_LABU, null) || {}, state = { sys: prefs.sys || (MT.settings.get('units') === 'conv' ? 'conv' : 'si'), group: 'all', q: '', sex: prefs.sex || 'any' };
    var groups = []; D.labs.forEach(function (t) { if (groups.indexOf(t.group) < 0) groups.push(t.group); });
    var tbl = h('div');
    function savePrefs() { MT.store.set(K_LABU, { v: 1, sys: state.sys, sex: state.sex }); }
    function draw() {
      MT.clear(tbl);
      var list = D.labs.filter(function (t) { return (state.group === 'all' || t.group === state.group) && (!state.q || (t.name + ' ' + t.group).toLowerCase().indexOf(state.q.toLowerCase()) >= 0); });
      if (!list.length) { tbl.appendChild(MT.ui.empty('🔍', 'No tests match', 'Try another name or group.')); return; }
      var sex = state.sex === 'any' ? null : state.sex === 'male' ? 'M' : 'F';
      var rows = [], last = null;
      list.forEach(function (t) {
        if (t.group !== last) { last = t.group; rows.push(h('tr', h('th', { colspan: 3, style: 'background:var(--surface-2);color:var(--accent-text)' }, t.group))); }
        rows.push(h('tr.cs-lab', h('td', h('strong', t.name), t.sex ? h('div.small.muted', 'Differs by sex') : null),
          h('td', h('span.cs-range', rangeText(t, state.sys, sex)), t.sex && !sex ? h('div.small.muted', 'Male ' + rangeText(t, state.sys, 'M', true) + ' · Female ' + rangeText(t, state.sys, 'F', true)) : null),
          h('td', labDetails(t, sex))));
      });
      tbl.appendChild(h('div.table-wrap', h('table.table', h('caption.sr-only', 'Adult reference ranges'), h('thead', h('tr', h('th', 'Test'), h('th', 'Reference range (' + (state.sys === 'si' ? 'SI' : 'conventional') + ')'), h('th', 'Interpretation'))), h('tbody', rows))));
      if (!state.group || state.group === 'all' || state.group === 'Urine') {
        tbl.appendChild(h('details.disclosure', { style: 'margin-top:10px' }, h('summary', 'Urine dipstick (qualitative)'), h('div.disclosure-body', h('div.table-wrap', h('table.table', h('thead', h('tr', h('th', 'Test'), h('th', 'Normal'), h('th', 'Positive suggests'))), h('tbody', D.urineQual.map(function (u) { return h('tr', h('td', u.name), h('td', u.normal), h('td', u.note)); })))))));
      }
    }
    function labDetails(t, sex) {
      var inp = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Check a value for ' + t.name + ' in ' + (state.sys === 'si' ? t.unit : t.convUnit), placeholder: 'Check a value', style: 'max-width:130px;min-height:36px', autocomplete: 'off' });
      var res = h('div', { 'aria-live': 'polite', style: 'margin-top:6px' });
      function check() {
        MT.clear(res); var v = MT.num(inp.value); if (v == null) return;
        var si = toSI(t, v, state.sys);
        var st = labStatus(t, si, sex);
        res.appendChild(MT.ui.badge(st === 'normal' ? 'Within range' : st === 'high' ? 'Above range' : 'Below range', st === 'normal' ? 'ok' : 'warn'));
        var msg = st === 'high' ? t.high : st === 'low' ? t.low : null; if (msg) res.appendChild(h('p.small', { style: 'margin:.3rem 0 0' }, msg));
      }
      inp.addEventListener('input', check);
      return h('details.disclosure', h('summary', 'Meaning'), h('div.disclosure-body',
        t.high ? h('p.small', h('strong', 'High: '), t.high) : null, t.low ? h('p.small', h('strong', 'Low: '), t.low) : null, t.note ? h('p.small', h('strong', 'Note: '), t.note) : null,
        h('div.row', { style: 'gap:6px' }, inp, h('span.small.muted', state.sys === 'si' ? t.unit : t.convUnit)), res));
    }
    var sysSeg = MT.ui.segmented([{ value: 'si', label: 'SI units' }, { value: 'conv', label: 'Conventional' }], state.sys, function (v) { state.sys = v; savePrefs(); draw(); });
    var sexSeg = MT.ui.segmented([{ value: 'any', label: 'Sex: any' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], state.sex, function (v) { state.sex = v; savePrefs(); draw(); });
    var chips = h('div.row', { role: 'group', 'aria-label': 'Test group', style: 'gap:6px' }, ['all'].concat(groups).map(function (g) {
      var b = h('button.chip', { type: 'button', 'aria-pressed': String(g === state.group), onclick: function () { state.group = g; MT.$$('button', chips).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); draw(); } }, g === 'all' ? 'All' : g); return b;
    }));
    host.appendChild(h('div.stack',
      MT.ui.alert('warn', 'Reference ranges vary', 'Typical adult ranges only. Laboratories differ by method, population, age, sex and units: always use the range printed on the patient’s report, and interpret results in clinical context.'),
      h('div.row', sysSeg, sexSeg), searchBox('', 'Search tests', function (v) { state.q = v; draw(); }), chips, tbl));
    draw();
  }

  function labsQuiz(host) {
    var stats = MT.store.get(K_LAB, null); if (!stats || typeof stats !== 'object') stats = { v: 1, n: 0, ok: 0 };
    var area = h('div'), statEl = h('span.badge.badge-accent'), mode = 'range';
    var numeric = D.labs.filter(function (t) { return (t.lo != null || t.hi != null) && !t.sex && t.k != null && t.id.indexOf('urine-ph') < 0 && t.id.indexOf('specific-gravity') < 0; });
    function showStats() { statEl.textContent = 'Score: ' + stats.ok + ' / ' + stats.n; }
    function answered(ok) { stats.n++; if (ok) stats.ok++; MT.store.set(K_LAB, stats); showStats(); }
    function makeValue(t, want) {
      var r = siRange(t, null), lo = r[0], hi = r[1], rnd = Math.random(), be = t.id.indexOf('base-excess') >= 0;
      if (t.up) return want === 'high' ? hi * (1.25 + rnd * 1.5) : hi * (0.15 + rnd * 0.7);
      if (t.lowOnly) return want === 'low' ? lo * (0.4 + rnd * 0.5) : lo * (1.05 + rnd * 0.4);
      var span = hi - lo;
      if (want === 'low') return (lo > 0 || be) ? (be ? lo - span * (0.2 + rnd * 0.8) : lo * (0.45 + rnd * 0.45)) : lo + span * (0.1 + rnd * 0.8);
      if (want === 'high') return hi + span * (0.2 + rnd * 0.8);
      return lo + span * (0.12 + rnd * 0.76);
    }
    function rangeQ() {
      MT.clear(area);
      var t = pick(numeric), sys = t.cv ? 'si' : pick(['si', 'conv']), want = pick(['low', 'normal', 'normal', 'high']), r = siRange(t, null);
      if (want === 'low' && !(r[0] > 0 || t.id.indexOf('base-excess') >= 0) || (want === 'low' && t.up)) want = 'normal';
      if (want === 'high' && t.lowOnly) want = 'normal';
      var si = makeValue(t, want), disp = Number(fromSI(t, si, sys).toPrecision(3)), siShown = toSI(t, disp, sys), truth = labStatus(t, siShown, null);
      var unit = rng(t, sys, null).unit, done = false, fb = h('div', { 'aria-live': 'polite' });
      var opts = h('div.row', ['low', 'normal', 'high'].map(function (o) {
        return h('button.btn.btn-lg', { type: 'button', onclick: function () {
          if (done) return; done = true; var ok = o === truth; answered(ok);
          fb.appendChild(MT.ui.alert(ok ? 'ok' : 'danger', ok ? 'Correct: ' + truth : 'It is ' + truth, h('div', h('p', 'Typical range: ' + rangeText(t, sys, null) + '.'), truth !== 'normal' && t[truth] ? h('p.small', t[truth]) : (t.note ? h('p.small', t.note) : null))));
          fb.appendChild(h('div', { style: 'margin-top:10px' }, h('button.btn.btn-primary', { type: 'button', onclick: rangeQ }, 'Next')));
        } }, o.charAt(0).toUpperCase() + o.slice(1));
      }));
      area.appendChild(h('div.card.stack', h('p.muted', 'An adult has a result of:'), h('div', { style: 'font-size:1.8rem;font-weight:800' }, t.name + ': ' + disp + ' ', h('span.muted', { style: 'font-size:1.1rem' }, unit)), h('p.small.muted', 'Use typical adult ranges from the Ranges tab. Is the value low, normal or high?'), opts, fb));
    }
    function whichQ() {
      MT.clear(area);
      var pool = D.labs.filter(function (t) { return t.high; }), t = pick(pool), others = shuffle(pool.filter(function (x) { return x.id !== t.id && x.group === t.group; })).slice(0, 3);
      if (others.length < 3) others = others.concat(shuffle(pool.filter(function (x) { return x.id !== t.id && others.indexOf(x) < 0; })).slice(0, 3 - others.length));
      var opts = shuffle(others.concat([t])), done = false, fb = h('div', { 'aria-live': 'polite' });
      area.appendChild(h('div.card.stack', h('p.muted', 'Which test, when raised, fits this description?'), h('p', { style: 'font-size:1.1rem;line-height:1.55' }, t.high.replace(new RegExp(t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '…')),
        h('div.choice-list', opts.map(function (o) { return h('button.btn', { type: 'button', style: 'justify-content:flex-start;text-align:left;min-height:44px', onclick: function () { if (done) return; done = true; var ok = o.id === t.id; answered(ok); fb.appendChild(MT.ui.alert(ok ? 'ok' : 'danger', ok ? 'Correct' : 'The answer is ' + t.name, 'Range: ' + rangeText(t, 'si', null) + (t.note ? '. ' + t.note : ''))); fb.appendChild(h('div', { style: 'margin-top:10px' }, h('button.btn.btn-primary', { type: 'button', onclick: whichQ }, 'Next'))); } }, o.name); })), fb));
    }
    var seg = MT.ui.segmented([{ value: 'range', label: 'Low, normal or high?' }, { value: 'which', label: 'Which test?' }], mode, function (v) { mode = v; if (v === 'range') rangeQ(); else whichQ(); });
    host.appendChild(h('div.stack', h('div.row', seg, statEl, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: function () { stats = { v: 1, n: 0, ok: 0 }; MT.store.set(K_LAB, stats); showStats(); } }, 'Reset')), area)); showStats(); rangeQ();
  }

  MT.registerTool({
    id: 'lab-values', title: 'Lab values', category: 'clinical', icon: '🧪', order: 3,
    description: 'Adult reference ranges in SI and conventional units, with interpretation notes, a value checker and a quiz. Ranges vary between laboratories.',
    keywords: ['reference range', 'lab values', 'normal values', 'bloods', 'fbc', 'u&e', 'lft', 'abg', 'thyroid', 'lipids', 'coagulation', 'urine', 'units conversion', 'mmol', 'mg/dl'],
    render: function (container, ctx) {
      var p = ctx.params[0] === 'quiz' ? 'quiz' : 'ranges';
      container.appendChild(navTabs([{ id: 'ranges', label: 'Ranges', href: '#/lab-values' }, { id: 'quiz', label: 'Quiz', href: '#/lab-values/quiz' }], p, 'Lab sections'));
      if (p === 'quiz') labsQuiz(container); else labsRanges(container);
      container.appendChild(h('details.disclosure', { style: 'margin-top:12px' }, h('summary', 'Sources'), h('div.disclosure-body', bullets([D.references[7], D.references[5]]))));
      container.appendChild(MT.ui.disclaimer('Reference ranges are typical adult values and differ between laboratories. Use your laboratory’s reported range and the clinical picture.'));
    }
  });

  /* ---------- global search ---------- */
  MT.registerSearch(function (q) {
    q = String(q || '').toLowerCase().trim(); if (q.length < 2) return [];
    var out = [];
    D.stations.forEach(function (s) { if ((s.title + ' ' + typeLabel(s.type)).toLowerCase().indexOf(q) >= 0) out.push({ title: s.title, description: 'OSCE station · ' + typeLabel(s.type), href: '#/osce/' + s.id, icon: '🩺' }); });
    D.complaints.forEach(function (c) { if ((c.name + ' ' + c.dx.map(function (d) { return d.name; }).join(' ')).toLowerCase().indexOf(q) >= 0) out.push({ title: c.name + ': differential', description: c.dx.length + ' diagnoses, ' + c.dx.filter(function (d) { return d.type === 'm'; }).length + ' can’t-miss', href: '#/history/' + c.id, icon: '📋' }); });
    D.labs.forEach(function (t) { if (t.name.toLowerCase().indexOf(q) >= 0) out.push({ title: t.name + ' reference range', description: rangeText(t, 'si', null), href: '#/lab-values', icon: '🧪' }); });
    return out.slice(0, 8);
  });
})();

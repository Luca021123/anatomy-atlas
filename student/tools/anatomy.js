/* Open Medical Toolkit — Anatomy Atlas (student suite, package S3).
 * Six tools: brachial-plexus, lumbosacral-plexus, cranial-nerves, dermatomes, muscles, skull-foramina.
 * All anatomy comes from student/data/anatomy.js (MTData.anatomy); see the sources cited there and in each tool.
 * Diagrams are inline SVG themed with the core CSS variables (light and dark). No network, no dependencies.
 * Learning progress is kept in MT.store under student.anatomy.stats (private, on-device).
 */
(function () {
  'use strict';
  var D = (self.MTData || {}).anatomy;
  if (!D || typeof MT === 'undefined') { if (typeof console !== 'undefined') console.error('Anatomy Atlas: data file missing'); return; }
  var h = MT.h, s = MT.s, H = D.helpers, Q = D.quiz;
  var STATS_KEY = 'student.anatomy.stats';
  var reduceMotion = false;
  try { reduceMotion = !!(self.matchMedia && self.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }

  MT.css('an', [
    '.an-wrap{display:flex;flex-direction:column;gap:14px}',
    '.an-wrap h2{margin:0}',
    '.an-lead{margin:2px 0 0;color:var(--text-2);max-width:70ch}',
    '.an-grid{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}',
    '.an-left{flex:2 1 460px;min-width:0}',
    '.an-right{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:12px}',
    '.an-dcard{padding:12px}',
    '.an-ctrl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}',
    '.an-ctrl label{font-weight:600;font-size:.88rem;color:var(--text-2)}',
    '.an-ctrl select,.an-search{font:inherit;min-height:40px;padding:6px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);max-width:100%}',
    '.an-ctrl select{flex:1 1 200px;min-width:0}',
    '.an-svgbox{width:100%;margin:0 auto;touch-action:manipulation}',
    '.an-svgbox.is-narrow{max-width:460px}',
    '.an-svgbox.is-big{overflow-x:auto;padding-bottom:6px;max-width:none}',
    '.an-svgbox.is-big .an-svg{width:720px;max-width:none}',
    '.an-enlarge[hidden]{display:none}',
    '@media(max-width:520px){.an-dcard{padding:8px}}',
    '.an-svg{display:block;width:100%;height:auto;font-family:var(--font);overflow:visible}',
    '.an-svg text{fill:var(--text);text-anchor:middle;pointer-events:none;user-select:none}',
    '.an-colhead{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;fill:var(--muted)!important}',
    '.an-edge{fill:none;stroke:var(--nc,var(--border-strong));stroke-width:1.7;opacity:.72;stroke-linecap:round;transition:opacity .15s}',
    '.an-edge.is-on{stroke-width:3.4;opacity:1}',
    '.an-edge.is-lesion{stroke:var(--danger);stroke-width:3.6;opacity:1}',
    '.an-svg.has-focus .an-edge:not(.is-on):not(.is-lesion){opacity:.14}',
    '.an-node{cursor:pointer;outline:none;--nc:var(--border-strong)}',
    '.an-g-lat,.an-g-lum{--nc:var(--chart-1)}',
    '.an-g-post,.an-g-sac{--nc:var(--chart-4)}',
    '.an-g-med{--nc:var(--chart-3)}',
    '.an-g-mix,.an-g-sci{--nc:var(--chart-5)}',
    '.an-edge.an-e-lat,.an-edge.an-e-lum{--nc:var(--chart-1)}',
    '.an-edge.an-e-post,.an-edge.an-e-sac{--nc:var(--chart-4)}',
    '.an-edge.an-e-med{--nc:var(--chart-3)}',
    '.an-edge.an-e-mix,.an-edge.an-e-sci{--nc:var(--chart-5)}',
    '.an-body{fill:color-mix(in srgb,var(--nc) 13%,var(--surface));stroke:var(--nc);stroke-width:1.6;transition:fill .15s,stroke .15s}',
    '.an-g-none .an-body{fill:var(--surface-2)}',
    '.an-t-collateral .an-body{stroke-width:1.2;fill:color-mix(in srgb,var(--nc) 7%,var(--surface))}',
    '.an-t-terminal .an-body{stroke-width:2.6}',
    '.an-t-terminal text{font-weight:700}',
    '.an-t-cord text,.an-t-trunk text{font-weight:700}',
    '.an-halo{fill:none;stroke:var(--accent);stroke-width:3;opacity:0}',
    '.an-node:hover .an-body{stroke-width:2.6}',
    '.an-node:focus-visible .an-halo{opacity:1;stroke-dasharray:5 3}',
    '.an-node.is-sel .an-halo{opacity:1;stroke-dasharray:none}',
    '.an-svg.has-focus .an-node:not(.is-hl){opacity:.4}',
    '.an-node.is-site .an-body{fill:var(--danger-soft);stroke:var(--danger);stroke-width:3.2}',
    '.an-node.is-aff .an-body{fill:var(--warn-soft);stroke:var(--warn);stroke-width:2.6}',
    '.an-node.is-part .an-body{fill:var(--warn-soft);stroke:var(--warn);stroke-width:2;stroke-dasharray:4 3}',
    '.an-node.is-ok .an-body{fill:var(--ok-soft);stroke:var(--ok);stroke-width:3.2}',
    '.an-node.is-bad .an-body{fill:var(--danger-soft);stroke:var(--danger);stroke-width:3.2}',
    '.an-mk{display:none}',
    '.an-mk circle{stroke:var(--surface);stroke-width:1.5}',
    '.an-mk text{fill:#fff!important;font-weight:800}',
    '.an-node.is-site .an-mk-site,.an-node.is-aff .an-mk-aff,.an-node.is-part .an-mk-part,.an-node.is-ok .an-mk-ok,.an-node.is-bad .an-mk-bad{display:inline}',
    '.an-mk-site circle,.an-mk-bad circle{fill:var(--danger)}.an-mk-aff circle,.an-mk-part circle{fill:var(--warn)}.an-mk-ok circle{fill:var(--ok)}',
    '.an-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:.82rem;color:var(--text-2)}',
    '.an-legend span{display:inline-flex;align-items:center;gap:6px}',
    '.an-sw{width:14px;height:14px;border-radius:4px;border:2px solid var(--nc);display:inline-block;flex:none}',
    '.an-sw.s-site{background:var(--danger-soft);border-color:var(--danger)}',
    '.an-sw.s-aff{background:var(--warn-soft);border-color:var(--warn)}',
    '.an-sw.s-part{background:var(--warn-soft);border-color:var(--warn);border-style:dashed}',
    '.an-panel{padding:14px 16px}',
    '.an-panel h3{margin:0 0 4px;font-size:1.12rem;line-height:1.25}',
    '.an-panel h4{margin:14px 0 4px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}',
    '.an-panel p{margin:0}',
    '.an-badges{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px}',
    '.an-sign{margin-top:12px;padding:10px 12px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:0 var(--radius-sm) var(--radius-sm) 0;color:var(--text)}',
    '.an-sign b{display:block;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--accent-text);margin-bottom:2px}',
    '.an-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.an-chip{display:inline-flex;align-items:center;min-height:32px;padding:3px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text-2);font:inherit;font-size:.84rem;font-weight:600;text-decoration:none;cursor:pointer}',
    '.an-chip:hover{border-color:var(--accent);color:var(--accent-text);text-decoration:none}',
    '.an-chip[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent-text);border-color:var(--accent)}',
    '.an-back{display:none}',
    '@media(max-width:780px){.an-back{display:inline-flex}}',
    '.an-note{font-size:.84rem;color:var(--muted)}',
    '.an-mcq{display:flex;flex-direction:column;gap:10px}',
    '.an-q-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center}',
    '.an-q-prompt{font-size:1.06rem;font-weight:600;margin:0;line-height:1.4}',
    '.an-opts{display:grid;gap:8px}',
    '.an-opt{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font:inherit;cursor:pointer}',
    '.an-opt:hover:not(:disabled){border-color:var(--accent);background:var(--accent-soft)}',
    '.an-opt:disabled{cursor:default}',
    '.an-opt-k{flex:none;width:24px;height:24px;border-radius:50%;background:var(--surface-3);display:grid;place-items:center;font-size:.78rem;font-weight:700;color:var(--text-2)}',
    '.an-opt.is-ok{border-color:var(--ok);background:var(--ok-soft)}.an-opt.is-ok .an-opt-k{background:var(--ok);color:var(--surface)}',
    '.an-opt.is-bad{border-color:var(--danger);background:var(--danger-soft)}.an-opt.is-bad .an-opt-k{background:var(--danger);color:var(--surface)}',
    '.an-fb{padding:10px 12px;border-radius:var(--radius-sm);background:var(--surface-2);border:1px solid var(--border);font-size:.94rem}',
    '.an-fb.ok{background:var(--ok-soft);border-color:var(--ok-border)}.an-fb.bad{background:var(--danger-soft);border-color:var(--danger-border)}',
    '.an-clue{padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2)}',
    '.an-clue b{display:block;font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}',
    '.an-score{font-size:.84rem;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.an-cranial-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}',
    '.an-cranial-pills .an-chip{min-width:44px;justify-content:center}',
    '.an-ncard dl{display:grid;grid-template-columns:1fr;gap:2px 0;margin:0}',
    '.an-ncard dt{margin-top:10px;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}',
    '.an-ncard dd{margin:0}',
    '.an-ncard ul{margin:2px 0 0;padding-left:1.2em}',
    '.an-body-svg .an-fig{fill:var(--surface-2);stroke:var(--border-strong);stroke-width:2}',
    '.an-pill{cursor:pointer;outline:none}',
    '.an-pill rect.an-pb{fill:var(--surface);stroke:var(--border-strong);stroke-width:1.4}',
    '.an-pill:hover rect.an-pb{stroke:var(--accent)}',
    '.an-pill:focus-visible .an-halo{opacity:1;stroke-dasharray:5 3}',
    '.an-pill.is-sel rect.an-pb{fill:var(--accent-soft);stroke:var(--accent);stroke-width:2.4}',
    '.an-pill.is-ok rect.an-pb{fill:var(--ok-soft);stroke:var(--ok);stroke-width:2.6}',
    '.an-pill.is-bad rect.an-pb{fill:var(--danger-soft);stroke:var(--danger);stroke-width:2.6}',
    '.an-pill text{text-anchor:start}',
    '.an-pill .an-num{font-weight:800;fill:var(--accent-text)}',
    '.an-nerve-line{fill:none;stroke:var(--text-2);stroke-width:3;stroke-linecap:round}',
    '.an-nerve-line.thick{stroke-width:5}',
    '.an-nerve-line.dash{stroke-dasharray:6 4}',
    '.an-lead-line{fill:none;stroke:var(--border-strong);stroke-width:1.2}',
    '.an-hl .an-nerve-line{stroke:var(--accent);stroke-width:5}',
    '.an-hl .an-lead-line{stroke:var(--accent);stroke-width:2}',
    '.an-hl .an-dot{fill:var(--accent)}',
    '.an-dot{fill:var(--surface);stroke:var(--text-2);stroke-width:2}',
    '.an-mkr{cursor:pointer;outline:none}',
    '.an-mkr circle{fill:var(--surface);stroke:var(--accent);stroke-width:2}',
    '.an-mkr text{font-size:11px;font-weight:800;fill:var(--accent-text)}',
    '.an-mkr:hover circle{fill:var(--accent-soft)}',
    '.an-mkr.is-sel circle{fill:var(--accent);}.an-mkr.is-sel text{fill:var(--accent-contrast)!important}',
    '.an-mkr:focus-visible circle{stroke-width:4}',
    '.an-mkr.is-ok circle{fill:var(--ok-soft);stroke:var(--ok)}.an-mkr.is-bad circle{fill:var(--danger-soft);stroke:var(--danger)}',
    '.an-tbl td,.an-tbl th{font-size:.9rem}',
    '.an-mrow{display:grid;grid-template-columns:1fr;gap:2px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);text-align:left;width:100%;cursor:pointer;font:inherit;color:var(--text)}',
    '.an-mrow:hover{border-color:var(--accent)}',
    '.an-mrow[aria-expanded="true"]{border-color:var(--accent);background:var(--accent-soft)}',
    '.an-mrow b{font-size:1rem}',
    '.an-mlist{display:grid;gap:8px}',
    '.an-mdetail{margin-top:-2px;padding:12px 14px;border:1px solid var(--accent);border-top:0;border-radius:0 0 var(--radius-sm) var(--radius-sm);background:var(--surface)}',
    '.an-flash{min-height:230px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:10px;padding:22px 16px;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--surface);cursor:pointer;width:100%;font:inherit;color:var(--text)}',
    '.an-flash:hover{border-color:var(--accent)}',
    '.an-flash .q{font-size:1.35rem;font-weight:700}',
    '.an-flash dl{margin:0;text-align:left;width:100%;display:grid;gap:6px}',
    '.an-flash dt{font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}',
    '.an-flash dd{margin:0}',
    '.an-fcr{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}',
    '.an-prog{height:8px;background:var(--surface-3);border-radius:999px;overflow:hidden}',
    '.an-prog i{display:block;height:100%;background:var(--accent);transition:width .2s}',
    '.an-fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;align-items:end}',
    '.an-fgrid label{display:flex;flex-direction:column;gap:3px;font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}',
    '.an-fgrid select{font:inherit;text-transform:none;letter-spacing:0;font-weight:400;color:var(--text);min-height:40px;padding:6px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--surface)}',
    '.an-search{width:100%}',
    '.an-fossa{margin:18px 0 8px}',
    '@media(prefers-reduced-motion:reduce){.an-edge,.an-body,.an-prog i{transition:none}}'
  ].join('\n'));

  /* ---------------- shared helpers ---------------- */
  function stats() {
    var v = MT.store.get(STATS_KEY, null);
    if (!v || v.v !== 1 || typeof v.topics !== 'object' || !v.topics) v = { v: 1, topics: {}, cards: {} };
    if (!v.cards || typeof v.cards !== 'object') v.cards = {};
    return v;
  }
  function bumpStat(topic, ok) {
    var st = stats(), t = st.topics[topic] || { a: 0, c: 0, streak: 0, best: 0 };
    t.a++; if (ok) { t.c++; t.streak++; if (t.streak > t.best) t.best = t.streak; } else t.streak = 0;
    st.topics[topic] = t;
    MT.store.set(STATS_KEY, st);
    return t;
  }
  function topicStat(topic) { var t = stats().topics[topic]; return t || { a: 0, c: 0, streak: 0, best: 0 }; }
  function scoreText(session, topic) {
    var t = topicStat(topic), txt = 'This session ' + session.ok + '/' + session.n;
    if (session.streak > 1) txt += ' · streak ' + session.streak;
    if (t.a) txt += ' · all-time ' + Math.round(100 * t.c / t.a) + '% of ' + t.a + ' · best streak ' + t.best;
    return txt;
  }
  function scrollTo(el) {
    try { el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
  }
  function chipLink(label, href) { return h('a.an-chip', { href: href }, label); }
  function kvRow(label, content) { return [h('h4', label), h('div', content)]; }
  function nerveName(id) { var n = H.nerveById(id); return n ? n.name : id; }
  function rootsDisp(m) { return m.rootsText + (m.note && /C\d|T\d|L\d|S\d/.test(m.note) ? '' : ''); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  var TYPE_LABEL = { root: 'Root', trunk: 'Trunk', division: 'Division', cord: 'Cord', terminal: 'Terminal branch', collateral: 'Collateral branch' };

  /** Generic multiple-choice quiz. opts: {topic, make(): q, extra(q): Node, onAnswer(q, i, ok), intro, onNew(q)} */
  function mcq(opts) {
    var root = h('div.an-mcq'), session = { n: 0, ok: 0, streak: 0 }, q = null, answered = false, keyHandler = null;
    function newQ() {
      q = opts.make(); answered = false;
      if (opts.onNew) opts.onNew(q);
      draw();
    }
    function draw() {
      MT.clear(root);
      var score = h('span.an-score', { 'aria-live': 'polite' }, scoreText(session, opts.topic));
      root.appendChild(h('div.an-q-head', h('span.muted.small', 'Question ' + (session.n + (answered ? 0 : 1))), score));
      if (opts.intro) root.appendChild(h('p.an-note', opts.intro));
      root.appendChild(h('p.an-q-prompt', { id: 'an-qp' }, q.prompt));
      if (opts.extra) { var ex = opts.extra(q, answered); if (ex) root.appendChild(ex); }
      var list = h('div.an-opts', { role: 'group', 'aria-labelledby': 'an-qp' });
      q.options.forEach(function (o, i) {
        list.appendChild(h('button.an-opt', { type: 'button', 'data-i': i, onclick: function () { choose(i); } }, h('span.an-opt-k', 'ABCD'.charAt(i)), h('span', o)));
      });
      root.appendChild(list);
      root.appendChild(h('div', { id: 'an-fb', 'aria-live': 'polite' }));
      root.appendChild(h('p.an-note', 'Tip: press 1–4 to answer and Enter for the next question.'));
    }
    function choose(i) {
      if (answered) return;
      answered = true; session.n++;
      var ok = i === q.answer;
      if (ok) { session.ok++; session.streak++; } else session.streak = 0;
      bumpStat(opts.topic, ok);
      MT.$$('.an-opt', root).forEach(function (b, k) {
        b.disabled = true;
        if (k === q.answer) b.classList.add('is-ok'); else if (k === i) b.classList.add('is-bad');
      });
      var fb = MT.$('#an-fb', root);
      MT.clear(fb);
      fb.appendChild(h('div.an-fb.' + (ok ? 'ok' : 'bad'), h('strong', ok ? 'Correct. ' : 'Not quite. The answer is ' + q.options[q.answer] + '. '), q.explain));
      var nb = h('button.btn.btn-primary', { type: 'button', style: 'margin-top:10px', onclick: newQ }, 'Next question');
      fb.appendChild(nb);
      var sc = MT.$('.an-score', root); if (sc) sc.textContent = scoreText(session, opts.topic);
      if (opts.onAnswer) opts.onAnswer(q, i, ok);
      try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); }
    }
    keyHandler = function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (!root.isConnected) return;
      if (/^[1-4]$/.test(e.key) && !answered) { choose(Number(e.key) - 1); e.preventDefault(); }
      else if (e.key === 'Enter' && answered && t !== 'BUTTON') { newQ(); e.preventDefault(); }
    };
    document.addEventListener('keydown', keyHandler);
    root._destroy = function () { document.removeEventListener('keydown', keyHandler); };
    root._restart = newQ;
    newQ();
    return root;
  }
  function destroyMcq(node) { if (node && node._destroy) node._destroy(); }

  function tabsBar(tabs, active, onChange) {
    var bar = MT.ui.tabs(tabs, active, onChange);
    bar.setAttribute('aria-label', 'Sections');
    return bar;
  }
  function refLine(list) {
    return h('details.disclosure', h('summary', 'Sources and notes'), h('div.disclosure-body', h('ul', list.map(function (r) { return h('li', r); })),
      MT.ui.disclaimer('Educational reference based on standard anatomy texts. Textbooks differ on some root values and variants; where they do, both are noted. It does not replace a current textbook or clinical judgement.')));
  }

  /* =====================================================================
     PLEXUS SCHEMATICS (brachial and lumbosacral)
     ===================================================================== */
  function buildGraph(P) {
    var byId = {}, fwd = {}, back = {};
    P.nodes.forEach(function (n) { byId[n.id] = n; fwd[n.id] = []; back[n.id] = []; });
    P.edges.forEach(function (e) { var p = e.split('>'); fwd[p[0]].push(p[1]); back[p[1]].push(p[0]); });
    function closure(id, adj) {
      var seen = {}, stack = [id];
      while (stack.length) { var c = stack.pop(); (adj[c] || []).forEach(function (n) { if (!seen[n]) { seen[n] = true; stack.push(n); } }); }
      return seen;
    }
    return { byId: byId, fwd: fwd, back: back, up: function (id) { return closure(id, back); }, down: function (id) { return closure(id, fwd); } };
  }

  /** Build the SVG for one layout. Returns { svg, nodeEls, edgeEls }. */
  function buildPlexusSvg(P, layoutName, handlers) {
    var L = P.layouts[layoutName], pos = L.pos, fs = L.font, W = L.vb[0], Hh = L.vb[1];
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + Hh, class: 'an-svg', role: 'group', 'aria-label': P.title + ' schematic. Use Tab or the arrow keys to move between structures and Enter to select one.' });
    var gH = s('g'), gE = s('g'), gN = s('g');
    var headY = L.headY || (Hh - 8);
    (L.heads || []).forEach(function (hd) { gH.appendChild(s('text', { class: 'an-colhead', x: hd[0], y: headY }, hd[1])); });
    var nodeEls = {}, edgeEls = [];
    var byId = {}; P.nodes.forEach(function (n) { byId[n.id] = n; });
    P.edges.forEach(function (e) {
      var ids = e.split('>'), a = pos[ids[0]], b = pos[ids[1]], d;
      var an = byId[ids[0]], bn = byId[ids[1]];
      var lane = L.lanes && L.lanes[e];
      if (lane != null) {
        var x1 = a[0] - a[2] / 2, y1 = a[1], inside = lane >= b[0] - b[2] / 2 && lane <= b[0] + b[2] / 2;
        d = 'M' + x1 + ' ' + y1 + ' H' + lane + (inside ? ' V' + (b[1] + b[3] / 2) : ' V' + b[1] + ' H' + (b[0] - b[2] / 2));
      } else if (b[1] + b[3] / 2 <= a[1] - a[3] / 2 + 2 && Math.abs(b[0] - a[0]) < 160) { // target pill sits above the source
        var sx = a[0] + Math.max(-20, Math.min(20, (b[0] - a[0]) * 0.35)), sy = a[1] - a[3] / 2, ex = b[0], ey = b[1] + b[3] / 2, my = (sy + ey) / 2;
        d = 'M' + sx + ' ' + sy + ' C' + sx + ' ' + my + ',' + ex + ' ' + my + ',' + ex + ' ' + ey;
      } else if (b[0] < a[0]) { // leftward edge
        var lx1 = a[0] - a[2] / 2, lx2 = b[0] + b[2] / 2, lm = (lx1 + lx2) / 2;
        d = 'M' + lx1 + ' ' + a[1] + ' C' + lm + ' ' + a[1] + ',' + lm + ' ' + b[1] + ',' + lx2 + ' ' + b[1];
      } else {
        var px1 = a[0] + a[2] / 2, px2 = b[0] - b[2] / 2, pm = (px1 + px2) / 2;
        d = 'M' + px1 + ' ' + a[1] + ' C' + pm + ' ' + a[1] + ',' + pm + ' ' + b[1] + ',' + px2 + ' ' + b[1];
      }
      var grp = bn.grp !== 'none' ? bn.grp : an.grp;
      var el = s('path', { class: 'an-edge an-e-' + grp, d: d });
      gE.appendChild(el);
      edgeEls.push({ a: ids[0], b: ids[1], el: el });
    });
    P.nodes.forEach(function (n) {
      var p = pos[n.id], cx = p[0], cy = p[1], w = p[2], hh = p[3];
      var lines = Array.isArray(n.label) ? n.label : [n.label];
      var fsz = n.type === 'collateral' ? fs - 1.5 : (n.type === 'division' ? fs - 1 : fs);
      var lh = fsz * 1.15;
      var g = s('g', { class: 'an-node an-t-' + n.type + ' an-g-' + n.grp, tabindex: '0', role: 'button', 'data-id': n.id,
        'aria-label': n.name + ', ' + (TYPE_LABEL[n.type] || n.type).toLowerCase() + (n.roots ? ', ' + n.roots : '') });
      g.appendChild(s('rect', { class: 'an-halo', x: cx - w / 2 - 4, y: cy - hh / 2 - 4, width: w + 8, height: hh + 8, rx: 10 }));
      g.appendChild(s('rect', { class: 'an-body', x: cx - w / 2, y: cy - hh / 2, width: w, height: hh, rx: n.type === 'root' ? Math.min(hh / 2, 14) : 7 }));
      lines.forEach(function (ln, i) {
        g.appendChild(s('text', { x: cx, y: cy + (i - (lines.length - 1) / 2) * lh + fsz * 0.35, 'font-size': fsz }, ln));
      });
      [['site', '✕'], ['aff', '!'], ['part', '½'], ['ok', '✓'], ['bad', '✕']].forEach(function (m) {
        var mk = s('g', { class: 'an-mk an-mk-' + m[0] });
        mk.appendChild(s('circle', { cx: cx + w / 2 - 2, cy: cy - hh / 2 + 1, r: 8 }));
        mk.appendChild(s('text', { x: cx + w / 2 - 2, y: cy - hh / 2 + 4.6, 'font-size': 10 }, m[1]));
        g.appendChild(mk);
      });
      g.addEventListener('click', function () { handlers.activate(n.id); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.activate(n.id); }
        else if (/^Arrow/.test(e.key)) { e.preventDefault(); var t = neighbour(P, pos, n.id, e.key); if (t && nodeEls[t]) nodeEls[t].focus(); }
      });
      gN.appendChild(g);
      nodeEls[n.id] = g;
    });
    svg.appendChild(gH); svg.appendChild(gE); svg.appendChild(gN);
    return { svg: svg, nodeEls: nodeEls, edgeEls: edgeEls };
  }
  /** Spatial arrow-key navigation: nearest node in the pressed direction. */
  function neighbour(P, pos, id, key) {
    var c = pos[id], best = null, bestScore = 1e9;
    P.nodes.forEach(function (n) {
      if (n.id === id) return;
      var p = pos[n.id], dx = p[0] - c[0], dy = p[1] - c[1], along, across;
      if (key === 'ArrowRight') { along = dx; across = Math.abs(dy); }
      else if (key === 'ArrowLeft') { along = -dx; across = Math.abs(dy); }
      else if (key === 'ArrowDown') { along = dy; across = Math.abs(dx); }
      else { along = -dy; across = Math.abs(dx); }
      if (along <= 4) return;
      var sc = along + across * 2.2;
      if (sc < bestScore) { bestScore = sc; best = n.id; }
    });
    return best;
  }

  function plexusTool(P, meta) {
    var G = buildGraph(P);
    MT.registerTool({
      id: meta.id, title: meta.title, category: 'anatomy', icon: meta.icon, order: meta.order,
      description: meta.description, keywords: meta.keywords,
      render: function (container, ctx) {
        var st = { tab: 'explore', sel: null, lesion: null, layoutName: null, quizKind: 'tap', tap: null, lq: null, lqClue: 1, lqDone: false, tapSession: { n: 0, ok: 0, streak: 0 }, lqSession: { n: 0, ok: 0, streak: 0 }, scope: 'all' };
        if (ctx.params && ctx.params[0] && G.byId[ctx.params[0]]) st.sel = ctx.params[0];
        if (ctx.params && ctx.params[0] === 'lesion' && ctx.params[1]) { var lz = P.lesions.filter(function (l) { return l.id === ctx.params[1]; })[0]; if (lz) { st.tab = 'lesion'; st.lesion = lz.id; } }
        var diag = null, ro = null, disposed = false;
        var ctrl = h('div.an-ctrl'), box = h('div.an-svgbox'), legend = h('div.an-legend'), panel = h('div.an-right', { 'aria-live': 'polite' });
        var dcard = h('div.card.an-dcard', ctrl, box, legend);
        var tabs = tabsBar([{ id: 'explore', label: 'Explore' }, { id: 'lesion', label: 'Lesion simulator' }, { id: 'quiz', label: 'Quiz' }], st.tab, function (id) { setTab(id); });
        var root = h('div.an-wrap',
          tabs,
          h('div.an-grid', h('div.an-left', dcard), panel),
          refLine(P.sources.concat([P.mnemonic]))
        );
        container.appendChild(root);

        function lesionObj() { return st.lesion ? P.lesions.filter(function (l) { return l.id === st.lesion; })[0] : null; }
        function setTab(id) {
          st.tab = id; st.sel = id === 'quiz' ? null : st.sel; st.reveal = null;
          if (id !== 'quiz') { destroyMcq(st.lqNode); st.lqNode = null; }
          if (id === 'quiz') { st.lesion = null; startQuiz(); }
          if (id === 'explore') st.lesion = null;
          var names = { explore: 'Explore', lesion: 'Lesion simulator', quiz: 'Quiz' };
          MT.$$('[role=tab]', tabs).forEach(function (b) { b.setAttribute('aria-selected', String(b.textContent === names[id])); });
          renderControls(); renderPanel(); applyState();
        }
        function sizeName() { if (st.big) return 'wide'; var w = dcard.clientWidth; return w >= 540 ? 'wide' : 'narrow'; }
        function isCramped() { return dcard.clientWidth < 540; }
        function mountSvg() {
          var name = sizeName();
          if (diag && st.layoutName === name) return;
          st.layoutName = name;
          diag = buildPlexusSvg(P, name, { activate: activate });
          MT.clear(box); box.appendChild(diag.svg);
          box.classList.toggle('is-narrow', name === 'narrow');
          box.classList.toggle('is-big', !!st.big);
          var eb = MT.$('.an-enlarge', ctrl); if (eb) eb.hidden = !(st.big || isCramped());
          applyState();
        }
        function applyState() {
          if (!diag) return;
          var les = st.tab === 'lesion' ? lesionObj() : (st.tab === 'quiz' && st.quizKind === 'lesion' && st.reveal ? P.lesions.filter(function (l) { return l.id === st.reveal; })[0] : null);
          var hl = {}, siteSet = {}, affSet = {}, partSet = {}, lesionSet = {}, onEdge = function () { return false; };
          Object.keys(diag.nodeEls).forEach(function (id) { diag.nodeEls[id].setAttribute('class', diag.nodeEls[id].getAttribute('class').replace(/\s*\bis-(sel|hl|site|aff|part|ok|bad)\b/g, '')); });
          function mark(id, cls) { if (diag.nodeEls[id]) diag.nodeEls[id].classList.add(cls); }
          var focus = false;
          if (les) {
            focus = true;
            les.sites.forEach(function (id) { siteSet[id] = 1; lesionSet[id] = 1; hl[id] = 1; mark(id, 'is-site'); Object.keys(G.up(id)).forEach(function (u) { hl[u] = 1; }); });
            les.affected.forEach(function (id) { affSet[id] = 1; lesionSet[id] = 1; hl[id] = 1; mark(id, 'is-aff'); });
            les.partial.forEach(function (id) { partSet[id] = 1; lesionSet[id] = 1; hl[id] = 1; mark(id, 'is-part'); });
            var upSet = {}; les.sites.forEach(function (id) { upSet[id] = 1; Object.keys(G.up(id)).forEach(function (u) { upSet[u] = 1; }); });
            onEdge = function (a, b) { return upSet[a] && upSet[b] ? 'on' : (lesionSet[a] && lesionSet[b] ? 'lesion' : ''); };
          } else if (st.sel && G.byId[st.sel]) {
            focus = true;
            var up = G.up(st.sel), dn = G.down(st.sel); up[st.sel] = 1; dn[st.sel] = 1;
            Object.keys(up).forEach(function (k) { hl[k] = 1; }); Object.keys(dn).forEach(function (k) { hl[k] = 1; });
            onEdge = function (a, b) { return (up[a] && up[b]) || (dn[a] && dn[b]) ? 'on' : ''; };
            mark(st.sel, 'is-sel');
          }
          if (st.tab === 'quiz' && st.quizKind === 'tap') { focus = false; onEdge = function () { return ''; }; hl = {}; }
          Object.keys(hl).forEach(function (id) { mark(id, 'is-hl'); });
          if (st.tab === 'quiz' && st.tap && st.tap.result) {
            mark(st.tap.target, 'is-ok'); if (st.tap.picked && st.tap.picked !== st.tap.target) mark(st.tap.picked, 'is-bad');
            focus = false;
          }
          diag.svg.classList.toggle('has-focus', focus);
          diag.edgeEls.forEach(function (e) {
            var r = onEdge(e.a, e.b);
            e.el.classList.toggle('is-on', r === 'on'); e.el.classList.toggle('is-lesion', r === 'lesion');
          });
        }
        function renderLegend() {
          MT.clear(legend);
          P.groups.forEach(function (g) { legend.appendChild(h('span', h('i.an-sw', { style: '--nc:' + g.color }), g.label)); });
          if (st.tab === 'lesion') {
            legend.appendChild(h('span', h('i.an-sw.s-site'), '✕ lesion site'));
            legend.appendChild(h('span', h('i.an-sw.s-aff'), '! affected downstream'));
            legend.appendChild(h('span', h('i.an-sw.s-part'), '½ partly affected'));
          }
        }
        function renderControls() {
          MT.clear(ctrl);
          var enlarge = h('button.btn.btn-sm.btn-ghost.an-enlarge', { type: 'button', 'aria-pressed': String(!!st.big), hidden: !(st.big || isCramped()), title: 'Show the diagram larger and pan sideways', onclick: function () { st.big = !st.big; diag = null; this.setAttribute('aria-pressed', String(st.big)); this.textContent = st.big ? 'Fit to screen' : 'Enlarge'; mountSvg(); } }, st.big ? 'Fit to screen' : 'Enlarge');
          if (st.tab === 'explore') {
            var sel = h('select', { id: 'an-jump', 'aria-label': 'Jump to a structure', onchange: function (e) { if (e.target.value) activate(e.target.value, true); } }, h('option', { value: '' }, 'Jump to a structure…'));
            Object.keys(TYPE_LABEL).forEach(function (t) {
              var items = P.nodes.filter(function (n) { return n.type === t; });
              if (!items.length) return;
              var og = h('optgroup', { label: TYPE_LABEL[t] + 's' });
              items.forEach(function (n) { og.appendChild(h('option', { value: n.id, selected: st.sel === n.id }, n.name)); });
              sel.appendChild(og);
            });
            ctrl.appendChild(h('label', { for: 'an-jump' }, 'Structure'));
            ctrl.appendChild(sel);
            ctrl.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { st.sel = null; renderControls(); renderPanel(); applyState(); } }, 'Clear'));
          } else if (st.tab === 'lesion') {
            var ls = h('select', { id: 'an-les', 'aria-label': 'Choose a lesion to simulate', onchange: function (e) { st.lesion = e.target.value || null; renderPanel(); applyState(); } }, h('option', { value: '' }, 'Choose a lesion…'));
            P.lesions.forEach(function (l) { ls.appendChild(h('option', { value: l.id, selected: st.lesion === l.id }, l.name)); });
            ctrl.appendChild(h('label', { for: 'an-les' }, 'Lesion'));
            ctrl.appendChild(ls);
            ctrl.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { st.lesion = null; renderControls(); renderPanel(); applyState(); } }, 'Clear'));
          } else {
            ctrl.appendChild(MT.ui.segmented([{ value: 'tap', label: 'Tap the structure' }, { value: 'lesion', label: 'Name the lesion' }], st.quizKind, function (v) { st.quizKind = v; startQuiz(); renderControls(); renderPanel(); applyState(); }));
            if (st.quizKind === 'tap') {
              ctrl.appendChild(MT.ui.segmented([{ value: 'all', label: 'All' }, { value: 'main', label: 'Main pathway' }, { value: 'branches', label: 'Branches' }], st.scope, function (v) { st.scope = v; startQuiz(); renderPanel(); applyState(); }));
            }
          }
          ctrl.appendChild(enlarge);
          renderLegend();
        }

        /* ---- selecting a structure ---- */
        function activate(id, fromJump) {
          if (st.tab === 'quiz') { if (st.quizKind === 'tap') answerTap(id); return; }
          st.sel = id;
          if (st.tab === 'explore') { var j = MT.$('#an-jump', ctrl); if (j) j.value = id; }
          renderPanel(); applyState();
          if (!fromJump && diag && diag.nodeEls[id] && document.activeElement !== diag.nodeEls[id]) { /* keep focus where it is */ }
          var p = MT.$('.an-sel-card', panel);
          if (p && panel.getBoundingClientRect().top > (self.innerHeight || 800) * 0.55) scrollTo(p);
        }
        function muscleChips(list) {
          return h('div.an-chips', list.map(function (m) { return chipLink(m.name + (m.dual ? ' *' : ''), '#/muscles/' + m.id); }));
        }
        function nodeCard(n) {
          var nv = n.nerve ? H.nerveById(n.nerve) : null;
          var ms = n.nerve ? H.musclesOfNerve(n.nerve, true) : [];
          var rows = [];
          rows.push(kvRow('Root values', n.roots));
          if (n.motor) rows.push(kvRow('Motor supply', n.motor));
          if (ms.length) {
            var nm = ms.length + ' muscle' + (ms.length === 1 ? '' : 's');
            rows.push(kvRow('Muscles supplied (' + nm + ')', [muscleChips(ms), ms.some(function (m) { return m.dual; }) ? h('p.an-note', { style: 'margin-top:6px' }, '* also supplied by another nerve') : null]));
          } else if (n.nerve && !n.motor) rows.push(kvRow('Motor supply', 'None (purely sensory).'));
          rows.push(kvRow('Sensory area', n.sensory));
          rows.push(kvRow('Injury mechanism', n.injury));
          if (nv && nv.note) rows.push(kvRow('Course', nv.note));
          if (nv && nv.variant && nv.variant.length) rows.push(kvRow('Textbook variation', 'Some texts also include ' + H.rootsLabel(nv.variant) + ' in the root value of this nerve.'));
          var from = G.back[n.id].map(function (i) { return G.byId[i].name; }), to = G.fwd[n.id].map(function (i) { return G.byId[i].name; });
          if (from.length || to.length) rows.push(kvRow('Pathway', [from.length ? h('p', h('b', 'Receives from: '), from.join(', ')) : null, to.length ? h('p', h('b', 'Gives rise to: '), to.join(', ')) : null]));
          var inL = P.lesions.filter(function (l) { return l.sites.indexOf(n.id) >= 0 || l.affected.indexOf(n.id) >= 0 || l.partial.indexOf(n.id) >= 0; });
          if (inL.length) rows.push(kvRow('Seen in these lesions', h('div.an-chips', inL.map(function (l) { return h('button.an-chip', { type: 'button', onclick: function () { st.tab = 'lesion'; st.lesion = l.id; st.sel = null; setTab('lesion'); } }, l.short); }))));
          return h('div.card.an-panel.an-sel-card',
            h('button.btn.btn-sm.btn-ghost.an-back', { type: 'button', onclick: function () { scrollTo(dcard); if (diag && diag.nodeEls[n.id]) diag.nodeEls[n.id].focus({ preventScroll: true }); } }, '↑ Back to the diagram'),
            h('h3', n.name),
            h('div.an-badges', MT.ui.badge(TYPE_LABEL[n.type] || n.type, 'info'), MT.ui.badge(n.roots)),
            h('div.an-sign', h('b', 'Classic sign'), n.sign),
            rows);
        }
        function lesionCard(l) {
          var ms = l.muscles.map(function (id) { return H.muscleById(id); });
          var lvl = l.sites.map(function (id) { return G.byId[id].name + ' (' + G.byId[id].roots + ')'; }).join('; ');
          return h('div.card.an-panel',
            h('h3', l.name),
            h('div.an-badges', MT.ui.badge('Lesion', 'danger'), MT.ui.badge(l.sites.length + ' site' + (l.sites.length > 1 ? 's' : ''))),
            h('p', { style: 'margin-top:6px' }, h('b', 'Site: '), lvl),
            h('h4', 'Mechanism'), h('p', l.mechanism),
            h('h4', 'Paralysed or weak muscles (' + ms.length + ')'),
            ms.length ? muscleChips(ms) : h('p', 'None: a purely sensory syndrome.'),
            h('h4', 'Sensory loss'), h('p', l.sensory),
            h('div.an-sign', h('b', 'Classic sign'), l.sign),
            h('h4', 'Spared'), h('p', l.spared),
            h('p.an-note', { style: 'margin-top:10px' }, 'Highlighted: red = injury site, amber = structures downstream of it (dashed = partly), strong lines = the pathway feeding the lesion from the roots.'));
        }
        function renderPanel() {
          MT.clear(panel);
          if (st.tab === 'explore') {
            if (st.sel) panel.appendChild(nodeCard(G.byId[st.sel]));
            else panel.appendChild(h('div.card.an-panel', h('h3', 'Select a structure'), h('p.muted', 'Tap or click any box in the diagram (or use Tab and the arrow keys, then Enter) to see its root values, motor supply, sensory area, injury mechanism and classic sign. The pathway feeding it from the roots and the branches it gives off light up.'), h('p.an-note', { style: 'margin-top:8px' }, P.mnemonic)));
          } else if (st.tab === 'lesion') {
            var l = lesionObj();
            if (l) panel.appendChild(lesionCard(l));
            else panel.appendChild(h('div.card.an-panel', h('h3', 'Lesion simulator'), h('p.muted', 'Choose a lesion above. The diagram marks the injury site and every structure downstream, and this panel lists the paralysed muscles, the area of sensory loss and the classic clinical sign.'),
              h('div.an-chips', { style: 'margin-top:10px' }, P.lesions.map(function (x) { return h('button.an-chip', { type: 'button', onclick: function () { st.lesion = x.id; renderControls(); renderPanel(); applyState(); } }, x.short); }))));
            if (st.sel && G.byId[st.sel]) panel.appendChild(nodeCard(G.byId[st.sel]));
          } else {
            panel.appendChild(quizPanel());
          }
        }

        /* ---- quiz ---- */
        function pool() {
          return P.nodes.filter(function (n) { return st.scope === 'all' || (st.scope === 'main' ? n.type !== 'collateral' : n.type === 'collateral' || n.type === 'terminal'); });
        }
        function startQuiz() {
          destroyMcq(st.lqNode); st.lqNode = null;
          if (st.quizKind === 'tap') {
            var pl = pool(), n = Q.pick(pl.filter(function (x) { return !st.tap || x.id !== st.tap.target; }));
            var ms = n.nerve ? D.muscles.filter(function (m) { return m.nerve === n.nerve && !m.dual; }) : [];
            var prompt;
            if (ms.length && Math.random() < 0.35) { var m = Q.pick(ms); prompt = 'Tap the nerve that supplies ' + m.name + '.'; }
            else if (n.type === 'collateral' || n.type === 'terminal') prompt = 'Tap the ' + n.name.charAt(0).toLowerCase() + n.name.slice(1) + '.';
            else prompt = 'Tap the ' + n.name.replace(/ \(.*\)$/, '') + (n.type === 'division' ? ' (' + n.roots + ')' : '') + '.';
            st.tap = { target: n.id, prompt: prompt, result: null, picked: null };
          } else {
            st.reveal = null;
            st.lqNode = mcq({ topic: P.id + '-lesion', make: function () { return Q.lesionQuestion(P); },
              extra: function (q, answered) {
                var boxc = h('div', { style: 'display:flex;flex-direction:column;gap:6px' });
                function paint() {
                  MT.clear(boxc);
                  q.clues.forEach(function (c, i) { if (i < st.lqClue) boxc.appendChild(h('div.an-clue', h('b', c.label), c.text)); });
                  if (st.lqClue < q.clues.length) boxc.appendChild(h('button.btn.btn-sm.btn-soft', { type: 'button', style: 'align-self:flex-start', onclick: function () { st.lqClue++; paint(); } }, 'Another clue'));
                }
                st.paintClues = paint; paint();
                return boxc;
              },
              onNew: function () { st.lqClue = 1; st.reveal = null; if (diag) applyState(); },
              onAnswer: function (q) { st.lqClue = q.clues.length; if (st.paintClues) st.paintClues(); st.reveal = q.lesionId; applyState(); }
            });
          }
        }
        function answerTap(id) {
          var t = st.tap;
          if (!t || t.result) return;
          var ok = id === t.target;
          t.result = ok ? 'ok' : 'bad'; t.picked = id;
          st.tapSession.n++; if (ok) { st.tapSession.ok++; st.tapSession.streak++; } else st.tapSession.streak = 0;
          bumpStat(P.id + '-tap', ok);
          renderPanel(); applyState();
        }
        function quizPanel() {
          if (st.quizKind === 'tap') {
            var t = st.tap;
            if (!t) startQuiz();
            t = st.tap;
            var n = G.byId[t.target];
            var card = h('div.card.an-panel', h('div.an-q-head', h('h3', 'Tap the structure'), h('span.an-score', { 'aria-live': 'polite' }, scoreText(st.tapSession, P.id + '-tap'))),
              h('p.an-q-prompt', { style: 'margin-top:6px' }, t.prompt),
              h('p.an-note', { style: 'margin-top:6px' }, 'Tap the box in the diagram, or Tab to it and press Enter.'));
            if (t.result) {
              card.appendChild(h('div.an-fb.' + t.result, { style: 'margin-top:10px' }, h('strong', t.result === 'ok' ? 'Correct. ' : 'Not quite. You tapped ' + G.byId[t.picked].name + '; the answer is ' + n.name + ' (green). '), n.name + ' (' + n.roots + '): ' + n.sign));
              card.appendChild(h('button.btn.btn-primary', { type: 'button', style: 'margin-top:10px', onclick: function () { startQuiz(); renderPanel(); applyState(); } }, 'Next question'));
            } else card.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', style: 'margin-top:10px', onclick: function () { startQuiz(); renderPanel(); applyState(); } }, 'Skip'));
            return card;
          }
          if (!st.lqNode) startQuiz();
          var c = h('div.card.an-panel', h('h3', 'Name the lesion'), h('p.an-note', 'Clues appear one at a time. After you answer, the lesion is shown on the diagram.'));
          c.appendChild(st.lqNode);
          return c;
        }

        /* ---- boot ---- */
        function init() {
          renderControls(); mountSvg(); renderPanel();
          if (typeof ResizeObserver !== 'undefined') {
            var timer = null;
            ro = new ResizeObserver(function () { clearTimeout(timer); timer = setTimeout(function () { if (!disposed) { var nm = sizeName(); if (nm !== st.layoutName) { diag = null; mountSvg(); } } }, 120); });
            ro.observe(dcard);
          }
        }
        // Defer to next frame so the card has a measurable width.
        var raf = self.requestAnimationFrame ? self.requestAnimationFrame(init) : setTimeout(init, 0);
        return function cleanup() { disposed = true; if (ro) ro.disconnect(); destroyMcq(st.lqNode); if (self.cancelAnimationFrame && typeof raf === 'number') self.cancelAnimationFrame(raf); };
      }
    });
  }

  /* =====================================================================
     REGISTRATION
     ===================================================================== */
  plexusTool(D.brachial, {
    id: 'brachial-plexus', title: 'Brachial plexus', icon: '🕸️', order: 1,
    description: 'Interactive roots-to-branches schematic of the brachial plexus with a lesion simulator (Erb, Klumpke, radial, median, ulnar) and quizzes.',
    keywords: ['brachial plexus', 'erb', 'klumpke', 'radial nerve', 'ulnar nerve', 'median nerve', 'axillary nerve', 'musculocutaneous', 'winged scapula', 'wrist drop', 'claw hand', 'upper limb nerves'],
    lead: 'Roots C5–T1 to trunks, divisions, cords and branches. Select any structure for its supply and injury pattern, simulate a lesion, or test yourself.'
  });
  plexusTool(D.lumbosacral, {
    id: 'lumbosacral-plexus', title: 'Lumbosacral plexus', icon: '🦵', order: 2,
    description: 'Interactive lumbar and sacral plexus schematic with lesion simulator (foot drop, Trendelenburg, meralgia paraesthetica, obturator, femoral, sciatic) and quizzes.',
    keywords: ['lumbar plexus', 'sacral plexus', 'sciatic', 'femoral nerve', 'obturator', 'foot drop', 'trendelenburg', 'meralgia paraesthetica', 'common fibular', 'peroneal', 'pudendal', 'lower limb nerves'],
    lead: 'Lumbar (L1–L4) and sacral (L4–S4) plexuses with their branches. Select a nerve for its supply and injuries, simulate a lesion, or take the quiz.'
  });
})();

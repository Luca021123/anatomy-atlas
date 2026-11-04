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
    '.an-sw{--nc:var(--border-strong);width:14px;height:14px;border-radius:4px;border:2px solid var(--nc);display:inline-block;flex:none}',
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
    '.an-nv{cursor:pointer;outline:none}',
    '.an-nv.is-sel .an-nerve-line,.an-nv.is-sel~* .an-x{stroke:var(--accent)}',
    '.an-nv.is-sel .an-nerve-line{stroke:var(--accent);stroke-width:5}',
    '.an-nv.is-sel .an-dot{fill:var(--accent);stroke:var(--accent)}',
    '.an-nv.is-sel rect.an-pb{fill:var(--accent-soft);stroke:var(--accent);stroke-width:2.4}',
    '.an-nv.is-ok .an-nerve-line{stroke:var(--ok);stroke-width:5}.an-nv.is-ok rect.an-pb{fill:var(--ok-soft);stroke:var(--ok);stroke-width:2.6}.an-nv.is-ok .an-dot{fill:var(--ok)}',
    '.an-nv.is-bad .an-nerve-line{stroke:var(--danger);stroke-width:5}.an-nv.is-bad rect.an-pb{fill:var(--danger-soft);stroke:var(--danger);stroke-width:2.6}.an-nv.is-bad .an-dot{fill:var(--danger)}',
    '.an-nv:hover rect.an-pb{stroke:var(--accent)}',
    '.an-nv:focus-visible .an-halo{opacity:1;stroke-dasharray:5 3}',
    '.an-nv.is-sel .an-halo{opacity:1}',
    '.an-nv .an-num{font-weight:800;fill:var(--accent-text)}',
    '.an-nv text{text-anchor:start}',
    '.an-nv.an-nv-l text{text-anchor:middle}',
    '.an-brain:has(.is-sel) .an-nvw:not(:has(.is-sel)){opacity:.55}',
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
          var lvl = l.sites.map(function (id) { return G.byId[id].name + ' \u2013 roots ' + G.byId[id].roots; }).join('; ');
          return h('div.card.an-panel',
            h('h3', l.name),
            h('div.an-badges', MT.ui.badge('Lesion', 'danger'), MT.ui.badge(l.sites.length + ' site' + (l.sites.length > 1 ? 's' : ''))),
            h('p', { style: 'margin-top:6px' }, h('b', 'Site: '), lvl),
            h('h4', 'Mechanism'), h('p', l.mechanism),
            h('h4', 'Paralysed or weak muscles (' + ms.length + ')'),
            ms.length ? [muscleChips(ms), ms.some(function (m) { return m.dual; }) ? h('p.an-note', { style: 'margin-top:6px' }, '* also supplied by another nerve, so only partly weakened') : null] : h('p', 'None: a purely sensory syndrome.'),
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
     CRANIAL NERVES
     ===================================================================== */
  var CG = { // geometry of the ventral brainstem schematic: exit point (ex,ey) and label row (ly)
    'cn-i': { ex: [244, 42], ly: 28, sub: 'forebrain: olfactory bulb' },
    'cn-ii': { ex: [177, 86], ly: 68, sub: 'diencephalon: optic chiasm' },
    'cn-iii': { ex: [153, 190], ly: 150, sub: 'interpeduncular fossa' },
    'cn-iv': { ex: [206, 214], ly: 202, dash: true, sub: 'exits dorsally, wraps round' },
    'cn-v': { ex: [231, 282], ly: 254, thick: true, sub: 'lateral pons' },
    'cn-viii': { ex: [209, 326], ly: 296, sub: 'cerebellopontine angle' },
    'cn-vii': { ex: [193, 334], ly: 340, sub: 'medial to VIII' },
    'cn-vi': { ex: [157, 338], ly: 384, sub: 'pontomedullary junction' },
    'cn-ix': { ex: [191, 366], ly: 428, sub: 'post-olivary sulcus' },
    'cn-x': { ex: [192, 383], ly: 472, sub: 'post-olivary sulcus' },
    'spinal-accessory': { ex: [191, 400], ly: 516, sub: 'also spinal roots C1–C5' },
    'cn-xii': { ex: [167, 410], ly: 560, sub: 'pre-olivary sulcus' }
  };
  var MOD_LETTER = { 'Sensory': 'S', 'Motor': 'M', 'Both (mixed)': 'B' };

  function buildBrainstem(handlers) {
    var svg = s('svg', { viewBox: '0 0 432 590', class: 'an-svg an-brain', role: 'group', 'aria-label': 'Ventral view of the brainstem showing where each cranial nerve emerges. Use Tab to move between nerves and Enter to select.' });
    var st = { fill: 'var(--surface-3)', stroke: 'var(--border-strong)', 'stroke-width': 1.6 };
    function shape(d, extra) { return s('path', Object.assign({ d: d, fill: st.fill, stroke: st.stroke, 'stroke-width': st['stroke-width'], 'stroke-linejoin': 'round' }, extra || {})); }
    function line(d, w, extra) { return s('path', Object.assign({ d: d, fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': w, 'stroke-linecap': 'round' }, extra || {})); }
    var gS = s('g', { 'aria-hidden': 'true' });
    // optic apparatus and olfactory bulbs
    [0, 1].forEach(function (side) {
      var m = function (x) { return side ? 300 - x : x; };
      gS.appendChild(line('M ' + m(142) + ' 80 L ' + m(118) + ' 44', 9));
      gS.appendChild(line('M ' + m(136) + ' 94 C ' + m(112) + ' 110, ' + m(92) + ' 140, ' + m(90) + ' 186', 8));
      gS.appendChild(s('ellipse', { cx: m(244) - (side ? 0 : 0), cy: 42, rx: 13, ry: 8, fill: st.fill, stroke: st.stroke, 'stroke-width': 1.6 }));
      gS.appendChild(line('M ' + m(238) + ' 48 C ' + m(226) + ' 60, ' + m(210) + ' 70, ' + m(186) + ' 72', 2.4));
    });
    gS.appendChild(shape('M 136 78 L 164 78 L 172 94 L 128 94 Z'));
    // midbrain (crura), pons, medulla, cord
    gS.appendChild(shape('M 140 128 C 120 112, 100 122, 96 150 C 92 185, 98 215, 106 238 L 148 238 C 146 200, 142 160, 140 128 Z'));
    gS.appendChild(shape('M 160 128 C 180 112, 200 122, 204 150 C 208 185, 202 215, 194 238 L 152 238 C 154 200, 158 160, 160 128 Z'));
    gS.appendChild(s('rect', { x: 124, y: 440, width: 52, height: 140, rx: 6, fill: st.fill, stroke: st.stroke, 'stroke-width': 1.6 }));
    gS.appendChild(shape('M 106 238 C 70 244, 60 280, 70 312 C 76 326, 90 332, 106 334 L 194 334 C 210 332, 224 326, 230 312 C 240 280, 230 244, 194 238 Z'));
    gS.appendChild(line('M 150 242 L 150 332', 1.4, { opacity: 0.7 }));
    [262, 282, 302].forEach(function (y) { gS.appendChild(line('M 84 ' + y + ' C 120 ' + (y - 8) + ', 180 ' + (y - 8) + ', 216 ' + y, 1, { opacity: 0.45 })); });
    gS.appendChild(shape('M 106 334 L 194 334 C 196 360, 192 400, 184 446 L 116 446 C 108 400, 104 360, 106 334 Z'));
    [120, 180].forEach(function (cx) { gS.appendChild(s('ellipse', { cx: cx + (cx === 180 ? 2 : -2), cy: 378, rx: 11, ry: 25, fill: 'var(--surface-2)', stroke: st.stroke, 'stroke-width': 1.3 })); });
    gS.appendChild(line('M 150 338 L 150 446', 1.4, { opacity: 0.7 }));
    gS.appendChild(line('M 138 340 L 138 430 M 162 340 L 162 430', 1.1, { opacity: 0.5 }));
    gS.appendChild(line('M 138 432 L 162 446 M 162 432 L 138 446', 1.4, { opacity: 0.6 }));
    [['MIDBRAIN', 150, 218], ['PONS', 150, 296], ['MEDULLA', 150, 418], ['SPINAL CORD', 150, 520]].forEach(function (t) {
      gS.appendChild(s('text', { x: t[1], y: t[2], 'font-size': 9, 'letter-spacing': 1, class: 'an-struct-name', style: 'fill:var(--muted);paint-order:stroke;stroke:var(--surface-3);stroke-width:4px' }, t[0]));
    });
    svg.appendChild(gS);
    // nerves
    var els = {};
    D.cranial.forEach(function (c) {
      var g = CG[c.id], ex = g.ex[0], ey = g.ex[1], ly = g.ly;
      var grp = s('g', { class: 'an-nv', tabindex: '0', role: 'button', 'data-id': c.id, 'aria-label': 'CN ' + c.numeral + ' ' + c.name + ', ' + c.modality.toLowerCase() + ', ' + D.brainstemExits[c.id] });
      var left = s('g', { class: 'an-nv an-nv-l', 'data-id': c.id, 'aria-hidden': 'true' });
      var lx = 300 - ex;
      // right-hand side: nerve line and label pill
      var cls = 'an-nerve-line' + (g.thick || c.id === 'cn-ii' ? ' thick' : '') + (g.dash ? ' dash' : '');
      if (c.id === 'spinal-accessory') grp.appendChild(s('path', { class: 'an-nerve-line dash', d: 'M 176 580 L 178 540 C 182 480, 190 430, 191 404', style: 'stroke-width:2.4' }));
      grp.appendChild(s('path', { class: cls, d: 'M ' + ex + ' ' + ey + ' C ' + (ex + 60) + ' ' + ey + ', 210 ' + ly + ', 268 ' + ly }));
      grp.appendChild(s('circle', { class: 'an-dot', cx: ex, cy: ey, r: 5.5 }));
      grp.appendChild(s('rect', { class: 'an-halo', x: 264, y: ly - 17, width: 160, height: 34, rx: 9 }));
      grp.appendChild(s('rect', { class: 'an-pb', x: 268, y: ly - 13, width: 154, height: 26, rx: 7, fill: 'var(--surface)' }));
      var tx = s('text', { x: 276, y: ly + 4.5, 'font-size': 11.5 });
      tx.appendChild(s('tspan', { class: 'an-num' }, c.numeral + ' '));
      tx.appendChild(s('tspan', {}, c.name));
      grp.appendChild(tx);
      grp.appendChild(s('circle', { cx: 411, cy: ly, r: 7.5, fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1 }));
      grp.appendChild(s('text', { x: 411, y: ly + 3.4, 'font-size': 9.5, 'font-weight': 700, style: 'text-anchor:middle' }, MOD_LETTER[c.modality]));
      grp.appendChild(s('text', { x: 276, y: ly + 24, 'font-size': 9.5, style: 'fill:var(--muted);text-anchor:start' }, g.sub));
      // left-hand mirror
      left.appendChild(s('path', { class: cls, d: 'M ' + lx + ' ' + ey + ' C ' + (lx - 50) + ' ' + ey + ', 82 ' + ly + ', 34 ' + ly }));
      left.appendChild(s('circle', { class: 'an-dot', cx: lx, cy: ey, r: 5.5 }));
      left.appendChild(s('circle', { class: 'an-lbadge', cx: 22, cy: ly, r: 13, fill: 'var(--surface)', stroke: 'var(--border-strong)', 'stroke-width': 1.4 }));
      left.appendChild(s('text', { x: 22, y: ly + 3.8, 'font-size': c.numeral.length > 3 ? 8.5 : 10, 'font-weight': 800, style: 'fill:var(--accent-text)' }, c.numeral));
      var wrap = s('g', { class: 'an-nvw' });
      wrap.appendChild(left); wrap.appendChild(grp);
      [grp, left].forEach(function (el) {
        el.addEventListener('click', function () { handlers.activate(c.id); });
      });
      grp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.activate(c.id); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); handlers.step(c.id, 1); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); handlers.step(c.id, -1); }
      });
      svg.appendChild(wrap);
      els[c.id] = [grp, left, wrap];
    });
    return { svg: svg, els: els };
  }

  function nerveCard(c) {
    var spoken = 'Cranial nerve ' + c.numeral + ', ' + c.name + '. ' + c.modality + '. Functions: ' + c.functions.join('. ') + '. Bedside test: ' + c.test + ' Lesion: ' + c.lesion;
    var rows = [
      ['Modality and fibre types', c.modality + '. ' + c.components],
      ['Nuclei and central connections', c.nuclei],
      ['Brainstem exit / entry', c.exit],
      ['Skull opening', c.foramen],
      ['Branches and course', c.branches],
      ['Functions', h('ul', c.functions.map(function (f) { return h('li', f); }))],
      ['Bedside test', c.test],
      ['Lesion signs', c.lesion],
      ['Common causes', c.causes]
    ];
    var motorList = D.muscles.filter(function (m) { return m.nerve === c.id || (c.id === 'cn-v' && m.nerve === 'cn-v3') || (c.id === 'cn-x' && (m.nerve === 'external-laryngeal' || m.nerve === 'recurrent-laryngeal')); });
    var card = h('div.card.an-panel.an-ncard.an-sel-card',
      h('button.btn.btn-sm.btn-ghost.an-back', { type: 'button', onclick: function () { var d = MT.$('.an-brainbox'); if (d) scrollTo(d); } }, '↑ Back to the diagram'),
      h('h3', 'CN ' + c.numeral + ' – ' + c.name),
      h('div.an-badges', MT.ui.badge(c.modality, c.modality === 'Motor' ? 'ok' : (c.modality === 'Sensory' ? 'info' : 'warn')), MT.ui.badge(c.foramen.split(' (')[0].split(',')[0])),
      h('dl', rows.map(function (r) { return [h('dt', r[0]), h('dd', r[1])]; })),
      motorList.length ? [h('h4', 'Muscles in this atlas'), h('div.an-chips', motorList.map(function (m) { return chipLink(m.name, '#/muscles/' + m.id); }))] : null,
      h('div.an-sign', h('b', 'Pearl'), c.pearls),
      MT.speech && MT.speech.supported ? h('div', { style: 'margin-top:10px' }, MT.speech.button(function () { return spoken; })) : null);
    return card;
  }

  MT.registerTool({
    id: 'cranial-nerves', title: 'Cranial nerves', category: 'anatomy', icon: '🧠', order: 3,
    description: 'All 12 cranial nerves: modality, nuclei, brainstem exit, skull foramen, branches, functions, bedside tests, lesion signs and causes, on a ventral brainstem schematic, with quizzes.',
    keywords: ['cranial nerves', 'brainstem', 'oculomotor', 'trochlear', 'trigeminal', 'abducens', 'facial', 'vestibulocochlear', 'glossopharyngeal', 'vagus', 'accessory', 'hypoglossal', 'olfactory', 'optic', 'bell palsy', 'diplopia'],
    render: function (container, ctx) {
      var st = { tab: 'explore', sel: null, kind: 'mcq', tap: null, tapSession: { n: 0, ok: 0, streak: 0 }, mcqNode: null };
      var byId = {}; D.cranial.forEach(function (c) { byId[c.id] = c; });
      if (ctx.params && byId[ctx.params[0]]) st.sel = ctx.params[0];
      var ids = D.cranial.map(function (c) { return c.id; });
      var diag = null, pills = h('div.an-cranial-pills', { role: 'group', 'aria-label': 'Choose a cranial nerve' });
      var box = h('div.an-svgbox.an-brainbox'), ctrl = h('div.an-ctrl'), panel = h('div.an-right', { 'aria-live': 'polite' });
      var tabs = tabsBar([{ id: 'explore', label: 'Explore' }, { id: 'table', label: 'Summary table' }, { id: 'quiz', label: 'Quiz' }], 'explore', function (id) { setTab(id); });
      var body = h('div');
      var legendEl = h('div.an-legend', h('span', h('b', 'S'), ' sensory'), h('span', h('b', 'M'), ' motor'), h('span', h('b', 'B'), ' both'), h('span', 'Right side labelled; the left side is a mirror image.'));
      var diagCard = h('div.card.an-dcard', ctrl, pills, box, legendEl);
      var root = h('div.an-wrap', tabs, body, refLine(['Moore KL et al. Clinically Oriented Anatomy, 8th–9th ed. (Head and neck; Neuroanatomy)', 'Blumenfeld H. Neuroanatomy through Clinical Cases, 2nd ed.', 'Bickley LS. Bates’ Guide to Physical Examination and History Taking (cranial nerve examination)'].concat(D.cranialNerveMnemonics.map(function (m) { return m.title + ': ' + m.text; }))));
      container.appendChild(root);

      function activate(id) {
        if (st.tab === 'quiz') { if (st.kind === 'tap') answerTap(id); return; }
        st.sel = id; paint();
        var p = MT.$('.an-sel-card', panel);
        if (p && panel.getBoundingClientRect().top > (self.innerHeight || 800) * 0.55) scrollTo(p);
      }
      function step(id, d) { var i = ids.indexOf(id) + d; if (i >= 0 && i < ids.length && diag) diag.els[ids[i]][0].focus(); }
      function paint() {
        MT.$$('.an-pill-b', pills).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === st.sel && st.tab !== 'quiz')); });
        if (!diag) return;
        diag.svg.classList.toggle('has-nsel', !!st.sel && st.tab !== 'quiz');
        ids.forEach(function (id) {
          var on = id === st.sel && st.tab !== 'quiz';
          diag.els[id].forEach(function (el, i) { if (i < 2) { el.classList.toggle('is-sel', on); el.classList.remove('is-ok', 'is-bad'); } });
          diag.els[id][2].classList.toggle('an-hl', on);
        });
        if (st.tab === 'quiz' && st.kind === 'tap' && st.tap && st.tap.result) {
          diag.els[st.tap.target].forEach(function (el, i) { if (i < 2) el.classList.add('is-ok'); });
          if (st.tap.picked !== st.tap.target) diag.els[st.tap.picked].forEach(function (el, i) { if (i < 2) el.classList.add('is-bad'); });
        }
        if (st.tab === 'explore') {
          MT.clear(panel);
          panel.appendChild(st.sel ? nerveCard(byId[st.sel]) : h('div.card.an-panel', h('h3', 'Select a cranial nerve'),
            h('p.muted', 'Tap a nerve on the brainstem (or use the numbered buttons) to see its nuclei, exit level, skull opening, branches, functions, bedside test, lesion signs and common causes.'),
            h('div', { style: 'margin-top:10px' }, D.cranialNerveMnemonics.map(function (m) { return h('p.an-note', { style: 'margin-top:6px' }, h('b', m.title + ': '), m.text); }))));
        }
      }
      function buildPills() {
        MT.clear(pills);
        D.cranial.forEach(function (c) {
          pills.appendChild(h('button.an-chip.an-pill-b', { type: 'button', 'data-id': c.id, 'aria-pressed': 'false', title: c.name, 'aria-label': 'CN ' + c.numeral + ' ' + c.name, onclick: function () { activate(c.id); } }, c.numeral));
        });
      }
      function setTab(id) {
        st.tab = id; st.sel = id === 'explore' ? st.sel : null;
        destroyMcq(st.mcqNode); st.mcqNode = null;
        var names = { explore: 'Explore', table: 'Summary table', quiz: 'Quiz' };
        MT.$$('[role=tab]', tabs).forEach(function (b) { b.setAttribute('aria-selected', String(b.textContent === names[id])); });
        draw();
      }
      function tableView() {
        var rows = D.cranial.map(function (c) {
          return h('tr', h('th', { scope: 'row' }, c.numeral), h('td', h('a', { href: '#/cranial-nerves/' + c.id }, c.name)), h('td', c.modality), h('td', D.brainstemExits[c.id]), h('td', c.foramen.split(' (')[0]), h('td', c.functions[0]));
        });
        return h('div.stack',
          h('div.table-wrap', h('table.table.an-tbl', h('caption.sr-only', 'Cranial nerves summary'), h('thead', h('tr', ['CN', 'Name', 'Type', 'Brainstem exit', 'Skull opening', 'Main function'].map(function (t) { return h('th', { scope: 'col' }, t); }))), h('tbody', rows))),
          h('div.grid', { style: '--min:240px' }, D.cranialNerveMnemonics.map(function (m) { return h('div.card-soft.an-panel', h('h4', { style: 'margin-top:0' }, m.title), h('p', m.text)); })));
      }
      function startTap() {
        var bank = D.quiz.cranialBank, t, uniqueExit = ['cn-i', 'cn-ii', 'cn-iii', 'cn-iv', 'cn-v', 'cn-vi', 'cn-xii'];
        if (Math.random() < 0.3) { var id = Q.pick(uniqueExit); t = { target: id, prompt: 'Tap the nerve that attaches to the brain at: ' + D.brainstemExits[id].toLowerCase() + '.', why: 'CN ' + byId[id].numeral + ' ' + byId[id].name + ': ' + byId[id].exit }; }
        else { var b = Q.pick(bank); t = { target: b.a, prompt: b.q, why: b.why }; }
        t.result = null; t.picked = null; st.tap = t;
      }
      function answerTap(id) {
        var t = st.tap; if (!t || t.result) return;
        var ok = id === t.target; t.result = ok ? 'ok' : 'bad'; t.picked = id;
        st.tapSession.n++; if (ok) { st.tapSession.ok++; st.tapSession.streak++; } else st.tapSession.streak = 0;
        bumpStat('cranial-tap', ok);
        drawQuizPanel(); paint();
      }
      function drawQuizPanel() {
        MT.clear(panel);
        if (st.kind === 'tap') {
          if (!st.tap) startTap();
          var t = st.tap;
          var card = h('div.card.an-panel', h('div.an-q-head', h('h3', 'Tap the nerve'), h('span.an-score', scoreText(st.tapSession, 'cranial-tap'))), h('p.an-q-prompt', { style: 'margin-top:6px' }, t.prompt), h('p.an-note', { style: 'margin-top:6px' }, 'Tap the nerve on the brainstem, or use the numbered buttons above the diagram.'));
          if (t.result) {
            var tg = byId[t.target];
            card.appendChild(h('div.an-fb.' + t.result, { style: 'margin-top:10px' }, h('strong', t.result === 'ok' ? 'Correct. ' : 'Not quite: you chose CN ' + byId[t.picked].numeral + '; the answer is CN ' + tg.numeral + ' ' + tg.name + '. '), t.why));
            card.appendChild(h('button.btn.btn-primary', { type: 'button', style: 'margin-top:10px', onclick: function () { startTap(); drawQuizPanel(); paint(); } }, 'Next question'));
          } else card.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', style: 'margin-top:10px', onclick: function () { startTap(); drawQuizPanel(); paint(); } }, 'Skip'));
          panel.appendChild(card);
        }
      }
      function draw() {
        MT.clear(body); MT.clear(ctrl);
        if (st.tab === 'table') { body.appendChild(tableView()); return; }
        if (st.tab === 'quiz') ctrl.appendChild(MT.ui.segmented([{ value: 'mcq', label: 'Multiple choice' }, { value: 'tap', label: 'Tap the brainstem' }], st.kind, function (v) { st.kind = v; destroyMcq(st.mcqNode); st.mcqNode = null; draw(); }));
        if (st.tab === 'quiz' && st.kind === 'mcq') {
          st.mcqNode = mcq({ topic: 'cranial-mcq', make: function () { return Q.cranialQuestion(); } });
          body.appendChild(h('div.an-grid', h('div.an-left', h('div.card.an-panel', h('h3', 'Cranial nerve quiz'), st.mcqNode)), h('div.an-right', h('div.card.an-panel', h('h3', 'Remember'), D.cranialNerveMnemonics.map(function (m) { return h('p', { style: 'margin-top:8px' }, h('b', m.title + ': '), m.text); })))));
          return;
        }
        body.appendChild(h('div.an-grid', h('div.an-left', diagCard), panel));
        diag = buildBrainstem({ activate: activate, step: step });
        MT.clear(box); box.appendChild(diag.svg);
        box.style.maxWidth = '520px';
        buildPills();
        if (st.tab === 'quiz') drawQuizPanel();
        paint();
      }
      draw();
      return function () { destroyMcq(st.mcqNode); };
    }
  });

  /* =====================================================================
     DERMATOMES, MYOTOMES, REFLEXES
     ===================================================================== */
  var MARKERS = {
    front: { C3: [122, 78], C4: [94, 92], C5: [44, 192], C6: [14, 328], C7: [38, 360], C8: [64, 338], T1: [76, 196], T2: [84, 126], T3: [118, 108], T4: [114, 134], T6: [114, 156], T8: [114, 178], T10: [140, 202], T12: [118, 238], L1: [150, 262], L2: [116, 300], L3: [128, 352], L4: [132, 440], L5: [110, 468], S1: [80, 494] },
    back: { C2: [140, 30], C4: [94, 92], S1: [80, 494], S2: [118, 358], S3: [118, 268], 'S4-5': [140, 282] }
  };
  var MARK_DESC = { C2: 'occipital protuberance', C3: 'supraclavicular fossa', C4: 'top of the acromioclavicular joint', C5: 'lateral antecubital fossa', C6: 'thumb', C7: 'middle finger', C8: 'little finger', T1: 'medial antecubital fossa', T2: 'apex of the axilla', T3: 'third intercostal space', T4: 'nipple line', T6: 'xiphoid level', T8: 'eighth intercostal space', T10: 'umbilicus', T12: 'inguinal ligament midpoint', L1: 'inguinal region', L2: 'mid-anterior thigh', L3: 'medial femoral condyle', L4: 'medial malleolus', L5: 'dorsum of the foot', S1: 'lateral heel', S2: 'popliteal fossa', S3: 'ischial tuberosity', 'S4-5': 'perianal area' };

  function bodySvg(view, handlers) {
    var svg = s('svg', { viewBox: '0 0 280 520', class: 'an-svg an-body-svg', role: 'group', 'aria-label': (view === 'front' ? 'Anterior' : 'Posterior') + ' body figure with dermatome key points. Tab between markers and press Enter to select.' });
    function limb(d, w) {
      svg.appendChild(s('path', { d: d, fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': w + 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }));
      svg.appendChild(s('path', { d: d, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }));
    }
    function mir(d) { return d.replace(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g, function (m, x, y) { return (280 - Number(x)) + ' ' + y; }); }
    var parts = [['M 92 92 L 62 190 L 46 280', 26], ['M 120 254 L 116 360', 38], ['M 116 360 L 114 452', 28]];
    parts.forEach(function (p) { limb(p[0], p[1]); limb(mir(p[0]), p[1]); });
    // torso, neck, head
    var torso = 'M 92 88 Q 140 76 188 88 L 184 150 Q 176 190 172 215 L 184 256 L 96 256 L 108 215 Q 104 190 96 150 Z';
    svg.appendChild(s('path', { d: torso, class: 'an-fig', 'aria-hidden': 'true' }));
    svg.appendChild(s('rect', { x: 129, y: 62, width: 22, height: 24, class: 'an-fig', 'aria-hidden': 'true' }));
    svg.appendChild(s('ellipse', { cx: 140, cy: 38, rx: 23, ry: 28, class: 'an-fig', 'aria-hidden': 'true' }));
    // hands (palms forward in the front view) and feet
    [0, 1].forEach(function (side) {
      var m = function (x) { return side ? 280 - x : x; };
      svg.appendChild(s('ellipse', { cx: m(42), cy: 302, rx: 14, ry: 18, class: 'an-fig', 'aria-hidden': 'true' }));
      [['M 30 298 L 16 322', 8], ['M 36 316 L 33 344', 7], ['M 42 318 L 41 352', 7], ['M 48 316 L 50 344', 7], ['M 54 310 L 62 334', 6]].forEach(function (f) {
        svg.appendChild(s('path', { d: f[0].replace(/(\d+)\s+(\d+)/g, function (q, x, y) { return m(Number(x)) + ' ' + y; }), fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': f[1] + 2.5, 'stroke-linecap': 'round', 'aria-hidden': 'true' }));
        svg.appendChild(s('path', { d: f[0].replace(/(\d+)\s+(\d+)/g, function (q, x, y) { return m(Number(x)) + ' ' + y; }), fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': f[1], 'stroke-linecap': 'round', 'aria-hidden': 'true' }));
      });
      svg.appendChild(s('path', { d: 'M ' + m(114) + ' 452 L ' + m(108) + ' 486 L ' + m(88) + ' 490', class: 'an-fig', fill: 'none', 'stroke-width': 14, 'stroke-linecap': 'round', 'aria-hidden': 'true', style: 'stroke:var(--border-strong)' }));
      svg.appendChild(s('path', { d: 'M ' + m(114) + ' 452 L ' + m(108) + ' 486 L ' + m(88) + ' 490', fill: 'none', 'stroke-width': 11, 'stroke-linecap': 'round', 'aria-hidden': 'true', style: 'stroke:var(--surface-2)' }));
    });
    if (view === 'front') {
      svg.appendChild(s('circle', { cx: 140, cy: 202, r: 2.5, fill: 'var(--border-strong)', 'aria-hidden': 'true' }));
      [114, 166].forEach(function (x) { svg.appendChild(s('circle', { cx: x, cy: 134, r: 3, fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 1.5, 'aria-hidden': 'true' })); });
    } else svg.appendChild(s('path', { d: 'M 140 92 L 140 250', stroke: 'var(--border-strong)', 'stroke-dasharray': '3 4', fill: 'none', 'aria-hidden': 'true' }));
    svg.appendChild(s('text', { x: 140, y: 514, 'font-size': 11, style: 'fill:var(--muted)' }, view === 'front' ? 'ANTERIOR (patient’s right on the left)' : 'POSTERIOR (patient’s right on the right)'));
    var els = {};
    var set = MARKERS[view];
    Object.keys(set).forEach(function (lv) {
      var p = set[lv], d = D.dermatomes.filter(function (x) { return x.level === lv; })[0];
      var g = s('g', { class: 'an-mkr', tabindex: '0', role: 'button', 'data-level': lv, 'aria-label': 'Level ' + lv.replace('-', '–') + ': ' + d.point });
      g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 16, fill: 'transparent', stroke: 'none', style: 'fill:transparent;stroke:none' }));
      g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 11.5 }));
      g.appendChild(s('text', { x: p[0], y: p[1] + 3.8, 'font-size': lv.length > 3 ? 8 : 10.5, style: 'text-anchor:middle' }, lv.replace('-', '–')));
      g.addEventListener('click', function () { handlers.pick(lv); });
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.pick(lv); } });
      svg.appendChild(g); els[lv] = g;
    });
    return { svg: svg, els: els };
  }

  MT.registerTool({
    id: 'dermatomes', title: 'Dermatomes & myotomes', category: 'anatomy', icon: '🧍', order: 4,
    description: 'Dermatome key points on an anterior and posterior body figure, myotomes, reflex roots and a "which root?" quiz.',
    keywords: ['dermatome', 'myotome', 'reflex', 'nerve root', 'radiculopathy', 'ISNCSCI', 'ASIA', 'spinal cord injury', 'C6 thumb', 'T10 umbilicus', 'L5', 'S1', 'biceps reflex', 'ankle jerk'],
    render: function (container, ctx) {
      var st = { tab: 'map', level: 'C6', mcqNode: null };
      if (ctx.params && ctx.params[0] && D.dermatomes.some(function (d) { return d.level === ctx.params[0]; })) st.level = ctx.params[0];
      var views = { front: bodySvg('front', { pick: pick }), back: bodySvg('back', { pick: pick }) };
      var figs = h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center' },
        [views.front, views.back].map(function (v) { return h('div', { style: 'flex:1 1 240px;max-width:330px;min-width:0' }, v.svg); }));
      var ctrl = h('div.an-ctrl');
      var panel = h('div.an-right', { 'aria-live': 'polite' }), body = h('div');
      var tabs = tabsBar([{ id: 'map', label: 'Body map' }, { id: 'tables', label: 'Myotomes & reflexes' }, { id: 'quiz', label: 'Quiz: which root?' }], 'map', function (id) { setTab(id); });
      var root = h('div.an-wrap', tabs, body, refLine(D.sources.slice(0, 1).concat(D.sources.slice(3, 4), D.sources.slice(5), ['Key sensory points follow the ISNCSCI examination. Dermatome maps vary between individuals and between texts (Lee et al. 2008 compared the classic maps); overlap means a single root lesion rarely produces complete anaesthesia.'])));
      container.appendChild(root);
      function levelsList() { return D.dermatomes.map(function (d) { return d.level; }); }
      function dispLevel(l) { return l.replace('-', '–'); }
      function pick(lv) { st.level = lv; paintMap(); var p = MT.$('.an-sel-card', panel); if (p && panel.getBoundingClientRect().top > (self.innerHeight || 800) * 0.55) scrollTo(p); }
      function relatedMyotome(lv) {
        return D.myotomes.filter(function (m) { return m.level === lv || (m.level.indexOf('-') > 0 && m.level.split('-').indexOf(lv.replace(/-.*/, '')) >= 0) || (lv === 'S4-5' && m.level === 'S3-S4'); });
      }
      function card(lv) {
        var d = D.dermatomes.filter(function (x) { return x.level === lv; })[0];
        var my = relatedMyotome(lv), rf = D.reflexes.filter(function (r) { return H.expandRoots(r.roots).indexOf(lv) >= 0; });
        var i = levelsList().indexOf(lv);
        return h('div.card.an-panel.an-sel-card', h('h3', 'Level ' + dispLevel(lv)), h('div.an-badges', MT.ui.badge(lv.charAt(0) === 'C' ? 'Cervical' : lv.charAt(0) === 'T' ? 'Thoracic' : lv.charAt(0) === 'L' ? 'Lumbar' : 'Sacral', 'info'), MT.ui.badge(d.view === 'both' ? 'Front and back' : (d.view === 'front' ? 'Front' : 'Back'))),
          h('div.an-sign', h('b', 'Key sensory point (ISNCSCI)'), d.point),
          h('h4', 'Skin area'), h('p', d.area),
          h('h4', 'Myotome (movement)'), my.length ? my.map(function (m) { return h('div', { style: 'margin-bottom:6px' }, h('p', m.movement + (m.key ? ' – ISNCSCI key muscle: ' + m.keyMuscle : '')), m.muscles.length ? h('div.an-chips', m.muscles.map(function (id) { return chipLink(H.muscleById(id).name, '#/muscles/' + id); })) : null, h('p.an-note', m.note)); }) : h('p.muted', 'No standard myotome test at this level.'),
          h('h4', 'Reflex'), rf.length ? rf.map(function (r) { return h('p', h('b', r.name + ' (' + H.rootsLabel(H.expandRoots(r.roots)) + '). '), r.test); }) : h('p.muted', 'No standard tendon reflex.'),
          h('div', { style: 'display:flex;gap:8px;margin-top:12px' }, h('button.btn.btn-sm.btn-soft', { type: 'button', disabled: i <= 0, onclick: function () { pick(levelsList()[i - 1]); } }, '← ' + (i > 0 ? dispLevel(levelsList()[i - 1]) : '')), h('button.btn.btn-sm.btn-soft', { type: 'button', disabled: i >= levelsList().length - 1, onclick: function () { pick(levelsList()[i + 1]); } }, (i < levelsList().length - 1 ? dispLevel(levelsList()[i + 1]) : '') + ' →')));
      }
      function paintMap() {
        ['front', 'back'].forEach(function (v) { Object.keys(views[v].els).forEach(function (lv) { views[v].els[lv].classList.toggle('is-sel', lv === st.level); }); });
        var sel = MT.$('#an-lvl', ctrl); if (sel) sel.value = st.level;
        MT.clear(panel); panel.appendChild(card(st.level));
        var d = D.dermatomes.filter(function (x) { return x.level === st.level; })[0];
        var note = (d.view === 'front' && !MARKERS.back[st.level]) ? 'This key point is on the front of the body.' : (!MARKERS.front[st.level] ? 'This key point is on the back of the body.' : '');
        if (note) panel.firstChild.appendChild(h('p.an-note', { style: 'margin-top:8px' }, note));
      }
      function setTab(id) {
        st.tab = id; destroyMcq(st.mcqNode); st.mcqNode = null;
        var names = { map: 'Body map', tables: 'Myotomes & reflexes', quiz: 'Quiz: which root?' };
        MT.$$('[role=tab]', tabs).forEach(function (b) { b.setAttribute('aria-selected', String(b.textContent === names[id])); });
        draw();
      }
      function tbl(head, rows) { return h('div.table-wrap', h('table.table.an-tbl', h('thead', h('tr', head.map(function (t) { return h('th', { scope: 'col' }, t); }))), h('tbody', rows))); }
      function draw() {
        MT.clear(body);
        if (st.tab === 'map') {
          MT.clear(ctrl);
          var sel = h('select', { id: 'an-lvl', 'aria-label': 'Choose a spinal level', onchange: function (e) { pick(e.target.value); } }, levelsList().map(function (l) { return h('option', { value: l, selected: l === st.level }, dispLevel(l) + ' – ' + cap(MARK_DESC[l] || D.dermatomes.filter(function (x) { return x.level === l; })[0].area.split(';')[0])); }));
          ctrl.appendChild(h('label', { for: 'an-lvl' }, 'Level')); ctrl.appendChild(sel);
          body.appendChild(h('div.an-grid', h('div.an-left', h('div.card.an-dcard', ctrl, figs, h('p.an-note', { style: 'margin-top:8px;text-align:center' }, 'Circles mark the standard ISNCSCI key sensory points, one per level (shown on one side for clarity). Levels without a circle on a view appear on the other view.'))), panel));
          paintMap();
        } else if (st.tab === 'tables') {
          body.appendChild(h('div.stack',
            h('h3', 'Myotomes (what each root moves)'),
            tbl(['Root', 'Movement', 'Main muscles', 'ISNCSCI key muscle'], D.myotomes.map(function (m) { return h('tr', h('th', { scope: 'row' }, dispLevel(m.level)), h('td', m.movement), h('td', m.muscles.length ? m.muscles.map(function (id, i) { return [i ? ', ' : '', h('a', { href: '#/muscles/' + id }, H.muscleById(id).name)]; }) : '–'), h('td', m.key ? m.keyMuscle : '–')); })),
            h('h3', 'Tendon reflexes and their roots'),
            tbl(['Reflex', 'Roots', 'Nerve', 'How to test'], D.reflexes.map(function (r) { return h('tr', h('th', { scope: 'row' }, r.name), h('td', H.rootsLabel(H.expandRoots(r.roots))), h('td', nerveName(r.nerve).replace(/ \(.*\)$/, '')), h('td', r.test)); })),
            h('div.grid', { style: '--min:260px' },
              h('div.card-soft.an-panel', h('h4', { style: 'margin-top:0' }, 'Reflex grading'), h('ul', D.reflexGrades.map(function (g) { return h('li', h('b', g[0] + ' '), g[1]); }))),
              h('div.card-soft.an-panel', h('h4', { style: 'margin-top:0' }, 'MRC power scale'), h('ul', D.powerGrades.map(function (g) { return h('li', h('b', g[0] + ' '), g[1]); })))),
            h('h3', 'Dermatome key points'),
            tbl(['Level', 'Key point', 'Skin area'], D.dermatomes.map(function (d) { return h('tr', h('th', { scope: 'row' }, dispLevel(d.level)), h('td', d.point), h('td', d.area)); }))));
        } else {
          st.mcqNode = mcq({ topic: 'dermatome', make: function () { return Q.dermatomeQuestion(); } });
          body.appendChild(h('div.card.an-panel', h('h3', 'Which root?'), st.mcqNode));
        }
      }
      draw();
      return function () { destroyMcq(st.mcqNode); };
    }
  });

  /* =====================================================================
     MUSCLES
     ===================================================================== */
  MT.registerTool({
    id: 'muscles', title: 'Muscle database', category: 'anatomy', icon: '💪', order: 5,
    description: 'Searchable database of ' + D.muscles.length + ' muscles (limbs, back, thorax, abdominal wall, head and neck): origin, insertion, nerve and roots, action, blood supply, clinical notes; flashcards and quiz.',
    keywords: ['muscle', 'origin', 'insertion', 'innervation', 'nerve supply', 'action', 'blood supply', 'flashcards', 'rotator cuff', 'hamstrings', 'quadriceps', 'deltoid', 'biceps'],
    render: function (container, ctx) {
      var f = { q: '', region: '', nerve: '', action: '' };
      var st = { tab: 'browse', open: null, mcqNode: null, deck: [], idx: 0, shown: false, onlyNew: false, fs: { n: 0, known: 0 }, qkind: 'nerve' };
      if (ctx.params && ctx.params[0] && H.muscleById(ctx.params[0])) { f.q = H.muscleById(ctx.params[0]).name; st.open = ctx.params[0]; }
      var tabs = tabsBar([{ id: 'browse', label: 'Browse' }, { id: 'cards', label: 'Flashcards' }, { id: 'quiz', label: 'Quiz' }], 'browse', function (id) { setTab(id); });
      var filterBar = h('div.card.an-panel'), body = h('div'), count = h('p.an-note', { 'aria-live': 'polite' });
      var root = h('div.an-wrap', tabs, filterBar, body, refLine(['Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy, 8th–9th ed. (muscle tables: origins, insertions, innervation, actions)', 'Drake RL et al. Gray’s Anatomy for Students, 5th ed.', 'Where textbooks differ, the variation is shown in the muscle’s note; muscles with two nerve supplies are marked and left out of the "which nerve" quiz.']));
      container.appendChild(root);

      function norm(t) { return String(t || '').toLowerCase(); }
      function filtered() {
        var q = norm(f.q).trim(), tag = f.action ? D.actionTags.filter(function (t) { return t.id === f.action; })[0] : null;
        var fam = f.nerve ? H.nerveFamily(f.nerve) : null;
        return D.muscles.filter(function (m) {
          if (f.region && m.region !== f.region) return false;
          if (fam && fam.indexOf(m.nerve) < 0 && !(m.also && fam.indexOf(m.also) >= 0)) return false;
          if (tag && !tag.re.test(m.action)) return false;
          if (q) {
            var hay = norm(m.name + ' ' + m.group + ' ' + m.origin + ' ' + m.insertion + ' ' + m.action + ' ' + nerveName(m.nerve) + ' ' + m.rootsText + ' ' + m.blood + ' ' + m.clinical);
            return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
          }
          return true;
        });
      }
      function opt(v, l, sel) { return h('option', { value: v, selected: sel }, l); }
      function drawFilters() {
        MT.clear(filterBar);
        var nerveIds = {}; D.muscles.forEach(function (m) { nerveIds[m.nerve] = 1; if (m.also) nerveIds[m.also] = 1; });
        var nerveSel = h('select', { id: 'an-fn', onchange: function (e) { f.nerve = e.target.value; refresh(); } }, opt('', 'Any nerve', !f.nerve));
        ['brachial', 'cervical', 'trunk', 'lumbosacral', 'cranial'].forEach(function (g) {
          var og = h('optgroup', { label: { brachial: 'Brachial plexus', cervical: 'Cervical', trunk: 'Trunk', lumbosacral: 'Lumbosacral plexus', cranial: 'Cranial' }[g] });
          D.nerves.filter(function (n) { return n.group === g && nerveIds[n.id]; }).forEach(function (n) { og.appendChild(opt(n.id, n.name.replace(/ \(CN [IVX]+\)/, '') + ' (' + n.rootsText.replace(/ \(.*\)$/, '') + ')', f.nerve === n.id)); });
          if (og.children.length) nerveSel.appendChild(og);
        });
        filterBar.appendChild(h('div', h('label.sr-only', { for: 'an-fq' }, 'Search muscles'),
          h('input.an-search', { id: 'an-fq', type: 'search', placeholder: 'Search by muscle, nerve, root, action, origin…', value: f.q, autocomplete: 'off', oninput: function (e) { f.q = e.target.value; refresh(true); } })));
        filterBar.appendChild(h('div.an-fgrid', { style: 'margin-top:10px' },
          h('label', 'Region', h('select', { id: 'an-fr', onchange: function (e) { f.region = e.target.value; refresh(); } }, [opt('', 'All regions', !f.region)].concat(D.regions.map(function (r) { return opt(r.id, r.label, f.region === r.id); })))),
          h('label', 'Nerve', nerveSel),
          h('label', 'Action', h('select', { id: 'an-fa', onchange: function (e) { f.action = e.target.value; refresh(); } }, [opt('', 'Any action', !f.action)].concat(D.actionTags.map(function (t) { return opt(t.id, t.label, f.action === t.id); })))),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { f = { q: '', region: '', nerve: '', action: '' }; st.open = null; drawFilters(); refresh(); } }, 'Reset filters')));
        filterBar.appendChild(count);
        if (f.nerve) {
          var nv = H.nerveById(f.nerve);
          filterBar.appendChild(h('div.an-sign', h('b', nv.name), nv.rootsText + (nv.note ? '. ' + nv.note : '')));
        }
      }
      function mdetail(m) {
        var nv = H.nerveById(m.nerve), al = m.also ? H.nerveById(m.also) : null;
        return h('div.an-mdetail', h('dl', { style: 'display:grid;gap:8px;margin:0' }, [
          ['Origin', m.origin], ['Insertion', m.insertion],
          ['Innervation', [h('b', nv.name), ' – roots ' + m.rootsText, al ? ' (also ' + al.name + ')' : '', ' ', h('button.an-chip', { type: 'button', style: 'min-height:26px;margin-left:6px', onclick: function () { f.nerve = m.nerve; drawFilters(); refresh(); } }, 'Show this nerve’s muscles')]],
          ['Action', m.action], ['Blood supply', m.blood], ['Clinical note', m.clinical]].concat(m.note ? [['Textbook note', m.note]] : []).map(function (r) { return [h('dt', { style: 'font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700' }, r[0]), h('dd', { style: 'margin:0' }, r[1])]; })));
      }
      function listView() {
        var ms = filtered();
        count.textContent = ms.length + ' of ' + D.muscles.length + ' muscles';
        var wrap = h('div.an-mlist');
        if (!ms.length) return MT.ui.empty('🔍', 'No muscles match', 'Try fewer words or reset the filters.');
        ms.forEach(function (m) {
          var open = st.open === m.id;
          var row = h('button.an-mrow', { type: 'button', 'aria-expanded': String(open), onclick: function () { st.open = open ? null : m.id; drawBody(); var el = MT.$('[data-mid="' + m.id + '"]', body); if (el && !open) scrollTo(el); } },
            h('b', m.name), h('span.muted.small', D.regions.filter(function (r) { return r.id === m.region; })[0].label + ' · ' + m.group), h('span.small', nerveName(m.nerve).replace(/ \(.*\)$/, '') + ' (' + m.rootsText + ')' + (m.dual ? ' + ' + nerveName(m.also).replace(/ \(.*\)$/, '') : '') + ' – ' + Q.shortAction(m)));
          var item = h('div', { 'data-mid': m.id }, row);
          if (open) item.appendChild(mdetail(m));
          wrap.appendChild(item);
        });
        return wrap;
      }
      function newDeck() {
        var ms = filtered(), kn = stats().cards;
        if (st.onlyNew) ms = ms.filter(function (m) { return kn[m.id] !== 'k'; });
        st.deck = Q.shuffle(ms.map(function (m) { return m.id; })); st.idx = 0; st.shown = false;
      }
      function cardView() {
        MT.clear(body);
        var top = h('div.an-ctrl', h('label.check', h('input', { type: 'checkbox', checked: st.onlyNew, onchange: function (e) { st.onlyNew = e.target.checked; newDeck(); drawBody(); } }), ' Hide cards I already know'), h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { newDeck(); drawBody(); } }, 'Shuffle'), h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { var s2 = stats(); s2.cards = {}; MT.store.set(STATS_KEY, s2); newDeck(); drawBody(); } }, 'Forget my progress'));
        body.appendChild(top);
        if (!st.deck.length) { body.appendChild(MT.ui.empty('🎉', 'No cards in this deck', 'Change the filters, or untick "Hide cards I already know".')); return; }
        if (st.idx >= st.deck.length) {
          body.appendChild(h('div.card.an-panel', h('h3', 'Deck finished'), h('p', 'You marked ' + st.fs.known + ' of ' + st.fs.n + ' cards as known this round.'), h('button.btn.btn-primary', { type: 'button', style: 'margin-top:8px', onclick: function () { st.fs = { n: 0, known: 0 }; newDeck(); drawBody(); } }, 'Start again')));
          return;
        }
        var m = H.muscleById(st.deck[st.idx]), nv = H.nerveById(m.nerve);
        body.appendChild(h('div.an-prog', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': st.deck.length, 'aria-valuenow': st.idx, 'aria-label': 'Deck progress' }, h('i', { style: 'width:' + Math.round(100 * st.idx / st.deck.length) + '%' })));
        body.appendChild(h('p.an-note', 'Card ' + (st.idx + 1) + ' of ' + st.deck.length + '. Say the origin, insertion, nerve and action aloud, then reveal.'));
        var face = h('button.an-flash', { type: 'button', 'aria-label': st.shown ? 'Card answer shown' : 'Reveal answer', onclick: function () { st.shown = !st.shown; cardView(); var b = MT.$('.an-flash', body); if (b) b.focus(); } },
          h('div.q', m.name), h('div.muted.small', D.regions.filter(function (r) { return r.id === m.region; })[0].label + ' · ' + m.group));
        if (st.shown) face.appendChild(h('dl', [['Origin', m.origin], ['Insertion', m.insertion], ['Nerve', nv.name + ' (' + m.rootsText + ')' + (m.dual ? ' + ' + nerveName(m.also) : '')], ['Action', m.action], ['Blood supply', m.blood], ['Clinical', m.clinical]].map(function (r) { return [h('dt', r[0]), h('dd', r[1])]; })));
        else face.appendChild(h('div.btn.btn-soft', 'Tap to reveal'));
        body.appendChild(face);
        if (st.shown) body.appendChild(h('div.an-fcr', h('button.btn.btn-soft', { type: 'button', onclick: function () { rate(m, false); } }, 'Again'), h('button.btn.btn-primary', { type: 'button', onclick: function () { rate(m, true); } }, 'Got it')));
      }
      function rate(m, ok) {
        var s2 = stats(); s2.cards[m.id] = ok ? 'k' : 'a'; MT.store.set(STATS_KEY, s2);
        st.fs.n++; if (ok) st.fs.known++;
        if (!ok) st.deck.push(m.id);
        st.idx++; st.shown = false; cardView();
        var b = MT.$('.an-flash', body); if (b) b.focus({ preventScroll: true });
      }
      function quizView() {
        MT.clear(body);
        var ms = filtered();
        var seg = MT.ui.segmented([{ value: 'nerve', label: 'Which nerve?' }, { value: 'action', label: 'Main action?' }, { value: 'mixed', label: 'Mixed' }], st.qkind, function (v) { st.qkind = v; quizView(); });
        body.appendChild(h('div.an-ctrl', seg, h('span.an-note', 'Uses the muscles currently shown by the filters (' + ms.length + ').')));
        var pool = ms;
        if (pool.length < 4) { body.appendChild(MT.ui.empty('🔍', 'Too few muscles', 'Widen the filters to at least 4 muscles to build a quiz.')); return; }
        destroyMcq(st.mcqNode);
        st.mcqNode = mcq({ topic: 'muscles-' + (st.qkind === 'mixed' ? 'mixed' : st.qkind), make: function () {
          var kind = st.qkind === 'mixed' ? (Math.random() < 0.5 ? 'nerve' : 'action') : st.qkind;
          if (kind === 'nerve') { var np = pool.filter(function (m) { return !m.dual; }); if (np.length) return Q.nerveQuestion(Q.pick(np)); }
          return Q.actionQuestion(Q.pick(pool));
        } });
        body.appendChild(h('div.card.an-panel', st.mcqNode));
      }
      function drawBody() {
        if (st.tab === 'browse') { MT.clear(body); body.appendChild(listView()); }
        else if (st.tab === 'cards') cardView();
        else quizView();
      }
      function refresh(typing) {
        var ms = filtered();
        if (st.tab === 'browse') { MT.clear(body); body.appendChild(listView()); }
        else { count.textContent = ms.length + ' of ' + D.muscles.length + ' muscles'; if (st.tab === 'cards') { newDeck(); cardView(); } else quizView(); }
        if (typing) return;
      }
      function setTab(id) {
        st.tab = id; destroyMcq(st.mcqNode); st.mcqNode = null;
        var names = { browse: 'Browse', cards: 'Flashcards', quiz: 'Quiz' };
        MT.$$('[role=tab]', tabs).forEach(function (b) { b.setAttribute('aria-selected', String(b.textContent === names[id])); });
        if (id === 'cards') { st.fs = { n: 0, known: 0 }; newDeck(); }
        count.textContent = filtered().length + ' of ' + D.muscles.length + ' muscles';
        drawBody();
      }
      drawFilters(); count.textContent = filtered().length + ' of ' + D.muscles.length + ' muscles'; drawBody();
      if (st.open) { var el = MT.$('[data-mid="' + st.open + '"]', body); if (el) setTimeout(function () { scrollTo(el); }, 50); }
      return function () { destroyMcq(st.mcqNode); };
    }
  });

  /* =====================================================================
     SKULL FORAMINA
     ===================================================================== */
  MT.registerTool({
    id: 'skull-foramina', title: 'Skull foramina', category: 'anatomy', icon: '💀', order: 6,
    description: 'Openings of the skull base, orbit, face and palate with their contents, clinical notes and a quiz in both directions.',
    keywords: ['foramen', 'foramina', 'skull base', 'cranial fossa', 'foramen ovale', 'foramen rotundum', 'jugular foramen', 'superior orbital fissure', 'optic canal', 'carotid canal', 'foramen magnum'],
    render: function (container, ctx) {
      var st = { tab: 'browse', q: '', fossa: '', open: ctx.params && ctx.params[0] || null, mcqNode: null };
      var tabs = tabsBar([{ id: 'browse', label: 'Browse' }, { id: 'quiz', label: 'Quiz' }], 'browse', function (id) { setTab(id); });
      var body = h('div'), root = h('div.an-wrap', tabs, body, refLine(['Moore KL et al. Clinically Oriented Anatomy, 8th–9th ed. (Head: cranial base and its foramina)', 'Standring S (ed). Gray’s Anatomy, 42nd ed. (Cranial fossae)', 'Mnemonic for the middle cranial fossa: "Standing Room Only" = Superior orbital fissure, foramen Rotundum, foramen Ovale (V1, V2, V3); foramen Spinosum carries the middle meningeal artery.']));
      container.appendChild(root);
      function setTab(id) {
        st.tab = id; destroyMcq(st.mcqNode); st.mcqNode = null;
        var names = { browse: 'Browse', quiz: 'Quiz' };
        MT.$$('[role=tab]', tabs).forEach(function (b) { b.setAttribute('aria-selected', String(b.textContent === names[id])); });
        draw();
      }
      function draw() {
        MT.clear(body);
        if (st.tab === 'quiz') {
          st.mcqNode = mcq({ topic: 'foramina', make: function () { return Q.foramenQuestion(); } });
          body.appendChild(h('div.card.an-panel', h('h3', 'Skull foramina quiz'), h('p.an-note', 'Each question has exactly one correct opening or structure. The foramen lacerum is left out on purpose: nothing of importance passes completely through it.'), st.mcqNode));
          return;
        }
        var list = h('div'), count = h('p.an-note', { 'aria-live': 'polite' });
        function fill() {
          MT.clear(list);
          var q = st.q.toLowerCase().trim(), n = 0;
          Object.keys(D.fossaLabels).forEach(function (fk) {
            if (st.fossa && st.fossa !== fk) return;
            var items = D.foramina.filter(function (x) { return x.fossa === fk && (!q || (x.name + ' ' + x.location + ' ' + x.contents.join(' ') + ' ' + x.note).toLowerCase().indexOf(q) >= 0); });
            if (!items.length) return;
            n += items.length;
            list.appendChild(h('h3.an-fossa', D.fossaLabels[fk]));
            var wrap = h('div.an-mlist');
            items.forEach(function (x) {
              var open = st.open === x.id;
              var row = h('button.an-mrow', { type: 'button', 'aria-expanded': String(open), onclick: function () { st.open = open ? null : x.id; fill(); } }, h('b', x.name), h('span.muted.small', x.location), h('span.small', x.contents.slice(0, 3).join('; ') + (x.contents.length > 3 ? '; …' : '')));
              var it = h('div', { 'data-fid': x.id }, row);
              if (open) it.appendChild(h('div.an-mdetail', h('h4', { style: 'margin:0 0 4px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)' }, 'Passes through'), h('ul', { style: 'margin:0 0 8px;padding-left:1.2em' }, x.contents.map(function (c) { return h('li', c); })), x.note ? h('div.an-sign', h('b', 'Clinical note'), x.note) : null));
              wrap.appendChild(it);
            });
            list.appendChild(wrap);
          });
          count.textContent = n + ' of ' + D.foramina.length + ' openings';
          if (!n) list.appendChild(MT.ui.empty('🔍', 'No openings match', 'Try a nerve, vessel or bone name.'));
        }
        var fs = h('select', { 'aria-label': 'Region', onchange: function (e) { st.fossa = e.target.value; fill(); } }, [h('option', { value: '' }, 'All regions')].concat(Object.keys(D.fossaLabels).map(function (k) { return h('option', { value: k }, D.fossaLabels[k]); })));
        body.appendChild(h('div.card.an-panel', h('label.sr-only', { for: 'an-sq' }, 'Search openings'), h('input.an-search', { id: 'an-sq', type: 'search', placeholder: 'Search by foramen, nerve, vessel or bone…', value: st.q, oninput: function (e) { st.q = e.target.value; fill(); } }), h('div.an-ctrl', { style: 'margin:10px 0 0' }, fs, count)));
        body.appendChild(list); fill();
        if (st.open) { var el = MT.$('[data-fid="' + st.open + '"]', body); if (el) setTimeout(function () { scrollTo(el); }, 50); }
      }
      draw();
      return function () { destroyMcq(st.mcqNode); };
    }
  });

  /* ---- site search ---- */
  MT.registerSearch(function (q) {
    q = String(q || '').toLowerCase().trim();
    if (q.length < 3) return [];
    var out = [];
    D.muscles.forEach(function (m) { if (out.length < 5 && m.name.toLowerCase().indexOf(q) >= 0) out.push({ title: m.name, description: 'Muscle · ' + nerveName(m.nerve).replace(/ \(.*\)$/, '') + ' (' + m.rootsText + ')', href: '#/muscles/' + m.id, icon: '💪' }); });
    D.foramina.forEach(function (x) { if (out.length < 8 && (x.name.toLowerCase().indexOf(q) >= 0 || x.contents.join(' ').toLowerCase().indexOf(q) >= 0)) out.push({ title: x.name, description: 'Skull opening · ' + x.contents[0], href: '#/skull-foramina/' + x.id, icon: '💀' }); });
    D.cranial.forEach(function (c) { if (out.length < 10 && (c.name.toLowerCase().indexOf(q) >= 0 || ('cn ' + c.numeral.toLowerCase()) === q)) out.push({ title: 'CN ' + c.numeral + ' ' + c.name, description: 'Cranial nerve · ' + c.modality, href: '#/cranial-nerves/' + c.id, icon: '🧠' }); });
    return out;
  });

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

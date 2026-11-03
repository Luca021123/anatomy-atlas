/* Student suite — Evidence & statistics: 'ebm' (EBM calculator) and 'epi' (epidemiology calculators).
 * Pure maths lives in student/lib/ebm.js (MTLib.ebm); this file is UI only. Sources are cited in that file and in the on-screen references. */
(function () {
  'use strict';
  var h = MT.h, s = MT.s, E = (self.MTLib || {}).ebm;
  if (!E) { console.error('MTLib.ebm missing'); return; }
  var KEY = 'student.ebm.state', KEY_TR = 'student.ebm.trainer';

  MT.css('eb', [
    '.eb-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}',
    '.eb-stat{background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 12px;min-width:0}',
    '.eb-stat .eb-l{font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}',
    '.eb-stat .eb-v{font-size:1.45rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2}',
    '.eb-stat .eb-ci{font-size:.82rem;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.eb-2x2{display:grid;grid-template-columns:auto 1fr 1fr;gap:6px;align-items:center;max-width:460px}',
    '.eb-2x2 .eb-hd{font-size:.8rem;font-weight:700;color:var(--muted);text-align:center;padding:4px}',
    '.eb-2x2 .eb-rh{font-size:.85rem;font-weight:700;color:var(--text-2);padding-right:6px}',
    '.eb-2x2 input{text-align:center;font-weight:700;font-size:1.1rem;width:100%;min-height:44px}',
    '.eb-2x2 .eb-sum{text-align:center;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}',
    '.eb-fagan{width:100%;max-width:380px;height:auto;touch-action:none;user-select:none}',
    '.eb-fagan text{fill:var(--text-2);font-size:9px;font-family:var(--font)}',
    '.eb-fagan .eb-ax{stroke:var(--chart-axis);stroke-width:1.5}',
    '.eb-fagan .eb-tk{stroke:var(--chart-axis);stroke-width:1}',
    '.eb-fagan .eb-title{font-weight:700;font-size:10px;fill:var(--text)}',
    '.eb-fagan .eb-line{stroke:var(--accent);stroke-width:2.2}',
    '.eb-fagan .eb-h{fill:var(--accent);stroke:var(--surface);stroke-width:2;cursor:ns-resize}',
    '.eb-fagan .eb-h:focus{outline:none;stroke:var(--text);stroke-width:3}',
    '.eb-fagan .eb-out{fill:var(--chart-2);stroke:var(--surface);stroke-width:2}',
    '.eb-fagan .eb-val{font-weight:800;font-size:12px;fill:var(--accent-text)}',
    '.eb-ic{display:block;max-width:100%;height:auto}',
    '.eb-ic .tp{fill:var(--chart-1)} .eb-ic .fn{fill:var(--chart-1)} .eb-ic .fp{fill:var(--surface-3)} .eb-ic .tn{fill:var(--surface-3)}',
    '.eb-ic .pos{stroke:var(--text);stroke-width:1.4}',
    '.eb-ic .tn,.eb-ic .fp{stroke:var(--border-strong);stroke-width:.6}',
    '.eb-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.86rem}',
    '.eb-leg span{display:inline-flex;align-items:center;gap:6px}',
    '.eb-sw{width:14px;height:14px;border-radius:50%;display:inline-block}',
    '.eb-chart{width:100%;height:auto;max-width:640px}',
    '.eb-chart text{fill:var(--text-2);font-size:10px;font-family:var(--font)}',
    '.eb-chart .gr{stroke:var(--chart-grid);stroke-width:1}',
    '.eb-chart .ax{stroke:var(--chart-axis);stroke-width:1.2}',
    '.eb-in{border:1px solid var(--border-strong);border-radius:8px;padding:6px 8px;min-height:38px;background:var(--surface);color:var(--text);font:inherit;font-variant-numeric:tabular-nums}',
    '.eb-in:focus{outline:none;box-shadow:var(--focus);border-color:var(--accent)}',
    '.eb-mono{font-family:var(--mono);font-size:.88rem}',
    '.eb-warn{color:var(--warn);font-weight:600}',
    '.eb-q{font-size:1.05rem;line-height:1.5}',
    '.eb-range{width:100%;accent-color:var(--accent)}',
    '.eb-twocol{display:grid;gap:18px;grid-template-columns:1fr}',
    '@media(min-width:800px){.eb-twocol{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}',
    '.eb-steps{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-variant-numeric:tabular-nums}',
    '.eb-steps b{background:var(--accent-soft);color:var(--accent-text);padding:3px 9px;border-radius:8px}',
    '.eb-tabs-wrap{overflow-x:auto}'
  ].join('\n'));

  /* ---------- helpers ---------- */
  var saveT;
  function loadState() {
    var d = { v: 1,
      diag: { tp: 90, fp: 20, fn: 10, tn: 80 },
      bayes: { pre: 30, lr: 4.5 },
      ther: { ea: 15, en: 100, ca: 30, cn: 100, good: false },
      ss: { mode: 'prop', alpha: 0.05, power: 0.8, ratio: 1, p1: 0.5, p2: 0.4, diff: 5, sd: 10, cc: false, tadj: true, drop: 10 },
      par: { sens: 90, spec: 90, prev: 1 },
      bt: { prev: 1, sens: 90, spec: 90, n: 1000 },
      epi: {
        ir: { ev: 25, pt: 12000, scale: 1000 }, ci: { cases: 40, n: 800 }, pv: { cases: 120, n: 4000 },
        imp: { re: 15, ro: 5, pe: 25 }, smr: { o: 30, e: 20, m: 'exact' },
        asr: { scale: 100000, rows: [
          { a: '0–14', w: 26.15, c: 2, py: 150000 }, { a: '15–24', w: 16.69, c: 3, py: 100000 }, { a: '25–44', w: 29.28, c: 20, py: 210000 },
          { a: '45–64', w: 19.68, c: 95, py: 170000 }, { a: '65+', w: 8.2, c: 180, py: 60000 }] },
        vax: { r0: 12, cv: 4, nv: 1000, cu: 40, nu: 1000 }, gr: { n1: 100, n2: 180, dt: 3, pct: 10 } }
    };
    var sv = MT.store.get(KEY, null);
    if (sv && typeof sv === 'object') merge(d, sv);
    return d;
  }
  function merge(t, src) {
    Object.keys(src || {}).forEach(function (k) {
      if (t[k] && typeof t[k] === 'object' && !Array.isArray(t[k]) && src[k] && typeof src[k] === 'object') merge(t[k], src[k]);
      else if (src[k] !== undefined && typeof src[k] === typeof t[k]) t[k] = src[k];
      else if (src[k] !== undefined && t[k] === undefined) t[k] = src[k];
    });
  }
  function save(st) { clearTimeout(saveT); saveT = setTimeout(function () { MT.store.set(KEY, st); }, 250); }
  function f(x, dp) { return MT.isNum(x) ? (x === Infinity ? '∞' : MT.fmt(x, dp == null ? 2 : dp)) : '—'; }
  function pc(x, dp) { return MT.isNum(x) ? MT.fmt(x * 100, dp == null ? 1 : dp) + '%' : '—'; }
  function range(lo, hi, fn) { return '(' + fn(lo) + ' to ' + fn(hi) + ')'; }

  /** Numeric field with label; onChange(value|undefined). */
  function nf(label, value, onChange, o) {
    o = o || {};
    var id = MT.uid('eb'), hid = id + '-h';
    var inp = h('input', { type: 'text', inputmode: 'decimal', id: id, value: value == null ? '' : String(value), autocomplete: 'off', spellcheck: 'false', 'aria-describedby': o.hint ? hid : null });
    inp.addEventListener('input', function () { onChange(MT.num(inp.value), inp); });
    var box = o.unit ? h('div.input-group', inp, h('span.addon', o.unit)) : inp;
    var el = h('div.field', h('label', { for: id }, label), box, o.hint ? h('div.hint', { id: hid }, o.hint) : null);
    el.input = inp;
    return el;
  }
  function stat(label, est, ci, note) {
    return h('div.eb-stat', h('div.eb-l', label), h('div.eb-v', est), ci ? h('div.eb-ci', ci) : null, note ? h('div.eb-ci', note) : null);
  }
  function card(title) { var a = Array.prototype.slice.call(arguments, 1); return h.apply(null, ['div.card', h('h2', { style: 'font-size:1.15rem;margin-bottom:.6rem' }, title)].concat(a)); }
  function refs(list) {
    return h('details.disclosure', h('summary', 'Methods and references'), h('div.disclosure-body', h('ul', { style: 'padding-left:1.1rem' }, list.map(function (r) { return h('li', { style: 'margin:.25rem 0' }, r); }))));
  }
  function slider(min, max, step, value, label, onInput) {
    var id = MT.uid('rg');
    var r = h('input.eb-range', { type: 'range', id: id, min: min, max: max, step: step, value: value, 'aria-label': label });
    r.addEventListener('input', function () { onInput(Number(r.value)); });
    return r;
  }

  /** Icon array: groups = [{n, cls:'tp'|'fn'|'fp'|'tn', pos:bool}], total people, columns. */
  function iconArray(groups, cols, cell, label) {
    var total = groups.reduce(function (a, g) { return a + g.n; }, 0);
    var rows = Math.ceil(total / cols), R = cell * 0.4, W = cols * cell, H = rows * cell;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'eb-ic', role: 'img', 'aria-label': label, width: Math.min(W, 420) }), i = 0;
    groups.forEach(function (g) {
      for (var k = 0; k < g.n; k++, i++) {
        var cx = (i % cols) * cell + cell / 2, cy = Math.floor(i / cols) * cell + cell / 2;
        svg.appendChild(s('circle', { cx: cx, cy: cy, r: R, class: g.cls + (g.pos ? ' pos' : '') }));
      }
    });
    return svg;
  }
  function legend(items) {
    return h('div.eb-leg', items.map(function (it) {
      var sw = h('span.eb-sw', { style: 'background:' + it.fill + ';' + (it.ring ? 'border:2.5px solid var(--text);' : 'border:1px solid var(--border-strong);'), 'aria-hidden': 'true' });
      return h('span', sw, it.text);
    }));
  }

  /* ======================================================================
     Diagnostic test accuracy
     ====================================================================== */
  function lrBand(v, pos) {
    if (!MT.isNum(v)) return '';
    if (pos) return v > 10 ? 'large, often conclusive increase in probability' : v >= 5 ? 'moderate increase' : v >= 2 ? 'small increase' : v > 1 ? 'minimal change' : 'does not raise probability';
    return v < 0.1 ? 'large, often conclusive decrease in probability' : v <= 0.2 ? 'moderate decrease' : v <= 0.5 ? 'small decrease' : v < 1 ? 'minimal change' : 'does not lower probability';
  }
  function tabDiagnostic(host, st, api) {
    var out = h('div', { 'aria-live': 'polite' }), d = st.diag;
    function cell(key, label) {
      var inp = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': label, value: String(d[key]), autocomplete: 'off' });
      inp.addEventListener('input', function () { var v = MT.num(inp.value); d[key] = (v != null && v >= 0) ? Math.round(v) : 0; save(st); calc(); });
      inp.className = 'input';
      return inp;
    }
    var sums = { c1: h('div.eb-sum'), c2: h('div.eb-sum'), r1: h('div.eb-sum'), r2: h('div.eb-sum'), all: h('div.eb-sum') };
    var inputs = { tp: cell('tp', 'True positives: test positive, disease present'), fp: cell('fp', 'False positives: test positive, disease absent'), fn: cell('fn', 'False negatives: test negative, disease present'), tn: cell('tn', 'True negatives: test negative, disease absent') };
    var tbl = h('div.eb-2x2',
      h('div'), h('div.eb-hd', 'Disease present'), h('div.eb-hd', 'Disease absent'),
      h('div.eb-rh', 'Test positive'), inputs.tp, inputs.fp,
      h('div.eb-rh', 'Test negative'), inputs.fn, inputs.tn,
      h('div.eb-rh', 'Total'), sums.c1, sums.c2);
    var ex = h('select', { 'aria-label': 'Load an illustrative example' },
      h('option', { value: '' }, 'Load example…'),
      h('option', { value: '90,20,10,80' }, 'Sensitivity 90/100, specificity 80/100'),
      h('option', { value: '8,99,2,891' }, 'Screening test, 1% prevalence (Se 80%, Sp 90%)'),
      h('option', { value: '31,26,5,138' }, 'Mixed study, prevalence 18% (illustrative)'),
      h('option', { value: '50,0,5,45' }, 'Perfect specificity (zero cell)'));
    ex.addEventListener('change', function () {
      if (!ex.value) return; var p = ex.value.split(',').map(Number);
      ['tp', 'fp', 'fn', 'tn'].forEach(function (k, i) { d[k] = p[i]; inputs[k].value = String(p[i]); });
      ex.value = ''; save(st); calc();
    });
    function calc() {
      MT.clear(out);
      var r = E.diagnostic(d.tp, d.fp, d.fn, d.tn);
      sums.c1.textContent = String(r.diseased); sums.c2.textContent = String(r.healthy);
      if (!(r.n > 0) || !(r.diseased > 0) || !(r.healthy > 0)) { out.appendChild(MT.ui.empty('🧮', 'Enter counts', 'You need people with and without the disease to calculate accuracy.')); return; }
      var ci = function (w) { return range(w.lo, w.hi, function (x) { return pc(x, 1); }); };
      var lrci = function (w) { return range(w.lo, w.hi, function (x) { return f(x, 2); }); };
      out.appendChild(h('div.eb-grid',
        stat('Sensitivity', pc(r.sensitivity.p, 1), ci(r.sensitivity), 'TP / (TP + FN)'),
        stat('Specificity', pc(r.specificity.p, 1), ci(r.specificity), 'TN / (TN + FP)'),
        stat('PPV', pc(r.ppv.p, 1), ci(r.ppv), 'TP / (TP + FP)'),
        stat('NPV', pc(r.npv.p, 1), ci(r.npv), 'TN / (TN + FN)'),
        stat('LR+', f(r.lrPos.v, 2), lrci(r.lrPos), 'Se / (1 − Sp)'),
        stat('LR−', f(r.lrNeg.v, 3), range(r.lrNeg.lo, r.lrNeg.hi, function (x) { return f(x, 3); }), '(1 − Se) / Sp'),
        stat('Accuracy', pc(r.accuracy.p, 1), ci(r.accuracy)),
        stat('Prevalence', pc(r.prevalence.p, 1), ci(r.prevalence), 'in this sample'),
        stat('Diagnostic OR', f(r.dor.v, 1), lrci(r.dor), 'LR+ / LR−')));
      var msgs = [];
      msgs.push(h('p', h('strong', 'LR+ = ' + f(r.lrPos.v, 2) + ': '), 'a positive result gives a ' + lrBand(r.lrPos.v, true) + '. ', h('strong', 'LR− = ' + f(r.lrNeg.v, 3) + ': '), 'a negative result gives a ' + lrBand(r.lrNeg.v, false) + '.'));
      msgs.push(h('p.small', 'Rules of thumb (Jaeschke 1994; McGee 2002): LR+ > 10 or LR− < 0.1 usually changes management; 2–5 / 0.2–0.5 gives small shifts. High specificity helps rule in (SpPIn); high sensitivity helps rule out (SnNOut).'));
      msgs.push(h('p', 'Sensitivity and specificity are properties of the test in a given population; predictive values depend on prevalence. Here PPV and NPV are valid only where disease prevalence is ', h('strong', pc(r.prevalence.p, 1)), '. In a different setting use the likelihood ratios in the Bayes tab.'));
      if (r.corrected) msgs.push(MT.ui.alert('warn', 'Zero cell', 'LR, odds-ratio intervals use a 0.5 continuity correction (Haldane–Anscombe). The point estimates shown for LR+/LR− use that correction too: ' + (r.lrPosRaw === Infinity ? 'the uncorrected LR+ is infinite.' : '') + ' Treat with caution; sensitivity/specificity use Wilson intervals, which remain valid.'));
      if (r.n < 30 || r.diseased < 10 || r.healthy < 10) msgs.push(MT.ui.alert('warn', 'Small sample', 'Confidence intervals are wide. Accuracy estimates from fewer than about 10 cases or non-cases are unreliable.'));
      out.appendChild(h('div.stack-sm', { style: 'margin-top:14px' }, msgs));
      out.appendChild(h('div.row', { style: 'margin-top:10px' },
        h('button.btn.btn-soft', { type: 'button', onclick: function () { st.bayes.lr = Math.round(r.lrPos.v * 100) / 100; save(st); api.go('bayes'); } }, 'Use LR+ in Bayes tab'),
        h('button.btn.btn-soft', { type: 'button', onclick: function () { st.bayes.lr = Math.round(r.lrNeg.v * 1000) / 1000; save(st); api.go('bayes'); } }, 'Use LR− in Bayes tab'),
        h('button.btn', { type: 'button', onclick: function () {
          MT.copy('Diagnostic 2x2 (TP ' + d.tp + ', FP ' + d.fp + ', FN ' + d.fn + ', TN ' + d.tn + '): sensitivity ' + pc(r.sensitivity.p) + ' ' + ci(r.sensitivity) + '; specificity ' + pc(r.specificity.p) + ' ' + ci(r.specificity) + '; PPV ' + pc(r.ppv.p) + '; NPV ' + pc(r.npv.p) + '; LR+ ' + f(r.lrPos.v, 2) + ' ' + lrci(r.lrPos) + '; LR- ' + f(r.lrNeg.v, 3) + '; DOR ' + f(r.dor.v, 1) + '. 95% CIs: Wilson (proportions), log method (ratios).');
          MT.toast('Summary copied', 'ok');
        } }, 'Copy summary')));
    }
    host.appendChild(card('Diagnostic test 2×2 table',
      h('p.muted', 'Rows are the index test result, columns the reference (gold) standard. Enter counts of people.'),
      h('div.stack', tbl, h('div.row', h('div.field', { style: 'max-width:340px' }, h('label', 'Example'), ex))),
      h('div', { style: 'margin-top:16px' }, out),
      refs(['Wilson score interval for sensitivity, specificity, predictive values, accuracy and prevalence (Newcombe 1998, Stat Med 17:857).', 'Likelihood-ratio and diagnostic-odds-ratio intervals: log method (Simel 1991; Altman, Statistics with Confidence 2000). Zero cells: add 0.5 to all four cells for the ratios.', 'Interpretation bands: Jaeschke R, Guyatt GH, Sackett DL. JAMA 1994;271:703; McGee S. J Gen Intern Med 2002;17:646.', 'Reporting: STARD 2015 checklist (Bossuyt PM et al., BMJ 2015;351:h5527).'])));
    calc();
  }

  /* ======================================================================
     Bayes + Fagan nomogram
     ====================================================================== */
  var TICK_P = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 99.5, 99.8, 99.9];
  var TICK_LR = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  function fagan(getPre, getLR, setPre, setLR) {
    var Y0 = 246, K = 64, XL = 66, XM = 170, XR = 274;
    var lg = function (x) { return Math.log(x) / Math.LN10; };
    var lo = function (p) { return lg(p / (1 - p)); };
    var yPre = function (p) { return Y0 + K * lo(p); };
    var yPost = function (p) { return Y0 - K * lo(p); };
    var yLR = function (r) { return Y0 - (K / 2) * lg(r); };
    var svg = s('svg', { viewBox: '0 0 340 474', class: 'eb-fagan', role: 'group', 'aria-label': 'Fagan nomogram: a straight line from pre-test probability through the likelihood ratio gives post-test probability' });
    svg.appendChild(s('text', { x: XL, y: 18, 'text-anchor': 'middle', class: 'eb-title' }, 'Pre-test %'));
    svg.appendChild(s('text', { x: XM, y: 18, 'text-anchor': 'middle', class: 'eb-title' }, 'Likelihood ratio'));
    svg.appendChild(s('text', { x: XR, y: 18, 'text-anchor': 'middle', class: 'eb-title' }, 'Post-test %'));
    [XL, XM, XR].forEach(function (x) { svg.appendChild(s('line', { x1: x, x2: x, y1: Y0 - 3.1 * K * (x === XM ? 0.5 : 1), y2: Y0 + 3.1 * K * (x === XM ? 0.5 : 1), class: 'eb-ax' })); });
    TICK_P.forEach(function (p) {
      var big = [1, 5, 10, 50, 90, 99].indexOf(p) >= 0 || p === 0.1 || p === 99.9, pp = p / 100, lbl = String(p);
      svg.appendChild(s('line', { x1: XL - 5, x2: XL, y1: yPre(pp), y2: yPre(pp), class: 'eb-tk' }));
      svg.appendChild(s('line', { x1: XR, x2: XR + 5, y1: yPost(pp), y2: yPost(pp), class: 'eb-tk' }));
      if (big || [0.2, 0.5, 2, 20, 30, 40, 60, 70, 80, 95, 98, 99.5, 99.8].indexOf(p) >= 0) {
        svg.appendChild(s('text', { x: XL - 8, y: yPre(pp) + 3, 'text-anchor': 'end' }, lbl));
        svg.appendChild(s('text', { x: XR + 8, y: yPost(pp) + 3, 'text-anchor': 'start' }, lbl));
      }
    });
    TICK_LR.forEach(function (r) {
      svg.appendChild(s('line', { x1: XM - 5, x2: XM + 5, y1: yLR(r), y2: yLR(r), class: 'eb-tk' }));
      if ([0.001, 0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100, 1000].indexOf(r) >= 0)
        svg.appendChild(s('text', { x: XM + 9, y: yLR(r) + 3, 'text-anchor': 'start' }, String(r)));
    });
    var line = s('line', { class: 'eb-line' }), hp = s('circle', { r: 8, class: 'eb-h', tabindex: 0, role: 'slider', 'aria-label': 'Pre-test probability (arrow keys change the value)', 'aria-valuemin': 0.1, 'aria-valuemax': 99.9 });
    var hl = s('circle', { r: 8, class: 'eb-h', tabindex: 0, role: 'slider', 'aria-label': 'Likelihood ratio (arrow keys change the value)', 'aria-valuemin': 0.001, 'aria-valuemax': 1000 });
    var po = s('circle', { r: 6, class: 'eb-out' });
    var tPre = s('text', { class: 'eb-val', 'text-anchor': 'middle' }), tLR = s('text', { class: 'eb-val', 'text-anchor': 'middle' }), tPost = s('text', { class: 'eb-val', 'text-anchor': 'middle' });
    [line, hp, hl, po, tPre, tLR, tPost].forEach(function (n) { svg.appendChild(n); });
    var fmtp = function (p) { return (p * 100 >= 10 ? MT.fmt(p * 100, 0) : p * 100 >= 1 ? MT.fmt(p * 100, 1) : MT.fmt(p * 100, 2)) + '%'; };
    var fmtlr = function (r) { return r >= 100 ? MT.fmt(r, 0) : r >= 10 ? MT.fmt(r, 1) : r >= 1 ? MT.fmt(r, 2, { trim: true }) : MT.fmt(r, 3, { trim: true }); };
    function update() {
      var pre = MT.clamp(getPre(), 0.0005, 0.9995), lr = MT.clamp(getLR(), 0.0005, 2000);
      var post = E.postTest(pre, lr);
      var lp = MT.clamp(lo(pre), -3.1, 3.1), ll = MT.clamp(lg(lr), -3.1, 3.1), lpo = MT.clamp(lo(MT.clamp(post, 0.0005, 0.9995)), -3.1, 3.1);
      var y1 = Y0 + K * lp, y2 = Y0 - (K / 2) * ll, y3 = Y0 - K * lpo;
      line.setAttribute('x1', XL); line.setAttribute('y1', y1); line.setAttribute('x2', XR); line.setAttribute('y2', y3);
      hp.setAttribute('cx', XL); hp.setAttribute('cy', y1); hl.setAttribute('cx', XM); hl.setAttribute('cy', y2); po.setAttribute('cx', XR); po.setAttribute('cy', y3);
      hp.setAttribute('aria-valuenow', pre * 100); hp.setAttribute('aria-valuetext', fmtp(pre));
      hl.setAttribute('aria-valuenow', lr); hl.setAttribute('aria-valuetext', 'LR ' + fmtlr(lr));
      tPre.setAttribute('x', XL); tPre.setAttribute('y', 33); tPre.textContent = fmtp(pre);
      tLR.setAttribute('x', XM); tLR.setAttribute('y', 33); tLR.textContent = fmtlr(lr);
      tPost.setAttribute('x', XR); tPost.setAttribute('y', 33); tPost.textContent = fmtp(post);
    }
    function yFrom(ev) { var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()).y; }
    function drag(el, apply) {
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); el.setPointerCapture(e.pointerId); el.dataset.drag = '1'; });
      el.addEventListener('pointermove', function (e) { if (el.dataset.drag) apply(yFrom(e)); });
      var end = function () { delete el.dataset.drag; };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    }
    drag(hp, function (y) { var l = MT.clamp((y - Y0) / K, -3, 3), p = E.oddsToProb(Math.pow(10, l)); setPre(Math.round(p * 1000) / 1000); });
    drag(hl, function (y) { var l = MT.clamp((Y0 - y) * 2 / K, -3, 3), r = Math.pow(10, l); setLR(Number(r.toPrecision(2))); });
    hp.addEventListener('keydown', function (e) { var d = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -1 : 0; if (!d) return; e.preventDefault(); var l = MT.clamp(lo(getPre()) + d * 0.05 * (e.shiftKey ? 4 : 1), -3, 3); setPre(Math.round(E.oddsToProb(Math.pow(10, l)) * 1000) / 1000); });
    hl.addEventListener('keydown', function (e) { var d = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -1 : 0; if (!d) return; e.preventDefault(); var l = MT.clamp(lg(getLR()) + d * 0.05 * (e.shiftKey ? 4 : 1), -3, 3); setLR(Number(Math.pow(10, l).toPrecision(2))); });
    update();
    return { el: svg, update: update };
  }

  function tabBayes(host, st) {
    var b = st.bayes, out = h('div', { 'aria-live': 'polite' }), fg, preF, lrF, preSl;
    function pre() { return MT.clamp(b.pre / 100, 0.0005, 0.9995); }
    function setPre(p) { b.pre = Math.round(p * 1000) / 10; preF.input.value = String(b.pre); if (preSl) preSl.value = b.pre; save(st); refresh(); }
    function setLR(r) { b.lr = r; lrF.input.value = String(r); save(st); refresh(); }
    preF = nf('Pre-test probability', b.pre, function (v) { if (v != null && v >= 0.05 && v <= 99.95) { b.pre = v; save(st); refresh(); } }, { unit: '%', hint: 'Prevalence or clinical estimate before the test (0.1–99.9%).' });
    lrF = nf('Likelihood ratio', b.lr, function (v) { if (v != null && v >= 0.001 && v <= 1000) { b.lr = v; save(st); refresh(); } }, { hint: 'LR+ for a positive result, LR− for a negative one (0.001–1000).' });
    preSl = slider(0.1, 99.9, 0.1, Math.min(99.9, Math.max(0.1, b.pre)), 'Pre-test probability slider', function (v) { b.pre = v; preF.input.value = String(v); save(st); refresh(); });
    fg = fagan(function () { return pre(); }, function () { return MT.clamp(b.lr, 0.001, 1000); }, setPre, setLR);
    var d = st.diag, dd = E.diagnostic(d.tp, d.fp, d.fn, d.tn);
    function refresh() {
      fg.update(); MT.clear(out);
      var p0 = pre(), o0 = E.probToOdds(p0), post = E.postTest(p0, b.lr), o1 = o0 * b.lr;
      out.appendChild(h('div.result.band-info', h('div.result-label', 'Post-test probability'), h('div.result-value', pc(post, post < 0.1 ? 2 : 1))));
      out.appendChild(h('div.eb-steps', { style: 'margin:10px 0' },
        h('span', 'Pre-test odds'), h('b', f(o0, 3)), h('span', '× LR'), h('b', f(b.lr, 3)), h('span', '= post-test odds'), h('b', f(o1, 3)), h('span', '→ probability'), h('b', pc(post, 1))));
      if (dd.lrPos && dd.n > 0 && dd.diseased > 0 && dd.healthy > 0) {
        var ppos = E.postTest(p0, dd.lrPos.v), pneg = E.postTest(p0, dd.lrNeg.v);
        out.appendChild(h('div.table-wrap', { style: 'margin-top:8px' }, h('table.table',
          h('caption.sr-only', 'Post-test probabilities using likelihood ratios from the diagnostic 2×2 table'),
          h('thead', h('tr', h('th', 'Using your 2×2 table'), h('th', 'LR'), h('th', 'Post-test probability'))),
          h('tbody', h('tr', h('td', 'If the test is positive'), h('td', f(dd.lrPos.v, 2)), h('td', pc(ppos, 1))),
            h('tr', h('td', 'If the test is negative'), h('td', f(dd.lrNeg.v, 3)), h('td', pc(pneg, 1)))))));
      }
    }
    var quick = h('div.row', { style: 'margin-top:6px' },
      dd.lrPos && dd.diseased > 0 && dd.healthy > 0 ? [h('button.btn.btn-sm.btn-soft', { type: 'button', onclick: function () { setLR(Math.round(dd.lrPos.v * 100) / 100); } }, 'LR+ from 2×2'), h('button.btn.btn-sm.btn-soft', { type: 'button', onclick: function () { setLR(Math.round(dd.lrNeg.v * 1000) / 1000); } }, 'LR− from 2×2')] : null,
      h('button.btn.btn-sm', { type: 'button', onclick: function () { setLR(1); } }, 'Reset LR = 1'));
    host.appendChild(card('Pre-test to post-test probability',
      h('p.muted', 'Bayes’ theorem in odds form: post-test odds = pre-test odds × likelihood ratio. Drag the two handles on the Fagan nomogram (or focus a handle and use the arrow keys to raise or lower its value); the line reads off the post-test probability.'),
      h('div.eb-twocol', h('div', h('div.stack', preF, preSl, lrF, quick, out)),
        h('div', { style: 'text-align:center' }, fg.el)),
      refs(['Fagan TJ. Nomogram for Bayes’s theorem. N Engl J Med 1975;293:257.', 'Sackett DL, Straus SE, Richardson WS et al. Evidence-Based Medicine: How to Practice and Teach EBM, 2nd ed. 2000.', 'Pre-test probability should come from local prevalence, clinical prediction rules, or experienced judgement; the LR must come from a study in a comparable population.'])));
    refresh();
  }

  /* ======================================================================
     Therapy: RR, OR, ARR, RRR, NNT
     ====================================================================== */
  function tabTherapy(host, st) {
    var t = st.ther, out = h('div', { 'aria-live': 'polite' }), arrays = h('div');
    function field(label, key, hint) {
      return nf(label, t[key], function (v) { if (v != null && v >= 0) { t[key] = Math.round(v); save(st); calc(); } }, { hint: hint });
    }
    var sel = h('select', { 'aria-label': 'Outcome type' }, h('option', { value: 'bad' }, 'Undesirable (death, stroke, infection…)'), h('option', { value: 'good' }, 'Desirable (cure, remission, survival…)'));
    sel.value = t.good ? 'good' : 'bad';
    sel.addEventListener('change', function () { t.good = sel.value === 'good'; save(st); calc(); });
    function calc() {
      MT.clear(out); MT.clear(arrays);
      if (t.ea > t.en || t.ca > t.cn || !(t.en > 0) || !(t.cn > 0)) { out.appendChild(MT.ui.alert('warn', 'Check your numbers', 'Events cannot exceed the number of participants in a group, and each group needs at least one participant.')); return; }
      var r = E.therapy(t.ea, t.en - t.ea, t.ca, t.cn - t.ca);
      var rev = E.therapy(t.ca, t.cn - t.ca, t.ea, t.en - t.ea); // arms swapped: arr = EER − CER (absolute benefit increase)
      var good = t.good, A = good ? rev.arr : r.arr, N = good ? rev.nnt : r.nnt;
      var ci2 = function (w, dp) { return range(w.lo, w.hi, function (x) { return f(x, dp); }); };
      var pct = function (w) { return range(w.lo, w.hi, function (x) { return pc(x, 1); }); };
      var arrLabel = good ? 'Absolute benefit increase (ABI)' : 'Absolute risk reduction (ARR)';
      out.appendChild(h('div.eb-grid',
        stat('Event rate, treatment (EER)', pc(r.eer.p, 1), pct(r.eer)),
        stat('Event rate, control (CER)', pc(r.cer.p, 1), pct(r.cer)),
        stat('Relative risk (RR)', f(r.rr.v, 2), ci2(r.rr, 2), 'EER / CER (Katz)'),
        stat('Relative risk reduction', good ? '—' : pc(r.rrr.v, 1), good ? 'Use RR − 1 = ' + pc(r.rr.v - 1, 1) : pct(r.rrr), '1 − RR'),
        stat('Odds ratio (OR)', f(r.or.v, 2), ci2(r.or, 2), 'Woolf logit'),
        stat(arrLabel, pc(A.v, 1), pct(A), 'Newcombe hybrid-score CI'),
        stat(N.kind === 'NNTH' ? 'Number needed to harm (NNH)' : 'Number needed to treat (NNT)', N.v === Infinity ? '∞' : f(N.v, 1), N.crosses ? '' : ci2(N, 1), '1 / ' + (good ? 'ABI' : 'ARR'))));
      var notes = [];
      if (N.crosses) notes.push(MT.ui.alert('warn', 'Confidence interval crosses zero', N.text + ' The result is not statistically significant: the data are compatible with benefit, no effect, or harm.'));
      else if (N.kind === 'NNTH') notes.push(MT.ui.alert('danger', 'Harm', (good ? 'The desirable outcome is less frequent with treatment' : 'The event is more frequent with treatment') + ': for about every ' + f(N.v, 1) + ' people treated, one additional person is harmed (NNH ' + f(N.lo, 1) + ' to ' + f(N.hi, 1) + ').'));
      else notes.push(MT.ui.alert('ok', 'Benefit', 'About ' + f(N.v, 0) + ' people need to be treated (for the trial duration) for one additional person to benefit (NNTB ' + f(N.lo, 0) + ' to ' + f(N.hi, 0) + '). Interval from inverting the ARR confidence limits (Altman 1998).'));
      notes.push(h('p.small', 'Relative measures (RR, RRR, OR) can look impressive when baseline risk is low; absolute measures (ARR, NNT) show the real-world size of an effect. NNT depends on the baseline risk, the follow-up time and the outcome, so it cannot be compared across trials unless these match. If the outcome is common, OR overstates RR.'));
      if (r.corrected) notes.push(MT.ui.alert('warn', 'Zero cell', 'RR/OR intervals use a 0.5 continuity correction (Haldane–Anscombe).'));
      out.appendChild(h('div.stack-sm', { style: 'margin-top:12px' }, notes));
      var cols = 10, mk = function (a, n, label) { return iconArray([{ n: a, cls: 'fn' }, { n: 100 - a, cls: 'tn' }], cols, 20, label); };
      var e100 = Math.round(r.eer.p * 100), c100 = Math.round(r.cer.p * 100);
      arrays.appendChild(h('div.eb-twocol', { style: 'margin-top:14px' },
        h('div', h('h3', { style: 'font-size:1rem' }, 'Treatment: ' + e100 + ' of 100 have the event'), mk(e100, 100, e100 + ' of 100 people in the treatment group have the event')),
        h('div', h('h3', { style: 'font-size:1rem' }, 'Control: ' + c100 + ' of 100 have the event'), mk(c100, 100, c100 + ' of 100 people in the control group have the event'))));
      arrays.appendChild(legend([{ fill: 'var(--chart-1)', text: 'Had the event' }, { fill: 'var(--surface-3)', text: 'Did not' }]));
    }
    host.appendChild(card('Therapy or risk 2×2',
      h('p.muted', 'Compare an experimental group (treatment or exposure) with a control group.'),
      h('div.grid', { style: '--min:190px;--gap:14px' },
        h('div.field', h('label', 'Outcome (event) is'), sel),
        field('Events: treatment group', 'ea', 'People who had the outcome'), field('Total: treatment group', 'en', 'Everyone randomised/exposed'),
        field('Events: control group', 'ca'), field('Total: control group', 'cn')),
      h('div', { style: 'margin-top:14px' }, out), arrays,
      refs(['RR: Katz log method (Katz D et al., Biometrics 1978;34:469). OR: Woolf logit method. 95% CIs on the log scale.', 'ARR: Newcombe hybrid score interval for the difference of two independent proportions (Newcombe RG, Stat Med 1998;17:873, method 10); built from Wilson limits.', 'NNT = 1/ARR; confidence limits by inverting the ARR limits. If the ARR interval includes zero the NNT interval is given as NNTB to infinity to NNTH (Altman DG, BMJ 1998;317:1309; Laupacis A et al., NEJM 1988;318:1728).', 'Cochrane Handbook for Systematic Reviews of Interventions, ch. 15 (interpreting results).'])));
    calc();
  }

  /* ======================================================================
     Sample size
     ====================================================================== */
  function tabSample(host, st) {
    var q = st.ss, body = h('div'), out = h('div', { 'aria-live': 'polite' });
    var seg = MT.ui.segmented([{ value: 'prop', label: 'Two proportions' }, { value: 'mean', label: 'Two means' }], q.mode, function (v) { q.mode = v; save(st); draw(); });
    function common() {
      var al = h('select', { 'aria-label': 'Significance level, two-sided' }, [0.1, 0.05, 0.025, 0.01].map(function (x) { return h('option', { value: x }, 'α = ' + x + ' (two-sided)'); }));
      al.value = String(q.alpha); al.addEventListener('change', function () { q.alpha = Number(al.value); save(st); calc(); });
      var pw = h('select', { 'aria-label': 'Power' }, [0.7, 0.8, 0.85, 0.9, 0.95].map(function (x) { return h('option', { value: x }, 'Power ' + x * 100 + '%'); }));
      pw.value = String(q.power); pw.addEventListener('change', function () { q.power = Number(pw.value); save(st); calc(); });
      return [h('div.field', h('label', 'Significance level'), al), h('div.field', h('label', 'Power'), pw),
        nf('Allocation ratio (group 2 : group 1)', q.ratio, function (v) { if (v > 0 && v <= 10) { q.ratio = v; save(st); calc(); } }, { hint: '1 = equal groups' }),
        nf('Expected loss to follow-up', q.drop, function (v) { if (v != null && v >= 0 && v < 90) { q.drop = v; save(st); calc(); } }, { unit: '%', hint: 'Inflates the final target' })];
    }
    function draw() {
      MT.clear(body);
      var chk = function (key, label) { var c = h('input', { type: 'checkbox', checked: !!q[key] }); c.addEventListener('change', function () { q[key] = c.checked; save(st); calc(); }); return h('label.check', c, h('span', label)); };
      if (q.mode === 'prop') {
        body.appendChild(h('div.grid', { style: '--min:200px;--gap:14px' },
          nf('Expected proportion, group 1', q.p1, function (v) { if (v != null && v >= 0 && v <= 1) { q.p1 = v; save(st); calc(); } }, { hint: 'As a decimal, e.g. 0.30 for 30% (control event rate)' }),
          nf('Expected proportion, group 2', q.p2, function (v) { if (v != null && v >= 0 && v <= 1) { q.p2 = v; save(st); calc(); } }, { hint: 'As a decimal, e.g. 0.20' }), common()));
        body.appendChild(h('div', { style: 'margin-top:10px;max-width:520px' }, chk('cc', 'Apply continuity correction (Fleiss–Tytun–Ury)')));
      } else {
        body.appendChild(h('div.grid', { style: '--min:200px;--gap:14px' },
          nf('Smallest difference worth detecting', q.diff, function (v) { if (v > 0) { q.diff = v; save(st); calc(); } }, { hint: 'In the units of the measurement' }),
          nf('Standard deviation', q.sd, function (v) { if (v > 0) { q.sd = v; save(st); calc(); } }, { hint: 'Assumed common SD from pilot data or literature' }), common()));
        body.appendChild(h('div', { style: 'margin-top:10px;max-width:520px' }, chk('tadj', 'Add small-sample (t-distribution) adjustment, z²/4 (Guenther)')));
      }
      calc();
    }
    function calc() {
      MT.clear(out);
      var r = q.mode === 'prop' ? E.sampleSizeProportions(q.p1, q.p2, q.alpha, q.power, q.ratio, q.cc) : E.sampleSizeMeans(q.diff, q.sd, q.alpha, q.power, q.ratio, q.tadj);
      if (!r) { out.appendChild(MT.ui.alert('warn', 'Check inputs', q.mode === 'prop' ? 'Proportions must be between 0 and 1 and different from each other.' : 'Difference and SD must be positive.')); return; }
      var inf = 1 / (1 - q.drop / 100), T1 = Math.ceil(r.n1 * inf - 1e-9), T2 = Math.ceil(r.n2 * inf - 1e-9);
      out.appendChild(h('div.grid', { style: '--min:200px' },
        h('div.result.band-info', h('div.result-label', 'Evaluable participants'), h('div.result-value', String(r.total)), h('div.small', 'Group 1: ' + r.n1 + ' · Group 2: ' + r.n2)),
        h('div.result', h('div.result-label', 'To recruit (after ' + q.drop + '% loss)'), h('div.result-value', String(T1 + T2)), h('div.small', 'Group 1: ' + T1 + ' · Group 2: ' + T2))));
      var formula = q.mode === 'prop'
        ? 'n₁ = [ z₁₋α/₂ √((1 + 1/k) p̄ q̄) + z₁₋β √(p₁q₁ + p₂q₂/k) ]² / (p₁ − p₂)²; k = n₂/n₁, p̄ = (p₁ + k p₂)/(1 + k). z₁₋α/₂ = ' + f(r.za, 3) + ', z₁₋β = ' + f(r.zb, 3) + '.'
        : 'n₁ = (1 + 1/k) · σ² (z₁₋α/₂ + z₁₋β)² / δ² (+ z₁₋α/₂²/4 if adjusted). Standardised effect δ/σ = ' + f(r.effect, 2) + '. z₁₋α/₂ = ' + f(r.za, 3) + ', z₁₋β = ' + f(r.zb, 3) + '.';
      out.appendChild(h('p.small.eb-mono', { style: 'margin-top:10px' }, formula));
      out.appendChild(h('p.small', 'Assumes two independent groups, a two-sided test of superiority, and that the stated difference and variability are correct. Always pre-specify the primary outcome, inflate for non-response, and consult a statistician for clustered, crossover, non-inferiority or time-to-event designs.'));
    }
    host.appendChild(card('Sample size for comparing two groups', seg, h('div', { style: 'margin-top:14px' }, body), h('div', { style: 'margin-top:14px' }, out),
      refs(['Two proportions: Fleiss JL, Levin B, Paik MC. Statistical Methods for Rates and Proportions, 3rd ed. 2003, ch. 4; continuity correction: Fleiss JL, Tytun A, Ury HK. Biometrics 1980;36:343.', 'Two means: Chow S-C, Shao J, Wang H. Sample Size Calculations in Clinical Research, 2nd ed. 2008; Guenther WC. Am Stat 1981;35:243 (t-distribution adjustment).', 'Normal-approximation formulas; results are rounded up. Validate against dedicated software (G*Power, PASS, R pwr) for the final protocol.'])));
    draw();
  }

  /* ======================================================================
     Screening paradox: PPV vs prevalence
     ====================================================================== */
  function tabParadox(host, st) {
    var q = st.par, wrap = h('div'), tableHost = h('div'), read = h('div', { 'aria-live': 'polite' });
    var W = 560, H = 330, L = 48, R = 14, T = 14, B = 44, minX = Math.log10(0.0005), maxX = Math.log10(0.6);
    var sx = function (p) { return L + (Math.log10(MT.clamp(p, 0.0005, 0.6)) - minX) / (maxX - minX) * (W - L - R); };
    var sy = function (v) { return T + (1 - v) * (H - T - B); };
    function chart() {
      var sens = q.sens / 100, spec = q.spec / 100;
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'eb-chart', role: 'img', 'aria-label': 'PPV and NPV against prevalence for sensitivity ' + q.sens + '% and specificity ' + q.spec + '%. PPV rises steeply with prevalence.' });
      [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) { svg.appendChild(s('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'gr' })); svg.appendChild(s('text', { x: L - 6, y: sy(v) + 3, 'text-anchor': 'end' }, Math.round(v * 100) + '%')); });
      [0.001, 0.01, 0.1, 0.5].forEach(function (p) { svg.appendChild(s('line', { x1: sx(p), x2: sx(p), y1: T, y2: H - B, class: 'gr' })); svg.appendChild(s('text', { x: sx(p), y: H - B + 15, 'text-anchor': 'middle' }, (p * 100) + '%')); });
      svg.appendChild(s('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'ax' })); svg.appendChild(s('line', { x1: L, x2: L, y1: T, y2: H - B, class: 'ax' }));
      svg.appendChild(s('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle' }, 'Prevalence of disease in the tested population (log scale)'));
      var pp = [], np = [];
      for (var i = 0; i <= 120; i++) { var p = Math.pow(10, minX + (maxX - minX) * i / 120), v = E.predictiveValues(sens, spec, p); pp.push(sx(p) + ',' + sy(v.ppv)); np.push(sx(p) + ',' + sy(v.npv)); }
      svg.appendChild(s('polyline', { points: np.join(' '), fill: 'none', stroke: 'var(--chart-3)', 'stroke-width': 2.4, 'stroke-dasharray': '6 4' }));
      svg.appendChild(s('polyline', { points: pp.join(' '), fill: 'none', stroke: 'var(--chart-1)', 'stroke-width': 2.8 }));
      var cur = E.predictiveValues(sens, spec, q.prev / 100);
      svg.appendChild(s('line', { x1: sx(q.prev / 100), x2: sx(q.prev / 100), y1: T, y2: H - B, stroke: 'var(--text-2)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
      svg.appendChild(s('circle', { cx: sx(q.prev / 100), cy: sy(cur.ppv), r: 5.5, fill: 'var(--chart-1)', stroke: 'var(--surface)', 'stroke-width': 2 }));
      svg.appendChild(s('text', { x: W - R - 4, y: sy(0.97) - 6, 'text-anchor': 'end', style: 'font-weight:700' }, 'NPV (dashed)'));
      svg.appendChild(s('text', { x: sx(0.12), y: sy(E.predictiveValues(sens, spec, 0.12).ppv) + 18, style: 'font-weight:700' }, 'PPV (solid)'));
      MT.clear(wrap); wrap.appendChild(svg);
      MT.clear(read);
      var N = 10000, fr = E.naturalFrequenciesRounded(q.prev / 100, sens, spec, N);
      read.appendChild(h('div.result.band-info', h('div.result-label', 'At ' + q.prev + '% prevalence'), h('div.result-value', 'PPV ' + pc(cur.ppv, 1) + ' · NPV ' + pc(cur.npv, 2)),
        h('p', { style: 'margin:.4rem 0 0' }, 'Of ' + N.toLocaleString() + ' people tested, ' + fr.positives.toLocaleString() + ' test positive but only ' + fr.tp.toLocaleString() + ' of them (' + pc(fr.ppv, 1) + ') truly have the disease; ' + fr.fp.toLocaleString() + ' are false alarms.')));
      MT.clear(tableHost);
      var rows = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5].map(function (p) { var v = E.predictiveValues(sens, spec, p); return h('tr', h('td', pc(p, 1)), h('td', pc(v.ppv, 1)), h('td', pc(v.npv, 2)), h('td', MT.isNum(v.ppv) && v.ppv > 0 ? f((1 - v.ppv) / v.ppv, 1) + ' : 1' : '—')); });
      tableHost.appendChild(h('div.table-wrap', h('table.table', h('caption.sr-only', 'PPV and NPV at several prevalences'), h('thead', h('tr', h('th', 'Prevalence'), h('th', 'PPV'), h('th', 'NPV'), h('th', 'False : true positives'))), h('tbody', rows))));
    }
    function sl(label, key, min, max, step, unit) {
      var out = h('output', { style: 'font-weight:700;min-width:4.5em;text-align:right' }, q[key] + unit);
      var r = slider(min, max, step, q[key], label, function (v) { q[key] = v; out.textContent = v + unit; save(st); chart(); });
      return h('div.field', h('label', label), h('div.row', { style: 'flex-wrap:nowrap' }, r, out));
    }
    host.appendChild(card('The screening paradox: why prevalence matters',
      h('p.muted', 'Even an excellent test produces mostly false positives when the disease is rare. Move the sliders to see PPV fall as prevalence falls.'),
      h('div.eb-twocol', h('div.stack', sl('Sensitivity', 'sens', 50, 100, 1, '%'), sl('Specificity', 'spec', 50, 100, 0.5, '%'), sl('Prevalence', 'prev', 0.1, 50, 0.1, '%'), read), wrap),
      h('div', { style: 'margin-top:14px' }, tableHost),
      refs(['PPV = Se·p / (Se·p + (1 − Sp)(1 − p)); NPV = Sp(1 − p) / (Sp(1 − p) + (1 − Se)p).', 'Gigerenzer G, Gaissmaier W, Kurz-Milcke E, Schwartz LM, Woloshin S. Helping doctors and patients make sense of health statistics. Psychol Sci Public Interest 2007;8:53–96.', 'Curves assume that sensitivity and specificity do not change with the case mix, which is often untrue in practice (spectrum bias).'])));
    chart();
  }

  /* ======================================================================
     Bayes trainer (natural frequencies)
     ====================================================================== */
  function tabTrainer(host, st) {
    var q = st.bt, stats = MT.store.get(KEY_TR, { v: 1, n: 0, ok: 0 });
    if (!stats || typeof stats !== 'object') stats = { v: 1, n: 0, ok: 0 };
    var arrHost = h('div'), expl = h('div', { 'aria-live': 'polite' }), qHost = h('div'), statEl = h('span.badge.badge-accent');
    var mode = 'explore', scenario = null, answered = false;
    function showStats() { statEl.textContent = stats.n ? 'Practice: ' + stats.ok + ' / ' + stats.n + ' correct' : 'Practice: not started'; }
    function array(fr, reveal) {
      MT.clear(arrHost);
      var cols = fr.N >= 1000 ? 50 : 10, cell = fr.N >= 1000 ? 7.5 : 24;
      arrHost.appendChild(iconArray([{ n: fr.tp, cls: 'tp', pos: true }, { n: fr.fn, cls: 'fn' }, { n: fr.fp, cls: 'fp', pos: true }, { n: fr.tn, cls: 'tn' }], cols, cell,
        'Icon array of ' + fr.N + ' people: ' + fr.tp + ' diseased with positive test, ' + fr.fn + ' diseased with negative test, ' + fr.fp + ' healthy with positive test, ' + fr.tn + ' healthy with negative test'));
      arrHost.appendChild(legend([{ fill: 'var(--chart-1)', ring: true, text: 'Disease, test positive (' + fr.tp + ')' }, { fill: 'var(--chart-1)', text: 'Disease, test negative (' + fr.fn + ')' }, { fill: 'var(--surface-3)', ring: true, text: 'No disease, test positive (' + fr.fp + ')' }, { fill: 'var(--surface-3)', text: 'No disease, test negative (' + fr.tn + ')' }]));
    }
    function explain(fr) {
      MT.clear(expl);
      expl.appendChild(h('div.result.band-info', h('div.result-label', 'Natural-frequency answer'), h('div.result-value', fr.tp + ' of ' + fr.positives),
        h('p', { style: 'margin:.3rem 0 0' }, 'Of every ' + fr.N + ' people, ' + fr.disease + ' have the disease; ' + fr.tp + ' of them test positive. Of the ' + fr.healthy + ' without the disease, ' + fr.fp + ' also test positive. So ' + fr.positives + ' people test positive, but only ' + fr.tp + ' have the disease: PPV = ' + pc(fr.ppv, 1) + '. Among the ' + fr.negatives + ' negatives, ' + fr.fn + ' have the disease: NPV = ' + pc(fr.npv, 2) + '.')));
    }
    function explore() {
      MT.clear(qHost);
      var Ns = MT.ui.segmented([{ value: 100, label: '100 people' }, { value: 1000, label: '1,000 people' }], q.n, function (v) { q.n = v; save(st); draw(); });
      function sl(label, key, min, max, step) { var o = h('output', { style: 'font-weight:700;min-width:4.5em;text-align:right' }, q[key] + '%'); return h('div.field', h('label', label), h('div.row', { style: 'flex-wrap:nowrap' }, slider(min, max, step, q[key], label, function (v) { q[key] = v; o.textContent = v + '%'; save(st); draw(); }), o)); }
      qHost.appendChild(h('div.stack', Ns, sl('Prevalence', 'prev', 0.1, 50, 0.1), sl('Sensitivity', 'sens', 50, 100, 1), sl('Specificity', 'spec', 50, 100, 1)));
      draw();
    }
    function draw() { var fr = E.naturalFrequenciesRounded(q.prev / 100, q.sens / 100, q.spec / 100, q.n); array(fr); explain(fr); }
    function newQuestion() {
      var prevs = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2], sens = [0.7, 0.8, 0.9, 0.95, 0.99], spec = [0.8, 0.9, 0.95, 0.98, 0.99];
      var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
      var p = pick(prevs), se = pick(sens), sp = pick(spec), N = 1000, fr = E.naturalFrequenciesRounded(p, se, sp, N);
      if (fr.tp < 1 || fr.fp < 1) return newQuestion();
      scenario = { p: p, se: se, sp: sp, fr: fr, kind: Math.random() < 0.75 ? 'ppv' : 'npv' }; answered = false;
      MT.clear(arrHost); MT.clear(expl);
      var ans = h('input', { type: 'text', inputmode: 'decimal', id: 'eb-ans', autocomplete: 'off', 'aria-describedby': 'eb-ans-h' });
      var res = h('div', { 'aria-live': 'polite', style: 'margin-top:10px' });
      var go = h('button.btn.btn-primary', { type: 'button' }, 'Check my answer');
      var question = scenario.kind === 'ppv'
        ? 'A person from this group tests positive. What is the chance, as a percentage, that they really have the disease?'
        : 'A person from this group tests negative. What is the chance, as a percentage, that they really are free of the disease?';
      function check() {
        if (answered) return; var v = MT.num(ans.value);
        if (v == null || v < 0 || v > 100) { res.textContent = ''; res.appendChild(MT.ui.alert('warn', 'Enter a percentage between 0 and 100', '')); return; }
        answered = true; var truth = (scenario.kind === 'ppv' ? fr.ppv : fr.npv) * 100, ok = Math.abs(v - truth) <= Math.max(3, truth * 0.1);
        if (scenario.kind === 'npv' && truth > 90) ok = Math.abs(v - truth) <= 1.5;
        stats.n++; if (ok) stats.ok++; MT.store.set(KEY_TR, stats); showStats();
        MT.clear(res); res.appendChild(MT.ui.alert(ok ? 'ok' : 'danger', ok ? 'Close enough: correct' : 'Not quite', 'The answer is ' + MT.fmt(truth, truth < 10 ? 1 : 0) + '%. You answered ' + MT.fmt(v, 1) + '%.'));
        array(fr); explain(fr); go.disabled = true;
        res.appendChild(h('button.btn.btn-primary', { type: 'button', style: 'margin-top:10px', onclick: newQuestion }, 'Next question'));
      }
      go.addEventListener('click', check); ans.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
      MT.clear(qHost);
      qHost.appendChild(h('div.stack',
        h('p.eb-q', h('strong', 'Imagine 1,000 people. '), (p * 100) + '% have a disease. The test is ' + (se * 100) + '% sensitive (it detects ' + (se * 100) + ' of every 100 people with the disease) and ' + (sp * 100) + '% specific (it correctly clears ' + (sp * 100) + ' of every 100 people without it).'),
        h('p.eb-q', question),
        h('div.field', { style: 'max-width:240px' }, h('label', { for: 'eb-ans' }, 'Your estimate'), h('div.input-group', ans, h('span.addon', '%')), h('div.hint#eb-ans-h', 'Tip: work out how many of the 1,000 test positive first.')),
        h('div.row', go, h('button.btn.btn-ghost', { type: 'button', onclick: function () { if (!answered) { answered = true; array(fr); explain(fr); go.disabled = true; res.appendChild(h('button.btn.btn-primary', { type: 'button', style: 'margin-top:10px', onclick: newQuestion }, 'Next question')); } } }, 'Show me')), res));
    }
    var modeSeg = MT.ui.segmented([{ value: 'explore', label: 'Explore' }, { value: 'practice', label: 'Practice questions' }], mode, function (v) { mode = v; showStats(); if (v === 'explore') explore(); else newQuestion(); });
    host.appendChild(card('Bayes trainer: natural frequencies', h('p.muted', 'Pictures of people are easier to reason about than probabilities. Each circle is a person; a heavy outline means they test positive.'),
      h('div.row', modeSeg, statEl), h('div.eb-twocol', { style: 'margin-top:14px' }, h('div', qHost, h('div', { style: 'margin-top:12px' }, expl)), h('div', arrHost)),
      refs(['Gigerenzer G, Hoffrage U. How to improve Bayesian reasoning without instruction: frequency formats. Psychol Rev 1995;102:684.', 'Hoffrage U, Gigerenzer G. Using natural frequencies to improve diagnostic inferences. Acad Med 1998;73:538.', 'Counts are rounded to whole people, so the PPV shown may differ slightly from the exact value.'])));
    showStats(); explore();
  }

  /* ======================================================================
     Tool shell with tab routing
     ====================================================================== */
  function makeTool(id, title, tabs, icon, order, description, keywords) {
    MT.registerTool({
      id: id, title: title, category: 'ebm', icon: icon, order: order, description: description, keywords: keywords,
      render: function (container, ctx) {
        var st = loadState(), active = ctx.params[0], panel = h('div.stack');
        if (!tabs.some(function (t) { return t.id === active; })) active = tabs[0].id;
        var tabBar;
        function show(tid) {
          active = tid; MT.clear(panel);
          try { tabs.filter(function (t) { return t.id === tid; })[0].render(panel, st, { go: go }); } catch (e) { console.error(e); panel.appendChild(MT.ui.alert('danger', 'Something went wrong', String(e && e.message || e))); }
          try { history.replaceState(null, '', '#/' + id + '/' + tid); } catch (e) { /* file:// restrictions */ }
          MT.$$('[role=tab]', tabBar).forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tid)); });
        }
        function go(tid) { show(tid); window.scrollTo(0, 0); }
        tabBar = MT.ui.tabs(tabs.map(function (t) { return { id: t.id, label: t.label }; }), active, function (tid) { show(tid); });
        MT.$$('[role=tab]', tabBar).forEach(function (b, i) { b.dataset.tab = tabs[i].id; });
        container.appendChild(h('div.eb-tabs-wrap', tabBar));
        container.appendChild(panel);
        container.appendChild(MT.ui.disclaimer('For teaching and appraisal practice. Check calculations against the original studies and dedicated statistical software before relying on them.'));
        show(active);
      }
    });
  }

  makeTool('ebm', 'EBM calculator', [
    { id: 'diagnostic', label: 'Diagnostic test', render: tabDiagnostic },
    { id: 'bayes', label: 'Bayes & Fagan', render: tabBayes },
    { id: 'therapy', label: 'Therapy (RR, NNT)', render: tabTherapy },
    { id: 'sample', label: 'Sample size', render: tabSample },
    { id: 'paradox', label: 'Screening paradox', render: tabParadox },
    { id: 'trainer', label: 'Bayes trainer', render: tabTrainer }
  ], '📊', 1, 'Sensitivity, specificity, likelihood ratios, a Fagan nomogram, RR/OR/NNT with confidence intervals, sample size, and a natural-frequency Bayes trainer.',
  ['sensitivity', 'specificity', 'ppv', 'npv', 'likelihood ratio', 'fagan', 'nomogram', 'nnt', 'relative risk', 'odds ratio', 'sample size', 'bayes', 'screening', 'confidence interval', 'evidence based medicine']);

  /* ======================================================================
     Epidemiology calculators
     ====================================================================== */
  function eRates(host, st) {
    var q = st.epi, o1 = h('div', { 'aria-live': 'polite' }), o2 = h('div', { 'aria-live': 'polite' }), o3 = h('div', { 'aria-live': 'polite' });
    function g(o, k, key, label, hint, unit) { return nf(label, o[key], function (v) { if (v != null && v >= 0) { o[key] = v; save(st); upd(); } }, { hint: hint, unit: unit }); }
    var scaleSel = h('select', { 'aria-label': 'Rate multiplier' }, [[1, 'per person-year'], [1000, 'per 1,000 person-years'], [100000, 'per 100,000 person-years']].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    scaleSel.value = String(q.ir.scale); scaleSel.addEventListener('change', function () { q.ir.scale = Number(scaleSel.value); save(st); upd(); });
    function upd() {
      MT.clear(o1); MT.clear(o2); MT.clear(o3);
      var r = E.incidenceRate(q.ir.ev, q.ir.pt, q.ir.scale);
      if (r) o1.appendChild(h('div.result.band-info', h('div.result-label', 'Incidence rate'), h('div.result-value', f(r.rate, r.rate < 1 ? 4 : 2), h('span.unit', 'per ' + (q.ir.scale === 1 ? 'person-year' : q.ir.scale.toLocaleString() + ' person-years'))), h('div.small', '95% CI (exact Poisson, Garwood): ' + f(r.lo, 3) + ' to ' + f(r.hi, 3))));
      else o1.appendChild(MT.ui.alert('warn', 'Person-time must be positive', ''));
      var c = E.wilson(q.ci.cases, q.ci.n);
      if (q.ci.cases <= q.ci.n && q.ci.n > 0) o2.appendChild(h('div.result.band-info', h('div.result-label', 'Cumulative incidence (risk)'), h('div.result-value', pc(c.p, 2)), h('div.small', '95% CI (Wilson): ' + pc(c.lo, 2) + ' to ' + pc(c.hi, 2) + '. Requires a closed cohort free of disease at baseline, followed for the stated period.')));
      else o2.appendChild(MT.ui.alert('warn', 'New cases cannot exceed the number at risk', ''));
      var pv = E.wilson(q.pv.cases, q.pv.n);
      if (q.pv.cases <= q.pv.n && q.pv.n > 0) o3.appendChild(h('div.result.band-info', h('div.result-label', 'Prevalence'), h('div.result-value', pc(pv.p, 2)), h('div.small', '95% CI (Wilson): ' + pc(pv.lo, 2) + ' to ' + pc(pv.hi, 2) + ' · about ' + MT.fmt(pv.p * 1000, 1) + ' per 1,000. Point prevalence ≈ incidence × mean duration when stable.')));
      else o3.appendChild(MT.ui.alert('warn', 'Cases cannot exceed the population', ''));
    }
    host.appendChild(card('Incidence rate', h('p.muted', 'New cases divided by total person-time at risk.'), h('div.grid', { style: '--min:190px;--gap:14px' }, g(q.ir, 'ir', 'ev', 'New cases'), g(q.ir, 'ir', 'pt', 'Person-years at risk'), h('div.field', h('label', 'Express as'), scaleSel)), h('div', { style: 'margin-top:12px' }, o1)));
    host.appendChild(card('Cumulative incidence (risk)', h('p.muted', 'Proportion of an initially disease-free group who develop the disease over a period.'), h('div.grid', { style: '--min:190px;--gap:14px' }, g(q.ci, 'ci', 'cases', 'New cases'), g(q.ci, 'ci', 'n', 'Population at risk at the start')), h('div', { style: 'margin-top:12px' }, o2)));
    host.appendChild(card('Prevalence', h('p.muted', 'Proportion of a population with the disease at a point or during a period.'), h('div.grid', { style: '--min:190px;--gap:14px' }, g(q.pv, 'pv', 'cases', 'Existing cases'), g(q.pv, 'pv', 'n', 'Population examined')), h('div', { style: 'margin-top:12px' }, o3),
      refs(['Rothman KJ, Greenland S, Lash TL. Modern Epidemiology, 3rd ed. 2008, ch. 3.', 'Exact Poisson interval: Garwood F. Biometrika 1936;28:437. Proportions: Wilson score interval (Newcombe 1998).', 'Last JM, ed. A Dictionary of Epidemiology, 6th ed.'])));
    upd();
  }

  function eImpact(host, st) {
    var q = st.epi.imp, out = h('div', { 'aria-live': 'polite' });
    function g(key, label, hint) { return nf(label, q[key], function (v) { if (v != null && v >= 0 && v <= 100) { q[key] = v; save(st); upd(); } }, { unit: '%', hint: hint }); }
    function upd() {
      MT.clear(out);
      var re = q.re / 100, ro = q.ro / 100, pe = q.pe / 100;
      if (!(ro > 0)) { out.appendChild(MT.ui.alert('warn', 'Unexposed risk must be above zero', 'The relative risk is undefined when the risk in the unexposed is 0.')); return; }
      var ar = E.attributableRisk(re, ro), paf = E.pafLevin(pe, ar.rr), ip = pe * re + (1 - pe) * ro, paf2 = E.pafFromIncidence(ip, ro);
      out.appendChild(h('div.eb-grid',
        stat('Relative risk', f(ar.rr, 2), '', 'Re / Ro'),
        stat('Attributable risk (risk difference)', pc(ar.ar, 2), '', 'Re − Ro'),
        stat('Attributable fraction in exposed (AF%)', pc(ar.arPercent, 1), '', '(RR − 1) / RR'),
        stat('Risk in whole population', pc(ip, 2), '', 'pe·Re + (1 − pe)·Ro'),
        stat('Population attributable fraction', pc(paf, 1), '', 'Levin: pe(RR−1) / (1 + pe(RR−1))'),
        stat('Number needed to expose to harm', f(ar.nne, 0), '', '1 / |AR|')));
      var msg = ar.ar >= 0
        ? 'If the association is causal, ' + pc(ar.arPercent, 0) + ' of disease among the exposed and ' + pc(paf, 1) + ' of all disease in this population would be prevented by removing the exposure.'
        : 'The exposure is protective (RR < 1), so the attributable fraction is negative; interpret it as a preventable fraction (' + pc(-ar.ar / ro * 1, 1) + ' lower risk).';
      out.appendChild(h('p', { style: 'margin-top:10px' }, msg));
      out.appendChild(h('p.small', 'Check: PAF from incidence ' + pc(paf2, 1) + ' = (Ip − Io) / Ip. These assume causality, no confounding, and that removing the exposure would leave other risks unchanged. Multiple causes mean attributable fractions can add to more than 100%.'));
    }
    host.appendChild(card('Attributable risk and population attributable fraction', h('p.muted', 'Enter the risk (cumulative incidence) in exposed and unexposed people, and how common the exposure is in the population.'),
      h('div.grid', { style: '--min:190px;--gap:14px' }, g('re', 'Risk in exposed', 'Over the same period, e.g. 15%'), g('ro', 'Risk in unexposed', 'e.g. 5%'), g('pe', 'Prevalence of exposure in population', 'e.g. 25% smoke')), h('div', { style: 'margin-top:12px' }, out),
      refs(['Levin ML. The occurrence of lung cancer in man. Acta Un Int Cancer 1953;9:531.', 'Miettinen OS. Proportion of disease caused or prevented by a given exposure. Am J Epidemiol 1974;99:325.', 'Rockhill B, Newman B, Weinberg C. Use and misuse of population attributable fractions. Am J Public Health 1998;88:15.'])));
    upd();
  }

  function eSmr(host, st) {
    var q = st.epi.smr, out = h('div', { 'aria-live': 'polite' });
    var sel = h('select', { 'aria-label': 'Confidence interval method' }, h('option', { value: 'exact' }, 'Exact Poisson (Garwood)'), h('option', { value: 'byar' }, 'Byar approximation'));
    sel.value = q.m; sel.addEventListener('change', function () { q.m = sel.value; save(st); upd(); });
    function upd() {
      MT.clear(out); var r = E.smr(q.o, q.e, q.m);
      if (!r) { out.appendChild(MT.ui.alert('warn', 'Expected deaths must be above zero', '')); return; }
      var sig = r.lo > 1 ? 'higher' : r.hi < 1 ? 'lower' : null;
      out.appendChild(h('div.result.band-info', h('div.result-label', 'SMR (observed / expected)'), h('div.result-value', f(r.smr, 2)), h('div.small', '95% CI (' + (q.m === 'byar' ? 'Byar' : 'exact Poisson') + '): ' + f(r.lo, 2) + ' to ' + f(r.hi, 2) + ' · SMR ×100 = ' + f(r.smr * 100, 0))));
      out.appendChild(h('p', { style: 'margin-top:10px' }, sig ? 'The interval excludes 1: the observed number is statistically ' + sig + ' than expected from the reference rates.' : 'The interval includes 1: the observed number is compatible with the expected number.'));
    }
    host.appendChild(card('Standardised mortality (or morbidity) ratio', h('p.muted', 'Observed events in a study group divided by the number expected if the group had the age-specific rates of a standard population (indirect standardisation).'),
      h('div.grid', { style: '--min:190px;--gap:14px' }, nf('Observed events (O)', q.o, function (v) { if (v != null && v >= 0) { q.o = Math.round(v); save(st); upd(); } }), nf('Expected events (E)', q.e, function (v) { if (v != null && v > 0) { q.e = v; save(st); upd(); } }, { hint: 'Σ (age-specific standard rate × study person-years)' }), h('div.field', h('label', 'Interval method'), sel)),
      h('div', { style: 'margin-top:12px' }, out),
      refs(['Exact: Garwood 1936 (Poisson). Byar: Breslow NE, Day NE. Statistical Methods in Cancer Research, vol II (1987), p. 69.', 'SMRs from different populations are not directly comparable with each other because each uses its own weights.'])));
    upd();
  }

  function eAsr(host, st) {
    var q = st.epi.asr, tableHost = h('div'), out = h('div', { 'aria-live': 'polite' });
    var scaleSel = h('select', { 'aria-label': 'Rate multiplier' }, [[1000, 'per 1,000'], [100000, 'per 100,000']].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    scaleSel.value = String(q.scale); scaleSel.addEventListener('change', function () { q.scale = Number(scaleSel.value); save(st); upd(); });
    function cellInput(row, key, label, width, numeric) {
      var i = h('input.eb-in', { type: 'text', inputmode: numeric ? 'decimal' : 'text', 'aria-label': label, value: String(row[key]), autocomplete: 'off', style: 'min-width:' + width + 'px;width:100%' });
      i.addEventListener('input', function () { row[key] = numeric ? (MT.num(i.value) != null ? MT.num(i.value) : 0) : i.value; save(st); upd(); }); return i;
    }
    function draw() {
      MT.clear(tableHost);
      var body = q.rows.map(function (r, idx) {
        return h('tr', h('td', cellInput(r, 'a', 'Age group ' + (idx + 1), 70)), h('td', cellInput(r, 'w', 'Standard population weight, ' + r.a, 80, true)), h('td', cellInput(r, 'c', 'Cases, ' + r.a, 70, true)), h('td', cellInput(r, 'py', 'Person-years, ' + r.a, 90, true)),
          h('td', h('button.btn.btn-ghost.btn-sm', { type: 'button', 'aria-label': 'Remove age group ' + r.a, onclick: function () { if (q.rows.length > 1) { q.rows.splice(idx, 1); save(st); draw(); upd(); } } }, '✕')));
      });
      tableHost.appendChild(h('div.table-wrap', h('table.table', h('caption.sr-only', 'Age-specific cases and person-years with standard population weights'),
        h('thead', h('tr', h('th', 'Age group'), h('th', 'Standard weight'), h('th', 'Cases'), h('th', 'Person-years'), h('th', h('span.sr-only', 'Remove')))), h('tbody', body))));
    }
    function upd() {
      MT.clear(out);
      var r = E.directStandardise(q.rows.map(function (x) { return { cases: x.c, py: x.py, weight: x.w }; }), q.scale);
      if (!r) { out.appendChild(MT.ui.alert('warn', 'Check the table', 'Every age group needs positive person-years and the standard weights must sum to more than zero.')); return; }
      out.appendChild(h('div.eb-grid', stat('Crude rate', f(r.crude, 1), '', 'All ages combined'), stat('Age-standardised rate', f(r.asr, 1), '(' + f(r.lo, 1) + ' to ' + f(r.hi, 1) + ')', 'Direct method, 95% CI'), stat('Total cases', String(r.cases)), stat('Total person-years', r.py.toLocaleString())));
      out.appendChild(h('p.small', { style: 'margin-top:10px' }, 'ASR = Σ wᵢ·rᵢ with wᵢ the standard-population proportions; variance Σ wᵢ² dᵢ / yᵢ² (normal-approximation CI, which is unreliable when many age groups have fewer than about 5 cases; use gamma-based methods in that case). A difference between crude and standardised rates reflects differing age structure.'));
    }
    var addB = h('button.btn.btn-soft.btn-sm', { type: 'button', onclick: function () { q.rows.push({ a: 'New', w: 10, c: 0, py: 10000 }); save(st); draw(); upd(); } }, '+ Add age group');
    var resetB = h('button.btn.btn-sm', { type: 'button', onclick: function () { var d = loadDefaultAsr(); q.rows = d; save(st); draw(); upd(); } }, 'Load example');
    host.appendChild(card('Direct age-standardisation', h('p.muted', 'Apply your age-specific rates to a standard population so that groups with different age structures can be compared. Edit the table; the example data are illustrative.'),
      h('div.row', h('div.field', { style: 'min-width:170px' }, h('label', 'Express rate'), scaleSel), addB, resetB), h('div', { style: 'margin-top:10px' }, tableHost), h('div', { style: 'margin-top:12px' }, out),
      refs(['Standard-population weights in the example are approximate groupings of the WHO World Standard Population 2000–2025 (Ahmad OB et al., WHO GPE Discussion Paper 31, 2001); check against the published weights before use. Any standard (Segi, European 2013, national census) can be pasted in.', 'Method: Armitage P, Berry G. Statistical Methods in Medical Research; Dobson AJ et al. Stat Med 1991;10:457 (gamma-based intervals for small counts).'])));
    draw(); upd();
  }
  function loadDefaultAsr() { return [{ a: '0–14', w: 26.15, c: 2, py: 150000 }, { a: '15–24', w: 16.69, c: 3, py: 100000 }, { a: '25–44', w: 29.28, c: 20, py: 210000 }, { a: '45–64', w: 19.68, c: 95, py: 170000 }, { a: '65+', w: 8.2, c: 180, py: 60000 }]; }

  function eVax(host, st) {
    var q = st.epi.vax, o1 = h('div', { 'aria-live': 'polite' }), o2 = h('div', { 'aria-live': 'polite' });
    var diseases = [['Measles', '12–18'], ['Pertussis (whooping cough)', '12–17'], ['Mumps', '4–7'], ['Rubella', '5–7'], ['Polio', '5–7'], ['Smallpox (eradicated)', '3.5–6'], ['Diphtheria', '6–7'], ['Seasonal influenza', '1.2–1.4'], ['COVID-19 (ancestral strain)', '2–3']];
    function upd() {
      MT.clear(o1); MT.clear(o2);
      var hit = E.herdImmunityThreshold(q.r0), cc = E.criticalCoverage(q.r0, 0.95);
      o1.appendChild(h('div.result.band-info', h('div.result-label', 'Herd-immunity threshold'), h('div.result-value', pc(hit, 1)), h('div.small', '1 − 1/R₀ = 1 − 1/' + f(q.r0, 1) + '. With a vaccine of 95% efficacy, coverage needed ≈ ' + pc(cc, 1) + (cc > 1 ? ' (not attainable: herd immunity cannot be reached by vaccination alone)' : '') + '.')));
      var v = (q.cv <= q.nv && q.cu <= q.nu && q.nv > 0 && q.nu > 0) ? E.vaccineEfficacy(q.cv, q.nv, q.cu, q.nu) : null;
      if (!v) { o2.appendChild(MT.ui.alert('warn', 'Check the cohort numbers', 'Cases cannot exceed group sizes.')); return; }
      var cover = hitCover(q.r0, v.ve);
      o2.appendChild(h('div.eb-grid',
        stat('Attack rate, vaccinated', pc(q.cv / q.nv, 2)), stat('Attack rate, unvaccinated', pc(q.cu / q.nu, 2)), stat('Relative risk', f(v.rr.v, 3), '(' + f(v.rr.lo, 3) + ' to ' + f(v.rr.hi, 3) + ')'),
        stat('Vaccine efficacy', pc(v.ve, 1), '(' + pc(v.lo, 1) + ' to ' + pc(v.hi, 1) + ')', 'VE = 1 − RR'),
        stat('Coverage needed for herd immunity', cover === null ? 'n/a' : cover > 1 ? '> 100%' : pc(cover, 1), '', 'Using this VE and the R₀ above')));
      o2.appendChild(h('p.small', { style: 'margin-top:8px' }, 'VE from a randomised trial or cohort with comparable follow-up. Observational designs (e.g. test-negative, screening method) need adjustment for confounding. Vaccine efficacy is under trial conditions; effectiveness is in routine use.'));
    }
    function hitCover(r0, ve) { return ve > 0 ? E.criticalCoverage(r0, ve) : null; }
    var rf = nf('Basic reproduction number R₀', q.r0, function (v) { if (v != null && v >= 0.1 && v <= 50) { q.r0 = v; save(st); upd(); } }, { hint: 'Average secondary cases in a fully susceptible population' });
    function g(key, label) { return nf(label, q[key], function (v) { if (v != null && v >= 0) { q[key] = Math.round(v); save(st); upd(); } }); }
    host.appendChild(card('Herd immunity and vaccine efficacy',
      h('div.grid', { style: '--min:200px;--gap:14px' }, rf), h('div', { style: 'margin-top:10px' }, o1),
      h('h3', { style: 'font-size:1rem;margin:16px 0 8px' }, 'Vaccine efficacy from attack rates'),
      h('div.grid', { style: '--min:180px;--gap:14px' }, g('cv', 'Cases among vaccinated'), g('nv', 'Total vaccinated'), g('cu', 'Cases among unvaccinated'), g('nu', 'Total unvaccinated')),
      h('div', { style: 'margin-top:10px' }, o2),
      h('details.disclosure', { style: 'margin-top:14px' }, h('summary', 'Typical R₀ values (approximate, setting-dependent)'), h('div.disclosure-body', h('div.table-wrap', h('table.table', h('thead', h('tr', h('th', 'Disease'), h('th', 'Typical R₀'), h('th', 'Herd-immunity threshold'))),
        h('tbody', diseases.map(function (d) { var lo = parseFloat(d[1]), hi = parseFloat(d[1].split('–')[1]); return h('tr', h('td', d[0]), h('td', d[1]), h('td', pc(E.herdImmunityThreshold(lo), 0) + '–' + pc(E.herdImmunityThreshold(hi), 0))); })))),
        h('p.small', 'Ranges are indicative only: R₀ varies by population density, contact patterns and strain. Sources: Guerra FM et al., Lancet Infect Dis 2017;17:e420 (measles); Anderson & May, Infectious Diseases of Humans 1991; Fine P et al., Clin Infect Dis 2011;52:911 (herd immunity). COVID-19 and influenza values changed with variants and prior immunity.'))),
      refs(['Herd-immunity threshold = 1 − 1/R₀ assumes homogeneous mixing and a perfect, all-or-nothing vaccine; heterogeneity and waning change the real target.', 'VE = (ARU − ARV)/ARU = 1 − RR (Orenstein WA et al., Bull WHO 1985;63:1055). CI from the Katz log method for RR.'])));
    upd();
  }

  function eGrowth(host, st) {
    var q = st.epi.gr, o1 = h('div', { 'aria-live': 'polite' }), o2 = h('div', { 'aria-live': 'polite' });
    function upd() {
      MT.clear(o1); MT.clear(o2);
      var d = E.doublingTime(q.n1, q.n2, q.dt);
      if (!d) o1.appendChild(MT.ui.alert('warn', 'Enter positive counts and a positive time interval', ''));
      else o1.appendChild(h('div.result.band-info', h('div.result-label', d.kind === 'halving' ? 'Halving time' : d.kind === 'flat' ? 'No growth' : 'Doubling time'), h('div.result-value', d.time === Infinity ? '∞' : f(d.time, 2), h('span.unit', 'time units')),
        h('div.small', 'Growth rate r = ln(N₂/N₁)/Δt = ' + f(d.r, 4) + ' per time unit (' + MT.fmt(d.pctPerUnit * 100, 1, { sign: true }) + '% per time unit). Doubling time = ln 2 / r.')));
      var t2 = E.doublingFromPercent(q.pct / 100);
      o2.appendChild(h('div.result.band-info', h('div.result-label', 'Doubling time at ' + q.pct + '% growth per time unit'), h('div.result-value', t2 === Infinity ? '∞' : f(t2, 2), h('span.unit', 'time units')), h('div.small', 'Exact: ln 2 / ln(1 + g). The “rule of 70” gives ' + f(70 / q.pct, 2) + '.')));
    }
    function g(key, label, hint, unit, min) { return nf(label, q[key], function (v) { if (v != null && v > (min || 0)) { q[key] = v; save(st); upd(); } }, { hint: hint, unit: unit }); }
    host.appendChild(card('Doubling time', h('p.muted', 'For exponential growth (epidemic early phase, bacterial growth, tumour volume). Use the same time unit throughout (days, hours, …).'),
      h('div.grid', { style: '--min:180px;--gap:14px' }, g('n1', 'Count at start', 'Cases, cells, volume'), g('n2', 'Count at end'), g('dt', 'Time elapsed', 'Between the two counts')), h('div', { style: 'margin-top:12px' }, o1),
      h('h3', { style: 'font-size:1rem;margin:16px 0 8px' }, 'From a percentage growth rate'), h('div.grid', { style: '--min:180px;--gap:14px' }, g('pct', 'Growth per time unit', 'e.g. 10% per day', '%', -99)), h('div', { style: 'margin-top:12px' }, o2),
      refs(['Doubling time = ln 2 / r; r = ln(N₂/N₁)/(t₂ − t₁). Valid only while growth is exponential (not saturating).', 'Wallinga J, Lipsitch M. How generation intervals shape the relationship between growth rates and reproductive numbers. Proc R Soc B 2007;274:599.'])));
    upd();
  }

  makeTool('epi', 'Epidemiology calculators', [
    { id: 'rates', label: 'Rates & risk', render: eRates },
    { id: 'impact', label: 'AR & PAF', render: eImpact },
    { id: 'smr', label: 'SMR', render: eSmr },
    { id: 'asr', label: 'Age-standardisation', render: eAsr },
    { id: 'vaccine', label: 'Herd immunity & VE', render: eVax },
    { id: 'growth', label: 'Doubling time', render: eGrowth }
  ], '🧪', 2, 'Incidence, prevalence, attributable risk and PAF, SMR with exact CI, direct age-standardisation, herd-immunity threshold, vaccine efficacy and doubling time.',
  ['incidence', 'prevalence', 'attributable risk', 'paf', 'smr', 'standardised mortality ratio', 'age standardisation', 'herd immunity', 'r0', 'vaccine efficacy', 'doubling time', 'epidemiology']);
})();

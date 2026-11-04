/* Open Medical Toolkit — S4 · ECG Lab (Medical Student Studio)
 * Tools
 *   ecg-lab         any diagnosis or rhythm on true ECG paper (25 mm/s, 10 mm/mV, 1 mV calibration pulse) with zoom,
 *                   calipers, teaching labels, key features and criteria, measurements and generator fine-tuning
 *   ecg-quiz        random case → multiple-choice diagnosis → systematic feedback; score, streak and difficulty levels
 *   ecg-systematic  step-by-step interpretation tutor: rate, rhythm, axis, intervals/QTc, hypertrophy, ischaemia, BBB
 * Every tracing is synthesised on the device by MTLib.ecg (student/lib/ecg.js), which documents the model and sources.
 * Paper standard: Kligfield P et al. Circulation 2007;115:1306 (25 mm/s, 10 mm/mV).
 */
(function () {
  'use strict';
  var E = self.MTLib && self.MTLib.ecg;
  if (!self.MT || !E) return;
  var h = MT.h, S = MT.s;
  var SPEED = 25, GAIN = 10;                       // mm/s and mm/mV
  var TRUE_SIZE = 96 / 25.4;                       // CSS px per mm ("paper size")
  var ZOOMS = [1.2, 1.6, 2, 2.4, 3, 3.78, 4.5, 5.5, 7];
  var KEYS = { view: 'student.ecg.view', lab: 'student.ecg.lab', quiz: 'student.ecg.quiz', sys: 'student.ecg.systematic' };
  var LEVELS = [{ value: 1, label: 'Beginner' }, { value: 2, label: 'Intermediate' }, { value: 3, label: 'Advanced' }];

  MT.css('ecg', [
    '.ecg-frame{--ecg-paper:color-mix(in srgb,var(--danger) 5%,var(--surface));--ecg-minor:color-mix(in srgb,var(--danger) 24%,var(--surface));--ecg-major:color-mix(in srgb,var(--danger) 52%,var(--surface));--ecg-trace:var(--text);--ecg-ink:var(--text-2);position:relative;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;background:var(--ecg-paper);border:1px solid var(--border);border-radius:var(--radius-sm);max-width:100%}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .ecg-frame{--ecg-paper:color-mix(in srgb,var(--danger) 6%,var(--surface));--ecg-minor:color-mix(in srgb,var(--danger) 17%,var(--surface));--ecg-major:color-mix(in srgb,var(--danger) 36%,var(--surface))}}',
    ':root[data-theme="dark"] .ecg-frame{--ecg-paper:color-mix(in srgb,var(--danger) 6%,var(--surface));--ecg-minor:color-mix(in srgb,var(--danger) 17%,var(--surface));--ecg-major:color-mix(in srgb,var(--danger) 36%,var(--surface))}',
    '.ecg-frame:focus-visible{box-shadow:var(--focus);outline:none}',
    '.ecg-frame svg{display:block;max-width:none;touch-action:pan-x pan-y;-webkit-user-select:none;user-select:none}',
    '.ecg-frame.ecg-cal-on svg{cursor:crosshair}',
    '.ecg-paper{fill:var(--ecg-paper)}',
    '.ecg-minor,.ecg-major,.ecg-trace,.ecg-pulse,.ecg-sep,.ecg-hl,.ecg-cal-line,.ecg-cal-bar,.ecg-cal-march,.ecg-guide{vector-effect:non-scaling-stroke}',
    '.ecg-minor{stroke:var(--ecg-minor);stroke-width:.6px;fill:none}',
    '.ecg-major{stroke:var(--ecg-major);stroke-width:1.05px;fill:none}',
    '.ecg-trace{stroke:var(--ecg-trace);stroke-width:1.35px;fill:none;stroke-linejoin:round;stroke-linecap:round}',
    '.ecg-pulse{stroke:var(--ecg-trace);stroke-width:1.2px;fill:none}',
    '.ecg-sep{stroke:var(--ecg-trace);stroke-width:1.2px}',
    '.ecg-label{fill:var(--ecg-ink);font-family:var(--font);font-weight:700;paint-order:stroke;stroke:var(--ecg-paper);stroke-width:1.1px;stroke-linejoin:round}',
    '.ecg-note{fill:var(--ecg-ink);font-family:var(--font);font-weight:600}',
    '.ecg-ann{font-family:var(--font);font-weight:800;paint-order:stroke;stroke:var(--ecg-paper);stroke-width:.8px;stroke-linejoin:round}',
    '.ecg-ann-p{fill:var(--info)}.ecg-ann-x{fill:var(--danger)}.ecg-ann-v{fill:var(--warn)}.ecg-ann-rr{fill:var(--muted);font-weight:700}',
    '.ecg-hl{fill:none;stroke-width:2px}.ecg-hl-elev{stroke:var(--danger)}.ecg-hl-recip{stroke:var(--info);stroke-dasharray:6 4}.ecg-hl-primary{stroke:var(--accent)}',
    '.ecg-hl-tag{font-family:var(--font);font-weight:800;paint-order:stroke;stroke:var(--ecg-paper);stroke-width:.8px}',
    '.ecg-tag-elev{fill:var(--danger)}.ecg-tag-recip{fill:var(--info)}.ecg-tag-primary{fill:var(--accent-text)}',
    '.ecg-guide{stroke:var(--accent);stroke-width:1.2px;stroke-dasharray:4 3;fill:none}',
    '.ecg-guide-text{fill:var(--accent-text);font-family:var(--font);font-weight:800;paint-order:stroke;stroke:var(--ecg-paper);stroke-width:.8px}',
    '.ecg-bracket{stroke:var(--accent);stroke-width:1.5px;fill:none;vector-effect:non-scaling-stroke}',
    '.ecg-cal-line{stroke:var(--accent);stroke-width:1.4px}.ecg-cal-bar{stroke:var(--accent);stroke-width:1.6px}',
    '.ecg-cal-march{stroke:var(--accent);stroke-width:1px;stroke-dasharray:3 3;opacity:.75}',
    '.ecg-handle{fill:var(--accent);stroke:var(--surface);stroke-width:.5}',
    '.ecg-handle-hit{fill:transparent}',
    '.ecg-handle-g{cursor:ew-resize;touch-action:none}.ecg-handle-g:focus{outline:none}.ecg-handle-g:focus .ecg-handle{stroke:var(--text);stroke-width:.8}',
    '.ecg-cal-text{fill:var(--accent-text);font-family:var(--font);font-weight:800;paint-order:stroke;stroke:var(--ecg-paper);stroke-width:1.2px;stroke-linejoin:round}',
    '.ecg-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}',
    '.ecg-bar .btn[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent-text);border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}',
    '.ecg-zoomval{min-width:3.4em;text-align:center;font-size:.85rem;color:var(--muted);font-variant-numeric:tabular-nums}',
    '.ecg-readout{min-height:1.5em;font-size:.92rem;margin-top:6px;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.ecg-readout strong{color:var(--accent-text)}',
    '.ecg-meta{font-size:.8rem;color:var(--muted);margin-top:4px}',
    '.ecg-grid{display:grid;gap:1rem;grid-template-columns:minmax(0,1fr)}',
    '@media (min-width:980px){.ecg-grid{grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);align-items:start}}',
    '.ecg-list{margin:0 0 .7em;padding-left:1.2em}.ecg-list li+li{margin-top:.3em}',
    '.ecg-kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px;font-size:.92rem;margin:0}',
    '.ecg-kv dt{color:var(--muted);font-weight:600}.ecg-kv dd{margin:0;font-variant-numeric:tabular-nums}',
    '.ecg-refs{font-size:.8rem;color:var(--muted);padding-left:1.4em;margin:0}',
    '.ecg-pick{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}',
    '.ecg-pick .field{flex:1 1 240px}',
    '.ecg-controls{display:grid;gap:12px 20px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}',
    '.ecg-slider label{display:flex;justify-content:space-between;gap:8px;font-weight:600;font-size:.9rem}',
    '.ecg-slider output{font-variant-numeric:tabular-nums;color:var(--accent-text);font-weight:700;white-space:nowrap}',
    '.ecg-slider input:disabled{opacity:.45}',
    '.ecg-opts{display:grid;gap:8px;grid-template-columns:minmax(0,1fr)}',
    '@media (min-width:640px){.ecg-opts{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.ecg-opt{justify-content:flex-start;text-align:left;white-space:normal;min-height:48px;padding:8px 12px;line-height:1.3}',
    '.ecg-opt .ecg-k{display:inline-grid;place-items:center;width:1.7em;height:1.7em;border-radius:6px;background:var(--surface-2);font-size:.8rem;color:var(--muted);flex:none}',
    '.ecg-opt.ecg-right{border-color:var(--ok-border);background:var(--ok-soft);color:var(--text)}',
    '.ecg-opt.ecg-wrong{border-color:var(--danger-border);background:var(--danger-soft);color:var(--text)}',
    '.ecg-opt:disabled{opacity:1;cursor:default}',
    '.ecg-stats{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center}',
    '.ecg-walk{list-style:none;padding:0;margin:0}',
    '.ecg-walk>li{display:grid;grid-template-columns:7.2em minmax(0,1fr);gap:10px;padding:9px 0;border-bottom:1px solid var(--border);margin:0}',
    '.ecg-walk>li:last-child{border-bottom:0}',
    '.ecg-walk .ecg-step{font-weight:800;color:var(--accent-text)}',
    '@media (max-width:560px){.ecg-walk>li{grid-template-columns:minmax(0,1fr);gap:2px}}',
    '.ecg-yn{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;padding:8px 0;border-bottom:1px solid var(--border)}',
    '.ecg-yn:last-child{border-bottom:0}.ecg-yn .ecg-q{flex:1 1 220px}',
    '.ecg-mark{font-weight:800}.ecg-mark-ok{color:var(--ok)}.ecg-mark-bad{color:var(--danger)}',
    '.ecg-hex{width:100%;max-width:320px;height:auto;display:block;margin:0 auto;touch-action:none;cursor:pointer}',
    '.ecg-hex text{font-family:var(--font);font-weight:700;fill:var(--text-2)}',
    '.ecg-hex .ecg-hex-axis{stroke:var(--border-strong);stroke-width:1.2}',
    '.ecg-hex .ecg-hex-arrow{stroke:var(--accent);stroke-width:4;stroke-linecap:round}',
    '.ecg-q-normal{fill:var(--ok-soft)}.ecg-q-left{fill:var(--warn-soft)}.ecg-q-right{fill:var(--info-soft)}.ecg-q-extreme{fill:var(--danger-soft)}',
    '.ecg-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.84rem;color:var(--text-2);margin-top:6px}',
    '.ecg-sw{display:inline-block;width:18px;height:0;border-top:2px solid;vertical-align:middle;margin-right:6px}',
    '.ecg-sw-elev{border-color:var(--danger)}.ecg-sw-recip{border-color:var(--info);border-top-style:dashed}.ecg-sw-primary{border-color:var(--accent)}',
    '.ecg-nav{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.ecg-small-table td,.ecg-small-table th{padding:7px 10px}',
    '.ecg-pos{color:var(--danger);font-weight:700}.ecg-neg{color:var(--ok);font-weight:700}'
  ].join('\n'));

  /* ====================================================================== small helpers */
  function load(key, fallback) { var v = MT.store.get(key, null); return v && typeof v === 'object' && v.v === 1 ? v : fallback; }
  function save(key, obj) { obj.v = 1; MT.store.set(key, obj); }
  function newSeed() { return 1 + Math.floor(Math.random() * 2147483000); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function deg(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x) + '°'; }
  function mm(mv) { return MT.fmt(mv * GAIN, 1); }
  function ul(items, cls) { return h('ul.' + (cls || 'ecg-list'), items.map(function (t) { return h('li', t); })); }
  function groupTitle(id) { var g = E.GROUPS.filter(function (x) { return x.id === id; })[0]; return g ? g.title : id; }
  function tierLabel(t) { return t === 1 ? 'Beginner' : t === 2 ? 'Intermediate' : 'Advanced'; }
  function refList(keys) { return h('ol.ecg-refs', keys.map(function (k) { return h('li', E.REFS[k] || k); })); }
  function slug(id) { return encodeURIComponent(id); }

  /* ====================================================================== ECG paper renderer */
  /**
   * Layout in millimetres. spec: 'standard' (3×4 + lead II rhythm strip), {strip:true, lead, dur, rowH}
   * or {rows: [[{lead, t0, t1, gap}]], rowH}.
   */
  function buildLayout(spec) {
    var rows, rowH;
    if (!spec || spec === 'standard') {
      rows = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']].map(function (r) {
        return r.map(function (l, i) { return { lead: l, t0: i * 2.5, t1: (i + 1) * 2.5 }; });
      });
      rows.push([{ lead: 'II', t0: 0, t1: 10, strip: true }]);
      rowH = 37.5;
    } else if (spec.strip) {
      rows = [[{ lead: spec.lead || 'II', t0: spec.t0 || 0, t1: (spec.t0 || 0) + (spec.dur || 10), strip: true }]];
      rowH = spec.rowH || 40;
    } else { rows = spec.rows; rowH = spec.rowH || 32; }
    var X0 = 11, top = 2, panels = [], maxW = 0, baselines = [];
    rows.forEach(function (r, ri) {
      var y = top + rowH * (ri + 0.56), x = X0;
      baselines.push(y);
      r.forEach(function (pn, ci) {
        var w = (pn.t1 - pn.t0) * SPEED;
        panels.push({ lead: pn.lead, t0: pn.t0, t1: pn.t1, x: x, y: y, w: w, row: ri, col: ci, strip: !!pn.strip, label: pn.label });
        x += w + (pn.gap || 0);
      });
      maxW = Math.max(maxW, x - X0);
    });
    return { panels: panels, rowH: rowH, w: Math.ceil((X0 + maxW + 4) / 5) * 5, h: Math.ceil((top + rowH * rows.length + 1) / 5) * 5, x0: X0, baselines: baselines };
  }

  /** Douglas–Peucker simplification of one trace (tolerance in mm) → SVG path data. */
  function tracePath(xs, ys, tol) {
    var n = xs.length; if (!n) return '';
    var keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
    var stack = [0, n - 1];
    while (stack.length) {
      var b = stack.pop(), a = stack.pop();
      if (b - a < 2) continue;
      var dx = xs[b] - xs[a], dy = ys[b] - ys[a], len = Math.sqrt(dx * dx + dy * dy) || 1e-9, md = 0, idx = -1;
      for (var i = a + 1; i < b; i++) { var d = Math.abs(dy * (xs[i] - xs[a]) - dx * (ys[i] - ys[a])) / len; if (d > md) { md = d; idx = i; } }
      if (md > tol) { keep[idx] = 1; stack.push(a, idx, idx, b); }
    }
    var out = [], first = true;
    for (var j = 0; j < n; j++) if (keep[j]) { out.push((first ? 'M' : 'L') + xs[j].toFixed(2) + ' ' + ys[j].toFixed(2)); first = false; }
    return out.join('');
  }

  /**
   * Interactive ECG view: paper, traces, calibration pulses, labels, highlights, overlays and calipers.
   * opts: { layout, ariaLabel, allowLabels (default true), labels, highlight, minMobileZoom }
   * Returns { el, update(ecg, extra), setHighlight(hl), setLabels(on), setOverlay(fn), destroy() }.
   */
  function EcgView(opts) {
    opts = opts || {};
    var prefs = load(KEYS.view, { v: 1, zoom: 'fit', labels: false });
    var st = { ecg: null, zoom: prefs.zoom === 'fit' || ZOOMS.indexOf(prefs.zoom) >= 0 ? prefs.zoom : 'fit', labels: opts.labels != null ? !!opts.labels : !!prefs.labels, cal: false, march: false, legs: [null, null], hl: opts.highlight || null, overlay: null };
    var L = buildLayout(opts.layout);
    var frame = h('div.ecg-frame', { tabindex: '0', role: 'group', 'aria-label': (opts.ariaLabel || 'ECG tracing') + '. Scroll sideways to see the whole tracing.' });
    var readout = h('div.ecg-readout', { 'aria-live': 'polite' });
    var zoomVal = h('span.ecg-zoomval', { 'aria-live': 'polite' });
    var svg = null, calG = null, drag = null, down = null, resizeT = null;

    function btn(label, title, onClick, pressed) {
      var b = h('button.btn.btn-sm', { type: 'button', title: title, 'aria-label': title, onclick: onClick }, label);
      if (pressed != null) b.setAttribute('aria-pressed', String(!!pressed));
      return b;
    }
    var calBtn = btn('📏 Calipers', 'Calipers: tap two points to measure an interval', function () { setCal(!st.cal); }, false);
    var marchBtn = btn('⋯ March', 'March the caliper interval across the tracing to check regularity', function () { st.march = !st.march; marchBtn.setAttribute('aria-pressed', String(st.march)); drawCal(); }, false);
    var clearBtn = btn('Clear', 'Remove the calipers', function () { st.legs = [null, null]; drawCal(); readoutText(); });
    var labelBtn = opts.allowLabels === false ? null : btn('🏷 Labels', 'Show teaching labels: P waves, blocked P waves, R–R intervals, highlighted leads', function () { setLabels(!st.labels); }, st.labels);
    marchBtn.hidden = true; clearBtn.hidden = true;
    var bar = h('div.ecg-bar',
      h('div.btn-group', { role: 'group', 'aria-label': 'Zoom' },
        btn('−', 'Zoom out', function () { stepZoom(-1); }), zoomVal, btn('+', 'Zoom in', function () { stepZoom(1); }),
        btn('Fit', 'Fit the tracing to the screen width', function () { setZoom('fit'); }),
        btn('1:1', 'Paper size (25 mm/s at 96 dpi)', function () { setZoom(TRUE_SIZE); })),
      calBtn, marchBtn, clearBtn, labelBtn);
    var el = h('div.ecg-view', bar, frame, readout);

    function currentPx() {
      if (st.zoom !== 'fit') return st.zoom;
      var cw = frame.clientWidth || (el.parentNode && el.parentNode.clientWidth) || Math.min(980, (self.innerWidth || 1000) - 32);
      var fit = (cw - 2) / L.w;
      return cw < 640 ? Math.max(fit, opts.minMobileZoom || 2.4) : fit;
    }
    function applyZoom() {
      if (!svg) return;
      var z = currentPx(), cx = frame.scrollWidth ? (frame.scrollLeft + frame.clientWidth / 2) / frame.scrollWidth : 0;
      svg.setAttribute('width', String(Math.round(L.w * z)));
      svg.setAttribute('height', String(Math.round(L.h * z)));
      zoomVal.textContent = Math.round(z / TRUE_SIZE * 100) + '%';
      if (cx) frame.scrollLeft = Math.max(0, cx * frame.scrollWidth - frame.clientWidth / 2);
    }
    function setZoom(z) { st.zoom = z; prefs.zoom = z; save(KEYS.view, prefs); applyZoom(); }
    function stepZoom(dir) {
      var z = currentPx(), i;
      if (dir > 0) { for (i = 0; i < ZOOMS.length && ZOOMS[i] <= z + 0.01; i++); setZoom(ZOOMS[Math.min(i, ZOOMS.length - 1)]); }
      else { for (i = ZOOMS.length - 1; i >= 0 && ZOOMS[i] >= z - 0.01; i--); setZoom(ZOOMS[Math.max(i, 0)]); }
    }
    function setLabels(on) { st.labels = !!on; if (labelBtn) labelBtn.setAttribute('aria-pressed', String(st.labels)); if (opts.allowLabels !== false) { prefs.labels = st.labels; save(KEYS.view, prefs); } draw(); }
    function setCal(on) {
      st.cal = !!on; calBtn.setAttribute('aria-pressed', String(st.cal));
      frame.classList.toggle('ecg-cal-on', st.cal); marchBtn.hidden = !st.cal; clearBtn.hidden = !st.cal;
      if (!st.cal) { st.legs = [null, null]; st.march = false; marchBtn.setAttribute('aria-pressed', 'false'); }
      drawCal(); readoutText();
    }

    /* ---- drawing ---- */
    function draw() {
      var ecg = st.ecg; if (!ecg) return;
      var W = L.w, H = L.h, fs = ecg.fs;
      var root = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.ariaLabel || 'ECG', preserveAspectRatio: 'xMinYMin meet' });
      root.appendChild(S('rect', { class: 'ecg-paper', x: 0, y: 0, width: W, height: H }));
      var minor = [], major = [], x, y;
      for (x = 0; x <= W; x++) (x % 5 ? minor : major).push('M' + x + ' 0V' + H);
      for (y = 0; y <= H; y++) (y % 5 ? minor : major).push('M0 ' + y + 'H' + W);
      root.appendChild(S('path', { class: 'ecg-minor', d: minor.join('') }));
      root.appendChild(S('path', { class: 'ecg-major', d: major.join('') }));
      var hl = st.hl;
      if (hl) L.panels.forEach(function (p) {
        if (p.strip) return;
        var kind = (hl.elevation || []).indexOf(p.lead) >= 0 ? 'elev' : (hl.reciprocal || []).indexOf(p.lead) >= 0 ? 'recip' : (hl.primary || []).indexOf(p.lead) >= 0 ? 'primary' : null;
        if (!kind) return;
        var top = p.y - L.rowH * 0.56 + 1.2, hgt = L.rowH - 2.4;
        root.appendChild(S('rect', { class: 'ecg-hl ecg-hl-' + kind, x: p.x + 0.6, y: top, width: p.w - 1.2, height: hgt, rx: 1.5 }));
        root.appendChild(S('text', { class: 'ecg-hl-tag ecg-tag-' + kind, x: p.x + p.w - 1.6, y: top + 3.6, 'text-anchor': 'end', 'font-size': 3 }, kind === 'elev' ? 'ST ↑' : kind === 'recip' ? 'ST ↓' : 'key lead'));
      });
      L.baselines.forEach(function (yb) { root.appendChild(S('path', { class: 'ecg-pulse', d: 'M1.5 ' + yb + 'H3.5V' + (yb - GAIN) + 'H8.5V' + yb + 'H10.5' })); });
      var paths = [];
      L.panels.forEach(function (p) {
        var arr = ecg.leads[p.lead]; if (!arr) return;
        var i0 = Math.max(0, Math.round(p.t0 * fs)), i1 = Math.min(arr.length - 1, Math.round(p.t1 * fs) - (p.col < 3 && !p.strip ? 1 : 0));
        var n = i1 - i0 + 1, xs = new Float64Array(n), ys = new Float64Array(n);
        for (var i = 0; i < n; i++) { xs[i] = p.x + ((i0 + i) / fs - p.t0) * SPEED; ys[i] = p.y - arr[i0 + i] * GAIN; }
        paths.push(tracePath(xs, ys, 0.025));
        if (p.col > 0) root.appendChild(S('line', { class: 'ecg-sep', x1: p.x, x2: p.x, y1: p.y - 3.5, y2: p.y + 3.5 }));
        root.appendChild(S('text', { class: 'ecg-label', x: p.x + 1.2, y: p.y - 9.8, 'font-size': 3.6 }, p.label || p.lead));
      });
      root.appendChild(S('path', { class: 'ecg-trace', d: paths.join('') }));
      if (st.labels) drawLabels(root, ecg);
      if (st.overlay) { var og = S('g'); try { st.overlay(og, L, ecg); } catch (e) { console.error(e); } root.appendChild(og); }
      root.appendChild(S('text', { class: 'ecg-note', x: W - 1.5, y: H - 1.4, 'text-anchor': 'end', 'font-size': 2.6 }, SPEED + ' mm/s · ' + GAIN + ' mm/mV'));
      calG = S('g'); root.appendChild(calG);
      wire(root);
      if (svg) frame.replaceChild(root, svg); else frame.appendChild(root);
      svg = root;
      applyZoom(); drawCal();
    }

    function drawLabels(root, ecg) {
      var a = ecg.annotations, strips = L.panels.filter(function (p) { return p.strip; });
      if (!strips.length) strips = L.panels.filter(function (p) { return p.row === 0; });
      var showPR = a.rates.ventricular < 115 && a.rhythm !== 'avb3' && a.rhythm !== 'vt';
      strips.forEach(function (p) {
        a.pWaves.forEach(function (pw) {
          var tc = pw.kind === 'flutter' ? pw.on + 0.12 : pw.on + 0.045;
          if (tc < p.t0 + 0.02 || tc > p.t1 - 0.02) return;
          var X = p.x + (tc - p.t0) * SPEED;
          var blocked = !pw.conducted && pw.kind !== 'flutter' && pw.kind !== 'retro';
          var txt = pw.kind === 'flutter' ? 'F' : (pw.kind === 'retro' || pw.kind === 'ectopic') ? 'P′' : blocked ? '(P)' : 'P';
          root.appendChild(S('text', { class: 'ecg-ann ' + (blocked ? 'ecg-ann-x' : 'ecg-ann-p'), x: X, y: p.y - 13.5, 'text-anchor': 'middle', 'font-size': pw.kind === 'flutter' ? 2.6 : 3.1 }, txt));
          if (showPR && pw.pr && pw.kind !== 'flutter') root.appendChild(S('text', { class: 'ecg-ann ecg-ann-p', x: X, y: p.y - 17, 'text-anchor': 'middle', 'font-size': 2.3 }, 'PR ' + pw.pr));
        });
        a.beats.forEach(function (b, i) {
          var tq = b.qrsOn + 0.02;
          if (tq < p.t0 || tq > p.t1) return;
          var X = p.x + (tq - p.t0) * SPEED;
          var tag = { V: 'V', S: 'A', J: 'J', E: 'E', P: 'pace' }[b.kind];
          if (tag && !(a.rhythm === 'vt' || a.rhythm === 'paced' || a.rhythm === 'junctional' || a.rhythm === 'avb3') ) root.appendChild(S('text', { class: 'ecg-ann ecg-ann-v', x: X, y: p.y + 11.5, 'text-anchor': 'middle', 'font-size': 3 }, tag));
          if (i > 0 && b.rr) {
            var prev = a.beats[i - 1], xm = p.x + ((prev.qrsOn + b.qrsOn) / 2 + 0.02 - p.t0) * SPEED;
            if (prev.qrsOn >= p.t0 && a.rates.ventricular < 130) root.appendChild(S('text', { class: 'ecg-ann ecg-ann-rr', x: xm, y: p.y + 15.5, 'text-anchor': 'middle', 'font-size': 2.4 }, b.rr));
          }
        });
      });
      if (strips.length && strips[0].strip) root.appendChild(S('text', { class: 'ecg-note', x: strips[0].x, y: strips[0].y + 19.5, 'font-size': 2.4 }, 'P conducted · (P) not conducted · P′ retrograde/ectopic · F flutter wave · numbers: R–R (ms)'));
    }

    /* ---- calipers ---- */
    function toMM(evt) {
      if (!svg || !svg.getScreenCTM) return null;
      var m = svg.getScreenCTM(); if (!m) return null;
      var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      var q = pt.matrixTransform(m.inverse());
      return { x: MT.clamp(q.x, L.x0, L.w - 1), y: MT.clamp(q.y, 1, L.h - 1) };
    }
    function placeLeg(pt) {
      if (!pt) return;
      if (!st.legs[0]) st.legs[0] = pt;
      else if (!st.legs[1]) st.legs[1] = pt;
      else { var i = Math.abs(st.legs[0].x - pt.x) <= Math.abs(st.legs[1].x - pt.x) ? 0 : 1; st.legs[i] = pt; }
      drawCal(); readoutText();
    }
    function legTime(lg) { return (lg.x - L.x0) / SPEED; }
    function measure() {
      var A = st.legs[0], B = st.legs[1]; if (!A || !B) return null;
      var dt = Math.abs(B.x - A.x) / SPEED * 1000, dv = (A.y - B.y) / GAIN;
      return { ms: dt, rate: dt > 0 ? 60000 / dt : null, small: Math.abs(B.x - A.x), mv: dv };
    }
    function readoutText() {
      MT.clear(readout);
      if (!st.cal) return;
      var m = measure();
      if (!st.legs[0]) { readout.appendChild(document.createTextNode('Calipers on: tap two points on the tracing (or focus the tracing and press Enter to place them, then use ← → with Shift/Alt for bigger/finer steps).')); return; }
      if (!m) { readout.appendChild(document.createTextNode('Tap a second point.')); return; }
      readout.appendChild(h('span', 'Interval ', h('strong', Math.round(m.ms) + ' ms'), ' (' + MT.fmt(m.small, 1) + ' small squares) → rate ', h('strong', m.rate ? Math.round(m.rate) + '/min' : '—'), ' · vertical difference ' + MT.fmt(m.mv, 2) + ' mV (' + MT.fmt(m.mv * GAIN, 1) + ' mm)'));
    }
    function drawCal() {
      if (!calG) return;
      MT.clear(calG);
      if (!st.cal) return;
      var A = st.legs[0], B = st.legs[1];
      if (A && B && st.march) {
        var dx = B.x - A.x;
        if (Math.abs(dx) > 1) for (var k = -40; k <= 40; k++) {
          if (k === 0 || k === 1) continue;
          var xm = A.x + k * dx; if (xm < L.x0 || xm > L.w) continue;
          calG.appendChild(S('line', { class: 'ecg-cal-march', x1: xm, x2: xm, y1: 0, y2: L.h }));
        }
      }
      st.legs.forEach(function (lg, i) {
        if (!lg) return;
        calG.appendChild(S('line', { class: 'ecg-cal-line', x1: lg.x, x2: lg.x, y1: 0, y2: L.h }));
        var t = legTime(lg);
        var g = S('g', { class: 'ecg-handle-g', tabindex: '0', role: 'slider', 'data-leg': String(i), 'aria-label': 'Caliper ' + (i ? 'B' : 'A') + ' position', 'aria-valuemin': '0', 'aria-valuemax': String(Math.round((L.w - L.x0) / SPEED * 1000)), 'aria-valuenow': String(Math.round(t * 1000)), 'aria-valuetext': MT.fmt(t, 2) + ' s' });
        g.appendChild(S('circle', { class: 'ecg-handle-hit', cx: lg.x, cy: lg.y, r: 5 }));
        g.appendChild(S('circle', { class: 'ecg-handle', cx: lg.x, cy: lg.y, r: 1.7 }));
        calG.appendChild(g);
      });
      if (A && B) {
        var m = measure(), yb = B.y, x1 = Math.min(A.x, B.x), x2 = Math.max(A.x, B.x);
        calG.appendChild(S('line', { class: 'ecg-cal-bar', x1: x1, x2: x2, y1: yb, y2: yb }));
        var label = Math.round(m.ms) + ' ms' + (m.rate ? ' · ' + Math.round(m.rate) + '/min' : '');
        var tx = MT.clamp((x1 + x2) / 2, L.x0 + 12, L.w - 12), ty = yb > 8 ? yb - 2.2 : yb + 5;
        calG.appendChild(S('text', { class: 'ecg-cal-text', x: tx, y: ty, 'text-anchor': 'middle', 'font-size': 3.4 }, label));
      }
    }
    function focusLeg(i) { var g = calG && calG.querySelector('[data-leg="' + i + '"]'); if (g && g.focus) try { g.focus(); } catch (e) { /* ignore */ } }
    function wire(root) {
      root.addEventListener('pointerdown', function (e) {
        if (!st.cal) return;
        var g = e.target.closest ? e.target.closest('.ecg-handle-g') : null;
        if (g) { drag = { leg: Number(g.getAttribute('data-leg')), id: e.pointerId }; try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault(); return; }
        down = { x: e.clientX, y: e.clientY, t: Date.now() };
      });
      root.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var pt = toMM(e); if (pt) { st.legs[drag.leg] = pt; drawCal(); readoutText(); }
        e.preventDefault();
      });
      root.addEventListener('pointerup', function (e) {
        if (drag) { var i = drag.leg; drag = null; focusLeg(i); return; }
        if (!st.cal || !down) return;
        var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
        if (moved < 10 && Date.now() - down.t < 800) placeLeg(toMM(e));
        down = null;
      });
      root.addEventListener('pointercancel', function () { drag = null; down = null; });
    }
    frame.addEventListener('keydown', function (e) {
      if (!st.cal) return;
      var g = e.target.closest ? e.target.closest('.ecg-handle-g') : null;
      if (!g) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === frame) {
          e.preventDefault();
          var sb = L.baselines[L.baselines.length - 1], x0 = L.x0 + frame.scrollLeft / currentPx() + 10;
          st.legs = [{ x: MT.clamp(x0, L.x0, L.w - 30), y: sb }, { x: MT.clamp(x0 + 20, L.x0, L.w - 1), y: sb }];
          drawCal(); readoutText(); focusLeg(0);
        }
        return;
      }
      var i = Number(g.getAttribute('data-leg')), lg = st.legs[i]; if (!lg) return;
      var stepMM = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') lg.x -= stepMM;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') lg.x += stepMM;
      else if (e.key === 'Home') lg.x = L.x0;
      else if (e.key === 'End') lg.x = L.w - 1;
      else return;
      e.preventDefault();
      lg.x = MT.clamp(lg.x, L.x0, L.w - 1);
      drawCal(); readoutText(); focusLeg(i);
    });
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { if (st.zoom === 'fit') applyZoom(); }, 120); }
    self.addEventListener('resize', onResize);

    return {
      el: el,
      frame: frame,
      layout: function () { return L; },
      update: function (ecg, extra) {
        extra = extra || {};
        st.ecg = ecg;
        if (extra.highlight !== undefined) st.hl = extra.highlight;
        if (extra.layout) { L = buildLayout(extra.layout); st.legs = [null, null]; }
        if (extra.overlay !== undefined) st.overlay = extra.overlay;
        if (extra.ariaLabel) opts.ariaLabel = extra.ariaLabel;
        draw(); readoutText();
      },
      setHighlight: function (hl) { st.hl = hl; draw(); },
      setLabels: setLabels,
      setOverlay: function (fn) { st.overlay = fn; draw(); },
      labelsOn: function () { return st.labels; },
      showLabelButton: function (on) { if (labelBtn) labelBtn.hidden = !on; },
      destroy: function () { self.removeEventListener('resize', onResize); clearTimeout(resizeT); }
    };
  }

  /* ====================================================================== interpretation text */
  function netQRS(m, lead) { if (!m || !m[lead]) return null; var r = m[lead]; return r.r - Math.max(r.q, r.s); }
  function rhythmText(ecg, dx) {
    var a = ecg.annotations, cv = Math.round(a.rrCV * 100), iv = a.intervals;
    switch (a.rhythm) {
      case 'sinus': case 'avb1': return 'Regular. An upright sinus P wave in II precedes every QRS with a constant PR' + (iv.pr ? ' (' + iv.pr + ' ms)' : '') + '.';
      case 'sinus-arrhythmia': return 'Irregular in a repeating pattern — R–R varies cyclically with breathing (R–R variation ' + cv + '%), but every QRS has an identical sinus P wave and a constant PR.';
      case 'af': return 'Irregularly irregular (R–R variation ' + cv + '%) with no P waves — a fibrillatory baseline instead.';
      case 'flutter': return 'Regular ventricular rhythm; continuous sawtooth flutter waves at ≈ ' + a.rates.atrial + '/min with ' + (a.flutter ? a.flutter.conduction : '?') + ':1 conduction.';
      case 'svt': return 'Regular narrow-complex tachycardia; no P waves before the QRS — retrograde P waves at the very end of the QRS (pseudo-r′ in V1, pseudo-S in II/III/aVF).';
      case 'junctional': return 'Regular; inverted (retrograde) P waves in II, III and aVF just before each QRS with a short PR.';
      case 'pac': return 'Sinus rhythm interrupted by premature beats that start with an abnormally shaped P wave, conduct with a normal QRS, and reset the sinus node.';
      case 'pvc': return dx && dx.id === 'bigeminy' ? 'Bigeminy: every sinus beat is followed by a premature broad complex (no P wave) and a compensatory pause.' : 'Sinus rhythm with premature broad complexes that have no preceding P wave, each followed by a fully compensatory pause.';
      case 'vt': return 'Regular broad-complex tachycardia. P waves (≈ ' + a.rates.atrial + '/min) march independently of the QRS complexes — AV dissociation.';
      case 'torsades': return 'Sinus beats with a very long QT; an R-on-T beat then triggers a fast polymorphic ventricular rhythm whose QRS axis twists.';
      case 'vf': return 'Chaotic, irregular waveform — no organised P waves, QRS complexes or T waves.';
      case 'asystole': return 'No P waves and no QRS complexes — an almost flat line with baseline drift.';
      case 'paced': return 'Regular paced rhythm: a pacing spike precedes every broad QRS; no P waves.';
      case 'avb2-mobitz1': return 'Group beating: the P–P interval is regular and the PR lengthens beat by beat until a P wave is not conducted.';
      case 'avb2-mobitz2': return 'Regular P waves; every conducted beat has the same PR' + (iv.pr ? ' (' + iv.pr + ' ms)' : '') + ', but some P waves are suddenly not conducted.';
      case 'avb3': return 'Regular P waves (≈ ' + a.rates.atrial + '/min) and a slower, regular escape rhythm (≈ ' + a.rates.ventricular + '/min) with no relationship between them — the "PR" keeps changing.';
      default: return '';
    }
  }
  /** Systematic description of a generated tracing: rate, rhythm, axis, intervals (each a sentence). */
  function describe(ecg, dx) {
    var a = ecg.annotations, iv = a.intervals, out = {}, nb = a.beats.length;
    if (a.vf) out.rate = 'Not measurable — no organised QRS complexes.';
    else if (!nb) out.rate = 'No QRS complexes (ventricular rate 0).';
    else {
      var v = a.rates.ventricular, rr = iv.rr, regular = a.rrCV < 0.08 && a.rhythm !== 'torsades';
      if (regular && rr) out.rate = 'Ventricular rate ≈ ' + v + '/min: R–R ≈ ' + rr + ' ms = ' + MT.fmt(rr / 200, 1) + ' large squares → 300 ÷ ' + MT.fmt(rr / 200, 1) + ' ≈ ' + Math.round(60000 / rr) + '/min.';
      else out.rate = 'Ventricular rate ≈ ' + v + '/min (irregular, so count: ' + nb + ' QRS complexes in ' + ecg.durationSec + ' s × ' + Math.round(60 / ecg.durationSec) + ' ≈ ' + Math.round(nb * 60 / ecg.durationSec) + '/min).';
      if (a.rates.atrial && Math.abs(a.rates.atrial - v) > 4) out.rate += ' Atrial rate ≈ ' + a.rates.atrial + '/min.';
    }
    out.rhythm = rhythmText(ecg, dx);
    var ax = E.estimateAxis(ecg), m = null;
    try { m = E.measureBeat(ecg); } catch (e) { m = null; }
    out.measure = m; out.axisDeg = ax;
    if (ax == null || a.rhythm === 'torsades') out.axis = 'Not applicable — no consistent QRS complexes to measure.';
    else {
      var c = E.classifyAxis(ax), nI = netQRS(m, 'I'), nF = netQRS(m, 'aVF'), nII = netQRS(m, 'II');
      var pol = function (x) { return x == null ? '?' : x >= 0 ? 'positive' : 'negative'; };
      out.axis = deg(ax) + ' — ' + c.label + ' (net QRS: I ' + pol(nI) + ', aVF ' + pol(nF) + (nI >= 0 && nF < 0 ? ', II ' + pol(nII) : '') + ').';
    }
    var parts = [];
    if (iv.pr) parts.push('PR ' + iv.pr + ' ms' + (iv.pr > 200 ? ' (prolonged > 200)' : iv.pr < 120 ? ' (short < 120)' : ' (normal 120–200)'));
    else if (iv.prVariable) parts.push('PR variable');
    else if (nb && a.rhythm !== 'vf') parts.push('PR not applicable');
    if (iv.qrs) parts.push('QRS ' + iv.qrs + ' ms' + (iv.qrs >= 120 ? ' (broad ≥ 120)' : iv.qrs > 110 ? ' (borderline 110–119)' : ' (narrow)'));
    if (iv.qt && iv.qtc) parts.push('QT ' + iv.qt + ' ms, QTc ' + iv.qtc.fridericia + ' ms (Fridericia) / ' + iv.qtc.bazett + ' ms (Bazett)' + (iv.qtc.fridericia > 500 ? ' — markedly prolonged' : iv.qtc.fridericia >= 460 ? ' — prolonged' : ''));
    out.intervals = parts.length ? parts.join(' · ') + '.' : 'Not measurable.';
    return out;
  }

  function walkList(ecg, dx, opts) {
    opts = opts || {};
    var d = describe(ecg, dx);
    var items = [
      ['1 · Rate', d.rate], ['2 · Rhythm', d.rhythm], ['3 · Axis', d.axis], ['4 · Intervals', d.intervals],
      ['5 · Morphology', ul(dx.features)], ['6 · Criteria', ul(dx.criteria)]
    ];
    if (opts.pearls) items.push(['7 · Clinical', ul(dx.pearls)]);
    return h('ol.ecg-walk', items.map(function (it) { return h('li', h('div.ecg-step', it[0]), h('div', it[1])); }));
  }

  /** Measured-values card content for the lab (rate, rhythm, axis, intervals, voltages, ST). */
  function measuredPanel(ecg, dx) {
    var d = describe(ecg, dx), m = d.measure, rows = [
      ['Rate', d.rate], ['Rhythm', d.rhythm], ['Axis', d.axis], ['Intervals', d.intervals]
    ];
    if (m && ecg.annotations.beats.length) {
      var sl = E.sokolowLyon(m.V1.s * GAIN, m.V5.r * GAIN, m.V6.r * GAIN), co = E.cornell(m.aVL.r * GAIN, m.V3.s * GAIN, 'male');
      rows.push(['Voltage', 'Sokolow–Lyon ' + MT.fmt(sl.value, 0) + ' mm (' + (sl.positive ? 'meets ≥ 35' : 'below 35') + ') · Cornell ' + MT.fmt(co.value, 0) + ' mm (men > 28, women > 20)']);
      var lim = E.LIMB.every(function (l) { return m[l].qrsPP * GAIN < 5; }), pre = E.PRECORDIAL.every(function (l) { return m[l].qrsPP * GAIN < 10; });
      if (lim || pre) rows.push(['Low voltage', (lim ? 'all limb leads < 5 mm' : '') + (lim && pre ? ' and ' : '') + (pre ? 'all precordial leads < 10 mm' : '')]);
      var dev = E.LEADS.filter(function (l) { return Math.abs(m[l].st) >= 0.075; }).map(function (l) { return l + ' ' + (m[l].st > 0 ? '+' : '−') + mm(Math.abs(m[l].st)); });
      rows.push(['ST (J+60)', dev.length ? dev.join(', ') + ' mm' : 'No ST deviation ≥ 1 mm']);
    }
    return h('dl.ecg-kv', rows.map(function (r) { return [h('dt', r[0]), h('dd', r[1])]; }));
  }

  function dxInfo(dx) {
    return h('div.stack', { style: '--gap:.6rem' },
      h('div.row', { style: '--gap:.4rem' }, MT.ui.badge(groupTitle(dx.group), 'accent'), MT.ui.badge(tierLabel(dx.tier))),
      h('p', { style: 'margin:0' }, dx.summary),
      h('h3', { style: 'margin:.4rem 0 .2rem' }, 'Key features'), ul(dx.features),
      h('h3', { style: 'margin:.4rem 0 .2rem' }, 'Diagnostic criteria'), ul(dx.criteria),
      h('h3', { style: 'margin:.4rem 0 .2rem' }, 'Clinical pearls'), ul(dx.pearls),
      h('details.disclosure', h('summary', 'References'), h('div.disclosure-body', refList(dx.refs))));
  }

  function dxSelect(value, onChange, id) {
    var sel = h('select', { id: id, onchange: function () { onChange(sel.value); } },
      E.GROUPS.map(function (g) {
        return h('optgroup', { label: g.title }, E.DIAGNOSES.filter(function (d) { return d.group === g.id; }).map(function (d) { return h('option', { value: d.id, selected: d.id === value }, d.name); }));
      }));
    return sel;
  }

  /* ====================================================================== tool 1: ECG Lab */
  var CONTROLS = [
    { key: 'hr', label: 'Heart rate', unit: '/min', min: 20, max: 250, step: 1, not: ['flutter', 'vf', 'asystole', 'avb3'], hint: function (r) { return r === 'avb2-mobitz1' || r === 'avb2-mobitz2' ? 'Atrial (P-wave) rate' : r === 'torsades' ? 'Sinus rate before the run' : r === 'af' ? 'Mean ventricular rate' : null; } },
    { key: 'atrialRate', label: 'Atrial rate', unit: '/min', min: 40, max: 360, step: 2, only: ['flutter', 'avb3', 'vt'] },
    { key: 'conduction', label: 'Conduction ratio', unit: ':1', min: 2, max: 6, step: 1, only: ['flutter'] },
    { key: 'ratio', label: 'Group size (P waves)', unit: '', min: 3, max: 7, step: 1, only: ['avb2-mobitz1', 'avb2-mobitz2'] },
    { key: 'escapeRate', label: 'Escape rate', unit: '/min', min: 20, max: 60, step: 1, only: ['avb3'] },
    { key: 'pr', label: 'PR interval', unit: 'ms', min: 80, max: 400, step: 5, not: ['af', 'flutter', 'svt', 'junctional', 'vt', 'vf', 'asystole', 'paced', 'avb3'] },
    { key: 'qrs', label: 'QRS duration', unit: 'ms', min: 60, max: 220, step: 2, not: ['vf', 'asystole', 'paced', 'torsades'] },
    { key: 'qtc', label: 'QTc (Fridericia)', unit: 'ms', min: 320, max: 680, step: 5, not: ['vf', 'asystole', 'vt'] },
    { key: 'axis', label: 'QRS axis', unit: '°', min: -180, max: 180, step: 5, not: ['vf', 'asystole', 'vt', 'paced', 'torsades'] },
    { key: 'qrsAmp', label: 'QRS amplitude', unit: '%', min: 20, max: 250, step: 5, scale: 100, not: ['vf', 'asystole'] },
    { key: 'tAmp', label: 'T-wave amplitude', unit: '%', min: 0, max: 320, step: 5, scale: 100, not: ['vf', 'asystole'] },
    { key: 'uAmp', label: 'U wave', unit: 'mm', min: 0, max: 3, step: 0.1, scale: 10, not: ['vf', 'asystole'] },
    { key: 'stx', label: 'ST vector: left (+) / right (−)', unit: 'mm', min: -4, max: 4, step: 0.1, vec: 0, not: ['vf', 'asystole', 'vt', 'paced'] },
    { key: 'sty', label: 'ST vector: inferior (+) / superior (−)', unit: 'mm', min: -4, max: 4, step: 0.1, vec: 1, not: ['vf', 'asystole', 'vt', 'paced'] },
    { key: 'stz', label: 'ST vector: anterior (+) / posterior (−)', unit: 'mm', min: -4, max: 4, step: 0.1, vec: 2, not: ['vf', 'asystole', 'vt', 'paced'] },
    { key: 'noise', label: 'Artefact', unit: '%', min: 0, max: 100, step: 5, scale: 100 }
  ];

  MT.registerTool({
    id: 'ecg-lab', title: 'ECG Lab', category: 'ecg', icon: '💓', order: 1,
    description: 'Generate any rhythm or diagnosis as a realistic 12-lead ECG on true ECG paper — measure with calipers, see the key features and criteria, and tweak the physiology.',
    keywords: ['ecg', 'ekg', 'electrocardiogram', '12-lead', 'rhythm', 'arrhythmia', 'calipers', 'stemi', 'heart block', 'bundle branch block', 'atrial fibrillation'],
    render: function (container, ctx) {
      var state = load(KEYS.lab, { v: 1, dx: 'normal' });
      var dxId = ctx.params[0] && E.byId(ctx.params[0]) ? ctx.params[0] : (E.byId(state.dx) ? state.dx : 'normal');
      var overrides = {}, seed = newSeed(), ecg = null, raf = 0;
      var view = EcgView({ layout: 'standard', ariaLabel: '12-lead ECG' });
      var select = dxSelect(dxId, function (v) { setDx(v); }, 'ecg-lab-dx');
      var infoHost = h('div'), measHost = h('div', { 'aria-live': 'polite' }), ctrlHost = h('div.ecg-controls'), titleEl = h('h2', { style: 'margin:0' });
      var idx = function () { return E.DIAGNOSES.map(function (d) { return d.id; }).indexOf(dxId); };

      container.appendChild(h('div.card', { style: 'margin-bottom:1rem' },
        h('div.ecg-pick',
          h('div.field', h('label', { for: 'ecg-lab-dx' }, 'Diagnosis or rhythm'), select),
          h('div.btn-group',
            h('button.btn', { type: 'button', 'aria-label': 'Previous diagnosis', title: 'Previous', onclick: function () { var i = idx(); setDx(E.DIAGNOSES[(i - 1 + E.DIAGNOSES.length) % E.DIAGNOSES.length].id); } }, '‹'),
            h('button.btn', { type: 'button', 'aria-label': 'Next diagnosis', title: 'Next', onclick: function () { var i = idx(); setDx(E.DIAGNOSES[(i + 1) % E.DIAGNOSES.length].id); } }, '›'),
            h('button.btn', { type: 'button', onclick: function () { setDx(pick(E.DIAGNOSES.filter(function (d) { return d.id !== dxId; })).id); } }, '🎲 Random'),
            h('button.btn.btn-primary', { type: 'button', title: 'Same diagnosis, a new tracing (different beat timing and noise)', onclick: function () { seed = newSeed(); regenerate(); } }, '↻ New tracing'))),
        h('div.row.row-between', { style: 'margin:12px 0 8px' }, titleEl, h('span.small.muted', 'Synthetic ECG generated on this device')),
        view.el));
      container.appendChild(h('div.ecg-grid',
        h('section.card', { 'aria-label': 'Key features' }, infoHost),
        h('div.stack',
          h('section.card', h('h2', { style: 'font-size:1.1rem' }, 'Measured on this tracing'), measHost,
            h('p.ecg-meta', 'Measured by the generator\'s own annotations and the median beat; axis from net QRS area in I and aVF.')),
          h('details.disclosure.card', { style: 'padding:0' },
            h('summary', '🎛 Fine-tune the physiology'),
            h('div.disclosure-body', h('p.small.muted', 'Adjust the generator: the tracing updates as you drag. Parameters that do not apply to the current rhythm are disabled.'), ctrlHost,
              h('div.row', { style: 'margin-top:12px' }, h('button.btn.btn-sm', { type: 'button', onclick: function () { overrides = {}; buildControls(); regenerate(); } }, 'Reset to preset')))))));
      container.appendChild(MT.ui.disclaimer('Synthetic tracings for learning ECG interpretation. Real ECGs vary more; always interpret in the clinical context and follow local protocols.'));

      function params() { return E.generate({ diagnosis: dxId, params: overrides, seed: seed, durationSec: 0.01 }).params; }
      function buildControls() {
        MT.clear(ctrlHost);
        var p = params(), r = p.rhythm;
        CONTROLS.forEach(function (c) {
          var on = c.only ? c.only.indexOf(r) >= 0 : !(c.not && c.not.indexOf(r) >= 0);
          if (c.only && !on) return;
          var id = 'ecg-c-' + c.key, sc = c.scale || 1;
          var raw = c.vec != null ? (p.st[c.vec] * 10) : (c.key === 'uAmp' ? p.uAmp * 10 : c.key === 'atrialRate' ? (p.atrialRate || (r === 'flutter' ? 300 : r === 'vt' ? 78 : 90)) : p[c.key]);
          var val = c.vec != null || c.key === 'uAmp' ? raw : (c.scale ? raw * sc : raw);
          if (val == null || isNaN(val)) val = c.min;
          var out = h('output', { for: id });
          var input = h('input', { type: 'range', id: id, min: c.min, max: c.max, step: c.step, value: String(val), disabled: !on });
          var fmtv = function (v) { return (c.key === 'axis' ? deg(Number(v)) : MT.fmt(Number(v), c.step < 1 ? 1 : 0)) + (c.key === 'axis' ? '' : ' ' + c.unit); };
          out.textContent = fmtv(val);
          input.addEventListener('input', function () {
            var v = Number(input.value); out.textContent = fmtv(v);
            if (c.vec != null) { var st = (overrides.st || p.st).slice(); st[c.vec] = v / 10; overrides.st = st; }
            else if (c.key === 'uAmp') overrides.uAmp = v / 10;
            else overrides[c.key] = c.scale ? v / sc : v;
            if (c.key === 'qtc') overrides.qt = null;
            schedule();
          });
          var hint = c.hint && c.hint(r);
          ctrlHost.appendChild(h('div.ecg-slider', h('label', { for: id }, h('span', c.label), out), input, hint ? h('div.small.muted', hint) : null));
        });
      }
      function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(regenerate); }
      function regenerate() {
        var dx = E.byId(dxId);
        ecg = E.generate({ diagnosis: dxId, params: overrides, seed: seed });
        view.update(ecg, { highlight: view.labelsOn() ? dx.highlight || null : null, ariaLabel: '12-lead ECG: ' + dx.name });
        MT.clear(measHost); measHost.appendChild(measuredPanel(ecg, dx));
      }
      function setDx(id, initial) {
        dxId = id; overrides = {}; seed = newSeed();
        var dx = E.byId(id);
        select.value = id; titleEl.textContent = dx.name;
        MT.clear(infoHost); infoHost.appendChild(h('h2', { style: 'font-size:1.1rem' }, 'Key features'));
        infoHost.appendChild(dxInfo(dx));
        state.dx = id; save(KEYS.lab, state);
        if (!initial) try { history.replaceState(null, '', '#/ecg-lab/' + slug(id)); } catch (e) { /* ignore */ }
        ctx.setTitle(dx.name + ' · ECG Lab');
        buildControls(); regenerate();
      }
      // Labels toggle also shows the diagnosis' highlighted leads.
      var origSet = view.setLabels;
      view.setLabels = function (on) { origSet(on); regenerate(); };
      view.el.querySelector('.ecg-bar').lastChild.onclick = null;
      view.el.querySelector('.ecg-bar').lastChild.addEventListener('click', function () { setTimeout(regenerate, 0); });
      setDx(dxId, true);
      return function () { cancelAnimationFrame(raf); view.destroy(); };
    }
  });

  /* ====================================================================== tool 2: ECG Quiz */
  MT.registerTool({
    id: 'ecg-quiz', title: 'ECG Quiz', category: 'ecg', icon: '🎯', order: 2,
    description: 'Random 12-lead ECG cases: pick the diagnosis, then get a systematic walk-through of rate, rhythm, axis, intervals, morphology and criteria.',
    keywords: ['ecg', 'ekg', 'quiz', 'practice', 'cases', 'interpretation', 'multiple choice'],
    render: function (container) {
      var st = load(KEYS.quiz, { v: 1, level: 1, topic: 'all', answered: 0, correct: 0, streak: 0, best: 0, recent: [], byDx: {} });
      var cur = null, answered = false;
      var view = EcgView({ layout: 'standard', ariaLabel: '12-lead ECG for interpretation', labels: false });
      view.showLabelButton(false);
      var statsHost = h('div.ecg-stats', { 'aria-live': 'polite' }), optsHost = h('div.ecg-opts', { role: 'group', 'aria-label': 'Answer options' });
      var fbHost = h('div', { 'aria-live': 'polite' }), weakHost = h('div.small.muted');
      var levelCtl = MT.ui.segmented(LEVELS, st.level, function (v) { st.level = v; save(KEYS.quiz, st); next(); });
      var topicSel = h('select', { id: 'ecg-quiz-topic', onchange: function () { st.topic = topicSel.value; save(KEYS.quiz, st); next(); } },
        h('option', { value: 'all', selected: st.topic === 'all' }, 'All topics'),
        E.GROUPS.map(function (g) { return h('option', { value: g.id, selected: st.topic === g.id }, g.title); }));
      container.appendChild(h('div.card', { style: 'margin-bottom:1rem' },
        h('div.row.row-between', { style: '--gap:.75rem' },
          h('div.stack', { style: '--gap:.35rem' }, h('div.field-label', 'Difficulty'), levelCtl),
          h('div.field', { style: 'min-width:200px' }, h('label', { for: 'ecg-quiz-topic' }, 'Topic'), topicSel)),
        h('hr', { style: 'margin:12px 0' }), statsHost, weakHost));
      var caseCard = h('section.card', { 'aria-label': 'Current case' },
        h('div.row.row-between', h('h2', { style: 'font-size:1.15rem;margin:0' }, 'What is the diagnosis?'), h('span.kbd-hint', 'Keys 1–4 answer · Enter = next')),
        h('p.small.muted', { style: 'margin:.3rem 0 .6rem' }, 'Work through it systematically: rate → rhythm → axis → intervals → morphology. Calipers help with intervals.'),
        view.el, h('div', { style: 'margin-top:12px' }, optsHost), fbHost);
      container.appendChild(caseCard);
      container.appendChild(MT.ui.disclaimer('Synthetic tracings for practice. Your score is saved only on this device.'));

      function eligible() {
        return E.DIAGNOSES.filter(function (d) { return d.tier <= st.level && (st.topic === 'all' || d.group === st.topic); });
      }
      function renderStats() {
        MT.clear(statsHost);
        var pct = st.answered ? Math.round(st.correct / st.answered * 100) : 0;
        statsHost.appendChild(h('div.stat', h('div.stat-value', st.correct + ' / ' + st.answered), h('div.stat-label', 'Correct' + (st.answered ? ' (' + pct + '%)' : ''))));
        statsHost.appendChild(h('div.stat', h('div.stat-value', String(st.streak)), h('div.stat-label', 'Current streak')));
        statsHost.appendChild(h('div.stat', h('div.stat-value', String(st.best)), h('div.stat-label', 'Best streak')));
        statsHost.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () {
          MT.confirm('Reset your ECG quiz score, streaks and history on this device?', { danger: true, okLabel: 'Reset' }).then(function (ok) {
            if (!ok) return; st.answered = 0; st.correct = 0; st.streak = 0; st.best = 0; st.recent = []; st.byDx = {}; save(KEYS.quiz, st); renderStats(); MT.toast('Quiz score reset', 'ok');
          });
        } }, 'Reset score'));
        MT.clear(weakHost);
        var weak = Object.keys(st.byDx).map(function (id) { var r = st.byDx[id]; return { id: id, seen: r[0], ok: r[1] }; })
          .filter(function (r) { return r.seen >= 2 && r.ok / r.seen < 0.75 && E.byId(r.id); })
          .sort(function (a, b) { return a.ok / a.seen - b.ok / b.seen; }).slice(0, 3);
        if (weak.length) weakHost.appendChild(h('p', { style: 'margin:.6rem 0 0' }, 'Worth revisiting: ', weak.map(function (r, i) {
          return [i ? ', ' : '', h('a', { href: '#/ecg-lab/' + slug(r.id) }, E.byId(r.id).short), ' (' + r.ok + '/' + r.seen + ')'];
        })));
      }
      function choose() {
        var pool = eligible(); if (!pool.length) pool = E.DIAGNOSES.filter(function (d) { return d.tier <= st.level; });
        var avoid = st.recent.slice(-3).map(function (r) { return r.id; });
        var cand = pool.filter(function (d) { return avoid.indexOf(d.id) < 0; }); if (!cand.length) cand = pool;
        var weights = cand.map(function (d) { var r = st.byDx[d.id]; return r ? 1 + 2 * (1 - r[1] / r[0]) : 1.5; });
        var tot = weights.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * tot;
        for (var i = 0; i < cand.length; i++) { x -= weights[i]; if (x <= 0) return cand[i]; }
        return cand[cand.length - 1];
      }
      function next() {
        var dx = choose(), seed = newSeed();
        var params = E.variant(dx.id, seed) || {};
        var ecg = E.generate({ diagnosis: dx.id, params: params, seed: seed });
        var distract = shuffle(dx.confusers.filter(function (id) { return id !== dx.id && E.byId(id); })).slice(0, 3);
        while (distract.length < 3) { var extra = pick(E.DIAGNOSES); if (extra.id !== dx.id && distract.indexOf(extra.id) < 0) distract.push(extra.id); }
        cur = { dx: dx, ecg: ecg, options: shuffle([dx.id].concat(distract)) };
        answered = false;
        view.update(ecg, { highlight: null, ariaLabel: '12-lead ECG for interpretation' });
        view.setLabels(false); view.showLabelButton(false);
        MT.clear(fbHost); MT.clear(optsHost);
        cur.options.forEach(function (id, i) {
          var d = E.byId(id);
          optsHost.appendChild(h('button.btn.ecg-opt', { type: 'button', 'data-id': id, onclick: function () { answer(id); } }, h('span.ecg-k', { 'aria-hidden': 'true' }, String(i + 1)), h('span', d.short)));
        });
      }
      function answer(id) {
        if (answered || !cur) return;
        answered = true;
        var ok = id === cur.dx.id;
        st.answered++; if (ok) { st.correct++; st.streak++; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
        var r = st.byDx[cur.dx.id] || [0, 0]; r[0]++; if (ok) r[1]++; st.byDx[cur.dx.id] = r;
        st.recent.push({ id: cur.dx.id, ok: ok }); if (st.recent.length > 40) st.recent = st.recent.slice(-40);
        save(KEYS.quiz, st); renderStats();
        MT.$$('.ecg-opt', optsHost).forEach(function (b) {
          var bid = b.getAttribute('data-id'); b.disabled = true;
          if (bid === cur.dx.id) { b.classList.add('ecg-right'); b.appendChild(h('span', { style: 'margin-left:auto;font-weight:800;color:var(--ok)' }, '✓ correct')); }
          else if (bid === id) { b.classList.add('ecg-wrong'); b.appendChild(h('span', { style: 'margin-left:auto;font-weight:800;color:var(--danger)' }, '✗ your answer')); }
        });
        view.showLabelButton(true);
        view.update(cur.ecg, { highlight: cur.dx.highlight || null });
        var chosen = E.byId(id), dx = cur.dx;
        MT.clear(fbHost);
        fbHost.appendChild(h('div.stack', { style: 'margin-top:14px;--gap:.75rem' },
          MT.ui.alert(ok ? 'ok' : 'warn', ok ? 'Correct — ' + dx.name + '.' : 'Not quite — this is ' + dx.name + '.',
            ok ? h('span', dx.summary) : h('span', 'You chose ' + chosen.short + ', which would show ' + chosen.key + '. Here there is ' + dx.key + '.')),
          h('h3', { style: 'margin:0' }, 'Systematic walk-through'),
          walkList(cur.ecg, dx, { pearls: true }),
          h('div.row', h('button.btn.btn-primary', { type: 'button', onclick: next, id: 'ecg-quiz-next' }, 'Next case →'), h('a.btn', { href: '#/ecg-lab/' + slug(dx.id) }, 'Explore in ECG Lab'), h('span.small.muted', 'Tip: turn on 🏷 Labels to see the annotated rhythm strip.'))));
        var nb = MT.$('#ecg-quiz-next', fbHost); if (nb) setTimeout(function () { try { nb.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
      }
      function onKey(e) {
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (/input|select|textarea/i.test(tag) || e.altKey || e.ctrlKey || e.metaKey) return;
        if (!answered && /^[1-4]$/.test(e.key) && cur) { var id = cur.options[Number(e.key) - 1]; if (id) { e.preventDefault(); answer(id); } }
        else if (answered && (e.key === 'Enter' || e.key === 'n') && !(document.activeElement && document.activeElement.tagName === 'BUTTON' && e.key === 'Enter')) { e.preventDefault(); next(); }
      }
      document.addEventListener('keydown', onKey);
      renderStats(); next();
      return function () { document.removeEventListener('keydown', onKey); view.destroy(); };
    }
  });

  /* ====================================================================== tool 3: systematic tutor */
  var STEPS = [
    { id: 'rate', title: 'Rate' }, { id: 'rhythm', title: 'Rhythm' }, { id: 'axis', title: 'Axis' }, { id: 'intervals', title: 'Intervals & QTc' },
    { id: 'hypertrophy', title: 'Hypertrophy' }, { id: 'ischaemia', title: 'Ischaemia' }, { id: 'bbb', title: 'Bundle branch block' }, { id: 'report', title: 'Put it together' }
  ];

  function numberField(id, label, value, opts) {
    opts = opts || {};
    var inp = h('input', { type: 'number', id: id, inputmode: 'decimal', value: value == null ? '' : String(value), min: opts.min, max: opts.max, step: opts.step || 'any' });
    return { el: h('div.field', h('label', { for: id }, label), opts.unit ? h('div.input-group', inp, h('span.addon', opts.unit)) : inp, opts.hint ? h('div.hint', opts.hint) : null), input: inp };
  }

  function stepRate(host, cleanups) {
    var view = EcgView({ layout: { strip: true, lead: 'II', dur: 10, rowH: 40 }, ariaLabel: 'Lead II rhythm strip for rate practice', allowLabels: false });
    cleanups.push(view.destroy);
    var ecg = null, countOff = false, fb = h('div', { 'aria-live': 'polite' });
    var est = numberField('ecg-rate-est', 'Your rate estimate', '', { unit: '/min', min: 0, max: 400 });
    host.appendChild(h('div.stack',
      h('p', 'At the standard paper speed of 25 mm/s one small square is 0.04 s and one large square is 0.2 s, so 300 large squares or 1500 small squares make one minute.'),
      h('div.table-wrap', h('table.table.ecg-small-table',
        h('thead', h('tr', h('th', 'Method'), h('th', 'How'), h('th', 'Best for'))),
        h('tbody',
          h('tr', h('td', '300 rule'), h('td', '300 ÷ number of large squares between two R waves (count-off: 300, 150, 100, 75, 60, 50)'), h('td', 'Regular rhythms, quick estimate')),
          h('tr', h('td', '1500 rule'), h('td', '1500 ÷ number of small squares between two R waves'), h('td', 'Regular rhythms, precise (fast rates)')),
          h('tr', h('td', '6-second method'), h('td', 'Count the QRS complexes in 6 s (30 large squares) × 10 — or in the 10-s strip × 6'), h('td', 'Irregular rhythms (e.g. AF)'))))),
      h('div.row', h('button.btn', { type: 'button', onclick: function () { strip(false); } }, 'New regular strip'), h('button.btn', { type: 'button', onclick: function () { strip(true); } }, 'New irregular strip'),
        (function () { var b = h('button.btn', { type: 'button', 'aria-pressed': 'false', onclick: function () { countOff = !countOff; b.setAttribute('aria-pressed', String(countOff)); view.setOverlay(countOff ? drawCountOff : null); } }, 'Show 300–150–100 count-off'); return b; })()),
      view.el,
      h('div.row', { style: 'align-items:flex-end' }, h('div', { style: 'flex:0 1 220px' }, est.el), h('button.btn.btn-primary', { type: 'button', onclick: check }, 'Check')),
      fb));
    function drawCountOff(g, L, e) {
      var p = L.panels[0], b = e.annotations.beats.filter(function (x) { return x.qrsOn > 0.1 && x.qrsOn < 5; })[0];
      if (!b) return;
      var x0 = p.x + (b.qrsOn + 0.04 - p.t0) * SPEED, labels = ['300', '150', '100', '75', '60', '50', '43', '38'];
      g.appendChild(S('line', { class: 'ecg-guide', x1: x0, x2: x0, y1: 1, y2: L.h - 1 }));
      labels.forEach(function (t, k) {
        var x = x0 + (k + 1) * 5; if (x > L.w - 2) return;
        g.appendChild(S('line', { class: 'ecg-guide', x1: x, x2: x, y1: 3, y2: L.h - 3 }));
        g.appendChild(S('text', { class: 'ecg-guide-text', x: x, y: 3.6, 'text-anchor': 'middle', 'font-size': 2.6 }, t));
      });
    }
    function strip(irregular) {
      var ids = irregular ? ['af', 'af', 'sinus-arrhythmia', 'avb2-mobitz1'] : ['normal', 'sinus-brady', 'sinus-tachy', 'avb1', 'flutter-41', 'junctional', 'normal'];
      var id = pick(ids), seed = newSeed();
      ecg = E.generate({ diagnosis: id, params: E.variant(id, seed), seed: seed });
      ecg.irregular = irregular; est.input.value = ''; MT.clear(fb);
      view.update(ecg, { overlay: countOff ? drawCountOff : null });
    }
    function check() {
      MT.clear(fb);
      var guess = MT.num(est.input.value);
      if (guess == null) { fb.appendChild(MT.ui.alert('info', null, 'Enter your estimate first.')); return; }
      var a = ecg.annotations, beats = a.beats, n6 = beats.filter(function (b) { return b.qrsOn >= 0 && b.qrsOn < 6; }).length, n10 = beats.length;
      var truth = a.rates.ventricular, rr = a.intervals.rr, ok = Math.abs(guess - truth) <= Math.max(5, truth * 0.1);
      var lines = [];
      if (!ecg.irregular && rr) {
        lines.push('R–R ≈ ' + rr + ' ms = ' + MT.fmt(rr / 200, 1) + ' large squares → 300 ÷ ' + MT.fmt(rr / 200, 1) + ' = ' + Math.round(E.rate.rule300(rr / 200)) + '/min.');
        lines.push('= ' + MT.fmt(rr / 40, 0) + ' small squares → 1500 ÷ ' + MT.fmt(rr / 40, 0) + ' = ' + Math.round(E.rate.rule1500(Math.round(rr / 40))) + '/min.');
      }
      lines.push('6-second method: ' + n6 + ' QRS complexes in the first 6 s × 10 = ' + E.rate.sixSecond(n6) + '/min (whole 10-s strip: ' + n10 + ' × 6 = ' + n10 * 6 + '/min).');
      fb.appendChild(MT.ui.alert(ok ? 'ok' : 'warn', (ok ? 'Good estimate. ' : 'Not quite. ') + 'The mean ventricular rate is ' + truth + '/min.', ul(lines)));
    }
    strip(false);
  }

  var RHYTHM_QS = [
    { id: 'regular', q: 'Is the ventricular rhythm regular?' },
    { id: 'p', q: 'Are there P waves?' },
    { id: 'pBefore', q: 'Is every QRS preceded by a P wave?' },
    { id: 'qrsAfter', q: 'Is every P wave followed by a QRS?' },
    { id: 'prConst', q: 'Is the PR interval constant?' },
    { id: 'narrow', q: 'Are the QRS complexes narrow (< 120 ms)?' }
  ];
  // y = yes, n = no, x = not applicable. Order as RHYTHM_QS.
  var RHYTHM_TRUTH = {
    normal: 'yyyyyy', 'sinus-brady': 'yyyyyy', 'sinus-tachy': 'yyyyyy', avb1: 'yyyyyy', 'sinus-arrhythmia': 'nyyyyy',
    af: 'nnnxxy', 'flutter-41': 'ynnnxy', junctional: 'yyyyyy', 'avb2-mobitz1': 'nyynny', 'avb2-mobitz2': 'nyynyn', avb3: 'yynnny', svt: 'ynnxxy'
  };
  var RHYTHM_WHY = {
    normal: 'Sinus rhythm: regular, a P before every QRS, every P conducted with a constant normal PR.',
    'sinus-brady': 'Sinus bradycardia: everything as in sinus rhythm, but slower than 60/min.',
    'sinus-tachy': 'Sinus tachycardia: sinus rhythm faster than 100/min.',
    avb1: 'First-degree AV block: 1:1 conduction with a constant PR > 200 ms.',
    'sinus-arrhythmia': 'Sinus arrhythmia: identical P waves and PR, but the rate cycles with breathing.',
    af: 'Atrial fibrillation: irregularly irregular with no P waves (so the P-wave questions do not apply).',
    'flutter-41': 'Atrial flutter: regular sawtooth flutter waves instead of P waves; only every fourth is conducted.',
    junctional: 'Junctional rhythm: the "P waves" are retrograde (inverted in II) with a short PR.',
    'avb2-mobitz1': 'Mobitz I: the PR lengthens until a P is dropped — so not every P is followed by a QRS and the PR varies.',
    'avb2-mobitz2': 'Mobitz II: constant PR with sudden dropped beats; often a broad QRS (here RBBB).',
    avb3: 'Complete heart block: regular P waves and a regular slower escape rhythm, unrelated (PR keeps changing).',
    svt: 'AVNRT: regular narrow tachycardia with P waves hidden in the end of the QRS.'
  };
  function stepRhythm(host, cleanups) {
    var view = EcgView({ layout: { strip: true, lead: 'II', dur: 10, rowH: 40 }, ariaLabel: 'Lead II rhythm strip for rhythm practice', allowLabels: false });
    cleanups.push(view.destroy);
    var cur = null, answers = {}, qHost = h('div'), fb = h('div', { 'aria-live': 'polite' });
    host.appendChild(h('div.stack',
      h('p', 'Ask the same questions every time, using the long rhythm strip (usually lead II). Use the calipers and their "March" setting to check regularity and P–P intervals.'),
      ul(['Is it regular? Regular, regularly irregular (a pattern) or irregularly irregular?', 'Are there P waves? Are they all the same shape, and upright in II (sinus)?', 'Is every QRS preceded by a P wave — and is every P followed by a QRS?', 'Is the PR interval normal (120–200 ms) and constant?', 'Are the QRS complexes narrow (supraventricular) or broad (ventricular origin or bundle branch block)?']),
      h('div.row', h('button.btn', { type: 'button', onclick: newStrip }, 'New strip')),
      view.el, h('div.card.card-soft', qHost), h('div.row', h('button.btn.btn-primary', { type: 'button', onclick: check }, 'Check my answers')), fb));
    function newStrip() {
      var ids = Object.keys(RHYTHM_TRUTH), id = pick(ids.filter(function (x) { return !cur || x !== cur.id; })), seed = newSeed();
      cur = { id: id, ecg: E.generate({ diagnosis: id, params: E.variant(id, seed), seed: seed }) };
      answers = {}; MT.clear(fb); view.update(cur.ecg);
      MT.clear(qHost);
      RHYTHM_QS.forEach(function (q) {
        var seg = MT.ui.segmented([{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }, { value: 'x', label: 'N/A' }], null, function (v) { answers[q.id] = v; });
        seg.setAttribute('aria-label', q.q);
        qHost.appendChild(h('div.ecg-yn', h('span.ecg-q', q.q), seg));
      });
    }
    function check() {
      MT.clear(fb);
      var truth = RHYTHM_TRUTH[cur.id], right = 0, label = { y: 'Yes', n: 'No', x: 'Not applicable' };
      var items = RHYTHM_QS.map(function (q, i) {
        var t = truth.charAt(i), a = answers[q.id], ok = a === t; if (ok) right++;
        return h('li', h('span.ecg-mark.' + (ok ? 'ecg-mark-ok' : 'ecg-mark-bad'), ok ? '✓ ' : '✗ '), q.q + ' — ' + label[t] + (a && !ok ? ' (you said ' + label[a] + ')' : !a ? ' (not answered)' : ''));
      });
      fb.appendChild(MT.ui.alert(right === RHYTHM_QS.length ? 'ok' : 'info', right + ' / ' + RHYTHM_QS.length + ' — this is ' + E.byId(cur.id).name + '.', h('div', h('p', { style: 'margin:.3rem 0' }, RHYTHM_WHY[cur.id]), h('ul.ecg-list', items))));
      view.setLabels(true);
    }
    newStrip();
  }

  /** Hexaxial reference diagram with the current axis; click/drag to set. */
  function hexaxial(value, onSet) {
    var R = 100, cx = 120, cy = 120;
    var svgEl = S('svg', { class: 'ecg-hex', viewBox: '0 0 240 240', role: 'img', 'aria-label': 'Hexaxial reference system with the QRS axis' });
    function sector(a0, a1, cls) {
      var p0 = [cx + R * Math.cos(a0 * Math.PI / 180), cy + R * Math.sin(a0 * Math.PI / 180)], p1 = [cx + R * Math.cos(a1 * Math.PI / 180), cy + R * Math.sin(a1 * Math.PI / 180)];
      return S('path', { class: cls, d: 'M' + cx + ' ' + cy + 'L' + p0[0] + ' ' + p0[1] + 'A' + R + ' ' + R + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0] + ' ' + p1[1] + 'Z' });
    }
    svgEl.appendChild(sector(-30, 90, 'ecg-q-normal')); svgEl.appendChild(sector(90, 180, 'ecg-q-right'));
    svgEl.appendChild(sector(180, 270, 'ecg-q-extreme')); svgEl.appendChild(sector(270, 330, 'ecg-q-left'));
    [['I', 0], ['II', 60], ['III', 120], ['aVF', 90], ['aVL', -30], ['aVR', -150]].forEach(function (l) {
      var a = l[1] * Math.PI / 180;
      svgEl.appendChild(S('line', { class: 'ecg-hex-axis', x1: cx - R * Math.cos(a), y1: cy - R * Math.sin(a), x2: cx + R * Math.cos(a), y2: cy + R * Math.sin(a) }));
      svgEl.appendChild(S('text', { x: cx + (R + 11) * Math.cos(a), y: cy + (R + 11) * Math.sin(a) + 4, 'text-anchor': 'middle', 'font-size': 11 }, l[0] + ' ' + (l[1] > 0 ? '+' : '') + l[1] + '°'));
    });
    var arrow = S('line', { class: 'ecg-hex-arrow', x1: cx, y1: cy });
    svgEl.appendChild(arrow);
    svgEl.appendChild(S('circle', { cx: cx, cy: cy, r: 4, fill: 'var(--accent)' }));
    function set(v) { var a = v * Math.PI / 180; arrow.setAttribute('x2', cx + (R - 8) * Math.cos(a)); arrow.setAttribute('y2', cy + (R - 8) * Math.sin(a)); }
    function fromEvt(e) { var r = svgEl.getBoundingClientRect(); var x = (e.clientX - r.left) / r.width * 240 - cx, y = (e.clientY - r.top) / r.height * 240 - cy; return Math.round(Math.atan2(y, x) * 180 / Math.PI / 5) * 5; }
    var dragging = false;
    svgEl.addEventListener('pointerdown', function (e) { dragging = true; try { svgEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } onSet(fromEvt(e)); });
    svgEl.addEventListener('pointermove', function (e) { if (dragging) onSet(fromEvt(e)); });
    svgEl.addEventListener('pointerup', function () { dragging = false; });
    set(value);
    return { el: svgEl, set: set };
  }

  function stepAxis(host, cleanups) {
    var axisRows = { rows: [[{ lead: 'I', t0: 0.15, t1: 1.45, gap: 4 }, { lead: 'II', t0: 0.15, t1: 1.45, gap: 4 }, { lead: 'aVF', t0: 0.15, t1: 1.45 }]], rowH: 34 };
    var view = EcgView({ layout: axisRows, ariaLabel: 'Leads I, II and aVF for the chosen axis', allowLabels: false, minMobileZoom: 2.6 });
    var pview = EcgView({ layout: axisRows, ariaLabel: 'Leads I, II and aVF for the axis question', allowLabels: false, minMobileZoom: 2.6 });
    cleanups.push(view.destroy, pview.destroy);
    var axis = 60, out = h('div', { 'aria-live': 'polite' });
    var slider = h('input', { type: 'range', id: 'ecg-axis', min: -180, max: 180, step: 5, value: '60' });
    var sliderOut = h('output', { for: 'ecg-axis' }, deg(60));
    var hex = hexaxial(axis, function (v) { slider.value = String(v); setAxis(v); });
    slider.addEventListener('input', function () { setAxis(Number(slider.value)); });
    var practice = h('div', { 'aria-live': 'polite' }), pq = null;
    host.appendChild(h('div.stack',
      h('p', 'The mean QRS axis is the average direction of ventricular depolarisation in the frontal plane. A lead shows a mainly positive QRS when the axis points towards its positive pole.'),
      h('div.table-wrap', h('table.table.ecg-small-table',
        h('thead', h('tr', h('th', 'Lead I'), h('th', 'aVF'), h('th', 'Axis'))),
        h('tbody',
          h('tr', h('td', 'Positive'), h('td', 'Positive'), h('td', 'Normal (0° to +90°)')),
          h('tr', h('td', 'Positive'), h('td', 'Negative'), h('td', 'Check lead II: positive → still normal (0° to −30°); negative → left axis deviation (−30° to −90°)')),
          h('tr', h('td', 'Negative'), h('td', 'Positive'), h('td', 'Right axis deviation (+90° to +180°)')),
          h('tr', h('td', 'Negative'), h('td', 'Negative'), h('td', 'Extreme ("north-west") axis (−90° to ±180°)'))))),
      h('p.small.muted', 'Normal range −30° to +90° (AHA/ACCF/HRS). The most isoelectric limb lead is perpendicular to the axis — a quick way to refine it.'),
      h('div.grid-2',
        h('div', hex.el, h('div.ecg-legend', h('span', '🟩 normal'), h('span', '🟨 left'), h('span', '🟦 right'), h('span', '🟥 extreme'))),
        h('div.stack', { style: '--gap:.6rem' }, h('div.ecg-slider', h('label', { for: 'ecg-axis' }, h('span', 'QRS axis'), sliderOut), slider), out)),
      view.el,
      h('h3', { style: 'margin-top:1rem' }, 'Practice: which quadrant?'),
      h('div.row', h('button.btn', { type: 'button', onclick: newQ }, 'New question')),
      pview.el, practice));
    function setAxis(v) {
      axis = v; sliderOut.textContent = deg(v); hex.set(v);
      var e = E.generate({ params: { axis: v, hr: 60, noise: 0.05 }, durationSec: 2, seed: 5 });
      view.update(e);
      var m = E.measureBeat(e), c = E.classifyAxis(E.estimateAxis(e)), nI = netQRS(m, 'I'), nF = netQRS(m, 'aVF'), nII = netQRS(m, 'II');
      MT.clear(out);
      out.appendChild(MT.ui.alert('info', c.label + ' (' + deg(v) + ')', h('span', 'Lead I ' + (nI >= 0 ? 'positive' : 'negative') + ', aVF ' + (nF >= 0 ? 'positive' : 'negative') + ', II ' + (nII >= 0 ? 'positive' : 'negative') + ' → quadrant reading: ' + quadName(E.quadrant(nI, nF, nII)) + '.')));
    }
    function quadName(q) { return { normal: 'normal', left: 'left axis deviation', right: 'right axis deviation', extreme: 'extreme axis', 'left-or-normal': 'check lead II' }[q] || q; }
    function newQ() {
      var groups = [[-25, 85], [-85, -35], [95, 175], [-175, -95]], gsel = pick(groups), a = Math.round((gsel[0] + Math.random() * (gsel[1] - gsel[0])) / 5) * 5;
      var e = E.generate({ params: { axis: a, hr: 60, noise: 0.15 }, durationSec: 2, seed: newSeed() });
      pq = { axis: a, cls: E.classifyAxis(a).id };
      pview.update(e); MT.clear(practice);
      var row = h('div.row', { role: 'group', 'aria-label': 'Choose the axis' });
      [['normal', 'Normal'], ['left', 'Left axis deviation'], ['right', 'Right axis deviation'], ['extreme', 'Extreme axis']].forEach(function (o) {
        row.appendChild(h('button.btn', { type: 'button', onclick: function () {
          var ok = o[0] === pq.cls;
          MT.$$('button', row).forEach(function (b) { b.disabled = true; });
          practice.appendChild(MT.ui.alert(ok ? 'ok' : 'warn', (ok ? 'Correct: ' : 'Not quite: ') + E.classifyAxis(pq.axis).label + ' (' + deg(pq.axis) + ').', 'Look at the net QRS in I and aVF first, then lead II if I is positive and aVF negative.'));
        } }, o[1]));
      });
      practice.appendChild(row);
    }
    setAxis(60); newQ();
  }

  function stepIntervals(host, cleanups) {
    var demo = E.generate({ params: { hr: 60, noise: 0, uAmp: 0.06 }, durationSec: 3, seed: 3 });
    var b = demo.annotations.beats.filter(function (x) { return x.qrsOn > 0.5; })[0];
    var t0 = Math.max(0, b.qrsOn - b.pr / 1000 - 0.08), t1 = Math.min(demo.durationSec, b.tEnd + 0.24);
    var view = EcgView({ layout: { rows: [[{ lead: 'II', t0: t0, t1: t1 }]], rowH: 34 }, ariaLabel: 'One annotated beat in lead II', allowLabels: false, minMobileZoom: 4 });
    cleanups.push(view.destroy);
    host.appendChild(h('div.stack',
      h('div.table-wrap', h('table.table.ecg-small-table',
        h('thead', h('tr', h('th', 'Interval'), h('th', 'Measured from → to'), h('th', 'Normal (adults)'))),
        h('tbody',
          h('tr', h('td', 'P wave'), h('td', 'P onset → P end'), h('td', '< 120 ms; < 2.5 mm tall in II')),
          h('tr', h('td', 'PR interval'), h('td', 'P onset → QRS onset'), h('td', '120–200 ms (3–5 small squares)')),
          h('tr', h('td', 'QRS'), h('td', 'QRS onset → J point'), h('td', '< 120 ms (usually ≤ 100–110 ms)')),
          h('tr', h('td', 'QT'), h('td', 'QRS onset → end of T (tangent method, in II or V5)'), h('td', 'Rate-dependent → correct it: QTc < 450 ms (men), < 460 ms (women); > 500 ms high risk; < 360 ms short'))))),
      view.el,
      h('h3', { style: 'margin-top:1rem' }, 'QTc calculator'),
      qtcCalculator(),
      h('p.small.muted', 'Formulas (QT in ms, RR in s): Bazett QT/√RR (1920); Fridericia QT/∛RR (1920); Framingham QT + 154 × (1 − RR) (Sagie 1992); Hodges QT + 1.75 × (HR − 60) (Hodges 1983). Bazett over-corrects at fast and under-corrects at slow heart rates. Limits: AHA/ACCF/HRS 2009 (Rautaharju).')));
    view.update(demo, { overlay: function (g, L) {
      var p = L.panels[0], X = function (t) { return p.x + (t - p.t0) * SPEED; }, y0 = p.y;
      var pOn = b.qrsOn - b.pr / 1000, items = [
        { a: pOn, b: b.qrsOn, y: y0 + 6, t: 'PR ' + b.pr + ' ms' },
        { a: b.qrsOn, b: b.qrsOff, y: y0 + 10.5, t: 'QRS ' + b.qrs + ' ms' },
        { a: b.qrsOn, b: b.tEnd, y: y0 + 15, t: 'QT ' + b.qt + ' ms' }
      ];
      items.forEach(function (it) {
        g.appendChild(S('path', { class: 'ecg-bracket', d: 'M' + X(it.a) + ' ' + (it.y - 1.2) + 'V' + it.y + 'H' + X(it.b) + 'V' + (it.y - 1.2) }));
        g.appendChild(S('text', { class: 'ecg-guide-text', x: (X(it.a) + X(it.b)) / 2, y: it.y + 3, 'text-anchor': 'middle', 'font-size': 2.4 }, it.t));
      });
      [['P', pOn + 0.05, -4.5], ['QRS', b.qrsOn + 0.045, -15], ['ST', (b.qrsOff + b.tPeak) / 2 - 0.04, -3.5], ['T', b.tPeak, -6.5], ['U', b.tEnd + 0.085, -3]].forEach(function (w) {
        g.appendChild(S('text', { class: 'ecg-guide-text', x: X(w[1]), y: y0 + w[2], 'text-anchor': 'middle', 'font-size': 2.6 }, w[0]));
      });
    } });
  }

  function qtcCalculator() {
    var qt = numberField('ecg-qt', 'QT', 400, { unit: 'ms', min: 200, max: 800 });
    var hr = numberField('ecg-hr', 'Heart rate', 75, { unit: '/min', min: 20, max: 250, hint: 'or R–R = 60000 ÷ rate (ms)' });
    var sex = 'male', res = h('div', { 'aria-live': 'polite' });
    var sexCtl = MT.ui.segmented([{ value: 'male', label: 'Man' }, { value: 'female', label: 'Woman' }], sex, function (v) { sex = v; calc(); });
    function calc() {
      MT.clear(res);
      var q = MT.num(qt.input.value), r = MT.num(hr.input.value);
      if (q == null || r == null || q < 150 || q > 900 || r < 15 || r > 300) { res.appendChild(h('div.result.empty', 'Enter a QT (150–900 ms) and heart rate (15–300/min).')); return; }
      var rr = 60000 / r, limit = sex === 'female' ? 460 : 450;
      var rows = [['Bazett', 'bazett'], ['Fridericia', 'fridericia'], ['Framingham', 'framingham'], ['Hodges', 'hodges']].map(function (m) { return { name: m[0], v: E.qtc(q, rr, m[1]) }; });
      var f = rows[1].v, band = f > 500 ? 'danger' : f >= limit ? 'warn' : f < 360 ? 'warn' : 'ok';
      var title = f > 500 ? 'Markedly prolonged (> 500 ms): high risk of torsades' : f >= limit ? 'Prolonged (≥ ' + limit + ' ms)' : f < 360 ? 'Short (< 360 ms): consider short-QT causes' : 'Within the reference range';
      res.appendChild(h('div.result.band-' + band,
        h('div.result-label', 'QTc (Fridericia)'), h('div.result-value', Math.round(f), h('span.unit', 'ms')), h('div.result-title', title),
        h('dl.ecg-kv', rows.map(function (x) { return [h('dt', x.name), h('dd', Math.round(x.v) + ' ms')]; }), h('dt', 'R–R'), h('dd', Math.round(rr) + ' ms')),
        h('p.small', { style: 'margin:.5rem 0 0' }, 'Interpretation uses Fridericia; formulas disagree most at heart rates far from 60/min. Always check electrolytes and drugs when the QTc is long.')));
    }
    [qt.input, hr.input].forEach(function (i) { i.addEventListener('input', calc); });
    var wrap = h('div.stack', h('div.form-grid.cols-2', qt.el, hr.el), h('div.field', h('div.field-label', 'Sex (for the limit)'), sexCtl), res);
    calc();
    return wrap;
  }

  function stepHypertrophy(host, cleanups) {
    var view = EcgView({ layout: 'standard', ariaLabel: 'Example 12-lead ECG for voltage criteria', allowLabels: false });
    cleanups.push(view.destroy);
    var f = {
      sV1: numberField('ecg-sv1', 'S in V1', '', { unit: 'mm', min: 0, max: 80 }), rV5: numberField('ecg-rv5', 'R in V5', '', { unit: 'mm', min: 0, max: 80 }),
      rV6: numberField('ecg-rv6', 'R in V6', '', { unit: 'mm', min: 0, max: 80 }), rAVL: numberField('ecg-ravl', 'R in aVL', '', { unit: 'mm', min: 0, max: 50 }),
      sV3: numberField('ecg-sv3', 'S in V3', '', { unit: 'mm', min: 0, max: 80 }), qrs: numberField('ecg-qrsd', 'QRS duration', '', { unit: 'ms', min: 40, max: 250 })
    };
    var sex = 'male', res = h('div', { 'aria-live': 'polite' });
    var sexCtl = MT.ui.segmented([{ value: 'male', label: 'Man' }, { value: 'female', label: 'Woman' }], sex, function (v) { sex = v; calc(); });
    host.appendChild(h('div.stack',
      h('div.table-wrap', h('table.table.ecg-small-table',
        h('thead', h('tr', h('th', 'Criterion'), h('th', 'Positive if'))),
        h('tbody',
          h('tr', h('td', 'Sokolow–Lyon (LVH)'), h('td', 'S(V1) + R(V5 or V6) ≥ 35 mm, or R(aVL) ≥ 11 mm')),
          h('tr', h('td', 'Cornell voltage (LVH)'), h('td', 'R(aVL) + S(V3) > 28 mm in men, > 20 mm in women')),
          h('tr', h('td', 'Cornell product (LVH)'), h('td', '(R aVL + S V3, + 6 mm in women) × QRS duration > 2440 mm·ms')),
          h('tr', h('td', 'Right ventricular hypertrophy'), h('td', 'R(V1) ≥ 7 mm or R/S in V1 > 1, R(V1) + S(V5 or V6) > 10.5 mm, right axis deviation, right atrial abnormality')),
          h('tr', h('td', 'Left atrial abnormality'), h('td', 'P ≥ 120 ms, notched in II; terminal negative P in V1 ≥ 1 mm deep and ≥ 40 ms')),
          h('tr', h('td', 'Right atrial abnormality'), h('td', 'P ≥ 2.5 mm tall in II (P pulmonale)'))))),
      h('p.small.muted', 'Sources: Sokolow & Lyon 1949; Casale et al. 1985; Molloy et al. 1992; Hancock et al. AHA/ACCF/HRS 2009. Voltage criteria are specific but insensitive — echocardiography is the reference.'),
      h('div.row', h('button.btn', { type: 'button', onclick: function () { example('lvh'); } }, 'Measure an LVH example'), h('button.btn', { type: 'button', onclick: function () { example('normal'); } }, 'Measure a normal example')),
      view.el,
      h('div.form-grid.cols-2', f.sV1.el, f.rV5.el, f.rV6.el, f.rAVL.el, f.sV3.el, f.qrs.el),
      h('div.field', h('div.field-label', 'Sex (Cornell thresholds)'), sexCtl), res));
    Object.keys(f).forEach(function (k) { f[k].input.addEventListener('input', calc); });
    function val(k) { return MT.num(f[k].input.value); }
    function calc() {
      MT.clear(res);
      var sl = E.sokolowLyon(val('sV1'), val('rV5'), val('rV6')), co = E.cornell(val('rAVL'), val('sV3'), sex), cp = E.cornellProduct(val('rAVL'), val('sV3'), sex, val('qrs'));
      if (!sl && !co) { res.appendChild(h('div.result.empty', 'Enter the amplitudes (mm) or measure an example.')); return; }
      var avl = val('rAVL'), anyPos = (sl && sl.positive) || (co && co.positive) || (cp && cp.positive) || (avl != null && avl >= 11);
      res.appendChild(h('div.result.' + (anyPos ? 'band-warn' : 'band-ok'),
        h('div.result-title', anyPos ? 'Meets at least one LVH voltage criterion' : 'No LVH voltage criterion met'),
        h('dl.ecg-kv',
          sl ? [h('dt', 'Sokolow–Lyon'), h('dd', MT.fmt(sl.value, 1) + ' mm — ' + (sl.positive ? 'positive (≥ 35)' : 'negative'))] : null,
          avl != null ? [h('dt', 'R(aVL)'), h('dd', MT.fmt(avl, 1) + ' mm — ' + (avl >= 11 ? 'positive (≥ 11)' : 'negative'))] : null,
          co ? [h('dt', 'Cornell voltage'), h('dd', MT.fmt(co.value, 1) + ' mm — ' + (co.positive ? 'positive (> ' + co.threshold + ')' : 'negative (threshold ' + co.threshold + ')'))] : null,
          cp ? [h('dt', 'Cornell product'), h('dd', Math.round(cp.value) + ' mm·ms — ' + (cp.positive ? 'positive (> 2440)' : 'negative'))] : null)));
    }
    function example(id) {
      var seed = newSeed(), e = E.generate({ diagnosis: id, params: Object.assign(E.variant(id, seed) || {}, { noise: 0.1 }), seed: seed }), m = E.measureBeat(e);
      view.update(e, { highlight: { primary: ['V1', 'V3', 'V5', 'V6', 'aVL'] } });
      f.sV1.input.value = MT.fmt(m.V1.s * GAIN, 1); f.rV5.input.value = MT.fmt(m.V5.r * GAIN, 1); f.rV6.input.value = MT.fmt(m.V6.r * GAIN, 1);
      f.rAVL.input.value = MT.fmt(m.aVL.r * GAIN, 1); f.sV3.input.value = MT.fmt(m.V3.s * GAIN, 1); f.qrs.input.value = String(e.annotations.intervals.qrs);
      calc();
    }
    example('lvh');
  }

  function stepIschaemia(host, cleanups) {
    var view = EcgView({ layout: 'standard', ariaLabel: '12-lead ECG with highlighted territories', allowLabels: false });
    cleanups.push(view.destroy);
    var info = h('div', { 'aria-live': 'polite' }), cur = 'stemi-inferior';
    var opts = [{ value: 'stemi-anterior', label: 'Anterior' }, { value: 'stemi-inferior', label: 'Inferior' }, { value: 'stemi-lateral', label: 'Lateral' }, { value: 'stemi-posterior', label: 'Posterior' }, { value: 'pericarditis', label: 'Mimic: pericarditis' }];
    var T = E.TERRITORIES;
    host.appendChild(h('div.stack',
      h('div.table-wrap', h('table.table.ecg-small-table',
        h('thead', h('tr', h('th', 'Territory'), h('th', 'Leads'), h('th', 'Usual artery'), h('th', 'Reciprocal change'))),
        h('tbody',
          h('tr', h('td', 'Inferior'), h('td', T.inferior.leads.join(', ')), h('td', T.inferior.artery), h('td', 'aVL (± I)')),
          h('tr', h('td', 'Lateral'), h('td', T.lateral.leads.join(', ')), h('td', T.lateral.artery), h('td', 'III, aVF')),
          h('tr', h('td', 'Septal / anterior'), h('td', 'V1–V2 / V3–V4'), h('td', T.anterior.artery), h('td', 'III, aVF (proximal LAD)')),
          h('tr', h('td', 'Posterior'), h('td', 'V7–V9'), h('td', T.posterior.artery), h('td', 'ST depression, tall R, upright T in V1–V3')),
          h('tr', h('td', 'Right ventricle'), h('td', 'V4R (right-sided leads)'), h('td', T.rightVentricle.artery), h('td', '—'))))),
      MT.ui.alert('info', 'STEMI thresholds (Fourth Universal Definition of MI, 2018)', 'New ST elevation at the J point in ≥ 2 contiguous leads: ≥ 1 mm in all leads other than V2–V3; in V2–V3 ≥ 2 mm in men ≥ 40 y, ≥ 2.5 mm in men < 40 y, ≥ 1.5 mm in women. Posterior V7–V9 ≥ 0.5 mm.'),
      h('div', h('div.field-label', 'Show a territory'), MT.ui.segmented(opts, cur, function (v) { cur = v; show(); })),
      view.el,
      h('div.ecg-legend', h('span', h('span.ecg-sw.ecg-sw-elev'), 'ST elevation (ST ↑)'), h('span', h('span.ecg-sw.ecg-sw-recip'), 'Reciprocal ST depression (ST ↓)')),
      info));
    function show() {
      var dx = E.byId(cur), seed = newSeed(), e = E.generate({ diagnosis: cur, params: { noise: 0.15 }, seed: seed }), m = E.measureBeat(e);
      view.update(e, { highlight: dx.highlight || null, ariaLabel: '12-lead ECG: ' + dx.name });
      var hl = dx.highlight || {}, list = function (leads) { return leads.map(function (l) { return l + ' ' + (m[l].st >= 0 ? '+' : '−') + mm(Math.abs(m[l].st)) + ' mm'; }).join(', '); };
      MT.clear(info);
      info.appendChild(h('div.card.card-soft', h('h3', { style: 'margin-top:0' }, dx.name), h('p', dx.summary),
        hl.elevation ? h('p', h('strong', 'ST elevation: '), list(hl.elevation)) : null,
        hl.reciprocal ? h('p', h('strong', cur === 'stemi-posterior' ? 'ST depression (posterior mirror): ' : 'Reciprocal: '), list(hl.reciprocal)) : null,
        ul(dx.pearls), h('a', { href: '#/ecg-lab/' + slug(cur) }, 'Open in ECG Lab →')));
    }
    show();
  }

  function stepBBB(host, cleanups) {
    var rows = { rows: [[{ lead: 'I', t0: 0, t1: 2.5, gap: 4 }, { lead: 'V1', t0: 0, t1: 2.5, gap: 4 }, { lead: 'V6', t0: 0, t1: 2.5 }]], rowH: 36 };
    var view = EcgView({ layout: rows, ariaLabel: 'Leads I, V1 and V6', allowLabels: false });
    cleanups.push(view.destroy);
    var cur = 'rbbb', info = h('div', { 'aria-live': 'polite' });
    host.appendChild(h('div.stack',
      h('div.grid-2',
        h('div.card.card-soft', h('h3', { style: 'margin-top:0' }, 'Right bundle branch block'), ul(['QRS ≥ 120 ms.', 'rsr′, rsR′ or rSR′ in V1/V2 (R′ usually wider than r) — "M" in V1.', 'S wave in I and V6 longer than the R wave or > 40 ms — "W" in V6.', 'R-peak time > 50 ms in V1; normal in V5–V6.', 'Secondary ST–T changes in V1–V3.']), h('p.small.muted', 'Mnemonic: MaRRoW.')),
        h('div.card.card-soft', h('h3', { style: 'margin-top:0' }, 'Left bundle branch block'), ul(['QRS ≥ 120 ms.', 'Broad notched or slurred R in I, aVL, V5–V6 ("M" in V6).', 'No septal q waves in I, V5, V6.', 'Deep S/QS in V1–V3 ("W" in V1); R-peak time > 60 ms in V5–V6.', 'ST and T opposite to the main QRS deflection.']), h('p.small.muted', 'Mnemonic: WiLLiaM.'))),
      h('p.small.muted', 'Criteria: Surawicz et al., AHA/ACCF/HRS recommendations Part III (2009). QRS 110–119 ms with the same pattern = incomplete bundle branch block.'),
      h('div', h('div.field-label', 'Compare'), MT.ui.segmented([{ value: 'normal', label: 'Normal' }, { value: 'rbbb', label: 'RBBB' }, { value: 'lbbb', label: 'LBBB' }], cur, function (v) { cur = v; show(); })),
      view.el, info));
    function show() {
      var dx = E.byId(cur), e = E.generate({ diagnosis: cur, params: { noise: 0.1, hr: 70 }, seed: 9 });
      view.update(e, { ariaLabel: 'Leads I, V1 and V6: ' + dx.name });
      MT.clear(info);
      info.appendChild(h('p', h('strong', dx.name + ': '), 'QRS ' + e.annotations.intervals.qrs + ' ms. ' + dx.key.charAt(0).toUpperCase() + dx.key.slice(1) + '. ', h('a', { href: '#/ecg-lab/' + slug(cur) }, 'See the full 12-lead →')));
    }
    show();
  }

  function stepReport(host) {
    var template = ['Rate: __ /min (ventricular); atrial __ /min', 'Rhythm: __ (regular? P waves? P:QRS relationship?)', 'Axis: __° (normal / left / right / extreme)', 'Intervals: PR __ ms, QRS __ ms, QT __ ms, QTc __ ms (formula: __)', 'P waves: __ (atrial abnormality?)', 'QRS: __ (voltage, Q waves, bundle branch block, R-wave progression)', 'ST segments: __ (elevation/depression, territory, reciprocal change)', 'T waves: __ (inversion, peaked, flat); U waves: __', 'Conclusion: __', 'Compared with previous ECG: __'].join('\n');
    host.appendChild(h('div.stack',
      h('p', 'A complete report covers every step in the same order every time — that habit is what stops you missing the second abnormality.'),
      h('ol', ['Check the patient details, date, calibration (10 mm/mV) and paper speed (25 mm/s).', 'Rate.', 'Rhythm.', 'Axis.', 'Intervals: PR, QRS, QT/QTc.', 'P-wave morphology.', 'QRS morphology: voltage, Q waves, R-wave progression, bundle branch block.', 'ST segments and T (and U) waves.', 'Conclusion, linked to the clinical question — and compare with previous ECGs.'].map(function (x) { return h('li', x); })),
      h('div.field', h('label', { for: 'ecg-template' }, 'Report template'), h('textarea', { id: 'ecg-template', class: 'input', rows: 10, readOnly: true, style: 'font-family:var(--mono);font-size:.88rem' }, template)),
      h('div.row', h('button.btn', { type: 'button', onclick: function () { MT.copy(template); } }, 'Copy template'), h('a.btn.btn-primary', { href: '#/ecg-quiz' }, 'Practise on random cases →'), h('a.btn', { href: '#/ecg-lab' }, 'Open the ECG Lab'))));
  }

  var STEP_RENDER = { rate: stepRate, rhythm: stepRhythm, axis: stepAxis, intervals: stepIntervals, hypertrophy: stepHypertrophy, ischaemia: stepIschaemia, bbb: stepBBB, report: stepReport };

  MT.registerTool({
    id: 'ecg-systematic', title: 'Systematic ECG reading', category: 'ecg', icon: '🧭', order: 3,
    description: 'A step-by-step interpretation tutor: rate methods, rhythm questions, axis by quadrants, intervals and QTc, hypertrophy, ischaemic territories and bundle branch blocks.',
    keywords: ['ecg', 'ekg', 'systematic', 'interpretation', 'axis', 'qtc', 'sokolow', 'cornell', 'territories', 'bundle branch', '300 rule', '1500 rule'],
    render: function (container, ctx) {
      var st = load(KEYS.sys, { v: 1, step: 'rate' });
      var stepId = ctx.params[0] && STEP_RENDER[ctx.params[0]] ? ctx.params[0] : (STEP_RENDER[st.step] ? st.step : 'rate');
      var cleanups = [], body = h('section.card', { 'aria-live': 'off' }), tabsHost = h('div'), nav = h('div.ecg-nav');
      container.appendChild(tabsHost); container.appendChild(body); container.appendChild(nav);
      container.appendChild(MT.ui.disclaimer('Educational tutor using synthetic tracings. Thresholds are cited from the AHA/ACCF/HRS standardisation statements, the Fourth Universal Definition of MI and the original papers.'));
      function runCleanups() { cleanups.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); cleanups = []; }
      function go(id, focus) {
        runCleanups();
        stepId = id; st.step = id; save(KEYS.sys, st);
        try { history.replaceState(null, '', '#/ecg-systematic/' + id); } catch (e) { /* ignore */ }
        var i = STEPS.map(function (s) { return s.id; }).indexOf(id);
        MT.clear(tabsHost);
        tabsHost.appendChild(MT.ui.tabs(STEPS.map(function (s, k) { return { id: s.id, label: (k + 1) + ' · ' + s.title }; }), id, function (v) { go(v, true); }));
        MT.clear(body);
        var heading = h('h2', { tabindex: '-1', style: 'font-size:1.2rem' }, 'Step ' + (i + 1) + ' of ' + STEPS.length + ': ' + STEPS[i].title);
        body.appendChild(heading);
        STEP_RENDER[id](body, cleanups);
        MT.clear(nav);
        nav.appendChild(i > 0 ? h('button.btn', { type: 'button', onclick: function () { go(STEPS[i - 1].id, true); } }, '← ' + STEPS[i - 1].title) : h('span'));
        nav.appendChild(i < STEPS.length - 1 ? h('button.btn.btn-primary', { type: 'button', onclick: function () { go(STEPS[i + 1].id, true); } }, STEPS[i + 1].title + ' →') : h('a.btn.btn-primary', { href: '#/ecg-quiz' }, 'Start the quiz →'));
        if (focus) { try { heading.focus({ preventScroll: true }); } catch (e) { /* ignore */ } var top = body.getBoundingClientRect().top + (self.pageYOffset || 0) - 80; self.scrollTo(0, Math.max(0, top - 60)); }
      }
      go(stepId, false);
      return runCleanups;
    }
  });

  /* ====================================================================== search */
  MT.registerSearch(function (q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return E.DIAGNOSES.filter(function (d) {
      var hay = (d.name + ' ' + d.short + ' ' + d.summary + ' ' + groupTitle(d.group) + ' ecg').toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) >= 0; });
    }).slice(0, 8).map(function (d) { return { title: d.name, description: 'ECG Lab · ' + d.summary, href: '#/ecg-lab/' + slug(d.id), icon: '💓' }; });
  });
})();

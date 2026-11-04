/* ==========================================================================
   Medical Student Studio — Physiology Lab (package S2)
   Seven interactive simulators built on MTLib.physiology (student/lib/physiology.js):
     #/o2-curve          oxygen–haemoglobin dissociation, content and delivery
     #/membrane          Nernst & Goldman–Hodgkin–Katz membrane potential
     #/action-potential  Hodgkin–Huxley (1952) action potential, RK4
     #/pv-loop           left-ventricular pressure–volume loop (time-varying elastance)
     #/renal             clearance, RPF/RBF, FENa, free water, glucose titration
     #/respiratory       alveolar gas, A–a gradient, shunt vs V/Q, ventilation & dead space
     #/acid-base-sim     Henderson–Hasselbalch & Davenport diagram (physiology, not ABG interpretation)
   Every tool: sliders/inputs, live chart, "What's happening", guided "Try this"
   experiments, concept-check MCQs and references. State is saved under
   student.physiology.state and quiz answers under student.physiology.quiz.
   Sub-routes: #/<tool>/<scenario-or-tab> (e.g. #/o2-curve/co, #/renal/glucose).
   ========================================================================== */
(function () {
  'use strict';
  if (typeof MT === 'undefined') return;
  var h = MT.h;
  var P = (self.MTLib && self.MTLib.physiology) || null;
  var CAT = 'physiology';
  var STATE_KEY = 'student.physiology.state', QUIZ_KEY = 'student.physiology.quiz';
  var KPA = 0.1333224;

  /* ------------------------------------------------------------------ CSS */
  MT.css('pl', [
    '.pl-page{display:flex;flex-direction:column;gap:16px}',
    '.pl-sim{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}',
    '@media (min-width:1000px){.pl-sim{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start}.pl-sim>.pl-stage{grid-column:1;grid-row:1/span var(--rows,3)}.pl-sim>:not(.pl-stage){grid-column:2}.pl-sim>.pl-stage.pl-sticky{position:sticky;top:calc(var(--header-h) + 12px)}.pl-sim>.pl-full{grid-column:1/-1}}',
    '@media (max-width:640px){.pl-chips{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin:0 -16px;padding:2px 16px 4px;scroll-padding-left:16px}.pl-chips::-webkit-scrollbar{display:none}.pl-chips .chip{flex:none}}',
    '.pl-sim>*{min-width:0}',
    '.pl-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin:0 0 .6rem}',
    '.pl-head h2,.pl-head h3{margin:0;font-size:1.05rem}',
    '.pl-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.pl-chips .chip{min-height:40px;padding:6px 12px}',
    '.pl-scen-note{margin:.5rem 0 .6rem;font-size:.88rem;color:var(--text-2);line-height:1.4}',
    '.pl-chart{width:100%;min-height:180px;position:relative}',
    '.pl-chart+.pl-chart{margin-top:10px}',
    '.pl-chart .mt-chart text.pl-lbl{font-size:10.5px;font-weight:700}',
    '.pl-chart-note{font-size:.8rem;color:var(--muted);margin:.35rem 0 0}',
    '.pl-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;margin-top:12px}',
    '.pl-stat{background:var(--surface-2);border-radius:10px;padding:8px 10px;min-width:0;border-left:3px solid transparent}',
    '.pl-stat[data-flag="warn"]{border-left-color:var(--warn)}.pl-stat[data-flag="danger"]{border-left-color:var(--danger)}.pl-stat[data-flag="ok"]{border-left-color:var(--ok)}',
    '.pl-stat-l{font-size:.72rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.25}',
    '.pl-stat-v{font-size:1.25rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;margin-top:2px;overflow-wrap:anywhere}',
    '.pl-stat-v .u{font-size:.78rem;font-weight:600;color:var(--muted);margin-left:.2rem}',
    '.pl-stat-s{font-size:.78rem;color:var(--text-2);line-height:1.3;margin-top:2px}',
    '.pl-stat-f{font-size:.72rem;font-weight:800;margin-left:.3rem;white-space:nowrap}',
    '.pl-stat[data-flag="warn"] .pl-stat-f{color:var(--warn)}.pl-stat[data-flag="danger"] .pl-stat-f{color:var(--danger)}.pl-stat[data-flag="ok"] .pl-stat-f{color:var(--ok)}',
    '.pl-controls{display:flex;flex-direction:column;gap:10px}',
    '.pl-group{display:flex;flex-direction:column;gap:8px}',
    '.pl-group+.pl-group{border-top:1px solid var(--border);padding-top:10px}',
    '.pl-group-t{font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:750;margin:0}',
    '.pl-slider{display:flex;flex-direction:column;gap:0}',
    '.pl-sl-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}',
    '.pl-sl-head label{font-weight:600;font-size:.92rem;line-height:1.25}',
    '.pl-sl-val{display:inline-flex;align-items:center;gap:.3rem;flex:none}',
    '.pl-num{width:5.4em;min-height:40px;padding:4px 8px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);font:inherit;font-size:.95rem;text-align:right;font-variant-numeric:tabular-nums}',
    '.pl-num:focus{border-color:var(--accent);box-shadow:var(--focus);outline:none}',
    '.pl-sl-unit{color:var(--muted);font-size:.8rem;min-width:2.6em}',
    '.pl-range{-webkit-appearance:none;appearance:none;width:100%;height:40px;background:transparent;margin:0;cursor:pointer;--pct:50%}',
    '.pl-range:focus{outline:none}',
    '.pl-range::-webkit-slider-runnable-track{height:6px;border-radius:99px;background:linear-gradient(to right,var(--accent) 0,var(--accent) var(--pct),var(--surface-3) var(--pct))}',
    '.pl-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-9px;border-radius:50%;background:var(--accent);border:3px solid var(--surface);box-shadow:0 0 0 1px var(--accent),0 1px 3px rgba(0,0,0,.25)}',
    '.pl-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 1px var(--accent),var(--focus)}',
    '.pl-range::-moz-range-track{height:6px;border-radius:99px;background:var(--surface-3)}',
    '.pl-range::-moz-range-progress{height:6px;border-radius:99px;background:var(--accent)}',
    '.pl-range::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--accent);border:3px solid var(--surface);box-shadow:0 0 0 1px var(--accent)}',
    '.pl-range:focus-visible::-moz-range-thumb{box-shadow:0 0 0 1px var(--accent),var(--focus)}',
    '.pl-hint{color:var(--muted);font-size:.8rem;line-height:1.35}',
    '.pl-check{padding:8px 10px;min-height:40px;align-items:center}',
    '.pl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.pl-seg button{min-height:36px}',
    '.pl-what{font-size:.95rem;line-height:1.55}',
    '.pl-what p{margin:0 0 .65em}.pl-what p:last-child{margin-bottom:0}',
    '.pl-what ul{margin:0 0 .65em}',
    '.pl-what .pl-warnline{color:var(--danger);font-weight:650}',
    '.pl-what strong{font-variant-numeric:tabular-nums}',
    '.pl-try-item{border:1px solid var(--border);border-radius:10px;padding:10px 12px}',
    '.pl-try-item+.pl-try-item{margin-top:8px}',
    '.pl-try-t{font-weight:700;margin:0 0 .25rem;display:flex;gap:.4rem;align-items:baseline;justify-content:space-between}',
    '.pl-try-done{font-size:.78rem;color:var(--ok);font-weight:700;white-space:nowrap}',
    '.pl-try-p{margin:0 0 .5rem;font-size:.92rem;color:var(--text-2)}',
    '.pl-try-obs{margin-top:8px;padding:8px 10px;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0;font-size:.92rem}',
    '.pl-btns{display:flex;flex-wrap:wrap;gap:6px}',
    '.pl-btns .btn{min-height:40px}',
    '.pl-q{padding:12px 0;border-top:1px solid var(--border)}.pl-q:first-of-type{border-top:0;padding-top:4px}',
    '.pl-q-stem{font-weight:650;margin:0 0 .5rem}',
    '.pl-opts{display:grid;gap:6px}',
    '.btn.pl-opt{white-space:normal;text-align:left;justify-content:flex-start;line-height:1.35;padding:8px 12px;min-height:44px;font-weight:550;height:auto}',
    '.btn.pl-opt[data-state="correct"]{border-color:var(--ok-border);background:var(--ok-soft)}',
    '.btn.pl-opt[data-state="wrong"]{border-color:var(--danger-border);background:var(--danger-soft)}',
    '.btn.pl-opt:disabled{opacity:1;cursor:default}',
    '.pl-opt .pl-mark{margin-left:auto;padding-left:.6rem;font-weight:800;white-space:nowrap}',
    '.pl-opt[data-state="correct"] .pl-mark{color:var(--ok)}.pl-opt[data-state="wrong"] .pl-mark{color:var(--danger)}',
    '.pl-fb{margin-top:8px;font-size:.92rem}',
    '.pl-fb:empty{display:none}',
    '.pl-quiz-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:10px;border-top:1px solid var(--border)}',
    '.pl-formula{font-family:var(--mono);font-size:.86rem;background:var(--surface-2);border-radius:8px;padding:8px 10px;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.pl-refs li{overflow-wrap:anywhere}',
    '.pl-table{width:100%;border-collapse:collapse;font-size:.9rem}',
    '.pl-table th,.pl-table td{padding:6px 8px;border-bottom:1px solid var(--border);text-align:left}',
    '.pl-table td.n,.pl-table th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.pl-table th{font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}',
    '.pl-ruler text{fill:var(--text-2);font-size:11px}',
    '.pl-ruler .pl-tick{stroke:var(--chart-axis)}',
    '.pl-bar{display:flex;height:28px;border-radius:8px;overflow:hidden;background:var(--surface-3)}',
    '.pl-bar>span{display:flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;min-width:0}',
    '.pl-perf{font-size:.76rem;color:var(--muted);margin:.4rem 0 0}',
    '.pl-tabs{margin-bottom:12px}',
    '.pl-phase{font-weight:700;color:var(--accent-text)}',
    '@media (max-width:520px){.pl-stat-v{font-size:1.12rem}.pl-num{width:4.8em}}'
  ].join('\n'));

  /* ------------------------------------------------------------------ helpers */
  function fmt(x, dp) { return MT.fmt(x, dp == null ? 0 : dp); }
  function kpa(mmHg, dp) { return MT.fmt(mmHg * KPA, dp == null ? 1 : dp); }
  function sgn(x, dp) { return MT.fmt(x, dp == null ? 0 : dp, { sign: true }).replace(/^-/, '−'); }
  function minus(s) { return String(s).replace(/^-/, '−'); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function assign() { var o = {}; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; if (a) Object.keys(a).forEach(function (k) { o[k] = a[k]; }); } return o; }
  function reducedMotion() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /** Run fn at most once per animation frame. */
  function frameScheduler(fn) {
    var pending = false, id = 0, dead = false;
    function run() { pending = false; if (!dead) fn(); }
    function trigger() {
      if (pending || dead) return; pending = true;
      id = (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(run);
    }
    trigger.cancel = function () { dead = true; (window.cancelAnimationFrame || clearTimeout)(id); };
    return trigger;
  }
  function debounce(fn, ms) {
    var t = 0;
    function d() { clearTimeout(t); t = setTimeout(fn, ms); }
    d.cancel = function () { clearTimeout(t); };
    d.now = function () { clearTimeout(t); fn(); };
    return d;
  }

  /* ---------- persistence (versioned, validated) ---------- */
  function loadToolState(id) {
    var all = MT.store.get(STATE_KEY, null);
    if (!all || typeof all !== 'object' || all.v !== 1 || !all.tools || typeof all.tools !== 'object') return null;
    var s = all.tools[id];
    return (s && typeof s === 'object' && !Array.isArray(s)) ? s : null;
  }
  var saveTimers = {};
  function saveToolState(id, state) {
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function () {
      MT.store.update(STATE_KEY, null, function (all) {
        if (!all || typeof all !== 'object' || all.v !== 1 || !all.tools || typeof all.tools !== 'object') all = { v: 1, tools: {} };
        all.tools[id] = state; return all;
      });
    }, 400);
  }
  /** Merge a saved state into defaults, keeping only valid values. schema: key → {min,max} | {enum:[...]} */
  function sanitize(saved, defaults, schema) {
    var out = assign(defaults);
    if (!saved) return out;
    Object.keys(defaults).forEach(function (k) {
      var v = saved[k], d = defaults[k], sc = schema && schema[k];
      if (typeof d === 'number') { if (isNum(v) && (!sc || sc.min == null || (v >= sc.min && v <= sc.max))) out[k] = v; }
      else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (typeof d === 'string') { if (typeof v === 'string' && (!sc || !sc.enum || sc.enum.indexOf(v) >= 0)) out[k] = v; }
    });
    return out;
  }

  /* ---------- controls ---------- */
  function dpOf(def, v) {
    if (def.dp != null) return def.dp;
    var a = Math.abs(v);
    return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  }
  function fmtVal(def, v) { return minus(MT.fmt(v, dpOf(def, v), def.trim ? { trim: true } : null)); }
  /**
   * Slider with an editable number box. def: { label, min, max, step, unit, dp, log, hint }
   * Returns { el, set(v), get() }.
   */
  function slider(def, value, onInput) {
    var id = MT.uid('pl-s');
    var lmin = def.log ? Math.log(def.min) / Math.LN10 : 0, lmax = def.log ? Math.log(def.max) / Math.LN10 : 0;
    var cur = value;
    var range = h('input.pl-range', { type: 'range', id: id, min: def.log ? '0' : String(def.min), max: def.log ? '1000' : String(def.max), step: def.log ? '1' : String(def.step || 1), 'aria-describedby': def.hint ? id + '-h' : null });
    var num = h('input.pl-num', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': def.label + (def.unit ? ' (' + def.unit + ')' : '') + ', exact value' });
    function toPos(v) { return def.log ? Math.round(1000 * (Math.log(v) / Math.LN10 - lmin) / (lmax - lmin)) : v; }
    function fromPos(p) {
      if (!def.log) return +p;
      var v = Math.pow(10, lmin + (+p) / 1000 * (lmax - lmin));
      var d = dpOf(def, v), f = Math.pow(10, d);
      return clamp(Math.round(v * f) / f, def.min, def.max);
    }
    function pct(v) { var p = def.log ? toPos(v) / 10 : (v - def.min) / (def.max - def.min) * 100; return clamp(p, 0, 100); }
    function show(v) {
      num.value = fmtVal(def, v);
      range.value = String(toPos(v));
      range.setAttribute('aria-valuetext', fmtVal(def, v) + (def.unit ? ' ' + def.unit : ''));
      range.style.setProperty('--pct', pct(v) + '%');
    }
    range.addEventListener('input', function () {
      var v = fromPos(range.value); cur = v;
      num.value = fmtVal(def, v); range.setAttribute('aria-valuetext', fmtVal(def, v) + (def.unit ? ' ' + def.unit : ''));
      range.style.setProperty('--pct', pct(v) + '%');
      onInput(v);
    });
    function commit() {
      var v = MT.num(String(num.value).replace('−', '-'));
      if (v == null) { show(cur); return; }
      v = clamp(v, def.min, def.max);
      if (!def.log && def.step) v = Math.round(v / def.step) * def.step;
      v = +v.toFixed(6);
      cur = v; show(v); onInput(v);
    }
    num.addEventListener('change', commit);
    num.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    show(value);
    var el = h('div.pl-slider',
      h('div.pl-sl-head', h('label', { for: id }, def.label), h('span.pl-sl-val', num, def.unit ? h('span.pl-sl-unit', def.unit) : null)),
      range, def.hint ? h('div.pl-hint', { id: id + '-h' }, def.hint) : null);
    return { el: el, set: function (v) { cur = v; show(v); }, get: function () { return cur; }, def: def };
  }
  function checkbox(label, value, onChange, hint) {
    var id = MT.uid('pl-c');
    var input = h('input', { type: 'checkbox', id: id, checked: !!value });
    input.addEventListener('change', function () { onChange(input.checked); });
    var el = h('label.check.pl-check', { for: id }, input, h('span.grow', label, hint ? h('div.pl-hint', hint) : null));
    return { el: el, set: function (v) { input.checked = !!v; }, get: function () { return input.checked; } };
  }
  /** Segmented control with a programmatic setter. */
  function segmented(options, value, onChange, ariaLabel) {
    var wrap = h('div.segmented.pl-seg', { role: 'group', 'aria-label': ariaLabel || null });
    var btns = options.map(function (o) {
      var b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: function () { set(o.value); onChange(o.value); } }, o.label);
      wrap.appendChild(b); return b;
    });
    function set(v) { btns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(options[i].value === v)); }); }
    return { el: wrap, set: set };
  }
  /** Tab strip (role=tablist) with a setter; panels are managed by the caller. */
  function tabStrip(tabs, active, onChange, label) {
    var wrap = h('div.tabs.pl-tabs', { role: 'tablist', 'aria-label': label || null });
    var btns = tabs.map(function (t) {
      var b = h('button', { type: 'button', role: 'tab', id: 'pl-tab-' + t.id, 'aria-selected': String(t.id === active), tabindex: t.id === active ? '0' : '-1', onclick: function () { set(t.id); onChange(t.id); } }, t.label);
      wrap.appendChild(b); return b;
    });
    wrap.addEventListener('keydown', function (e) {
      var i = btns.indexOf(document.activeElement); if (i < 0) return;
      var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null;
      if (j == null) return;
      e.preventDefault(); j = (j + btns.length) % btns.length; btns[j].focus(); btns[j].click();
    });
    function set(id) { btns.forEach(function (b, i) { var on = tabs[i].id === id; b.setAttribute('aria-selected', String(on)); b.setAttribute('tabindex', on ? '0' : '-1'); }); }
    return { el: wrap, set: set };
  }
  /** Scenario chips. list: [{id,label}] */
  function chips(list, active, onPick, label) {
    var wrap = h('div.pl-chips', { role: 'group', 'aria-label': label || 'Scenarios' });
    var btns = list.map(function (s) {
      var b = h('button.chip', { type: 'button', 'aria-pressed': String(s.id === active), onclick: function () { set(s.id); onPick(s.id); } }, s.label);
      wrap.appendChild(b); return b;
    });
    function set(id) { btns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(list[i].id === id)); }); }
    return { el: wrap, set: set };
  }
  /** Read-out tile. */
  function stat(label) {
    var v = h('span'), u = h('span.u'), f = h('span.pl-stat-f'), s = h('div.pl-stat-s');
    var el = h('div.pl-stat', h('div.pl-stat-l', label), h('div.pl-stat-v', v, u, f), s);
    return {
      el: el,
      set: function (value, unit, sub, flag, flagText) {
        v.textContent = value; u.textContent = unit || ''; s.textContent = sub || '';
        if (flag) el.setAttribute('data-flag', flag); else el.removeAttribute('data-flag');
        f.textContent = flagText || '';
      }
    };
  }
  /** Chart container that redraws at its real width (charts stay readable on a 390-px phone). */
  function chartBox(draw, ariaNote) {
    var box = h('div.pl-chart');
    var ro = null, lastW = 0, sched = frameScheduler(redraw);
    function redraw() {
      var w = Math.floor(box.clientWidth || (box.parentNode && box.parentNode.clientWidth) || 600);
      lastW = w;
      var node = draw(Math.max(260, w));
      MT.clear(box);
      if (node) box.appendChild(node);
    }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { if (Math.abs((box.clientWidth || 0) - lastW) > 4) sched(); });
      ro.observe(box);
    }
    return { el: box, redraw: redraw, destroy: function () { if (ro) ro.disconnect(); sched.cancel(); }, note: ariaNote };
  }
  function chartSize(w, ratio, minH, maxH) { return { width: w, height: Math.round(clamp(w * ratio, minH, maxH)) }; }
  /** Add text / shapes on top of an MT.chart.line wrapper using its scale. */
  function overlay(wrap) {
    var svg = wrap.querySelector('svg'), sc = wrap.scale;
    return {
      svg: svg, sc: sc,
      text: function (x, y, str, o) {
        o = o || {};
        svg.appendChild(MT.s('text', { x: sc.x(x) + (o.dx || 0), y: sc.y(y) + (o.dy || 0), 'text-anchor': o.anchor || 'start', class: 'pl-lbl', style: 'fill:' + (o.color || 'var(--text-2)') + (o.size ? ';font-size:' + o.size + 'px' : '') }, str));
      },
      arrow: function (x0, y0, x1, y1, color, o) {
        o = o || {};
        var X0 = sc.x(x0), Y0 = sc.y(y0), X1 = sc.x(x1), Y1 = sc.y(y1);
        var ang = Math.atan2(Y1 - Y0, X1 - X0), len = Math.hypot(X1 - X0, Y1 - Y0);
        if (len < 4) return;
        var hl = Math.min(10, len * 0.45), sh = 0.45;
        var bx = X1 - (o.inset || 0) * Math.cos(ang), by = Y1 - (o.inset || 0) * Math.sin(ang);
        svg.appendChild(MT.s('line', { x1: X0, y1: Y0, x2: bx - hl * 0.6 * Math.cos(ang), y2: by - hl * 0.6 * Math.sin(ang), stroke: color, 'stroke-width': o.width || 2.5, 'stroke-dasharray': o.dash || null, 'stroke-linecap': 'round' }));
        svg.appendChild(MT.s('polygon', { points: [bx, by, bx - hl * Math.cos(ang - sh), by - hl * Math.sin(ang - sh), bx - hl * Math.cos(ang + sh), by - hl * Math.sin(ang + sh)].map(function (n) { return n.toFixed(1); }).join(' '), fill: color }));
      },
      dot: function (x, y, color, r) { var c = MT.s('circle', { cx: sc.x(x), cy: sc.y(y), r: r || 4.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 1.5 }); svg.appendChild(c); return c; }
    };
  }

  /* ---------- explanation, experiments, quiz, references ---------- */
  function whatPanel() {
    var body = h('div.pl-what', { 'aria-live': 'polite' });
    var speak = MT.speech && MT.speech.button ? MT.speech.button(function () { return body.textContent; }) : null;
    var el = h('section.card', { 'aria-label': "What's happening" }, h('div.pl-head', h('h2', "What's happening"), speak), body);
    return {
      el: el,
      set: function (nodes) { MT.clear(body); (nodes || []).forEach(function (n) { if (n) body.appendChild(typeof n === 'string' ? h('p', n) : n); }); }
    };
  }
  /** "Try this" experiments. exps: [{ title, text, steps:[{label, patch}], observe }] ; apply(patch) */
  function tryPanel(exps, apply) {
    var list = h('div');
    exps.forEach(function (x) {
      var obs = h('div', { 'aria-live': 'polite' });
      var done = h('span.pl-try-done');
      var btns = h('div.pl-btns', x.steps.map(function (st, i) {
        return h('button.btn.btn-sm.btn-soft', { type: 'button', onclick: function () {
          apply(st.patch || {}, st);
          done.textContent = '✓ ' + (x.steps.length > 1 ? 'Step ' + (i + 1) + ' set' : 'Set up');
          if (x.observe && i === x.steps.length - 1 || (x.observeEach && x.observeEach[i])) {
            MT.clear(obs);
            obs.appendChild(h('div.pl-try-obs', h('strong', 'What to notice: '), x.observeEach && x.observeEach[i] ? x.observeEach[i] : x.observe));
          }
        } }, (x.steps.length > 1 ? (i + 1) + '. ' : '▶ ') + st.label);
      }));
      list.appendChild(h('div.pl-try-item', h('div.pl-try-t', h('span', x.title), done), h('p.pl-try-p', x.text), btns, obs));
    });
    return h('section.card', { 'aria-label': 'Try this' }, h('div.pl-head', h('h2', 'Try this'), h('span.small.muted', 'Predict first, then run it')), list);
  }
  function quizPanel(toolId, questions) {
    function loadAns() {
      var q = MT.store.get(QUIZ_KEY, null);
      if (!q || q.v !== 1 || !q.answers || typeof q.answers !== 'object') return {};
      var a = q.answers[toolId];
      return a && typeof a === 'object' ? a : {};
    }
    function saveAns(a) {
      MT.store.update(QUIZ_KEY, null, function (q) {
        if (!q || q.v !== 1 || !q.answers || typeof q.answers !== 'object') q = { v: 1, answers: {} };
        q.answers[toolId] = a; return q;
      });
    }
    var answers = loadAns();
    var wrap = h('div');
    var score = h('span.pl-score', { 'aria-live': 'polite' });
    function updateScore() {
      var n = 0, c = 0;
      questions.forEach(function (q, i) { var a = answers[i]; if (isNum(a)) { n++; if (a === q.answer) c++; } });
      score.textContent = n ? c + ' / ' + n + ' correct' + (n < questions.length ? ' (' + (questions.length - n) + ' to go)' : (c === questions.length ? ' — excellent!' : '')) : questions.length + ' questions';
    }
    function renderQ(q, i) {
      var fb = h('div.pl-fb', { 'aria-live': 'polite' });
      var stemId = MT.uid('pl-q');
      var opts = h('div.pl-opts', { role: 'group', 'aria-labelledby': stemId });
      var buttons = q.options.map(function (o, j) {
        var b = h('button.btn.pl-opt', { type: 'button', onclick: function () { choose(j); } }, h('span', String.fromCharCode(65 + j) + '. ' + o), h('span.pl-mark'));
        opts.appendChild(b); return b;
      });
      function paint(sel) {
        buttons.forEach(function (b, j) {
          b.disabled = sel != null;
          var mark = b.querySelector('.pl-mark');
          if (sel == null) { b.removeAttribute('data-state'); mark.textContent = ''; b.removeAttribute('aria-label'); return; }
          if (j === q.answer) { b.setAttribute('data-state', 'correct'); mark.textContent = '✓ correct'; }
          else if (j === sel) { b.setAttribute('data-state', 'wrong'); mark.textContent = '✗ your answer'; }
          else { b.removeAttribute('data-state'); mark.textContent = ''; }
        });
        MT.clear(fb);
        if (sel != null) fb.appendChild(MT.ui.alert(sel === q.answer ? 'ok' : 'warn', sel === q.answer ? 'Correct.' : 'Not quite — the answer is ' + String.fromCharCode(65 + q.answer) + '.', q.explain));
      }
      function choose(j) { answers[i] = j; saveAns(answers); paint(j); updateScore(); }
      paint(isNum(answers[i]) ? answers[i] : null);
      return h('div.pl-q', h('p.pl-q-stem', { id: stemId }, (i + 1) + '. ' + q.q), opts, fb);
    }
    function build() { MT.clear(wrap); questions.forEach(function (q, i) { wrap.appendChild(renderQ(q, i)); }); updateScore(); }
    build();
    var reset = h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { answers = {}; saveAns(answers); build(); } }, '↺ Reset quiz');
    return h('section.card', { 'aria-label': 'Concept check' }, h('div.pl-head', h('h2', 'Concept check'), h('span.small.muted', 'Choose an answer to see the explanation')), wrap, h('div.pl-quiz-foot', score, reset));
  }
  function infoPanel(model, refs) {
    return h('section.stack.stack-sm',
      h('details.disclosure', h('summary', 'How this model works'), h('div.disclosure-body', model)),
      h('details.disclosure', h('summary', 'References'), h('div.disclosure-body', h('ol.pl-refs', { style: 'margin:0;font-size:.9rem' }, refs.map(function (r) { return h('li', r); })))),
      MT.ui.disclaimer('Educational simulation using simplified physiological models. Numbers illustrate mechanisms; they are not patient-specific and must not guide clinical decisions.'));
  }
  function formula(text) { return h('div.pl-formula', text); }
  function para(text) { return h('p', text); }
  /** Build a group of sliders from a control map; returns { el, sliders } */
  function sliderGroup(title, keys, controls, state, onChange) {
    var sl = {};
    var el = h('div.pl-group', title ? h('p.pl-group-t', title) : null, keys.map(function (k) {
      sl[k] = slider(controls[k], state[k], function (v) { onChange(k, v); });
      return sl[k].el;
    }));
    return { el: el, sliders: sl };
  }
  /** Page skeleton shared by all tools. */
  function skeleton(container) {
    var page = h('div.pl-page');
    container.appendChild(page);
    if (!P) { page.appendChild(MT.ui.alert('danger', 'Physiology engine missing', 'student/lib/physiology.js did not load, so the simulator cannot run. Reload the page.')); return null; }
    return page;
  }
  function resetButton(onReset) { return h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: onReset }, '↺ Reset'); }
  /**
   * Main simulator grid. Mobile: one column in DOM order (stage, controls, explanation, experiments).
   * Desktop (≥ 1000 px): the stage (chart + read-outs) fills the left column and stays in view (sticky)
   * whenever it fits the viewport; everything else stacks in the right column.
   */
  function simGrid(stage, rest) {
    var grid = h('div.pl-sim', { style: '--rows:' + rest.length }, stage, rest);
    var ro = null;
    function check() {
      var fits = window.innerWidth >= 1000 && stage.offsetHeight + 80 < window.innerHeight;
      stage.classList.toggle('pl-sticky', fits);
    }
    if (window.ResizeObserver) { ro = new ResizeObserver(check); ro.observe(stage); }
    window.addEventListener('resize', check);
    grid.destroy = function () { if (ro) ro.disconnect(); window.removeEventListener('resize', check); };
    setTimeout(check, 0);
    return grid;
  }
  /** Replace the sub-route without re-rendering the tool (for shareable links to a scenario or tab). */
  function setSubroute(toolId, sub) {
    try { history.replaceState(null, '', '#/' + toolId + (sub ? '/' + encodeURIComponent(sub) : '')); } catch (e) { /* file:// or sandbox: ignore */ }
  }
  function mmhg(x, dp) { return fmt(x, dp == null ? 0 : dp) + ' mmHg'; }

  /* ======================================================================
     1. Oxygen–haemoglobin dissociation curve
     ====================================================================== */
  var O2_CTRL = {
    pH: { label: 'pH', min: 6.9, max: 7.8, step: 0.01, dp: 2 },
    pco2: { label: 'PCO₂', min: 15, max: 100, step: 1, unit: 'mmHg', dp: 0 },
    temp: { label: 'Temperature', min: 30, max: 43, step: 0.1, unit: '°C', dp: 1 },
    bpg: { label: '2,3-BPG', min: 0, max: 10, step: 0.1, unit: 'mmol/L', dp: 1, hint: 'Per litre of red cells; normal ≈ 5. Rises with chronic hypoxia and anaemia, falls in stored blood.' },
    hb: { label: 'Haemoglobin', min: 3, max: 22, step: 0.1, unit: 'g/dL', dp: 1 },
    cohb: { label: 'Carboxyhaemoglobin (COHb)', min: 0, max: 70, step: 1, unit: '%', dp: 0 },
    po2: { label: 'PaO₂ (arterial point)', min: 5, max: 600, log: true, unit: 'mmHg', dp: 0 },
    co: { label: 'Cardiac output', min: 0.5, max: 25, step: 0.1, unit: 'L/min', dp: 1 },
    vo2: { label: 'O₂ consumption (VO₂)', min: 20, max: 4000, log: true, unit: 'mL/min', dp: 0 },
    view: { enum: ['sat', 'content'] }
  };
  var O2_DEF = { pH: 7.40, pco2: 40, temp: 37, bpg: 5.0, hb: 15, cohb: 0, po2: 100, co: 5, vo2: 250, fetal: false, view: 'sat', showNormal: true, showMb: true };
  var O2_SCEN = [
    { id: 'normal', label: 'Normal adult', patch: {}, note: 'Arterial blood under standard conditions: pH 7.40, PCO₂ 40 mmHg, 37 °C, 2,3-BPG 5 mmol/L.' },
    { id: 'exercise', label: 'Exercising muscle', patch: { pH: 7.30, pco2: 50, temp: 39, co: 15, vo2: 2000 }, note: 'Blood in working-muscle capillaries is warmer, more acidic and richer in CO₂; cardiac output and O₂ consumption rise several-fold.' },
    { id: 'altitude', label: 'Altitude 4500 m', patch: { po2: 45, pH: 7.45, pco2: 28, bpg: 6.5, hb: 16.5 }, note: 'After ~2 weeks at 4500 m: low PaO₂, hyperventilation (low PCO₂, alkalaemia), raised 2,3-BPG and more haemoglobin.' },
    { id: 'anaemia', label: 'Chronic anaemia', patch: { hb: 8, bpg: 6.5 }, note: 'Hb 8 g/dL with the compensatory rise in red-cell 2,3-BPG that develops over days.' },
    { id: 'co', label: 'Carbon monoxide', patch: { cohb: 40 }, note: 'COHb 40 % after smoke or exhaust exposure. PaO₂ is normal because CO does not change dissolved O₂.' },
    { id: 'fetal', label: 'Fetal blood', patch: { fetal: true, po2: 30, hb: 17, pH: 7.35, pco2: 45, co: 1.5, vo2: 25 }, note: 'Umbilical venous blood near term: PO₂ ≈ 30 mmHg, Hb ≈ 17 g/dL, fetal haemoglobin (HbF). Circulation values are for a ~3.5 kg fetus.' },
    { id: 'stored', label: 'Stored blood', patch: { bpg: 0.5 }, note: 'Red cells after ~2–3 weeks of storage have lost most of their 2,3-BPG (restored over hours to days after transfusion).' }
  ];
  function o2Cond(s) { return { pH: s.pH, pco2: s.pco2, temp: s.temp, bpg: s.bpg, fetal: s.fetal, hb: s.hb, cohb: s.cohb }; }
  function o2IsStd(s) { return Math.abs(s.pH - 7.4) < 0.005 && Math.abs(s.pco2 - 40) < 0.5 && Math.abs(s.temp - 37) < 0.05 && Math.abs(s.bpg - 5) < 0.05 && !s.fetal && s.cohb === 0; }

  function renderO2(container, ctx) {
    var page = skeleton(container); if (!page) return;
    var TOOL = 'o2-curve';
    var param = ctx.params[0];
    var scenParam = O2_SCEN.filter(function (x) { return x.id === param; })[0];
    var state = scenParam ? assign(O2_DEF, scenParam.patch) : sanitize(loadToolState(TOOL), O2_DEF, O2_CTRL);
    var saved = loadToolState(TOOL);
    var scen = scenParam ? scenParam.id : !saved ? 'normal' : (saved._scen && O2_SCEN.some(function (x) { return x.id === saved._scen; }) ? saved._scen : null);
    var res = null;

    var scenNote = h('p.pl-scen-note');
    var scenChips = chips(O2_SCEN, scen, function (id) { pickScenario(id); }, 'Scenarios');
    var stats = { p50: stat('P50'), sao2: stat('SaO₂'), cao2: stat('CaO₂'), do2: stat('O₂ delivery (DO₂)'), venous: stat('Mixed venous'), cap: stat('O₂ capacity') };
    var chart = chartBox(drawChart);
    var viewSeg = segmented([{ value: 'sat', label: 'Saturation %' }, { value: 'content', label: 'O₂ content' }], state.view, function (v) { state.view = v; changed(true); }, 'Chart y-axis');
    var cbNormal = checkbox('Normal curve', state.showNormal, function (v) { state.showNormal = v; changed(true); });
    var cbMb = checkbox('Myoglobin', state.showMb, function (v) { state.showMb = v; changed(true); });
    var hbType = segmented([{ value: 'A', label: 'Adult HbA' }, { value: 'F', label: 'Fetal HbF' }], state.fetal ? 'F' : 'A', function (v) { state.fetal = v === 'F'; setScenario(null); changed(); }, 'Haemoglobin type');
    function onSlide(k, v) { state[k] = v; setScenario(null); changed(); }
    var g1 = sliderGroup('Blood conditions (curve position)', ['pH', 'pco2', 'temp', 'bpg'], O2_CTRL, state, onSlide);
    var g2 = sliderGroup('Blood & circulation', ['po2', 'hb', 'cohb', 'co', 'vo2'], O2_CTRL, state, onSlide);
    var sliders = assign(g1.sliders, g2.sliders);
    var what = whatPanel();

    function setScenario(id) { scen = id; scenChips.set(id); var sc = O2_SCEN.filter(function (x) { return x.id === id; })[0]; scenNote.textContent = sc ? sc.note : 'Custom settings — choose a scenario to compare.'; }
    function syncControls() {
      Object.keys(sliders).forEach(function (k) { sliders[k].set(state[k]); });
      hbType.set(state.fetal ? 'F' : 'A'); viewSeg.set(state.view); cbNormal.set(state.showNormal); cbMb.set(state.showMb);
    }
    function pickScenario(id) {
      var sc = O2_SCEN.filter(function (x) { return x.id === id; })[0]; if (!sc) return;
      var keep = { view: state.view, showNormal: state.showNormal, showMb: state.showMb };
      state = assign(O2_DEF, sc.patch, keep);
      setScenario(id); syncControls(); setSubroute(TOOL, id); changed();
    }
    function applyPatch(patch) {
      state = assign(state, patch); setScenario(null); syncControls(); changed();
    }
    var sched = frameScheduler(update);
    var explain = debounce(function () { what.set(o2Explain(state, res)); }, 250);
    function changed(viewOnly) { state._scen = scen; saveToolState(TOOL, state); sched(); if (!viewOnly) explain(); }

    function update() {
      res = P.o2State({ po2: state.po2, pH: state.pH, pco2: state.pco2, temp: state.temp, bpg: state.bpg, fetal: state.fetal, hb: state.hb, cohb: state.cohb, co: state.co, vo2: state.vo2 });
      var shift = res.p50 - P.P50_STD;
      stats.p50.set(fmt(res.p50, 1), 'mmHg', kpa(res.p50, 2) + ' kPa · ' + (Math.abs(shift) < 0.3 ? 'normal (26.9)' : (shift > 0 ? 'right shift ' : 'left shift ') + sgn(shift, 1)), Math.abs(shift) < 0.3 ? null : 'warn', Math.abs(shift) < 0.3 ? '' : (shift > 0 ? '→' : '←'));
      var sat = res.fo2hb * 100;
      stats.sao2.set(fmt(sat, 1), '%', state.cohb > 0 ? 'Of total Hb. Functional ' + fmt(res.so2Functional * 100, 0) + ' %; SpO₂ would read ≈ ' + fmt(res.spo2Apparent * 100, 0) + ' %' : 'at PaO₂ ' + fmt(state.po2) + ' mmHg (' + kpa(state.po2) + ' kPa)', sat < 90 ? 'danger' : sat < 94 ? 'warn' : null, sat < 90 ? 'low' : '');
      stats.cao2.set(fmt(res.cao2, 1), 'mL/dL', 'Hb-bound ' + fmt(res.cao2 - res.dissolved, 1) + ' + dissolved ' + fmt(res.dissolved, 2), res.cao2 < 14 ? 'warn' : null, res.cao2 < 14 ? 'low' : '');
      stats.do2.set(fmt(res.do2, 0), 'mL/min', 'CO × CaO₂ × 10 · resting normal ≈ 1000', null);
      if (res.unsustainable) stats.venous.set('—', '', 'VO₂ exceeds O₂ delivery: not sustainable', 'danger', '!');
      else stats.venous.set(fmt(res.pvo2, 0), 'mmHg', 'SvO₂ ' + fmt(res.svo2 * 100, 0) + ' % · extraction ' + fmt(res.o2er * 100, 0) + ' %', res.pvo2 < 25 ? 'danger' : res.pvo2 < 32 ? 'warn' : null, res.pvo2 < 25 ? 'low' : '');
      stats.cap.set(fmt(res.capacity, 1), 'mL/dL', '1.34 × Hb' + (state.cohb > 0 ? ' × (1 − COHb)' : '') + ' — max O₂ on Hb', null);
      chart.redraw();
    }
    function drawChart(w) {
      if (!res) return null;
      var content = state.view === 'content';
      var xMax = Math.max(120, Math.ceil((state.po2 + 15) / 50) * 50);
      if (res.pvo2 > xMax) xMax = Math.ceil(res.pvo2 / 50) * 50;
      var cond = o2Cond(state), series = [], pts = [];
      if (state.showNormal && (!o2IsStd(state) || (content && Math.abs(state.hb - 15) > 0.05)))
        series.push({ name: 'Normal adult (dashed)', points: P.o2Curve({ hb: 15 }, { max: xMax, n: 140, mode: state.view }), color: 'var(--chart-axis)', dash: '7 5', width: 2 });
      if (state.showMb && !content) {
        var mb = []; for (var i = 0; i <= 140; i++) { var p = xMax * i / 140; mb.push([p, P.satMb(p) * 100]); }
        series.push({ name: 'Myoglobin (dotted)', points: mb, color: 'var(--chart-3)', dash: '2 4', width: 2.25 });
      }
      series.push({ name: state.fetal ? 'Fetal blood (current)' : 'Current blood', points: P.o2Curve(cond, { max: xMax, n: 200, mode: state.view }), color: 'var(--chart-1)', width: 3 });
      var yOf = function (po2, frac) { return content ? P.o2Content(state.hb, frac, po2) : frac * 100; };
      var aY = yOf(state.po2, res.fo2hb);
      pts.push({ x: state.po2, y: aY, label: 'a', color: 'var(--chart-1)' });
      if (!res.unsustainable && isNum(res.pvo2)) pts.push({ x: res.pvo2, y: yOf(res.pvo2, res.svo2), label: 'v̄', color: 'var(--chart-2)' });
      var yMax = content ? Math.max(22, Math.ceil((1.34 * Math.max(state.hb, 15) + 0.003 * xMax + 1) / 2) * 2) : 100;
      var sz = chartSize(w, 0.62, 230, 400);
      var wrap = MT.chart.line({
        width: sz.width, height: sz.height,
        x: { min: 0, max: xMax, label: 'PO₂ (mmHg)' }, y: { min: 0, max: yMax, label: content ? 'O₂ content (mL/dL)' : 'Saturation (%)' },
        series: series, points: pts,
        vlines: [{ x: res.p50, label: 'P50', color: 'var(--chart-1)', dash: '3 4' }],
        hlines: content ? [] : [{ y: 50, color: 'var(--chart-grid)', dash: '2 3' }],
        ariaLabel: 'Oxygen dissociation curve: P50 ' + fmt(res.p50, 1) + ' mmHg; saturation ' + fmt(res.fo2hb * 100, 1) + ' % at PaO2 ' + fmt(state.po2) + ' mmHg'
      });
      return wrap;
    }

    // ---- layout
    var stage = h('section.card.pl-stage', { 'aria-label': 'Chart and results' },
      h('div.pl-head', h('h2', 'Dissociation curve'), viewSeg.el),
      scenChips.el, scenNote,
      chart.el,
      h('p.pl-chart-note', 'Points: a = arterial (PaO₂), v̄ = mixed venous, from VO₂ and cardiac output. P50 = PO₂ at which the haemoglobin not bound to CO is half-saturated.'),
      h('div.pl-row', { style: 'margin-top:.5rem' }, cbNormal.el, cbMb.el),
      h('div.pl-stats', stats.p50.el, stats.sao2.el, stats.cao2.el, stats.do2.el, stats.venous.el, stats.cap.el));
    var controls = h('section.card.pl-controls', { 'aria-label': 'Controls' },
      h('div.pl-head', h('h2', 'Controls'), resetButton(function () { pickScenario('normal'); })),
      h('div.pl-group', h('p.pl-group-t', 'Haemoglobin type'), hbType.el), g1.el, g2.el);
    var grid = simGrid(stage, [controls, what.el, tryPanel(O2_TRY, applyPatch)]);
    page.appendChild(grid);
    page.appendChild(quizPanel(TOOL, O2_QUIZ));
    page.appendChild(infoPanel(O2_MODEL(), O2_REFS));
    setScenario(scen);
    update(); what.set(o2Explain(state, res));
    return function () { chart.destroy(); sched.cancel(); explain.cancel(); grid.destroy(); };
  }

  function o2Explain(s, r) {
    if (!r) return [];
    var out = [], std = P.P50_STD;
    // contributions to P50 (each term alone, mmHg)
    var terms = [
      { v: 0.40 * (s.pH - 7.40), lbl: s.pH < 7.40 ? 'acidaemia (pH ' + fmt(s.pH, 2) + ', Bohr effect)' : 'alkalaemia (pH ' + fmt(s.pH, 2) + ')' },
      { v: 0.06 * Math.log(40 / s.pco2) / Math.LN10, lbl: s.pco2 > 40 ? 'raised PCO₂ (' + fmt(s.pco2) + ' mmHg)' : 'low PCO₂ (' + fmt(s.pco2) + ' mmHg)' },
      { v: 0.024 * (37 - s.temp), lbl: s.temp > 37 ? 'warmer blood (' + fmt(s.temp, 1) + ' °C)' : 'cooler blood (' + fmt(s.temp, 1) + ' °C)' },
      { v: -P.BPG_COEF * (s.bpg - 5), lbl: s.bpg > 5 ? 'raised 2,3-BPG (' + fmt(s.bpg, 1) + ')' : 'low 2,3-BPG (' + fmt(s.bpg, 1) + ')' },
      { v: s.fetal ? Math.log(std / P.FETAL_P50) / Math.LN10 : 0, lbl: 'fetal haemoglobin (binds 2,3-BPG poorly)' }
    ].map(function (t) { t.mm = std * (Math.pow(10, -t.v) - 1); return t; }).filter(function (t) { return Math.abs(t.mm) >= 0.3; });
    terms.sort(function (a, b) { return Math.abs(b.mm) - Math.abs(a.mm); });
    var p50hb = r.p50Hb, dP = p50hb - std;
    var first = h('p');
    if (Math.abs(dP) < 0.3 && !(s.cohb > 0)) first.appendChild(document.createTextNode('P50 is ' + fmt(p50hb, 1) + ' mmHg — the normal position (26.9 mmHg at pH 7.40, PCO₂ 40 mmHg, 37 °C).'));
    else {
      first.appendChild(document.createTextNode('Haemoglobin P50 is '));
      first.appendChild(h('strong', fmt(p50hb, 1) + ' mmHg'));
      first.appendChild(document.createTextNode(' (normal 26.9): the curve is shifted to the ' + (dP > 0 ? 'right — haemoglobin holds O₂ less tightly' : 'left — haemoglobin holds O₂ more tightly') + '.' + (terms.length ? ' Contributions: ' + terms.map(function (t) { return t.lbl + ' ' + sgn(t.mm, 1) + ' mmHg'; }).join('; ') + '.' : '')));
    }
    out.push(first);
    if (s.cohb > 0) out.push(h('p', 'With ', h('strong', fmt(s.cohb) + ' % COHb'), ', only ' + fmt(100 - s.cohb) + ' % of haemoglobin can carry O₂, and CO bound to some haem groups makes the remaining sites cling to O₂ (Haldane/Roughton–Darling effect): their P50 falls to ' + fmt(r.p50, 1) + ' mmHg. A two-wavelength pulse oximeter counts COHb as oxyhaemoglobin and would read ≈ ' + fmt(r.spo2Apparent * 100) + ' % — falsely reassuring. Breathing 100 % O₂ speeds CO removal because O₂ competes CO off haemoglobin.'));
    // loading vs unloading
    var y = (s.cohb || 0) / 100, f = P.o2Factor(o2Cond(s));
    var s100 = P.o2HbFraction(100 * f, y) * 100, s40 = P.o2HbFraction(40 * f, y) * 100, n40 = P.satStd(40) * 100;
    if (!s.fetal && !(s.cohb > 0) && Math.abs(dP) >= 0.3) {
      var extra = (n40 - s40) / 100 * 1.34 * s.hb;
      out.push(h('p', 'Loading vs unloading: on the flat upper part the shift barely matters — at 100 mmHg saturation is ' + fmt(s100, 1) + ' % (normal 97.7 %). On the steep part it matters a lot: at a tissue PO₂ of 40 mmHg saturation is ' + fmt(s40, 0) + ' % versus ' + fmt(n40, 0) + ' % normally, so ' + (extra > 0 ? 'an extra ' : '') + fmt(Math.abs(extra), 1) + ' mL O₂/dL is ' + (extra > 0 ? 'released' : 'retained') + ' at the same PO₂.'));
    }
    if (s.fetal) {
      var adult30 = P.o2HbFraction(30 * P.o2Factor(assign(o2Cond(s), { fetal: false })), y) * 100, fet30 = P.o2HbFraction(30 * f, y) * 100;
      out.push(h('p', 'Fetal haemoglobin (α₂γ₂) binds 2,3-BPG weakly, so fetal blood has a higher O₂ affinity. At a PO₂ of 30 mmHg — about what the placenta provides — it is ' + fmt(fet30, 0) + ' % saturated, whereas adult blood under the same conditions would be ' + fmt(adult30, 0) + ' %. Together with the high fetal Hb, this lets O₂ move from mother to fetus.'));
    }
    // content and delivery
    out.push(h('p', 'O₂ content: CaO₂ = 1.34 × ' + fmt(s.hb, 1) + ' × ' + fmt(r.fo2hb, 3) + ' + 0.003 × ' + fmt(s.po2) + ' = ', h('strong', fmt(r.cao2, 1) + ' mL/dL'), '. Delivery: DO₂ = ' + fmt(s.co, 1) + ' L/min × ' + fmt(r.cao2, 1) + ' × 10 = ', h('strong', fmt(r.do2, 0) + ' mL/min'), '.' +
      (r.unsustainable ? '' : ' With VO₂ ' + fmt(s.vo2) + ' mL/min the tissues extract ' + fmt(r.o2er * 100, 0) + ' % of what is delivered and mixed venous blood leaves at PO₂ ' + fmt(r.pvo2, 0) + ' mmHg (SvO₂ ' + fmt(r.svo2 * 100, 0) + ' %).')));
    if (r.unsustainable) out.push(h('p.pl-warnline', 'O₂ consumption exceeds delivery: this state cannot be sustained — cells switch to anaerobic metabolism and lactate accumulates.'));
    else if (r.pvo2 < 25) out.push(h('p.pl-warnline', 'Mixed venous PO₂ is very low: tissues are extracting near their limit, leaving little O₂ pressure to drive diffusion into cells.'));
    if (s.hb < 12 && !(s.cohb > 0)) out.push(h('p', 'Anaemia lowers O₂ content without changing PaO₂ or SaO₂ — the lungs are fine; the blood simply has less haemoglobin. The body compensates with a higher cardiac output, greater extraction and (over days) more 2,3-BPG.'));
    if (s.po2 > 150) out.push(h('p', 'Above ~100 mmHg haemoglobin is nearly saturated, so raising PaO₂ to ' + fmt(s.po2) + ' mmHg adds O₂ mainly in solution: ' + fmt(r.dissolved, 2) + ' mL/dL dissolved (0.003 mL/dL per mmHg).'));
    if (s.po2 < 60 && !s.fetal) out.push(h('p', 'PaO₂ below 60 mmHg is on the steep part of the curve: small further falls in PO₂ cause large falls in saturation.'));
    return out;
  }

  var O2_TRY = [
    { title: 'The Bohr effect in tissues', text: 'Predict: if blood becomes more acidic and CO₂-rich (pH 7.20, PCO₂ 60), will haemoglobin release more or less O₂ at a tissue PO₂ of 40 mmHg?',
      steps: [{ label: 'Acidify the blood', patch: { pH: 7.20, pco2: 60, temp: 37, bpg: 5, cohb: 0, fetal: false, hb: 15, po2: 100 } }],
      observe: 'P50 rises to ≈ 33 mmHg. At 100 mmHg saturation drops only from ≈ 98 % to ≈ 96 % (flat part), but at 40 mmHg it falls from ≈ 75 % to ≈ 63 % — about 2.5 mL O₂/dL extra is unloaded exactly where metabolism produces acid and CO₂.' },
    { title: 'Anaemia versus carbon monoxide', text: 'Both halve the O₂ capacity. Which leaves the tissues worse off? Run both and compare the mixed venous PO₂ (v̄).',
      steps: [{ label: 'Anaemia, Hb 7.5', patch: { hb: 7.5, cohb: 0, bpg: 5, pH: 7.4, pco2: 40, temp: 37, fetal: false, po2: 100, co: 5, vo2: 250 } }, { label: 'CO 50 %, Hb 15', patch: { hb: 15, cohb: 50, bpg: 5, pH: 7.4, pco2: 40, temp: 37, fetal: false, po2: 100, co: 5, vo2: 250 } }],
      observeEach: ['Content ≈ 10 mL/dL, SaO₂ still ≈ 98 %. Mixed venous PO₂ ≈ 27 mmHg — note it, then run step 2.', 'Same arterial content (≈ 10 mL/dL), but the remaining haemoglobin is strongly left-shifted (P50 ≈ 13 mmHg), so the venous PO₂ falls to ≈ 14 mmHg. CO is far more dangerous than an equivalent anaemia — and SpO₂ would still read ≈ 100 %.'] },
    { title: 'Fetal haemoglobin at the placenta', text: 'Switch to fetal blood at a PO₂ of 30 mmHg. Predict its saturation compared with adult blood.',
      steps: [{ label: 'Fetal blood at 30 mmHg', patch: { fetal: true, po2: 30, hb: 17, pH: 7.35, pco2: 45, temp: 37, bpg: 5, cohb: 0, co: 1.5, vo2: 25 } }],
      observe: 'Fetal blood is ≈ 76 % saturated at 30 mmHg, while adult blood (dashed curve) would be ≈ 55 %. Its P50 ≈ 19 mmHg: a left-shifted curve that loads O₂ at the low PO₂ of the placenta.' },
    { title: 'Breathing more oxygen', text: 'Raise PaO₂ from 100 to 500 mmHg (as on high-flow oxygen). Predict how much CaO₂ rises.',
      steps: [{ label: 'PaO₂ 500 mmHg', patch: { po2: 500, hb: 15, cohb: 0, fetal: false } }],
      observe: 'Saturation can only go from ≈ 98 % to 100 %, so CaO₂ rises by only ≈ 1.6 mL/dL (≈ 8 %), mostly as dissolved O₂ (0.003 × 500 = 1.5 mL/dL). Extra O₂ helps hypoxaemia, not anaemia — but dissolved O₂ is what matters in CO poisoning and hyperbaric therapy.' }
  ];
  var O2_QUIZ = [
    { q: 'Which change shifts the oxygen–haemoglobin dissociation curve to the LEFT (higher affinity)?', options: ['Fever', 'Raised red-cell 2,3-BPG', 'Alkalaemia (high pH)', 'Hypercapnia'], answer: 2,
      explain: 'A higher pH (fewer H⁺ ions) stabilises the relaxed, high-affinity R state of haemoglobin, so P50 falls. Heat, H⁺, CO₂ and 2,3-BPG all favour the tense T state and shift the curve right.' },
    { q: 'Hb 15 g/dL, SaO₂ 98 %, PaO₂ 100 mmHg. What is the arterial O₂ content?', options: ['About 15 mL/dL', 'About 20 mL/dL', 'About 25 mL/dL', 'About 30 mL/dL'], answer: 1,
      explain: 'CaO₂ = 1.34 × 15 × 0.98 + 0.003 × 100 = 19.7 + 0.3 ≈ 20 mL O₂ per dL. Almost all O₂ is carried by haemoglobin; dissolved O₂ is only 0.3 mL/dL.' },
    { q: 'A patient has 30 % carboxyhaemoglobin and a normal PaO₂. Which statement is true?', options: ['Pulse oximetry will show a low SpO₂', 'The curve of the remaining haemoglobin shifts to the right', 'Arterial O₂ content is reduced and the remaining haemoglobin unloads O₂ less readily', 'PaO₂ is the best measure of the severity'], answer: 2,
      explain: 'CO occupies haem sites (lower capacity) and raises the O₂ affinity of the remaining sites (left shift), so tissues are doubly penalised. PaO₂ reflects dissolved O₂ and stays normal; SpO₂ reads falsely high because COHb absorbs light like O₂Hb.' },
    { q: 'Why can fetal blood take up O₂ from maternal blood in the placenta?', options: ['Fetal PO₂ is higher than maternal PO₂', 'Fetal haemoglobin binds 2,3-BPG weakly, giving it a lower P50', 'Fetal haemoglobin has a higher P50', 'Fetal blood is more alkaline than maternal blood'], answer: 1,
      explain: 'HbF (α₂γ₂) binds 2,3-BPG poorly, so fetal blood has P50 ≈ 19 mmHg versus ≈ 27 mmHg in adults. At the same PO₂ fetal blood is more saturated, so O₂ moves from mother to fetus.' },
    { q: 'In a healthy person, doubling PaO₂ from 100 to 200 mmHg increases CaO₂ by roughly:', options: ['Less than 1 mL/dL (about 4 %)', 'About 5 mL/dL (25 %)', 'About 10 mL/dL (50 %)', 'It doubles'], answer: 0,
      explain: 'Haemoglobin is already ≈ 98 % saturated at 100 mmHg; the extra ≈ 2 % saturation adds ≈ 0.4 mL/dL and the extra dissolved O₂ adds 0.3 mL/dL — about 0.7 mL/dL in total.' }
  ];
  function O2_MODEL() {
    return h('div',
      para('Standard curve (pH 7.40, PCO₂ 40 mmHg, 37 °C) — Severinghaus (1979):'),
      formula('SO₂ = 1 / (23400 / (PO₂³ + 150·PO₂) + 1)      →  P50 = 26.86 mmHg, SO₂(100) = 97.7 %'),
      para('Other conditions use a "virtual PO₂" (Kelman 1966, using Severinghaus\'s data): the PO₂ that would give the same saturation under standard conditions. The curve shape is assumed unchanged and the shifts additive in log P50.'),
      formula('PO₂virtual = PO₂ × 10^[0.024(37 − T) + 0.40(pH − 7.40) + 0.06·log₁₀(40/PCO₂) − 0.03(BPG − 5)]'),
      para('The 2,3-BPG term is not part of Kelman\'s correction: it is an approximate linear term (≈ +1.9 mmHg P50 per mmol/L near normal) chosen to match the reported P50 of 2,3-BPG-depleted stored blood (≈ 18–19 mmHg) and of chronic anaemia (≈ 30–31 mmHg). Treat it as illustrative. Fetal blood uses a fixed P50 of 19 mmHg under standard conditions.'),
      para('Carbon monoxide (Roughton & Darling 1944): total saturation (O₂ + CO) follows the normal curve at an equivalent pressure Q = PO₂ + M·PCO, and COHb/O₂Hb = M·PCO/PO₂ (Haldane). For a fixed COHb fraction y, solve S(Q)·(1 − PO₂/Q) = y; then O₂Hb = S(Q) − y. This reproduces the lower capacity and the left shift of the remaining haemoglobin.'),
      formula('CaO₂ = 1.34 × Hb × SaO₂ + 0.003 × PaO₂      (mL/dL; SaO₂ = O₂Hb as a fraction of total Hb)\nDO₂ = CO × CaO₂ × 10      (mL/min)\nCv̄O₂ = CaO₂ − VO₂ / (10 × CO)  →  Pv̄O₂ read off the same curve'),
      para('Myoglobin is hyperbolic: S = PO₂ / (PO₂ + 2.8 mmHg). Limitations: one set of conditions is applied to the whole curve (in reality blood changes pH, PCO₂ and temperature between lung and tissue); 1.34 mL/g is the empirical Hüfner value (theoretical 1.39); the Severinghaus equation is least accurate below ≈ 10 % saturation.'));
  }
  var O2_REFS = [
    'Severinghaus JW. Simple, accurate equations for human blood O₂ dissociation computations. J Appl Physiol 1979;46:599–602.',
    'Kelman GR. Digital computer subroutine for the conversion of oxygen tension into saturation. J Appl Physiol 1966;21:1375–1376.',
    'Roughton FJW, Darling RC. The effect of carbon monoxide on the oxyhemoglobin dissociation curve. Am J Physiol 1944;141:17–31.',
    'Collins J-A, Rudenski A, Gibson J, Howard L, O\'Driscoll R. Relating oxygen partial pressure, saturation and content: the haemoglobin–oxygen dissociation curve. Breathe 2015;11:194–201.',
    'Schenkman KA, Marble DR, Burns DH, Feigl EO. Myoglobin oxygen dissociation by multiwavelength spectroscopy. J Appl Physiol 1997;82:86–92.',
    'Hall JE, Hall ME. Guyton and Hall Textbook of Medical Physiology, 14th ed. Elsevier; 2021 — transport of O₂ and CO₂ in blood.',
    'Boron WF, Boulpaep EL. Medical Physiology, 3rd ed. Elsevier; 2017 — oxygen transport.',
    'West JB, Luks AM. West\'s Respiratory Physiology: The Essentials, 11th ed. Wolters Kluwer; 2020 — gas transport by the blood.'
  ];

  MT.registerTool({
    id: 'o2-curve', title: 'O₂–haemoglobin curve', category: CAT, icon: '🩸', order: 1,
    description: 'Shift the oxygen dissociation curve with pH, CO₂, temperature, 2,3-BPG, fetal Hb and carbon monoxide; see P50, CaO₂, O₂ delivery and venous PO₂.',
    keywords: ['oxygen dissociation curve', 'odc', 'oxyhaemoglobin', 'oxyhemoglobin', 'bohr effect', 'p50', 'haemoglobin', 'hemoglobin', 'carbon monoxide', 'fetal haemoglobin', 'myoglobin', 'cao2', 'do2', 'oxygen content', 'oxygen delivery', 'severinghaus', 'physiology lab'],
    render: renderO2
  });

  /* @@NEXT_TOOL@@ */
})();

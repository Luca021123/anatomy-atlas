/* ==========================================================================
   Open Medical Toolkit — core runtime (core.js)
   Classic script (no ES modules) so every page also works when opened
   straight from disk (file://) after being shared by USB, Bluetooth or a
   messaging app. Exposes a single global: window.MT.

   Sections
     1. Utilities            MT.esc, MT.h, MT.s, MT.num, MT.fmt, ...
     2. Events               MT.on / MT.off / MT.emit
     3. Storage              MT.store (localStorage with memory fallback)
     4. Settings             MT.settings (theme, text size, units, language)
     5. i18n                 MT.t (gettext-style, English source strings)
     6. UI helpers           MT.css, MT.toast, MT.modal, MT.confirm, MT.copy, MT.download, MT.readFile, MT.print
     7. Speech               MT.speech (read aloud with the device's own voices)
     8. Charts               MT.chart.line (dependency-free SVG line/scatter chart)
     9. Calculator engine    MT.calc.render (declarative clinical calculators)
    10. Calendar export      MT.ics.build (.ics reminders that work on any phone)
    11. Profile              MT.profile (shared by the public-health suite)
    12. Tool registry & app  MT.registerTool, MT.registerWidget, MT.app.start
   ========================================================================== */
(function (global) {
  'use strict';

  var MT = global.MT || (global.MT = {});
  MT.version = '1.0.0';
  var doc = global.document;

  /* ======================================================================
     1. Utilities
     ====================================================================== */
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escape text for safe insertion into HTML strings. */
  MT.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); };
  MT.uid = function (prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); };
  MT.clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  /** Round half away from zero to dp decimals. */
  MT.round = function (x, dp) { var f = Math.pow(10, dp || 0); return Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * f) / f; };
  MT.debounce = function (fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms == null ? 200 : ms); }; };
  MT.isNum = function (x) { return typeof x === 'number' && isFinite(x); };
  /** Parse user-typed numbers, accepting decimal commas ("36,5") and spaces. Returns undefined when blank/invalid. */
  MT.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    if (v == null) return undefined;
    var s = String(v).trim().replace(/\s+/g, '');
    if (!s) return undefined;
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : undefined;
  };
  /** Format a number with fixed decimals; opts.trim removes trailing zeros. */
  MT.fmt = function (x, dp, opts) {
    if (!MT.isNum(x)) return '—';
    var s = MT.round(x, dp == null ? 0 : dp).toFixed(dp == null ? 0 : dp);
    if (opts && opts.trim && s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (opts && opts.sign && x > 0) s = '+' + s;
    return s;
  };
  MT.pct = function (x, dp) { return MT.isNum(x) ? MT.fmt(x * 100, dp == null ? 0 : dp) + '%' : '—'; };
  MT.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  /** Local date as YYYY-MM-DD (no timezone surprises). */
  MT.today = function (d) { d = d || new Date(); return d.getFullYear() + '-' + MT.pad2(d.getMonth() + 1) + '-' + MT.pad2(d.getDate()); };
  MT.parseDate = function (ymd) { if (!ymd) return null; var p = String(ymd).split('-').map(Number); if (p.length < 3 || p.some(isNaN)) return null; return new Date(p[0], p[1] - 1, p[2]); };
  MT.daysBetween = function (a, b) { var A = (a instanceof Date) ? a : MT.parseDate(a), B = (b instanceof Date) ? b : MT.parseDate(b); if (!A || !B) return NaN; return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 864e5); };
  MT.addDays = function (d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  MT.formatDate = function (d, opts) { if (!(d instanceof Date)) d = MT.parseDate(d); if (!d || isNaN(d)) return '—'; try { return d.toLocaleDateString(MT.i18n ? MT.i18n.lang : undefined, opts || { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return MT.today(d); } };
  MT.formatTime = function (d) { if (!(d instanceof Date)) d = new Date(d); try { return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return MT.pad2(d.getHours()) + ':' + MT.pad2(d.getMinutes()); } };

  function setAttr(el, key, val, isSvg) {
    if (val == null || val === false) return;
    if (key === 'class' || key === 'className') {
      var cls = Array.isArray(val) ? val.filter(Boolean).join(' ')
        : (typeof val === 'object') ? Object.keys(val).filter(function (k) { return val[k]; }).join(' ') : val;
      if (cls) { if (isSvg) el.setAttribute('class', cls); else el.className = cls; }
    } else if (key === 'style') {
      if (typeof val === 'string') el.style.cssText = val;
      else Object.keys(val).forEach(function (k) { if (k.indexOf('--') === 0) el.style.setProperty(k, val[k]); else el.style[k] = val[k]; });
    } else if (key === 'dataset') {
      Object.keys(val).forEach(function (k) { el.dataset[k] = val[k]; });
    } else if (key === 'on') {
      Object.keys(val).forEach(function (k) { el.addEventListener(k, val[k]); });
    } else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'html') {
      el.innerHTML = val; // caller is responsible for escaping (use MT.esc)
    } else if (key === 'text') {
      el.textContent = val;
    } else if (key === 'ref' && typeof val === 'function') {
      val(el);
    } else if (!isSvg && (key === 'value' || key === 'checked' || key === 'selected' || key === 'disabled' || key === 'indeterminate' || key === 'readOnly' || key === 'multiple' || key === 'hidden' || key === 'open')) {
      el[key] = val;
    } else {
      el.setAttribute(key, val === true ? '' : val);
    }
  }
  function appendChildren(el, children) {
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null || c === false || c === true) continue;
      if (Array.isArray(c)) { appendChildren(el, c); continue; }
      el.appendChild(c.nodeType ? c : doc.createTextNode(String(c)));
    }
  }
  /**
   * Hyperscript DOM builder. MT.h('div.card#x', {onclick: fn, 'aria-label': 'x'}, 'text', childNode, [more])
   * Strings become text nodes (safe). Use {html: '...'} only with escaped content.
   */
  MT.h = function (tag, attrs) {
    var m = String(tag).match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);
    var name = (m && m[1]) || 'div';
    var el = doc.createElement(name);
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, function (_, t, v) { if (t === '.') el.classList.add(v); else el.id = v; });
    }
    var start = 1;
    if (attrs && typeof attrs === 'object' && !attrs.nodeType && !Array.isArray(attrs)) {
      Object.keys(attrs).forEach(function (k) { setAttr(el, k, attrs[k], false); });
      start = 2;
    }
    appendChildren(el, Array.prototype.slice.call(arguments, start));
    return el;
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  /** SVG element builder with the same signature as MT.h. */
  MT.s = function (tag, attrs) {
    var el = doc.createElementNS(SVGNS, tag);
    var start = 1;
    if (attrs && typeof attrs === 'object' && !attrs.nodeType && !Array.isArray(attrs)) {
      Object.keys(attrs).forEach(function (k) { setAttr(el, k, attrs[k], true); });
      start = 2;
    }
    var kids = Array.prototype.slice.call(arguments, start);
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false || c === true) return;
        if (Array.isArray(c)) return add(c);
        el.appendChild(c.nodeType ? c : doc.createTextNode(String(c)));
      });
    })(kids);
    return el;
  };
  MT.$ = function (sel, root) { return (root || doc).querySelector(sel); };
  MT.$$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
  MT.clear = function (el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
  /** Dynamically load a classic script (works on file:// too). */
  MT.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      if (MT.$('script[data-src="' + src + '"]')) return resolve();
      var s = doc.createElement('script'); s.src = src; s.dataset.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      doc.head.appendChild(s);
    });
  };

  /* ======================================================================
     2. Events
     ====================================================================== */
  var listeners = {};
  MT.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return function () { MT.off(evt, fn); }; };
  MT.off = function (evt, fn) { listeners[evt] = (listeners[evt] || []).filter(function (f) { return f !== fn; }); };
  MT.emit = function (evt, data) { (listeners[evt] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ======================================================================
     3. Storage — namespaced keys ("mt:" prefix). Use dotted keys per feature,
        e.g. "student.srs.cards". Falls back to memory if storage is blocked.
     ====================================================================== */
  var PREFIX = 'mt:';
  var mem = {};
  var ls = null;
  try { ls = global.localStorage; var probe = PREFIX + '__probe'; ls.setItem(probe, '1'); ls.removeItem(probe); } catch (e) { ls = null; }
  MT.store = {
    persistent: !!ls,
    get: function (key, fallback) {
      try {
        var raw = ls ? ls.getItem(PREFIX + key) : mem[key];
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      var raw = JSON.stringify(value);
      try { if (ls) ls.setItem(PREFIX + key, raw); else mem[key] = raw; MT.emit('store:' + key, value); return true; }
      catch (e) { mem[key] = raw; if (MT.toast) MT.toast(MT.t('Storage is full — some data may not be saved.'), 'warn'); return false; }
    },
    update: function (key, fallback, fn) { var v = fn(MT.store.get(key, fallback)); MT.store.set(key, v); return v; },
    remove: function (key) { try { if (ls) ls.removeItem(PREFIX + key); } catch (e) { /* ignore */ } delete mem[key]; },
    keys: function (prefix) {
      var out = [], p = PREFIX + (prefix || '');
      try {
        if (ls) { for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(p) === 0) out.push(k.slice(PREFIX.length)); } }
      } catch (e) { /* ignore */ }
      Object.keys(mem).forEach(function (k) { if (k.indexOf(prefix || '') === 0 && out.indexOf(k) < 0) out.push(k); });
      return out.sort();
    },
    /** Export all keys under a prefix as a plain object (for backup files). */
    exportAll: function (prefix) { var o = {}; MT.store.keys(prefix).forEach(function (k) { o[k] = MT.store.get(k); }); return o; },
    importAll: function (obj) { Object.keys(obj || {}).forEach(function (k) { MT.store.set(k, obj[k]); }); },
    clear: function (prefix) { MT.store.keys(prefix).forEach(function (k) { MT.store.remove(k); }); },
    bytesUsed: function (prefix) { var n = 0; MT.store.keys(prefix).forEach(function (k) { var v = ls ? ls.getItem(PREFIX + k) : mem[k]; n += (k.length + (v ? v.length : 0)) * 2; }); return n; }
  };

  /* ======================================================================
     4. Settings
     ====================================================================== */
  var DEFAULT_SETTINGS = { theme: 'auto', textSize: 'normal', units: 'si', speechRate: 0.95, lang: 'en', reduceData: false };
  MT.settings = {
    get: function (k) { var s = MT.store.get('settings', {}); return k ? (s[k] !== undefined ? s[k] : DEFAULT_SETTINGS[k]) : Object.assign({}, DEFAULT_SETTINGS, s); },
    set: function (k, v) { var s = MT.store.get('settings', {}); s[k] = v; MT.store.set('settings', s); MT.settings.apply(); MT.emit('settings:change', { key: k, value: v }); },
    apply: function () {
      var root = doc.documentElement, s = MT.settings.get();
      if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme); else root.removeAttribute('data-theme');
      if (s.textSize && s.textSize !== 'normal') root.setAttribute('data-textsize', s.textSize); else root.removeAttribute('data-textsize');
    }
  };

  /* ======================================================================
     5. i18n — gettext style. Source strings are English; translations are
        registered per language as { "English text": "Translated text" }.
        Missing translations fall back to English automatically.
     ====================================================================== */
  var RTL = ['ar', 'fa', 'he', 'ur', 'ps'];
  MT.i18n = {
    lang: 'en',
    dicts: {},
    languages: [{ code: 'en', name: 'English' }],
    /** Register translations. meta: { name: 'Español' } */
    add: function (lang, dict, meta) {
      MT.i18n.dicts[lang] = Object.assign(MT.i18n.dicts[lang] || {}, dict);
      if (!MT.i18n.languages.some(function (l) { return l.code === lang; })) MT.i18n.languages.push({ code: lang, name: (meta && meta.name) || lang });
    },
    set: function (lang) {
      MT.i18n.lang = lang || 'en';
      doc.documentElement.lang = MT.i18n.lang;
      doc.documentElement.dir = RTL.indexOf(MT.i18n.lang.split('-')[0]) >= 0 ? 'rtl' : 'ltr';
    },
    has: function (str) { var d = MT.i18n.dicts[MT.i18n.lang]; return !!(d && d[str]); }
  };
  /** Translate an English source string; supports {name} placeholders. */
  MT.t = function (str, vars) {
    var d = MT.i18n.dicts[MT.i18n.lang];
    var out = (d && d[str]) || str;
    if (vars) out = out.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return out;
  };

  /* ======================================================================
     6. UI helpers
     ====================================================================== */
  /** Inject a <style> block once per id (tools keep their CSS next to their JS). */
  MT.css = function (id, cssText) {
    if (doc.getElementById('css-' + id)) return;
    var st = doc.createElement('style'); st.id = 'css-' + id; st.textContent = cssText; doc.head.appendChild(st);
  };
  var toastHost;
  MT.toast = function (msg, type, ms) {
    if (!toastHost) { toastHost = MT.h('div.toast-host', { role: 'status', 'aria-live': 'polite' }); doc.body.appendChild(toastHost); }
    var t = MT.h('div.toast' + (type ? '.toast-' + type : ''), msg);
    toastHost.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 320); }, ms || 2600);
  };
  /**
   * Open a modal dialog. opts: { title, body: Node|string, actions: [{label, variant:'primary'|'danger'|'ghost', onClick(close) -> false keeps open}], onClose, wide }
   * Returns a close() function.
   */
  MT.modal = function (opts) {
    var prevFocus = doc.activeElement;
    var titleId = MT.uid('modal-title');
    var bodyEl = typeof opts.body === 'string' ? MT.h('div', opts.body) : (opts.body || MT.h('div'));
    var foot = null;
    var closed = false;
    function close(result) {
      if (closed) return; closed = true;
      backdrop.remove(); doc.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose(result);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
    }
    if (opts.actions && opts.actions.length) {
      foot = MT.h('div.modal-foot', opts.actions.map(function (a) {
        return MT.h('button.btn' + (a.variant ? '.btn-' + a.variant : ''), { type: 'button', onclick: function () { var r = a.onClick ? a.onClick(close) : undefined; if (r !== false) close(a.value); } }, a.label);
      }));
    }
    var dialog = MT.h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: opts.wide ? 'max-width:860px' : null },
      MT.h('div.modal-head', MT.h('h2', { id: titleId }, opts.title || ''), MT.h('button.icon-btn', { type: 'button', 'aria-label': MT.t('Close'), onclick: function () { close(); } }, '✕')),
      MT.h('div.modal-body', bodyEl), foot);
    var backdrop = MT.h('div.modal-backdrop', { onclick: function (e) { if (e.target === backdrop && opts.dismissable !== false) close(); } }, dialog);
    function onKey(e) {
      if (e.key === 'Escape' && opts.dismissable !== false) close();
      if (e.key === 'Tab') { // simple focus trap
        var f = MT.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dialog).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    doc.addEventListener('keydown', onKey);
    doc.body.appendChild(backdrop);
    var first = MT.$('input, select, textarea, .modal-foot .btn-primary, .modal-foot .btn', dialog);
    setTimeout(function () { (first || dialog).focus && (first || dialog).focus(); }, 30);
    return close;
  };
  /** Promise-based confirm dialog. */
  MT.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var answered = false;
      MT.modal({
        title: opts.title || MT.t('Please confirm'),
        body: MT.h('p', message),
        actions: [
          { label: opts.cancelLabel || MT.t('Cancel'), variant: 'ghost', onClick: function () { answered = true; resolve(false); } },
          { label: opts.okLabel || MT.t('OK'), variant: opts.danger ? 'danger' : 'primary', onClick: function () { answered = true; resolve(true); } }
        ],
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  };
  MT.copy = function (text) {
    function fallback() {
      var ta = MT.h('textarea', { style: 'position:fixed;opacity:0;left:-9999px' }); ta.value = text; doc.body.appendChild(ta); ta.select();
      var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); return ok;
    }
    var p = (global.navigator && navigator.clipboard && global.isSecureContext) ? navigator.clipboard.writeText(text).then(function () { return true; }, fallback) : Promise.resolve(fallback());
    return p.then(function (ok) { MT.toast(ok ? MT.t('Copied to clipboard') : MT.t('Could not copy — select and copy manually'), ok ? 'ok' : 'warn'); return ok; });
  };
  MT.download = function (filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = MT.h('a', { href: url, download: filename, style: 'display:none' });
    doc.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };
  /** Ask the user for a file and resolve with its text. accept e.g. ".json,.csv" */
  MT.readFile = function (accept) {
    return new Promise(function (resolve, reject) {
      var inp = MT.h('input', { type: 'file', accept: accept || '', style: 'display:none' });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; inp.remove();
        if (!f) return reject(new Error('No file'));
        var r = new FileReader(); r.onload = function () { resolve({ name: f.name, text: String(r.result) }); }; r.onerror = function () { reject(r.error); }; r.readAsText(f);
      });
      doc.body.appendChild(inp); inp.click();
    });
  };
  /**
   * Print only the given element, wherever it sits in the page: every sibling of the element
   * and of each of its ancestors is hidden (class .print-hide) for the duration of printing.
   */
  MT.print = function (el) {
    if (!el) { global.print(); return; }
    var hidden = [];
    for (var node = el; node && node.parentElement && node !== doc.body; node = node.parentElement) {
      Array.prototype.forEach.call(node.parentElement.children, function (sib) {
        if (sib !== node && !sib.classList.contains('print-hide')) { sib.classList.add('print-hide'); hidden.push(sib); }
      });
    }
    el.classList.add('print-target');
    var finished = false;
    var done = function () {
      if (finished) return; finished = true;
      hidden.forEach(function (x) { x.classList.remove('print-hide'); });
      el.classList.remove('print-target');
      global.removeEventListener('afterprint', done);
    };
    global.addEventListener('afterprint', done);
    global.print();
    setTimeout(done, 15000); // fallback for browsers that never fire afterprint
  };
  /** Small helpers for common building blocks. */
  MT.ui = {
    alert: function (type, title, body, icon) {
      var icons = { ok: '✅', warn: '⚠️', danger: '⛔', info: 'ℹ️' };
      return MT.h('div.alert.alert-' + type, { role: type === 'danger' ? 'alert' : null }, MT.h('span.alert-ico', { 'aria-hidden': 'true' }, icon || icons[type] || 'ℹ️'), MT.h('div', title ? MT.h('strong', title) : null, body));
    },
    badge: function (text, type) { return MT.h('span.badge' + (type ? '.badge-' + type : ''), text); },
    card: function () { var args = Array.prototype.slice.call(arguments); return MT.h.apply(null, ['div.card'].concat([{}], args)); },
    segmented: function (options, value, onChange) {
      var wrap = MT.h('div.segmented', { role: 'group' });
      options.forEach(function (o) {
        var b = MT.h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: function () { MT.$$('button', wrap).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); onChange(o.value); } }, o.label);
        wrap.appendChild(b);
      });
      return wrap;
    },
    tabs: function (tabs, active, onChange) {
      var wrap = MT.h('div.tabs', { role: 'tablist' });
      tabs.forEach(function (tb) {
        var b = MT.h('button', { type: 'button', role: 'tab', 'aria-selected': String(tb.id === active), onclick: function () { MT.$$('[role=tab]', wrap).forEach(function (x) { x.setAttribute('aria-selected', 'false'); }); b.setAttribute('aria-selected', 'true'); onChange(tb.id); } }, tb.label);
        wrap.appendChild(b);
      });
      return wrap;
    },
    empty: function (icon, title, body) { return MT.h('div.empty-state', MT.h('div.big', icon || '🗂️'), MT.h('div', { style: 'font-weight:700;color:var(--text)' }, title || ''), body ? MT.h('div', body) : null); },
    disclaimer: function (text) { return MT.h('p.disclaimer', text || MT.t('For education and decision support only. It does not replace professional judgement or local protocols.')); }
  };

  /* ======================================================================
     7. Speech — read aloud using the device's built-in voices (works offline
        on most phones). Long text is chunked to avoid browser cut-offs.
     ====================================================================== */
  var synth = global.speechSynthesis;
  MT.speech = {
    supported: !!(synth && global.SpeechSynthesisUtterance),
    speaking: false,
    pickVoice: function (lang) {
      if (!synth) return null;
      var voices = synth.getVoices() || [];
      var base = (lang || 'en').toLowerCase().split('-')[0];
      return voices.filter(function (v) { return v.lang && v.lang.toLowerCase() === (lang || '').toLowerCase(); })[0]
        || voices.filter(function (v) { return v.lang && v.lang.toLowerCase().split(/[-_]/)[0] === base && v.localService; })[0]
        || voices.filter(function (v) { return v.lang && v.lang.toLowerCase().split(/[-_]/)[0] === base; })[0] || null;
    },
    speak: function (text, opts) {
      if (!MT.speech.supported || !text) return false;
      opts = opts || {};
      MT.speech.stop();
      var lang = opts.lang || MT.i18n.lang || 'en';
      var chunks = String(text).replace(/\s+/g, ' ').match(/[^.!?;:\n]+[.!?;:]*/g) || [String(text)];
      var voice = MT.speech.pickVoice(lang);
      MT.speech.speaking = true; MT.emit('speech:start');
      chunks.forEach(function (c, i) {
        var u = new global.SpeechSynthesisUtterance(c.trim());
        u.lang = voice ? voice.lang : lang; if (voice) u.voice = voice;
        u.rate = opts.rate || MT.settings.get('speechRate') || 1;
        if (i === chunks.length - 1) u.onend = function () { MT.speech.speaking = false; MT.emit('speech:end'); if (opts.onend) opts.onend(); };
        synth.speak(u);
      });
      return true;
    },
    stop: function () { if (synth) { synth.cancel(); } if (MT.speech.speaking) { MT.speech.speaking = false; MT.emit('speech:end'); } },
    /** A "Read aloud" toggle button. getText: string or function returning the text to read. */
    button: function (getText, opts) {
      opts = opts || {};
      if (!MT.speech.supported) return null;
      var label = opts.label || MT.t('Read aloud');
      var btn = MT.h('button.btn.btn-sm.btn-ghost.speak-btn', { type: 'button', 'aria-label': label });
      function idle() { btn.textContent = '🔊 ' + label; btn.dataset.state = 'idle'; }
      idle();
      btn.addEventListener('click', function () {
        if (btn.dataset.state === 'playing') { MT.speech.stop(); idle(); return; }
        var t = typeof getText === 'function' ? getText() : getText;
        if (MT.speech.speak(t, { onend: idle, lang: opts.lang })) { btn.textContent = '⏹ ' + MT.t('Stop'); btn.dataset.state = 'playing'; }
      });
      return btn;
    }
  };
  if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = function () { /* voices load async */ };

  /* ======================================================================
     8. Charts — tiny dependency-free SVG line / scatter chart.
        MT.chart.line({ width, height, x:{min,max,label,ticks,format,time},
          y:{min,max,label,ticks,format}, series:[{name,points:[[x,y]],color,dash,markers,width,area}],
          bands:[{y0,y1,color,label}], xBands:[{x0,x1,color,label}], hlines:[{y,label,color,dash}],
          vlines:[{x,label,color,dash}], points:[{x,y,label,color,r}], legend:true, ariaLabel })
        Returns a wrapper <div> (SVG + legend).
     ====================================================================== */
  function niceStep(range, count) {
    var rough = range / Math.max(1, count), pow = Math.pow(10, Math.floor(Math.log10(rough))), f = rough / pow;
    return (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * pow;
  }
  function ticksFor(min, max, count) {
    if (!(max > min)) return [min];
    var step = niceStep(max - min, count || 5), out = [];
    for (var v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toFixed(10));
    return out;
  }
  MT.chart = {
    ticks: ticksFor,
    palette: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'],
    line: function (o) {
      var W = o.width || 640, H = o.height || 320;
      var pad = Object.assign({ t: 14, r: 16, b: o.x && o.x.label ? 44 : 30, l: o.y && o.y.label ? 58 : 44 }, o.padding || {});
      var series = o.series || [];
      var allPts = []; series.forEach(function (s) { (s.points || []).forEach(function (p) { if (MT.isNum(p[0]) && MT.isNum(p[1])) allPts.push(p); }); });
      (o.points || []).forEach(function (p) { allPts.push([p.x, p.y]); });
      var xs = allPts.map(function (p) { return p[0]; }), ys = allPts.map(function (p) { return p[1]; });
      var X = o.x || {}, Y = o.y || {};
      var xmin = X.min != null ? X.min : (xs.length ? Math.min.apply(null, xs) : 0), xmax = X.max != null ? X.max : (xs.length ? Math.max.apply(null, xs) : 1);
      var ymin = Y.min != null ? Y.min : (ys.length ? Math.min.apply(null, ys) : 0), ymax = Y.max != null ? Y.max : (ys.length ? Math.max.apply(null, ys) : 1);
      if (xmax === xmin) { xmax = xmin + 1; xmin = xmin - (X.time ? 864e5 : 0); }
      if (ymax === ymin) { ymax = ymin + 1; ymin = ymin - 1; }
      var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      var sx = function (v) { return pad.l + (v - xmin) / (xmax - xmin) * iw; };
      var sy = function (v) { return pad.t + (1 - (v - ymin) / (ymax - ymin)) * ih; };
      var fx = X.format || (X.time ? function (v) { var d = new Date(v); return d.getDate() + '/' + (d.getMonth() + 1); } : function (v) { return +v.toFixed(6) + ''; });
      var fy = Y.format || function (v) { return +v.toFixed(6) + ''; };
      var svg = MT.s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'mt-chart', role: 'img', 'aria-label': o.ariaLabel || (Y.label ? Y.label + (X.label ? ' vs ' + X.label : '') : 'Chart') });
      var clipId = MT.uid('clip');
      svg.appendChild(MT.s('defs', MT.s('clipPath', { id: clipId }, MT.s('rect', { x: pad.l, y: pad.t, width: iw, height: ih }))));
      (o.bands || []).forEach(function (b) {
        var y0 = sy(Math.min(Math.max(b.y1, ymin), ymax)), y1 = sy(Math.max(Math.min(b.y0, ymax), ymin));
        svg.appendChild(MT.s('rect', { x: pad.l, y: y0, width: iw, height: Math.max(0, y1 - y0), fill: b.color || 'var(--ok-soft)', opacity: b.opacity || 0.9 }));
        if (b.label) svg.appendChild(MT.s('text', { x: pad.l + iw - 4, y: y0 + 12, 'text-anchor': 'end', style: 'font-size:10px' }, b.label));
      });
      (o.xBands || []).forEach(function (b) {
        var x0 = sx(Math.max(b.x0, xmin)), x1 = sx(Math.min(b.x1, xmax));
        svg.appendChild(MT.s('rect', { x: x0, y: pad.t, width: Math.max(0, x1 - x0), height: ih, fill: b.color || 'var(--surface-2)', opacity: b.opacity || 0.9 }));
        if (b.label) svg.appendChild(MT.s('text', { x: x0 + 4, y: pad.t + 12, style: 'font-size:10px' }, b.label));
      });
      var g = MT.s('g', { class: 'grid' }), ax = MT.s('g', { class: 'axis' });
      var yt = Y.ticks && Array.isArray(Y.ticks) ? Y.ticks : ticksFor(ymin, ymax, Y.ticks || 5);
      yt.forEach(function (v) { var y = sy(v); g.appendChild(MT.s('line', { x1: pad.l, x2: pad.l + iw, y1: y, y2: y })); ax.appendChild(MT.s('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }, fy(v))); });
      var xt = X.ticks && Array.isArray(X.ticks) ? X.ticks : (X.time ? (function () { var n = Math.min(6, Math.max(2, Math.round(iw / 90))), out = []; for (var i = 0; i <= n; i++) out.push(xmin + (xmax - xmin) * i / n); return out; })() : ticksFor(xmin, xmax, X.ticks || Math.max(3, Math.round(iw / 80))));
      xt.forEach(function (v) { var x = sx(v); g.appendChild(MT.s('line', { x1: x, x2: x, y1: pad.t, y2: pad.t + ih, opacity: 0.6 })); ax.appendChild(MT.s('text', { x: x, y: pad.t + ih + 16, 'text-anchor': 'middle' }, fx(v))); });
      ax.appendChild(MT.s('line', { x1: pad.l, x2: pad.l + iw, y1: pad.t + ih, y2: pad.t + ih }));
      ax.appendChild(MT.s('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: pad.t + ih }));
      svg.appendChild(g); svg.appendChild(ax);
      if (X.label) svg.appendChild(MT.s('text', { class: 'axis-label', x: pad.l + iw / 2, y: H - 6, 'text-anchor': 'middle' }, X.label));
      if (Y.label) svg.appendChild(MT.s('text', { class: 'axis-label', x: 14, y: pad.t + ih / 2, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (pad.t + ih / 2) + ')' }, Y.label));
      var plot = MT.s('g', { 'clip-path': 'url(#' + clipId + ')' });
      (o.hlines || []).forEach(function (l) { var y = sy(l.y); plot.appendChild(MT.s('line', { x1: pad.l, x2: pad.l + iw, y1: y, y2: y, stroke: l.color || 'var(--chart-axis)', 'stroke-dasharray': l.dash || '5 4', 'stroke-width': 1.25 })); if (l.label) plot.appendChild(MT.s('text', { x: pad.l + 4, y: y - 4, style: 'font-size:10px' }, l.label)); });
      (o.vlines || []).forEach(function (l) { var x = sx(l.x); plot.appendChild(MT.s('line', { x1: x, x2: x, y1: pad.t, y2: pad.t + ih, stroke: l.color || 'var(--chart-axis)', 'stroke-dasharray': l.dash || '5 4', 'stroke-width': 1.25 })); if (l.label) plot.appendChild(MT.s('text', { x: x + 4, y: pad.t + 12, style: 'font-size:10px' }, l.label)); });
      series.forEach(function (s, i) {
        var color = s.color || MT.chart.palette[i % MT.chart.palette.length];
        var pts = (s.points || []).filter(function (p) { return MT.isNum(p[0]) && MT.isNum(p[1]); });
        if (!pts.length) return;
        if (s.line !== false && pts.length > 1) {
          var d = pts.map(function (p, j) { return (j ? 'L' : 'M') + sx(p[0]).toFixed(2) + ',' + sy(p[1]).toFixed(2); }).join('');
          if (s.area) plot.appendChild(MT.s('path', { d: d + 'L' + sx(pts[pts.length - 1][0]).toFixed(2) + ',' + sy(Math.max(ymin, 0)).toFixed(2) + 'L' + sx(pts[0][0]).toFixed(2) + ',' + sy(Math.max(ymin, 0)).toFixed(2) + 'Z', fill: color, opacity: 0.12 }));
          plot.appendChild(MT.s('path', { d: d, class: 'series', stroke: color, 'stroke-dasharray': s.dash || null, 'stroke-width': s.width || null }));
        }
        if (s.markers || s.line === false || pts.length === 1) pts.forEach(function (p) { plot.appendChild(MT.s('circle', { class: 'marker', cx: sx(p[0]), cy: sy(p[1]), r: s.r || 3.5, fill: color }, MT.s('title', (s.name ? s.name + ': ' : '') + fy(p[1]) + ' @ ' + fx(p[0])))); });
      });
      (o.points || []).forEach(function (p) {
        plot.appendChild(MT.s('circle', { cx: sx(p.x), cy: sy(p.y), r: p.r || 5, fill: p.color || 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }));
        if (p.label) plot.appendChild(MT.s('text', { x: sx(p.x) + 8, y: sy(p.y) - 8, style: 'font-size:11px;font-weight:700;fill:var(--text)' }, p.label));
      });
      svg.appendChild(plot);
      var wrap = MT.h('div.mt-chart-wrap', svg);
      if (o.legend !== false && series.filter(function (s) { return s.name; }).length > 1) {
        wrap.appendChild(MT.h('div.chart-legend', series.filter(function (s) { return s.name; }).map(function (s) {
          var i = series.indexOf(s); return MT.h('span', MT.h('span.sw', { style: 'background:' + (s.color || MT.chart.palette[i % MT.chart.palette.length]) }), s.name);
        })));
      }
      wrap.scale = { x: sx, y: sy, xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax };
      return wrap;
    }
  };

  /* ======================================================================
     9. Calculator engine — declarative calculators rendered as live forms.
        Definition:
        { id, name, category, summary, keywords:[],
          inputs: [
            { id, label, type:'number', unit:'kg' | units:[{id,label,factor|toBase/fromBase,system:'si'|'conv'}], min, max, step, hint, required(default true), default },
            { id, label, type:'bool', points, hint },                         // checkbox -> true/false
            { id, label, type:'radio'|'select', options:[{value,label,points}], default, hint },
            { id, label, type:'text'|'date'|'time', hint, required:false },
            { type:'heading', label }, { type:'note', text }
          ],
          compute(values) -> null | { value, unit, label, band:'ok'|'warn'|'danger'|'info', title,
                                      interpretation, details:[string|{label,value}], warnings:[string] },
          formula, pearls:[], references:[{label,url}], render(container, api)  // optional custom UI
        }
        Number values arrive in the BASE unit (first unit / factor 1). Radio/select values arrive
        as the option's value; booleans as true/false. Missing required inputs -> compute not called.
     ====================================================================== */
  function bandOf(b) {
    var map = { ok: 'ok', low: 'ok', normal: 'ok', good: 'ok', green: 'ok', warn: 'warn', moderate: 'warn', borderline: 'warn', intermediate: 'warn', amber: 'warn', yellow: 'warn', danger: 'danger', high: 'danger', severe: 'danger', critical: 'danger', red: 'danger', info: 'info', neutral: 'info' };
    return map[b] || (b ? 'info' : '');
  }
  function unitToBase(u, x) { return u.toBase ? u.toBase(x) : x * (u.factor == null ? 1 : u.factor); }
  function unitFromBase(u, x) { return u.fromBase ? u.fromBase(x) : x / (u.factor == null ? 1 : u.factor); }
  MT.calc = {
    bandOf: bandOf,
    toBase: unitToBase,
    fromBase: unitFromBase,
    /** Sum `points` from bool inputs and selected radio/select options. */
    sumPoints: function (def, vals) {
      var total = 0;
      def.inputs.forEach(function (inp) {
        var v = vals[inp.id];
        if (inp.type === 'bool' && v && inp.points) total += inp.points;
        if ((inp.type === 'radio' || inp.type === 'select') && v != null) {
          var opt = (inp.options || []).filter(function (o) { return String(o.value) === String(v); })[0];
          if (opt && opt.points) total += opt.points;
        }
      });
      return total;
    },
    /** Plain-text summary for copying into notes. */
    summary: function (def, vals, res) {
      var lines = [def.name + ': ' + (res ? (res.value != null ? res.value + (res.unit ? ' ' + res.unit : '') : '') + (res.title ? ' — ' + res.title : '') : 'incomplete')];
      if (res && res.interpretation) lines.push(res.interpretation);
      var inputs = def.inputs.filter(function (i) { return i.id && vals[i.id] != null && vals[i.id] !== '' && vals[i.id] !== false; }).map(function (i) {
        var v = vals[i.id];
        if (i.type === 'bool') return i.label;
        if (i.type === 'radio' || i.type === 'select') { var o = (i.options || []).filter(function (x) { return String(x.value) === String(v); })[0]; return i.label + ': ' + (o ? o.label : v); }
        if (i.type === 'number') { var bu = i.units ? i.units[0].label : (i.unit || ''); return i.label + ': ' + MT.fmt(v, 2, { trim: true }) + (bu ? ' ' + bu : ''); }
        return i.label + ': ' + v;
      });
      if (inputs.length) lines.push('Inputs — ' + inputs.join('; '));
      return lines.join('\n');
    },
    render: function (def, container, opts) {
      opts = opts || {};
      MT.clear(container);
      if (typeof def.render === 'function') { def.render(container, { MT: MT, def: def }); return; }
      var state = {}; // id -> { el, unit }
      var form = MT.h('form.form-grid' + (opts.cols === 2 ? '.cols-2' : ''), { novalidate: true, onsubmit: function (e) { e.preventDefault(); } });
      var resultBox = MT.h('div', { 'aria-live': 'polite' });
      var unitPref = MT.settings.get('units');
      def.inputs.forEach(function (inp) {
        var fid = MT.uid('f-' + (inp.id || 'x'));
        if (inp.type === 'heading') { form.appendChild(MT.h('h3', { style: 'margin:.4rem 0 0;grid-column:1/-1;font-size:1rem' }, inp.label)); return; }
        if (inp.type === 'note') { form.appendChild(MT.h('p.hint.muted', { style: 'grid-column:1/-1;margin:0;font-size:.86rem' }, inp.text)); return; }
        var hint = inp.hint ? MT.h('div.hint', inp.hint) : null;
        var err = MT.h('div.error', { 'aria-live': 'polite' });
        if (inp.type === 'number') {
          var units = inp.units || null;
          var unitIdx = 0;
          if (units) { var pref = units.findIndex(function (u) { return u.system === unitPref; }); var saved = MT.store.get('calc.unit.' + inp.id); var si = units.findIndex(function (u) { return u.id === saved; }); unitIdx = si >= 0 ? si : (pref >= 0 ? pref : 0); }
          var input = MT.h('input', { id: fid, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: inp.placeholder || '', 'aria-describedby': inp.hint ? fid + '-h' : null });
          if (inp.default != null) input.value = String(inp.default);
          var control;
          if (units && units.length > 1) {
            var sel = MT.h('select', { 'aria-label': (inp.label || '') + ' unit' }, units.map(function (u, i) { return MT.h('option', { value: String(i), selected: i === unitIdx }, u.label); }));
            sel.addEventListener('change', function () {
              var cur = MT.num(input.value), next = Number(sel.value);
              if (cur != null) { var base = unitToBase(units[state[inp.id].unit], cur); var nv = unitFromBase(units[next], base); input.value = String(+nv.toPrecision(5)); }
              state[inp.id].unit = next; MT.store.set('calc.unit.' + inp.id, units[next].id); update();
            });
            control = MT.h('div.input-group', input, sel);
          } else if (units || inp.unit) {
            control = MT.h('div.input-group', input, MT.h('span.addon', units ? units[0].label : inp.unit));
          } else control = input;
          state[inp.id] = { el: input, unit: unitIdx, inp: inp, err: err };
          input.addEventListener('input', update);
          form.appendChild(MT.h('div.field', MT.h('label', { for: fid }, inp.label), control, hint ? (hint.id = fid + '-h', hint) : null, err));
        } else if (inp.type === 'bool') {
          var cb = MT.h('input', { id: fid, type: 'checkbox', checked: !!inp.default });
          cb.addEventListener('change', update);
          state[inp.id] = { el: cb, inp: inp };
          form.appendChild(MT.h('label.check', { for: fid, style: 'grid-column:1/-1' }, cb, MT.h('span.grow', inp.label, inp.hint ? MT.h('div.hint.muted', { style: 'font-size:.82rem' }, inp.hint) : null), inp.points != null && def.showPoints !== false ? MT.h('span.pts', (inp.points > 0 ? '+' : '') + inp.points) : null));
        } else if (inp.type === 'radio') {
          var name = MT.uid('r');
          var group = MT.h('div.choice-list', { role: 'radiogroup', 'aria-labelledby': fid + '-l' });
          (inp.options || []).forEach(function (o) {
            var rid = MT.uid('o');
            var r = MT.h('input', { id: rid, type: 'radio', name: name, value: String(o.value), checked: inp.default != null && String(inp.default) === String(o.value) });
            r.addEventListener('change', update);
            group.appendChild(MT.h('label.check', { for: rid }, r, MT.h('span.grow', o.label, o.hint ? MT.h('div.hint.muted', { style: 'font-size:.82rem' }, o.hint) : null), o.points != null && def.showPoints !== false ? MT.h('span.pts', (o.points > 0 ? '+' : '') + o.points) : null));
          });
          state[inp.id] = { group: group, inp: inp, name: name };
          form.appendChild(MT.h('fieldset.field', { style: 'grid-column:1/-1' }, MT.h('legend', { id: fid + '-l' }, inp.label), hint, group));
        } else if (inp.type === 'select') {
          var s2 = MT.h('select', { id: fid }, [MT.h('option', { value: '' }, inp.placeholder || MT.t('Select…'))].concat((inp.options || []).map(function (o) { return MT.h('option', { value: String(o.value), selected: inp.default != null && String(inp.default) === String(o.value) }, o.label + (o.points != null && def.showPoints !== false ? ' (' + (o.points > 0 ? '+' : '') + o.points + ')' : '')); })));
          s2.addEventListener('change', update);
          state[inp.id] = { el: s2, inp: inp };
          form.appendChild(MT.h('div.field', MT.h('label', { for: fid }, inp.label), s2, hint));
        } else { // text/date/time
          var t = MT.h('input', { id: fid, type: inp.type || 'text', value: inp.default || '' });
          t.addEventListener('input', update);
          state[inp.id] = { el: t, inp: inp };
          form.appendChild(MT.h('div.field', MT.h('label', { for: fid }, inp.label), t, hint));
        }
      });

      function read() {
        var vals = {}, missing = [], invalid = [];
        def.inputs.forEach(function (inp) {
          var st = state[inp.id]; if (!st) return;
          var required = inp.required != null ? inp.required : (inp.type === 'number' || inp.type === 'radio' || inp.type === 'select');
          if (inp.type === 'number') {
            var raw = st.el.value, n = MT.num(raw);
            st.err.textContent = '';
            if (raw && raw.trim() && n == null) { st.err.textContent = MT.t('Enter a number'); invalid.push(inp.label); return; }
            if (n == null) { if (required) missing.push(inp.label); return; }
            var u = inp.units ? inp.units[st.unit] : null;
            var base = u ? unitToBase(u, n) : n;
            if ((inp.min != null && base < inp.min) || (inp.max != null && base > inp.max)) {
              var bu = inp.units ? inp.units[0] : null;
              var lo = inp.min != null ? (u ? +unitFromBase(u, inp.min).toPrecision(4) : inp.min) : null, hi = inp.max != null ? (u ? +unitFromBase(u, inp.max).toPrecision(4) : inp.max) : null;
              st.err.textContent = MT.t('Out of plausible range') + (lo != null && hi != null ? ' (' + lo + '–' + hi + (u ? ' ' + u.label : (inp.unit ? ' ' + inp.unit : '')) + ')' : '');
              invalid.push(inp.label); return;
            }
            vals[inp.id] = base;
          } else if (inp.type === 'bool') vals[inp.id] = !!st.el.checked;
          else if (inp.type === 'radio') {
            var c = MT.$('input:checked', st.group);
            if (c) { var opt = inp.options.filter(function (o) { return String(o.value) === c.value; })[0]; vals[inp.id] = opt ? opt.value : c.value; }
            else if (required) missing.push(inp.label);
          } else if (inp.type === 'select') {
            if (st.el.value !== '') { var o2 = inp.options.filter(function (o) { return String(o.value) === st.el.value; })[0]; vals[inp.id] = o2 ? o2.value : st.el.value; }
            else if (required) missing.push(inp.label);
          } else { if (st.el.value) vals[inp.id] = st.el.value; else if (required === true) missing.push(inp.label); }
        });
        return { vals: vals, missing: missing, invalid: invalid };
      }

      var lastRes = null, lastVals = {};
      function update() {
        var r = read(); lastVals = r.vals;
        MT.clear(resultBox);
        if (r.invalid.length) { resultBox.appendChild(MT.h('div.result.empty', MT.t('Check the highlighted fields.'))); lastRes = null; return; }
        if (r.missing.length) {
          resultBox.appendChild(MT.h('div.result.empty', MT.h('div', MT.t('Complete the inputs to see the result.')), MT.h('div.small', { style: 'margin-top:4px' }, MT.t('Still needed: ') + r.missing.slice(0, 6).join(', ') + (r.missing.length > 6 ? '…' : ''))));
          lastRes = null; return;
        }
        var res;
        try { res = def.compute(r.vals); } catch (e) { console.error(e); res = null; resultBox.appendChild(MT.ui.alert('danger', MT.t('Calculation error'), String(e.message || e))); return; }
        lastRes = res;
        if (!res) { resultBox.appendChild(MT.h('div.result.empty', MT.t('Not enough information for a result.'))); return; }
        var band = bandOf(res.band);
        var box = MT.h('div.result' + (band ? '.band-' + band : ''),
          MT.h('div.result-label', res.label || MT.t('Result')),
          res.value != null ? MT.h('div.result-value', String(res.value), res.unit ? MT.h('span.unit', res.unit) : null) : null,
          res.title ? MT.h('div.result-title', res.title) : null,
          res.interpretation ? MT.h('p', { style: 'margin:.2rem 0 0' }, res.interpretation) : null,
          res.details && res.details.length ? MT.h('ul', { style: 'margin:.6rem 0 0;font-size:.92rem' }, res.details.map(function (d) { return typeof d === 'string' ? MT.h('li', d) : MT.h('li', MT.h('span.muted', d.label + ': '), MT.h('strong', String(d.value))); })) : null,
          res.warnings && res.warnings.length ? MT.h('div', { style: 'margin-top:.6rem' }, res.warnings.map(function (w) { return MT.ui.alert('warn', null, w); })) : null,
          MT.h('div.row', { style: 'margin-top:.8rem;--gap:.4rem' },
            MT.h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.copy(MT.calc.summary(def, lastVals, lastRes)); } }, '📋 ' + MT.t('Copy summary')))
        );
        resultBox.appendChild(box);
        if (opts.onResult) opts.onResult(res, r.vals);
      }

      var resetBtn = MT.h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { form.reset(); Object.keys(state).forEach(function (k) { if (state[k].err) state[k].err.textContent = ''; }); update(); } }, '↺ ' + MT.t('Reset'));
      var info = MT.h('div.stack.stack-sm', { style: 'margin-top:1rem' },
        def.formula ? MT.h('details.disclosure', MT.h('summary', MT.t('How it is calculated')), MT.h('div.disclosure-body', typeof def.formula === 'string' ? MT.h('div', { style: 'white-space:pre-wrap;font-size:.92rem' }, def.formula) : def.formula)) : null,
        def.pearls && def.pearls.length ? MT.h('details.disclosure', MT.h('summary', MT.t('Pearls & pitfalls')), MT.h('div.disclosure-body', MT.h('ul', { style: 'margin:0' }, def.pearls.map(function (p) { return MT.h('li', p); })))) : null,
        def.references && def.references.length ? MT.h('details.disclosure', MT.h('summary', MT.t('References')), MT.h('div.disclosure-body', MT.h('ol', { style: 'margin:0;font-size:.9rem' }, def.references.map(function (r) { return MT.h('li', r.url ? MT.h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.label) : r.label); })))) : null
      );
      container.appendChild(MT.h('div.split',
        MT.h('div.card', form, MT.h('div.row.row-end', { style: 'margin-top:.75rem' }, resetBtn)),
        MT.h('div.stack.sticky-top', resultBox, info)));
      update();
      return { update: update, read: read };
    }
  };

  /* ======================================================================
     10. Calendar export — builds .ics files (RFC 5545) with floating local
         times, so reminders fire at the same clock time wherever the user is.
         MT.ics.build({ name, events:[{ uid, title, description, start: Date, durationMin, rrule, alarmMin }] })
     ====================================================================== */
  function icsDate(d) { return d.getFullYear() + MT.pad2(d.getMonth() + 1) + MT.pad2(d.getDate()) + 'T' + MT.pad2(d.getHours()) + MT.pad2(d.getMinutes()) + '00'; }
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function icsFold(line) { var out = [], s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); }
  MT.ics = {
    build: function (cal) {
      var now = new Date(), stamp = now.getUTCFullYear() + MT.pad2(now.getUTCMonth() + 1) + MT.pad2(now.getUTCDate()) + 'T' + MT.pad2(now.getUTCHours()) + MT.pad2(now.getUTCMinutes()) + '00Z';
      var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Medical Toolkit//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
      if (cal.name) L.push('X-WR-CALNAME:' + icsEsc(cal.name));
      (cal.events || []).forEach(function (ev) {
        var start = ev.start instanceof Date ? ev.start : new Date(ev.start);
        var end = new Date(start.getTime() + (ev.durationMin || 10) * 60000);
        L.push('BEGIN:VEVENT', 'UID:' + (ev.uid || MT.uid('ev')) + '@open-medical-toolkit', 'DTSTAMP:' + stamp, 'DTSTART:' + icsDate(start), 'DTEND:' + icsDate(end), 'SUMMARY:' + icsEsc(ev.title));
        if (ev.description) L.push('DESCRIPTION:' + icsEsc(ev.description));
        if (ev.rrule) L.push('RRULE:' + ev.rrule);
        if (ev.alarmMin != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(ev.title), 'TRIGGER:-PT' + Math.max(0, ev.alarmMin | 0) + 'M', 'END:VALARM');
        L.push('END:VEVENT');
      });
      L.push('END:VCALENDAR');
      return L.map(icsFold).join('\r\n') + '\r\n';
    },
    download: function (filename, cal) { MT.download(filename, MT.ics.build(cal), 'text/calendar'); }
  };

  /* ======================================================================
     11. Profile — shared personal profile for the public-health suite.
         Schema (all optional): { name, birthYear, sex:'female'|'male', heightCm, weightKg,
         waistCm, country (ISO alpha-2), pregnant, breastfeeding, conditions:[ids], smoking,
         emergencyNumber, ancestry:'asian'|'other' }
     ====================================================================== */
  MT.profile = {
    key: 'health.profile',
    get: function () { return MT.store.get(MT.profile.key, {}); },
    set: function (patch) { var p = Object.assign(MT.profile.get(), patch || {}); p.updatedAt = new Date().toISOString(); MT.store.set(MT.profile.key, p); MT.emit('profile:change', p); return p; },
    age: function (p) { p = p || MT.profile.get(); if (MT.isNum(p.birthYear)) return new Date().getFullYear() - p.birthYear; return MT.isNum(p.age) ? p.age : undefined; },
    bmi: function (p) { p = p || MT.profile.get(); return (MT.isNum(p.weightKg) && MT.isNum(p.heightCm) && p.heightCm > 0) ? p.weightKg / Math.pow(p.heightCm / 100, 2) : undefined; }
  };

  /* ======================================================================
     12. Tool registry, widgets, router and app shell
     ====================================================================== */
  MT.tools = [];
  MT.widgets = [];
  MT.searchProviders = [];
  /**
   * Register a tool (a page in a suite).
   * { id, title, category, icon, description, keywords:[], order, header:true,
   *   render(container, ctx) -> optional cleanup function }
   * ctx = { params:[...], navigate(hash), setTitle(text), tool }
   */
  MT.registerTool = function (tool) {
    if (!tool || !tool.id || typeof tool.render !== 'function') { console.error('Invalid tool', tool); return; }
    if (MT.tools.some(function (t) { return t.id === tool.id; })) { console.warn('Duplicate tool id', tool.id); return; }
    MT.tools.push(tool);
    if (MT.app && MT.app.started) MT.app.refresh();
  };
  /** Home-screen widget: { id, order, render(container) -> optional cleanup } */
  MT.registerWidget = function (w) { MT.widgets.push(w); MT.widgets.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); if (MT.app && MT.app.started) MT.app.refresh(); };
  /** Extra search results: fn(query) -> [{title, description, href, icon}] */
  MT.registerSearch = function (fn) { MT.searchProviders.push(fn); };

  MT.app = {
    started: false,
    config: null,
    cleanup: null,
    currentId: null,
    navigate: function (hash) { if (global.location.hash === hash) MT.app.route(); else global.location.hash = hash; },
    refresh: function () { if (!MT.app.started) return; buildNav(); var q = parseHash(); if (!q.id || q.id === MT.app.currentId || !MT.app.currentId) MT.app.route(); },
    /**
     * Start a suite. cfg: { suite, title, subtitle, logo, root:'../', categories:[{id,title}],
     *   home(container) -> optional custom home, hero:{title, lead}, footer, i18n:true, install:true }
     */
    start: function (cfg) {
      MT.app.config = cfg;
      MT.settings.apply();
      if (cfg.i18n) MT.i18n.set(MT.settings.get('lang')); else MT.i18n.set('en');
      doc.body.setAttribute('data-suite', cfg.suite || '');
      buildShell(cfg);
      MT.app.started = true;
      buildNav();
      global.addEventListener('hashchange', MT.app.route);
      MT.app.route();
      registerSW(cfg);
      MT.on('settings:change', function (e) { if (e.key === 'lang' && cfg.i18n) { MT.i18n.set(e.value); buildShell(cfg); buildNav(); MT.app.route(); } });
    }
  };

  var els = {};
  function parseHash() {
    var h = (global.location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { id: parts[0] || '', params: parts.slice(1) };
  }
  function categoryTitle(id) { var c = (MT.app.config.categories || []).filter(function (x) { return x.id === id; })[0]; return c ? MT.t(c.title) : (id || MT.t('Tools')); }
  function sortedTools() {
    var cats = (MT.app.config.categories || []).map(function (c) { return c.id; });
    return MT.tools.slice().sort(function (a, b) {
      var ca = cats.indexOf(a.category), cb = cats.indexOf(b.category);
      if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
      return (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title));
    });
  }
  function groupTools() {
    var groups = [], idx = {};
    sortedTools().forEach(function (t) { var c = t.category || 'other'; if (!(c in idx)) { idx[c] = groups.length; groups.push({ id: c, title: categoryTitle(c), tools: [] }); } groups[idx[c]].tools.push(t); });
    return groups;
  }

  function buildShell(cfg) {
    MT.clear(doc.body);
    var root = cfg.root || '../';
    els.search = MT.h('input', { type: 'search', placeholder: MT.t('Search tools…'), 'aria-label': MT.t('Search tools'), autocomplete: 'off' });
    els.results = MT.h('div.search-results', { hidden: true, role: 'listbox' });
    var installBtn = MT.h('button.icon-btn', { type: 'button', title: MT.t('Install app'), 'aria-label': MT.t('Install app'), hidden: true }, '⬇');
    els.installBtn = installBtn;
    installBtn.addEventListener('click', function () { if (MT.app.deferredPrompt) { MT.app.deferredPrompt.prompt(); MT.app.deferredPrompt = null; installBtn.hidden = true; } });
    var header = MT.h('header.app-header',
      MT.h('button.icon-btn.menu-btn', { type: 'button', 'aria-label': MT.t('Menu'), onclick: function () { doc.body.classList.toggle('nav-open'); } }, '☰'),
      MT.h('a.app-brand', { href: '#/' }, MT.h('span.logo', { 'aria-hidden': 'true' }, cfg.logo || '✚'), MT.h('span.name', MT.t(cfg.title)), cfg.subtitle ? MT.h('span.suite-tag', MT.t(cfg.subtitle)) : null),
      MT.h('div.header-search', MT.h('span.icon', { 'aria-hidden': 'true' }, '🔍'), els.search, els.results),
      cfg.quickExit ? MT.h('button.btn.btn-sm.quick-exit', { type: 'button', title: MT.t('Quickly leave this screen (for privacy on a shared phone)'), onclick: MT.app.quickExit }, '✕ ' + MT.t('Exit')) : null,
      installBtn,
      MT.h('a.icon-btn', { href: root + 'index.html', title: MT.t('All suites'), 'aria-label': MT.t('All suites') }, '⌂'),
      MT.h('button.icon-btn', { type: 'button', title: MT.t('Settings'), 'aria-label': MT.t('Settings'), onclick: openSettings }, '⚙'));
    els.sidebar = MT.h('nav.app-sidebar', { 'aria-label': MT.t('Tools') });
    els.content = MT.h('div.content', { id: 'main', tabindex: '-1' });
    var footer = MT.h('footer.app-footer',
      MT.h('p', cfg.footer || MT.t('Free and open. Works offline. Everything you enter stays on this device — nothing is sent anywhere.')),
      MT.h('p', MT.t('Educational and decision-support tools; they do not replace a qualified health professional, local protocols or emergency services.')));
    els.main = MT.h('main.app-main', els.content, footer);
    doc.body.appendChild(MT.h('a.skip-link', { href: '#main', onclick: function (e) { e.preventDefault(); els.content.focus(); } }, MT.t('Skip to content')));
    doc.body.appendChild(header);
    doc.body.appendChild(MT.h('div.app-body', els.sidebar, MT.h('div.nav-scrim', { onclick: function () { doc.body.classList.remove('nav-open'); } }), els.main));
    wireSearch();
  }

  function buildNav() {
    var nav = els.sidebar; if (!nav) return;
    MT.clear(nav);
    var q = parseHash();
    nav.appendChild(MT.h('div.nav-group', MT.h('a.nav-link', { href: '#/', 'aria-current': !q.id ? 'page' : null }, MT.h('span.nav-ico', '🏠'), MT.t('Home'))));
    groupTools().forEach(function (g) {
      nav.appendChild(MT.h('div.nav-group', MT.h('div.nav-group-title', g.title), g.tools.map(function (t) {
        return MT.h('a.nav-link', { href: '#/' + t.id, 'aria-current': q.id === t.id ? 'page' : null, onclick: function () { doc.body.classList.remove('nav-open'); } }, MT.h('span.nav-ico', { 'aria-hidden': 'true' }, t.icon || '•'), MT.t(t.title));
      })));
    });
  }

  function searchAll(query) {
    var q = query.trim().toLowerCase(); if (!q) return [];
    var terms = q.split(/\s+/);
    var out = [];
    MT.tools.forEach(function (t) {
      var hay = [MT.t(t.title), t.title, t.description || '', (t.keywords || []).join(' '), categoryTitle(t.category)].join(' ').toLowerCase();
      if (terms.every(function (w) { return hay.indexOf(w) >= 0; })) out.push({ title: MT.t(t.title), description: MT.t(t.description || ''), href: '#/' + t.id, icon: t.icon, score: hay.indexOf(terms[0]) });
    });
    MT.searchProviders.forEach(function (fn) { try { (fn(q) || []).forEach(function (r) { out.push(Object.assign({ score: 50 }, r)); }); } catch (e) { console.error(e); } });
    return out.sort(function (a, b) { return a.score - b.score; }).slice(0, 30);
  }
  function wireSearch() {
    var active = -1, items = [];
    function close() { els.results.hidden = true; active = -1; }
    function render() {
      items = searchAll(els.search.value);
      MT.clear(els.results);
      if (!els.search.value.trim()) return close();
      if (!items.length) { els.results.appendChild(MT.h('div', { style: 'padding:10px;color:var(--muted)' }, MT.t('No matches'))); els.results.hidden = false; return; }
      items.forEach(function (it, i) {
        els.results.appendChild(MT.h('a', { href: it.href, role: 'option', class: i === active ? 'active' : null, onclick: function () { close(); els.search.value = ''; doc.body.classList.remove('nav-open'); } },
          MT.h('div.sr-title', (it.icon ? it.icon + ' ' : '') + it.title), it.description ? MT.h('div.sr-desc', it.description) : null));
      });
      els.results.hidden = false;
    }
    els.search.addEventListener('input', function () { active = -1; render(); });
    els.search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === 'Enter') { var it = items[active >= 0 ? active : 0]; if (it) { global.location.hash = it.href; close(); els.search.value = ''; els.search.blur(); } }
      else if (e.key === 'Escape') { close(); els.search.blur(); }
    });
    els.search.addEventListener('blur', function () { setTimeout(close, 180); });
  }
  doc.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/input|textarea|select/i.test((doc.activeElement || {}).tagName || '') && els.search) { e.preventDefault(); els.search.focus(); }
    if (e.key === 'Escape') doc.body.classList.remove('nav-open');
  });

  MT.app.route = function () {
    if (!MT.app.started) return;
    var q = parseHash();
    if (typeof MT.app.cleanup === 'function') { try { MT.app.cleanup(); } catch (e) { console.error(e); } }
    MT.app.cleanup = null;
    if (MT.speech) MT.speech.stop();
    var content = els.content; MT.clear(content);
    var tool = q.id ? MT.tools.filter(function (t) { return t.id === q.id; })[0] : null;
    MT.app.currentId = tool ? tool.id : null;
    buildNav();
    var cfg = MT.app.config;
    if (!tool) {
      doc.title = MT.t(cfg.title) + (cfg.subtitle ? ' — ' + MT.t(cfg.subtitle) : '');
      if (q.id && MT.tools.length) content.appendChild(MT.ui.alert('warn', MT.t('Page not found'), MT.t('That tool does not exist (yet). Showing the home page.')));
      renderHome(content);
    } else {
      doc.title = MT.t(tool.title) + ' · ' + MT.t(cfg.title);
      var host = MT.h('div.tool-host');
      if (tool.header !== false) {
        content.appendChild(MT.h('div.page-head',
          MT.h('div.breadcrumb', MT.h('a', { href: '#/' }, MT.t('Home')), ' › ', categoryTitle(tool.category)),
          MT.h('h1', MT.h('span', { 'aria-hidden': 'true' }, tool.icon || ''), MT.t(tool.title)),
          tool.description ? MT.h('p.lead', MT.t(tool.description)) : null));
      }
      content.appendChild(host);
      try {
        var ret = tool.render(host, { params: q.params, tool: tool, navigate: MT.app.navigate, setTitle: function (t) { doc.title = t + ' · ' + MT.t(cfg.title); } });
        if (typeof ret === 'function') MT.app.cleanup = ret;
      } catch (e) {
        console.error(e);
        host.appendChild(MT.h('div.error-box', MT.h('strong', MT.t('This tool hit an error.')), MT.h('p.small.mono', String(e && e.stack || e)), MT.h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.copy(String(e && e.stack || e)); } }, MT.t('Copy error details'))));
      }
    }
    global.scrollTo(0, 0);
    if (q.id) setTimeout(function () { try { content.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
  };

  function renderHome(content) {
    var cfg = MT.app.config;
    var cleanups = [];
    if (typeof cfg.home === 'function') { var r = cfg.home(content); if (typeof r === 'function') cleanups.push(r); }
    else if (cfg.hero) content.appendChild(MT.h('div.page-head', MT.h('h1', MT.t(cfg.hero.title)), cfg.hero.lead ? MT.h('p.lead', MT.t(cfg.hero.lead)) : null));
    if (MT.widgets.length) {
      var wrap = MT.h('div.stack', { style: 'margin-bottom:8px' });
      content.appendChild(wrap);
      MT.widgets.forEach(function (w) {
        var box = MT.h('section.widget', { 'data-widget': w.id });
        wrap.appendChild(box);
        try { var c = w.render(box); if (typeof c === 'function') cleanups.push(c); } catch (e) { console.error(e); box.appendChild(MT.ui.alert('warn', null, 'Widget "' + w.id + '" failed to load.')); }
      });
    }
    if (cfg.showToolGrid !== false) {
      if (!MT.tools.length) content.appendChild(MT.ui.empty('🧰', MT.t('No tools loaded'), MT.t('Check your connection and reload.')));
      groupTools().forEach(function (g) {
        content.appendChild(MT.h('h2.section-title', g.title));
        content.appendChild(MT.h('div.grid', { style: '--min:250px' }, g.tools.map(function (t) {
          return MT.h('a.card.tool-card', { href: '#/' + t.id }, MT.h('div.tool-ico', { 'aria-hidden': 'true' }, t.icon || '•'), MT.h('div', MT.h('div.tool-title', MT.t(t.title)), MT.h('p.tool-desc', MT.t(t.description || ''))));
        })));
      });
    }
    MT.app.cleanup = function () { cleanups.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); };
  }

  function openSettings() {
    var s = MT.settings.get();
    var body = MT.h('div.stack');
    function row(label, control, hint) { return MT.h('div.field', MT.h('div.field-label', label), control, hint ? MT.h('div.hint', hint) : null); }
    body.appendChild(row(MT.t('Appearance'), MT.ui.segmented([{ value: 'auto', label: MT.t('Auto') }, { value: 'light', label: MT.t('Light') }, { value: 'dark', label: MT.t('Dark') }], s.theme, function (v) { MT.settings.set('theme', v); })));
    body.appendChild(row(MT.t('Text size'), MT.ui.segmented([{ value: 'normal', label: 'A' }, { value: 'large', label: 'A+' }, { value: 'xlarge', label: 'A++' }], s.textSize, function (v) { MT.settings.set('textSize', v); })));
    if (MT.app.config && MT.app.config.suite !== 'health') {
      body.appendChild(row(MT.t('Preferred lab units'), MT.ui.segmented([{ value: 'si', label: 'SI (mmol/L, µmol/L)' }, { value: 'conv', label: 'Conventional (mg/dL)' }], s.units, function (v) { MT.settings.set('units', v); MT.store.clear('calc.unit.'); MT.app.route(); })));
    }
    if (MT.app.config && MT.app.config.i18n && MT.i18n.languages.length > 1) {
      var sel = MT.h('select.select', MT.i18n.languages.map(function (l) { return MT.h('option', { value: l.code, selected: l.code === s.lang }, l.name); }));
      sel.addEventListener('change', function () { MT.settings.set('lang', sel.value); });
      body.appendChild(row(MT.t('Language'), sel, MT.t('Some content may still appear in English.')));
    }
    if (MT.speech.supported) {
      var rate = MT.h('input', { type: 'range', min: '0.6', max: '1.4', step: '0.05', value: String(s.speechRate) });
      rate.addEventListener('change', function () { MT.settings.set('speechRate', Number(rate.value)); MT.speech.speak(MT.t('This is how fast I will read aloud.')); });
      body.appendChild(row(MT.t('Read-aloud speed'), rate));
    }
    var suite = (MT.app.config && MT.app.config.suite) || '';
    body.appendChild(MT.h('hr'));
    body.appendChild(MT.h('div.field', MT.h('div.field-label', MT.t('Your data')),
      MT.h('p.hint', MT.store.persistent ? MT.t('Saved only in this browser on this device ({kb} KB used). Make a backup file to move it to another device.', { kb: Math.round(MT.store.bytesUsed('') / 1024) }) : MT.t('This browser is blocking storage, so data will be lost when you close the page.')),
      MT.h('div.row', { style: '--gap:.5rem' },
        MT.h('button.btn.btn-sm', { type: 'button', onclick: function () { var data = { app: 'open-medical-toolkit', version: MT.version, exportedAt: new Date().toISOString(), data: MT.store.exportAll(suite ? suite + '.' : '') }; MT.download('backup-' + (suite || 'all') + '-' + MT.today() + '.json', JSON.stringify(data, null, 2), 'application/json'); } }, '⬇ ' + MT.t('Back up')),
        MT.h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.readFile('.json').then(function (f) { var obj = JSON.parse(f.text); if (!obj || obj.app !== 'open-medical-toolkit' || typeof obj.data !== 'object') throw new Error('Not a backup file'); MT.store.importAll(obj.data); MT.toast(MT.t('Backup restored'), 'ok'); MT.app.route(); }).catch(function (e) { if (e && e.message !== 'No file') MT.toast(MT.t('Could not restore: ') + e.message, 'danger'); }); } }, '⬆ ' + MT.t('Restore')),
        MT.h('button.btn.btn-sm.btn-ghost', { type: 'button', style: 'color:var(--danger)', onclick: function () { MT.confirm(MT.t('Erase all saved data for this suite on this device? This cannot be undone.'), { danger: true, okLabel: MT.t('Erase') }).then(function (ok) { if (ok) { MT.store.clear(suite ? suite + '.' : ''); MT.toast(MT.t('Data erased'), 'ok'); MT.app.route(); } }); } }, '🗑 ' + MT.t('Erase')))));
    body.appendChild(MT.h('p.small.muted', MT.t('Version') + ' ' + MT.version + ' · ' + (navigator.onLine ? MT.t('online') : MT.t('offline'))));
    MT.modal({ title: MT.t('Settings'), body: body, actions: [{ label: MT.t('Done'), variant: 'primary' }] });
  }
  MT.app.openSettings = openSettings;
  /**
   * Quick exit (privacy on shared phones): stops speech, wipes the screen and
   * leaves for a neutral page. Offline it falls back to a blank neutral screen.
   */
  MT.app.quickExit = function () {
    try { MT.speech.stop(); } catch (e) { /* ignore */ }
    MT.clear(doc.body);
    doc.title = 'Weather';
    try { global.history.replaceState(null, '', global.location.pathname); } catch (e) { /* ignore */ }
    if (global.navigator.onLine !== false) global.location.replace('https://www.wikipedia.org/');
    else doc.body.appendChild(MT.h('p', { style: 'padding:24px;font-family:system-ui;color:#555' }, ''));
  };

  function registerSW(cfg) {
    global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); MT.app.deferredPrompt = e; if (els.installBtn && cfg.install !== false) els.installBtn.hidden = false; });
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(global.location.protocol)) return;
    if (/^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) && global.location.search.indexOf('sw=1') < 0) return; // keep dev reloads fresh
    var swUrl = (cfg.root || '../') + 'sw.js';
    global.addEventListener('load', function () { navigator.serviceWorker.register(swUrl).catch(function (e) { console.warn('SW registration failed', e); }); });
  }

  MT.settings.apply();
})(typeof window !== 'undefined' ? window : globalThis);

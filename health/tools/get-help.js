/* ==========================================================================
   Salus · H2 "Get help now" — UI
   Registers: home widget 'emergency' (order 0); tools 'get-help' (help, 0),
   'first-aid' (help, 1) and 'crisis' (mind, 0); a search provider; and the
   runtime hand-off MT.help = { emergencyNumber() } (set at script load).

   Safety rules (docs/ARCHITECTURE.md, Quality bar 2): the emergency route is
   always first (red call bar at the top of every page), results never say
   "you are fine", every result carries a safety net, and every guide has
   read-aloud. Logic lives in health/lib/triage-lay.js (MTLib.triageLay);
   first-aid content in health/data/first-aid.js (MTData.firstAid).
   Storage (own keys only): health.gethelp.numbers, health.gethelp.safetyplan.
   ========================================================================== */
(function () {
  'use strict';
  var h = MT.h, t = MT.t;
  var W = typeof window !== 'undefined' ? window : self;
  var L = (W.MTLib && W.MTLib.triageLay) || null;
  var FA = (W.MTData && W.MTData.firstAid) || { cards: [], index: {}, groups: [], sources: {} };
  var NUM_KEY = 'health.gethelp.numbers';
  var PLAN_KEY = 'health.gethelp.safetyplan';
  var FINDAHELPLINE = 'https://findahelpline.com';
  /** Per-session memory (not stored): ticked signs, chosen bands, search text. */
  var memo = { checks: {}, shown: {}, band: 'child', faQuery: '', cprMode: 'hands', cprSound: true, groundRead: false };

  /* ======================================================================
     1. MT.help — runtime hand-off for every package (set at script load)
     ====================================================================== */
  function localeCountry() {
    try {
      var nav = W.navigator || {};
      var langs = (nav.languages && nav.languages.length) ? Array.prototype.slice.call(nav.languages) : [nav.language];
      return L ? L.countryFromLocales(langs) : '';
    } catch (e) { return ''; }
  }
  function readNumbers() {
    var raw = MT.store.get(NUM_KEY, null);
    if (L) return L.normalizeNumbers(raw);
    return (raw && typeof raw === 'object') ? raw : {};
  }
  function readProfile() { try { return MT.profile.get() || {}; } catch (e) { return {}; } }
  function helpInfo() {
    try { if (L) return L.emergencyInfo(readNumbers(), readProfile(), localeCountry()); } catch (e) { /* fall through to 112 */ }
    return { number: '112', source: 'default', country: '', confirmed: false };
  }
  function telHref(num) {
    if (L) return L.telHref(num) || 'tel:112';
    var d = String(num || '').replace(/[^\d+]/g, '');
    return 'tel:' + (d || '112');
  }

  MT.help = {
    /** Number every "Call" button should dial: user-saved, else the country default, else '112'. */
    emergencyNumber: function () { return helpInfo().number; },
    /** { number, source: 'saved'|'profile'|'country'|'default', country, confirmed } */
    info: helpInfo,
    /** The user's saved numbers (health.gethelp.numbers), cleaned. */
    numbers: readNumbers,
    /** tel: link for a number (default: the emergency number). */
    telHref: function (num) { return telHref(num || helpInfo().number); },
    /** A red "Call {number}" link element. opts: { number, label, large } */
    callButton: function (opts) {
      opts = opts || {};
      var n = opts.number || helpInfo().number;
      return callLink(n, opts.label, opts.large);
    }
  };

  /* ======================================================================
     2. Styles (prefix h2-; only core CSS variables, correct in dark mode)
     ====================================================================== */
  MT.css('h2', [
    /* red emergency surfaces: light = white on red; dark = light text on deep red */
    '.h2-sos,.h2-callbar,.h2-sticky{--h2r-bg:var(--danger);--h2r-fg:var(--surface);--h2r-btn-bg:var(--surface);--h2r-btn-fg:var(--danger);--h2r-line:color-mix(in srgb,var(--surface) 60%,transparent)}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .h2-sos,:root:not([data-theme="light"]) .h2-callbar,:root:not([data-theme="light"]) .h2-sticky{--h2r-bg:color-mix(in srgb,var(--danger) 26%,var(--surface));--h2r-fg:var(--text);--h2r-btn-bg:var(--danger);--h2r-btn-fg:var(--bg);--h2r-line:var(--danger-border)}}',
    ':root[data-theme="dark"] .h2-sos,:root[data-theme="dark"] .h2-callbar,:root[data-theme="dark"] .h2-sticky{--h2r-bg:color-mix(in srgb,var(--danger) 26%,var(--surface));--h2r-fg:var(--text);--h2r-btn-bg:var(--danger);--h2r-btn-fg:var(--bg);--h2r-line:var(--danger-border)}',
    '.h2-sos{background:var(--h2r-bg);color:var(--h2r-fg);border:1px solid var(--h2r-line);border-radius:var(--radius);padding:16px;display:grid;gap:12px;box-shadow:var(--shadow)}',
    '.h2-sos-title{display:flex;gap:.75rem;align-items:center}',
    '.h2-sos-title h2{margin:0;color:inherit;font-size:1.35rem}',
    '.h2-sos-title p{margin:2px 0 0}',
    '.h2-sos-ico{font-size:2.1rem;line-height:1;flex:none}',
    'a.h2-bigcall,a.h2-bigcall:visited,a.h2-callbar-btn,a.h2-callbar-btn:visited{display:flex;align-items:center;justify-content:center;gap:.55rem;min-height:60px;padding:8px 18px;border-radius:14px;background:var(--h2r-btn-bg);color:var(--h2r-btn-fg);font-weight:800;font-size:1.4rem;text-decoration:none;box-shadow:var(--shadow-sm);font-variant-numeric:tabular-nums}',
    'a.h2-bigcall:hover,a.h2-callbar-btn:hover{filter:brightness(1.04)}',
    '.h2-sos-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    'a.h2-sos-act,a.h2-sos-act:visited{display:flex;align-items:center;justify-content:center;gap:.45rem;min-height:54px;padding:6px 10px;border-radius:12px;border:2px solid var(--h2r-line);color:var(--h2r-fg);font-weight:750;text-decoration:none;text-align:center;line-height:1.2}',
    'a.h2-sos-act:hover{background:color-mix(in srgb,var(--h2r-fg) 12%,transparent)}',
    '.h2-sos-note{font-size:.88rem;margin:0}',
    '.h2-sos-note a,.h2-sos-note a:visited,.h2-callbar-note a,.h2-callbar-note a:visited,.h2-sticky a.h2-link,.h2-sticky a.h2-link:visited{color:inherit;font-weight:750}',
    '.h2-sos :focus-visible,.h2-callbar :focus-visible,.h2-sticky :focus-visible{outline:3px solid var(--h2r-fg);outline-offset:2px;box-shadow:none}',
    '@media (min-width:760px){.h2-sos{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center}.h2-sos-title,.h2-sos-note{grid-column:1/-1}}',
    '.h2-callbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;border-radius:var(--radius);background:var(--h2r-bg);color:var(--h2r-fg);margin:0 0 14px;border:1px solid var(--h2r-line)}',
    '.h2-callbar-text{flex:1 1 230px;min-width:0;line-height:1.35}',
    '.h2-callbar-text strong{display:block;font-size:1.1rem}',
    'a.h2-callbar-btn,a.h2-callbar-btn:visited{flex:1 1 210px;min-height:56px;font-size:1.25rem}',
    'a.h2-callbar-alt,a.h2-callbar-alt:visited{flex:1 1 180px;min-height:48px;display:flex;align-items:center;justify-content:center;gap:.4rem;border-radius:12px;border:2px solid var(--h2r-line);color:var(--h2r-fg);font-weight:750;text-decoration:none;padding:6px 12px;text-align:center}',
    '.h2-callbar-note{flex-basis:100%;font-size:.86rem;margin:0}',
    '.h2-tabs{margin-bottom:14px}',
    '.h2-tabs a{display:inline-flex;align-items:center;gap:.35rem;min-height:44px}',
    /* tiles, chips, groups */
    '.h2-tiles{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(155px,1fr))}',
    'a.h2-tile,a.h2-tile:visited{display:flex;flex-direction:column;gap:6px;padding:14px;min-height:108px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);text-decoration:none;box-shadow:var(--shadow-sm)}',
    'a.h2-tile:hover,a.h2-fa:hover,a.h2-group:hover{border-color:color-mix(in srgb,var(--accent) 55%,var(--border))}',
    'a.h2-tile.is-red{border-color:var(--danger-border);background:var(--danger-soft)}',
    '.h2-tile-ico{font-size:1.9rem;line-height:1}',
    '.h2-tile-t{font-weight:750;font-size:1.03rem;line-height:1.25}',
    '.h2-tile-d{color:var(--muted);font-size:.85rem;line-height:1.3}',
    '.h2-chips{display:flex;flex-wrap:wrap;gap:8px}',
    'a.h2-chip,a.h2-chip:visited{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:6px 14px;border-radius:999px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);font-weight:650;text-decoration:none}',
    'a.h2-chip:hover{border-color:var(--accent)}',
    'a.h2-chip.is-red{border-color:var(--danger-border)}',
    '.h2-groups{display:grid;gap:10px;grid-template-columns:1fr}',
    '@media (min-width:700px){.h2-groups{grid-template-columns:1fr 1fr}}',
    'a.h2-group,a.h2-group:visited{display:flex;gap:.85rem;align-items:center;padding:14px 16px;min-height:80px;border:2px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);text-decoration:none}',
    '.h2-group-ico{font-size:2.3rem;flex:none;line-height:1}',
    '.h2-group-t{display:block;font-weight:750;font-size:1.08rem;line-height:1.25}',
    '.h2-group-d{display:block;color:var(--muted);font-size:.88rem;line-height:1.3;margin-top:2px}',
    /* steps and content boxes */
    '.h2-big{font-size:1.08rem}',
    'ol.h2-steps{list-style:none;margin:0;padding:0}',
    'ol.h2-steps>li{display:flex;gap:.7rem;align-items:flex-start;padding:.7rem 0;border-bottom:1px solid var(--border);font-size:1.12rem;line-height:1.45;margin:0}',
    'ol.h2-steps>li:last-child{border-bottom:0}',
    '.h2-num{flex:none;width:2rem;height:2rem;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);display:grid;place-items:center;font-weight:800;font-size:.95rem;margin-top:.05rem}',
    '.h2-emo{flex:none;width:1.9rem;font-size:1.4rem;line-height:1.35;text-align:center}',
    '.h2-txt{flex:1 1 auto;min-width:0}',
    'ul.h2-list{margin:0;padding-left:1.25em;font-size:1.06rem;line-height:1.5}',
    'ul.h2-list>li+li{margin-top:.35em}',
    '.h2-sec{margin-top:18px}',
    '.h2-sec>h2,.h2-box>h2{font-size:1.2rem;margin:0 0 6px;display:flex;align-items:center;gap:.45rem;flex-wrap:wrap}',
    '.h2-sec.is-variant{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px}',
    '.h2-sec.is-note,.h2-box.is-note{background:var(--info-soft);border:1px solid var(--info-border);border-radius:var(--radius);padding:12px 14px}',
    '.h2-box{border-radius:var(--radius);padding:12px 16px;margin-top:18px;border:2px solid var(--border)}',
    '.h2-box.is-dont{border-color:var(--danger-border);background:var(--danger-soft)}',
    '.h2-box.is-dont>h2{color:var(--danger)}',
    '.h2-box.is-when{border-color:var(--warn-border);background:var(--warn-soft)}',
    '.h2-box.is-when>h2{color:var(--warn)}',
    '.h2-box.is-care{border-color:var(--info-border);background:var(--surface)}',
    '.h2-box.is-care>h2{color:var(--info)}',
    '.h2-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}',
    '.h2-sources{margin-top:22px;font-size:.86rem;color:var(--text-2)}',
    '.h2-sources h2{font-size:.95rem;margin:0 0 4px}',
    '.h2-sources ul{margin:0;padding-left:1.1em}',
    'a.h2-call,a.h2-call:visited{background:var(--danger);border-color:var(--danger);color:var(--surface);font-weight:750}',
    'a.h2-call:hover{background:var(--danger);filter:brightness(1.06)}',
    '.h2-card-lead{font-size:1.1rem}',
    /* checker */
    '.h2-fs{margin-top:16px}',
    '.h2-fs>legend{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-size:1.12rem;font-weight:750;margin-bottom:8px}',
    '.h2-lv{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:800;border:1px solid}',
    '.h2-lv.is-emergency{background:var(--danger-soft);color:var(--danger);border-color:var(--danger-border)}',
    '.h2-lv.is-urgent{background:var(--warn-soft);color:var(--warn);border-color:var(--warn-border)}',
    '.h2-check{font-size:1.05rem;padding:12px 14px;min-height:54px;align-items:center}',
    '.h2-check input{width:24px;height:24px;margin:0}',
    '.h2-check-ico{flex:none;font-size:1.3rem;width:1.8rem;text-align:center}',
    '.h2-fs.is-emergency .check:has(input:checked){border-color:var(--danger);background:var(--danger-soft)}',
    '.h2-fs.is-urgent .check:has(input:checked){border-color:var(--warn-border);background:var(--warn-soft)}',
    '.h2-helper{margin:8px 0 0}',
    '.h2-sticky{position:sticky;bottom:10px;z-index:20;margin:14px 0 0;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 12px;border-radius:var(--radius);background:var(--h2r-bg);color:var(--h2r-fg);box-shadow:var(--shadow-lg);border:1px solid var(--h2r-line)}',
    '.h2-sticky strong{flex:1 1 200px}',
    '.h2-sticky a.h2-callbar-btn{min-height:52px;font-size:1.15rem;flex:1 1 180px}',
    '.h2-result{border-radius:var(--radius);padding:16px;border:2px solid var(--border);margin-top:16px}',
    '.h2-result.is-emergency{border-color:var(--danger);background:var(--danger-soft)}',
    '.h2-result.is-urgent{border-color:var(--warn-border);background:var(--warn-soft)}',
    '.h2-result.is-watch{border-color:var(--info-border);background:var(--info-soft)}',
    '.h2-result>h2{font-size:1.3rem;display:flex;gap:.5rem;align-items:flex-start;margin:0 0 8px;outline:none}',
    '.h2-result.is-emergency>h2{color:var(--danger)}',
    '.h2-result.is-urgent>h2{color:var(--warn)}',
    '.h2-result.is-watch>h2{color:var(--info)}',
    '.h2-result h3{font-size:1.05rem;margin:14px 0 6px}',
    /* breath counter */
    '.h2-counter{display:grid;gap:14px;justify-items:center;text-align:center;padding:18px 12px}',
    'button.h2-tap{width:min(72vw,250px);height:min(72vw,250px);border-radius:50%;border:0;background:var(--accent);color:var(--accent-contrast);font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:var(--shadow);touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}',
    'button.h2-tap:active,button.h2-tap.is-hit{filter:brightness(1.12)}',
    '@media (prefers-reduced-motion:no-preference){button.h2-tap.is-hit{transform:scale(.97)}button.h2-tap{transition:transform .08s ease,filter .08s ease}}',
    '.h2-tap-n{font-size:3.6rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}',
    '.h2-tap-l{font-size:1rem;font-weight:700;max-width:80%;line-height:1.2}',
    '.h2-ring{--size:104px;--thick:10px}',
    '.h2-ring .ring-value{font-size:1.5rem}',
    '.h2-bands{display:flex;flex-wrap:wrap;gap:8px}',
    '.h2-bands button{min-height:48px;padding:6px 14px;border-radius:12px;border:2px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-weight:700;cursor:pointer}',
    '.h2-bands button[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-text)}',
    '.h2-bands button:disabled{opacity:.55;cursor:not-allowed}',
    /* CPR metronome */
    '.h2-metro{display:grid;gap:12px;justify-items:center;text-align:center;padding:16px;margin-top:12px;border:2px solid var(--danger-border);border-radius:var(--radius);background:var(--surface)}',
    '.h2-beat{width:184px;height:184px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:var(--surface-2);color:var(--text);border:6px solid var(--danger-border);transition:background-color .06s linear,border-color .06s linear}',
    '.h2-beat.is-on{background:var(--danger);border-color:var(--danger);color:var(--surface)}',
    '@media (prefers-reduced-motion:no-preference){.h2-beat{transition:background-color .06s linear,border-color .06s linear,transform .06s ease}.h2-beat.is-on{transform:scale(1.07)}}',
    '.h2-beat.is-breath{background:var(--info-soft);border-color:var(--info);color:var(--text)}',
    '.h2-beat-n{font-size:3.2rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}',
    '.h2-beat-l{font-size:.92rem;font-weight:700}',
    '.h2-timer{font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums}',
    '.h2-metro-status{min-height:1.5em;margin:0;font-weight:700}',
    /* location, numbers, plan, grounding */
    'textarea.h2-msg{width:100%;min-height:132px;font:inherit;font-size:1rem;line-height:1.45;padding:10px 12px;border-radius:10px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);resize:vertical}',
    '.h2-status{font-weight:650;margin:10px 0 0}',
    'ul.h2-numlist{list-style:none;margin:0;padding:0}',
    'ul.h2-numlist>li{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 0;border-bottom:1px solid var(--border);margin:0}',
    'ul.h2-numlist>li:last-child{border-bottom:0}',
    '.h2-num-l{flex:1 1 170px;min-width:0;line-height:1.3}',
    '.h2-num-l small{display:block;color:var(--muted)}',
    '.h2-num-v{font-size:1.25rem;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:.02em;margin-right:4px}',
    '.h2-plan-item{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}',
    '.h2-plan-item>input{flex:1 1 180px;min-width:0;min-height:44px}',
    '.h2-plan-item>input.h2-phone{flex:0 1 160px}',
    '.h2-plan-n{display:inline-grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--accent);color:var(--accent-contrast);font-weight:800;font-size:.95rem;flex:none}',
    '.h2-printonly{display:none}',
    '@media print{.h2-noprint{display:none!important}.h2-printonly{display:block!important}.h2-box,.h2-sec{break-inside:avoid}}',
    '.h2-ground{text-align:center;display:grid;gap:14px;justify-items:center;padding:22px 16px}',
    '.h2-ground-n{font-size:4.2rem;font-weight:800;line-height:1;color:var(--accent-text)}',
    '.h2-ground-emo{font-size:3rem;line-height:1}',
    '.h2-ground-t{font-size:1.35rem;font-weight:750;max-width:30ch;margin:0}',
    '.h2-ground-hint{color:var(--text-2);max-width:40ch;margin:0}',
    '.h2-dots{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}',
    '.h2-dots button{width:50px;height:50px;border-radius:50%;border:2px solid var(--border-strong);background:var(--surface);color:var(--text);font:inherit;font-weight:800;cursor:pointer}',
    '.h2-dots button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}',
    '.h2-progress{width:100%;max-width:360px}',
    /* first-aid library */
    '.h2-search{position:relative;margin:4px 0 14px}',
    '.h2-search input{width:100%;min-height:52px;font:inherit;font-size:1.1rem;padding:10px 14px 10px 46px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text)}',
    '.h2-search input:focus{border-color:var(--accent);box-shadow:var(--focus);outline:none}',
    '.h2-search-ico{position:absolute;left:15px;top:50%;transform:translateY(-50%);pointer-events:none}',
    '.h2-cards{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}',
    'a.h2-fa,a.h2-fa:visited{display:flex;gap:12px;align-items:center;padding:12px 14px;min-height:80px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);text-decoration:none;box-shadow:var(--shadow-sm)}',
    'a.h2-fa.is-life{border-left:6px solid var(--danger)}',
    '.h2-fa-ico{font-size:2rem;flex:none;width:2.5rem;text-align:center;line-height:1}',
    '.h2-fa-t{display:block;font-weight:750;font-size:1.05rem;line-height:1.25}',
    '.h2-fa-d{display:block;color:var(--muted);font-size:.86rem;line-height:1.3;margin-top:2px}'
  ].join('\n'));

  /* ======================================================================
     3. Shared helpers
     ====================================================================== */
  function lifecycle() {
    var fns = [];
    return {
      add: function (fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
      run: function () { fns.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
    };
  }
  function ico(e) { return h('span', { 'aria-hidden': 'true' }, e); }
  function speak(getText, label) { return MT.speech.button(getText, label ? { label: label } : undefined); }
  function reducedMotion() { try { return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function vibrate(ms) { try { if (W.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }
  function hasTool(id) { return (MT.tools || []).some(function (x) { return x.id === id; }); }
  function spoken(num) { return (L && L.speakableNumber(num)) || String(num); }

  var displayNames = { lang: null, dn: null };
  function countryName(code) {
    if (!code) return '';
    var lang = (MT.i18n && MT.i18n.lang) || 'en';
    try {
      if (W.Intl && Intl.DisplayNames) {
        if (displayNames.lang !== lang) { displayNames.dn = new Intl.DisplayNames([lang, 'en'], { type: 'region' }); displayNames.lang = lang; }
        var n = displayNames.dn.of(code);
        if (n && n !== code) return n;
      }
    } catch (e) { /* older browsers */ }
    var c = L && L.EMERGENCY_NUMBERS[code];
    return c ? t(c.n) : code;
  }

  function callLink(num, label, large) {
    return h('a.btn.h2-call' + (large ? '.btn-lg' : ''), { href: telHref(num) }, ico('📞'), label || t('Call {number}', { number: num }));
  }
  function pageHead(crumbs, icon, title, lead) {
    var bc = h('nav.breadcrumb', { 'aria-label': t('Breadcrumb') });
    crumbs.forEach(function (c, i) {
      if (i) bc.appendChild(document.createTextNode(' › '));
      bc.appendChild(c[1] ? h('a', { href: c[1] }, c[0]) : h('span', c[0]));
    });
    return h('div.page-head', bc, h('h1', icon ? ico(icon) : null, title), lead ? h('p.lead', lead) : null);
  }
  function subNav(label, items, active) {
    return h('nav.tabs.h2-tabs.h2-noprint', { 'aria-label': label }, items.map(function (it) {
      var on = it.id === active;
      return h('a' + (on ? '.active' : ''), { href: it.href, 'aria-current': on ? 'page' : null }, ico(it.icon), t(it.label));
    }));
  }
  function numberNote(info) {
    if (info.source === 'country') return t('This is the usual number for {country}. Please check it.', { country: countryName(info.country) });
    return t('112 works from most mobile phones. Please check your local number.');
  }
  /**
   * Red call bar at the top of every page. opts.title/opts.text may be functions of the
   * current number. Redraws when the saved numbers or the profile change.
   */
  function callBar(life, opts) {
    opts = opts || {};
    var bar = h('div.h2-callbar.h2-noprint', { role: 'region', 'aria-label': t('Emergency call') });
    function val(v, num) { return typeof v === 'function' ? v(num) : v; }
    function draw() {
      MT.clear(bar);
      var info = helpInfo(), num = info.number;
      bar.appendChild(h('div.h2-callbar-text',
        h('strong', val(opts.title, num) || t('In danger now?')),
        h('span', val(opts.text, num) || t('Call {number} or go to the nearest hospital.', { number: num }))));
      bar.appendChild(h('a.h2-callbar-btn', { href: telHref(num) }, ico('📞'), t('Call {number}', { number: num })));
      (opts.extra ? opts.extra() : []).forEach(function (el) { if (el) bar.appendChild(el); });
      if (!info.confirmed) bar.appendChild(h('p.h2-callbar-note', numberNote(info), ' ', h('a', { href: '#/get-help/numbers' }, t('Check or change'))));
    }
    draw();
    life.add(MT.on('store:' + NUM_KEY, draw));
    life.add(MT.on('profile:change', draw));
    return bar;
  }
  /** Numbered big-text steps from [[emoji, text]] or plain strings. */
  function stepsEl(steps, vars) {
    return h('ol.h2-steps', steps.map(function (s, i) {
      var e = Array.isArray(s) ? s[0] : '', txt = Array.isArray(s) ? s[1] : s;
      return h('li', h('span.h2-num', { 'aria-hidden': 'true' }, String(i + 1)), e ? h('span.h2-emo', { 'aria-hidden': 'true' }, e) : null, h('span.h2-txt', t(txt, vars)));
    }));
  }
  function stepsSpeech(steps, vars) {
    return steps.map(function (s, i) { return t('Step {n}.', { n: i + 1 }) + ' ' + t(Array.isArray(s) ? s[1] : s, vars); }).join(' ');
  }
  function listEl(items, vars) { return h('ul.h2-list', items.map(function (x) { return h('li', t(x, vars)); })); }
  function listSpeech(items, vars) { return items.map(function (x) { return t(x, vars); }).join(' '); }
  function sourcesEl(list) {
    if (!list || !list.length) return null;
    return h('section.h2-sources', h('h2', t('Sources')), h('ul', list.map(function (s) {
      return h('li', s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, t(s.label)) : t(s.label));
    })));
  }
  function libSources(keys) { return (keys || []).map(function (k) { return L && L.SOURCES[k]; }).filter(Boolean); }
  function linkHref(link) {
    if (!link) return null;
    if (link === 'crisis') return '#/crisis';
    if (link.indexOf('fa:') === 0) return '#/first-aid/' + link.slice(3);
    if (link.indexOf('breath:') === 0) return '#/get-help/breath/' + link.slice(7);
    return null;
  }
  function linkLabel(link) {
    if (link === 'crisis') return { icon: '💬', text: t('Crisis support') };
    if (link.indexOf('fa:') === 0) { var c = FA.index[link.slice(3)]; return c ? { icon: c.icon, text: t(c.title) } : null; }
    if (link.indexOf('breath:') === 0) return { icon: '⏱️', text: t('Breath counter') };
    return null;
  }

  /* A single shared Web Audio context (created on a tap, as browsers require). */
  var Sound = {
    ctx: null,
    ensure: function () {
      try {
        var AC = W.AudioContext || W.webkitAudioContext;
        if (!AC) return null;
        if (!this.ctx) this.ctx = new AC();
        if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
        return this.ctx;
      } catch (e) { return null; }
    },
    /** Play a short tone `delay` seconds from now. */
    beep: function (freq, dur, delay, vol) {
      var c = this.ctx;
      if (!c || c.state !== 'running') return;
      try {
        var t0 = c.currentTime + Math.max(0, delay || 0);
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.4, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) { /* ignore */ }
    },
    pause: function () { try { if (this.ctx && this.ctx.state === 'running' && this.ctx.suspend) this.ctx.suspend(); } catch (e) { /* ignore */ } }
  };

  if (!L) console.error('Salus H2: MTLib.triageLay is missing; emergency number falls back to 112.');

  /* ======================================================================
     4. Home widget — emergency banner (order 0)
     ====================================================================== */
  MT.registerWidget({
    id: 'emergency', order: 0,
    render: function (box) {
      var life = lifecycle();
      function draw() {
        MT.clear(box);
        var info = helpInfo();
        box.appendChild(h('div.h2-sos', { role: 'region', 'aria-labelledby': 'h2-sos-title' },
          h('div.h2-sos-title', h('span.h2-sos-ico', { 'aria-hidden': 'true' }, '🆘'),
            h('div', h('h2#h2-sos-title', t('Emergency? Get help now')), h('p', t('If someone may be in danger, call now.')))),
          h('a.h2-bigcall', { href: telHref(info.number) }, ico('📞'), t('Call {number}', { number: info.number })),
          h('div.h2-sos-actions',
            h('a.h2-sos-act', { href: '#/get-help/check' }, ico('❓'), t('Do I need help now?')),
            h('a.h2-sos-act', { href: '#/first-aid' }, ico('⛑️'), t('First aid'))),
          h('p.h2-sos-note', info.confirmed ? t('This is your saved number.') : numberNote(info), ' ',
            h('a', { href: '#/get-help/numbers' }, info.confirmed ? t('Change') : t('Check or change')))));
      }
      draw();
      life.add(MT.on('store:' + NUM_KEY, draw));
      life.add(MT.on('profile:change', draw));
      return life.run;
    }
  });

  /* ======================================================================
     5. Tool: get-help (overview, checker, breath counter, location, numbers)
     ====================================================================== */
  var GH_VIEWS = [
    { id: '', href: '#/get-help', icon: '🆘', label: 'Overview', title: 'Get help now', lead: 'If someone may be in danger, call now. Then use these tools.' },
    { id: 'check', href: '#/get-help/check', icon: '❓', label: 'Danger signs', title: 'Do I need help now?', lead: 'Tick the danger signs you see. You will see whether to go now, go today, or watch closely.' },
    { id: 'breath', href: '#/get-help/breath', icon: '⏱️', label: 'Breath counter', title: 'Breath counter', lead: 'Count breaths for one full minute to check for fast breathing.' },
    { id: 'location', href: '#/get-help/location', icon: '📍', label: 'My location', title: 'Share my location', lead: 'Find where you are, then send it to someone who can help.' },
    { id: 'numbers', href: '#/get-help/numbers', icon: '📞', label: 'Numbers', title: 'Emergency numbers', lead: 'Check the numbers for your country and save your own.' }
  ];

  MT.registerTool({
    id: 'get-help', title: 'Get help now', category: 'help', icon: '🆘', order: 0, header: false,
    description: 'Emergency numbers, danger signs, a breath counter and sharing your location.',
    keywords: ['emergency', 'ambulance', 'call', '112', '911', '999', 'danger signs', 'urgent', 'sick child', 'baby', 'pregnancy', 'pregnant', 'breathing', 'fast breathing', 'pneumonia', 'location', 'gps', 'imci', 'help'],
    render: function (container, ctx) {
      var life = lifecycle();
      var view = ctx.params[0] || '';
      var meta = GH_VIEWS.filter(function (v) { return v.id === view; })[0] || GH_VIEWS[0];
      view = meta.id;
      var crumbs = [[t('Home'), '#/'], [t('Get help'), view ? '#/get-help' : null]];
      if (view) crumbs.push([t(meta.title), null]);
      container.appendChild(pageHead(crumbs, view ? meta.icon : '🆘', t(meta.title), t(meta.lead)));
      container.appendChild(callBar(life));
      container.appendChild(subNav(t('Get help sections'), GH_VIEWS, view));
      var body = h('div');
      container.appendChild(body);
      if (view) ctx.setTitle(t(meta.title));
      ({ '': ghOverview, check: ghCheck, breath: ghBreath, location: ghLocation, numbers: ghNumbers })[view](body, ctx.params.slice(1), life);
      return life.run;
    }
  });

  /* ---------------- 5a. Overview ---------------- */
  var SAY_WHEN_CALLING = [
    ['🧘', 'Stay calm. Speak slowly and clearly.'],
    ['📍', 'Say where you are: the address, a landmark, or your GPS location.'],
    ['❓', 'Say what happened, and how many people need help.'],
    ['💨', 'Say if the person is awake and breathing.'],
    ['📱', 'Give your phone number.'],
    ['👂', 'Do what the call taker tells you. Do not hang up until they say so.'],
    ['🚶', 'If you can, send someone to meet the ambulance and show the way.']
  ];
  function ghOverview(body) {
    var tiles = [
      ['#/get-help/check', '❓', 'Do I need help now?', 'Check danger signs for adults, children, babies, pregnancy and mental health.', true],
      ['#/first-aid', '⛑️', 'First aid', 'Step-by-step help for CPR, choking, bleeding, burns and more.'],
      ['#/get-help/breath', '⏱️', 'Breath counter', 'Count breaths for 1 minute to check for fast breathing.'],
      ['#/get-help/location', '📍', 'Share my location', 'Send your GPS location to someone who can help.'],
      ['#/get-help/numbers', '📞', 'Emergency numbers', 'Check and save the numbers for your country.'],
      ['#/crisis', '💬', 'Crisis support', 'Thoughts of suicide, self-harm, or feeling unsafe.']
    ];
    body.appendChild(h('div.h2-tiles', tiles.map(function (x) {
      return h('a.h2-tile' + (x[4] ? '.is-red' : ''), { href: x[0] }, h('span.h2-tile-ico', { 'aria-hidden': 'true' }, x[1]), h('span.h2-tile-t', t(x[2])), h('span.h2-tile-d', t(x[3])));
    })));
    var common = ['cpr', 'choking', 'bleeding', 'heart-attack', 'stroke', 'anaphylaxis', 'seizure', 'burns', 'poisoning', 'drowning'];
    body.appendChild(h('section.h2-sec', h('h2', t('Common emergencies')), h('div.h2-chips', common.map(function (id) {
      var c = FA.index[id];
      return c ? h('a.h2-chip' + (c.group === 'life' ? '.is-red' : ''), { href: '#/first-aid/' + id }, ico(c.icon), t(c.title)) : null;
    }))));
    var num = MT.help.emergencyNumber();
    body.appendChild(h('section.h2-sec.card',
      h('h2', ico('🗣️'), t('What to say when you call')),
      h('div.h2-tools', speak(function () { return t('What to say when you call') + '. ' + stepsSpeech(SAY_WHEN_CALLING); }),
        h('a.btn.btn-sm', { href: '#/get-help/location' }, ico('📍'), t('Find my location'))),
      stepsEl(SAY_WHEN_CALLING)));
    var saved = readNumbers();
    if (L && L.hasAnyNumber(saved)) body.appendChild(savedNumbersCard(saved, t('My saved numbers')));
    else body.appendChild(h('section.h2-sec', MT.ui.alert('info', t('Save your numbers now'), h('span', t('In an emergency it is hard to think. Save your local ambulance, police and helpline numbers so they are ready.'), ' ', h('a', { href: '#/get-help/numbers' }, t('Save my numbers'))))));
    body.appendChild(h('div.h2-sec', MT.ui.disclaimer(t('Salus gives general guidance. It cannot see or examine anyone. If you think someone is in danger, call {number} even if this app says otherwise.', { number: num }))));
  }
  var NUM_FIELDS = [
    { k: 'ambulance', icon: '🚑', label: 'Ambulance or emergency', hint: 'Salus uses this number on every Call button.' },
    { k: 'police', icon: '🚓', label: 'Police' },
    { k: 'fire', icon: '🚒', label: 'Fire' },
    { k: 'poison', icon: '☠️', label: 'Poison centre' },
    { k: 'mentalHealth', icon: '💬', label: 'Mental-health or crisis line' },
    { k: 'gbv', icon: '🛡️', label: 'Violence and abuse helpline' },
    { k: 'doctor', icon: '🩺', label: 'My doctor or clinic' }
  ];
  function savedNumbersCard(saved, title) {
    var rows = NUM_FIELDS.filter(function (f) { return saved[f.k]; });
    return h('section.h2-sec.card',
      h('h2', ico('📞'), title),
      h('ul.h2-numlist', rows.map(function (f) {
        return h('li', h('span.h2-num-l', ico(f.icon), ' ', h('strong', t(f.label)), f.k === 'doctor' && saved.doctorName ? h('small', saved.doctorName) : null),
          h('span.h2-num-v', saved[f.k]), callLink(saved[f.k], t('Call')));
      })),
      speak(function () { return rows.map(function (f) { return t(f.label) + ': ' + spoken(saved[f.k]) + '.'; }).join(' '); }),
      h('p.small', h('a', { href: '#/get-help/numbers' }, t('Change my numbers'))));
  }

  /* ---------------- 5b. "Do I need help now?" checker ---------------- */
  function ghCheck(body, params, life) {
    var g = L && params[0] && L.GROUP_INDEX[params[0]];
    if (!g) return checkChooser(body);
    checkGroup(body, g, life);
  }
  function checkChooser(body) {
    var num = MT.help.emergencyNumber();
    body.appendChild(MT.ui.alert('danger', t('Not breathing, or not responding?'), h('span', t('Do not wait. Call {number} and start CPR.', { number: num }), ' ', h('a', { href: '#/first-aid/cpr' }, t('How to do CPR')))));
    body.appendChild(h('h2', { style: 'margin-top:18px' }, t('Who needs help?')));
    body.appendChild(h('div.h2-groups', (L ? L.GROUPS : []).map(function (g) {
      return h('a.h2-group', { href: '#/get-help/check/' + g.id }, h('span.h2-group-ico', { 'aria-hidden': 'true' }, g.icon),
        h('span', h('span.h2-group-t', t(g.label)), h('span.h2-group-d', t(g.hint))));
    })));
    body.appendChild(h('div.h2-sec', MT.ui.disclaimer(t('This checker gives general guidance. It cannot diagnose. It is based on WHO danger signs and first-aid guidelines. If you are worried, get help.'))));
  }
  function checklistSpeech(g) {
    var parts = [t(g.label) + '.', t('Tick every sign you see now. If you are not sure, tick it.')];
    g.sections.forEach(function (sec) {
      parts.push((sec.level === 'emergency' ? t('Go now if you see any of these:') : t('Go today if you see any of these:')) + ' ' + t(sec.title) + '.');
      sec.signs.forEach(function (s) { parts.push(t(s.text) + '.'); });
    });
    return parts.join(' ');
  }
  function checkGroup(body, g, life) {
    var sel = memo.checks[g.id] = memo.checks[g.id] || {};
    body.appendChild(h('div.row.row-between', { style: '--gap:.5rem' },
      h('h2', { style: 'margin:0' }, ico(g.icon + ' '), t(g.label)),
      h('a.btn.btn-sm.btn-ghost', { href: '#/get-help/check' }, '↩ ', t('Choose someone else'))));
    body.appendChild(h('p.h2-big', { style: 'margin-top:8px' }, t('Tick every sign you see now. If you are not sure, tick it.')));
    var sp = speak(function () { return checklistSpeech(g); }, t('Read the signs aloud'));
    if (sp) body.appendChild(h('div.h2-tools', sp));
    var form = h('form', { novalidate: true });
    g.sections.forEach(function (sec) {
      var fs = h('fieldset.h2-fs.is-' + sec.level,
        h('legend', h('span.h2-lv.is-' + sec.level, sec.level === 'emergency' ? t('Go now') : t('Go today')), h('span', t(sec.title))));
      if (sec.note) fs.appendChild(h('p.small.muted', { style: 'margin:0 0 8px' }, t(sec.note)));
      var list = h('div.choice-list'), helpers = [];
      sec.signs.forEach(function (s) {
        var id = 'h2s-' + s.id;
        var cb = h('input', { type: 'checkbox', id: id, value: s.id, checked: !!sel[s.id] });
        cb.addEventListener('change', function () { if (cb.checked) sel[s.id] = true; else delete sel[s.id]; update(); });
        list.appendChild(h('label.check.h2-check', { for: id }, cb, h('span.h2-check-ico', { 'aria-hidden': 'true' }, s.icon), h('span.grow', t(s.text))));
        if (s.link && s.link.indexOf('breath:') === 0 && helpers.indexOf(s.link) < 0) helpers.push(s.link);
      });
      fs.appendChild(list);
      helpers.forEach(function (lk) {
        fs.appendChild(h('p.h2-helper', h('a.btn.btn-soft', { href: linkHref(lk) }, ico('⏱️'), t('Not sure? Count breaths for 1 minute'))));
      });
      form.appendChild(fs);
    });
    var sticky = h('div.h2-sticky', { hidden: true });
    form.appendChild(sticky);
    var submit = h('button.btn.btn-primary.btn-lg.btn-block', { type: 'submit', style: 'margin-top:14px' }, t('See what to do'));
    form.appendChild(submit);
    form.addEventListener('submit', function (e) { e.preventDefault(); memo.shown[g.id] = true; draw(true); });
    body.appendChild(form);
    var host = h('div', { 'aria-live': 'polite' });
    body.appendChild(host);
    body.appendChild(h('div.h2-sec.row', { style: '--gap:.5rem' },
      h('button.btn.btn-ghost', { type: 'button', onclick: function () {
        Object.keys(sel).forEach(function (k) { delete sel[k]; });
        memo.shown[g.id] = false;
        MT.$$('input[type=checkbox]', form).forEach(function (x) { x.checked = false; });
        MT.clear(host); update(); W.scrollTo(0, 0);
      } }, '↺ ', t('Start again'))));
    body.appendChild(sourcesEl(libSources(g.sources)));
    body.appendChild(MT.ui.disclaimer(t('This checker gives general guidance. It cannot diagnose. If you are worried, get help, even if no sign is ticked.')));

    function update() {
      var res = L.assess(g.id, Object.keys(sel));
      if (res.level === 'emergency') {
        if (sticky.hidden) {
          var num = MT.help.emergencyNumber();
          MT.clear(sticky);
          sticky.appendChild(h('strong', { role: 'alert' }, ico('🚨 '), t('Danger sign ticked. Call {number} now.', { number: num })));
          sticky.appendChild(h('a.h2-callbar-btn', { href: telHref(num) }, ico('📞'), t('Call {number}', { number: num })));
          sticky.hidden = false;
        }
      } else { sticky.hidden = true; MT.clear(sticky); }
      if (memo.shown[g.id]) draw(false);
    }
    function draw(focus) {
      var res = L.assess(g.id, Object.keys(sel));
      MT.clear(host);
      var card = resultCard(g, res);
      host.appendChild(card);
      if (focus) {
        try { card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { card.scrollIntoView(); }
        var hd = MT.$('h2', card); if (hd) try { hd.focus({ preventScroll: true }); } catch (e) { hd.focus(); }
      }
    }
    update();
  }
  function resultCard(g, res) {
    var num = MT.help.emergencyNumber(), vars = { number: num };
    var lv = res.level, card = h('section.h2-result.is-' + lv), speech = [];
    var icon = lv === 'emergency' ? '🚨' : lv === 'urgent' ? '⚠️' : 'ℹ️';
    var title = lv === 'emergency' ? t('Emergency — call {number} now, or go to the nearest hospital now.', vars)
      : lv === 'urgent' ? t('Urgent — see a health worker today.')
        : t('No danger signs selected — this does not mean you are well.');
    card.appendChild(h('h2', { tabindex: '-1' }, ico(icon), h('span', title)));
    speech.push(title);
    function signList(ids) { return h('ul.h2-list', ids.map(function (id) { return h('li', t(L.SIGN_INDEX[id].text)); })); }
    function addLinks(ids) {
      var seen = {}, links = [];
      ids.forEach(function (id) {
        var lk = L.SIGN_INDEX[id].link;
        if (!lk || seen[lk]) return;
        seen[lk] = true;
        var lab = linkLabel(lk), href = linkHref(lk);
        if (lab && href) links.push(h('a.h2-chip', { href: href }, ico(lab.icon), lab.text));
      });
      if (links.length) { card.appendChild(h('h3', t('Guides that may help'))); card.appendChild(h('div.h2-chips', links)); }
    }
    if (lv === 'emergency') {
      card.appendChild(h('div.h2-tools', callLink(num, null, true), h('a.btn.btn-lg', { href: '#/get-help/location' }, ico('📍'), t('Share my location'))));
      card.appendChild(h('h3', t('Danger signs you ticked')));
      card.appendChild(signList(res.emergency));
      card.appendChild(h('h3', t('While you wait for help')));
      card.appendChild(stepsEl(g.whileWaiting));
      speech.push(t('While you wait for help') + '. ' + stepsSpeech(g.whileWaiting));
      addLinks(res.emergency.concat(res.urgent));
    } else if (lv === 'urgent') {
      var p1 = t('Do not wait until tomorrow. Go to a clinic or health worker today.');
      card.appendChild(h('p.h2-big', p1));
      card.appendChild(h('h3', t('Warning signs you ticked')));
      card.appendChild(signList(res.urgent));
      var p2 = t('Go at once, or call {number}, if any danger sign from the "Go now" list appears, or if they get worse.', vars);
      card.appendChild(h('p.h2-big', h('strong', p2)));
      card.appendChild(h('div.h2-tools', callLink(num), h('a.btn', { href: '#/get-help/numbers' }, ico('🩺'), t('Save my clinic number'))));
      speech.push(p1, p2);
      addLinks(res.urgent);
    } else {
      var p0 = t('This checker cannot see or examine anyone. If you are worried, trust that feeling and get care.');
      card.appendChild(h('p.h2-big', p0));
      card.appendChild(h('h3', t('Watch for')));
      card.appendChild(listEl(g.watchFor));
      card.appendChild(h('h3', t('Get care if')));
      card.appendChild(listEl(g.careIf.concat([g.notBetter])));
      var p3 = t('Get help at once if any danger sign appears: call {number}.', vars);
      card.appendChild(h('p.h2-big', h('strong', p3)));
      speech.push(p0, t('Watch for') + ': ' + listSpeech(g.watchFor), t('Get care if') + ': ' + listSpeech(g.careIf.concat([g.notBetter])), p3);
    }
    if (g.id === 'mental') card.appendChild(h('p', h('a.btn', { href: '#/crisis' }, ico('💬'), t('Crisis support and helplines'))));
    var sp = speak(function () { return speech.join(' '); });
    if (sp) card.appendChild(h('div.h2-tools', sp));
    return card;
  }

  /* ---------------- 5c. Breath counter ---------------- */
  var BREATH_STEPS_CHILD = [
    ['😌', 'Wait until the child is calm: not crying, not feeding, and not just after running.'],
    ['👕', 'Lift the clothes so you can see the chest or belly move.'],
    ['▶️', 'Press Start. Then tap the big button each time the chest or belly rises (each breath in).'],
    ['⏱️', 'Keep tapping for the full minute. The counter stops by itself.']
  ];
  var BREATH_STEPS_ADULT = [
    ['🛋️', 'The person should rest, sitting or lying, for a few minutes first.'],
    ['👀', 'Watch the chest or belly. Try not to let them notice you counting.'],
    ['▶️', 'Press Start. Then tap the big button each time the chest rises (each breath in).'],
    ['⏱️', 'Keep tapping for the full minute. The counter stops by itself.']
  ];
  function bandRule(b) {
    if (b.id === 'adult') return t('For adults, 30 or more breaths in 1 minute is a danger sign. Normal at rest is about 12 to 20.');
    return t('Fast breathing at this age is {n} or more breaths in 1 minute (WHO).', { n: b.fast });
  }
  function ghBreath(body, params, life) {
    var bandId = (L && params[0] && L.BAND_INDEX[params[0]]) ? params[0] : (memo.band || 'child');
    memo.band = bandId;
    var DURATION = 60000;
    var st = { phase: 'ready', taps: 0, start: 0, last: 0, timer: null, said: {} };
    var dead = false;
    life.add(function () { dead = true; clearInterval(st.timer); });

    var bandBtns = h('div.h2-bands', { role: 'group', 'aria-label': t('Who are you counting for?') });
    L.BREATH_BANDS.forEach(function (b) {
      var btn = h('button', { type: 'button', 'aria-pressed': String(b.id === bandId), dataset: { band: b.id } }, t(b.label));
      btn.addEventListener('click', function () {
        if (st.phase === 'counting') return;
        bandId = memo.band = b.id;
        MT.$$('button', bandBtns).forEach(function (x) { x.setAttribute('aria-pressed', String(x === btn)); });
        drawInfo(); resetCounter();
      });
      bandBtns.appendChild(btn);
    });
    var info = h('div');
    body.appendChild(h('section.card',
      h('h2', t('Who are you counting for?')), bandBtns, info,
      h('p.small.muted', { style: 'margin:10px 0 0' }, t('For children aged 5 to 15 there is no simple cut-off. Use the danger-sign checker instead.'), ' ', h('a', { href: '#/get-help/check/adult' }, t('Check danger signs')))));

    var counter = h('section.card.h2-sec');
    body.appendChild(counter);
    var resultHost = h('div', { 'aria-live': 'polite' });
    body.appendChild(resultHost);

    var manualIn = h('input', { id: 'h2-manual', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '0' });
    var manualErr = h('div.error', { 'aria-live': 'polite' });
    body.appendChild(h('details.disclosure.h2-sec',
      h('summary', t('Counted with a watch? Enter the number')),
      h('div.disclosure-body',
        h('form', { novalidate: true, onsubmit: function (e) {
          e.preventDefault();
          var n = MT.num(manualIn.value);
          manualErr.textContent = '';
          if (n == null || !L.validRate(n) || Math.round(n) !== n) { manualErr.textContent = t('Enter a whole number from 0 to {max}.', { max: L.MAX_RATE }); return; }
          showResult(n, true);
        } },
          h('div.field', h('label', { for: 'h2-manual' }, t('Breaths in 1 full minute')), manualIn, manualErr),
          h('button.btn.btn-primary', { type: 'submit', style: 'margin-top:8px' }, t('Check'))))));
    body.appendChild(sourcesEl([L.SOURCES.imci, L.SOURCES.psbi, L.SOURCES.news2]));
    body.appendChild(MT.ui.disclaimer(t('Counting breaths helps find pneumonia and other serious illness. It cannot rule them out. If you are worried, get help.')));

    function drawInfo() {
      var b = L.BAND_INDEX[bandId], steps = bandId === 'adult' ? BREATH_STEPS_ADULT : BREATH_STEPS_CHILD;
      MT.clear(info);
      info.appendChild(h('p.h2-big', { style: 'margin:12px 0 4px' }, h('strong', bandRule(b))));
      info.appendChild(h('h3', { style: 'margin:14px 0 4px;font-size:1.05rem' }, t('How to count')));
      info.appendChild(stepsEl(steps));
      var sp = speak(function () { return bandRule(b) + ' ' + t('How to count') + '. ' + stepsSpeech(steps); });
      if (sp) info.appendChild(h('div.h2-tools', sp));
    }
    function resetCounter() {
      clearInterval(st.timer);
      st = { phase: 'ready', taps: 0, start: 0, last: 0, timer: null, said: {} };
      MT.clear(counter);
      counter.appendChild(h('div.h2-counter',
        h('p.h2-big', { style: 'margin:0' }, t('When you are ready, press Start and tap once for every breath in.')),
        h('button.btn.btn-primary.btn-lg', { type: 'button', 'data-act': 'start', onclick: startCount }, ico('▶️'), t('Start the 1-minute count'))));
    }
    var tapBtn, nEl, ring, ringVal, live;
    function startCount() {
      Sound.ensure();
      MT.clear(resultHost);
      st = { phase: 'counting', taps: 0, start: Date.now(), last: 0, timer: null, said: {} };
      MT.$$('button', bandBtns).forEach(function (x) { x.disabled = true; });
      nEl = h('span.h2-tap-n', '0');
      tapBtn = h('button.h2-tap', { type: 'button', 'aria-label': t('Tap for each breath in. Breaths so far: {n}', { n: 0 }) }, nEl, h('span.h2-tap-l', { 'aria-hidden': 'true' }, t('Tap for each breath in')));
      tapBtn.addEventListener('click', tap);
      ringVal = h('span.ring-value', '60');
      ring = h('div.ring.h2-ring', { style: '--p:0', role: 'img', 'aria-label': t('Seconds left') }, ringVal);
      live = h('p.small.muted', { 'aria-live': 'polite', style: 'margin:0;min-height:1.4em' });
      MT.clear(counter);
      counter.appendChild(h('div.h2-counter', h('div.row', { style: 'justify-content:center' }, ring, h('div', h('div.h2-timer', t('seconds left')))), tapBtn, live,
        h('div.row', { style: 'justify-content:center;--gap:.5rem' },
          h('button.btn', { type: 'button', 'data-act': 'undo', onclick: function () { if (st.phase === 'counting' && st.taps > 0) { st.taps--; showTaps(); } } }, '−1 ', t('Undo last tap')),
          h('button.btn.btn-ghost', { type: 'button', 'data-act': 'stop', onclick: function () { stopEarly(); } }, '■ ', t('Stop')))));
      st.timer = setInterval(tick, 200);
      try { tapBtn.focus(); } catch (e) { /* ignore */ }
    }
    function showTaps() {
      nEl.textContent = String(st.taps);
      tapBtn.setAttribute('aria-label', t('Tap for each breath in. Breaths so far: {n}', { n: st.taps }));
    }
    function tap() {
      if (st.phase !== 'counting') return;
      var now = Date.now();
      if (now - st.last < 150) return; // ignore accidental double taps
      st.last = now; st.taps++;
      showTaps();
      tapBtn.classList.add('is-hit');
      setTimeout(function () { if (tapBtn) tapBtn.classList.remove('is-hit'); }, 90);
      Sound.beep(660, 0.05, 0, 0.18);
    }
    function tick() {
      if (dead) return;
      var elapsed = Date.now() - st.start, left = Math.max(0, DURATION - elapsed), secs = Math.ceil(left / 1000);
      ringVal.textContent = String(secs);
      ring.style.setProperty('--p', String(Math.min(100, elapsed / DURATION * 100)));
      [30, 10].forEach(function (s) { if (secs <= s && !st.said[s]) { st.said[s] = true; live.textContent = t('{n} seconds left', { n: s }); } });
      if (left <= 0) finish();
    }
    function finish() {
      clearInterval(st.timer);
      st.phase = 'done';
      Sound.beep(880, 0.35, 0, 0.35);
      vibrate(250);
      MT.$$('button', bandBtns).forEach(function (x) { x.disabled = false; });
      var n = st.taps;
      resetCounter();
      showResult(n, true);
    }
    function stopEarly() {
      clearInterval(st.timer);
      MT.$$('button', bandBtns).forEach(function (x) { x.disabled = false; });
      resetCounter();
      MT.clear(resultHost);
      resultHost.appendChild(MT.ui.alert('warn', t('Counting stopped'), t('Count for a full minute to get a result. Breathing changes from moment to moment, so a shorter count can mislead.')));
    }
    function showResult(rate, focus) {
      MT.clear(resultHost);
      var card = breathResult(bandId, Math.round(rate));
      resultHost.appendChild(card);
      if (focus) {
        try { card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
        var hd = MT.$('h2', card); if (hd) try { hd.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    }
    drawInfo();
    resetCounter();
  }
  function breathResult(bandId, rate) {
    var c = L.classifyBreathing(bandId, rate), b = L.BAND_INDEX[bandId];
    if (!c) return MT.ui.alert('warn', t('Please count again'), t('That number does not look right. Count again for a full minute.'));
    var num = MT.help.emergencyNumber(), vars = { number: num }, msg, extra = null;
    switch (c.reason) {
      case 'none': msg = t('No breaths were counted. If they are not breathing, call {number} and start CPR now.', vars); break;
      case 'very-fast': msg = t('This is very fast breathing. It is a danger sign. Call {number} now.', vars); break;
      case 'very-slow': msg = t('This is very slow breathing. It is a danger sign. Call {number} now. If they stop breathing normally, start CPR.', vars); break;
      case 'slow': msg = t('This is slower than usual. If they are very sleepy or hard to wake, or took drugs, alcohol or strong pain medicine, call {number} now. Otherwise, see a health worker today.', vars); break;
      case 'normal': msg = t('This is in the usual range for a resting adult (12 to 20). This does not mean they are well. Check for other danger signs.'); break;
      case 'not-fast': msg = t('This is below the WHO fast-breathing cut-off for this age ({cut} or more). This does not mean the child is well. Check for other danger signs.', { cut: c.threshold }); break;
      default: // 'fast'
        if (b.id === 'infant') msg = t('This is fast breathing for a baby under 2 months. It is a danger sign. Go to a hospital now, or call {number}.', vars);
        else if (b.id === 'adult') msg = t('This is faster than normal (about 12 to 20 at rest). See a health worker today. Call {number} now if they also seem very unwell or confused, have blue lips, or cannot speak in full sentences.', vars);
        else msg = t('This is fast breathing for this age (WHO cut-off: {cut} or more). See a health worker today. Go now if the child also has chest indrawing, cannot drink, is very sleepy, or has fits.', { cut: c.threshold });
    }
    if (c.level === 'watch') extra = t('Count again if you were not sure. Get help at once if breathing becomes hard, the chest pulls in, the lips turn blue, or they become very sleepy.');
    var lvText = c.level === 'emergency' ? t('Emergency') : c.level === 'urgent' ? t('See a health worker today') : t('Keep watching');
    var title = t('{n} breaths in 1 minute', { n: rate });
    var card = h('section.h2-result.is-' + c.level,
      h('h2', { tabindex: '-1' }, ico(c.level === 'emergency' ? '🚨' : c.level === 'urgent' ? '⚠️' : 'ℹ️'), h('span', title)),
      h('p.h2-big', h('strong', lvText + ': '), msg),
      extra ? h('p', extra) : null,
      h('div.h2-tools',
        c.level !== 'watch' ? callLink(num, null, c.level === 'emergency') : null,
        c.reason === 'none' || c.reason === 'very-slow' ? h('a.btn', { href: '#/first-aid/cpr' }, ico('❤️'), t('How to do CPR')) : null,
        h('a.btn', { href: '#/get-help/check/' + b.group }, ico('❓'), t('Check other danger signs')),
        speak(function () { return title + '. ' + lvText + '. ' + msg + (extra ? ' ' + extra : ''); })),
      h('p.small.muted', { style: 'margin:6px 0 0' }, bandRule(b)));
    return card;
  }

  /* ---------------- 5d. Share my location ---------------- */
  function ghLocation(body, params, life) {
    var dead = false, pos = null, details = '';
    life.add(function () { dead = true; });
    var status = h('p.h2-status', { 'aria-live': 'polite' });
    var getBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: locate }, ico('📍'), t('Get my location'));
    var out = h('div', { hidden: true });
    body.appendChild(h('section.card',
      h('p.h2-big', { style: 'margin-top:0' }, t('Your phone can find where you are using GPS. You can then send it by text message or another app to someone who can help.')),
      MT.ui.alert('info', t('Nothing is sent automatically.'), t('Your location stays on this phone until you choose to share it.')),
      h('div.h2-tools', { style: 'margin-top:14px' }, getBtn), status));
    body.appendChild(out);
    body.appendChild(h('section.h2-box.is-note',
      h('h2', ico('💡'), t('If location does not work')),
      listEl(['Tell the call taker the road, a landmark, a building name, or the nearest junction.', 'GPS works without internet, but it can be slow indoors. Go outside or near a window if you can.', 'Ask someone nearby to describe where you are.'])));

    function locate() {
      var geo = W.navigator && navigator.geolocation;
      if (!geo) { status.textContent = t('This phone or browser cannot share location. Describe where you are instead: a road, a landmark, or the nearest building.'); return; }
      status.textContent = t('Finding your location… This can take up to a minute.');
      getBtn.disabled = true;
      try {
        geo.getCurrentPosition(function (p) {
          if (dead) return;
          getBtn.disabled = false;
          pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, time: p.timestamp || Date.now() };
          if (!L.validLatLon(pos.lat, pos.lon)) { status.textContent = t('The location did not look right. Please try again.'); return; }
          status.textContent = t('Location found.');
          draw();
        }, function (err) {
          if (dead) return;
          getBtn.disabled = false;
          var code = err && err.code;
          status.textContent = code === 1 ? t('Location is turned off for this app. Allow location in your browser settings, or describe where you are.')
            : code === 3 ? t('Finding your location took too long. Try again, outside or near a window.')
              : t('Your phone could not find its location. Try again, outside or near a window.');
        }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 });
      } catch (e) {
        getBtn.disabled = false;
        status.textContent = t('Your phone could not find its location. Try again, outside or near a window.');
      }
    }
    function message() {
      var lines = [t('I need help. My location is {coords}.', { coords: L.formatCoords(pos.lat, pos.lon) })];
      if (MT.isNum(pos.acc)) lines.push(t('Accurate to about {m} metres.', { m: Math.round(pos.acc) }));
      lines.push(t('Map: {url}', { url: L.osmUrl(pos.lat, pos.lon) }));
      if (details.trim()) lines.push(t('Details: {text}', { text: details.trim() }));
      lines.push(t('Time: {time}', { time: MT.formatTime(new Date(pos.time)) }));
      return lines.join('\n');
    }
    var msgBox, actions;
    function draw() {
      MT.clear(out);
      out.hidden = false;
      var detailsIn = h('input', { id: 'h2-loc-details', type: 'text', autocomplete: 'off', value: details, placeholder: t('For example: blue gate opposite the school') });
      msgBox = h('textarea.h2-msg', { id: 'h2-loc-msg', readOnly: true });
      msgBox.value = message();
      actions = h('div.h2-tools');
      detailsIn.addEventListener('input', function () { details = detailsIn.value.slice(0, 200); msgBox.value = message(); drawActions(); });
      out.appendChild(h('section.card.h2-sec',
        h('h2', ico('📍'), t('Your location')),
        h('dl.kv', { style: 'font-size:1.05rem' },
          h('dt', t('Coordinates')), h('dd', L.formatCoords(pos.lat, pos.lon)),
          h('dt', t('Accuracy')), h('dd', MT.isNum(pos.acc) ? t('about {m} metres', { m: Math.round(pos.acc) }) : '—'),
          h('dt', t('Time')), h('dd', MT.formatTime(new Date(pos.time)))),
        MT.isNum(pos.acc) && pos.acc > 100 ? h('div', { style: 'margin-top:10px' }, MT.ui.alert('warn', null, t('This location is not very exact. Add a landmark below.'))) : null,
        h('div.field', { style: 'margin-top:12px' }, h('label', { for: 'h2-loc-details' }, t('Add a landmark or directions (optional)')), detailsIn),
        h('div.field', { style: 'margin-top:12px' }, h('label', { for: 'h2-loc-msg' }, t('Message to send')), msgBox),
        actions,
        h('p.small.muted', { style: 'margin:4px 0 0' }, t('The map link needs internet to open. The numbers alone are enough for most phones and rescue services.'))));
      drawActions();
    }
    function drawActions() {
      MT.clear(actions);
      var msg = message();
      actions.appendChild(h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.copy(msgBox.value); } }, ico('📋'), t('Copy message')));
      if (W.navigator && navigator.share) actions.appendChild(h('button.btn', { type: 'button', onclick: function () { navigator.share({ title: t('My location'), text: msgBox.value }).catch(function () { /* cancelled */ }); } }, ico('📤'), t('Share')));
      actions.appendChild(h('a.btn', { href: 'sms:?&body=' + encodeURIComponent(msg) }, ico('💬'), t('Send as text message')));
      actions.appendChild(h('a.btn', { href: L.geoUri(pos.lat, pos.lon) }, ico('🗺️'), t('Open in a map app')));
      actions.appendChild(h('a.btn.btn-ghost', { href: L.osmUrl(pos.lat, pos.lon), target: '_blank', rel: 'noopener' }, ico('🌐'), t('Open map (needs internet)')));
      var sp = speak(function () { return t('My location is {coords}.', { coords: L.formatCoords(pos.lat, pos.lon).replace(',', ' ,') }) + (details.trim() ? ' ' + details.trim() : ''); });
      if (sp) actions.appendChild(sp);
    }
  }

  /* ---------------- 5e. Emergency numbers ---------------- */
  function ghNumbers(body, params, life) {
    var saved = readNumbers(), prof = readProfile(), loc = localeCountry();
    var profCountry = L.normCountry(prof.country);
    var country = saved.country || profCountry || loc || '';
    var guessed = !saved.country && !profCountry && !!loc;
    var confirmed = !!saved.confirmedAt;

    // country picker
    var codes = Object.keys(L.EMERGENCY_NUMBERS);
    if (country && codes.indexOf(country) < 0) codes.push(country);
    codes.sort(function (a, b) { return countryName(a).localeCompare(countryName(b)); });
    var sel = h('select', { id: 'h2-country' },
      h('option', { value: '' }, t('My country is not listed')),
      codes.map(function (c) { return h('option', { value: c, selected: c === country }, countryName(c)); }));
    var builtIn = h('div');
    sel.addEventListener('change', function () {
      country = sel.value; guessed = false;
      drawBuiltIn();
      if (!confirmed) fillFrom(L.countryDefaults(country), true);
    });
    body.appendChild(h('section.card',
      h('div.field', h('label', { for: 'h2-country' }, t('Your country')), sel,
        guessed ? h('div.hint', t('We guessed this from your phone language. Please check it.')) : null),
      saved.country && profCountry && saved.country !== profCountry
        ? h('div', { style: 'margin-top:10px' }, MT.ui.alert('warn', t('Moved country?'), t('Your profile says {a}, but your saved numbers are for {b}. Choose your country and save your numbers again.', { a: countryName(profCountry), b: countryName(saved.country) }))) : null,
      builtIn));

    // general guidance
    body.appendChild(h('section.h2-box.is-note',
      h('h2', ico('🌍'), t('Good to know anywhere')),
      listEl(['112 works from most mobile phones in most countries.', 'In most of North, Central and South America, 911 also works.', 'On a landline, use your local emergency number.', 'Calls to emergency numbers are usually free.']),
      h('div.h2-tools', speak(function () { return listSpeech(['112 works from most mobile phones in most countries.', 'In most of North, Central and South America, 911 also works.', 'On a landline, use your local emergency number.', 'Calls to emergency numbers are usually free.']); }))));

    // saved list
    var savedHost = h('div');
    body.appendChild(savedHost);
    function drawSaved() {
      MT.clear(savedHost);
      var s = readNumbers();
      if (L.hasAnyNumber(s)) savedHost.appendChild(savedNumbersCard(s, t('My saved numbers')));
    }

    // form
    var inputs = {}, errs = {};
    var form = h('form.form-grid.cols-2', { novalidate: true });
    NUM_FIELDS.forEach(function (f) {
      var id = 'h2-n-' + f.k;
      inputs[f.k] = h('input', { id: id, type: 'tel', inputmode: 'tel', autocomplete: 'off', maxlength: '32' });
      errs[f.k] = h('div.error', { 'aria-live': 'polite' });
      if (f.k === 'doctor') {
        inputs.doctorName = h('input', { id: 'h2-n-doctorName', type: 'text', autocomplete: 'off', maxlength: '80', placeholder: t('Name of doctor or clinic') });
        form.appendChild(h('div.field', h('label', { for: 'h2-n-doctorName' }, ico(f.icon + ' '), t('My doctor or clinic (name)')), inputs.doctorName));
        form.appendChild(h('div.field', h('label', { for: id }, ico(f.icon + ' '), t('My doctor or clinic (number)')), inputs[f.k], errs[f.k]));
      } else {
        form.appendChild(h('div.field', h('label', { for: id }, ico(f.icon + ' '), t(f.label)), inputs[f.k], f.hint ? h('div.hint', t(f.hint)) : null, errs[f.k]));
      }
    });
    var formNote = h('p.small', { style: 'margin:0 0 10px' });
    var saveBtn = h('button.btn.btn-primary.btn-lg', { type: 'submit' }, ico('💾'), t('Save my numbers'));
    form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
    body.appendChild(h('section.card.h2-sec',
      h('h2', ico('✍️'), t('My numbers')),
      formNote,
      form,
      h('div.h2-tools', { style: 'margin-top:14px' }, saveBtn,
        h('button.btn', { type: 'button', onclick: function () { var d = L.countryDefaults(country); if (d) { fillFrom(d, true); MT.toast(t('Filled in from the built-in list. Check, then save.'), 'ok'); } else MT.toast(t('No built-in numbers for this country.'), 'warn'); } }, ico('↧'), t('Fill in from the list')),
        h('button.btn.btn-ghost', { type: 'button', style: 'color:var(--danger)', onclick: clearAll }, ico('🗑'), t('Clear my numbers'))),
      h('p.small.muted', { style: 'margin:8px 0 0' }, t('Saved only on this phone. Nothing is sent anywhere.'))));
    body.appendChild(MT.ui.disclaimer(t('Built-in numbers come from public lists and can change. Always check them locally.')));

    function drawBuiltIn() {
      MT.clear(builtIn);
      var d = L.countryDefaults(country);
      if (!country) { builtIn.appendChild(h('div', { style: 'margin-top:12px' }, MT.ui.alert('info', t('No country chosen'), t('112 works from most mobile phones. Ask locally for your numbers and save them below.')))); return; }
      if (!d) { builtIn.appendChild(h('div', { style: 'margin-top:12px' }, MT.ui.alert('info', t('We do not have checked numbers for {country} yet.', { country: countryName(country) }), t('112 works from most mobile phones. Ask at a clinic or police station, then save your numbers below.')))); return; }
      var rows = [['🚨', 'Emergency', d.emergency]];
      if (d.ambulance !== d.emergency) rows.push(['🚑', 'Ambulance', d.ambulance]);
      if (d.police !== d.emergency) rows.push(['🚓', 'Police', d.police]);
      if (d.fire !== d.emergency) rows.push(['🚒', 'Fire', d.fire]);
      if (d.alt) rows.push(['☎️', 'Also works', d.alt]);
      if (d.poison) rows.push(['☠️', 'Poison centre', d.poison]);
      if (d.mentalHealth) rows.push(['💬', 'Mental-health or crisis line', d.mentalHealth]);
      if (d.gbv) rows.push(['🛡️', 'Violence and abuse helpline', d.gbv]);
      builtIn.appendChild(h('div.h2-sec',
        h('h2', { style: 'font-size:1.15rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap' }, t('Numbers for {country}', { country: countryName(country) }), MT.ui.badge(t('Check locally'), 'warn')),
        h('ul.h2-numlist', rows.map(function (r) { return h('li', h('span.h2-num-l', ico(r[0]), ' ', h('strong', t(r[1]))), h('span.h2-num-v', r[2]), callLink(r[2], t('Call'))); })),
        d.note ? h('p.small', { style: 'margin:6px 0 0' }, t(d.note)) : null,
        h('p.small.muted', { style: 'margin:6px 0 0' }, t('These numbers come from our built-in list. Numbers can change. Check them locally, for example with a clinic, the police, or an official website.'))));
    }
    function fillFrom(d, overwrite) {
      ['ambulance', 'police', 'fire', 'poison', 'mentalHealth', 'gbv'].forEach(function (k) {
        if (overwrite || !inputs[k].value) inputs[k].value = d ? (d[k] || '') : '';
      });
      formNote.textContent = t('These are suggestions from the built-in list. Check them, then press Save.');
    }
    function save() {
      var bad = false, out = { country: country };
      NUM_FIELDS.forEach(function (f) {
        var raw = inputs[f.k].value.trim();
        var clean = L.cleanNumber(raw);
        errs[f.k].textContent = '';
        if (raw && !clean) { errs[f.k].textContent = t('Use only numbers, spaces, + or -.'); bad = true; }
        out[f.k] = clean;
      });
      out.doctorName = inputs.doctorName.value.trim().slice(0, 80);
      if (bad) { MT.toast(t('Please check the highlighted numbers.'), 'warn'); return; }
      if (!out.ambulance) {
        errs.ambulance.textContent = t('Please add an emergency number. If you are not sure, use 112.');
        MT.toast(t('Please add an emergency number.'), 'warn');
        try { inputs.ambulance.focus(); } catch (e) { /* ignore */ }
        return;
      }
      out.confirmedAt = new Date().toISOString();
      var clean = L.normalizeNumbers(out);
      MT.store.set(NUM_KEY, { v: 1, country: clean.country, ambulance: clean.ambulance, police: clean.police, fire: clean.fire, poison: clean.poison, mentalHealth: clean.mentalHealth, gbv: clean.gbv, doctor: clean.doctor, doctorName: clean.doctorName, confirmedAt: clean.confirmedAt });
      confirmed = true;
      formNote.textContent = t('Saved. Every Call button in Salus now uses {number}.', { number: clean.ambulance });
      MT.toast(t('Saved on this phone.'), 'ok');
      drawSaved();
    }
    function clearAll() {
      MT.confirm(t('Clear all your saved numbers from this phone?'), { danger: true, okLabel: t('Clear') }).then(function (ok) {
        if (!ok) return;
        MT.store.remove(NUM_KEY);
        MT.emit('store:' + NUM_KEY, null);
        confirmed = false;
        NUM_FIELDS.forEach(function (f) { inputs[f.k].value = ''; errs[f.k].textContent = ''; });
        inputs.doctorName.value = '';
        fillFrom(L.countryDefaults(country), true);
        drawSaved();
        MT.toast(t('Your numbers were cleared.'), 'ok');
      });
    }
    // initial values
    if (confirmed) {
      NUM_FIELDS.forEach(function (f) { inputs[f.k].value = saved[f.k] || ''; });
      inputs.doctorName.value = saved.doctorName || '';
      formNote.textContent = t('These are your saved numbers. Change them and press Save at any time.');
    } else fillFrom(L.countryDefaults(country), true);
    drawBuiltIn();
    drawSaved();
  }

  /* ======================================================================
     6. Tool: first-aid (library, cards, CPR metronome)
     ====================================================================== */
  MT.registerTool({
    id: 'first-aid', title: 'First aid', category: 'help', icon: '⛑️', order: 1, header: false,
    description: 'Step-by-step first aid for CPR, choking, bleeding, burns and more.',
    keywords: ['first aid', 'cpr', 'choking', 'bleeding', 'burns', 'stroke', 'heart attack', 'anaphylaxis', 'seizure', 'poisoning', 'snakebite', 'drowning', 'heat stroke', 'ors', 'dehydration', 'head injury', 'overdose', 'naloxone', 'recovery position', 'aed'],
    render: function (container, ctx) {
      var life = lifecycle();
      var id = ctx.params[0];
      if (id && FA.index[id]) faCard(container, FA.index[id], life, ctx);
      else faLibrary(container, life, id);
      return life.run;
    }
  });
  function cardHay(c) { return [c.title, t(c.title), c.summary, t(c.summary)].concat(c.keywords || []).join(' ').toLowerCase(); }
  function faMatches(q) {
    var terms = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return FA.cards.filter(function (c) { var hay = cardHay(c); return terms.every(function (w) { return hay.indexOf(w) >= 0; }); });
  }
  function faLibrary(container, life, missingId) {
    container.appendChild(pageHead([[t('Home'), '#/'], [t('Get help'), '#/get-help'], [t('First aid'), null]], '⛑️', t('First aid'), t('Simple steps for common emergencies. Large text, one step at a time, with read-aloud.')));
    container.appendChild(callBar(life, { text: function (n) { return t('If someone is badly hurt or very ill, call {number} first.', { number: n }); } }));
    if (missingId) container.appendChild(h('div', { style: 'margin-bottom:12px' }, MT.ui.alert('warn', t('Guide not found'), t('Here are all the first-aid guides.'))));
    var input = h('input', { id: 'h2-fa-q', type: 'search', autocomplete: 'off', placeholder: t('Search: for example burn, choking, snake'), value: memo.faQuery });
    container.appendChild(h('div.h2-search', h('label.sr-only', { for: 'h2-fa-q' }, t('Search first aid')), h('span.h2-search-ico', { 'aria-hidden': 'true' }, '🔍'), input));
    var list = h('div', { 'aria-live': 'polite' });
    container.appendChild(list);
    function draw() {
      var q = input.value;
      memo.faQuery = q;
      var found = q.trim() ? faMatches(q) : FA.cards;
      MT.clear(list);
      if (!found.length) {
        list.appendChild(MT.ui.empty('🔍', t('No guide found'), t('Try another word, or browse the list. If someone is in danger, call {number} now.', { number: MT.help.emergencyNumber() })));
        return;
      }
      (q.trim() ? [{ id: '*', title: '' }] : FA.groups).forEach(function (grp) {
        var cards = found.filter(function (c) { return grp.id === '*' || c.group === grp.id; });
        if (!cards.length) return;
        if (grp.title) list.appendChild(h('h2.section-title', t(grp.title)));
        list.appendChild(h('div.h2-cards', cards.map(function (c) {
          return h('a.h2-fa' + (c.group === 'life' ? '.is-life' : ''), { href: '#/first-aid/' + c.id },
            h('span.h2-fa-ico', { 'aria-hidden': 'true' }, c.icon), h('span', h('span.h2-fa-t', t(c.title)), h('span.h2-fa-d', t(c.summary))));
        })));
      });
    }
    input.addEventListener('input', MT.debounce(draw, 120));
    draw();
    container.appendChild(h('div.h2-sec', MT.ui.disclaimer(t('These guides are not a substitute for first-aid training. If in doubt, call your emergency number.'))));
  }
  function cardSpeech(card, vars) {
    var parts = [t(card.title) + '.'];
    if (card.callText) parts.push(t(card.callText, vars));
    card.sections.forEach(function (sec) { parts.push(t(sec.title) + '.'); parts.push(stepsSpeech(sec.steps, vars)); });
    if (card.dont && card.dont.length) parts.push(t('Do NOT') + ': ' + listSpeech(card.dont, vars));
    if (card.callWhen && card.callWhen.length) parts.push(t('Call {number} if', vars) + ': ' + listSpeech(card.callWhen, vars));
    if (card.careWhen && card.careWhen.length) parts.push(t('See a health worker if') + ': ' + listSpeech(card.careWhen, vars));
    if (card.notes && card.notes.length) parts.push(listSpeech(card.notes, vars));
    return parts.join(' ');
  }
  function faCard(container, card, life, ctx) {
    ctx.setTitle(t(card.title));
    var vars = { number: MT.help.emergencyNumber() };
    container.appendChild(pageHead([[t('Home'), '#/'], [t('Get help'), '#/get-help'], [t('First aid'), '#/first-aid'], [t(card.title), null]], card.icon, t(card.title), null));
    container.appendChild(callBar(life, {
      title: function (n) { return card.callText ? t(card.callText, { number: n }) : t('Is it serious?'); },
      text: function (n) { return card.callText ? ' ' : t('Call {number} if you are worried. Check the list below.', { number: n }); }
    }));
    container.appendChild(h('p.h2-card-lead', t(card.summary)));
    container.appendChild(h('div.h2-tools.h2-noprint',
      speak(function () { return cardSpeech(card, { number: MT.help.emergencyNumber() }); }),
      h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { MT.print(container); } }, ico('🖨️'), t('Print')),
      h('a.btn.btn-sm.btn-ghost', { href: '#/first-aid' }, ico('⛑️'), t('All first aid'))));
    card.sections.forEach(function (sec) {
      var el = h('section.h2-sec' + (sec.kind ? '.is-' + sec.kind : ''), h('h2', t(sec.title)), stepsEl(sec.steps, vars));
      container.appendChild(el);
      if (sec.widget === 'metronome') container.appendChild(metronome(life));
    });
    if (card.dont && card.dont.length) container.appendChild(h('section.h2-box.is-dont', h('h2', ico('🚫'), t('Do NOT')), listEl(card.dont, vars)));
    if (card.callWhen && card.callWhen.length) container.appendChild(h('section.h2-box.is-when', h('h2', ico('📞'), t('Call {number} if', vars)), listEl(card.callWhen, vars), h('div.h2-tools.h2-noprint', callLink(vars.number))));
    if (card.careWhen && card.careWhen.length) container.appendChild(h('section.h2-box.is-care', h('h2', ico('🏥'), t('See a health worker if')), listEl(card.careWhen, vars)));
    if (card.notes && card.notes.length) container.appendChild(h('section.h2-box.is-note', h('h2', ico('💡'), t('Good to know')), listEl(card.notes, vars)));
    var rel = (card.related || []).map(function (id) { return FA.index[id]; }).filter(Boolean);
    if (rel.length) container.appendChild(h('section.h2-sec.h2-noprint', h('h2', t('Related guides')), h('div.h2-chips', rel.map(function (c) { return h('a.h2-chip', { href: '#/first-aid/' + c.id }, ico(c.icon), t(c.title)); }))));
    container.appendChild(sourcesEl(card.sources));
    container.appendChild(MT.ui.disclaimer(t('This guide is not a substitute for first-aid training. If in doubt, call {number}.', vars)));
  }

  /* CPR metronome: Web Audio click at 110/min (AHA/ERC 2025: 100-120/min), a visual
     pulse and a compression count. Visual timing uses performance.now(), so the beat
     keeps going even if sound is blocked. Keeps the screen awake while running. */
  function metronome(life) {
    var C = L.CPR, period = 60 / C.bpm;
    var st = { running: false, mode: memo.cprMode, sound: memo.cprSound, next: 0, count: 0, total: 0, startWall: 0, timer: null, timeouts: [], wake: null, swaps: 0, lastSec: -1 };
    var nEl = h('span.h2-beat-n', '0'), lEl = h('span.h2-beat-l', t('pushes'));
    var beat = h('div.h2-beat', { 'aria-hidden': 'true' }, nEl, lEl);
    var status = h('p.h2-metro-status', { 'aria-live': 'polite' });
    var timeEl = h('span.h2-timer', '0:00');
    var btn = h('button.btn.btn-lg.btn-primary', { type: 'button', 'data-act': 'metronome' });
    var soundCb = h('input', { type: 'checkbox', id: 'h2-cpr-sound', checked: st.sound });
    soundCb.addEventListener('change', function () { st.sound = memo.cprSound = soundCb.checked; if (st.sound) Sound.ensure(); });
    var seg = MT.ui.segmented([{ value: 'hands', label: t('Hands-only') }, { value: '30-2', label: t('30 pushes + 2 breaths') }], st.mode, function (v) {
      st.mode = memo.cprMode = v; st.count = 0;
      if (st.running) { stop(true); start(); }
    });
    function now() { return (W.performance && performance.now) ? performance.now() / 1000 : Date.now() / 1000; }
    function setBtn() { MT.clear(btn); btn.appendChild(ico(st.running ? '⏹' : '▶️')); btn.appendChild(document.createTextNode(st.running ? t('Stop the beat') : t('Start the beat'))); btn.setAttribute('aria-pressed', String(st.running)); }
    function later(fn, ms) { var id = setTimeout(function () { st.timeouts = st.timeouts.filter(function (x) { return x !== id; }); fn(); }, Math.max(0, ms)); st.timeouts.push(id); }
    function fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + MT.pad2(s % 60); }
    function schedule() {
      var tnow = now();
      while (st.running && st.next < tnow + 0.12) {
        var at = st.next, delay = at - tnow;
        st.count++; st.total++;
        var shown = st.mode === '30-2' ? st.count : st.total;
        if (st.sound) Sound.beep(st.mode === '30-2' && st.count === C.compressionsPerCycle ? 1250 : 1000, 0.05, delay, 0.45);
        (function (val) { later(function () { flash(val); }, delay * 1000); })(shown);
        if (st.mode === '30-2' && st.count >= C.compressionsPerCycle) {
          var cue = at + period;
          if (st.sound) { Sound.beep(520, 0.35, cue - tnow, 0.35); Sound.beep(520, 0.35, cue - tnow + 1.6, 0.35); }
          later(breathCue, (cue - tnow) * 1000);
          st.next = cue + C.breathPauseMs / 1000;
          st.count = 0;
        } else st.next = at + period;
      }
      var el = (Date.now() - st.startWall) / 1000, sec = Math.floor(el);
      if (sec !== st.lastSec) { st.lastSec = sec; timeEl.textContent = fmtTime(el); }
      var swaps = Math.floor(el * 1000 / C.swapEveryMs);
      if (swaps > st.swaps) { st.swaps = swaps; status.textContent = t('2 minutes passed. If someone else can push, swap now. Swap quickly.'); vibrate([200, 100, 200]); }
    }
    function flash(val) {
      if (!st.running) return;
      beat.classList.remove('is-breath');
      nEl.textContent = String(val);
      lEl.textContent = st.mode === '30-2' ? t('of 30 pushes') : t('pushes');
      beat.classList.add('is-on');
      later(function () { beat.classList.remove('is-on'); }, 120);
    }
    function breathCue() {
      if (!st.running) return;
      beat.classList.remove('is-on');
      beat.classList.add('is-breath');
      nEl.textContent = '2';
      lEl.textContent = t('breaths now');
      status.textContent = t('Give 2 breaths now. Then start pushing again on the beat.');
    }
    function start() {
      if (st.running) return;
      if (st.sound) Sound.ensure();
      st.running = true; st.count = 0; st.total = 0; st.swaps = 0; st.lastSec = -1;
      st.startWall = Date.now(); st.next = now() + 0.15;
      st.timer = setInterval(schedule, 25);
      schedule();
      status.textContent = st.mode === '30-2' ? t('Push on every beat. After 30 pushes, give 2 breaths.') : t('Push hard and fast on every beat. Do not stop.');
      requestWake();
      setBtn();
    }
    function stop(silent) {
      if (!st.running) return;
      st.running = false;
      clearInterval(st.timer);
      st.timeouts.forEach(clearTimeout); st.timeouts = [];
      beat.classList.remove('is-on', 'is-breath');
      if (!silent) status.textContent = t('Stopped after {n} pushes ({time}). If help has not arrived and they are not breathing normally, start again.', { n: st.total, time: fmtTime((Date.now() - st.startWall) / 1000) });
      releaseWake();
      setBtn();
    }
    function requestWake() {
      try { if (W.navigator && navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (s) { if (st.running) st.wake = s; else s.release(); }).catch(function () { /* not allowed */ }); } catch (e) { /* not supported */ }
    }
    function releaseWake() { try { if (st.wake) st.wake.release(); } catch (e) { /* ignore */ } st.wake = null; }
    function onVis() { if (document.visibilityState === 'visible' && st.running && !st.wake) requestWake(); }
    document.addEventListener('visibilitychange', onVis);
    btn.addEventListener('click', function () { if (st.running) stop(); else start(); });
    life.add(function () { stop(true); document.removeEventListener('visibilitychange', onVis); Sound.pause(); });
    setBtn();
    return h('section.h2-metro.h2-noprint', { 'aria-label': t('CPR beat: 110 pushes a minute') },
      h('h3', { style: 'margin:0;font-size:1.1rem' }, ico('🥁 '), t('CPR beat: push on every beat (110 a minute)')),
      seg, beat, btn,
      h('div.row', { style: 'justify-content:center;--gap:1rem' }, h('span', t('Time'), ': ', timeEl), h('label.row', { for: 'h2-cpr-sound', style: '--gap:.4rem;cursor:pointer' }, soundCb, t('Sound'))),
      status,
      h('p.small.muted', { style: 'margin:0' }, t('Keep the phone on speaker near you. The screen stays on while the beat runs.')));
  }

  /* ======================================================================
     7. Tool: crisis (immediate steps, helplines, safety plan, grounding)
     Sources: WHO LIVE LIFE (2021), WHO mhGAP-IG 2.0 (2016), Stanley & Brown
     (2012) Safety Planning Intervention, Find A Helpline directory.
     ====================================================================== */
  var CRISIS_VIEWS = [
    { id: '', href: '#/crisis', icon: '💬', label: 'Help now', title: 'Crisis support', lead: 'If you or someone else is in crisis, you are not alone. Here is what to do now.' },
    { id: 'plan', href: '#/crisis/plan', icon: '📝', label: 'My safety plan', title: 'My safety plan', lead: 'A short plan you make now, to help you through a crisis later. Saved only on this phone.' },
    { id: 'ground', href: '#/crisis/ground', icon: '🖐️', label: '5-4-3-2-1 calm down', title: '5-4-3-2-1 calm down', lead: 'A short exercise to bring your mind back to the here and now.' }
  ];
  var CRISIS_SOURCES = [
    { label: 'WHO. LIVE LIFE: an implementation guide for suicide prevention in countries. Geneva: WHO; 2021.' },
    { label: 'WHO. mhGAP Intervention Guide, version 2.0 (self-harm and suicide). Geneva: WHO; 2016.' },
    { label: 'Stanley B, Brown GK. Safety planning intervention: a brief intervention to mitigate suicide risk. Cogn Behav Pract. 2012;19(2):256-264.' },
    { label: 'Find A Helpline: free directory of crisis lines in 175+ countries.', url: FINDAHELPLINE }
  ];
  function crisisLine() {
    var s = readNumbers();
    if (s.mentalHealth) return { number: s.mentalHealth, saved: true };
    var d = L && L.countryDefaults(helpInfo().country);
    return d && d.mentalHealth ? { number: d.mentalHealth, saved: false } : null;
  }
  MT.registerTool({
    id: 'crisis', title: 'Crisis support', category: 'mind', icon: '💬', order: 0, header: false,
    description: 'What to do in a mental-health crisis, helplines, your safety plan and a calm-down exercise.',
    keywords: ['suicide', 'suicidal', 'self-harm', 'self harm', 'crisis', 'helpline', 'hotline', 'safety plan', 'grounding', 'panic', 'anxiety', 'abuse', 'violence', 'domestic violence', 'unsafe', '988', 'samaritans', 'lifeline'],
    render: function (container, ctx) {
      var life = lifecycle();
      var view = ctx.params[0] || '';
      var meta = CRISIS_VIEWS.filter(function (v) { return v.id === view; })[0] || CRISIS_VIEWS[0];
      view = meta.id;
      var crumbs = [[t('Home'), '#/'], [t('Mind & sleep'), null]];
      if (view) { crumbs[1] = [t('Crisis support'), '#/crisis']; crumbs.push([t(meta.title), null]); }
      container.appendChild(pageHead(crumbs, meta.icon, t(meta.title), t(meta.lead)));
      container.appendChild(callBar(life, {
        title: function () { return t('In danger right now?'); },
        text: function (n) { return t('If you or someone else may act on thoughts of suicide, call {number} now.', { number: n }); },
        extra: function () {
          var cl = crisisLine();
          return [cl ? h('a.h2-callbar-alt', { href: telHref(cl.number) }, ico('💬'), t('Call crisis line {number}', { number: cl.number })) : null,
            h('a.h2-callbar-alt', { href: FINDAHELPLINE, target: '_blank', rel: 'noopener' }, ico('🌐'), t('Find a helpline'))];
        }
      }));
      container.appendChild(subNav(t('Crisis support sections'), CRISIS_VIEWS, view));
      var body = h('div');
      container.appendChild(body);
      if (view) ctx.setTitle(t(meta.title));
      ({ '': crisisHome, plan: crisisPlan, ground: crisisGround })[view](body, life, container);
      return life.run;
    }
  });

  var HELP_SOMEONE = [
    ['🤝', 'Stay with them. Do not leave them alone.'],
    ['🗣️', 'Ask them directly: "Are you thinking about killing yourself?" Asking does not put the idea in their head.'],
    ['👂', 'Listen without judging. Let them talk. Take them seriously.'],
    ['🔒', 'Remove anything they could use to hurt themselves: medicines, weapons, ropes, pesticides and other poisons.'],
    ['📞', 'Call a helpline or {number} together. Offer to make the call with them.'],
    ['🚨', 'If they have hurt themselves or taken an overdose, call {number} now.'],
    ['🔁', 'Do not promise to keep it a secret. Stay in touch over the next days.']
  ];
  var HELP_MYSELF = [
    ['💛', 'You are not alone, and these feelings can pass.'],
    ['🗣️', 'Tell someone you trust how you feel, today.'],
    ['📞', 'Call a helpline. You do not have to be in danger to call.'],
    ['🏠', 'Go to a safe place, or be near other people.'],
    ['🔒', 'Put distance between you and anything you could use to hurt yourself.'],
    ['📝', 'Use your safety plan.'],
    ['🚨', 'If you feel you might act on these thoughts now, call {number} or go to the nearest hospital.']
  ];
  var UNSAFE_HOME = [
    'Everyone has the right to be safe at home.',
    'If someone hurts you, threatens you or controls you, it is not your fault.',
    'If you are in danger now, call {number}.',
    'Think of a safe place you could go, and a person you trust.',
    'Keep important papers, some money and your medicines where you can grab them quickly.',
    'Agree on a code word with someone you trust, so they know to get help.',
    'Save helpline numbers in your phone under a name only you will understand.'
  ];
  function crisisHome(body) {
    var vars = { number: MT.help.emergencyNumber() };
    body.appendChild(h('section.card',
      h('h2', ico('🤝'), t('If someone may be suicidal')),
      h('div.h2-tools', speak(function () { return t('If someone may be suicidal') + '. ' + stepsSpeech(HELP_SOMEONE, vars); })),
      stepsEl(HELP_SOMEONE, vars)));
    body.appendChild(h('section.card.h2-sec',
      h('h2', ico('💛'), t('If you are thinking about suicide')),
      h('div.h2-tools', speak(function () { return t('If you are thinking about suicide') + '. ' + stepsSpeech(HELP_MYSELF, vars); })),
      stepsEl(HELP_MYSELF, vars),
      h('div.h2-tools', h('a.btn.btn-primary', { href: '#/crisis/plan' }, ico('📝'), t('Make or open my safety plan')))));

    // helplines
    var s = readNumbers(), d = L.countryDefaults(helpInfo().country), rows = [];
    if (s.mentalHealth) rows.push(['💬', t('My crisis line'), s.mentalHealth, false]);
    else if (d && d.mentalHealth) rows.push(['💬', t('Crisis line for {country}', { country: countryName(d.country) }), d.mentalHealth, true]);
    if (s.gbv) rows.push(['🛡️', t('My violence and abuse helpline'), s.gbv, false]);
    if (s.doctor) rows.push(['🩺', s.doctorName || t('My doctor or clinic'), s.doctor, false]);
    rows.push(['🚨', t('Emergency'), vars.number, false]);
    body.appendChild(h('section.card.h2-sec',
      h('h2', ico('📞'), t('Helplines')),
      h('ul.h2-numlist', rows.map(function (r) {
        return h('li', h('span.h2-num-l', ico(r[0]), ' ', h('strong', r[1]), r[3] ? h('small', t('From our built-in list. Check locally.')) : null), h('span.h2-num-v', r[2]), callLink(r[2], t('Call')));
      })),
      h('p', { style: 'margin:10px 0 0' }, t('Find A Helpline lists free, confidential helplines in more than 175 countries (needs internet).'), ' ',
        h('a', { href: FINDAHELPLINE, target: '_blank', rel: 'noopener' }, 'findahelpline.com')),
      h('p.small', h('a', { href: '#/get-help/numbers' }, t('Save my helpline numbers')))));

    var tiles = [['#/crisis/plan', '📝', 'My safety plan', 'Six steps to help you stay safe in a crisis.'],
      ['#/crisis/ground', '🖐️', '5-4-3-2-1 calm down', 'Use your senses to feel calmer, step by step.'],
      ['#/get-help/check/mental', '❓', 'Is it an emergency?', 'Check the danger signs in a mental-health crisis.']];
    if (hasTool('breathe')) tiles.splice(2, 0, ['#/breathe', '🫁', 'Slow breathing', 'A guided breathing exercise to calm your body.']);
    body.appendChild(h('div.h2-tiles.h2-sec', tiles.map(function (x) {
      return h('a.h2-tile', { href: x[0] }, h('span.h2-tile-ico', { 'aria-hidden': 'true' }, x[1]), h('span.h2-tile-t', t(x[2])), h('span.h2-tile-d', t(x[3])));
    })));

    // not safe at home (neutral wording, collapsed)
    var gbv = s.gbv || (d && d.gbv) || '';
    body.appendChild(h('details.disclosure.h2-sec',
      h('summary', t('If you are not safe at home')),
      h('div.disclosure-body',
        listEl(UNSAFE_HOME, vars),
        gbv ? h('div.h2-tools', callLink(gbv, t('Call helpline {number}', { number: gbv }))) : null,
        h('p', { style: 'margin:10px 0 4px' }, h('strong', t('The ✕ Exit button at the top of the screen closes this app at once and opens a neutral website.'))),
        h('p.small.muted', { style: 'margin:0' }, t('Your browser may keep a list of pages you visited. You can clear it in your browser settings.')))));
    body.appendChild(sourcesEl(CRISIS_SOURCES));
    body.appendChild(MT.ui.disclaimer(t('Salus cannot respond to a crisis. If you are in danger, call {number} or go to the nearest hospital.', vars)));
  }

  /* ---------------- Safety plan (Stanley & Brown 2012) ---------------- */
  var PLAN_STEPS = [
    { key: 'warningSigns', type: 'text', title: 'My warning signs', help: 'Thoughts, feelings or situations that tell me a crisis may be starting.', ph: 'For example: I stop answering my phone' },
    { key: 'coping', type: 'text', title: 'Things I can do on my own to feel better', help: 'Things that take my mind off my problems for a while, without needing anyone else.', ph: 'For example: go for a walk, play music, pray, slow breathing' },
    { key: 'distractions', type: 'contact', title: 'People and places that take my mind off things', help: 'People I can be with, or places I can go, where I feel a bit better.', ph: 'For example: my cousin, the market, the football field' },
    { key: 'people', type: 'contact', title: 'People I can ask for help', help: 'People I trust, who I can tell that I am not OK.', ph: 'Name' },
    { key: 'professionals', type: 'contact', title: 'Health workers and helplines', help: 'A health worker, clinic or crisis line I can call. In danger, I call the emergency number.', ph: 'Name or service' },
    { key: 'safeEnvironment', type: 'text', title: 'Making my surroundings safe', help: 'Ways to keep away from things I could use to hurt myself.', ph: 'For example: ask a friend to keep my pills; lock away farm chemicals' },
    { key: 'reasons', type: 'text', title: 'What matters most to me', help: 'People, hopes and reasons for living that I want to remember.', ph: 'For example: my children', extra: true }
  ];
  function planText(p) {
    var lines = [t('My safety plan')];
    PLAN_STEPS.forEach(function (s, i) {
      lines.push('');
      lines.push((s.extra ? '' : (i + 1) + '. ') + t(s.title));
      if (!p[s.key].length) lines.push('  -');
      p[s.key].forEach(function (it) { lines.push('  - ' + (typeof it === 'string' ? it : [it.name, it.phone].filter(Boolean).join(': '))); });
    });
    lines.push('');
    lines.push(t('In an emergency, call {number}.', { number: MT.help.emergencyNumber() }));
    return lines.join('\n');
  }
  function crisisPlan(body, life, container) {
    var work = L.normalizeSafetyPlan(MT.store.get(PLAN_KEY, null));
    var status = h('p.small.muted', { 'aria-live': 'polite', style: 'margin:0' }, work.updatedAt ? t('Last saved: {date}', { date: MT.formatDate(new Date(work.updatedAt), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : t('Not saved yet.'));
    var printEl = h('div.h2-printonly');
    function persist() {
      var clean = L.normalizeSafetyPlan(work);
      clean.updatedAt = new Date().toISOString();
      MT.store.set(PLAN_KEY, clean);
      status.textContent = t('Saved on this phone at {time}.', { time: MT.formatTime(new Date()) });
    }
    var persistSoon = MT.debounce(persist, 500);
    life.add(function () { persistSoon.flush && persistSoon.flush(); });
    body.appendChild(h('section.card.h2-noprint',
      h('p.h2-big', { style: 'margin-top:0' }, t('Fill this in when you feel calmer. In a crisis, open it and follow the steps one by one, until you feel safer.')),
      h('div.h2-tools',
        speak(function () { return planText(L.normalizeSafetyPlan(work)); }),
        h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.copy(planText(L.normalizeSafetyPlan(work))); } }, ico('📋'), t('Copy as text')),
        h('button.btn.btn-sm', { type: 'button', onclick: function () {
          MT.clear(printEl);
          printEl.appendChild(h('pre', { style: 'white-space:pre-wrap;font-family:inherit;font-size:12pt' }, planText(L.normalizeSafetyPlan(work))));
          MT.print(container);
        } }, ico('🖨️'), t('Print')),
        h('button.btn.btn-sm.btn-ghost', { type: 'button', style: 'color:var(--danger)', onclick: function () {
          MT.confirm(t('Delete your safety plan from this phone?'), { danger: true, okLabel: t('Delete') }).then(function (ok) {
            if (!ok) return;
            MT.store.remove(PLAN_KEY);
            work = L.normalizeSafetyPlan(null);
            status.textContent = t('Deleted.');
            drawSteps();
          });
        } }, ico('🗑'), t('Delete plan'))),
      status));
    var stepsHost = h('div.h2-noprint');
    body.appendChild(stepsHost);
    body.appendChild(printEl);
    body.appendChild(h('div.h2-noprint', sourcesEl([CRISIS_SOURCES[2], CRISIS_SOURCES[0]])));

    function quickAdds() {
      var s = readNumbers(), d = L.countryDefaults(helpInfo().country), out = [];
      if (s.mentalHealth) out.push({ name: t('Crisis line'), phone: s.mentalHealth });
      else if (d && d.mentalHealth) out.push({ name: t('Crisis line'), phone: d.mentalHealth });
      if (s.doctor) out.push({ name: s.doctorName || t('My doctor or clinic'), phone: s.doctor });
      out.push({ name: t('Emergency number'), phone: MT.help.emergencyNumber() });
      return out;
    }
    function drawSteps(focusKey) {
      MT.clear(stepsHost);
      var n = 0;
      PLAN_STEPS.forEach(function (s) {
        if (!s.extra) n++;
        var listHost = h('div');
        var sec = h('section.card.h2-sec', { dataset: { step: s.key } },
          h('h2', { style: 'display:flex;gap:.6rem;align-items:center' }, s.extra ? ico('💛') : h('span.h2-plan-n', { 'aria-hidden': 'true' }, String(n)), h('span', (s.extra ? '' : t('Step {n}:', { n: n }) + ' ') + t(s.title))),
          h('p.muted', { style: 'margin:0' }, t(s.help)),
          listHost);
        var items = work[s.key];
        items.forEach(function (it, i) { listHost.appendChild(itemRow(s, i)); });
        var addBtn = h('button.btn.btn-soft', { type: 'button', style: 'margin-top:10px', 'data-add': s.key }, ico('➕'), t('Add'));
        addBtn.addEventListener('click', function () { work[s.key].push(s.type === 'contact' ? { name: '', phone: '' } : ''); drawSteps(s.key); });
        sec.appendChild(addBtn);
        if (s.key === 'professionals') {
          sec.appendChild(h('div.h2-chips', { style: 'margin-top:10px' }, quickAdds().map(function (q) {
            return h('button.chip', { type: 'button', onclick: function () {
              if (work.professionals.some(function (x) { return x.phone === q.phone; })) { MT.toast(t('Already in your plan.'), 'ok'); return; }
              work.professionals.push({ name: q.name, phone: q.phone }); persist(); drawSteps();
            } }, '➕ ', q.name + ' (' + q.phone + ')');
          })));
        }
        stepsHost.appendChild(sec);
      });
      if (focusKey) {
        var inputs = MT.$$('[data-step="' + focusKey + '"] input', stepsHost);
        var target = inputs.filter(function (x) { return !x.classList.contains('h2-phone'); }).pop();
        if (target) try { target.focus(); } catch (e) { /* ignore */ }
      }
    }
    function itemRow(s, i) {
      var it = work[s.key][i];
      var row = h('div.h2-plan-item');
      var rm = h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Remove') }, '✕');
      rm.addEventListener('click', function () { work[s.key].splice(i, 1); persist(); drawSteps(); });
      if (s.type === 'contact') {
        var nameIn = h('input.input', { type: 'text', value: it.name, placeholder: t(s.ph), 'aria-label': t('Name'), maxlength: '120' });
        var phoneIn = h('input.input.h2-phone', { type: 'tel', inputmode: 'tel', value: it.phone, placeholder: t('Phone (optional)'), 'aria-label': t('Phone number'), maxlength: '32' });
        var callHost = h('span');
        var warn = h('div.error', { style: 'flex-basis:100%', 'aria-live': 'polite' });
        function refreshCall() {
          MT.clear(callHost);
          var ok = L.cleanNumber(phoneIn.value);
          warn.textContent = phoneIn.value.trim() && !ok ? t('Check this number: use only numbers, spaces, + or -.') : '';
          if (ok) callHost.appendChild(callLink(ok, t('Call')));
        }
        nameIn.addEventListener('input', function () { it.name = nameIn.value; persistSoon(); });
        phoneIn.addEventListener('input', function () { it.phone = phoneIn.value; refreshCall(); persistSoon(); });
        row.appendChild(nameIn); row.appendChild(phoneIn); row.appendChild(callHost); row.appendChild(rm); row.appendChild(warn);
        refreshCall();
      } else {
        var txt = h('input.input', { type: 'text', value: it, placeholder: t(s.ph), 'aria-label': t(s.title), maxlength: '300' });
        txt.addEventListener('input', function () { work[s.key][i] = txt.value; persistSoon(); });
        row.appendChild(txt); row.appendChild(rm);
      }
      return row;
    }
    drawSteps();
  }

  /* ---------------- 5-4-3-2-1 grounding ---------------- */
  var GROUND = [
    { n: 5, icon: '👀', text: 'Look around. Name 5 things you can see.', hint: 'Say them out loud or in your head. For example: a cup, a tree, my hand.' },
    { n: 4, icon: '✋', text: 'Notice 4 things you can feel or touch.', hint: 'For example: my feet on the floor, my clothes, the chair, the air on my skin.' },
    { n: 3, icon: '👂', text: 'Listen. Name 3 things you can hear.', hint: 'For example: a car, a bird, my own breathing.' },
    { n: 2, icon: '👃', text: 'Notice 2 things you can smell.', hint: 'If you cannot smell anything, name 2 smells you like.' },
    { n: 1, icon: '👅', text: 'Notice 1 thing you can taste.', hint: 'Or name 1 taste you like.' }
  ];
  function crisisGround(body, life) {
    var idx = -1;
    var stage = h('section.card.h2-ground', { 'aria-live': 'polite' });
    var autoCb = h('input', { type: 'checkbox', id: 'h2-ground-read', checked: memo.groundRead && MT.speech.supported });
    autoCb.addEventListener('change', function () { memo.groundRead = autoCb.checked; if (autoCb.checked) say(); else MT.speech.stop(); });
    body.appendChild(stage);
    if (MT.speech.supported) body.appendChild(h('label.check.h2-sec', { for: 'h2-ground-read' }, autoCb, h('span.grow', t('Read each step aloud'))));
    body.appendChild(h('p.small.muted.h2-sec', t('If you still feel unsafe after this exercise, call a helpline or {number}.', { number: MT.help.emergencyNumber() })));
    life.add(function () { MT.speech.stop(); });
    function stepText() {
      if (idx < 0) return t('This exercise can help when you feel panic, fear, or overwhelmed. Sit or stand comfortably. Breathe slowly. Then press Start.');
      if (idx >= GROUND.length) return t('Well done. Take a slow breath in, and a long breath out. You can do this again at any time.');
      return t(GROUND[idx].text) + ' ' + t(GROUND[idx].hint);
    }
    function say() { if (memo.groundRead && MT.speech.supported) MT.speech.speak(stepText()); }
    function go(i) { idx = i; draw(); say(); }
    function draw() {
      MT.clear(stage);
      if (idx < 0) {
        stage.appendChild(h('div.h2-ground-emo', { 'aria-hidden': 'true' }, '🖐️'));
        stage.appendChild(h('p.h2-ground-t', t('5-4-3-2-1: use your senses to feel calmer')));
        stage.appendChild(h('p.h2-ground-hint', stepText()));
        stage.appendChild(h('div.h2-tools', { style: 'justify-content:center' }, h('button.btn.btn-primary.btn-lg', { type: 'button', 'data-act': 'next', onclick: function () { go(0); } }, '▶️ ', t('Start')), speak(stepText)));
        return;
      }
      if (idx >= GROUND.length) {
        stage.appendChild(h('div.h2-ground-emo', { 'aria-hidden': 'true' }, '🌿'));
        stage.appendChild(h('p.h2-ground-t', t('Well done.')));
        stage.appendChild(h('p.h2-ground-hint', stepText()));
        stage.appendChild(h('div.h2-tools', { style: 'justify-content:center' },
          h('button.btn.btn-primary', { type: 'button', onclick: function () { go(0); } }, '↺ ', t('Do it again')),
          hasTool('breathe') ? h('a.btn', { href: '#/breathe' }, ico('🫁'), t('Slow breathing')) : null,
          h('a.btn', { href: '#/crisis' }, ico('💬'), t('Back to crisis support'))));
        return;
      }
      var s = GROUND[idx];
      var dots = h('div.h2-dots', { role: 'group', 'aria-label': t('Tap a circle for each one') });
      var nextBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', 'data-act': 'next', onclick: function () { go(idx + 1); } }, idx === GROUND.length - 1 ? t('Finish') : t('Next'), ' ▶');
      for (var i = 1; i <= s.n; i++) {
        (function (k) {
          var b = h('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': t('Thing {i} of {n}', { i: k, n: s.n }) }, String(k));
          b.addEventListener('click', function () {
            b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
            if (MT.$$('[aria-pressed="true"]', dots).length === s.n) try { nextBtn.focus(); } catch (e) { /* ignore */ }
          });
          dots.appendChild(b);
        })(i);
      }
      stage.appendChild(h('div.h2-progress.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(GROUND.length), 'aria-valuenow': String(idx + 1), 'aria-label': t('Step {n} of {total}', { n: idx + 1, total: GROUND.length }) }, h('span', { style: 'width:' + Math.round((idx + 1) / GROUND.length * 100) + '%' })));
      stage.appendChild(h('div.h2-ground-n', { 'aria-hidden': 'true' }, String(s.n)));
      stage.appendChild(h('div.h2-ground-emo', { 'aria-hidden': 'true' }, s.icon));
      stage.appendChild(h('p.h2-ground-t', t(s.text)));
      stage.appendChild(h('p.h2-ground-hint', t(s.hint)));
      stage.appendChild(dots);
      stage.appendChild(h('div.h2-tools', { style: 'justify-content:center' },
        h('button.btn.btn-lg', { type: 'button', onclick: function () { go(idx - 1); } }, '◀ ', t('Back')), nextBtn, speak(stepText)));
    }
    draw();
  }

  /* ======================================================================
     8. Search: first-aid guides and sub-pages
     ====================================================================== */
  var EXTRA_SEARCH = [
    { k: 'breath breathing count counter fast pneumonia respiratory rate', title: 'Breath counter', d: 'Count breaths for 1 minute to check for fast breathing.', href: '#/get-help/breath', icon: '⏱️' },
    { k: 'location gps share where map coordinates lost', title: 'Share my location', d: 'Send your GPS location to someone who can help.', href: '#/get-help/location', icon: '📍' },
    { k: 'danger signs sick child baby infant newborn pregnancy pregnant sepsis emergency urgent', title: 'Do I need help now?', d: 'Check danger signs for adults, children, babies, pregnancy and mental health.', href: '#/get-help/check', icon: '❓' },
    { k: 'emergency numbers ambulance police fire poison helpline 112 911 999 phone', title: 'Emergency numbers', d: 'Check and save the numbers for your country.', href: '#/get-help/numbers', icon: '📞' },
    { k: 'safety plan suicide crisis', title: 'My safety plan', d: 'Six steps to help you stay safe in a crisis.', href: '#/crisis/plan', icon: '📝' },
    { k: 'grounding panic anxiety calm 5-4-3-2-1 senses', title: '5-4-3-2-1 calm down', d: 'Use your senses to feel calmer, step by step.', href: '#/crisis/ground', icon: '🖐️' }
  ];
  MT.registerSearch(function (q) {
    var terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean), out = [];
    if (!terms.length) return out;
    FA.cards.forEach(function (c) {
      var hay = cardHay(c);
      if (terms.every(function (w) { return hay.indexOf(w) >= 0; })) out.push({ title: t('First aid: {topic}', { topic: t(c.title) }), description: t(c.summary), href: '#/first-aid/' + c.id, icon: c.icon, score: hay.indexOf(terms[0]) < 40 ? 2 : 20 });
    });
    EXTRA_SEARCH.forEach(function (x) {
      var hay = (x.k + ' ' + x.title + ' ' + t(x.title)).toLowerCase();
      if (terms.every(function (w) { return hay.indexOf(w) >= 0; })) out.push({ title: t(x.title), description: t(x.d), href: x.href, icon: x.icon, score: 10 });
    });
    return out;
  });
})();

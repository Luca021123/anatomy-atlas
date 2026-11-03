/* ==========================================================================
   Obstetrics — pregnancy dating tool (clinician suite). Package C3.

   This file has two halves:
   1) Pure dating logic (no DOM): exported to Node as module.exports and in the
      browser as MTLib.obstetrics, so it can be unit-tested.
   2) The UI, registered with MT.registerTool only when MT exists.

   Sources
   - Naegele's rule: EDD = LMP + 280 days (40 w), adjusted by (cycle length - 28) days.
   - ACOG Committee Opinion No. 700 (May 2017): Methods for Estimating the Due
     Date. Obstet Gynecol 2017;129:e150-4. Conception date / IVF transfer rules
     (EDD = transfer + 266 days - embryo age: day-5 +261, day-3 +263) and the
     redating discrepancy thresholds.
   - Robinson HP, Fleming JEE. A critical evaluation of sonar "crown-rump length"
     measurements. Br J Obstet Gynaecol 1975;82:702-710:
     GA(days) = 8.052 x sqrt(CRL mm) + 23.73. CRL dating is used up to 84 mm
     (about 14 0/7 w), per ACOG CO 700.
   - WHO recommendations on antenatal care for a positive pregnancy experience
     (2016): 8 contacts - first contact up to 12 weeks, then 20, 26, 30, 34, 36,
     38 and 40 weeks. (Exact weeks from WHO 2016 recommendation table; the
     search tooling returned only the 8-contact structure, so confirm against the
     WHO document and adapt to national schedules.)
   - Trimester boundaries: ACOG/WHO usage - 1st to 13 6/7 w, 2nd 14 0/7-27 6/7 w,
     3rd from 28 0/7 w. Term definitions: ACOG CO 579 (2013) - early term 37 0/7,
     full term 39 0/7, late term 41 0/7, post-term 42 0/7.
   - Anomaly scan 18-22 w, OGTT 24-28 w (WHO 2013 / IADPSG diagnostic window),
     anti-D prophylaxis at 28 w for Rh-negative women (RCOG Green-top 22; NICE
     TA156 offers 28 and 34 w - programmes differ), 41 w post-dates review
     (NICE NG207 offers induction 41+0 to 42+0 w).
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else {
    (root.MTLib = root.MTLib || {}).obstetrics = lib;
    if (typeof root.MT !== 'undefined' && root.MT.registerTool && root.document) lib.registerUI(root.MT);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------ date helpers ---------------------------- */
  // Dates are 'YYYY-MM-DD' strings; arithmetic is done on UTC day numbers so
  // daylight-saving shifts can never move a result by a day.
  function toDay(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var chk = new Date(t);
    if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
    return Math.round(t / 864e5);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fromDay(n) {
    var d = new Date(n * 864e5);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(ymd, n) { var d = toDay(ymd); return d == null ? null : fromDay(d + n); }
  function diffDays(a, b) { var A = toDay(a), B = toDay(b); return (A == null || B == null) ? NaN : B - A; }

  /* ------------------------------ EDD methods ----------------------------- */
  /** Naegele with cycle adjustment: LMP + 280 + (cycle - 28). Cycle 21-45 d accepted. */
  function eddFromLMP(lmp, cycleDays) {
    var c = cycleDays == null || cycleDays === '' ? 28 : +cycleDays;
    if (!isFinite(c) || c < 21 || c > 45) return null;
    return addDays(lmp, 280 + (Math.round(c) - 28));
  }
  /** Conception date (known ovulation / insemination): +266 days. */
  function eddFromConception(conception) { return addDays(conception, 266); }
  /** IVF transfer: EDD = transfer + 266 - embryo age (day-5 → +261, day-3 → +263). */
  function eddFromIVF(transfer, embryoDay) {
    var e = +embryoDay;
    if ([3, 5, 6].indexOf(e) < 0) return null;          // day 6 blastocyst → +260
    return addDays(transfer, 266 - e);
  }
  /** Robinson & Fleming 1975. Returns gestational age in days (float) for CRL in mm. */
  function gaDaysFromCRL(crlMm) {
    if (!isFinite(crlMm) || crlMm <= 0) return null;
    return 8.052 * Math.sqrt(crlMm) + 23.73;
  }
  /** EDD from first-trimester CRL measured on scanDate. */
  function eddFromCRL(crlMm, scanDate) {
    var g = gaDaysFromCRL(crlMm);
    if (g == null) return null;
    return addDays(scanDate, 280 - Math.round(g));
  }
  /** Gestational age on `onDate` for a given EDD: {days, weeks, rem, text} */
  function gaOn(edd, onDate) {
    var d = diffDays(onDate, edd);
    if (isNaN(d)) return null;
    var days = 280 - d;
    return gaFromDays(days);
  }
  function gaFromDays(days) {
    var neg = days < 0;
    var a = Math.abs(days);
    var w = Math.floor(a / 7), r = a % 7;
    return { days: days, weeks: neg ? -w : w, rem: r, text: (neg ? '-' : '') + w + '+' + r };
  }
  function trimester(gaDays) {
    if (gaDays < 0) return 0;
    if (gaDays < 14 * 7) return 1;
    if (gaDays < 28 * 7) return 2;
    return 3;
  }

  /* -------------------------- ACOG CO 700 redating ------------------------ */
  // Discrepancy (days) between LMP-based GA and ultrasound-based GA above which the
  // EDD should be changed to the ultrasound EDD, by ultrasound GA at the scan.
  var REDATE_BANDS = [
    { fromDays: 0,   toDays: 62,       label: '≤ 8 6/7 weeks',       thresholdDays: 5,  method: 'CRL' },
    { fromDays: 63,  toDays: 97,       label: '9 0/7 – 13 6/7 weeks', thresholdDays: 7,  method: 'CRL' },
    { fromDays: 98,  toDays: 111,      label: '14 0/7 – 15 6/7 weeks', thresholdDays: 7,  method: 'biometry' },
    { fromDays: 112, toDays: 153,      label: '16 0/7 – 21 6/7 weeks', thresholdDays: 10, method: 'biometry' },
    { fromDays: 154, toDays: 195,      label: '22 0/7 – 27 6/7 weeks', thresholdDays: 14, method: 'biometry' },
    { fromDays: 196, toDays: Infinity, label: '28 0/7 weeks and beyond', thresholdDays: 21, method: 'biometry' }
  ];
  function redateBand(usGaDays) {
    for (var i = 0; i < REDATE_BANDS.length; i++) if (usGaDays >= REDATE_BANDS[i].fromDays && usGaDays <= REDATE_BANDS[i].toDays) return REDATE_BANDS[i];
    return null;
  }
  /**
   * Compare LMP dating with ultrasound dating (ACOG CO 700).
   * opts = { lmpEdd, usEdd, scanDate, lmpCertain }
   * Returns { lmpGaDays, usGaDays, discrepancyDays, band, thresholdDays, redate, keepEdd, finalEdd, source, reason }
   * Rules: ultrasound GA picks the band; if |difference| > threshold → use ultrasound EDD;
   * otherwise keep LMP EDD. If LMP is uncertain/unknown → ultrasound EDD.
   */
  function redating(opts) {
    var usGa = gaOn(opts.usEdd, opts.scanDate);
    if (!usGa) return null;
    var out = { usGaDays: usGa.days, band: redateBand(usGa.days) };
    if (!opts.lmpEdd || opts.lmpCertain === false) {
      out.lmpGaDays = null; out.discrepancyDays = null; out.thresholdDays = out.band ? out.band.thresholdDays : null;
      out.redate = true; out.keepEdd = false; out.finalEdd = opts.usEdd; out.source = 'ultrasound';
      out.reason = 'LMP unknown or uncertain: use the ultrasound EDD.';
      return out;
    }
    var lmpGa = gaOn(opts.lmpEdd, opts.scanDate);
    out.lmpGaDays = lmpGa.days;
    out.discrepancyDays = Math.abs(lmpGa.days - usGa.days);
    out.signedDiffDays = usGa.days - lmpGa.days;       // + : scan is ahead of dates
    out.thresholdDays = out.band ? out.band.thresholdDays : null;
    if (out.band && out.discrepancyDays > out.band.thresholdDays) {
      out.redate = true; out.keepEdd = false; out.finalEdd = opts.usEdd; out.source = 'ultrasound';
      out.reason = 'Difference of ' + out.discrepancyDays + ' days exceeds the ' + out.band.thresholdDays + '-day threshold for ' + out.band.label + ': redate to the ultrasound EDD.';
    } else {
      out.redate = false; out.keepEdd = true; out.finalEdd = opts.lmpEdd; out.source = 'LMP';
      out.reason = 'Difference of ' + out.discrepancyDays + ' days is within the ' + (out.band ? out.band.thresholdDays : '?') + '-day threshold for ' + (out.band ? out.band.label : '?') + ': keep the LMP EDD.';
    }
    return out;
  }

  /* ----------------------------- milestone list --------------------------- */
  // WHO 2016 ANC contacts (weeks of gestation). Contact 1 is "up to 12 weeks".
  var ANC_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40];
  /**
   * Timeline of key dates from the final EDD.
   * opts = { rhNegative:boolean }
   * Each item: { id, label, kind:'anc'|'scan'|'test'|'drug'|'term'|'edd', fromWeeks, toWeeks, from, to, note }
   * `from`/`to` are dates (YYYY-MM-DD); ranges for windows, equal for single dates.
   */
  function timeline(edd, opts) {
    opts = opts || {};
    var start = addDays(edd, -280);
    if (!start) return [];
    function at(w, d) { return addDays(start, w * 7 + (d || 0)); }
    var items = [];
    ANC_WEEKS.forEach(function (w, i) {
      items.push({ id: 'anc' + (i + 1), kind: 'anc', label: 'WHO ANC contact ' + (i + 1) + (i === 0 ? ' (by ' + w + ' weeks)' : ' (' + w + ' weeks)'),
        fromWeeks: i === 0 ? 0 : w, toWeeks: w, from: i === 0 ? start : at(w), to: at(w),
        note: i === 0 ? 'First contact should be within the first 12 weeks.' : 'WHO 2016 schedule: contact at ' + w + ' weeks.' });
    });
    items.push({ id: 'anomaly', kind: 'scan', label: 'Anomaly scan', fromWeeks: 18, toWeeks: 22, from: at(18), to: at(22, 6), note: 'Detailed fetal anatomy scan, 18+0 to 22+6 weeks.' });
    items.push({ id: 'ogtt', kind: 'test', label: 'Oral glucose tolerance test (gestational diabetes)', fromWeeks: 24, toWeeks: 28, from: at(24), to: at(28, 6), note: 'Offer at 24–28 weeks (earlier if high risk, per local protocol).' });
    if (opts.rhNegative) items.push({ id: 'antid', kind: 'drug', label: 'Anti-D immunoglobulin (Rh-negative)', fromWeeks: 28, toWeeks: 28, from: at(28), to: at(28), note: 'Routine antenatal prophylaxis from 28 weeks; some programmes add a second dose at 34 weeks. Also after sensitising events.' });
    items.push({ id: 'term', kind: 'term', label: 'Term reached (early term)', fromWeeks: 37, toWeeks: 37, from: at(37), to: at(37), note: '37+0 weeks: no longer preterm.' });
    items.push({ id: 'edd', kind: 'edd', label: 'Estimated due date', fromWeeks: 40, toWeeks: 40, from: edd, to: edd, note: '40+0 weeks. Only about 4–5% of babies are born on the EDD.' });
    items.push({ id: 'postdates', kind: 'term', label: 'Post-dates review (41 weeks)', fromWeeks: 41, toWeeks: 41, from: at(41), to: at(41), note: 'Review for induction options at 41+0 weeks.' });
    items.sort(function (a, b) { return toDay(a.from) - toDay(b.from) || a.toWeeks - b.toWeeks; });
    return items;
  }

  /** Whole summary for a date of interest. */
  function summary(edd, today, opts) {
    var ga = gaOn(edd, today);
    if (!ga) return null;
    var tm = trimester(ga.days);
    return {
      edd: edd, today: today, ga: ga, trimester: tm,
      daysToEdd: diffDays(today, edd), progress: Math.max(0, Math.min(1, ga.days / 280)),
      lmpEquivalent: addDays(edd, -280), timeline: timeline(edd, opts)
    };
  }

  var logic = {
    toDay: toDay, fromDay: fromDay, addDays: addDays, diffDays: diffDays,
    eddFromLMP: eddFromLMP, eddFromConception: eddFromConception, eddFromIVF: eddFromIVF,
    gaDaysFromCRL: gaDaysFromCRL, eddFromCRL: eddFromCRL, gaOn: gaOn, gaFromDays: gaFromDays, trimester: trimester,
    REDATE_BANDS: REDATE_BANDS, redateBand: redateBand, redating: redating,
    ANC_WEEKS: ANC_WEEKS, timeline: timeline, summary: summary
  };

  /* ================================== UI ================================== */
  logic.registerUI = function (MT) {
    var h = MT.h;
    var KEY = 'clinician.obstetrics.state';
    MT.css('ob', [
      '.ob-bar{height:14px;border-radius:999px;background:var(--surface-3);overflow:hidden;position:relative}',
      '.ob-bar>span{display:block;height:100%;background:var(--accent);border-radius:999px}',
      '.ob-tri{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-top:4px}',
      '.ob-big{font-size:2.4rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}',
      '.ob-tl{list-style:none;margin:0;padding:0}',
      '.ob-tl li{display:grid;grid-template-columns:116px 1fr;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--border)}',
      '.ob-tl li:last-child{border-bottom:0}',
      '.ob-tl .ob-d{font-weight:700;font-variant-numeric:tabular-nums}',
      '.ob-tl .ob-d small{display:block;font-weight:500;color:var(--muted)}',
      '.ob-tl .past{opacity:.6}',
      '.ob-tl .now .ob-d{color:var(--accent-text)}',
      '.ob-tl .ob-l{font-weight:600}',
      '.ob-tl .ob-n{color:var(--muted);font-size:.86rem;grid-column:2}',
      '@media (max-width:480px){.ob-tl li{grid-template-columns:1fr}.ob-tl .ob-n{grid-column:1}}',
      '.ob-cmp td,.ob-cmp th{white-space:normal}.ob-print{display:none}@media print{.ob-screen{display:none!important}.ob-print{display:block!important}}'
    ].join(''));

    function load() {
      var s = MT.store.get(KEY, null);
      return (s && s.v === 1) ? s : { v: 1, method: 'lmp', lmp: '', cycle: '28', conception: '', transfer: '', embryo: '5', crl: '', scan: '', lmpCertain: true, rh: false, ref: '', useUs: 'auto' };
    }

    MT.registerTool({
      id: 'obstetrics', title: 'Pregnancy dating', category: 'obstetrics', icon: '🤰', order: 1,
      description: 'Estimated due date from LMP, conception, IVF transfer or first-trimester CRL, with ACOG redating rules, gestational age today and an antenatal timeline.',
      keywords: ['edd', 'due date', 'lmp', 'naegele', 'crl', 'gestational age', 'antenatal', 'anc', 'ivf', 'redating', 'pregnancy', 'obstetrics', 'anti-d', 'ogtt'],
      render: function (container) {
        var st = load();
        var out = h('div', { 'aria-live': 'polite' });
        var inputsHost = h('div.stack-sm');
        var printable = h('div.stack.ob-print');

        function save() { MT.store.set(KEY, st); }
        function field(label, attrs, hint, key) {
          var id = MT.uid('ob');
          var inp = h('input', Object.assign({ id: id, value: st[key] == null ? '' : st[key], oninput: function () { st[key] = inp.value; save(); compute(); } }, attrs));
          return h('div.field', h('label', { for: id }, label), inp, hint ? h('div.hint', hint) : null);
        }
        function buildInputs() {
          MT.clear(inputsHost);
          var methods = [{ value: 'lmp', label: 'LMP' }, { value: 'conception', label: 'Conception' }, { value: 'ivf', label: 'IVF transfer' }, { value: 'crl', label: 'Scan (CRL)' }];
          inputsHost.appendChild(h('div.field', h('div.field-label', 'Dating method'), MT.ui.segmented(methods, st.method, function (v) { st.method = v; save(); buildInputs(); compute(); })));
          var grid = h('div.form-grid');
          if (st.method === 'lmp') {
            grid.appendChild(field('First day of last menstrual period', { type: 'date' }, 'Only use if the date is certain and the cycle was regular.', 'lmp'));
            grid.appendChild(field('Average cycle length (days)', { type: 'number', min: 21, max: 45, inputmode: 'numeric' }, 'Naegele assumes 28 days; the EDD shifts by (cycle − 28) days.', 'cycle'));
          } else if (st.method === 'conception') {
            grid.appendChild(field('Date of conception / ovulation', { type: 'date' }, 'EDD = conception + 266 days (ACOG CO 700).', 'conception'));
          } else if (st.method === 'ivf') {
            grid.appendChild(field('Embryo transfer date', { type: 'date' }, null, 'transfer'));
            var id = MT.uid('ob');
            var sel = h('select', { id: id, onchange: function () { st.embryo = sel.value; save(); compute(); } },
              [['3', 'Day-3 embryo (EDD = transfer + 263 d)'], ['5', 'Day-5 blastocyst (EDD = transfer + 261 d)'], ['6', 'Day-6 blastocyst (EDD = transfer + 260 d)']].map(function (o) { return h('option', { value: o[0], selected: st.embryo === o[0] }, o[1]); }));
            grid.appendChild(h('div.field', h('label', { for: id }, 'Embryo age at transfer'), sel));
          } else {
            grid.appendChild(field('Crown–rump length (mm)', { type: 'number', min: 1, max: 84, step: '0.1', inputmode: 'decimal' }, 'First-trimester CRL up to 84 mm. Robinson & Fleming 1975.', 'crl'));
            grid.appendChild(field('Date of scan', { type: 'date' }, null, 'scan'));
            grid.appendChild(field('LMP (optional, for the redating check)', { type: 'date' }, 'Enter to compare with the scan using ACOG redating thresholds.', 'lmp'));
            grid.appendChild(field('Average cycle length (days)', { type: 'number', min: 21, max: 45, inputmode: 'numeric' }, null, 'cycle'));
            var cid = MT.uid('ob');
            var cb = h('input', { type: 'checkbox', id: cid, checked: !!st.lmpCertain, onchange: function () { st.lmpCertain = cb.checked; save(); compute(); } });
            grid.appendChild(h('label.check', { for: cid }, cb, h('span', 'LMP is certain and the cycle regular')));
          }
          inputsHost.appendChild(grid);
          var rid = MT.uid('ob');
          var rb = h('input', { type: 'checkbox', id: rid, checked: !!st.rh, onchange: function () { st.rh = rb.checked; save(); compute(); } });
          inputsHost.appendChild(h('label.check', { for: rid }, rb, h('span', 'Rh(D)-negative (adds the anti-D timeline item)')));
          inputsHost.appendChild(field('Patient reference (optional, initials or ID only)', { type: 'text', maxlength: 24, autocomplete: 'off' }, 'Printed on the summary. Use initials, not a full name.', 'ref'));
        }

        function fmtDate(ymd) { return MT.formatDate(ymd, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }); }
        function fmtShort(ymd) { return MT.formatDate(ymd, { month: 'short', day: 'numeric' }); }

        function compute() {
          MT.clear(out); MT.clear(printable);
          var today = MT.today();
          var edd = null, how = '', redo = null, warns = [];
          if (st.method === 'lmp') {
            edd = eddFromLMP(st.lmp, st.cycle); how = 'Naegele’s rule (LMP + 280 days' + ((+st.cycle || 28) !== 28 ? ', adjusted ' + ((+st.cycle) - 28 > 0 ? '+' : '') + ((+st.cycle) - 28) + ' d for a ' + st.cycle + '-day cycle' : '') + ')';
          } else if (st.method === 'conception') {
            edd = eddFromConception(st.conception); how = 'Conception date + 266 days';
          } else if (st.method === 'ivf') {
            edd = eddFromIVF(st.transfer, st.embryo); how = 'IVF transfer date + 266 − embryo age (' + st.embryo + ' d)';
          } else {
            var crl = MT.num(st.crl);
            if (crl != null && crl > 84) warns.push('CRL above 84 mm: CRL dating is not reliable beyond about 14 weeks; use head circumference / biometry.');
            if (crl != null && crl < 2) warns.push('CRL under 2 mm is below the useful range of the formula.');
            var usEdd = (crl && st.scan) ? eddFromCRL(crl, st.scan) : null;
            var lmpEdd = st.lmp ? eddFromLMP(st.lmp, st.cycle) : null;
            if (usEdd) {
              redo = redating({ lmpEdd: lmpEdd, usEdd: usEdd, scanDate: st.scan, lmpCertain: st.lmpCertain });
              edd = redo.finalEdd;
              how = redo.source === 'ultrasound' ? 'Ultrasound CRL (Robinson & Fleming 1975)' : 'LMP (Naegele) — confirmed by ultrasound within ACOG threshold';
            }
          }
          if (!edd) {
            out.appendChild(h('div.result.empty', 'Enter the dates above to calculate the due date.'));
            return;
          }
          var s = summary(edd, today, { rhNegative: st.rh });
          if (!s) return;
          var ga = s.ga;
          if (ga.days < 0) warns.push('The date of interest is before the estimated start of the pregnancy; check the dates.');
          if (ga.days > 301) warns.push('More than 43 weeks by these dates; verify the dates.');
          var tmNames = ['Not yet pregnant (check dates)', 'First trimester', 'Second trimester', 'Third trimester'];

          var head = h('div.result.band-ok',
            h('div.result-label', 'Estimated due date'),
            h('div.ob-big', fmtDate(edd)),
            h('div.small.muted', how));
          out.appendChild(head);
          var gaBox = h('div.card', { style: 'margin-top:12px' },
            h('div.row.row-between',
              h('div', h('div.muted.small', 'Gestational age today (' + fmtShort(today) + ')'), h('div.ob-big', ga.days >= 0 ? ga.weeks + ' weeks ' + ga.rem + ' days' : '—')),
              h('div', { style: 'text-align:right' }, MT.ui.badge(tmNames[s.trimester], 'accent'), h('div.small.muted', { style: 'margin-top:6px' }, s.daysToEdd >= 0 ? s.daysToEdd + ' days to EDD' : Math.abs(s.daysToEdd) + ' days past EDD'))),
            h('div.ob-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 280, 'aria-valuenow': Math.max(0, Math.min(280, ga.days)), 'aria-label': 'Progress through 40 weeks' }, h('span', { style: 'width:' + Math.round(s.progress * 100) + '%' })),
            h('div.ob-tri', h('span', 'T1 → 13+6'), h('span', 'T2 14+0 → 27+6'), h('span', 'T3 28+0 → 40')));
          out.appendChild(gaBox);
          warns.forEach(function (w) { out.appendChild(h('div', { style: 'margin-top:12px' }, MT.ui.alert('warn', 'Check', w))); });

          if (redo) {
            var cmpRows = [];
            cmpRows.push(h('tr', h('th', { scope: 'row' }, 'GA at scan by ultrasound'), h('td', gaFromDays(Math.round(redo.usGaDays)).text + ' (' + MT.fmt(redo.usGaDays, 1) + ' days)')));
            if (redo.lmpGaDays != null) cmpRows.push(h('tr', h('th', { scope: 'row' }, 'GA at scan by LMP'), h('td', gaFromDays(redo.lmpGaDays).text)));
            if (redo.discrepancyDays != null) cmpRows.push(h('tr', h('th', { scope: 'row' }, 'Discrepancy'), h('td', redo.discrepancyDays + ' days (scan ' + (redo.signedDiffDays >= 0 ? 'ahead of' : 'behind') + ' dates)')));
            cmpRows.push(h('tr', h('th', { scope: 'row' }, 'ACOG threshold'), h('td', (redo.band ? redo.band.label + ': > ' + redo.thresholdDays + ' days' : '—'))));
            out.appendChild(h('div.card', { style: 'margin-top:12px' },
              h('h3', { style: 'margin-top:0' }, 'ACOG redating check'),
              h('div.table-wrap', h('table.table.ob-cmp', h('tbody', cmpRows))),
              MT.ui.alert(redo.redate ? 'warn' : 'ok', redo.redate ? 'Use the ultrasound EDD' : 'Keep the LMP EDD', redo.reason),
              h('p.small.muted', 'ACOG Committee Opinion 700 (2017). A pregnancy without an ultrasound confirming or revising the EDD before 22 0/7 weeks is considered suboptimally dated. Once the EDD is set, change it only in rare circumstances, with the patient informed and the reason documented.')));
          }

          // timeline
          var tlItems = s.timeline.map(function (it) {
            var isRange = it.from !== it.to;
            var past = diffDays(it.to, today) > 0;
            var now = !past && diffDays(it.from, today) >= 0;
            var dateTxt = isRange ? fmtShort(it.from) + ' – ' + fmtShort(it.to) : fmtShort(it.to);
            var rel = past ? 'done / past' : now ? 'now' : 'in ' + diffDays(today, it.from) + ' d';
            return h('li', { class: past ? 'past' : now ? 'now' : '' },
              h('div.ob-d', dateTxt, h('small', (it.fromWeeks === it.toWeeks || it.id === 'anc1' ? (it.id === 'anc1' ? '≤ 12 w' : it.toWeeks + ' w') : it.fromWeeks + '–' + it.toWeeks + ' w') + ' · ' + rel)),
              h('div.ob-l', it.label),
              h('div.ob-n', it.note));
          });
          out.appendChild(h('div.card', { style: 'margin-top:12px' }, h('h3', { style: 'margin-top:0' }, 'Key dates'), h('ul.ob-tl', tlItems)));

          // printable summary
          printable.appendChild(h('h2', 'Pregnancy dating summary'));
          printable.appendChild(h('p', 'Printed ' + MT.formatDate(today) + (st.ref ? ' · Ref: ' + st.ref : '')));
          printable.appendChild(h('dl.kv', h('dt', 'Method'), h('dd', how), h('dt', 'EDD'), h('dd', fmtDate(edd)), h('dt', 'Gestational age'), h('dd', ga.weeks + '+' + ga.rem + ' weeks on ' + MT.formatDate(today)), h('dt', 'Trimester'), h('dd', tmNames[s.trimester]), h('dt', 'Start of pregnancy (LMP equivalent)'), h('dd', fmtDate(s.lmpEquivalent))));
          if (redo) printable.appendChild(h('p', 'Redating check (ACOG CO 700): ' + redo.reason));
          printable.appendChild(h('table.table', h('thead', h('tr', h('th', 'Date'), h('th', 'Item'))), h('tbody', s.timeline.map(function (it) { return h('tr', h('td', it.from !== it.to ? fmtShort(it.from) + ' – ' + fmtShort(it.to) : fmtShort(it.to)), h('td', it.label)); }))));
          printable.appendChild(h('p.small', 'Sources: Naegele’s rule; ACOG CO 700 (2017); Robinson & Fleming 1975; WHO ANC 2016. Decision support only; confirm against local protocol.'));

          var copyTxt = ['Pregnancy dating' + (st.ref ? ' (' + st.ref + ')' : ''), 'Method: ' + how, 'EDD: ' + edd, 'GA on ' + today + ': ' + ga.weeks + '+' + ga.rem + ' weeks', redo ? 'Redating: ' + redo.reason : null].filter(Boolean).join('\n');
          out.appendChild(h('div.row.no-print', { style: 'margin-top:12px' },
            h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.print(container); } }, '🖨 Print summary'),
            h('button.btn', { type: 'button', onclick: function () { MT.copy(copyTxt); } }, 'Copy summary')));
        }

        container.appendChild(printable);
        container.appendChild(h('div.split.ob-screen', { style: 'align-items:start' },
          h('div.card', h('h2', { style: 'margin-top:0;font-size:1.1rem' }, 'Dating'), inputsHost),
          out));
        container.appendChild(h('div.stack.ob-screen', { style: 'margin-top:16px' },
          h('details.disclosure', h('summary', 'Sources and method'), h('div.disclosure-body',
            h('ul', [
              h('li', 'Naegele’s rule: EDD = LMP + 280 days, shifted by (cycle length − 28) days.'),
              h('li', 'Conception date + 266 days; IVF transfer + 266 − embryo age (day-3 +263, day-5 +261, day-6 +260). ACOG Committee Opinion 700 (2017).'),
              h('li', 'CRL: Robinson & Fleming 1975, GA (days) = 8.052 × √CRL(mm) + 23.73; valid for CRL up to 84 mm.'),
              h('li', 'Redating thresholds by ultrasound GA: ≤ 8 6/7 w > 5 d; 9 0/7–13 6/7 w > 7 d; 14 0/7–15 6/7 w > 7 d; 16 0/7–21 6/7 w > 10 d; 22 0/7–27 6/7 w > 14 d; ≥ 28 0/7 w > 21 d (ACOG CO 700).'),
              h('li', 'Antenatal contacts: WHO 2016 model, eight contacts (up to 12, then 20, 26, 30, 34, 36, 38 and 40 weeks). Adapt to your national schedule.'),
              h('li', 'Anti-D at 28 weeks (some programmes also give a dose at 34 weeks), OGTT at 24–28 weeks and anomaly scan at 18–22 weeks follow common national guidance; check local protocol.')]))),
          MT.ui.disclaimer('Dating tool for clinicians. Dates held only in this browser; use initials or an ID, not a full name.')));
        buildInputs(); compute();
      }
    });
  };

  return logic;
});

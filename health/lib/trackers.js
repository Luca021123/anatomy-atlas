/* Salus — daily coach trackers: pure logic (MTLib.trackers).
 * No DOM, no MT. Dates are local 'YYYY-MM-DD' strings; times are 'HH:MM'.
 * Functions return codes/ids, never user-facing prose; the UI (tools/coach.js) wraps text in MT.t().
 *
 * Sources (named in the UI too):
 *  - Home BP: ESH 2023 hypertension guideline (Mancia, J Hypertens 2023) and 2025 AHA/ACC guideline
 *    (Jones, Circulation 2025): home hypertension threshold 135/85 mmHg; measure after 5 min seated rest,
 *    2 readings 1 min apart morning and evening for 7 days (minimum 3), discard day 1, average the rest.
 *  - BP crisis: AHA public guidance. >=180 systolic and/or >=120 diastolic: rest 5 min and re-check; if still
 *    this high WITH symptoms (chest pain, breathlessness, weakness/numbness, vision or speech change, severe
 *    headache, confusion) call emergency services; WITHOUT symptoms contact a health worker the same day.
 *  - Pregnancy: ACOG/NICE: >=140/90 same-day contact with midwife or doctor; >=160/110 treat as urgent.
 *  - Sleep regularity: Phillips et al., Sci Rep 2017 (Sleep Regularity Index); Windred et al., Sleep 2024.
 *    The diary version here is an APPROXIMATION on a 15-minute grid and is not validated against actigraphy.
 *  - Social jetlag: Roenneberg et al., Curr Biol 2006 (|mid-sleep free days - mid-sleep work days|).
 *  - CBT-I first line: Qaseem et al., Ann Intern Med 2016 (ACP); Riemann et al., J Sleep Res 2023 (ESRS).
 *  - Caffeine 6 h before bed: Drake et al., J Clin Sleep Med 2013.
 *  - Slow breathing: Balban et al., Cell Reports Medicine 2023 (cyclic sighing, 5 min/day).
 *  - Steps: Ding et al., Lancet Public Health 2025. VILPA: Stamatakis et al., Nature Medicine 2022.
 *    WHO 2020 physical activity guidelines: 150-300 min moderate or 75-150 min vigorous per week
 *    (a vigorous minute counts as two moderate minutes), plus strengthening on 2 or more days.
 *  - Habits: Gollwitzer & Sheeran, Adv Exp Soc Psychol 2006 (if-then plans); Lally et al., Eur J Soc Psychol 2010.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).trackers = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- date helpers ---------------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseYmd(s) {
    var p = String(s || '').split('-').map(Number);
    if (p.length < 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(a, b) {
    var A = parseYmd(a), B = parseYmd(b);
    return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 864e5);
  }
  function dateOf(t) { var d = new Date(t); return isNaN(d) ? null : ymd(d); }
  /** Monday of the week containing the date (WHO/ISO week). */
  function weekStart(s) { var d = parseYmd(s); var wd = (d.getDay() + 6) % 7; return addDays(s, -wd); }
  function isWeekend(s) { var g = parseYmd(s).getDay(); return g === 0 || g === 6; }
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function fmtHM(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function fill(tpl, vars) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function sortBy(arr, f) { return arr.slice().sort(function (a, b) { var x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; }); }

  /* =====================================================================
     BLOOD PRESSURE
     ===================================================================== */
  var BP_LIMITS = { sysMin: 50, sysMax: 300, diaMin: 30, diaMax: 200, pulseMin: 20, pulseMax: 250 };
  var BP_HOME_HIGH = { sys: 135, dia: 85 };   // ESH 2023 / AHA 2025 home hypertension threshold
  var BP_CRISIS = { sys: 180, dia: 120 };     // AHA: hypertensive crisis threshold
  var BP_PROTOCOL = { days: 7, minUsableDays: 3, readingsPerSession: 2, sessionsPerDay: 2, discardDays: 1 };

  /** Plausibility check. Returns {ok, errors:[code], warnings:[code]}. Codes: sys-range, dia-range, pulse-range, dia-ge-sys, narrow-pp, wide-pp, swapped. */
  function validateBP(sys, dia, pulse) {
    var errors = [], warnings = [];
    if (!isNum(sys) || sys < BP_LIMITS.sysMin || sys > BP_LIMITS.sysMax) errors.push('sys-range');
    if (!isNum(dia) || dia < BP_LIMITS.diaMin || dia > BP_LIMITS.diaMax) errors.push('dia-range');
    if (pulse != null && pulse !== '' && (!isNum(pulse) || pulse < BP_LIMITS.pulseMin || pulse > BP_LIMITS.pulseMax)) errors.push('pulse-range');
    if (!errors.length) {
      if (dia >= sys) errors.push('dia-ge-sys');
      else {
        var pp = sys - dia;
        if (pp < 20) warnings.push('narrow-pp');
        if (pp > 100) warnings.push('wide-pp');
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function isCrisis(sys, dia) { return sys >= BP_CRISIS.sys || dia >= BP_CRISIS.dia; }

  /**
   * Classify a single reading or an average against home thresholds.
   * levels: 'low' (<90 or <60), 'normal' (<120 and <80), 'elevated' (below 135/85 but not normal),
   * 'high' (>=135 or >=85), 'crisis' (>=180 or >=120).
   */
  function classifyHome(sys, dia) {
    if (!isNum(sys) || !isNum(dia)) return null;
    if (isCrisis(sys, dia)) return 'crisis';
    if (sys >= BP_HOME_HIGH.sys || dia >= BP_HOME_HIGH.dia) return 'high';
    if (sys < 90 || dia < 60) return 'low';
    if (sys < 120 && dia < 80) return 'normal';
    return 'elevated';
  }

  /** Assess one reading for safety messaging. opts.pregnant adds pregnancy thresholds. */
  function assessReading(sys, dia, opts) {
    opts = opts || {};
    var level = classifyHome(sys, dia);
    var out = { level: level, crisis: level === 'crisis', pregnancyUrgent: false, pregnancyHigh: false };
    if (opts.pregnant) {
      if (sys >= 160 || dia >= 110) out.pregnancyUrgent = true;
      else if (sys >= 140 || dia >= 90) out.pregnancyHigh = true;
    }
    return out;
  }

  /** What to do for a crisis-level reading after the re-check. symptoms: boolean. Returns 'recheck' | 'emergency' | 'same-day'. */
  function crisisAdvice(rechecked, stillHigh, symptoms) {
    if (!rechecked) return symptoms ? 'emergency' : 'recheck';
    if (!stillHigh) return symptoms ? 'emergency' : 'normal';
    return symptoms ? 'emergency' : 'same-day';
  }

  /** Group readings by local date; returns [{date, readings:[...], sys, dia, n}] sorted by date (means rounded to 1 dp). */
  function dailyAverages(readings) {
    var by = {};
    (readings || []).forEach(function (r) {
      var d = dateOf(r.t); if (!d || !isNum(r.sys) || !isNum(r.dia)) return;
      (by[d] = by[d] || []).push(r);
    });
    return Object.keys(by).sort().map(function (d) {
      var L = by[d];
      return { date: d, readings: L, n: L.length, sys: Math.round(mean(L.map(function (r) { return r.sys; })) * 10) / 10, dia: Math.round(mean(L.map(function (r) { return r.dia; })) * 10) / 10 };
    });
  }

  function avgOf(list) {
    if (!list.length) return null;
    return { sys: Math.round(mean(list.map(function (r) { return r.sys; }))), dia: Math.round(mean(list.map(function (r) { return r.dia; }))), n: list.length,
      pulse: (function () { var p = list.filter(function (r) { return isNum(r.pulse); }); return p.length ? Math.round(mean(p.map(function (r) { return r.pulse; }))) : null; })() };
  }

  /**
   * Home BP protocol summary.
   * opts: { startDate, days = 7, minUsableDays = 3 }.
   * Window = [startDate, startDate + days - 1]. Day 1 (index 0) is discarded; days 2..N are averaged
   * (all readings, both sessions). Status: 'none' (nothing usable), 'provisional' (< minUsableDays usable days),
   * 'valid'. Without startDate the window ends on the newest reading's date (or starts at the oldest if shorter).
   */
  function bpProtocol(readings, opts) {
    opts = opts || {};
    var days = opts.days || BP_PROTOCOL.days, minDays = opts.minUsableDays || BP_PROTOCOL.minUsableDays;
    var good = (readings || []).filter(function (r) { return r && dateOf(r.t) && isNum(r.sys) && isNum(r.dia); });
    var start = opts.startDate;
    if (!start) {
      if (!good.length) return emptyProtocol(null, days);
      var dates = good.map(function (r) { return dateOf(r.t); }).sort();
      var latest = dates[dates.length - 1], earliest = dates[0];
      start = diffDays(earliest, latest) > days - 1 ? addDays(latest, -(days - 1)) : earliest;
    }
    var end = addDays(start, days - 1);
    var inWin = good.filter(function (r) { var d = dateOf(r.t); return d >= start && d <= end; });
    var dayList = [];
    for (var i = 0; i < days; i++) {
      var date = addDays(start, i);
      var L = inWin.filter(function (r) { return dateOf(r.t) === date; });
      var am = L.filter(function (r) { return r.session === 'am'; }).length, pm = L.filter(function (r) { return r.session === 'pm'; }).length;
      dayList.push({ date: date, index: i, discarded: i < BP_PROTOCOL.discardDays, count: L.length, am: am, pm: pm });
    }
    var used = inWin.filter(function (r) { return diffDays(start, dateOf(r.t)) >= BP_PROTOCOL.discardDays; });
    var usableDays = dayList.filter(function (d) { return !d.discarded && d.count > 0; }).length;
    var amUsed = used.filter(function (r) { return r.session === 'am'; }), pmUsed = used.filter(function (r) { return r.session === 'pm'; });
    var avg = avgOf(used);
    var expected = days * BP_PROTOCOL.sessionsPerDay * BP_PROTOCOL.readingsPerSession;
    var sessionsDone = dayList.reduce(function (n, d) { return n + (d.am >= 1 ? 1 : 0) + (d.pm >= 1 ? 1 : 0); }, 0);
    var status = !avg ? 'none' : usableDays >= minDays ? 'valid' : 'provisional';
    return {
      startDate: start, endDate: end, days: days, dayList: dayList,
      total: inWin.length, expected: expected, completeness: Math.min(1, inWin.length / expected),
      sessionsDone: sessionsDone, sessionsExpected: days * BP_PROTOCOL.sessionsPerDay,
      usableDays: usableDays, neededDays: Math.max(0, minDays - usableDays),
      avg: avg, am: avgOf(amUsed), pm: avgOf(pmUsed),
      status: status, complete: usableDays === days - BP_PROTOCOL.discardDays,
      classification: avg ? classifyHome(avg.sys, avg.dia) : null,
      homeHigh: avg ? (avg.sys >= BP_HOME_HIGH.sys || avg.dia >= BP_HOME_HIGH.dia) : null
    };
  }
  function emptyProtocol(start, days) {
    return { startDate: start, endDate: start ? addDays(start, days - 1) : null, days: days, dayList: [], total: 0, expected: days * 4, completeness: 0, sessionsDone: 0, sessionsExpected: days * 2, usableDays: 0, neededDays: BP_PROTOCOL.minUsableDays, avg: null, am: null, pm: null, status: 'none', complete: false, classification: null, homeHigh: null };
  }

  /** Which sessions are still due today for a measurement week. Returns {active, dayIndex, am:boolean(done), pm:boolean(done)}. */
  function bpDueToday(readings, startDate, today, days) {
    days = days || BP_PROTOCOL.days;
    if (!startDate) return { active: false };
    var idx = diffDays(startDate, today);
    if (idx < 0 || idx > days - 1) return { active: false, finished: idx > days - 1 };
    var L = (readings || []).filter(function (r) { return dateOf(r.t) === today; });
    return { active: true, dayIndex: idx, amDone: L.some(function (r) { return r.session === 'am'; }), pmDone: L.some(function (r) { return r.session === 'pm'; }), discarded: idx < BP_PROTOCOL.discardDays };
  }

  /** Calendar events for a measurement week. opts: {amTime,pmTime,days,titleTemplate,descTemplate}. Templates use {session} and {day}. */
  function bpReminderEvents(startDate, opts) {
    opts = opts || {};
    var days = opts.days || BP_PROTOCOL.days, out = [];
    var sessions = [{ id: 'am', time: opts.amTime || '07:30', label: opts.amLabel || 'morning' }, { id: 'pm', time: opts.pmTime || '19:30', label: opts.pmLabel || 'evening' }];
    for (var i = 0; i < days; i++) {
      var date = addDays(startDate, i), base = parseYmd(date);
      sessions.forEach(function (s) {
        var m = parseHM(s.time); if (m == null) return;
        var st = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(m / 60), m % 60);
        out.push({
          uid: 'salus-bp-' + date + '-' + s.id, start: st, durationMin: 10, alarmMin: 0,
          title: fill(opts.titleTemplate || 'Blood pressure ({session}, day {day})', { session: s.label, day: i + 1 }),
          description: fill(opts.descTemplate || 'Sit quietly for 5 minutes. Take 2 readings 1 minute apart. Write them in Salus.', { session: s.label, day: i + 1 })
        });
      });
    }
    return out;
  }

  /* =====================================================================
     SLEEP
     ===================================================================== */
  /** Minutes slept between bedtime and wake time, across midnight. null if invalid or equal. */
  function sleepMinutes(bed, wake) {
    var b = parseHM(bed), w = parseHM(wake);
    if (b == null || w == null) return null;
    var d = (w - b + 1440) % 1440;
    return d === 0 ? null : d;
  }
  /** Mid-sleep as minutes after midnight (0..1439). */
  function midSleep(bed, wake) {
    var d = sleepMinutes(bed, wake); if (d == null) return null;
    return Math.round((parseHM(bed) + d / 2) % 1440);
  }
  /** Circular mean of clock minutes (0..1439). */
  function circMean(mins) {
    if (!mins.length) return null;
    var sx = 0, sy = 0;
    mins.forEach(function (m) { var a = m / 1440 * 2 * Math.PI; sx += Math.cos(a); sy += Math.sin(a); });
    var a = Math.atan2(sy, sx); if (a < 0) a += 2 * Math.PI;
    return Math.round(a / (2 * Math.PI) * 1440) % 1440;
  }
  function wrapDiff(a, b) { var d = ((a - b + 720) % 1440 + 1440) % 1440 - 720; return d; } // in [-720, 720)
  /** Circular standard deviation in minutes (root mean square of wrapped differences from the circular mean). */
  function circSD(mins) {
    if (mins.length < 2) return null;
    var m = circMean(mins);
    return Math.round(Math.sqrt(mean(mins.map(function (x) { var d = wrapDiff(x, m); return d * d; }))));
  }

  var BINS = 96; // 15-minute bins on a noon-to-noon "sleep day"
  /** Asleep (1) / awake (0) for 96 bins starting at 12:00. */
  function sleepBins(bed, wake) {
    var d = sleepMinutes(bed, wake), b = parseHM(bed), out = [];
    if (d == null) return null;
    for (var k = 0; k < BINS; k++) { var t = (720 + 15 * k) % 1440; out.push(((t - b + 1440) % 1440) < d ? 1 : 0); }
    return out;
  }

  /**
   * Diary-based Sleep Regularity Index approximation (after Phillips 2017):
   * for each pair of consecutive diary dates, the share of 15-minute bins in the same state (asleep/awake);
   * SRI = 200 * meanAgreement - 100, range -100..100 (100 = identical every day, 0 = random).
   * Uses entries from the last `window` days (default 14). Needs >= 4 consecutive-day pairs, else score null.
   */
  function sleepRegularity(entries, opts) {
    opts = opts || {};
    var win = opts.window || 14, minPairs = opts.minPairs || 4;
    var es = sortBy((entries || []).filter(function (e) { return e && e.date && sleepBins(e.bed, e.wake); }), function (e) { return e.date; });
    if (es.length) { var last = es[es.length - 1].date; es = es.filter(function (e) { return diffDays(e.date, last) < win; }); }
    var agree = [];
    for (var i = 1; i < es.length; i++) {
      if (diffDays(es[i - 1].date, es[i].date) !== 1) continue;
      var A = sleepBins(es[i - 1].bed, es[i - 1].wake), B = sleepBins(es[i].bed, es[i].wake), same = 0;
      for (var k = 0; k < BINS; k++) if (A[k] === B[k]) same++;
      agree.push(same / BINS);
    }
    if (agree.length < minPairs) return { score: null, pairs: agree.length, needPairs: minPairs, band: null };
    var score = Math.round(200 * mean(agree) - 100);
    return { score: score, pairs: agree.length, band: score >= 72 ? 'regular' : score >= 50 ? 'somewhat' : 'irregular' }; // 72 ~ Windred 2024 cut-off 71.6 (accelerometer SRI)
  }

  /** Is this diary entry a free (non-work) day? Uses entry.free if set, else Saturday/Sunday wake date. */
  function isFreeDay(e) { return e.free != null ? !!e.free : isWeekend(e.date); }

  /** Social jetlag (Roenneberg 2006, uncorrected): |mid-sleep on free days - mid-sleep on work days| in minutes. Needs >= 2 of each. */
  function socialJetlag(entries) {
    var free = [], work = [];
    (entries || []).forEach(function (e) {
      var m = midSleep(e.bed, e.wake); if (m == null) return;
      (isFreeDay(e) ? free : work).push(m);
    });
    if (free.length < 2 || work.length < 2) return { minutes: null, nFree: free.length, nWork: work.length };
    var msf = circMean(free), msw = circMean(work), d = wrapDiff(msf, msw);
    return { minutes: Math.abs(d), direction: d >= 0 ? 'later' : 'earlier', msf: msf, msw: msw, nFree: free.length, nWork: work.length };
  }

  /** Summary over the last n diary days up to `today`. */
  function sleepSummary(entries, today, n) {
    n = n || 7;
    var es = (entries || []).filter(function (e) { var d = diffDays(e.date, today); return d >= 0 && d < n && sleepMinutes(e.bed, e.wake) != null; });
    var durs = es.map(function (e) { return sleepMinutes(e.bed, e.wake); });
    var q = es.filter(function (e) { return isNum(e.quality); }).map(function (e) { return e.quality; });
    return {
      nights: es.length,
      avgMinutes: durs.length ? Math.round(mean(durs)) : null,
      avgQuality: q.length ? Math.round(mean(q) * 10) / 10 : null,
      avgBedtime: es.length ? circMean(es.map(function (e) { return parseHM(e.bed); })) : null,
      avgWake: es.length ? circMean(es.map(function (e) { return parseHM(e.wake); })) : null,
      bedtimeSD: es.length > 1 ? circSD(es.map(function (e) { return parseHM(e.bed); })) : null,
      midSleepSD: es.length > 1 ? circSD(es.map(function (e) { return midSleep(e.bed, e.wake); })) : null,
      lateCaffeineDays: es.filter(function (e) { var g = e.lastCaffeine ? sleepMinutes(e.lastCaffeine, e.bed) : null; return g != null && g < 360; }).length
    };
  }

  /** Flags from the screening checkboxes. Returns [{id, level:'warn'|'info'|'danger'}]. */
  function sleepFlags(a) {
    a = a || {}; var out = [];
    if ((a.snoring && a.sleepy) || a.witnessedApneas) out.push({ id: 'osa', level: 'warn' });
    if (a.troubleMonths >= 3) out.push({ id: 'insomnia-3mo', level: 'warn' });
    if (a.drowsyDriving) out.push({ id: 'drowsy-driving', level: 'danger' });
    if (a.avgMinutes != null && a.avgMinutes < 360) out.push({ id: 'short-sleep', level: 'info' });
    return out;
  }

  /* =====================================================================
     MOOD
     ===================================================================== */
  /** Daily average mood (1-5) from check-ins [{t|date, score}] for the last n days. */
  function moodDaily(entries, today, n) {
    n = n || 14; var by = {};
    (entries || []).forEach(function (e) {
      var d = e.date || dateOf(e.t); if (!d || !isNum(e.score)) return;
      var k = diffDays(d, today); if (k < 0 || k >= n) return;
      (by[d] = by[d] || []).push(e.score);
    });
    return Object.keys(by).sort().map(function (d) { return { date: d, score: Math.round(mean(by[d]) * 10) / 10, n: by[d].length }; });
  }
  /** Compare the last 7 days with the 7 before. Returns {recent, before, trend:'better'|'lower'|'steady'|null}. */
  function moodTrend(entries, today) {
    var all = moodDaily(entries, today, 14);
    var recent = all.filter(function (d) { return diffDays(d.date, today) < 7; }).map(function (d) { return d.score; });
    var before = all.filter(function (d) { return diffDays(d.date, today) >= 7; }).map(function (d) { return d.score; });
    var r = recent.length ? Math.round(mean(recent) * 10) / 10 : null, b = before.length ? Math.round(mean(before) * 10) / 10 : null;
    var trend = null;
    if (r != null && b != null) trend = r - b >= 0.5 ? 'better' : r - b <= -0.5 ? 'lower' : 'steady';
    return { recent: r, before: b, trend: trend };
  }
  /** True when mood was low (<= 2) on at least 7 of the last 14 days: a prompt to check in with someone (PHQ-9 in the health check). Not a diagnosis. */
  function lowMoodFlag(entries, today) {
    var lowDays = moodDaily(entries, today, 14).filter(function (d) { return d.score <= 2; }).length;
    return { flag: lowDays >= 7, lowDays: lowDays };
  }
  /** Behavioural activation: summary of rated activities [{done, before, after}]. */
  function activationSummary(acts) {
    var done = (acts || []).filter(function (a) { return a.done; });
    var rated = done.filter(function (a) { return isNum(a.before) && isNum(a.after); });
    return { planned: (acts || []).length, done: done.length, rated: rated.length, avgChange: rated.length ? Math.round(mean(rated.map(function (a) { return a.after - a.before; })) * 10) / 10 : null };
  }

  /* =====================================================================
     BREATHING
     Phase kinds: 'in' (inhale through the nose), 'in2' (a second short sip of air), 'hold', 'out'.
     `from`/`to` are the pacer size (0 small .. 1 large) at the start/end of the phase.
     ===================================================================== */
  var BREATH_PATTERNS = [
    { id: 'sigh', minutes: 5, phases: [{ kind: 'in', sec: 2, from: 0, to: 0.75 }, { kind: 'in2', sec: 1, from: 0.75, to: 1 }, { kind: 'out', sec: 6, from: 1, to: 0 }] },
    { id: 'resonance', minutes: 5, phases: [{ kind: 'in', sec: 5, from: 0, to: 1 }, { kind: 'out', sec: 5.5, from: 1, to: 0 }] },
    { id: 'box', minutes: 4, phases: [{ kind: 'in', sec: 4, from: 0, to: 1 }, { kind: 'hold', sec: 4, from: 1, to: 1 }, { kind: 'out', sec: 4, from: 1, to: 0 }, { kind: 'hold', sec: 4, from: 0, to: 0 }] }
  ];
  function breathPattern(id) { return BREATH_PATTERNS.filter(function (p) { return p.id === id; })[0] || null; }
  function cycleSeconds(p) { return p.phases.reduce(function (s, ph) { return s + ph.sec; }, 0); }
  function breathsPerMinute(p) { return Math.round(60 / cycleSeconds(p) * 10) / 10; }
  /** State at `t` seconds from the start: {cycle, phaseIndex, kind, remaining (whole seconds, >=1), scale (0..1), elapsedInPhase}. */
  function phaseAt(p, t) {
    var cyc = cycleSeconds(p), cycle = Math.floor(t / cyc), r = t - cycle * cyc;
    for (var i = 0; i < p.phases.length; i++) {
      var ph = p.phases[i];
      if (r < ph.sec || i === p.phases.length - 1) {
        var f = Math.min(1, r / ph.sec);
        return { cycle: cycle, phaseIndex: i, kind: ph.kind, remaining: Math.max(1, Math.ceil(ph.sec - r - 1e-9)), scale: ph.from + (ph.to - ph.from) * f, elapsedInPhase: r };
      }
      r -= ph.sec;
    }
  }
  function cyclesIn(p, minutes) { return Math.floor(minutes * 60 / cycleSeconds(p)); }

  /* =====================================================================
     MOVEMENT
     ===================================================================== */
  var STEP_GOALS = { first: 7000, optional: 10000, step: 1000 };
  /** Mean of steps over the last 7 days (days with data only). null if fewer than 3 days of data. log = {'YYYY-MM-DD': steps} */
  function stepsAverage(log, today, n) {
    n = n || 7; var v = [];
    for (var i = 0; i < n; i++) { var s = log && log[addDays(today, -i)]; if (isNum(s) && s >= 0) v.push(s); }
    return v.length >= 3 ? Math.round(mean(v)) : null;
  }
  /**
   * Step ladder: the next weekly target is about +1,000 steps above the recent average (rounded to 100),
   * capped at 7,000 (Ding 2025: benefit levels off around 5,000-7,000) or at 10,000 when the optional stage is on.
   * Returns {target, reached, stage}.
   */
  function nextStepTarget(avg, optional10k) {
    var cap = optional10k ? STEP_GOALS.optional : STEP_GOALS.first;
    if (!isNum(avg)) return { target: 2000, reached: false, stage: 1 };
    if (avg >= cap) return { target: cap, reached: true, stage: optional10k ? 2 : 1 };
    var t = Math.round((avg + STEP_GOALS.step) / 100) * 100;
    if (t < 1000) t = 1000;
    var stage = (optional10k && avg >= STEP_GOALS.first) ? 2 : 1;
    return { target: Math.min(cap, t), reached: false, stage: stage };
  }
  /** Weekly (Mon-Sun) activity minutes. log = [{date, minutes, intensity:'moderate'|'vigorous'}]. A vigorous minute counts double (WHO 2020). */
  function weeklyMinutes(log, date) {
    var ws = weekStart(date), we = addDays(ws, 6), mod = 0, vig = 0;
    (log || []).forEach(function (a) { if (a.date >= ws && a.date <= we && isNum(a.minutes) && a.minutes > 0) { if (a.intensity === 'vigorous') vig += a.minutes; else mod += a.minutes; } });
    var eq = mod + 2 * vig;
    return { weekStart: ws, moderate: mod, vigorous: vig, equivalent: eq, pct150: Math.min(1, eq / 150), reached150: eq >= 150, reached300: eq >= 300 };
  }
  /** Count strength sessions in the Mon-Sun week of `date`. sessions = ['YYYY-MM-DD', ...] */
  function weeklyStrength(sessions, date) {
    var ws = weekStart(date), we = addDays(ws, 6);
    var days = {}; (sessions || []).forEach(function (d) { if (d >= ws && d <= we) days[d] = true; });
    var n = Object.keys(days).length; return { days: n, reached: n >= 2 };
  }
  /**
   * Readiness screen (adapted from the PAR-Q+ and the ACSM pre-participation symptom list).
   * answers: {chest, faint, heartDoc, breathless, pain, bp, pregnant, ...} booleans.
   * 'check' = talk to a health worker before vigorous activity; 'care' = go gently, extra notes; 'clear' = fine to build up slowly.
   */
  function readiness(a) {
    a = a || {};
    var check = ['chest', 'faint', 'heartDoc', 'breathless'].filter(function (k) { return a[k]; });
    var care = ['pain', 'bp', 'pregnant', 'newCondition'].filter(function (k) { return a[k]; });
    return { level: check.length ? 'check' : care.length ? 'care' : 'clear', check: check, care: care };
  }

  /* =====================================================================
     MEDICINES
     ===================================================================== */
  /** Pills remaining on `today`, counting down from pillsLeft recorded on pillsAsOf at pillsPerDay. */
  function pillsRemaining(item, today) {
    if (!item || !isNum(item.pillsLeft)) return null;
    var perDay = isNum(item.pillsPerDay) && item.pillsPerDay > 0 ? item.pillsPerDay : null;
    if (!perDay) return item.pillsLeft;
    var asOf = item.pillsAsOf || today, days = Math.max(0, diffDays(asOf, today));
    return Math.max(0, Math.round((item.pillsLeft - perDay * days) * 100) / 100);
  }
  /**
   * Refill planner. Returns {daysLeft, runOutDate (first day with no pills), remindDate (runOut - lead days, not before today), left}.
   * Needs pillsLeft and pillsPerDay > 0, else null.
   */
  function refillInfo(item, today, leadDays) {
    if (!item || !isNum(item.pillsLeft) || !isNum(item.pillsPerDay) || item.pillsPerDay <= 0) return null;
    leadDays = leadDays == null ? 7 : leadDays;
    var left = pillsRemaining(item, today);
    var daysLeft = Math.floor(left / item.pillsPerDay + 1e-9);
    var runOut = addDays(today, daysLeft);
    var remind = addDays(runOut, -leadDays); if (remind < today) remind = today;
    return { left: left, daysLeft: daysLeft, runOutDate: runOut, remindDate: remind, soon: daysLeft <= leadDays, out: daysLeft <= 0 };
  }
  /** Doses due on a date: [{key:'id@HH:MM', id, name, dose, time}] sorted by time; only active items started on/before the date. */
  function dosesDue(items, date) {
    var out = [];
    (items || []).forEach(function (m) {
      if (m.active === false) return;
      if (m.startDate && m.startDate > date) return;
      (m.times || []).forEach(function (t) { if (parseHM(t) != null) out.push({ key: m.id + '@' + t, id: m.id, name: m.name, dose: m.dose, time: t }); });
    });
    return sortBy(out, function (d) { return d.time + d.name; });
  }
  /** Adherence over [from, to] inclusive. log = {'YYYY-MM-DD': {'id@HH:MM': true}}. */
  function adherence(items, log, from, to) {
    var due = 0, taken = 0, byDay = [];
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var L = dosesDue(items, d), t = L.filter(function (x) { return log && log[d] && log[d][x.key]; }).length;
      due += L.length; taken += t; byDay.push({ date: d, due: L.length, taken: t });
    }
    return { due: due, taken: taken, pct: due ? taken / due : null, byDay: byDay };
  }
  /** Daily repeating calendar events for each dose time, plus a refill reminder. opts: {startDate, titleTemplate, descTemplate, refillTitle, refillDesc, today, leadDays, alarmMin}. */
  function medEvents(items, opts) {
    opts = opts || {};
    var today = opts.today || opts.startDate, out = [];
    (items || []).forEach(function (m) {
      if (m.active === false) return;
      var base = parseYmd(opts.startDate || m.startDate || today);
      (m.times || []).forEach(function (t) {
        var mi = parseHM(t); if (mi == null) return;
        out.push({
          uid: 'salus-med-' + m.id + '-' + t.replace(':', ''),
          title: fill(opts.titleTemplate || 'Take {name}', { name: m.name, dose: m.dose || '' }).replace(/\s+\(\s*\)/, ''),
          description: fill(opts.descTemplate || 'Dose: {dose}. Purpose: {purpose}. Ask your pharmacist or health worker if you are unsure.', { dose: m.dose || '-', purpose: m.purpose || '-', name: m.name }),
          start: new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(mi / 60), mi % 60),
          durationMin: 10, rrule: 'FREQ=DAILY', alarmMin: opts.alarmMin == null ? 0 : opts.alarmMin
        });
      });
      var r = refillInfo(m, today, opts.leadDays);
      if (r) {
        var rd = parseYmd(r.remindDate);
        out.push({
          uid: 'salus-refill-' + m.id, durationMin: 15, alarmMin: 0,
          title: fill(opts.refillTitle || 'Get more {name}', { name: m.name }),
          description: fill(opts.refillDesc || 'About {days} days of {name} left (runs out on {date}).', { name: m.name, days: r.daysLeft, date: r.runOutDate }),
          start: new Date(rd.getFullYear(), rd.getMonth(), rd.getDate(), 9, 0)
        });
      }
    });
    return out;
  }

  /* =====================================================================
     HABITS
     ===================================================================== */
  /** Current streak of consecutive days ticked. Today not yet ticked does not break a streak that reached yesterday. */
  function streak(log, today) {
    log = log || {};
    var d = log[today] ? today : addDays(today, -1), n = 0;
    while (log[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak(log) {
    var days = Object.keys(log || {}).filter(function (k) { return log[k]; }).sort(), best = 0, run = 0, prev = null;
    days.forEach(function (d) { run = (prev && diffDays(prev, d) === 1) ? run + 1 : 1; if (run > best) best = run; prev = d; });
    return best;
  }
  /** Last n days ending today, oldest first: [{date, done}] */
  function weekGrid(log, today, n) {
    n = n || 7; var out = [];
    for (var i = n - 1; i >= 0; i--) { var d = addDays(today, -i); out.push({ date: d, done: !!(log && log[d]) }); }
    return out;
  }
  /** True when the habit was missed yesterday and the day before ("never miss twice" nudge applies after one miss). */
  function missedYesterday(log, today) { return !!log && !log[addDays(today, -1)] && !log[today]; }
  function fullPlan(cue, action) { return 'When ' + cue + ', I will ' + action + '.'; }

  /** Starter habit ideas. Texts are English source strings; the UI wraps them in MT.t via these exact literals. */
  var HABIT_IDEAS = [
    { id: 'water', anchor: 'I wake up', action: 'drink a glass of water', tiny: 'take one sip of water' },
    { id: 'walk', anchor: 'I finish lunch', action: 'walk for 10 minutes', tiny: 'put my shoes on and step outside' },
    { id: 'stand', anchor: 'I finish a phone call', action: 'stand up and stretch', tiny: 'stand up' },
    { id: 'medicine', anchor: 'I make my morning tea or coffee', action: 'take my medicine', tiny: 'put my medicine next to my cup' },
    { id: 'chairstand', anchor: 'I brush my teeth', action: 'do 10 chair stands', tiny: 'do 2 chair stands' },
    { id: 'breathe', anchor: 'I get into bed', action: 'breathe slowly for 3 minutes', tiny: 'take 3 slow breaths' },
    { id: 'fruit', anchor: 'I sit down for dinner', action: 'put a vegetable on my plate first', tiny: 'put one piece of vegetable on my plate' },
    { id: 'phone', anchor: 'I plug in my phone for the night', action: 'leave it outside the bedroom', tiny: 'put it on the other side of the room' },
    { id: 'gratitude', anchor: 'I turn off the light', action: 'think of one good thing from today', tiny: 'think of one good thing' },
    { id: 'handwash', anchor: 'I come home', action: 'wash my hands with soap', tiny: 'wet my hands and reach for the soap' }
  ];

  return {
    util: { ymd: ymd, parseYmd: parseYmd, addDays: addDays, diffDays: diffDays, dateOf: dateOf, weekStart: weekStart, parseHM: parseHM, fmtHM: fmtHM, circMean: circMean, circSD: circSD, fill: fill },
    BP_LIMITS: BP_LIMITS, BP_HOME_HIGH: BP_HOME_HIGH, BP_CRISIS: BP_CRISIS, BP_PROTOCOL: BP_PROTOCOL,
    validateBP: validateBP, isCrisis: isCrisis, classifyHome: classifyHome, assessReading: assessReading, crisisAdvice: crisisAdvice,
    dailyAverages: dailyAverages, bpProtocol: bpProtocol, bpDueToday: bpDueToday, bpReminderEvents: bpReminderEvents,
    sleepMinutes: sleepMinutes, midSleep: midSleep, sleepBins: sleepBins, sleepRegularity: sleepRegularity, socialJetlag: socialJetlag, isFreeDay: isFreeDay, sleepSummary: sleepSummary, sleepFlags: sleepFlags,
    moodDaily: moodDaily, moodTrend: moodTrend, lowMoodFlag: lowMoodFlag, activationSummary: activationSummary,
    BREATH_PATTERNS: BREATH_PATTERNS, breathPattern: breathPattern, cycleSeconds: cycleSeconds, breathsPerMinute: breathsPerMinute, phaseAt: phaseAt, cyclesIn: cyclesIn,
    STEP_GOALS: STEP_GOALS, stepsAverage: stepsAverage, nextStepTarget: nextStepTarget, weeklyMinutes: weeklyMinutes, weeklyStrength: weeklyStrength, readiness: readiness,
    pillsRemaining: pillsRemaining, refillInfo: refillInfo, dosesDue: dosesDue, adherence: adherence, medEvents: medEvents,
    streak: streak, bestStreak: bestStreak, weekGrid: weekGrid, missedYesterday: missedYesterday, fullPlan: fullPlan, HABIT_IDEAS: HABIT_IDEAS
  };
});

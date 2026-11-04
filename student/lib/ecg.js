/* MTLib.ecg — physics-inspired synthetic 12-lead ECG generator, rhythm engine and ECG arithmetic.
 *
 * Model
 *  - The heart is represented by one time-varying 3-D current dipole D(t) (the "heart vector"). Every wave (P, QRS, delta,
 *    ST injury current, T, U) is a sum of Gaussian-shaped activation/recovery components, each with its own direction
 *    vector: McSharry PE, Clifford GD, Tarassenko L, Smith LA. IEEE Trans Biomed Eng 2003;50:289-294 (ECGSYN, Gaussian
 *    wave model); Sameni R, Clifford GD, Jutten C, Shamsollahi MB. EURASIP J Adv Signal Process 2007:43407 (3-D dipole
 *    extension of the Gaussian model).
 *  - Lead voltage = D(t) · lead vector. Body axes: x = patient's left, y = inferior (towards the feet), z = anterior.
 *    Frontal leads use the idealised Einthoven/Goldberger hexaxial reference (I 0°, II +60°, III +120°, aVR −150°,
 *    aVL −30°, aVF +90°). As in an electrocardiograph, only I and II are "recorded"; III = II − I, aVR = −(I + II)/2,
 *    aVL = I − II/2 and aVF = II − I/2 are derived, so Einthoven's and Goldberger's laws hold exactly (Kligfield P et al.
 *    AHA/ACCF/HRS recommendations, Part I. Circulation 2007;115:1306-1324).
 *  - Precordial leads lie in the horizontal plane. Their directions and relative gains approximate the Dower transform
 *    (Dower GE, Machado HB, Osborne JA. Clin Cardiol 1980;3:87-95; Edenbrandt L, Pahlm O. J Electrocardiol 1988;21:361).
 *  - Display standard: 25 mm/s and 10 mm/mV (Kligfield 2007). Amplitudes here are in mV, times in seconds unless a name
 *    ends in "Ms".
 *
 * Arithmetic and criteria (also cited next to each function)
 *  - QTc: Bazett HC. Heart 1920;7:353-370. Fridericia LS. Acta Med Scand 1920;53:469-486. Framingham linear: Sagie A et al.
 *    Am J Cardiol 1992;70:797-801. Hodges M et al. J Am Coll Cardiol 1983;1:694 (abstract).
 *  - Intervals, QT limits, axis, conduction and hypertrophy criteria: AHA/ACCF/HRS Recommendations for the Standardization
 *    and Interpretation of the ECG (Surawicz B et al. Part III, Circulation 2009;119:e235; Rautaharju PM et al. Part IV,
 *    e241; Hancock EW et al. Part V, e251; Wagner GS et al. Part VI, e262).
 *  - LVH voltage: Sokolow M, Lyon TP. Am Heart J 1949;37:161-186. Casale PN et al. (Cornell) J Am Coll Cardiol
 *    1985;6:572-580. Molloy TJ et al. (Cornell product) J Am Coll Cardiol 1992;20:1180-1186.
 *  - STEMI thresholds: Thygesen K et al. Fourth Universal Definition of Myocardial Infarction (2018). Circulation
 *    2018;138:e618-e651.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).ecg = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEG = Math.PI / 180;
  var TAU = 2 * Math.PI;
  var SQ3 = Math.sqrt(3);
  var SQ2PI = Math.sqrt(2 * Math.PI);
  var LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  var LIMB = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
  var PRECORDIAL = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  /** Frontal-plane angle of each limb lead (degrees, +90 = inferior). */
  var FRONTAL_ANGLE = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 };
  /** Horizontal-plane direction (degrees from the patient's left towards anterior) and relative gain (Dower-derived). */
  var HORIZONTAL = {
    V1: { ang: 119, gain: 1.65 }, V2: { ang: 88, gain: 2.2 }, V3: { ang: 55, gain: 2.45 },
    V4: { ang: 26, gain: 2.15 }, V5: { ang: 4, gain: 1.8 }, V6: { ang: -15, gain: 1.4 }
  };

  /* ====================================================================== small maths */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function mean(a) { if (!a.length) return NaN; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sd(a) { if (a.length < 2) return 0; var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / (a.length - 1)); }
  function median(a) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }); var m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function round(x, dp) { var f = Math.pow(10, dp || 0); return Math.round(x * f) / f; }
  function wrapDeg(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vscale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  /** Rotate a vector about the antero-posterior (z) axis, i.e. within the frontal plane (positive = clockwise as viewed, towards +90°). */
  function rotFrontal(v, deg) { var c = Math.cos(deg * DEG), s = Math.sin(deg * DEG); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
  function frontalAngle(v) { return Math.atan2(v[1], v[0]) / DEG; }

  /** Deterministic PRNG (mulberry32). */
  function prng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussRand(rng) { var u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng()); }
  function seedOf(x) {
    if (isNum(x)) return Math.floor(Math.abs(x)) % 4294967296 || 1;
    var s = String(x == null ? '1' : x), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) || 1;
  }

  /* ====================================================================== lead projection */
  /** Lead vector (in mV per dipole unit) for each of the 12 leads. */
  function leadVector(lead) {
    if (FRONTAL_ANGLE[lead] != null) {
      // Goldberger augmented leads have magnitude √3/2 of the bipolar leads when derived from I and II.
      var mag = lead.charAt(0) === 'a' ? SQ3 / 2 : 1, a = FRONTAL_ANGLE[lead] * DEG;
      return [mag * Math.cos(a), mag * Math.sin(a), 0];
    }
    var hz = HORIZONTAL[lead]; if (!hz) return null;
    return [hz.gain * Math.cos(hz.ang * DEG), 0, hz.gain * Math.sin(hz.ang * DEG)];
  }
  function project(v, lead) { var L = leadVector(lead); return v[0] * L[0] + v[1] * L[1] + v[2] * L[2]; }

  /* ====================================================================== wave shapes */
  // QRS morphologies: components { f: centre as a fraction of QRS duration, w: Gaussian SD as a fraction of QRS duration,
  // v: dipole vector [x left, y inferior, z anterior] in mV }. "axis: true" morphologies are rotated in the frontal plane
  // so that the area-weighted mean QRS vector points at the requested axis. "t" gives the default T vector, "st" a
  // secondary ST vector (fraction of the T-wave plateau) for wide complexes.
  var MORPH = {
    normal: {
      axis: true,
      qrs: [
        { f: 0.10, w: 0.048, v: [-0.08, 0.04, 0.15] },   // septum, activated left → right: anterior & rightward
        { f: 0.32, w: 0.090, v: [0.28, 0.50, 0.22] },    // apex / anterior free wall
        { f: 0.52, w: 0.095, v: [0.80, 0.90, -0.25] },   // left-ventricular free wall (dominant, left-inferior-posterior)
        { f: 0.68, w: 0.075, v: [0.20, 0.16, -0.62] },   // postero-basal left ventricle
        { f: 0.86, w: 0.055, v: [-0.06, -0.15, -0.18] }  // basal septum / right-ventricular outflow (terminal)
      ],
      tFront: 0.27, tZ: 0.15
    },
    // Right bundle branch block: normal septal + LV activation, then slow, unopposed right-ventricular activation
    // directed rightward and anteriorly (R′ in V1, broad S in I/V6). Secondary T opposite the terminal forces.
    rbbb: {
      axis: true,
      qrs: [
        { f: 0.07, w: 0.035, v: [-0.13, 0.04, 0.17] },
        { f: 0.22, w: 0.065, v: [0.30, 0.42, 0.30] },
        { f: 0.36, w: 0.070, v: [0.70, 0.62, -0.40] },
        { f: 0.70, w: 0.120, v: [-0.48, 0.05, 0.42] }
      ],
      t: [0.24, 0.20, -0.10], st: [0.02, 0, -0.03]
    },
    // Left bundle branch block: septum activated right → left (no septal q in I/V6), then slow trans-septal and
    // left-ventricular activation leftward and posteriorly; two peaks give the notched R in I/aVL/V5-6. Secondary ST/T
    // discordant to the main QRS deflection.
    lbbb: {
      axis: true,
      qrs: [
        { f: 0.14, w: 0.075, v: [0.30, 0.00, -0.02] },
        { f: 0.40, w: 0.110, v: [0.90, 0.35, -0.55] },
        { f: 0.70, w: 0.110, v: [0.85, 0.10, -0.75] }
      ],
      t: [-0.30, -0.05, 0.28], st: [-0.10, -0.02, 0.11]
    },
    // LVH: augmented left-ventricular (posterior/leftward) forces. Strain = secondary ST depression and asymmetric T
    // inversion in the leads with tall R waves.
    lvh: {
      axis: true,
      qrs: [
        { f: 0.10, w: 0.045, v: [-0.12, 0.03, 0.17] },
        { f: 0.32, w: 0.090, v: [0.40, 0.30, 0.42] },
        { f: 0.53, w: 0.105, v: [1.55, 0.55, -0.95] },
        { f: 0.78, w: 0.080, v: [0.10, -0.10, -0.45] }
      ],
      t: [-0.26, 0.04, 0.24], st: [-0.07, -0.01, 0.06]
    },
    // Posterior infarction: loss of posterior forces → anterior shift of the mid-QRS (tall R in V1-V2).
    posterior: {
      axis: true,
      qrs: [
        { f: 0.11, w: 0.050, v: [-0.13, 0.04, 0.22] },
        { f: 0.34, w: 0.100, v: [0.36, 0.42, 0.58] },
        { f: 0.53, w: 0.100, v: [0.72, 0.68, 0.02] },
        { f: 0.78, w: 0.080, v: [-0.04, -0.12, -0.08] }
      ],
      tFront: 0.24, tZ: 0.36
    },
    // Premature ventricular complex from the right-ventricular outflow tract: LBBB-like, inferior axis.
    pvc: {
      qrs: [
        { f: 0.22, w: 0.13, v: [0.20, 0.55, -0.30] },
        { f: 0.62, w: 0.15, v: [0.30, 1.05, -0.62] }
      ],
      t: [-0.12, -0.42, 0.26], st: [-0.04, -0.12, 0.08]
    },
    // Monomorphic VT from the inferior LV: RBBB-like (monophasic R in V1), QS in V6, north-west axis (positive aVR).
    vt: {
      qrs: [
        { f: 0.25, w: 0.13, v: [-0.30, -0.40, 0.30] },
        { f: 0.60, w: 0.15, v: [-0.60, -0.75, 0.45] }
      ],
      t: [0.30, 0.40, -0.25], st: [0.08, 0.12, -0.08]
    },
    // Right-ventricular apical pacing: LBBB-like, superior (left) axis.
    paced: {
      qrs: [
        { f: 0.22, w: 0.13, v: [0.25, -0.40, -0.35] },
        { f: 0.62, w: 0.15, v: [0.45, -0.85, -0.55] }
      ],
      t: [-0.18, 0.40, 0.25], st: [-0.06, 0.12, 0.08]
    },
    // Broad ventricular escape complex (e.g. complete heart block with an infranodal escape).
    escape: {
      qrs: [
        { f: 0.20, w: 0.12, v: [0.45, 0.20, -0.30] },
        { f: 0.60, w: 0.15, v: [0.85, 0.30, -0.65] }
      ],
      t: [-0.30, -0.08, 0.28], st: [-0.08, -0.02, 0.08]
    },
    // Torsades de pointes complexes: direction supplied per beat by the rhythm engine.
    tdp: {
      qrs: [
        { f: 0.30, w: 0.15, v: [1, 0, 0] },
        { f: 0.62, w: 0.13, v: [1, 0, 0] }
      ]
    }
  };

  // P-wave morphologies (components as fractions of the P-wave duration).
  var PMORPH = {
    // Right atrium first (anterior/inferior), then left atrium (leftward/posterior).
    sinus: { axis: true, comps: [{ f: 0.34, w: 0.145, v: [0.22, 0.95, 0.22] }, { f: 0.64, w: 0.155, v: [0.42, 0.58, -0.05] }] },
    // Left atrial abnormality (P mitrale): delayed, enlarged left-atrial component → notched P, deep terminal V1 negativity.
    lae: { axis: true, comps: [{ f: 0.28, w: 0.115, v: [0.30, 0.95, 0.22] }, { f: 0.70, w: 0.125, v: [1.00, 0.55, -0.85] }] },
    // Ectopic atrial focus (premature atrial complex): different axis and contour.
    ectopic: { comps: [{ f: 0.50, w: 0.20, v: [0.95, 0.20, 0.25] }] },
    // Retrograde atrial activation from the AV junction: inverted in II/III/aVF, upright in aVR (and V1).
    retro: { comps: [{ f: 0.50, w: 0.20, v: [-0.15, -1.0, 0.30] }] }
  };

  /** Area-weighted mean frontal vector of a set of components (fractions → relative areas). */
  function meanVector(comps) {
    var m = [0, 0, 0];
    comps.forEach(function (c) { m = vadd(m, vscale(c.v, c.w * SQ2PI)); });
    return m;
  }

  /* ====================================================================== parameters */
  var DEFAULTS = {
    rhythm: 'sinus',
    hr: 72,            // ventricular rate (or sinus rate) per minute
    atrialRate: null,  // atrial rate where it differs (flutter, AV block, VT dissociation)
    pr: 160,           // ms, P onset to QRS onset
    pDur: 100,         // ms
    qrs: 92,           // ms
    qtc: 410,          // ms (Fridericia-normalised; the QT of each beat adapts to its preceding RR)
    qt: null,          // ms at the nominal rate; if given it overrides qtc
    axis: 60,          // mean frontal QRS axis (degrees)
    pAxis: 55,
    tAxis: null,       // null → derived from the QRS axis
    qrsAmp: 1, pAmp: 1, tAmp: 1, uAmp: 0.04,  // multipliers (uAmp in mV)
    morph: 'normal', pMorph: 'sinus',
    st: [0, 0, 0],     // ST injury vector (mV): elevation in leads facing it, reciprocal depression opposite
    stShape: 'convex', // 'convex' (injury, dome) or 'concave' (pericarditis)
    hyperacute: 0,     // fraction of the ST vector added to the T vector (hyperacute T waves)
    prShift: [0, 0, 0],// PR-segment (atrial injury) vector, e.g. pericarditis
    tWidth: 1,         // T-wave width multiplier (< 1 narrow/peaked)
    delta: 0,          // ms of ventricular pre-excitation (WPW)
    deltaVec: [-0.06, 0.32, 0.24],
    conduction: 2,     // flutter conduction ratio (2 → 2:1)
    ratio: 4,          // Mobitz I/II group size (4 → 4:3)
    escape: 'junctional',
    escapeRate: 42,
    noise: 0.25,       // 0–1 artefact level (baseline wander + muscle noise)
    ectopicEvery: 0,   // bigeminy (2) etc.
    fibAmp: 0.06,      // AF f-wave amplitude (mV)
    tVec: null,        // explicit T-wave vector (mV), overrides the T axis
    qVec: null         // early-QRS force lost to infarction (mV), e.g. [0, 0, -0.2] removes anterior r waves (QS V1-V3)
  };

  /* ====================================================================== rhythm engine */
  // Each rhythm returns { atrial: [{on, kind, conducted}], vent: [{on, kind, morph, dur, pIdx}], spikes: [t],
  // flutter: {...}|null, fib: {...}|null, vf: {...}|null }. Times are seconds from the start of the strip; events are
  // generated from 2.5 s before the strip so that it starts mid-rhythm.
  var PRE = 2.5;

  function sinusP(p, rng, t1, opt) {
    opt = opt || {};
    var pp0 = 60 / (opt.rate || p.hr), out = [], resp = opt.resp == null ? 0.018 : opt.resp, per = opt.period || (3.6 + rng() * 1.2), ph = rng() * TAU;
    var t = -PRE - rng() * pp0;
    while (t < t1) {
      out.push(t);
      var mod = 1 + resp * Math.sin(TAU * t / per + ph) + (opt.jitter == null ? 0.006 : opt.jitter) * gaussRand(rng);
      t += pp0 * clamp(mod, 0.6, 1.5);
    }
    return out;
  }
  function V(on, morph, kind, extra) {
    var b = { on: on, morph: morph || 'normal', kind: kind || 'N', pIdx: -1 };
    if (extra) for (var k in extra) b[k] = extra[k];
    return b;
  }
  function conductAll(pt, p, kind) {
    var atrial = [], vent = [];
    pt.forEach(function (t, i) {
      atrial.push({ on: t, kind: kind || 'sinus', conducted: true });
      vent.push(V(t + p.pr / 1000, p.morph, 'N', { pIdx: i }));
    });
    return { atrial: atrial, vent: vent };
  }

  var RHYTHMS = {
    sinus: function (p, rng, T) { return conductAll(sinusP(p, rng, T), p); },
    'sinus-arrhythmia': function (p, rng, T) { return conductAll(sinusP(p, rng, T, { resp: 0.17, period: 4.4 + rng() * 0.8, jitter: 0.004 }), p); },
    af: function (p, rng, T) {
      var m = 60 / p.hr, vent = [], t = -PRE - rng() * m;
      while (t < T) {
        vent.push(V(t, p.morph, 'N'));
        // Irregularly irregular: log-normal RR (CV ≈ 0.22) with a refractory floor.
        var rr = m * Math.exp(0.24 * gaussRand(rng) - 0.0288);
        t += clamp(rr, Math.max(0.3, 0.55 * m), 2.2 * m);
      }
      return { atrial: [], vent: vent, fib: { amp: p.fibAmp } };
    },
    flutter: function (p, rng, T) {
      var cl = 60 / (p.atrialRate || 300), n = Math.max(1, Math.round(p.conduction || 2)), f0 = -PRE - rng() * cl * n;
      var atrial = [], vent = [], k = 0;
      for (var t = f0; t < T; t += cl, k++) {
        var cond = k % n === 0;
        atrial.push({ on: t, kind: 'flutter', conducted: cond });
        if (cond) vent.push(V(t + 0.26, p.morph, 'N', { pIdx: atrial.length - 1 }));
      }
      return { atrial: atrial, vent: vent, flutter: { cl: cl, t0: f0 } };
    },
    svt: function (p, rng, T) {
      var rr = 60 / p.hr, vent = [], atrial = [];
      for (var t = -PRE - rng() * rr; t < T; t += rr * (1 + 0.002 * gaussRand(rng))) {
        vent.push(V(t, p.morph, 'N'));
        // AVNRT: retrograde atrial activation simultaneous with the end of the QRS (pseudo-r′ V1, pseudo-S II/III/aVF).
        atrial.push({ on: t + p.qrs / 1000 - 0.035, kind: 'retro', conducted: false, dur: 0.07, amp: 0.55 });
      }
      return { atrial: atrial, vent: vent };
    },
    junctional: function (p, rng, T) {
      var rr = 60 / p.hr, vent = [], atrial = [];
      for (var t = -PRE - rng() * rr; t < T; t += rr * (1 + 0.006 * gaussRand(rng))) {
        atrial.push({ on: t - 0.085, kind: 'retro', conducted: false, retro: true });
        vent.push(V(t, p.morph, 'J', { pIdx: atrial.length - 1 }));
      }
      return { atrial: atrial, vent: vent };
    },
    vt: function (p, rng, T) {
      var rr = 60 / p.hr, vent = [];
      for (var t = -PRE - rng() * rr; t < T; t += rr * (1 + 0.004 * gaussRand(rng))) vent.push(V(t, 'vt', 'V'));
      // AV dissociation: the sinus node keeps firing independently.
      var atrial = sinusP(p, rng, T, { rate: p.atrialRate || 78 }).map(function (t) { return { on: t, kind: 'sinus', conducted: false }; });
      return { atrial: atrial, vent: vent };
    },
    vf: function (p, rng) { return { atrial: [], vent: [], vf: { amp: 0.42 + rng() * 0.12 } }; },
    asystole: function () { return { atrial: [], vent: [] }; },
    torsades: function (p, rng, T) {
      // Long-QT sinus beats; an R-on-T ventricular ectopic beat starts a run of torsades de pointes.
      var rr = 60 / p.hr, atrial = [], vent = [], t = -PRE + 0.15;
      var start = 1.6 + rng() * 0.6;
      while (t + rr < start) { atrial.push({ on: t - p.pr / 1000, kind: 'sinus', conducted: true }); vent.push(V(t, p.morph, 'N', { pIdx: atrial.length - 1 })); t += rr; }
      atrial.push({ on: t - p.pr / 1000, kind: 'sinus', conducted: true }); vent.push(V(t, p.morph, 'N', { pIdx: atrial.length - 1 }));
      var qt = p.qtc / 1000 * Math.cbrt(rr);
      var k = 0, ph = rng() * TAU, cyc = 9 + rng() * 4;
      for (var u = t + qt * 0.82; u < T + 0.6; k++) {
        var phi = ph + TAU * k / cyc;
        vent.push(V(u, 'tdp', 'V', { tdpPhase: phi, tdpAmp: 0.75 + 0.35 * Math.sin(TAU * k / (cyc * 1.7) + 1) }));
        u += (0.23 + 0.05 * rng());
      }
      return { atrial: atrial, vent: vent };
    },
    'avb2-mobitz1': function (p, rng, T) {
      var pts = sinusP(p, rng, T, { rate: p.atrialRate || p.hr, resp: 0.01, jitter: 0.004 });
      var n = Math.max(3, Math.round(p.ratio || 4)), atrial = [], vent = [];
      var offset = Math.floor(rng() * n), base = p.pr / 1000, inc1 = 0.10 + rng() * 0.03;
      pts.forEach(function (t, i) {
        var k = (i + offset) % n; // position in the Wenckebach group
        if (k === n - 1) { atrial.push({ on: t, kind: 'sinus', conducted: false }); return; }
        var pr = base; for (var j = 1; j <= k; j++) pr += inc1 * Math.pow(0.45, j - 1);
        atrial.push({ on: t, kind: 'sinus', conducted: true });
        vent.push(V(t + pr, p.morph, 'N', { pIdx: atrial.length - 1 }));
      });
      return { atrial: atrial, vent: vent };
    },
    'avb2-mobitz2': function (p, rng, T) {
      var pts = sinusP(p, rng, T, { rate: p.atrialRate || p.hr, resp: 0.01, jitter: 0.004 });
      var atrial = [], vent = [], count = Math.floor(rng() * 3), group = Math.max(3, Math.round(p.ratio || 4));
      pts.forEach(function (t) {
        count++;
        var blocked = count >= group;
        if (blocked) { count = 0; group = Math.max(3, Math.round(p.ratio || 4)) + (rng() < 0.35 ? 1 : 0); }
        atrial.push({ on: t, kind: 'sinus', conducted: !blocked });
        if (!blocked) vent.push(V(t + p.pr / 1000, p.morph, 'N', { pIdx: atrial.length - 1 }));
      });
      return { atrial: atrial, vent: vent };
    },
    'avb3': function (p, rng, T) {
      var atrial = sinusP(p, rng, T, { rate: p.atrialRate || 90, resp: 0.012 }).map(function (t) { return { on: t, kind: 'sinus', conducted: false }; });
      var rr = 60 / (p.escapeRate || 42), vent = [], wide = p.escape === 'ventricular';
      for (var t = -PRE - rng() * rr; t < T; t += rr * (1 + 0.006 * gaussRand(rng))) vent.push(V(t, wide ? 'escape' : p.morph, wide ? 'E' : 'J'));
      return { atrial: atrial, vent: vent };
    },
    pac: function (p, rng, T) {
      // Sinus rhythm with premature atrial complexes; the sinus node is reset (non-compensatory pause).
      var pp = 60 / p.hr, atrial = [], vent = [], t = -PRE - rng() * pp, i = 0;
      var when = [2 + Math.floor(rng() * 2), 6 + Math.floor(rng() * 3)], beat = 0;
      while (t < T) {
        var visible = t > 0.2;
        if (visible && when.indexOf(beat) >= 0) {
          var tp = t - pp + pp * (0.6 + rng() * 0.08);
          atrial.push({ on: tp, kind: 'ectopic', conducted: true }); vent.push(V(tp + p.pr / 1000 + 0.02, p.morph, 'S', { pIdx: atrial.length - 1 }));
          t = tp + pp * 1.06; beat++; continue;
        }
        atrial.push({ on: t, kind: 'sinus', conducted: true }); vent.push(V(t + p.pr / 1000, p.morph, 'N', { pIdx: atrial.length - 1 }));
        t += pp * (1 + 0.006 * gaussRand(rng)); if (visible) beat++; i++;
      }
      return { atrial: atrial, vent: vent };
    },
    pvc: function (p, rng, T) {
      // Sinus rhythm with PVCs; the sinus P that falls in the PVC is not conducted → fully compensatory pause.
      var pts = sinusP(p, rng, T, { resp: 0.01, jitter: 0.004 }), pp = 60 / p.hr, every = p.ectopicEvery || 0;
      var atrial = [], vent = [], visible = 0, pick = [3 + Math.floor(rng() * 2), 8 + Math.floor(rng() * 2)];
      var skipNext = false;
      pts.forEach(function (t, i) {
        if (skipNext) { atrial.push({ on: t, kind: 'sinus', conducted: false }); skipNext = false; return; }
        atrial.push({ on: t, kind: 'sinus', conducted: true });
        var qrsOn = t + p.pr / 1000; vent.push(V(qrsOn, p.morph, 'N', { pIdx: atrial.length - 1 }));
        if (qrsOn > 0) visible++;
        var ectopic = every ? (i % every === 0) : (pick.indexOf(visible) >= 0 && qrsOn > 0);
        if (ectopic && i + 1 < pts.length) {
          vent.push(V(qrsOn + pp * (every ? 0.56 : 0.58 + rng() * 0.06), 'pvc', 'V'));
          skipNext = true; if (!every) pick.splice(pick.indexOf(visible), 1);
        }
      });
      return { atrial: atrial, vent: vent };
    },
    paced: function (p, rng, T) {
      var rr = 60 / p.hr, vent = [], spikes = [];
      for (var t = -PRE - rng() * rr; t < T; t += rr) { spikes.push(t); vent.push(V(t + 0.004, 'paced', 'P')); }
      return { atrial: [], vent: vent, spikes: spikes };
    }
  };
  RHYTHMS['avb1'] = RHYTHMS.sinus;

  /* ====================================================================== synthesis */
  function addGauss(D, fs, mu, sl, sr, v) {
    var n = D.n, i0 = Math.max(0, Math.floor((mu - 5 * sl) * fs)), i1 = Math.min(n - 1, Math.ceil((mu + 5 * sr) * fs));
    if (i1 < 0 || i0 >= n) return;
    var vx = v[0], vy = v[1], vz = v[2];
    for (var i = i0; i <= i1; i++) {
      var d = i / fs - mu, s = d < 0 ? sl : sr, g = Math.exp(-0.5 * d * d / (s * s));
      D.x[i] += g * vx; D.y[i] += g * vy; D.z[i] += g * vz;
    }
  }
  /** Adds v · w(t) where w rises (raised cosine) over [a, a+ra], stays at 1, then decays as a half-Gaussian (sd fb) after b. */
  function addPlateau(D, fs, a, ra, b, fb, v, bump) {
    var n = D.n, i0 = Math.max(0, Math.floor(a * fs)), i1 = Math.min(n - 1, Math.ceil((b + 4.5 * fb) * fs));
    for (var i = i0; i <= i1; i++) {
      var t = i / fs, w;
      if (t < a) w = 0; else if (t < a + ra) w = 0.5 - 0.5 * Math.cos(Math.PI * (t - a) / ra); else w = 1;
      if (t > b) { var d = t - b; w *= Math.exp(-0.5 * d * d / (fb * fb)); }
      if (bump) { var e = (t - bump.mu) / bump.sd; w += bump.k * Math.exp(-0.5 * e * e); }
      D.x[i] += w * v[0]; D.y[i] += w * v[1]; D.z[i] += w * v[2];
    }
  }

  /** Prepare morphology components for this tracing: frontal rotation to the requested axis and amplitude scaling. */
  function prepareMorph(name, p) {
    var m = MORPH[name] || MORPH.normal, rot = 0;
    var comps = m.qrs.map(function (c) { return { f: c.f, w: c.w, v: c.v.slice() }; });
    if (m.axis) {
      rot = wrapDeg(p.axis - frontalAngle(meanVector(comps)));
      comps.forEach(function (c) { c.v = rotFrontal(c.v, rot); });
    }
    var k = p.qrsAmp;
    comps.forEach(function (c) { c.v = vscale(c.v, k); });
    var tv;
    if (p.tVec && (name === 'normal' || name === p.morph)) tv = p.tVec.slice();
    else if (m.t) tv = rotFrontal(m.t, rot);
    else {
      var ta = p.tAxis != null ? p.tAxis : clamp(p.axis * 0.5 + 15, -10, 75);
      tv = [m.tFront * Math.cos(ta * DEG), m.tFront * Math.sin(ta * DEG), m.tZ];
    }
    tv = vscale(tv, p.tAmp * (m.t && !p.tVec ? Math.max(0.6, Math.min(1.6, k)) : 1));
    if (p.qVec && m.axis) comps.push({ f: 0.24, w: 0.085, v: p.qVec.slice() });
    var st2 = m.st ? vscale(rotFrontal(m.st, rot), Math.max(0.6, Math.min(1.6, k))) : null;
    return { comps: comps, t: tv, st2: st2, rot: rot, mean: meanVector(comps) };
  }
  function preparePMorph(name, p) {
    var m = PMORPH[name] || PMORPH.sinus;
    var comps = m.comps.map(function (c) { return { f: c.f, w: c.w, v: c.v.slice() }; });
    if (m.axis) {
      var rot = wrapDeg(p.pAxis - frontalAngle(meanVector(comps)));
      comps.forEach(function (c) { c.v = rotFrontal(c.v, rot); });
    }
    return comps;
  }

  /** Fridericia-style adaptation of QT to the preceding RR (s). */
  function qtFor(p, rr) { return p.qtc / 1000 * Math.cbrt(clamp(rr, 0.25, 2.4)); }

  function synthBeat(D, fs, b, p, prep, rng) {
    var on = b.on, dur = b.dur, m = prep[b.morph] || prep.normal;
    var comps = m.comps;
    if (b.morph === 'tdp') {
      // Twisting axis: the complex direction rotates about a fixed axis from beat to beat (spindle-shaped amplitude).
      var A = [0.55, 0.80, 0.25], B = [-0.35, 0.15, 0.92], c = Math.cos(b.tdpPhase), s = Math.sin(b.tdpPhase);
      var dir = vscale(vadd(vscale(A, c), vscale(B, s)), 1.05 * b.tdpAmp);
      addGauss(D, fs, on + 0.30 * dur, 0.15 * dur, 0.15 * dur, dir);
      addGauss(D, fs, on + 0.62 * dur, 0.13 * dur, 0.13 * dur, vscale(dir, 0.8));
      addGauss(D, fs, on + dur + 0.07, 0.045, 0.04, vscale(dir, -0.45));
      return;
    }
    // Pre-excitation (delta wave): slow ventricular activation through the accessory pathway before the normal QRS.
    if (b.delta > 0) addGauss(D, fs, on + b.delta * 1.05, b.delta * 0.47, b.delta * 0.5, vscale(p.deltaVec, p.qrsAmp));
    var qrsStart = on + (b.delta || 0), qd = dur - (b.delta || 0);
    for (var i = 0; i < comps.length; i++) {
      var cc = comps[i], v = cc.v;
      if (b.vscale) v = vscale(v, b.vscale);
      addGauss(D, fs, qrsStart + cc.f * qd, cc.w * qd, cc.w * qd, v);
    }
    // Repolarisation geometry: QT adapts to the preceding RR (Fridericia), widened by any QRS prolongation.
    var qtN = b.qt, J = on + dur;
    var sr = 0.105 * qtN * p.tWidth, sl = 0.16 * qtN * p.tWidth;
    var tEnd = on + qtN + Math.max(0, dur - 0.095) * 0.85;
    var tPeak = tEnd - 2 * sr;
    if (tPeak - 1.9 * sl < J + 0.015) sl = Math.max(0.018, (tPeak - J - 0.015) / 1.9);
    if (tPeak < J + 0.04) { tPeak = J + 0.04; tEnd = tPeak + 2 * sr; }
    b.tPeak = tPeak; b.tEnd = tEnd;
    var tv = m.t;
    var ventricular = b.morph === 'pvc' || b.morph === 'vt' || b.morph === 'paced' || b.morph === 'escape';
    if (!ventricular && p.hyperacute) tv = vadd(tv, vscale(p.st, p.hyperacute));
    if (b.tScale) tv = vscale(tv, b.tScale);
    addGauss(D, fs, tPeak, sl, sr, tv);
    // ST segment: injury current (primary) and secondary ST change of wide complexes.
    var stv = ventricular ? [0, 0, 0] : p.st.slice();
    if (m.st2) stv = vadd(stv, m.st2);
    if (stv[0] || stv[1] || stv[2]) {
      var bump = (!ventricular && p.stShape === 'convex' && (p.st[0] || p.st[1] || p.st[2])) ? { mu: (J + tPeak) / 2, sd: Math.max(0.02, (tPeak - J) / 3.2), k: 0.3 } : null;
      addPlateau(D, fs, J - 0.006, 0.03, tPeak, sr, stv, bump);
    }
    // U wave (largest in V2-V3), after the end of T.
    if (p.uAmp > 0 && !ventricular) {
      var uv = [0.35 * p.uAmp, 0.35 * p.uAmp, 0.87 * p.uAmp];
      addGauss(D, fs, tEnd + 0.085, 0.042, 0.038, uv);
      b.uPeak = tEnd + 0.085;
    }
  }

  function synthP(D, fs, a, p, pcomps) {
    var dur = (a.dur || p.pDur / 1000), comps;
    if (a.kind === 'sinus') comps = pcomps.sinus;
    else if (a.kind === 'ectopic') comps = pcomps.ectopic;
    else if (a.kind === 'retro') comps = pcomps.retro;
    else return;
    var k = p.pAmp * (a.amp == null ? 1 : a.amp) * 0.16;
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      addGauss(D, fs, a.on + c.f * dur, c.w * dur, c.w * dur, vscale(c.v, k));
    }
    // Atrial injury (pericarditis): PR-segment shift from mid-P to the QRS onset.
    if ((p.prShift[0] || p.prShift[1] || p.prShift[2]) && a.conducted) {
      var qrsOn = a.on + p.pr / 1000;
      addPlateau(D, fs, a.on + 0.35 * dur, 0.05, qrsOn - 0.005, 0.012, p.prShift);
    }
  }

  /** Typical-flutter sawtooth over one cycle (phase 0–1): slow descent, steeper fall, rapid upstroke. */
  var SAW = (function () {
    var N = 240, raw = new Array(N), out = new Array(N);
    for (var i = 0; i < N; i++) {
      var ph = i / N, y;
      if (ph < 0.50) y = 0.55 - 0.45 * (ph / 0.50);
      else if (ph < 0.72) y = 0.10 - 1.10 * ((ph - 0.50) / 0.22);
      else y = -1.0 + 1.55 * ((ph - 0.72) / 0.28);
      raw[i] = y;
    }
    for (var j = 0; j < N; j++) { var s = 0, c = 0; for (var k = -9; k <= 9; k++) { s += raw[(j + k + N) % N]; c++; } out[j] = s / c; }
    var m = mean(out); for (var q = 0; q < N; q++) out[q] -= m;
    return out;
  })();

  function synthContinuous(D, fs, ev, rng) {
    var n = D.n, i;
    if (ev.flutter) {
      // Counter-clockwise (typical) flutter: negative sawtooth in II/III/aVF, positive discrete F waves in V1.
      var F = [0.02, 0.21, -0.10], cl = ev.flutter.cl, t0 = ev.flutter.t0, N = SAW.length;
      for (i = 0; i < n; i++) {
        var ph = ((i / fs - t0) / cl) % 1; if (ph < 0) ph += 1;
        var y = SAW[Math.floor(ph * N) % N];
        D.x[i] += y * F[0]; D.y[i] += y * F[1]; D.z[i] += y * F[2];
      }
    }
    if (ev.fib || ev.vf) {
      // Fibrillatory activity: several drifting oscillators per axis (AF 5.5-8 Hz; VF 3.5-6.5 Hz), amplitude-modulated.
      var vf = !!ev.vf, amp = vf ? ev.vf.amp : ev.fib.amp, axes = vf ? [0.9, 1.0, 0.8] : [0.35, 0.75, 1.0];
      for (var ax = 0; ax < 3; ax++) {
        var arr = ax === 0 ? D.x : ax === 1 ? D.y : D.z, osc = [];
        for (var k = 0; k < 3; k++) osc.push({ f: vf ? 3.6 + rng() * 2.6 : 5.6 + rng() * 2.4, ph: rng() * TAU, dm: rng() * TAU, df: 0.1 + rng() * 0.25, am: rng() * TAU, af: 0.15 + rng() * 0.35, w: 0.6 + rng() * 0.4 });
        var tot = osc.reduce(function (s2, o) { return s2 + o.w; }, 0);
        for (i = 0; i < n; i++) {
          var t = i / fs, sum = 0;
          for (var q = 0; q < osc.length; q++) {
            var o = osc[q];
            o.ph += TAU * (o.f + (vf ? 1.1 : 0.9) * Math.sin(TAU * o.df * t + o.dm)) / fs;
            sum += o.w * (0.55 + 0.45 * Math.sin(TAU * o.af * t + o.am)) * Math.sin(o.ph);
          }
          arr[i] += amp * axes[ax] * sum / tot * (vf ? 1.6 : 1.5);
        }
      }
    }
  }

  /* ====================================================================== generate() */
  function resolveParams(dx, user) {
    var p = {}, k;
    for (k in DEFAULTS) p[k] = Array.isArray(DEFAULTS[k]) ? DEFAULTS[k].slice() : DEFAULTS[k];
    if (dx && dx.params) for (k in dx.params) p[k] = Array.isArray(dx.params[k]) ? dx.params[k].slice() : dx.params[k];
    if (user) for (k in user) if (user[k] !== undefined && user[k] !== null) p[k] = Array.isArray(user[k]) ? user[k].slice() : user[k];
    if (!RHYTHMS[p.rhythm]) p.rhythm = 'sinus';
    p.hr = clamp(Number(p.hr) || 72, 15, 300);
    p.pr = clamp(Number(p.pr) || 160, 60, 450);
    p.qrs = clamp(Number(p.qrs) || 92, 50, 240);
    if (isNum(p.qt) && p.qt > 0) p.qtc = p.qt / Math.cbrt(60 / p.hr);
    p.qtc = clamp(Number(p.qtc) || 410, 260, 720);
    p.axis = wrapDeg(Number(p.axis) || 0);
    p.pAxis = wrapDeg(isNum(p.pAxis) ? p.pAxis : 55);
    ['qrsAmp', 'pAmp', 'tAmp', 'tWidth'].forEach(function (key) { p[key] = clamp(isNum(p[key]) ? p[key] : 1, 0, 5); });
    p.tWidth = Math.max(0.3, p.tWidth);
    p.uAmp = clamp(isNum(p.uAmp) ? p.uAmp : 0.04, 0, 1);
    p.noise = clamp(isNum(p.noise) ? p.noise : 0.25, 0, 1);
    ['st', 'prShift', 'deltaVec'].forEach(function (key) { if (!Array.isArray(p[key]) || p[key].length !== 3) p[key] = DEFAULTS[key].slice(); p[key] = p[key].map(Number); });
    ['tVec', 'qVec'].forEach(function (key) { p[key] = Array.isArray(p[key]) && p[key].length === 3 ? p[key].map(Number) : null; });
    p.delta = clamp(Number(p.delta) || 0, 0, 90);
    return p;
  }

  /**
   * Generate a synthetic 12-lead ECG.
   * opts: { diagnosis: id (see DIAGNOSES), params: {...overrides}, durationSec (default 10), sampleRate (default 500), seed }
   * Returns { leads: {I: [...], ...}, fs, durationSec, annotations, params, diagnosis, seed }.
   */
  function generate(opts) {
    opts = opts || {};
    var dx = null;
    if (opts.diagnosis) { dx = DX_BY_ID[opts.diagnosis]; if (!dx) throw new Error('Unknown ECG diagnosis: ' + opts.diagnosis); }
    var userParams = {}; var k;
    if (opts.params) for (k in opts.params) userParams[k] = opts.params[k];
    ['hr', 'pr', 'qrs', 'qt', 'qtc', 'axis'].forEach(function (key) { if (opts[key] != null && userParams[key] == null) userParams[key] = opts[key]; });
    var p = resolveParams(dx, userParams);
    var fs = clamp(Math.round(opts.sampleRate || 500), 100, 2000), dur = clamp(Number(opts.durationSec) || 10, 1, 60);
    var seed = seedOf(opts.seed == null ? 1 : opts.seed), rng = prng(seed);
    var n = Math.round(dur * fs);
    var ev = RHYTHMS[p.rhythm](p, rng, dur);
    ev.spikes = ev.spikes || [];
    ev.vent.sort(function (a, b) { return a.on - b.on; });
    // Per-beat QRS duration, preceding RR and QT.
    var prep = {};
    ['normal', 'rbbb', 'lbbb', 'lvh', 'posterior', 'pvc', 'vt', 'paced', 'escape', 'tdp'].forEach(function (nm) { prep[nm] = prepareMorph(nm, p); });
    if (MORPH[p.morph]) prep.normal = prepareMorph(p.morph, p);
    var nominalRR = 60 / p.hr;
    ev.vent.forEach(function (b, i) {
      var prev = ev.vent[i - 1];
      b.rrPrev = prev ? b.on - prev.on : nominalRR;
      var vtype = b.morph === 'pvc' || b.morph === 'vt' || b.morph === 'paced' || b.morph === 'escape' || b.morph === 'tdp';
      b.dur = vtype ? (b.morph === 'tdp' ? 0.13 : b.morph === 'pvc' ? 0.145 : b.morph === 'paced' ? 0.155 : 0.16) : p.qrs / 1000;
      if (b.morph === 'vt' && p.rhythm === 'vt') b.dur = clamp(p.qrs, 120, 240) / 1000;
      // Pre-excitation: the QRS starts with the delta wave (short PR); params.qrs is the total QRS including the delta.
      if (p.delta > 0 && !vtype && b.kind !== 'J') b.delta = Math.min(p.delta / 1000, b.dur - 0.05);
      b.qt = vtype ? Math.min(qtFor({ qtc: 400 }, b.rrPrev), 0.42) : qtFor(p, b.rrPrev);
      if (b.morph === 'pvc' || b.morph === 'vt') b.qt = clamp(qtFor({ qtc: 420 }, Math.max(b.rrPrev, 0.4)), 0.26, 0.44);
    });
    var D = { n: n, x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) };
    var pcomps = { sinus: preparePMorph(p.pMorph === 'lae' ? 'lae' : 'sinus', p), ectopic: preparePMorph('ectopic', p), retro: preparePMorph('retro', p) };
    ev.atrial.forEach(function (a) { synthP(D, fs, a, p, pcomps); });
    ev.vent.forEach(function (b) { synthBeat(D, fs, b, p, prep, rng); });
    synthContinuous(D, fs, ev, rng);

    // Record leads I, II and V1-V6 (with independent electrode artefact), derive III, aVR, aVL, aVF.
    var rec = { I: [1, 0, 0], II: [0.5, SQ3 / 2, 0] };
    PRECORDIAL.forEach(function (l) { rec[l] = leadVector(l); });
    var leads = {};
    var spikeVec = [0.25, 0.75, -0.35];
    Object.keys(rec).forEach(function (l) {
      var L = rec[l], arr = new Array(n), i;
      for (i = 0; i < n; i++) arr[i] = D.x[i] * L[0] + D.y[i] * L[1] + D.z[i] * L[2];
      addArtefact(arr, fs, p.noise, rng);
      if (ev.spikes.length) {
        var amp = (spikeVec[0] * L[0] + spikeVec[1] * L[1] + spikeVec[2] * L[2]) * 1.4;
        ev.spikes.forEach(function (t) { var j = Math.round(t * fs); if (j >= 0 && j < n) { arr[j] += amp; if (j + 1 < n) arr[j + 1] += amp * 0.55; if (j + 2 < n) arr[j + 2] -= amp * 0.12; } });
      }
      leads[l] = arr;
    });
    var I = leads.I, II = leads.II, III = new Array(n), aVR = new Array(n), aVL = new Array(n), aVF = new Array(n);
    for (var i = 0; i < n; i++) { III[i] = II[i] - I[i]; aVR[i] = -(I[i] + II[i]) / 2; aVL[i] = I[i] - II[i] / 2; aVF[i] = II[i] - I[i] / 2; }
    leads.III = III; leads.aVR = aVR; leads.aVL = aVL; leads.aVF = aVF;
    var ordered = {}; LEADS.forEach(function (l) { ordered[l] = leads[l]; });
    return { leads: ordered, fs: fs, durationSec: dur, annotations: annotate(ev, p, dur, prep), params: p, diagnosis: dx ? dx.id : null, seed: seed };
  }

  /** Baseline wander (respiration/electrode) and low-level muscle noise; deterministic given the PRNG. */
  function addArtefact(arr, fs, level, rng) {
    if (!(level > 0)) return;
    var n = arr.length, f1 = 0.12 + rng() * 0.2, f2 = 0.3 + rng() * 0.25, p1 = rng() * TAU, p2 = rng() * TAU;
    var a1 = (0.025 + rng() * 0.035) * level, a2 = 0.012 * level * rng(), sig = 0.012 * level, prev = 0, prev2 = 0;
    for (var i = 0; i < n; i++) {
      var t = i / fs, w = gaussRand(rng) * sig, sm = (w + prev + prev2) / 3;
      prev2 = prev; prev = w;
      arr[i] += a1 * Math.sin(TAU * f1 * t + p1) + a2 * Math.sin(TAU * f2 * t + p2) + sm;
    }
  }

  /* ====================================================================== annotations */
  function annotate(ev, p, dur, prep) {
    var beats = [], pWaves = [];
    ev.vent.forEach(function (b) {
      if (b.on < -0.02 || b.on > dur) return;
      var a = b.pIdx >= 0 ? ev.atrial[b.pIdx] : null;
      var conducted = !!(a && a.conducted);
      beats.push({
        t: b.on, qrsOn: b.on, qrsOff: b.on + b.dur, tPeak: b.tPeak, tEnd: b.tEnd, pKind: a ? a.kind : null,
        kind: b.kind, morph: b.morph, conducted: conducted,
        pr: conducted ? Math.round((b.on - a.on) * 1000) : null,
        qrs: Math.round(b.dur * 1000), qt: Math.round((b.tEnd - b.on) * 1000), rr: null
      });
    });
    for (var i = 1; i < beats.length; i++) beats[i].rr = Math.round((beats[i].t - beats[i - 1].t) * 1000);
    function pOf(b) { return b.pKind ? { kind: b.pKind } : null; }
    var firstIdx = ev.vent.indexOf(ev.vent.filter(function (b) { return b.on >= -0.02; })[0]);
    if (beats.length && firstIdx > 0) beats[0].rr = Math.round((beats[0].t - ev.vent[firstIdx - 1].on) * 1000);
    var vByP = {};
    ev.vent.forEach(function (b) { if (b.pIdx >= 0) vByP[b.pIdx] = b; });
    ev.atrial.forEach(function (a, idx) {
      if (a.on < -0.06 || a.on > dur) return;
      var d = a.kind === 'flutter' ? (ev.flutter ? ev.flutter.cl : 0.2) : (a.dur || p.pDur / 1000);
      var v = vByP[idx];
      pWaves.push({ on: a.on, off: a.on + d, kind: a.kind, conducted: !!(a.conducted && v), pr: a.conducted && v ? Math.round((v.on - a.on) * 1000) : null });
    });
    var rr = beats.slice(1).map(function (b) { return b.rr; });
    var discrete = pWaves.filter(function (x) { return x.kind === 'sinus' || x.kind === 'ectopic'; });
    var pp = [];
    for (var j = 1; j < discrete.length; j++) pp.push(Math.round((discrete[j].on - discrete[j - 1].on) * 1000));
    var ventRate = rr.length ? 60000 / mean(rr) : beats.length * 60 / dur;
    var atrialRate = null;
    if (ev.flutter) atrialRate = 60 / ev.flutter.cl;
    else if (ev.fib) atrialRate = null;
    else if (pp.length) atrialRate = 60000 / mean(pp);
    // Dominant-beat intervals (median over the most common conducted/escape beat type).
    var main = beats.filter(function (b) { return b.kind === 'N' || b.kind === 'J' || b.kind === 'E' || b.kind === 'P' || b.kind === 'V'; });
    var kinds = {}; main.forEach(function (b) { kinds[b.kind] = (kinds[b.kind] || 0) + 1; });
    var PRI = { N: 0, J: 1, E: 2, P: 3, V: 4 };
    var domKind = Object.keys(kinds).sort(function (a, b) { return (kinds[b] - kinds[a]) || (PRI[a] - PRI[b]); })[0];
    var dom = main.filter(function (b) { return b.kind === domKind; });
    // PR only for discrete atrial depolarisations (an F wave → QRS interval is not a PR interval).
    var prs = dom.filter(function (b) { var a = pOf(b); return a && (a.kind === 'sinus' || a.kind === 'ectopic'); }).map(function (b) { return b.pr; }).filter(isNum);
    var rrMed = rr.length ? median(rr) : null;
    var qtOK = dom.length && domKind !== 'V' && p.rhythm !== 'vf' && p.rhythm !== 'torsades';
    var withRR = dom.filter(function (b) { return isNum(b.rr); });
    var intervals = {
      pr: prs.length && sd(prs) < 15 ? Math.round(median(prs)) : null,
      prVariable: prs.length > 1 && sd(prs) >= 15,
      qrs: dom.length ? Math.round(median(dom.map(function (b) { return b.qrs; }))) : null,
      qt: qtOK ? Math.round(median(dom.map(function (b) { return b.qt; }))) : null,
      rr: rrMed != null ? Math.round(rrMed) : null
    };
    if (intervals.qt && withRR.length) {
      // QTc per beat from its own preceding RR, then the median (robust when RR varies, e.g. AF or bigeminy).
      intervals.qtc = {};
      ['bazett', 'fridericia', 'framingham', 'hodges'].forEach(function (m) { intervals.qtc[m] = Math.round(median(withRR.map(function (b) { return qtc(b.qt, b.rr, m); }))); });
      intervals.qtRR = Math.round(median(withRR.map(function (b) { return b.rr; })));
    }
    var nm = prep[domKind === 'E' ? 'escape' : domKind === 'P' ? 'paced' : domKind === 'V' ? (p.rhythm === 'vt' ? 'vt' : 'pvc') : 'normal'];
    return {
      rhythm: p.rhythm, beats: beats, pWaves: pWaves, rr: rr, pp: pp, spikes: ev.spikes.filter(function (t) { return t >= 0 && t <= dur; }),
      flutter: ev.flutter ? { cycleMs: Math.round(ev.flutter.cl * 1000), conduction: p.conduction } : null,
      fibrillation: !!ev.fib, vf: !!ev.vf,
      rates: { ventricular: beats.length ? Math.round(ventRate) : 0, atrial: atrialRate ? Math.round(atrialRate) : null },
      rrCV: rr.length > 2 ? sd(rr) / mean(rr) : 0,
      intervals: intervals,
      axes: { qrs: nm && beats.length ? Math.round(frontalAngle(nm.mean)) : null, p: discrete.length ? Math.round(p.pAxis) : null, t: nm && beats.length ? Math.round(frontalAngle(nm.t)) : null }
    };
  }

  /* ====================================================================== measurement helpers */
  function getLeads(ecg) { return ecg && ecg.leads ? ecg.leads : ecg; }
  function aVFof(L) { if (L.aVF) return L.aVF; var out = new Array(L.II.length); for (var i = 0; i < out.length; i++) out[i] = L.II[i] - L.I[i] / 2; return out; }

  /**
   * Find QRS complexes from multi-lead "spatial velocity" (sum of absolute first differences). Returns [{on, off}] in s.
   * A simple, transparent detector good enough for clean synthetic or textbook tracings.
   */
  function detectQRS(leads, fs) {
    var names = ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'].filter(function (l) { return leads[l]; });
    if (!names.length) names = Object.keys(leads);
    var n = leads[names[0]].length, vel = new Float64Array(n), i;
    for (i = 1; i < n - 1; i++) { var s = 0; for (var k = 0; k < names.length; k++) { var a = leads[names[k]]; s += Math.abs(a[i + 1] - a[i - 1]); } vel[i] = s * fs / 2; } // mV/s
    var w = Math.max(1, Math.round(0.02 * fs)), sm = new Float64Array(n), acc = 0;
    for (i = 0; i < n; i++) { acc += vel[i]; if (i >= w) acc -= vel[i - w]; sm[i] = acc / Math.min(i + 1, w); }
    var sorted = Array.prototype.slice.call(sm).sort(function (a, b) { return a - b; });
    var hi = sorted[Math.floor(0.995 * (n - 1))], thr = 0.3 * hi, out = [];
    if (!(hi > 40)) return out; // no QRS-like slopes (summed spatial velocity below 40 mV/s): e.g. asystole
    i = 0;
    while (i < n) {
      if (sm[i] > thr) {
        var j = i; while (j < n && sm[j] > thr) j++;
        var pk = 0, pi = i; for (var q = i; q < j; q++) if (sm[q] > pk) { pk = sm[q]; pi = q; }
        var a0 = pi, b0 = pi;
        while (a0 > 0 && sm[a0] > 0.12 * pk) a0--;
        while (b0 < n - 1 && sm[b0] > 0.12 * pk) b0++;
        var on = (a0 - w / 2) / fs, off = (b0 - w / 2) / fs;
        if (out.length && on - out[out.length - 1].off < 0.12) { out[out.length - 1].off = Math.max(out[out.length - 1].off, off); }
        else out.push({ on: Math.max(0, on), off: Math.min((n - 1) / fs, off) });
        i = Math.max(j, b0) + 1;
      } else i++;
    }
    return out.filter(function (c) { return c.off - c.on > 0.03; });
  }

  function windows(ecg, fs) {
    var ann = ecg && ecg.annotations;
    if (ann && ann.beats) return ann.beats.filter(function (b) { return b.kind !== 'V' || ann.rhythm === 'vt'; }).map(function (b) { return { on: b.qrsOn, off: b.qrsOff, kind: b.kind }; });
    return ecg ? detectQRS(getLeads(ecg), fs) : [];
  }
  function baselineAt(arr, fs, t) {
    var i0 = Math.max(0, Math.round((t - 0.03) * fs)), i1 = Math.max(i0 + 1, Math.round((t - 0.008) * fs)), seg = [];
    for (var i = i0; i < i1 && i < arr.length; i++) seg.push(arr[i]);
    return seg.length ? median(seg) : 0;
  }

  /**
   * Mean frontal QRS axis from the net QRS in leads I and aVF (hexaxial: axis = atan2(2·aVF, √3·I)).
   * method 'area' (default) integrates the QRS (exact mean vector); 'amplitude' uses net deflection (R − S) as taught at the bedside.
   * Accepts a generate() result or a {I, II|aVF, ...} lead object (opts.fs, default 500).
   */
  function estimateAxis(ecg, opts) {
    opts = opts || {};
    var L = getLeads(ecg), fs = (ecg && ecg.fs) || opts.fs || 500, method = opts.method || 'area';
    if (!L || !L.I || !(L.aVF || L.II)) return null;
    var avf = aVFof(L), generated = !!(ecg && ecg.leads && ecg.annotations), wins = windows(generated ? ecg : null, fs);
    if (!wins.length && !generated) wins = detectQRS(L, fs);
    if (!wins.length) return null;
    var dom = wins;
    var sI = 0, sF = 0;
    dom.forEach(function (w) {
      var a = Math.max(0, Math.round(w.on * fs)), b = Math.min(L.I.length - 1, Math.round(w.off * fs));
      var bI = baselineAt(L.I, fs, w.on), bF = baselineAt(avf, fs, w.on);
      if (method === 'amplitude') {
        var maxI = -Infinity, minI = Infinity, maxF = -Infinity, minF = Infinity;
        for (var i = a; i <= b; i++) { var x = L.I[i] - bI, y = avf[i] - bF; if (x > maxI) maxI = x; if (x < minI) minI = x; if (y > maxF) maxF = y; if (y < minF) minF = y; }
        sI += maxI + minI; sF += maxF + minF;
      } else {
        for (var j = a; j <= b; j++) { sI += L.I[j] - bI; sF += avf[j] - bF; }
      }
    });
    if (Math.abs(sI) < 1e-9 && Math.abs(sF) < 1e-9) return null;
    return Math.round(Math.atan2(2 * sF, SQ3 * sI) / DEG);
  }

  /** Axis category by the quadrant method (I and aVF, with lead II for 0 to −30°). Normal −30° to +90° (AHA/ACCF/HRS 2009). */
  function classifyAxis(deg) {
    if (!isNum(deg)) return null;
    var a = wrapDeg(deg);
    if (a >= -30 && a <= 90) return { id: 'normal', label: 'Normal axis', range: '−30° to +90°' };
    if (a < -30 && a >= -90) return { id: 'left', label: 'Left axis deviation', range: '−30° to −90°' };
    if (a > 90 && a <= 180) return { id: 'right', label: 'Right axis deviation', range: '+90° to +180°' };
    return { id: 'extreme', label: 'Extreme (north-west) axis', range: '−90° to ±180°' };
  }
  /** Bedside quadrant reading from the polarity of the net QRS in I, aVF and II. */
  function quadrant(netI, netAVF, netII) {
    var I = netI >= 0, F = netAVF >= 0;
    if (I && F) return 'normal';
    if (I && !F) return netII == null ? 'left-or-normal' : (netII >= 0 ? 'normal' : 'left');
    if (!I && F) return 'right';
    return 'extreme';
  }

  /* ====================================================================== beat measurements */
  /**
   * Median-beat measurements per lead (mV, relative to the PR-segment baseline): q, r, s, peak-to-peak QRS, ST at J+60 ms
   * (J+40 ms when the RR is < 600 ms), T-wave extreme and P-wave extreme. Uses the dominant beat type.
   */
  function measureBeat(ecg, opts) {
    opts = opts || {};
    var ann = ecg.annotations, fs = ecg.fs, L = ecg.leads;
    var beats = ann.beats.filter(function (b) { return b.kind === (opts.kind || domKindOf(ann)); }).filter(function (b) { return b.qrsOn > 0.05 && b.tEnd < ecg.durationSec - 0.02; });
    if (!beats.length) return null;
    var stOff = opts.stOffset != null ? opts.stOffset : ((ann.intervals.rr || 1000) < 600 ? 0.04 : 0.06);
    var out = {};
    LEADS.forEach(function (l) {
      var arr = L[l], rec = { q: [], r: [], s: [], pp: [], st: [], t: [], p: [] };
      beats.forEach(function (b) {
        var base = baselineAt(arr, fs, b.qrsOn - (b.pr == null ? 0 : 0));
        var a = Math.round(b.qrsOn * fs), z = Math.round(b.qrsOff * fs);
        var mx = -Infinity, mi = Infinity, mxI = a;
        for (var i = a; i <= z; i++) { var v = arr[i] - base; if (v > mx) { mx = v; mxI = i; } if (v < mi) mi = v; }
        var q = 0, s = 0;
        for (var i2 = a; i2 < mxI; i2++) q = Math.min(q, arr[i2] - base);
        for (var i3 = mxI; i3 <= z; i3++) s = Math.min(s, arr[i3] - base);
        rec.q.push(-q); rec.r.push(Math.max(0, mx)); rec.s.push(-s); rec.pp.push(mx - mi);
        var js = Math.round((b.qrsOff + stOff) * fs); rec.st.push(arr[js] - base);
        var t0 = Math.round((b.qrsOff + 0.06) * fs), t1 = Math.round(b.tEnd * fs), te = 0;
        for (var i4 = t0; i4 <= t1 && i4 < arr.length; i4++) { var tv = arr[i4] - base; if (Math.abs(tv) > Math.abs(te)) te = tv; }
        rec.t.push(te);
        if (b.pr) {
          var p0 = Math.round((b.qrsOn - b.pr / 1000) * fs), p1 = Math.round((b.qrsOn - b.pr / 1000 + 0.12) * fs), pe = 0;
          var pb = baselineAt(arr, fs, b.qrsOn - b.pr / 1000);
          for (var i5 = Math.max(0, p0); i5 <= p1; i5++) { var pv = arr[i5] - pb; if (Math.abs(pv) > Math.abs(pe)) pe = pv; }
          rec.p.push(pe);
        }
      });
      out[l] = { q: median(rec.q), r: median(rec.r), s: median(rec.s), qrsPP: median(rec.pp), st: median(rec.st), t: median(rec.t), p: rec.p.length ? median(rec.p) : null };
    });
    return out;
  }
  function domKindOf(ann) {
    var c = {}, PRI = { N: 0, J: 1, E: 2, P: 3, S: 4, V: 5 };
    ann.beats.forEach(function (b) { c[b.kind] = (c[b.kind] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return (c[b] - c[a]) || ((PRI[a] || 9) - (PRI[b] || 9)); })[0];
  }

  /* ====================================================================== arithmetic */
  /**
   * Heart-rate-corrected QT (ms). qtMs: measured QT; rrMs: preceding RR interval.
   *  bazett     QTc = QT / √RR                  (Bazett 1920; RR in s)
   *  fridericia QTc = QT / ∛RR                  (Fridericia 1920)
   *  framingham QTc = QT + 154 × (1 − RR)       (Sagie et al. 1992; ms, RR in s)
   *  hodges     QTc = QT + 1.75 × (HR − 60)     (Hodges et al. 1983; HR = 60/RR)
   */
  function qtc(qtMs, rrMs, method) {
    if (!isNum(qtMs) || !isNum(rrMs) || qtMs <= 0 || rrMs <= 0) return null;
    var rr = rrMs / 1000;
    switch ((method || 'bazett').toLowerCase()) {
      case 'bazett': return qtMs / Math.sqrt(rr);
      case 'fridericia': return qtMs / Math.cbrt(rr);
      case 'framingham': case 'sagie': return qtMs + 154 * (1 - rr);
      case 'hodges': return qtMs + 1.75 * (60 / rr - 60);
      default: return null;
    }
  }
  /** Mean heart rate (beats/min) from RR intervals in ms (a single number or an array). */
  function heartRateFromRR(rr) {
    var a = Array.isArray(rr) ? rr.filter(function (x) { return isNum(x) && x > 0; }) : (isNum(rr) && rr > 0 ? [rr] : []);
    if (!a.length) return null;
    return 60000 / mean(a);
  }
  /** Bedside rate rules at 25 mm/s: 300 ÷ large squares, 1500 ÷ small squares, QRS count in 6 s × 10. */
  var rate = {
    rule300: function (largeSquares) { return largeSquares > 0 ? 300 / largeSquares : null; },
    rule1500: function (smallSquares) { return smallSquares > 0 ? 1500 / smallSquares : null; },
    sixSecond: function (qrsCount) { return isNum(qrsCount) && qrsCount >= 0 ? qrsCount * 10 : null; }
  };
  /** Sokolow–Lyon index for LVH: S(V1) + max(R(V5), R(V6)) ≥ 35 mm (Sokolow & Lyon 1949). Inputs in mm. */
  function sokolowLyon(sV1, rV5, rV6) {
    if (![sV1, rV5].every(isNum)) return null;
    var v = Math.abs(sV1) + Math.max(rV5, isNum(rV6) ? rV6 : -Infinity);
    return { value: v, threshold: 35, positive: v >= 35 };
  }
  /** Cornell voltage: R(aVL) + S(V3) > 28 mm (men) or > 20 mm (women) (Casale et al. 1985). Inputs in mm. */
  function cornell(rAVL, sV3, sex) {
    if (![rAVL, sV3].every(isNum)) return null;
    var v = rAVL + Math.abs(sV3), thr = sex === 'female' ? 20 : 28;
    return { value: v, threshold: thr, positive: v > thr };
  }
  /** Cornell product: (R aVL + S V3 [+ 6 mm in women]) × QRS duration > 2440 mm·ms (Molloy et al. 1992). */
  function cornellProduct(rAVL, sV3, sex, qrsMs) {
    if (![rAVL, sV3, qrsMs].every(isNum)) return null;
    var v = (rAVL + Math.abs(sV3) + (sex === 'female' ? 6 : 0)) * qrsMs;
    return { value: v, threshold: 2440, positive: v > 2440 };
  }
  /**
   * New ST elevation at the J point needed in 2 contiguous leads (mm), Fourth Universal Definition of MI (2018):
   * ≥ 1 mm in all leads other than V2–V3; in V2–V3 ≥ 2 mm (men ≥ 40 y), ≥ 2.5 mm (men < 40 y), ≥ 1.5 mm (women).
   * Posterior (V7–V9) ≥ 0.5 mm; right-sided V3R/V4R ≥ 0.5 mm (≥ 1 mm in men < 40 y).
   */
  function stemiThreshold(lead, sex, age) {
    if (lead === 'V2' || lead === 'V3') return sex === 'female' ? 1.5 : (isNum(age) && age < 40 ? 2.5 : 2);
    if (/^V[789]$/.test(lead)) return isNum(age) && age < 40 && sex !== 'female' ? 1 : 0.5;
    if (/^V[34]R$/.test(lead)) return isNum(age) && age < 40 && sex !== 'female' ? 1 : 0.5;
    return 1;
  }

  /* ====================================================================== catalogue */
  /** Reference list (cited in the UI next to each diagnosis). */
  var REFS = {
    kligfield2007: 'Kligfield P et al. AHA/ACCF/HRS recommendations for the standardization and interpretation of the ECG, Part I: the ECG and its technology. Circulation 2007;115:1306-1324.',
    mason2007: 'Mason JW et al. AHA/ACCF/HRS recommendations, Part II: electrocardiography diagnostic statement list. Circulation 2007;115:1325-1332.',
    surawicz2009: 'Surawicz B et al. AHA/ACCF/HRS recommendations, Part III: intraventricular conduction disturbances. Circulation 2009;119:e235-e240.',
    rautaharju2009: 'Rautaharju PM et al. AHA/ACCF/HRS recommendations, Part IV: the ST segment, T and U waves, and the QT interval. Circulation 2009;119:e241-e250.',
    hancock2009: 'Hancock EW et al. AHA/ACCF/HRS recommendations, Part V: ECG changes associated with cardiac chamber hypertrophy. Circulation 2009;119:e251-e261.',
    wagner2009: 'Wagner GS et al. AHA/ACCF/HRS recommendations, Part VI: acute ischemia/infarction. Circulation 2009;119:e262-e270.',
    udmi2018: 'Thygesen K et al. Fourth Universal Definition of Myocardial Infarction (2018). Circulation 2018;138:e618-e651.',
    esc2023acs: 'Byrne RA et al. 2023 ESC Guidelines for the management of acute coronary syndromes. Eur Heart J 2023;44:3720-3826.',
    esc2024af: 'Van Gelder IC et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45:3314-3414.',
    esc2019svt: 'Brugada J et al. 2019 ESC Guidelines for the management of patients with supraventricular tachycardia. Eur Heart J 2020;41:655-720.',
    acc2018brady: 'Kusumoto FM et al. 2018 ACC/AHA/HRS guideline on the evaluation and management of patients with bradycardia and cardiac conduction delay. Circulation 2019;140:e382-e482.',
    esc2021pacing: 'Glikson M et al. 2021 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy. Eur Heart J 2021;42:3427-3520.',
    esc2022va: 'Zeppenfeld K et al. 2022 ESC Guidelines for the management of patients with ventricular arrhythmias and the prevention of sudden cardiac death. Eur Heart J 2022;43:3997-4126.',
    erc2021: 'Soar J et al. European Resuscitation Council Guidelines 2021: adult advanced life support. Resuscitation 2021;161:115-151.',
    esc2015peri: 'Adler Y et al. 2015 ESC Guidelines for the diagnosis and management of pericardial diseases. Eur Heart J 2015;36:2921-2964.',
    spodick2003: 'Spodick DH. Acute pericarditis: current concepts and practice. JAMA 2003;289:1150-1153.',
    ginzton1982: 'Ginzton LE, Laks MM. The differential diagnosis of acute pericarditis from the normal variant: new electrocardiographic criteria. Circulation 1982;65:1004-1009.',
    brugada1991: 'Brugada P et al. A new approach to the differential diagnosis of a regular tachycardia with a wide QRS complex. Circulation 1991;83:1649-1659.',
    vereckei2008: 'Vereckei A et al. New algorithm using only lead aVR for differential diagnosis of wide QRS complex tachycardia. Heart Rhythm 2008;5:89-98.',
    drew2010: 'Drew BJ et al. Prevention of torsade de pointes in hospital settings: AHA/ACCF scientific statement. Circulation 2010;121:1047-1060.',
    sgarbossa1996: 'Sgarbossa EB et al. ECG diagnosis of evolving acute myocardial infarction in the presence of left bundle-branch block. N Engl J Med 1996;334:481-487.',
    smith2012: 'Smith SW et al. Diagnosis of STEMI in the presence of LBBB with the ST-elevation to S-wave ratio in a modified Sgarbossa rule. Ann Emerg Med 2012;60:766-776.',
    sokolow1949: 'Sokolow M, Lyon TP. The ventricular complex in left ventricular hypertrophy as obtained by unipolar precordial and limb leads. Am Heart J 1949;37:161-186.',
    casale1985: 'Casale PN et al. Electrocardiographic detection of left ventricular hypertrophy: development and prospective validation of improved criteria. J Am Coll Cardiol 1985;6:572-580.',
    molloy1992: 'Molloy TJ et al. Electrocardiographic detection of left ventricular hypertrophy by the simple QRS voltage-duration product. J Am Coll Cardiol 1992;20:1180-1186.',
    diercks2004: 'Diercks DB et al. Electrocardiographic manifestations: electrolyte abnormalities. J Emerg Med 2004;27:153-160.',
    montague2008: 'Montague BT, Ouellette JR, Buller GK. Retrospective review of the frequency of ECG changes in hyperkalemia. Clin J Am Soc Nephrol 2008;3:324-330.',
    ukka2020: 'UK Kidney Association (Renal Association). Clinical practice guideline: treatment of acute hyperkalaemia in adults (2020).',
    priori2013: 'Priori SG et al. HRS/EHRA/APHRS expert consensus statement on the diagnosis and management of patients with inherited primary arrhythmia syndromes. Heart Rhythm 2013;10:1932-1963.',
    madias2008: 'Madias JE. Low QRS voltage and its causes. J Electrocardiol 2008;41:498-500.',
    bazett1920: 'Bazett HC. An analysis of the time-relations of electrocardiograms. Heart 1920;7:353-370.',
    fridericia1920: 'Fridericia LS. Die Systolendauer im Elektrokardiogramm bei normalen Menschen und bei Herzkranken. Acta Med Scand 1920;53:469-486.',
    sagie1992: 'Sagie A et al. An improved method for adjusting the QT interval for heart rate (the Framingham Heart Study). Am J Cardiol 1992;70:797-801.',
    hodges1983: 'Hodges M et al. Bazett\'s QT correction reviewed: evidence that a linear QT correction for heart rate is better. J Am Coll Cardiol 1983;1:694 (abstract).',
    mcsharry2003: 'McSharry PE, Clifford GD, Tarassenko L, Smith LA. A dynamical model for generating synthetic electrocardiogram signals. IEEE Trans Biomed Eng 2003;50:289-294.',
    sameni2007: 'Sameni R, Clifford GD, Jutten C, Shamsollahi MB. Multichannel ECG and noise modeling: application to maternal and fetal ECG signals. EURASIP J Adv Signal Process 2007:43407.',
    dower1980: 'Dower GE, Machado HB, Osborne JA. On deriving the electrocardiogram from vectorcardiographic leads. Clin Cardiol 1980;3:87-95.'
  };

  /** Lead groups used for territories and highlighting. */
  var TERRITORIES = {
    inferior: { leads: ['II', 'III', 'aVF'], artery: 'Right coronary artery (~80%) or left circumflex', reciprocal: ['aVL', 'I'] },
    lateral: { leads: ['I', 'aVL', 'V5', 'V6'], artery: 'Left circumflex or diagonal branch of the LAD', reciprocal: ['III', 'aVF'] },
    septal: { leads: ['V1', 'V2'], artery: 'Septal branches of the LAD', reciprocal: [] },
    anterior: { leads: ['V1', 'V2', 'V3', 'V4'], artery: 'Left anterior descending artery', reciprocal: ['III', 'aVF'] },
    posterior: { leads: ['V7', 'V8', 'V9'], artery: 'Left circumflex or right coronary artery (posterior descending)', reciprocal: ['V1', 'V2', 'V3'] },
    rightVentricle: { leads: ['V4R'], artery: 'Proximal right coronary artery', reciprocal: [] }
  };

  var GROUPS = [
    { id: 'sinus', title: 'Sinus rhythms' },
    { id: 'svt', title: 'Atrial & junctional' },
    { id: 'ventricular', title: 'Ventricular rhythms' },
    { id: 'block', title: 'AV block' },
    { id: 'conduction', title: 'Conduction & hypertrophy' },
    { id: 'ischaemia', title: 'Ischaemia & infarction' },
    { id: 'metabolic', title: 'Electrolytes, QT & other' }
  ];

  // tier: 1 beginner, 2 intermediate, 3 advanced. vary: quiz randomisation ranges (uniform). key: the one-line discriminator.
  var DIAGNOSES = [
    { id: 'normal', group: 'sinus', tier: 1, name: 'Normal sinus rhythm', short: 'Normal sinus rhythm',
      summary: 'Sinus P waves at 60–100/min, each followed by a narrow QRS with a constant, normal PR interval; normal axis, intervals and repolarisation.',
      key: 'regular sinus P waves at 60–100/min, each conducted with a normal PR, and normal intervals and morphology',
      params: { hr: 72, axis: 60 }, vary: { hr: [62, 94], axis: [15, 85] },
      features: ['Rate 60–100/min and regular.', 'P waves upright in I and II and inverted in aVR — one before every QRS, constant PR 120–200 ms.', 'Narrow QRS (< 120 ms), normal axis, R-wave progression with the transition around V3–V4; small septal q waves in I, aVL, V5–V6.', 'T waves upright in I, II and V2–V6, inverted in aVR; QTc within the reference range.'],
      criteria: ['Sinus P-wave axis 0° to +75° (upright in I and II).', 'Rate 60–100/min.', 'PR 120–200 ms; QRS < 120 ms; QRS axis −30° to +90°.', 'QTc < 450 ms (men) / < 460 ms (women).'],
      pearls: ['Interpret in the clinical context and compare with a previous ECG whenever possible.', 'A "normal" ECG does not exclude acute coronary syndrome — repeat it if symptoms persist.'],
      refs: ['kligfield2007', 'mason2007', 'rautaharju2009'], confusers: ['sinus-arrhythmia', 'sinus-brady', 'sinus-tachy', 'avb1'] },
    { id: 'sinus-brady', group: 'sinus', tier: 1, name: 'Sinus bradycardia', short: 'Sinus bradycardia',
      summary: 'Sinus rhythm with a rate below 60/min; every P wave is conducted with a constant PR.',
      key: 'normal sinus P waves, each conducted, at a rate below 60/min',
      params: { hr: 46, qtc: 415 }, vary: { hr: [38, 54] },
      features: ['Regular rhythm, rate < 60/min (here about 45/min).', 'Normal sinus P waves, each followed by a QRS with a constant PR.', 'Normal QRS, ST and T; long TP segment.'],
      criteria: ['Sinus rhythm at < 60/min (traditional ECG definition; the 2018 ACC/AHA/HRS bradycardia guideline uses < 50/min).'],
      pearls: ['Often physiological (athletes, sleep).', 'Look for causes: β-blockers, calcium-channel blockers, digoxin, hypothyroidism, hypothermia, raised intracranial pressure, inferior MI, sinus node dysfunction.', 'Treat the patient, not the number — symptoms and haemodynamics decide.'],
      refs: ['acc2018brady', 'mason2007'], confusers: ['junctional', 'avb1', 'avb3', 'normal'] },
    { id: 'sinus-tachy', group: 'sinus', tier: 1, name: 'Sinus tachycardia', short: 'Sinus tachycardia',
      summary: 'Sinus rhythm faster than 100/min with a normal P wave before every QRS.',
      key: 'normal sinus P waves before every QRS at more than 100/min, with gradual rate changes',
      params: { hr: 122, pr: 140, qtc: 420 }, vary: { hr: [106, 145] },
      features: ['Regular rhythm, rate > 100/min (here about 120/min).', 'Upright P waves in I and II before every QRS (the P may start to merge with the preceding T wave).', 'Short, constant PR; narrow QRS.'],
      criteria: ['Sinus rhythm at > 100/min.'],
      pearls: ['Almost always a response to something: pain, fever, hypovolaemia, sepsis, anaemia, hypoxia, pulmonary embolism, thyrotoxicosis, anxiety, stimulants.', 'Treat the cause. A regular narrow tachycardia at exactly ~150/min should make you look for flutter waves.'],
      refs: ['mason2007', 'esc2019svt'], confusers: ['svt', 'flutter-21', 'af', 'normal'] },
    { id: 'sinus-arrhythmia', group: 'sinus', tier: 3, name: 'Sinus arrhythmia', short: 'Sinus arrhythmia',
      summary: 'Sinus rhythm whose rate varies phasically with breathing; P-wave shape and PR interval stay constant.',
      key: 'identical sinus P waves and constant PR with a cyclical (respiratory) variation of the P–P/R–R intervals',
      params: { rhythm: 'sinus-arrhythmia', hr: 68 }, vary: { hr: [58, 80] },
      features: ['Irregular, but regularly irregular: R–R intervals shorten and lengthen in cycles of a few seconds.', 'Every QRS preceded by an identical sinus P wave with a constant PR.', 'Narrow QRS, normal morphology.'],
      criteria: ['Sinus P waves with P–P variation of more than 0.12 s (some texts use 0.16 s), phasic with respiration.'],
      pearls: ['Respiratory sinus arrhythmia is normal, especially in children and young adults (vagal tone).', 'Non-respiratory sinus arrhythmia in older people can reflect sinus node disease.'],
      refs: ['mason2007'], confusers: ['af', 'pac', 'normal', 'avb2-mobitz1'] },
    { id: 'af', group: 'svt', tier: 1, name: 'Atrial fibrillation', short: 'Atrial fibrillation',
      summary: 'Chaotic atrial activity without organised P waves and an irregularly irregular ventricular response.',
      key: 'irregularly irregular R–R intervals with no P waves (fibrillatory baseline)',
      params: { rhythm: 'af', hr: 105, fibAmp: 0.06 }, vary: { hr: [72, 140], fibAmp: [0.03, 0.08] },
      features: ['Irregularly irregular R–R intervals — no pattern at all.', 'No P waves; a fine or coarse fibrillatory (f-wave) baseline, usually best seen in V1 and the inferior leads.', 'Narrow QRS (unless there is bundle branch block or aberrancy); ventricular rate here about 100–110/min.'],
      criteria: ['Irregularly irregular R–R intervals and no distinct repeating P waves on a 12-lead ECG, or ≥ 30 s on a single-lead recording (ESC 2024).'],
      pearls: ['Assess stroke risk (CHA₂DS₂-VA) and anticoagulate unless contraindicated; control rate or rhythm; look for triggers such as sepsis, thyrotoxicosis, alcohol and valve disease (ESC 2024).', 'Haemodynamically unstable AF needs urgent electrical cardioversion.', 'Use the 6-second method (or count all QRS complexes in the 10-s strip × 6) to estimate the rate of an irregular rhythm.'],
      refs: ['esc2024af', 'mason2007'], confusers: ['flutter-41', 'sinus-arrhythmia', 'pac', 'avb2-mobitz1'] },
    { id: 'flutter-41', group: 'svt', tier: 1, name: 'Atrial flutter with 4:1 block', short: 'Atrial flutter (4:1)',
      summary: 'Typical atrial flutter: a "sawtooth" of flutter waves at about 300/min with every fourth wave conducted (ventricular rate ~75/min).',
      key: 'regular sawtooth flutter waves at ~300/min with a fixed conduction ratio',
      params: { rhythm: 'flutter', conduction: 4, atrialRate: 300, hr: 75 }, vary: { atrialRate: [280, 320] },
      features: ['Continuous sawtooth flutter (F) waves with no isoelectric baseline, atrial rate about 300/min (one F wave per large square).', 'F waves negative in II, III and aVF and positive in V1 — typical counter-clockwise cavotricuspid-isthmus flutter.', 'Regular ventricular response with 4 F waves per QRS (about 75/min); narrow QRS.'],
      criteria: ['Uniform, continuous atrial activity at 250–350/min with a fixed (or variable) AV conduction ratio.'],
      pearls: ['Anticoagulate as for AF.', 'Cavotricuspid-isthmus ablation is highly effective for typical flutter (ESC 2019).', 'Turn the ECG upside down or look at II, III and aVF to see the sawtooth.'],
      refs: ['esc2019svt', 'mason2007'], confusers: ['af', 'flutter-21', 'sinus-brady', 'avb3'] },
    { id: 'flutter-21', group: 'svt', tier: 2, name: 'Atrial flutter with 2:1 block', short: 'Atrial flutter (2:1)',
      summary: 'Atrial flutter at about 300/min with alternate F waves conducted: a regular narrow-complex tachycardia at ~150/min.',
      key: 'a regular narrow tachycardia at ~150/min with two flutter waves per QRS (one hidden in the ST/T)',
      params: { rhythm: 'flutter', conduction: 2, atrialRate: 300, hr: 150 }, vary: { atrialRate: [280, 316] },
      features: ['Regular narrow-complex tachycardia at about 150/min.', 'Two F waves per QRS: one before the QRS and one buried at the end of the QRS / in the ST–T — look at II, III, aVF and V1.', 'Sawtooth negative F waves in the inferior leads, positive in V1.'],
      criteria: ['Atrial activity at 250–350/min with 2:1 AV conduction (ventricular rate ≈ half the atrial rate).'],
      pearls: ['A regular narrow-complex tachycardia at ~150/min is flutter with 2:1 block until proven otherwise.', 'Vagal manoeuvres or adenosine transiently increase the block and unmask the F waves (diagnostic, rarely curative).'],
      refs: ['esc2019svt', 'mason2007'], confusers: ['svt', 'sinus-tachy', 'af', 'flutter-41'] },
    { id: 'svt', group: 'svt', tier: 2, name: 'AV nodal re-entrant tachycardia (SVT)', short: 'AVNRT (SVT)',
      summary: 'A regular narrow-complex re-entrant tachycardia (~180/min) with P waves hidden in, or just after, the QRS.',
      key: 'a regular narrow tachycardia (~150–250/min) with no visible P waves before the QRS (pseudo-r′ in V1)',
      params: { rhythm: 'svt', hr: 182, qtc: 400, pr: 140 }, vary: { hr: [160, 215] },
      features: ['Regular narrow-complex tachycardia, here about 180/min.', 'No P waves before the QRS: retrograde P waves are buried in or appear at the very end of the QRS — "pseudo-r′" in V1 and "pseudo-S" in II, III and aVF.', 'Rate-related ST depression may be present and does not by itself mean ischaemia.'],
      criteria: ['Regular narrow-QRS tachycardia (usually 140–280/min) with a very short RP interval (< 70 ms) in typical slow–fast AVNRT (ESC 2019).'],
      pearls: ['Haemodynamically unstable → synchronised DC cardioversion.', 'Stable → modified Valsalva manoeuvre, then adenosine (ESC 2019).', 'Catheter ablation of the slow pathway is curative in most patients.'],
      refs: ['esc2019svt'], confusers: ['sinus-tachy', 'flutter-21', 'af', 'vt'] },
    { id: 'junctional', group: 'svt', tier: 2, name: 'Junctional rhythm', short: 'Junctional rhythm',
      summary: 'A regular, narrow-complex escape rhythm from the AV junction at 40–60/min with absent or retrograde P waves.',
      key: 'a regular narrow rhythm at 40–60/min with inverted (retrograde) P waves in II/III/aVF and a short PR',
      params: { rhythm: 'junctional', hr: 48 }, vary: { hr: [40, 58] },
      features: ['Regular rhythm, rate 40–60/min (here about 48/min).', 'Retrograde P waves: inverted in II, III and aVF, upright in aVR, with a short PR (< 120 ms) — they can also be hidden in or follow the QRS.', 'Narrow QRS with normal morphology.'],
      criteria: ['Junctional escape rhythm 40–60/min; accelerated junctional rhythm 60–100/min; junctional tachycardia > 100/min.'],
      pearls: ['Usually an escape rhythm when the sinus node fails: drugs (β-blockers, calcium-channel blockers, digoxin), sinus node disease, inferior MI, after cardiac surgery.'],
      refs: ['acc2018brady', 'mason2007'], confusers: ['sinus-brady', 'avb3', 'avb1', 'avb2-mobitz2'] },
    { id: 'pac', group: 'svt', tier: 2, name: 'Premature atrial complexes', short: 'Premature atrial complexes',
      summary: 'Sinus rhythm interrupted by early beats that start with an abnormal P wave and conduct with a normal QRS.',
      key: 'early beats preceded by a differently shaped P wave, with a narrow QRS and a non-compensatory pause',
      params: { rhythm: 'pac', hr: 76 }, vary: { hr: [64, 92] },
      features: ['Underlying sinus rhythm.', 'Premature beats preceded by a P wave of different shape/axis (look closely in the T wave of the previous beat).', 'Narrow QRS like the sinus beats; the following pause is less than compensatory because the sinus node is reset.'],
      criteria: ['Premature P wave of non-sinus morphology, usually followed by a QRS (it may be blocked or conducted with aberrancy).'],
      pearls: ['Common and usually benign; triggers include caffeine, alcohol, stress, structural heart disease.', 'Frequent PACs are associated with incident atrial fibrillation.'],
      refs: ['mason2007', 'esc2019svt'], confusers: ['pvc', 'sinus-arrhythmia', 'af', 'avb2-mobitz2'] },
    { id: 'pvc', group: 'ventricular', tier: 1, name: 'Premature ventricular complexes', short: 'Premature ventricular complexes',
      summary: 'Sinus rhythm with early, broad, bizarre QRS complexes that are not preceded by a P wave.',
      key: 'early broad bizarre QRS complexes without a preceding P wave, discordant T waves and a compensatory pause',
      params: { rhythm: 'pvc', hr: 76 }, vary: { hr: [64, 90] },
      features: ['Underlying sinus rhythm.', 'Premature, broad (≥ 120 ms) QRS complexes with no preceding P wave; the ST segment and T wave point opposite to the main QRS deflection.', 'Fully compensatory pause: the sinus P wave falling inside the PVC is not conducted, so the next sinus beat comes on time.', 'Here LBBB-like with an inferior axis — the classic right-ventricular outflow-tract PVC.'],
      criteria: ['Premature QRS ≥ 120 ms, not preceded by a premature P wave, with secondary ST–T changes.'],
      pearls: ['Check potassium, magnesium, ischaemia, drugs and structural heart disease.', 'A high PVC burden (> 10–20%) can cause a reversible cardiomyopathy (ESC 2022).'],
      refs: ['esc2022va', 'mason2007'], confusers: ['pac', 'bigeminy', 'vt', 'af'] },
    { id: 'bigeminy', group: 'ventricular', tier: 2, name: 'Ventricular bigeminy', short: 'Ventricular bigeminy',
      summary: 'Every sinus beat is followed by a premature ventricular complex at a fixed coupling interval.',
      key: 'alternating sinus beats and PVCs (N-V-N-V) with a fixed coupling interval',
      params: { rhythm: 'pvc', hr: 78, ectopicEvery: 1 }, vary: { hr: [66, 92] },
      features: ['Alternating sinus beat and broad PVC (N–V–N–V…), giving grouped beating.', 'Fixed coupling interval between each sinus beat and its PVC; compensatory pause after each PVC.', 'The sinus P wave after each PVC is hidden in its ST–T and not conducted.'],
      criteria: ['A PVC after every sinus beat (trigeminy: after every second beat).'],
      pearls: ['The pulse may feel slow or irregular because PVCs can be haemodynamically ineffective.', 'Think of digoxin toxicity, ischaemia, hypokalaemia and hypomagnesaemia.'],
      refs: ['esc2022va', 'mason2007'], confusers: ['pvc', 'pac', 'vt', 'af'] },
    { id: 'vt', group: 'ventricular', tier: 1, name: 'Monomorphic ventricular tachycardia', short: 'Ventricular tachycardia',
      summary: 'A regular broad-complex tachycardia of ventricular origin with uniform QRS complexes and AV dissociation.',
      key: 'a regular broad-complex tachycardia with uniform QRS complexes, AV dissociation and an extreme axis',
      params: { rhythm: 'vt', hr: 168, qrs: 160, atrialRate: 80 }, vary: { hr: [140, 200], atrialRate: [70, 95] },
      features: ['Regular broad-complex tachycardia (QRS ~160 ms) at about 170/min, every complex alike (monomorphic).', 'AV dissociation: P waves at a slower, independent rate occasionally deform the QRS/ST — look at the rhythm strip.', 'Extreme ("north-west") axis with a dominant R wave in aVR; RBBB-like V1 with a monophasic R; deep S/QS in V6.', 'No RS complex with a normal-looking short RS interval in the precordial leads.'],
      criteria: ['≥ 3 consecutive ventricular beats at > 100/min; sustained if ≥ 30 s or requiring termination (ESC 2022).', 'Favouring VT over SVT with aberrancy: AV dissociation, capture/fusion beats, extreme axis, QRS > 160 ms, absent RS in V1–V6 or RS > 100 ms, initial R in aVR (Brugada 1991; Vereckei 2008).'],
      pearls: ['Treat any regular broad-complex tachycardia as VT until proven otherwise — especially with known heart disease.', 'No pulse → advanced life support with defibrillation; pulse but unstable → synchronised cardioversion; stable → specialist advice, amiodarone or procainamide per local protocol (ERC 2021; ESC 2022).'],
      refs: ['esc2022va', 'brugada1991', 'vereckei2008', 'erc2021'], confusers: ['svt', 'torsades', 'paced', 'vf'] },
    { id: 'torsades', group: 'ventricular', tier: 3, name: 'Torsades de pointes', short: 'Torsades de pointes',
      summary: 'Polymorphic VT with a twisting QRS axis, triggered here by an R-on-T beat on a background of a long QT interval.',
      key: 'polymorphic VT whose QRS amplitude and polarity twist around the baseline, after a long QT',
      params: { rhythm: 'torsades', hr: 64, qtc: 600, uAmp: 0.06, tWidth: 1.15 }, vary: { hr: [56, 74], qtc: [560, 640] },
      features: ['The first beats show sinus rhythm with marked QT prolongation (QTc ~600 ms).', 'An early ventricular beat lands on the T wave (R-on-T) and starts a rapid (200–250/min) polymorphic VT.', 'The QRS complexes wax and wane and flip polarity, appearing to twist around the isoelectric line ("spindles").'],
      criteria: ['Polymorphic VT with a continuously changing QRS axis in the setting of QT prolongation (drug-induced or congenital).'],
      pearls: ['Give IV magnesium sulfate (2 g), correct potassium (aim 4.5–5 mmol/L) and stop all QT-prolonging drugs; overdrive pacing or isoprenaline for pause-dependent torsades; defibrillate if pulseless (Drew 2010; ESC 2022).'],
      refs: ['drew2010', 'esc2022va', 'rautaharju2009'], confusers: ['vf', 'vt', 'long-qt', 'af'] },
    { id: 'vf', group: 'ventricular', tier: 1, name: 'Ventricular fibrillation', short: 'Ventricular fibrillation',
      summary: 'Chaotic, disorganised ventricular activity with no identifiable QRS complexes — cardiac arrest.',
      key: 'chaotic irregular deflections of varying amplitude with no identifiable P, QRS or T waves',
      params: { rhythm: 'vf' }, vary: {},
      features: ['Chaotic, irregular waveform of constantly changing amplitude and shape.', 'No identifiable P waves, QRS complexes or T waves.', 'Coarse (as here) or fine; fine VF can mimic asystole.'],
      criteria: ['Rapid, grossly irregular ventricular electrical activity with marked variability in waveform, usually 150–500/min.'],
      pearls: ['Cardiac arrest with a shockable rhythm: start CPR and defibrillate immediately; adrenaline and amiodarone after the third shock (ERC 2021).', 'If the patient is talking to you it is artefact — check the leads.'],
      refs: ['erc2021', 'esc2022va'], confusers: ['torsades', 'vt', 'asystole', 'af'] },
    { id: 'asystole', group: 'ventricular', tier: 1, name: 'Asystole', short: 'Asystole',
      summary: 'Absence of any ventricular electrical activity — a flat line apart from baseline drift.',
      key: 'an essentially flat line with no QRS complexes',
      params: { rhythm: 'asystole', noise: 0.5 }, vary: {},
      features: ['No QRS complexes; only slow baseline drift and noise.', 'No P waves here (if P waves are present without QRS complexes this is "P-wave asystole" / ventricular standstill — pace it).'],
      criteria: ['Absent ventricular electrical activity, confirmed in more than one lead with adequate gain.'],
      pearls: ['Check that the leads are attached and the gain is up; fine VF can look like asystole.', 'Non-shockable cardiac arrest: CPR, adrenaline as soon as possible, and treat reversible causes (4 Hs and 4 Ts) (ERC 2021).'],
      refs: ['erc2021'], confusers: ['vf', 'avb3', 'low-voltage', 'sinus-brady'] },
    { id: 'paced', group: 'ventricular', tier: 2, name: 'Ventricular paced rhythm', short: 'Ventricular paced rhythm',
      summary: 'Regular pacing spikes, each immediately followed by a broad QRS (right-ventricular apical pacing).',
      key: 'sharp pacing spikes each followed by a broad LBBB-like QRS with a superior axis',
      params: { rhythm: 'paced', hr: 60 }, vary: { hr: [60, 72] },
      features: ['Narrow vertical pacing spikes at a fixed rate (here 60/min, VVI).', 'Each spike is followed immediately by a broad QRS (~150 ms): ventricular capture.', 'Right-ventricular apical pacing: LBBB-like V1 with a left (superior) axis — negative QRS in II, III and aVF.', 'ST segments and T waves discordant to the QRS (expected).'],
      criteria: ['Pacing stimulus artefact followed by a wide QRS complex at the programmed rate.'],
      pearls: ['Check capture (spike → QRS), sensing (no spikes falling inappropriately) and rate.', 'The (modified) Sgarbossa criteria can be applied to paced rhythms when acute MI is suspected (ESC 2023).'],
      refs: ['esc2021pacing', 'sgarbossa1996', 'smith2012'], confusers: ['lbbb', 'vt', 'avb3', 'pvc'] },
    { id: 'avb1', group: 'block', tier: 1, name: 'First-degree AV block', short: 'First-degree AV block',
      summary: 'Sinus rhythm in which every P wave is conducted, but with a PR interval longer than 200 ms.',
      key: 'every P conducted with a constant PR longer than 200 ms',
      params: { rhythm: 'avb1', pr: 290, hr: 70 }, vary: { pr: [230, 340], hr: [58, 86] },
      features: ['Sinus rhythm, every P wave followed by a QRS.', 'PR interval prolonged (> 200 ms, here about 290 ms — more than one large square) and constant.', 'Normal QRS.'],
      criteria: ['PR interval > 200 ms with 1:1 AV conduction.'],
      pearls: ['Usually benign: high vagal tone, AV-nodal drugs, inferior MI, Lyme disease, rheumatic fever, degenerative conduction disease.', 'A very long PR (> 300 ms) can cause symptoms similar to pacemaker syndrome.'],
      refs: ['acc2018brady', 'mason2007'], confusers: ['avb2-mobitz1', 'normal', 'avb2-mobitz2', 'sinus-brady'] },
    { id: 'avb2-mobitz1', group: 'block', tier: 2, name: 'Second-degree AV block, Mobitz I (Wenckebach)', short: 'Mobitz I (Wenckebach)',
      summary: 'Progressive PR prolongation until a P wave is not conducted, in repeating groups.',
      key: 'progressive PR prolongation until a P wave is blocked (dropped QRS), then the cycle repeats',
      params: { rhythm: 'avb2-mobitz1', hr: 80, pr: 200, ratio: 4 }, vary: { hr: [72, 96], ratio: [3, 5], pr: [170, 220] },
      features: ['Regular sinus P waves (P–P constant).', 'The PR interval lengthens beat by beat (biggest increment after the pause) until one P wave is not followed by a QRS.', 'The PR after the pause is the shortest; the R–R intervals shorten before the dropped beat — "grouped beating".'],
      criteria: ['Progressive PR prolongation before a single non-conducted P wave; the PR after the blocked P is shorter than the PR before it (ACC/AHA/HRS 2018).'],
      pearls: ['Usually AV-nodal and benign (athletes, sleep, inferior MI, AV-nodal drugs).', 'Compare the PR just before and just after the pause: different → Wenckebach; identical → Mobitz II.'],
      refs: ['acc2018brady', 'mason2007'], confusers: ['avb2-mobitz2', 'avb3', 'avb1', 'pac'] },
    { id: 'avb2-mobitz2', group: 'block', tier: 2, name: 'Second-degree AV block, Mobitz II', short: 'Mobitz II',
      summary: 'Intermittent non-conducted P waves with a constant PR interval in the conducted beats.',
      key: 'a constant PR with sudden, unpredictable non-conducted P waves (dropped QRS)',
      params: { rhythm: 'avb2-mobitz2', hr: 78, pr: 180, ratio: 4, morph: 'rbbb', qrs: 136, axis: 75 }, vary: { hr: [68, 92], ratio: [3, 5], pr: [150, 200] },
      features: ['Regular sinus P waves.', 'PR interval constant in all conducted beats — no progressive prolongation — and the PR after the dropped beat equals the PR before it.', 'Some P waves are suddenly not conducted (dropped QRS).', 'Often accompanied by bundle branch block (here RBBB), as the block is usually below the AV node.'],
      criteria: ['Non-conducted P waves with constant PR intervals before and after the blocked P (ACC/AHA/HRS 2018).'],
      pearls: ['Usually infranodal (His–Purkinje): high risk of sudden progression to complete heart block — permanent pacing is indicated (ESC 2021).', 'Fixed 2:1 block cannot be classified as Mobitz I or II from the surface ECG alone.'],
      refs: ['acc2018brady', 'esc2021pacing', 'mason2007'], confusers: ['avb2-mobitz1', 'avb3', 'avb1', 'pac'] },
    { id: 'avb3', group: 'block', tier: 1, name: 'Third-degree (complete) AV block', short: 'Complete heart block',
      summary: 'No atrial impulses reach the ventricles: P waves and QRS complexes march independently, with a slow escape rhythm.',
      key: 'regular P waves and a slower, regular escape rhythm with no relationship between them (variable PR)',
      params: { rhythm: 'avb3', atrialRate: 92, escapeRate: 40, escape: 'junctional' }, vary: { atrialRate: [76, 104], escapeRate: [32, 48] },
      features: ['Regular P waves (here about 90/min) that "march through" the tracing, sometimes hidden in QRS complexes or T waves.', 'Regular, slow QRS rhythm (here about 40/min) — an escape rhythm (junctional if narrow, ventricular if broad).', 'No consistent PR interval: AV dissociation with an atrial rate faster than the ventricular rate.'],
      criteria: ['Complete absence of AV conduction: atrial and ventricular activity independent, atrial rate > ventricular rate (ACC/AHA/HRS 2018).'],
      pearls: ['Usually needs pacing (temporary, then permanent); atropine may help junctional escapes; transcutaneous pacing or isoprenaline as a bridge.', 'Causes: degenerative conduction disease, inferior MI (often transient), drugs, Lyme disease, cardiac surgery.'],
      refs: ['acc2018brady', 'esc2021pacing'], confusers: ['avb2-mobitz2', 'avb2-mobitz1', 'junctional', 'sinus-brady'] },
    { id: 'rbbb', group: 'conduction', tier: 2, name: 'Right bundle branch block', short: 'Right bundle branch block',
      summary: 'Delayed right-ventricular activation: QRS ≥ 120 ms with an rSR′ in V1 and a broad S wave in I and V6.',
      key: 'QRS ≥ 120 ms with rSR′ ("M") in V1 and a broad slurred S wave in I and V6',
      params: { morph: 'rbbb', qrs: 140, axis: 70, hr: 74 }, vary: { axis: [35, 100], qrs: [126, 156], hr: [60, 92] },
      features: ['QRS ≥ 120 ms (here ~140 ms).', 'rSR′ ("M"-shaped) complex in V1–V2 with a tall terminal R′.', 'Broad, slurred terminal S wave in I, aVL, V5 and V6 ("W"-shaped V6).', 'Secondary ST depression and T-wave inversion in V1–V3.'],
      criteria: ['QRS ≥ 120 ms (adults); rsr′, rsR′ or rSR′ in V1 or V2 (R′ usually wider than r); S wave in I and V6 longer than the R wave or > 40 ms; R-peak time > 50 ms in V1 but normal in V5–V6 (AHA/ACCF/HRS 2009).'],
      pearls: ['Mnemonic "MaRRoW": M in V1, W in V6.', 'Can be normal; a new RBBB may reflect pulmonary embolism, ischaemia or cardiomyopathy.', 'RBBB plus left axis deviation suggests bifascicular block (RBBB + left anterior fascicular block).'],
      refs: ['surawicz2009'], confusers: ['lbbb', 'wpw', 'stemi-posterior', 'lvh'],
      highlight: { primary: ['V1', 'V2', 'I', 'V6'] } },
    { id: 'lbbb', group: 'conduction', tier: 2, name: 'Left bundle branch block', short: 'Left bundle branch block',
      summary: 'Delayed left-ventricular activation: QRS ≥ 120 ms with broad notched R waves laterally and deep S waves in V1–V3.',
      key: 'QRS ≥ 120 ms with broad notched R waves in I/aVL/V5–V6, no septal q waves and deep S/QS in V1',
      params: { morph: 'lbbb', qrs: 152, axis: 10, hr: 76 }, vary: { axis: [-25, 35], qrs: [130, 170], hr: [62, 92] },
      features: ['QRS ≥ 120 ms (here ~150 ms).', 'Broad, notched or slurred ("M"-shaped) R waves in I, aVL, V5 and V6, without septal q waves.', 'Deep S or QS complexes in V1–V3 ("W"-shaped V1).', 'Discordant ST–T: ST elevation in V1–V3 and ST depression with T inversion in I, aVL, V5–V6.'],
      criteria: ['QRS ≥ 120 ms (adults); broad notched or slurred R in I, aVL, V5, V6; absent q waves in I, V5 and V6; R-peak time > 60 ms in V5–V6; ST and T usually opposite in direction to the QRS (AHA/ACCF/HRS 2009).'],
      pearls: ['Mnemonic "WiLLiaM": W in V1, M in V6.', 'Usually indicates structural heart disease. In suspected ACS use the (modified) Sgarbossa criteria: concordant ST elevation ≥ 1 mm, concordant ST depression ≥ 1 mm in V1–V3, or excessively discordant ST elevation (ST/S ≤ −0.25) (Sgarbossa 1996; Smith 2012).', 'ESC 2023: LBBB with symptoms of ongoing ischaemia is managed like STEMI.'],
      refs: ['surawicz2009', 'sgarbossa1996', 'smith2012', 'esc2023acs'], confusers: ['rbbb', 'lvh', 'paced', 'stemi-anterior'],
      highlight: { primary: ['V1', 'I', 'aVL', 'V6'] } },
    { id: 'wpw', group: 'conduction', tier: 3, name: 'Wolff–Parkinson–White pattern (pre-excitation)', short: 'WPW pattern',
      summary: 'An accessory pathway pre-excites the ventricles: short PR, delta wave and a broad QRS.',
      key: 'a short PR (< 120 ms) running straight into a slurred delta-wave upstroke and a broad QRS',
      params: { delta: 50, pr: 108, qrs: 136, hr: 74, deltaVec: [-0.06, 0.30, 0.26], tVec: [0.17, -0.07, -0.10] }, vary: { hr: [62, 90], pr: [96, 116] },
      features: ['Short PR interval (< 120 ms, here ~110 ms).', 'Delta wave: a slurred, slow initial upstroke of the QRS.', 'Broad QRS (here ~135 ms) with secondary ST–T changes opposite to the delta wave.', 'Here a left-sided pathway: positive delta waves and a dominant R wave in V1 ("type A"), negative delta waves (pseudo-Q waves) in I and aVL.'],
      criteria: ['PR < 120 ms in sinus rhythm, a delta wave, QRS widening (typically > 110–120 ms in adults) and secondary ST–T changes (AHA/ACCF/HRS 2009).'],
      pearls: ['WPW syndrome = pre-excitation plus tachyarrhythmia.', 'Pre-excited AF (fast, irregular, broad and varying QRS) can degenerate into VF: avoid AV-nodal blockers (adenosine, verapamil, digoxin, β-blockers); use procainamide/ibutilide or cardioversion (ESC 2019).', 'Catheter ablation of the pathway is curative.'],
      refs: ['surawicz2009', 'esc2019svt'], confusers: ['lbbb', 'rbbb', 'avb1', 'stemi-inferior'] },
    { id: 'lvh', group: 'conduction', tier: 2, name: 'Left ventricular hypertrophy with strain', short: 'LVH with strain',
      summary: 'Large left-ventricular QRS voltages with secondary ("strain") ST depression and T inversion in the lateral leads.',
      key: 'very tall R waves in V5–V6/aVL and deep S in V1–V2 with lateral downsloping ST depression and T inversion',
      params: { morph: 'lvh', qrs: 106, axis: -5, hr: 70, qtc: 430, pMorph: 'lae', pDur: 124 }, vary: { axis: [-25, 25], hr: [58, 86] },
      features: ['High QRS voltage: deep S in V1–V2, tall R in V5–V6 and aVL (Sokolow–Lyon and Cornell criteria met).', 'Slightly prolonged QRS (~105 ms) and leftward axis.', '"Strain": downsloping ST depression with asymmetric T-wave inversion in I, aVL, V5 and V6.', 'Left atrial abnormality: broad notched P in II, deep terminal negative P in V1.'],
      criteria: ['Sokolow–Lyon: S(V1) + R(V5 or V6) ≥ 35 mm, or R(aVL) ≥ 11 mm (Sokolow & Lyon 1949).', 'Cornell voltage: R(aVL) + S(V3) > 28 mm in men, > 20 mm in women (Casale 1985).', 'Cornell product: (R aVL + S V3, + 6 mm in women) × QRS duration > 2440 mm·ms (Molloy 1992).'],
      pearls: ['Voltage criteria are specific but insensitive and affected by age, sex, body habitus and race; echocardiography confirms LVH (AHA/ACCF/HRS 2009).', 'Causes: hypertension, aortic stenosis, hypertrophic cardiomyopathy, coarctation.'],
      refs: ['hancock2009', 'sokolow1949', 'casale1985', 'molloy1992'], confusers: ['lbbb', 'stemi-lateral', 'hypok', 'normal'],
      highlight: { primary: ['V1', 'V2', 'V5', 'V6', 'aVL'] } },
    { id: 'stemi-anterior', group: 'ischaemia', tier: 1, name: 'Anterior STEMI', short: 'Anterior STEMI',
      summary: 'Acute occlusion of the left anterior descending artery: ST elevation in V1–V4 with reciprocal inferior ST depression.',
      key: 'ST elevation in V1–V4 (± I/aVL) with hyperacute T waves and reciprocal ST depression in III/aVF',
      params: { st: [0.10, -0.06, 0.20], hyperacute: 1.2, hr: 86, qVec: [0, 0, -0.17] }, vary: { hr: [70, 104], stScale: [0.85, 1.3] },
      features: ['ST elevation in V1–V4 (maximal V2–V3), extending to I and aVL in this proximal LAD occlusion.', 'Hyperacute, broad T waves in the anterior leads; loss of r-wave height in V1–V3 (early Q/QS).', 'Reciprocal ST depression in III and aVF.'],
      criteria: ['New ST elevation at the J point in ≥ 2 contiguous leads: ≥ 2 mm (men ≥ 40 y), ≥ 2.5 mm (men < 40 y) or ≥ 1.5 mm (women) in V2–V3, and ≥ 1 mm in other leads (UDMI 2018).'],
      pearls: ['Immediate reperfusion: primary PCI (target ≤ 120 min from diagnosis to wire crossing) or fibrinolysis if PCI is not available in time (ESC 2023).', 'Look for LAD-occlusion equivalents without ST elevation: de Winter T waves and Wellens pattern.'],
      refs: ['udmi2018', 'esc2023acs', 'wagner2009'], confusers: ['pericarditis', 'lbbb', 'lvh', 'stemi-lateral'],
      highlight: { elevation: ['V1', 'V2', 'V3', 'V4', 'I', 'aVL'], reciprocal: ['III', 'aVF'] } },
    { id: 'stemi-inferior', group: 'ischaemia', tier: 1, name: 'Inferior STEMI', short: 'Inferior STEMI',
      summary: 'Acute inferior infarction (usually right coronary artery): ST elevation in II, III, aVF with reciprocal depression in aVL.',
      key: 'ST elevation in II, III and aVF (III > II) with reciprocal ST depression in aVL and I',
      params: { st: [-0.07, 0.24, -0.03], hyperacute: 1.0, hr: 66, qVec: [0, -0.12, 0] }, vary: { hr: [52, 84], stScale: [0.85, 1.3] },
      features: ['ST elevation in II, III and aVF, greater in III than II (suggesting the right coronary artery).', 'Reciprocal ST depression in aVL (most sensitive) and I.', 'Hyperacute T waves inferiorly; small Q waves may appear in III and aVF.'],
      criteria: ['New ST elevation ≥ 1 mm at the J point in ≥ 2 contiguous inferior leads (UDMI 2018).'],
      pearls: ['Record right-sided leads (ST elevation ≥ 0.5–1 mm in V4R = RV infarction: avoid nitrates, give fluids cautiously) and V7–V9 for posterior extension.', 'Watch for sinus bradycardia and AV block (AV-nodal artery).'],
      refs: ['udmi2018', 'esc2023acs', 'wagner2009'], confusers: ['pericarditis', 'stemi-lateral', 'stemi-posterior', 'normal'],
      highlight: { elevation: ['II', 'III', 'aVF'], reciprocal: ['aVL', 'I'] } },
    { id: 'stemi-lateral', group: 'ischaemia', tier: 2, name: 'Lateral STEMI', short: 'Lateral STEMI',
      summary: 'Acute lateral infarction (circumflex or diagonal artery): ST elevation in I, aVL, V5 and V6.',
      key: 'ST elevation in I, aVL, V5 and V6 with reciprocal ST depression in III and aVF',
      params: { st: [0.15, -0.12, -0.08], hyperacute: 1.0, hr: 88 }, vary: { hr: [70, 104], stScale: [0.9, 1.3] },
      features: ['ST elevation in I and aVL (high lateral) and V5–V6 (low lateral).', 'Reciprocal ST depression in III and aVF (and V1–V2).', 'Hyperacute lateral T waves.'],
      criteria: ['New ST elevation ≥ 1 mm in ≥ 2 contiguous lateral leads (I and aVL, or V5 and V6) (UDMI 2018).'],
      pearls: ['Lateral changes can be subtle (small QRS in aVL); the inferior reciprocal depression is often the clue.', 'Culprit: left circumflex artery or a diagonal branch of the LAD.'],
      refs: ['udmi2018', 'esc2023acs', 'wagner2009'], confusers: ['stemi-anterior', 'pericarditis', 'lvh', 'stemi-inferior'],
      highlight: { elevation: ['I', 'aVL', 'V5', 'V6'], reciprocal: ['III', 'aVF'] } },
    { id: 'stemi-posterior', group: 'ischaemia', tier: 3, name: 'Posterior STEMI', short: 'Posterior STEMI',
      summary: 'Acute posterior infarction seen "in the mirror": ST depression with tall R waves and upright T waves in V1–V3.',
      key: 'horizontal ST depression in V1–V3 with tall R waves (R/S > 1 in V2) and upright T waves',
      params: { morph: 'posterior', st: [0.03, 0.02, -0.17], hyperacute: 0, hr: 78 }, vary: { hr: [64, 96], stScale: [0.9, 1.3] },
      features: ['Horizontal ST depression in V1–V3 (maximal V2–V3).', 'Tall, broad R waves in V1–V2 (R/S > 1 in V2) — the mirror image of posterior Q waves.', 'Upright, prominent T waves in V1–V3.', 'Posterior leads V7–V9 would show ST elevation.'],
      criteria: ['ST elevation ≥ 0.5 mm in V7–V9 (≥ 1 mm in men < 40 y) confirms posterior STEMI (UDMI 2018); isolated ST depression ≥ 0.5 mm in V1–V3 should prompt posterior leads.'],
      pearls: ['Easily missed: treat confirmed posterior STEMI as STEMI (ESC 2023).', 'Often accompanies inferior or lateral STEMI (circumflex or right coronary artery).'],
      refs: ['udmi2018', 'esc2023acs', 'wagner2009'], confusers: ['rbbb', 'wpw', 'stemi-inferior', 'hypok'],
      highlight: { reciprocal: ['V1', 'V2', 'V3'] } },
    { id: 'hyperk', group: 'metabolic', tier: 2, name: 'Hyperkalaemia', short: 'Hyperkalaemia',
      summary: 'Raised serum potassium: tall peaked T waves, flattened P waves, prolonged PR and a widening QRS.',
      key: 'tall, narrow, peaked T waves with flattened P waves and a widening QRS',
      params: { hr: 58, pr: 220, qrs: 138, tAmp: 2.6, tWidth: 0.55, pAmp: 0.35, pDur: 125, qtc: 395, tAxis: 50 }, vary: { hr: [48, 70], tAmp: [2.2, 3.0], qrs: [124, 160] },
      features: ['Tall, narrow, symmetrical, peaked ("tented") T waves — most obvious in V2–V4.', 'Flattened, widened P waves and a prolonged PR interval.', 'Widened QRS (here ~140 ms) — later merging with the T wave towards a sine-wave pattern.', 'Bradycardia and conduction block are common.'],
      criteria: ['Progression with rising K⁺ (approximate): peaked T → P flattening and PR prolongation → QRS widening → sine wave → VF/asystole. The ECG correlates poorly with the K⁺ level (Montague 2008).'],
      pearls: ['A normal ECG does not exclude dangerous hyperkalaemia.', 'Severe hyperkalaemia (≥ 6.5 mmol/L) or ECG changes: IV calcium to stabilise the myocardium, insulin–glucose and salbutamol to shift K⁺, then remove K⁺; monitor the ECG and glucose (UK Kidney Association 2020).'],
      refs: ['ukka2020', 'montague2008', 'diercks2004'], confusers: ['hypok', 'stemi-anterior', 'long-qt', 'pericarditis'] },
    { id: 'hypok', group: 'metabolic', tier: 3, name: 'Hypokalaemia', short: 'Hypokalaemia',
      summary: 'Low serum potassium: flattened T waves, prominent U waves and ST depression (a long "QU" interval).',
      key: 'flat T waves with prominent U waves (U > T in V2–V3) and ST depression',
      params: { hr: 74, tAmp: 0.32, uAmp: 0.15, st: [-0.03, -0.035, -0.045], stShape: 'concave', pAmp: 1.3, pr: 190, qtc: 425 }, vary: { hr: [62, 90], uAmp: [0.12, 0.19] },
      features: ['Flattened (or inverted) T waves.', 'Prominent U waves after the T wave — larger than the T wave, best seen in V2–V3.', 'Sagging ST depression; the apparent "long QT" is really a QU interval.', 'P waves may be taller and the PR slightly longer.'],
      criteria: ['Typical changes with K⁺ below about 2.7–3.0 mmol/L: T flattening, U waves > 1 mm or larger than the T wave, ST depression (Diercks 2004).'],
      pearls: ['Replace potassium and magnesium; risk of PVCs, torsades and VF — especially with digoxin or QT-prolonging drugs.', 'Measure the QT to the end of the T wave, not the U wave.'],
      refs: ['diercks2004', 'rautaharju2009'], confusers: ['hyperk', 'long-qt', 'lvh', 'stemi-posterior'] },
    { id: 'long-qt', group: 'metabolic', tier: 2, name: 'Long QT interval', short: 'Long QT',
      summary: 'Prolonged ventricular repolarisation: QTc well above the reference range, raising the risk of torsades de pointes.',
      key: 'a QT interval longer than half the R–R interval (QTc > 500 ms)',
      params: { qtc: 545, hr: 64, tWidth: 1.1 }, vary: { qtc: [500, 590], hr: [55, 78] },
      features: ['Long QT interval: the T wave ends well beyond the midpoint of the R–R interval.', 'QTc here about 540 ms (Fridericia) — > 500 ms is high risk.', 'Broad T waves; otherwise normal sinus rhythm.'],
      criteria: ['QTc ≥ 450 ms (men) or ≥ 460 ms (women) is prolonged (AHA/ACCF/HRS 2009); > 500 ms carries a high risk of torsades.', 'Congenital LQTS: QTc ≥ 480 ms on repeated ECGs, or LQTS score > 3 (ESC 2022; HRS/EHRA/APHRS 2013).'],
      pearls: ['Common causes: drugs (class IA/III antiarrhythmics, macrolides, fluoroquinolones, antipsychotics, methadone, ondansetron), hypokalaemia, hypomagnesaemia, hypocalcaemia, bradycardia, congenital LQTS.', 'Measure in II or V5 with the tangent method; Bazett over-corrects at fast rates — prefer Fridericia or Framingham.'],
      refs: ['rautaharju2009', 'esc2022va', 'priori2013', 'drew2010'], confusers: ['hypok', 'hyperk', 'normal', 'avb1'] },
    { id: 'pericarditis', group: 'metabolic', tier: 2, name: 'Acute pericarditis', short: 'Acute pericarditis',
      summary: 'Widespread concave ST elevation with PR depression; only aVR (and V1) shows reciprocal ST depression and PR elevation.',
      key: 'diffuse concave ST elevation with PR depression, and ST depression with PR elevation only in aVR',
      params: { hr: 104, st: [0.10, 0.14, 0.08], stShape: 'concave', prShift: [-0.03, -0.055, -0.02] }, vary: { hr: [88, 118], stScale: [0.85, 1.25] },
      features: ['Widespread concave ("saddle-shaped") ST elevation in I, II, aVL, aVF and V2–V6, not confined to one coronary territory.', 'PR-segment depression in the same leads.', 'aVR (and often V1): ST depression and PR elevation — the only reciprocal changes.', 'Sinus tachycardia is common.'],
      criteria: ['ECG criterion of acute pericarditis: new widespread ST elevation or PR depression; diagnosis needs 2 of: pericarditic chest pain, friction rub, these ECG changes, new or worsening pericardial effusion (ESC 2015).', 'ST/T amplitude ratio in V6 > 0.25 favours pericarditis over benign early repolarisation (Ginzton & Laks 1982).'],
      pearls: ['Evolution (Spodick): stage I diffuse ST elevation and PR depression → II normalisation → III T inversion → IV normal.', 'Reciprocal ST depression (other than aVR/V1), convex ST elevation or Q waves suggest STEMI instead.', 'Treatment: NSAID or aspirin plus colchicine (ESC 2015).'],
      refs: ['esc2015peri', 'spodick2003', 'ginzton1982'], confusers: ['stemi-inferior', 'stemi-anterior', 'normal', 'hyperk'],
      highlight: { elevation: ['I', 'II', 'aVL', 'aVF', 'V2', 'V3', 'V4', 'V5', 'V6'], reciprocal: ['aVR'] } },
    { id: 'low-voltage', group: 'metabolic', tier: 3, name: 'Low QRS voltage', short: 'Low QRS voltage',
      summary: 'Small QRS complexes throughout: < 5 mm in every limb lead and < 10 mm in every precordial lead.',
      key: 'small QRS complexes: < 5 mm peak-to-peak in all limb leads and < 10 mm in all precordial leads',
      params: { qrsAmp: 0.32, pAmp: 0.6, tAmp: 0.45, hr: 98 }, vary: { qrsAmp: [0.26, 0.36], hr: [84, 110] },
      features: ['Peak-to-peak QRS amplitude < 5 mm in all limb leads and < 10 mm in all precordial leads (calibration 10 mm/mV).', 'Here with sinus tachycardia, as seen with a pericardial effusion.', 'Electrical alternans (alternating QRS height) would suggest tamponade.'],
      criteria: ['QRS amplitude < 5 mm (0.5 mV) in all limb leads and/or < 10 mm (1.0 mV) in all precordial leads (Madias 2008).'],
      pearls: ['Check the calibration pulse first.', 'Causes: pericardial effusion/tamponade, obesity, COPD/emphysema, pneumothorax, infiltrative cardiomyopathy (amyloid), hypothyroidism, extensive infarction, anasarca.'],
      refs: ['madias2008', 'mason2007'], confusers: ['normal', 'pericarditis', 'sinus-tachy', 'hypok'] }
  ];
  var DX_BY_ID = {};
  DIAGNOSES.forEach(function (d) { DX_BY_ID[d.id] = d; });

  /**
   * Quiz/variation helper: parameters for a randomised but still diagnostic instance of a diagnosis.
   * Uniform draws within each "vary" range; integer-valued for rates, ratios and intervals. stScale multiplies the ST vector.
   */
  function variant(id, seed) {
    var dx = DX_BY_ID[id]; if (!dx) return null;
    var rng = prng(seedOf(seed)), out = {}, v = dx.vary || {};
    Object.keys(v).forEach(function (k) {
      var lo = v[k][0], hi = v[k][1], x = lo + (hi - lo) * rng();
      if (k === 'stScale') { out.st = (dx.params.st || [0, 0, 0]).map(function (c) { return round(c * x, 4); }); return; }
      out[k] = /^(hr|atrialRate|escapeRate|pr|qrs|qtc|axis|ratio)$/.test(k) ? Math.round(x) : round(x, 3);
    });
    if (dx.params.rhythm === 'vf' || dx.params.rhythm === 'asystole') return out;
    out.qrsAmp = round((dx.params.qrsAmp || 1) * (0.88 + 0.24 * rng()), 3);
    out.noise = round(0.12 + 0.3 * rng(), 2);
    return out;
  }

  return {
    LEADS: LEADS, LIMB: LIMB, PRECORDIAL: PRECORDIAL, FRONTAL_ANGLE: FRONTAL_ANGLE, HORIZONTAL: HORIZONTAL,
    DEFAULTS: DEFAULTS, RHYTHMS: Object.keys(RHYTHMS), DIAGNOSES: DIAGNOSES, GROUPS: GROUPS, REFS: REFS, TERRITORIES: TERRITORIES,
    byId: function (id) { return DX_BY_ID[id] || null; }, variant: variant,
    generate: generate, estimateAxis: estimateAxis, classifyAxis: classifyAxis, quadrant: quadrant,
    qtc: qtc, heartRateFromRR: heartRateFromRR, rate: rate,
    sokolowLyon: sokolowLyon, cornell: cornell, cornellProduct: cornellProduct, stemiThreshold: stemiThreshold,
    measureBeat: measureBeat, detectQRS: detectQRS, leadVector: leadVector, project: project,
    _internal: { MORPH: MORPH, PMORPH: PMORPH, prng: prng, seedOf: seedOf, meanVector: meanVector, frontalAngle: frontalAngle, wrapDeg: wrapDeg, median: median, mean: mean, sd: sd }
  };
});

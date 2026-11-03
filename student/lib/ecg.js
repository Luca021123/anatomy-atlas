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
    fibAmp: 0.06       // AF f-wave amplitude (mV)
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
    if (m.t) tv = rotFrontal(m.t, rot);
    else {
      var ta = p.tAxis != null ? p.tAxis : clamp(p.axis * 0.5 + 15, -10, 75);
      tv = [m.tFront * Math.cos(ta * DEG), m.tFront * Math.sin(ta * DEG), m.tZ];
    }
    tv = vscale(tv, p.tAmp * (m.t ? Math.max(0.6, Math.min(1.6, k)) : 1));
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
    if (b.delta > 0) addGauss(D, fs, on + b.delta * 0.95, b.delta * 0.5, b.delta * 0.42, vscale(p.deltaVec, p.qrsAmp));
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
      // A conducted beat with pre-excitation starts earlier (short PR) and ends at the usual time (wide QRS).
      if (p.delta > 0 && !vtype && b.kind !== 'J') { b.delta = p.delta / 1000; b.on -= b.delta; b.dur += b.delta; }
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
        t: b.on, qrsOn: b.on, qrsOff: b.on + b.dur, tPeak: b.tPeak, tEnd: b.tEnd,
        kind: b.kind, morph: b.morph, conducted: conducted,
        pr: conducted ? Math.round((b.on - a.on) * 1000) : null,
        qrs: Math.round(b.dur * 1000), qt: Math.round((b.tEnd - b.on) * 1000), rr: null
      });
    });
    for (var i = 1; i < beats.length; i++) beats[i].rr = Math.round((beats[i].t - beats[i - 1].t) * 1000);
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
    var domKind = Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; })[0];
    var dom = main.filter(function (b) { return b.kind === domKind; });
    var prs = dom.map(function (b) { return b.pr; }).filter(isNum);
    var rrMed = rr.length ? median(rr) : null;
    var qtMed = dom.length ? median(dom.map(function (b) { return b.qt; })) : null;
    var intervals = {
      pr: prs.length && sd(prs) < 15 ? Math.round(median(prs)) : null,
      prVariable: prs.length > 1 && sd(prs) >= 15,
      qrs: dom.length ? Math.round(median(dom.map(function (b) { return b.qrs; }))) : null,
      qt: qtMed != null && (p.rhythm !== 'vf' && p.rhythm !== 'torsades') ? Math.round(qtMed) : null,
      rr: rrMed != null ? Math.round(rrMed) : null
    };
    if (intervals.qt && intervals.rr) intervals.qtc = { bazett: Math.round(qtc(intervals.qt, intervals.rr, 'bazett')), fridericia: Math.round(qtc(intervals.qt, intervals.rr, 'fridericia')), framingham: Math.round(qtc(intervals.qt, intervals.rr, 'framingham')), hodges: Math.round(qtc(intervals.qt, intervals.rr, 'hodges')) };
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
    for (i = 1; i < n - 1; i++) { var s = 0; for (var k = 0; k < names.length; k++) { var a = leads[names[k]]; s += Math.abs(a[i + 1] - a[i - 1]); } vel[i] = s; }
    var w = Math.max(1, Math.round(0.02 * fs)), sm = new Float64Array(n), acc = 0;
    for (i = 0; i < n; i++) { acc += vel[i]; if (i >= w) acc -= vel[i - w]; sm[i] = acc / Math.min(i + 1, w); }
    var sorted = Array.prototype.slice.call(sm).sort(function (a, b) { return a - b; });
    var hi = sorted[Math.floor(0.995 * (n - 1))], thr = 0.3 * hi, out = [];
    if (!(hi > 0)) return out;
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
    if (ann && ann.beats && ann.beats.length) return ann.beats.filter(function (b) { return b.kind !== 'V' || ann.rhythm === 'vt'; }).map(function (b) { return { on: b.qrsOn, off: b.qrsOff, kind: b.kind }; });
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
    var avf = aVFof(L), wins = windows(ecg && ecg.leads ? ecg : null, fs);
    if (!wins.length) wins = detectQRS(L, fs);
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
    var c = {}; ann.beats.forEach(function (b) { c[b.kind] = (c[b.kind] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
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
  var DIAGNOSES = [];
  var DX_BY_ID = {};

  return {
    LEADS: LEADS, LIMB: LIMB, PRECORDIAL: PRECORDIAL, FRONTAL_ANGLE: FRONTAL_ANGLE, HORIZONTAL: HORIZONTAL,
    DEFAULTS: DEFAULTS, RHYTHMS: Object.keys(RHYTHMS), DIAGNOSES: DIAGNOSES, byId: function (id) { return DX_BY_ID[id] || null; },
    generate: generate, estimateAxis: estimateAxis, classifyAxis: classifyAxis, quadrant: quadrant,
    qtc: qtc, heartRateFromRR: heartRateFromRR, rate: rate,
    sokolowLyon: sokolowLyon, cornell: cornell, cornellProduct: cornellProduct, stemiThreshold: stemiThreshold,
    measureBeat: measureBeat, detectQRS: detectQRS, leadVector: leadVector, project: project,
    _internal: { MORPH: MORPH, PMORPH: PMORPH, prng: prng, seedOf: seedOf, meanVector: meanVector, frontalAngle: frontalAngle, wrapDeg: wrapDeg, median: median, mean: mean, sd: sd }
  };
});

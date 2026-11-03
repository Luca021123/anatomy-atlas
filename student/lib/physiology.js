/* ==========================================================================
   Medical Student Studio — Physiology Lab maths (MTLib.physiology)
   Pure functions + constants, no DOM, no MT. Loaded in the browser as
   MTLib.physiology and in Node (unit tests) via require().

   Sections
     1. Constants & small helpers
     2. Oxygen–haemoglobin dissociation (Severinghaus 1979; Kelman 1966 virtual PO2;
        Roughton & Darling 1944 carbon monoxide; myoglobin)
     3. Membrane potential (Nernst; Goldman–Hodgkin–Katz)
     4. Hodgkin–Huxley (1952) squid-axon action potential (RK4)
     5. Left-ventricular pressure–volume loop (time-varying elastance + Windkessel)
     6. Renal handling (clearance, RPF/RBF, FENa, free water, glucose titration)
     7. Respiratory gas exchange (barometric pressure, alveolar gas equation,
        A–a gradient, shunt vs V/Q mismatch, ventilation, dead space)
     8. Acid–base (Henderson–Hasselbalch, buffer line, compensation)
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;      // Node tests
  else (root.MTLib = root.MTLib || {}).physiology = lib;                        // browser: MTLib.physiology
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ======================================================================
     1. Constants & helpers
     ====================================================================== */
  var CONST = {
    R: 8.314462618,          // J mol⁻¹ K⁻¹ (CODATA 2018)
    F: 96485.33212,          // C mol⁻¹ (CODATA 2018)
    ZERO_C: 273.15,          // K
    KPA_PER_MMHG: 0.1333224, // 1 mmHg = 0.1333224 kPa
    HUFNER: 1.34,            // mL O2 per g Hb (empirical; theoretical maximum 1.39)
    O2_SOL: 0.003,           // mL O2 dL⁻¹ mmHg⁻¹ dissolved in plasma at 37 °C
    PH2O: 47,                // mmHg, saturated water vapour pressure at 37 °C
    GLUCOSE_MG_PER_MMOL: 18.016 // mg/dL per mmol/L (MW 180.16 g/mol)
  };
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function log10(x) { return Math.log(x) / Math.LN10; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function mmHgToKPa(x) { return x * CONST.KPA_PER_MMHG; }
  function kPaToMmHg(x) { return x / CONST.KPA_PER_MMHG; }
  /** Monotonic root finder (bisection) for f on [lo, hi]; f(lo) and f(hi) must bracket a root. */
  function bisect(f, lo, hi, tol, maxIt) {
    var flo = f(lo);
    tol = tol || 1e-9; maxIt = maxIt || 200;
    for (var i = 0; i < maxIt; i++) {
      var mid = (lo + hi) / 2, fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
      if (hi - lo < tol) break;
    }
    return (lo + hi) / 2;
  }
  /** Standard normal pdf and cdf (Abramowitz & Stegun 7.1.26 erf, |error| < 1.5e-7). */
  function normPdf(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  /* ======================================================================
     2. Oxygen–haemoglobin dissociation
     ----------------------------------------------------------------------
     Standard curve (pH 7.40, PCO2 40 mmHg, 37 °C, normal 2,3-BPG):
       SO2 = 1 / (23400 / (PO2³ + 150·PO2) + 1)
       Severinghaus JW. Simple, accurate equations for human blood O2
       dissociation computations. J Appl Physiol 1979;46:599–602.
     Non-standard conditions use the "virtual PO2" — the PO2 that would give
     the same saturation under standard conditions (Kelman GR. Digital
     computer subroutine for the conversion of oxygen tension into saturation.
     J Appl Physiol 1966;21:1375–6; coefficients from Severinghaus's data):
       PO2virtual = PO2 × 10^[0.024(37 − T) + 0.40(pH − 7.40) + 0.06·log10(40/PCO2)
                               − 0.03(BPG − 5.0)]
     The 2,3-BPG term (−0.03 log10 units per mmol/L of red cells, i.e. P50
     ≈ +1.9 mmHg per mmol/L near normal) is NOT part of Kelman's correction.
     It is an approximate, linearised term chosen to reproduce the reported
     P50 of 2,3-BPG-depleted stored blood (≈ 18–19 mmHg) and of chronic
     anaemia (≈ 30–31 mmHg); treat it as illustrative. As in Kelman's and
     Siggaard-Andersen's models, the shifts are assumed independent and
     additive in log P50 and the curve shape is assumed unchanged.
     Fetal blood: P50 ≈ 19 mmHg under standard conditions (HbF binds 2,3-BPG
     poorly) — Boron & Boulpaep, Medical Physiology; Guyton & Hall.
     Carbon monoxide: Haldane's first law + Roughton–Darling "equivalent
     ligand" model. Total saturation (O2 + CO) follows the normal curve at
     an equivalent pressure Q = PO2 + M·PCO, and COHb/O2Hb = M·PCO/PO2.
     With a fixed COHb fraction y (bound CO does not unload in a capillary
     transit) M and PCO cancel: solve S(Q)·(1 − PO2/Q) = y, then
     O2Hb = S(Q) − y. This reproduces both the reduced O2 capacity and the
     left shift of the remaining haemoglobin.
     Roughton FJW, Darling RC. Am J Physiol 1944;141:17–31.
     Myoglobin: hyperbolic, P50 ≈ 2.8 mmHg (textbook value; measured
     2.4–2.8 mmHg at 37 °C, e.g. Schenkman et al. J Appl Physiol 1997;82:86–92).
     ====================================================================== */
  var O2_STD = { pH: 7.40, pco2: 40, temp: 37, bpg: 5.0 };
  var FETAL_P50 = 19;   // mmHg, fetal whole blood, standard conditions
  var MB_P50 = 2.8;     // mmHg, myoglobin
  var BPG_COEF = 0.03;  // log10 P50 units per mmol/L RBC 2,3-BPG (approximate; see above)

  /** Standard-condition saturation (fraction 0–1) for a PO2 in mmHg. */
  function satStd(po2) {
    if (!(po2 > 0)) return 0;
    return 1 / (23400 / (po2 * po2 * po2 + 150 * po2) + 1);
  }
  /** Exact inverse of satStd (Cardano's formula for PO2³ + 150·PO2 − 23400·S/(1−S) = 0). */
  function satStdInv(s) {
    if (!(s > 0)) return 0;
    if (s >= 1) return Infinity;
    var q = 23400 * s / (1 - s), d = Math.sqrt(q * q / 4 + 125000); // p³/27 with p = 150
    return Math.cbrt(q / 2 + d) + Math.cbrt(q / 2 - d);
  }
  var P50_STD = satStdInv(0.5); // ≈ 26.86 mmHg
  /**
   * log10 of the virtual-PO2 multiplier for given conditions.
   * c: { pH, pco2 (mmHg), temp (°C), bpg (mmol/L RBC), fetal (bool) }
   */
  function o2ShiftLog(c) {
    c = c || {};
    var pH = isNum(c.pH) ? c.pH : O2_STD.pH, pco2 = isNum(c.pco2) && c.pco2 > 0 ? c.pco2 : O2_STD.pco2;
    var t = isNum(c.temp) ? c.temp : O2_STD.temp, bpg = isNum(c.bpg) ? c.bpg : O2_STD.bpg;
    var x = 0.024 * (37 - t) + 0.40 * (pH - 7.40) + 0.06 * log10(40 / pco2) - BPG_COEF * (bpg - O2_STD.bpg);
    if (c.fetal) x += log10(P50_STD / FETAL_P50);
    return x;
  }
  function o2Factor(c) { return Math.pow(10, o2ShiftLog(c)); }
  /** P50 (mmHg) of haemoglobin not bound to CO, for the given conditions (and COHb fraction y). */
  function p50(c, y) {
    var f = o2Factor(c);
    y = y || 0;
    if (y <= 0) return P50_STD / f;
    // half of the non-CO haemoglobin oxygenated: O2Hb = (1 − y)/2
    var target = (1 - y) / 2;
    var lo = 1e-6, hi = 400;
    return bisect(function (p) { return o2HbFraction(p * f, y) - target; }, lo, hi, 1e-7);
  }
  /**
   * Fraction of TOTAL haemoglobin present as O2Hb at a virtual PO2, with a fixed
   * COHb fraction y (Roughton–Darling). y = 0 gives the standard curve.
   */
  function o2HbFraction(po2v, y) {
    if (!(po2v > 0)) return 0;
    if (!(y > 0)) return satStd(po2v);
    if (y >= 1) return 0;
    var g = function (Q) { return satStd(Q) * (1 - po2v / Q) - y; };
    var hi = po2v * 2 + 1;
    while (g(hi) <= 0 && hi < 1e9) hi *= 2;
    var Q = bisect(g, po2v, hi, Math.max(1e-10, po2v * 1e-10), 120);
    return Math.max(0, satStd(Q) * po2v / Q);
  }
  /** Myoglobin saturation (fraction). */
  function satMb(po2, p50mb) { p50mb = p50mb || MB_P50; return po2 > 0 ? po2 / (po2 + p50mb) : 0; }
  /** O2 content, mL O2 per dL blood: 1.34·Hb·SO2 + 0.003·PO2 (Hb g/dL; SO2 fraction of total Hb). */
  function o2Content(hb, so2, po2) { return CONST.HUFNER * hb * so2 + CONST.O2_SOL * po2; }
  /** O2 delivery, mL/min: DO2 = CO (L/min) × CaO2 (mL/dL) × 10. */
  function o2Delivery(co, cao2) { return co * cao2 * 10; }
  /**
   * Full oxygen state for the simulator.
   * input: { po2, pH, pco2, temp, bpg, fetal, hb (g/dL), cohb (% of total Hb), co (L/min), vo2 (mL/min) }
   */
  function o2State(inp) {
    var y = clamp((inp.cohb || 0) / 100, 0, 0.95);
    var f = o2Factor(inp), hb = inp.hb, po2 = inp.po2;
    var fo2hb = o2HbFraction(po2 * f, y);
    var cao2 = o2Content(hb, fo2hb, po2);
    var out = {
      factor: f, shiftLog: Math.log(f) / Math.LN10, y: y,
      p50: p50(inp, y), p50Hb: P50_STD / f,
      fo2hb: fo2hb,                          // O2Hb as a fraction of total Hb (what CaO2 uses)
      so2Functional: y < 1 ? fo2hb / (1 - y) : 0, // saturation of Hb not bound to CO
      spo2Apparent: Math.min(1, fo2hb + y),  // a 2-wavelength pulse oximeter reads COHb as O2Hb
      capacity: CONST.HUFNER * hb * (1 - y), // mL/dL that Hb could carry
      cao2: cao2,
      dissolved: CONST.O2_SOL * po2
    };
    if (isNum(inp.co) && inp.co > 0) {
      out.do2 = o2Delivery(inp.co, cao2);
      if (isNum(inp.vo2) && inp.vo2 > 0) {
        out.o2er = inp.vo2 / out.do2;
        var cvo2 = cao2 - inp.vo2 / (inp.co * 10);
        out.cvo2 = cvo2;
        if (cvo2 <= 0.05) { out.pvo2 = 0; out.svo2 = 0; out.unsustainable = true; }
        else {
          var content = function (p) { return o2Content(hb, o2HbFraction(p * f, y), p) - cvo2; };
          out.pvo2 = bisect(content, 0, Math.max(po2, 1), 1e-6);
          out.svo2 = o2HbFraction(out.pvo2 * f, y);
        }
      }
    }
    return out;
  }
  /** Curve points [[PO2, value]] where value is SO2 % ('sat', of total Hb) or O2 content mL/dL ('content'). */
  function o2Curve(c, opts) {
    opts = opts || {};
    var maxP = opts.max || 120, n = opts.n || 160, y = clamp((c.cohb || 0) / 100, 0, 0.95), f = o2Factor(c), pts = [];
    for (var i = 0; i <= n; i++) {
      var p = maxP * i / n, s = o2HbFraction(p * f, y);
      pts.push([p, opts.mode === 'content' ? o2Content(c.hb || 15, s, p) : s * 100]);
    }
    return pts;
  }

  /* ======================================================================
     3. Membrane potential
     ----------------------------------------------------------------------
     Nernst: E = (RT/zF)·ln([X]o/[X]i)
     GHK voltage equation (monovalent ions; Goldman 1943, Hodgkin & Katz 1949):
       Vm = (RT/F)·ln[(PK[K]o + PNa[Na]o + PCl[Cl]i) / (PK[K]i + PNa[Na]i + PCl[Cl]o)]
     Hodgkin AL, Katz B. J Physiol 1949;108:37–77 (squid axon at rest
     PK:PNa:PCl ≈ 1 : 0.04 : 0.45). Ca2+ is omitted from the GHK voltage
     equation (divalent; negligible resting permeability).
     ====================================================================== */
  /** RT/F in mV at a temperature in °C. */
  function rtf(tempC) { return CONST.R * (tempC + CONST.ZERO_C) / CONST.F * 1000; }
  /** Nernst equilibrium potential in mV. z = valence (+1, +2, −1). */
  function nernst(z, cOut, cIn, tempC) {
    if (!(cOut > 0) || !(cIn > 0) || !z) return NaN;
    return rtf(isNum(tempC) ? tempC : 37) / z * Math.log(cOut / cIn);
  }
  /**
   * GHK voltage (mV). conc: { K:{o,i}, Na:{o,i}, Cl:{o,i} } in mmol/L; perm: { K, Na, Cl } relative permeabilities.
   */
  function ghk(conc, perm, tempC) {
    var pK = perm.K == null ? 1 : perm.K, pNa = perm.Na || 0, pCl = perm.Cl || 0;
    var num = pK * conc.K.o + pNa * conc.Na.o + pCl * conc.Cl.i;
    var den = pK * conc.K.i + pNa * conc.Na.i + pCl * conc.Cl.o;
    if (!(num > 0) || !(den > 0)) return NaN;
    return rtf(isNum(tempC) ? tempC : 37) * Math.log(num / den);
  }

  /* ======================================================================
     4. Hodgkin–Huxley squid giant axon
     ----------------------------------------------------------------------
     Hodgkin AL, Huxley AF. A quantitative description of membrane current
     and its application to conduction and excitation in nerve.
     J Physiol 1952;117:500–544. Modern sign convention, resting potential
     −65 mV: gNa 120, gK 36, gL 0.3 mS/cm²; ENa +50, EK −77, EL −54.387 mV;
     Cm 1 µF/cm². Rate constants (ms⁻¹, V in mV):
       αm = 0.1(V+40)/(1−e^−(V+40)/10)   βm = 4e^−(V+65)/18
       αh = 0.07e^−(V+65)/20             βh = 1/(1+e^−(V+35)/10)
       αn = 0.01(V+55)/(1−e^−(V+55)/10)  βn = 0.125e^−(V+65)/80
     Temperature: all rates × φ = 3^((T − 6.3)/10) (Q10 = 3). Reversal
     potentials are held fixed, as in the original model.
     TTX: gNa = 0. TEA: blocks 90 % of the delayed-rectifier gK. In real
     axons part of the resting K+ conductance flows through TEA-insensitive
     channels; because the HH model lumps it into gK we keep the resting K+
     conductance as a leak so the resting potential is unchanged (with ≥ 94 %
     block this model becomes bistable and never repolarises).
     Integration: classical 4th-order Runge–Kutta, fixed step.
     ====================================================================== */
  var HH = { gNa: 120, gK: 36, gL: 0.3, ENa: 50, EK: -77, EL: -54.387, Cm: 1, Vrest: -65, Tref: 6.3, Q10: 3, TEA_BLOCK: 0.9 };
  function vtrap(x, k) { var y = x / k; return Math.abs(y) < 1e-6 ? k * (1 + y / 2) : x / (1 - Math.exp(-y)); }
  /** HH rate constants at V (mV), 6.3 °C. */
  function hhRates(V) {
    return {
      am: 0.1 * vtrap(V + 40, 10), bm: 4 * Math.exp(-(V + 65) / 18),
      ah: 0.07 * Math.exp(-(V + 65) / 20), bh: 1 / (1 + Math.exp(-(V + 35) / 10)),
      an: 0.01 * vtrap(V + 55, 10), bn: 0.125 * Math.exp(-(V + 65) / 80)
    };
  }
  /** Steady-state gates x∞ and time constants τx (ms) at V and temperature. */
  function hhSteady(V, tempC) {
    var r = hhRates(V), phi = Math.pow(HH.Q10, ((isNum(tempC) ? tempC : HH.Tref) - HH.Tref) / 10);
    return {
      m: r.am / (r.am + r.bm), h: r.ah / (r.ah + r.bh), n: r.an / (r.an + r.bn),
      tm: 1 / (phi * (r.am + r.bm)), th: 1 / (phi * (r.ah + r.bh)), tn: 1 / (phi * (r.an + r.bn))
    };
  }
  /**
   * Simulate a current-clamp experiment.
   * o: { pulses:[{start, dur, amp}] (ms, ms, µA/cm²), tempC, ttx, tea, tEnd (ms), dt (ms), samples, record }
   * Returns { t, v, m, h, n, gNa, gK, iStim (Float64Arrays, decimated), spikes:[{t, peak}], vMax, phi, dt, steps }.
   */
  function hhSimulate(o) {
    o = o || {};
    var tempC = isNum(o.tempC) ? o.tempC : HH.Tref;
    var phi = Math.pow(HH.Q10, (tempC - HH.Tref) / 10);
    var tEnd = clamp(isNum(o.tEnd) ? o.tEnd : 30, 1, 500);
    // step: 0.01 ms at 6.3 °C, smaller when kinetics speed up (RK4 stability and accuracy)
    var dt = isNum(o.dt) ? o.dt : Math.min(0.01, 0.02 / Math.max(1, Math.pow(phi, 0.75)));
    var steps = Math.ceil(tEnd / dt); dt = tEnd / steps;
    var gNaBar = o.ttx ? 0 : HH.gNa;
    var block = o.tea ? (isNum(o.teaBlock) ? o.teaBlock : HH.TEA_BLOCK) : 0;
    var rest = hhSteady(HH.Vrest, tempC);
    var gKbar = HH.gK * (1 - block), gKleak = HH.gK * block * Math.pow(rest.n, 4);
    var gL = HH.gL, ENa = HH.ENa, EK = HH.EK, EL = HH.EL, Cm = HH.Cm;
    var pulses = (o.pulses || []).filter(function (p) { return p && p.dur > 0 && p.amp; });
    function stim(t) { var I = 0; for (var i = 0; i < pulses.length; i++) { var p = pulses[i]; if (t >= p.start && t < p.start + p.dur) I += p.amp; } return I; }
    var record = o.record !== false;
    var samples = Math.max(50, o.samples || 1200), every = Math.max(1, Math.floor(steps / samples));
    var nOut = record ? Math.floor(steps / every) + 1 : 0;
    var T = new Float64Array(nOut), Vv = new Float64Array(nOut), Mv = new Float64Array(nOut), Hv = new Float64Array(nOut), Nv = new Float64Array(nOut), GNa = new Float64Array(nOut), GK = new Float64Array(nOut), IS = new Float64Array(nOut);
    var V = HH.Vrest, m = rest.m, h = rest.h, n = rest.n, t = 0, k = 0;
    var dV = [0, 0, 0, 0], dm = [0, 0, 0, 0], dh = [0, 0, 0, 0], dn = [0, 0, 0, 0];
    function deriv(i, tt, VV, mm, hh, nn) {
      var am = 0.1 * vtrap(VV + 40, 10), bm = 4 * Math.exp(-(VV + 65) / 18);
      var ah = 0.07 * Math.exp(-(VV + 65) / 20), bh = 1 / (1 + Math.exp(-(VV + 35) / 10));
      var an = 0.01 * vtrap(VV + 55, 10), bn = 0.125 * Math.exp(-(VV + 65) / 80);
      var n2 = nn * nn;
      var INa = gNaBar * mm * mm * mm * hh * (VV - ENa), IK = (gKbar * n2 * n2 + gKleak) * (VV - EK), IL = gL * (VV - EL);
      dV[i] = (stim(tt) - INa - IK - IL) / Cm;
      dm[i] = phi * (am * (1 - mm) - bm * mm);
      dh[i] = phi * (ah * (1 - hh) - bh * hh);
      dn[i] = phi * (an * (1 - nn) - bn * nn);
    }
    function store() {
      if (!record) return;
      var n2 = n * n;
      T[k] = t; Vv[k] = V; Mv[k] = m; Hv[k] = h; Nv[k] = n;
      GNa[k] = gNaBar * m * m * m * h; GK[k] = gKbar * n2 * n2 + gKleak; IS[k] = stim(t); k++;
    }
    var spikes = [], above = false, cur = null, vMax = V;
    store();
    for (var s = 1; s <= steps; s++) {
      deriv(0, t, V, m, h, n);
      deriv(1, t + dt / 2, V + dt / 2 * dV[0], m + dt / 2 * dm[0], h + dt / 2 * dh[0], n + dt / 2 * dn[0]);
      deriv(2, t + dt / 2, V + dt / 2 * dV[1], m + dt / 2 * dm[1], h + dt / 2 * dh[1], n + dt / 2 * dn[1]);
      deriv(3, t + dt, V + dt * dV[2], m + dt * dm[2], h + dt * dh[2], n + dt * dn[2]);
      V += dt / 6 * (dV[0] + 2 * dV[1] + 2 * dV[2] + dV[3]);
      m += dt / 6 * (dm[0] + 2 * dm[1] + 2 * dm[2] + dm[3]);
      h += dt / 6 * (dh[0] + 2 * dh[1] + 2 * dh[2] + dh[3]);
      n += dt / 6 * (dn[0] + 2 * dn[1] + 2 * dn[2] + dn[3]);
      t = s * dt;
      if (V > vMax) vMax = V;
      // spike = overshoot above 0 mV; it ends when V falls back below −30 mV
      if (!above && V > 0) { above = true; cur = { t: t, peak: V }; spikes.push(cur); }
      else if (above) { if (V > cur.peak) { cur.peak = V; cur.t = t; } if (V < -30) above = false; }
      if (s % every === 0 && k < nOut) store();
    }
    var out = { spikes: spikes, vMax: vMax, vEnd: V, phi: phi, dt: dt, steps: steps, tEnd: tEnd, rest: rest, gates: { m: m, h: h, n: n } };
    if (record) {
      out.t = T.subarray(0, k); out.v = Vv.subarray(0, k); out.m = Mv.subarray(0, k); out.h = Hv.subarray(0, k);
      out.n = Nv.subarray(0, k); out.gNa = GNa.subarray(0, k); out.gK = GK.subarray(0, k); out.iStim = IS.subarray(0, k);
    }
    return out;
  }
  /** Gate values at time tq (ms) from a recorded run (nearest sample). */
  function hhAt(run, tq) {
    if (!run.t || !run.t.length) return null;
    var lo = 0, hi = run.t.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (run.t[mid] <= tq) lo = mid; else hi = mid; }
    return { t: run.t[lo], v: run.v[lo], m: run.m[lo], h: run.h[lo], n: run.n[lo] };
  }
  /**
   * Smallest pulse amplitude (µA/cm²) that produces a spike, by bisection.
   * o: same as hhSimulate; `which`: index of the pulse to vary (others fixed); requires `count` spikes in total.
   */
  function hhThreshold(o, which, count, maxAmp) {
    which = which || 0; maxAmp = maxAmp || 400; count = count || (which + 1);
    function fires(a) {
      var pulses = o.pulses.map(function (p, i) { return i === which ? { start: p.start, dur: p.dur, amp: a } : p; });
      return hhSimulate(Object.assign({}, o, { pulses: pulses, record: false })).spikes.length >= count;
    }
    if (!fires(maxAmp)) return Infinity;
    var lo = 0, hi = maxAmp;
    for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (fires(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  /* ======================================================================
     5. Left-ventricular pressure–volume loop
     ----------------------------------------------------------------------
     Time-varying elastance (Suga H, Sagawa K. Circ Res 1974;35:117–126;
     Suga H et al. Circ Res 1973;32:314–322):
       Plv(t) = e(t)·Ees·(V − V0) + (1 − e(t))·A·(e^{B(V − V0)} − 1)
     ESPVR slope Ees, volume intercept V0; exponential EDPVR (A, B) anchored
     at V0. The structure follows Ursino M. Am J Physiol 1998;275:H1733–47,
     including his heart-rate dependence of the contraction–relaxation time
     Ts = 0.5 − 0.075/T s (T = cardiac period). Activation e(t) is our model
     choice: a half-cosine rise to 1 at 0.7·Ts then a half-cosine relaxation
     to 0 at Ts.
     Filling: from a left-atrial/venous reservoir at the set filling
     pressure through a mitral resistance (0.012 mmHg·s/mL), so EDP ≈ filling
     pressure unless diastole is too short.
     Afterload: aortic valve (simplified Bernoulli ΔP = 4v², v = Q/AVA, plus
     a small linear term) into a 3-element Windkessel (characteristic
     impedance Zc, compliance C, peripheral resistance R draining to 0 mmHg)
     — Westerhof N, Lankhaar J-W, Westerhof BE. Med Biol Eng Comput
     2009;47:131–141. Effective arterial elastance Ea = ESP/SV ≈ R/T
     (Sunagawa K et al. Am J Physiol 1983;245:H773–H780).
     Integration: Heun (RK2), dt 0.25 ms, beats repeated to steady state.
     No baroreflex, atrial contraction, force–frequency effect or
     ventricular interaction is modelled.
     ====================================================================== */
  var PV_DEFAULTS = {
    hr: 75,        // beats/min
    ees: 2.5,      // mmHg/mL, end-systolic elastance (contractility)
    v0: 5,         // mL, ESPVR volume intercept
    edpA: 0.5,     // mmHg, EDPVR scale
    edpB: 0.024,   // 1/mL, EDPVR stiffness
    fill: 8,       // mmHg, left-atrial (filling) pressure ≈ LVEDP
    R: 1.1,        // mmHg·s/mL, total peripheral resistance
    C: 1.5,        // mL/mmHg, total arterial compliance
    zc: 0.035,     // mmHg·s/mL, aortic characteristic impedance
    ava: 3.5,      // cm², aortic valve area
    rav: 0.002,    // mmHg·s/mL, linear valve loss term
    rmv: 0.012     // mmHg·s/mL, mitral valve resistance
  };
  function pvParams(p) { return Object.assign({}, PV_DEFAULTS, p || {}); }
  function pvTimes(hr) {
    var T = 60 / hr, Ts = clamp(0.5 - 0.075 / T, 0.15, 0.85 * T);
    return { T: T, Ts: Ts, Tmax: 0.7 * Ts, Tr: 0.3 * Ts };
  }
  /** Normalised activation e(t) for time within the cycle tc (s). */
  function pvActivation(tc, times) {
    if (tc < 0) return 0;
    if (tc < times.Tmax) return 0.5 * (1 - Math.cos(Math.PI * tc / times.Tmax));
    if (tc < times.Ts) return 0.5 * (1 + Math.cos(Math.PI * (tc - times.Tmax) / times.Tr));
    return 0;
  }
  function espvr(V, p) { p = pvParams(p); return p.ees * (V - p.v0); }
  function edpvr(V, p) { p = pvParams(p); return p.edpA * (Math.exp(p.edpB * (V - p.v0)) - 1); }
  /** Volume on the EDPVR at pressure P (inverse EDPVR). */
  function edpvrVolume(P, p) { p = pvParams(p); return p.v0 + Math.log(Math.max(P, -p.edpA * 0.999) / p.edpA + 1) / p.edpB; }
  /**
   * Analytic ventricular–arterial coupling (Sunagawa 1983), ignoring EDP:
   * ESP = Ees(ESV − V0) = Ea·SV  →  SV = (EDV − V0)·Ees/(Ees + Ea).
   */
  function pvCoupling(o) {
    var sv = Math.max(0, (o.edv - o.v0) * o.ees / (o.ees + o.ea));
    return { sv: sv, esv: o.edv - sv, esp: o.ea * sv, ef: o.edv > 0 ? sv / o.edv : 0 };
  }
  /**
   * Simulate to steady state and return the final beat.
   * p: PV_DEFAULTS overrides. opts: { record (default true), points (loop samples) }
   */
  function pvSimulate(pIn, opts) {
    var p = pvParams(pIn); opts = opts || {};
    var times = pvTimes(p.hr), T = times.T;
    var dt = 0.00025, nStep = Math.round(T / dt);
    var K = 4 / Math.pow(100 * Math.max(0.05, p.ava), 2), b = p.rav + p.zc;
    var ees = p.ees, v0 = p.v0, A = p.edpA, B = p.edpB, fill = p.fill, rmv = p.rmv, R = p.R, C = p.C;
    var act = new Float64Array(nStep + 1);
    for (var i = 0; i <= nStep; i++) act[i] = pvActivation(i * dt, times);
    var P, qmv, qao; // outputs of flows()
    function flows(V, Pc, e) {
      P = e * ees * (V - v0) + (1 - e) * A * (Math.exp(B * (V - v0)) - 1);
      qmv = fill > P ? (fill - P) / rmv : 0;
      if (P > Pc) { var d = P - Pc; qao = (-b + Math.sqrt(b * b + 4 * K * d)) / (2 * K); } else qao = 0;
    }
    var V = edpvrVolume(fill, p), Pc = Math.max(20, 0.75 * fill + 60), beats = 0, converged = false;
    var prev = null, maxBeats = 80;
    function beat(rec) {
      var vmax = -Infinity, vmin = Infinity, pc0 = Pc;
      for (var j = 0; j < nStep; j++) {
        flows(V, Pc, act[j]);
        var P1 = P, qm1 = qmv, qa1 = qao;
        var dV1 = qm1 - qa1, dP1 = (qa1 - Pc / R) / C;
        if (rec) rec(j, V, P1, Pc + p.zc * qa1, qm1, qa1);
        flows(V + dt * dV1, Pc + dt * dP1, act[j + 1]);
        var dV2 = qmv - qao, dP2 = (qao - (Pc + dt * dP1) / R) / C;
        if (V > vmax) vmax = V; if (V < vmin) vmin = V;
        V += dt * (dV1 + dV2) / 2; Pc += dt * (dP1 + dP2) / 2;
      }
      return { edv: vmax, esv: vmin, dpc: Math.abs(Pc - pc0) };
    }
    while (beats < maxBeats) {
      var r = beat(null); beats++;
      if (beats >= 3 && prev && Math.abs(r.edv - prev.edv) < 0.01 && Math.abs(r.esv - prev.esv) < 0.01 && r.dpc < 0.01) { converged = true; break; }
      prev = r;
    }
    // record one more (steady-state) beat
    var tA = new Float64Array(nStep), vA = new Float64Array(nStep), pA = new Float64Array(nStep), aoA = new Float64Array(nStep), qmA = new Float64Array(nStep), qaA = new Float64Array(nStep);
    beat(function (j, Vj, Pj, Paoj, qmj, qaj) { tA[j] = j * dt; vA[j] = Vj; pA[j] = Pj; aoA[j] = Paoj; qmA[j] = qmj; qaA[j] = qaj; });
    beats++;
    var iEDV = 0, iESV = 0, sw = 0, ejected = 0, sbp = -Infinity, dbp = Infinity, mapSum = 0, peak = -Infinity, gradPeak = 0, gradSum = 0, nEj = 0;
    for (var k = 0; k < nStep; k++) {
      if (vA[k] > vA[iEDV]) iEDV = k;
      if (vA[k] < vA[iESV]) iESV = k;
      var kn = (k + 1) % nStep;
      sw -= (pA[k] + pA[kn]) / 2 * (vA[kn] - vA[k]);
      ejected += qaA[k] * dt;
      if (aoA[k] > sbp) sbp = aoA[k]; if (aoA[k] < dbp) dbp = aoA[k];
      mapSum += aoA[k];
      if (pA[k] > peak) peak = pA[k];
      if (qaA[k] > 0) { var g = pA[k] - aoA[k]; if (g > gradPeak) gradPeak = g; gradSum += g; nEj++; }
    }
    // the volume trace wraps: the true extreme may straddle the cycle boundary; that is fine for EDV/ESV values
    var edv = vA[iEDV], esv = vA[iESV], sv = edv - esv;
    // valve events (indices into the final beat)
    var ev = { mvc: null, avo: null, avc: null, mvo: null };
    for (var e = 1; e < nStep; e++) {
      if (ev.avo == null && qaA[e] > 0 && qaA[e - 1] <= 0) ev.avo = e;
      if (ev.avo != null && ev.avc == null && qaA[e] <= 0 && qaA[e - 1] > 0) ev.avc = e;
      if (ev.avc != null && ev.mvo == null && qmA[e] > 0 && qmA[e - 1] <= 0) ev.mvo = e;
    }
    for (var e2 = 1; e2 < nStep; e2++) { if (qmA[e2] <= 0 && qmA[e2 - 1] > 0 && (ev.avo == null || e2 <= ev.avo)) { ev.mvc = e2; break; } }
    if (ev.mvc == null) ev.mvc = 0;
    var events = {};
    Object.keys(ev).forEach(function (key) { var idx = ev[key]; if (idx != null) events[key] = { t: tA[idx], v: vA[idx], p: pA[idx] }; });
    var res = {
      params: p, times: times, beats: beats, converged: converged,
      edv: edv, esv: esv, sv: sv, ejected: ejected, ef: edv > 0 ? sv / edv : 0,
      co: sv * p.hr / 1000, // L/min
      edp: pA[iEDV], esp: pA[iESV], peakLV: peak,
      sbp: sbp, dbp: dbp, map: mapSum / nStep,
      sw: sw, swJ: sw * 133.322e-6, // 1 mmHg·mL = 1.333×10⁻⁴ J
      ea: sv > 0 ? pA[iESV] / sv : NaN, eaApprox: p.R / T,
      gradPeak: gradPeak, gradMean: nEj ? gradSum / nEj : 0,
      events: events
    };
    if (opts.record !== false) {
      var pts = opts.points || 360, step = Math.max(1, Math.floor(nStep / pts)), loop = [], wave = { t: [], plv: [], pao: [], vlv: [] };
      for (var q = 0; q < nStep; q += step) {
        loop.push([vA[q], pA[q]]);
        wave.t.push(tA[q] * 1000); wave.plv.push(pA[q]); wave.pao.push(aoA[q]); wave.vlv.push(vA[q]);
      }
      loop.push([vA[0], pA[0]]);
      res.loop = loop; res.wave = wave; res.fill = p.fill;
    }
    return res;
  }
  /** Frank–Starling (ventricular function) curve: sweep filling pressure, return [{fill, edp, edv, sv, sw, co}]. */
  function pvStarling(pIn, pressures) {
    pressures = pressures || [2, 4, 6, 8, 10, 12, 15, 18, 21, 25, 30];
    return pressures.map(function (f) {
      var r = pvSimulate(Object.assign({}, pIn, { fill: f }), { record: false });
      return { fill: f, edp: r.edp, edv: r.edv, sv: r.sv, sw: r.sw, co: r.co, ef: r.ef };
    });
  }

  /* ======================================================================
     6. Renal handling
     ----------------------------------------------------------------------
     Clearance C = U·V/P (Smith HW. The Kidney, 1951). Inulin clearance =
     GFR; creatinine clearance slightly overestimates GFR (tubular secretion).
     PAH clearance = effective RPF; true RPF = C_PAH / E_PAH (E ≈ 0.9);
     RBF = RPF/(1 − Hct); FF = GFR/RPF (≈ 0.2).
     FENa = (U_Na·P_Cr)/(P_Na·U_Cr) × 100 % (Espinel CH. JAMA 1976;236:579–581).
     FEurea = (U_urea·P_Cr)/(P_urea·U_Cr) × 100 % (Carvounis CP et al.
     Kidney Int 2002;62:2223–2229).
     Osmolar clearance Cosm = Uosm·V/Posm; free-water clearance CH2O = V − Cosm;
     electrolyte-free water clearance = V·(1 − (U_Na + U_K)/P_Na)
     (Rose BD, Post TW. Clinical Physiology of Acid-Base and Electrolyte Disorders).
     Glucose titration curve: filtered load = GFR × P; each nephron has its
     own reabsorptive capacity per mL of filtrate (threshold θ), assumed
     normally distributed with mean Tm/GFR and SD = splay × mean. Then
       excretion = GFR·E[max(0, P − θ)] = GFR·[(P − μ)Φ(z) + σφ(z)], z = (P − μ)/σ
     which gives the classic "splay" (nephron heterogeneity: Smith 1951).
     Defaults: GFR 125 mL/min, TmG 375 mg/min (Guyton & Hall), splay 17 %:
     threshold (μ − 2σ) ≈ 200 mg/dL (≈ 11 mmol/L).
     ====================================================================== */
  function clearance(u, v, p) { return p > 0 ? u * v / p : NaN; }
  function rpfFromPAH(cPAH, extraction) { return cPAH / (extraction > 0 ? extraction : 1); }
  function rbfFromRPF(rpf, hct) { return hct < 1 ? rpf / (1 - hct) : NaN; }
  function filtrationFraction(gfr, rpf) { return rpf > 0 ? gfr / rpf : NaN; }
  function fena(uNa, pNa, uCr, pCr) { return (pNa > 0 && uCr > 0) ? 100 * (uNa * pCr) / (pNa * uCr) : NaN; }
  function feurea(uUrea, pUrea, uCr, pCr) { return (pUrea > 0 && uCr > 0) ? 100 * (uUrea * pCr) / (pUrea * uCr) : NaN; }
  function osmolarClearance(uOsm, pOsm, v) { return pOsm > 0 ? uOsm * v / pOsm : NaN; }
  function freeWaterClearance(uOsm, pOsm, v) { return v - osmolarClearance(uOsm, pOsm, v); }
  function electrolyteFreeWaterClearance(v, uNa, uK, pNa) { return pNa > 0 ? v * (1 - (uNa + uK) / pNa) : NaN; }
  var GLUCOSE_DEFAULTS = { gfr: 125, tm: 375, splay: 0.17 };
  /**
   * Renal glucose handling at plasma glucose pg (mg/dL).
   * Returns mg/min: filtered, reabsorbed, excreted; plus mu (mean nephron threshold, mg/dL).
   */
  function glucoseHandling(pg, o) {
    o = Object.assign({}, GLUCOSE_DEFAULTS, o || {});
    var gfrDl = o.gfr / 100;                // dL/min
    var filtered = gfrDl * Math.max(0, pg);  // mg/min
    var mu = o.tm / gfrDl, sd = Math.max(0, o.splay) * mu, excreted;
    if (sd < 1e-9) excreted = Math.max(0, filtered - o.tm);
    else { var z = (pg - mu) / sd; excreted = gfrDl * ((pg - mu) * normCdf(z) + sd * normPdf(z)); }
    excreted = clamp(excreted, 0, filtered);
    return { filtered: filtered, reabsorbed: filtered - excreted, excreted: excreted, mu: mu, sd: sd };
  }
  /** Renal threshold (mg/dL): plasma glucose at which ~2 % of nephrons are saturated (μ − 2σ). */
  function glucoseThreshold(o) { o = Object.assign({}, GLUCOSE_DEFAULTS, o || {}); var mu = o.tm / (o.gfr / 100); return mu * (1 - 2 * Math.max(0, o.splay)); }
  /** Plasma glucose (mg/dL) at which ~98 % of nephrons are saturated (μ + 2σ): reabsorption ≈ Tm. */
  function glucoseSaturation(o) { o = Object.assign({}, GLUCOSE_DEFAULTS, o || {}); var mu = o.tm / (o.gfr / 100); return mu * (1 + 2 * Math.max(0, o.splay)); }

  /* ======================================================================
     7. Respiratory gas exchange
     ----------------------------------------------------------------------
     Barometric pressure:
       ICAO standard atmosphere (barometric formula, troposphere):
         PB = 760·(1 − 2.25577×10⁻⁵·h)^5.25588  (h in m)
       West's model atmosphere for high mountains (better near the equator
       and in summer): PB = exp(6.63268 − 0.1112h − 0.00149h²), h in km.
         West JB. J Appl Physiol 1996;81:1850–1854.
     Alveolar gas equation (Riley & Cournand; West, Respiratory Physiology):
       PAO2 = FiO2(PB − PH2O) − PaCO2·[FiO2 + (1 − FiO2)/R]
     Expected A–a gradient on room air: 2.5 + 0.21 × age (Mellemgaard K.
     Acta Physiol Scand 1966;67:10–20); bedside rule (age + 10)/4.
     Alveolar ventilation equation: PaCO2 = 0.863 × VCO2 (mL/min STPD) / VA (L/min BTPS).
     Dead space: Bohr (PETCO2 as alveolar) and Enghoff (PaCO2) forms:
       VD/VT = (PACO2 − PĒCO2)/PACO2.
     Shunt vs V/Q mismatch: three-compartment lung (true shunt, a low-V/Q
     unit and a normal unit sharing the total alveolar ventilation). Each
     unit obeys O2 mass balance with inspired–expired volume difference
     handled by N2 conservation (so PAO2 → PB − PH2O − PACO2 on 100 % O2 for
     any ventilated unit):
       (VA/Q)·(PB − 47)·[FiO2(1 − FAO2 − FACO2)/(1 − FiO2) − FAO2] = 8.63·(Cc′O2 − Cv̄O2)
     Simplifications: alveolar PCO2 40 mmHg in every unit, standard O2
     dissociation curve, fixed arteriovenous O2 difference (VO2/Q̇).
     West JB. Ventilation/blood flow and gas exchange (5th ed.);
     Benatar SR, Hewlett AM, Nunn JF. Br J Anaesth 1973;45:711–718 (iso-shunt).
     ====================================================================== */
  function barometricPressure(altM, model) {
    altM = Math.max(-500, altM || 0);
    if (model === 'west') { var hk = altM / 1000; return Math.exp(6.63268 - 0.1112 * hk - 0.00149 * hk * hk); }
    return 760 * Math.pow(Math.max(0, 1 - 2.25577e-5 * altM), 5.25588);
  }
  /** o: { fio2, pb, paco2, rq, ph2o } → { pio2, pao2 (full), pao2Simple } (mmHg). */
  function alveolarGas(o) {
    var fio2 = o.fio2, pb = isNum(o.pb) ? o.pb : 760, ph2o = isNum(o.ph2o) ? o.ph2o : CONST.PH2O, rq = o.rq || 0.8, paco2 = o.paco2;
    var pio2 = fio2 * (pb - ph2o);
    return { pio2: pio2, pao2: pio2 - paco2 * (fio2 + (1 - fio2) / rq), pao2Simple: pio2 - paco2 / rq };
  }
  function aaGradient(pAO2, paO2) { return pAO2 - paO2; }
  function expectedAa(age) { return { mellemgaard: 2.5 + 0.21 * age, rule: (age + 10) / 4 }; }
  function alveolarVentilation(vtMl, vdMl, rr) { return Math.max(0, vtMl - vdMl) * rr / 1000; } // L/min
  function paco2FromVA(vco2, vaLmin) { return vaLmin > 0 ? 0.863 * vco2 / vaLmin : Infinity; }
  function bohrDeadSpace(pco2Alv, pco2MixedExp) { return pco2Alv > 0 ? (pco2Alv - pco2MixedExp) / pco2Alv : NaN; }
  /**
   * Dead-space model: o { vt, vdAnat, vdAlv (mL), rr, vco2 (mL/min) }.
   * Alveolar dead space = ventilated, unperfused alveoli (CO2-free gas).
   */
  function deadSpaceModel(o) {
    var vt = o.vt, vda = o.vdAnat, vdalv = o.vdAlv || 0, rr = o.rr, vco2 = o.vco2;
    var vePerf = Math.max(0, vt - vda - vdalv);           // mL per breath reaching perfused alveoli
    var va = vePerf * rr / 1000;                           // effective alveolar ventilation, L/min
    var paco2 = paco2FromVA(vco2, va);
    var vAlvTotal = Math.max(1e-9, vt - vda);
    var petco2 = paco2 * vePerf / vAlvTotal;               // end-tidal: perfused + unperfused alveolar gas
    var pemixed = paco2 * vePerf / vt;                     // mixed expired
    return {
      ve: vt * rr / 1000, va: va, vaTotal: vAlvTotal * rr / 1000, paco2: paco2, petco2: petco2, peco2: pemixed,
      gap: paco2 - petco2,
      bohr: bohrDeadSpace(petco2, pemixed),               // ≈ anatomical VD/VT
      enghoff: bohrDeadSpace(paco2, pemixed)              // physiological VD/VT
    };
  }
  /** Standard-curve O2 content (mL/dL) at PO2 for Hb g/dL. */
  function contentStd(po2, hb) { return o2Content(hb, satStd(po2), po2); }
  /** PO2 giving a standard-curve content (bisection). */
  function contentStdInv(c, hb) {
    if (!(c > 0)) return 0;
    var hi = 50;
    while (contentStd(hi, hb) < c && hi < 1e5) hi *= 2;
    return bisect(function (p) { return contentStd(p, hb) - c; }, 0, hi, 1e-7);
  }
  /**
   * Arterial PO2 from a 3-compartment lung.
   * o: { fio2, pb (760), shunt (0–0.9, fraction of Q̇), fLow (fraction of Q̇ to the low-V/Q unit),
   *      vqLow (V/Q of that unit), va (L/min, 4.2), q (L/min, 5), vo2 (mL/min, 250), hb (15), paco2 (40) }
   */
  function gasExchange(o) {
    var fio2 = clamp(o.fio2, 0.05, 1), pb = isNum(o.pb) ? o.pb : 760, hb = isNum(o.hb) ? o.hb : 15;
    var s = clamp(o.shunt || 0, 0, 0.95), fLow = clamp(o.fLow || 0, 0, 0.95 - s), vqLow = Math.max(0, isNum(o.vqLow) ? o.vqLow : 0.1);
    var va = isNum(o.va) ? o.va : 4.2, q = isNum(o.q) ? o.q : 5, vo2 = isNum(o.vo2) ? o.vo2 : 250, paco2 = isNum(o.paco2) ? o.paco2 : 40;
    var avd = vo2 / (q * 10);
    var dry = pb - CONST.PH2O, fc = paco2 / dry;
    var fNorm = 1 - s - fLow;
    var vLow = Math.min(va * 0.98, vqLow * fLow * q), vqNorm = fNorm > 0 ? (va - vLow) / (fNorm * q) : 0;
    // end-capillary PO2 of a unit with ventilation–perfusion ratio r for mixed venous content cv
    function unit(r, cv) {
      var pv = contentStdInv(Math.max(cv, 0.01), hb);
      if (r <= 0) return pv;
      var top = fio2 >= 0.999 ? dry - paco2 : dry; // PAO2 cannot exceed this
      // g > 0 while the O2 supplied by ventilation exceeds what the blood takes up
      var g = function (pa) {
        var fa = pa / dry, sup;
        if (fio2 >= 0.999) sup = (dry - paco2 - pa) * 1e3; // N2-free alveolus: inspired volume replaces uptake
        else sup = dry * (fio2 * (1 - fa - fc) / (1 - fio2) - fa);
        return r * sup - 8.63 * (contentStd(pa, hb) - cv);
      };
      var lo = Math.min(pv, top), hi = top;
      if (g(lo) <= 0) return lo;
      if (g(hi) >= 0) return hi;
      return bisect(g, lo, hi, 1e-6);
    }
    var cv = contentStd(100, hb) - avd, pNorm = 0, pLow = 0, ca = 0;
    for (var it = 0; it < 80; it++) {
      pNorm = fNorm > 0 ? unit(vqNorm, cv) : 0;
      pLow = fLow > 0 ? unit(vqLow, cv) : 0;
      ca = fNorm * contentStd(pNorm, hb) + fLow * contentStd(pLow, hb) + s * cv;
      var cvNew = ca - avd;
      if (Math.abs(cvNew - cv) < 1e-7) { cv = cvNew; break; }
      cv = 0.5 * cv + 0.5 * cvNew;
    }
    var pao2 = contentStdInv(ca, hb);
    return { pao2: pao2, sao2: satStd(pao2), cao2: ca, cvo2: cv, pvo2: contentStdInv(Math.max(cv, 0.01), hb), pAO2normal: pNorm, pAO2low: pLow, vqNorm: vqNorm, avd: avd };
  }

  /* ======================================================================
     8. Acid–base
     ----------------------------------------------------------------------
     Henderson–Hasselbalch: pH = 6.1 + log10([HCO3⁻] / (0.03·PCO2))
     (pK′ 6.1, CO2 solubility 0.03 mmol L⁻¹ mmHg⁻¹; Hasselbalch 1916).
     Buffer line (Davenport HW. The ABC of Acid-Base Chemistry, 6th ed.
     1974): non-bicarbonate buffers make HCO3 change along
       HCO3 = HCO3n + ΔB − β(pH − 7.40)
     where ΔB is the metabolic (base excess-like) shift. β ≈ 14.8 mmol/L per
     pH for the whole extracellular fluid in vivo (value used for standard
     base excess; Siggaard-Andersen O. The Acid-Base Status of the Blood,
     4th ed. 1974) and ≈ 29 for whole blood in vitro (Hb 15 g/dL; Van Slyke
     β = 2.3·ctHb(mmol/L) + 7.7).
     Expected compensation (applied to the final values):
       metabolic acidosis  PCO2 = 1.5·HCO3 + 8 (Albert MS, Dell RB, Winters RW. Ann Intern Med 1967;66:312–322)
       metabolic alkalosis PCO2 = 40 + 0.7·(HCO3 − 24) (Javaheri S, Kazemi H. Am Rev Respir Dis 1987;136:1011–1016)
       respiratory acidosis HCO3 +1 (acute) / +3.5 (chronic) per 10 mmHg (Brackett NC et al. NEJM 1965;272:6–12)
       respiratory alkalosis HCO3 −2 (acute) / −4 (chronic) per 10 mmHg (Arbus GS et al. NEJM 1969;280:117–123;
                             Gennari FJ et al. J Clin Invest 1972;51:1722–1730)
     ====================================================================== */
  var AB_NORMAL = { pH: 7.40, pco2: 40, hco3: 0.03 * 40 * Math.pow(10, 7.40 - 6.1) }; // HCO3 ≈ 23.9
  var BETA = { invivo: 14.8, invitro: 29 };
  function hhPH(hco3, pco2) { return 6.1 + log10(hco3 / (0.03 * pco2)); }
  function hhHCO3(pH, pco2) { return 0.03 * pco2 * Math.pow(10, pH - 6.1); }
  function hhPCO2(pH, hco3) { return hco3 / (0.03 * Math.pow(10, pH - 6.1)); }
  function hPlus(pH) { return Math.pow(10, 9 - pH); } // nmol/L
  /** Point on the buffer line for a given PCO2 and metabolic shift dB (mmol/L). */
  function bufferLineState(pco2, dB, beta) {
    beta = isNum(beta) ? beta : BETA.invivo; dB = dB || 0;
    var f = function (pH) { return hhHCO3(pH, pco2) - (AB_NORMAL.hco3 + dB - beta * (pH - 7.40)); };
    var pH = bisect(f, 5.5, 9.0, 1e-10);
    return { pH: pH, pco2: pco2, hco3: hhHCO3(pH, pco2), dB: dB };
  }
  /** Metabolic shift dB that places (pH, hco3) on a buffer line of slope beta. */
  function bufferShift(pH, hco3, beta) { beta = isNum(beta) ? beta : BETA.invivo; return hco3 - AB_NORMAL.hco3 + beta * (pH - 7.40); }
  var COMP = {
    metAcid: function (hco3) { return 1.5 * hco3 + 8; },
    metAlk: function (hco3) { return 40 + 0.7 * (hco3 - 24); },
    respAcidAcute: function (pco2) { return 24 + 0.1 * (pco2 - 40); },
    respAcidChronic: function (pco2) { return 24 + 0.35 * (pco2 - 40); },
    respAlkAcute: function (pco2) { return 24 - 0.2 * (40 - pco2); },
    respAlkChronic: function (pco2) { return 24 - 0.4 * (40 - pco2); }
  };
  function abPoint(pH, pco2, hco3) { return { pH: pH, pco2: pco2, hco3: hco3, h: hPlus(pH) }; }
  /**
   * Physiological path of a primary disorder on the pH–HCO3 diagram:
   * normal → primary (uncompensated) → compensated.
   * kind: 'metAcid' | 'metAlk' | 'respAcid' | 'respAlk'; size: dB (mmol/L) for metabolic, PCO2 (mmHg) for respiratory.
   */
  function disorderPath(kind, size, beta) {
    beta = isNum(beta) ? beta : BETA.invivo;
    var N = abPoint(AB_NORMAL.pH, AB_NORMAL.pco2, AB_NORMAL.hco3), P, Cmp;
    if (kind === 'metAcid' || kind === 'metAlk') {
      var dB = isNum(size) ? size : (kind === 'metAcid' ? -12 : 12);
      var pr = bufferLineState(40, dB, beta);
      P = abPoint(pr.pH, 40, pr.hco3);
      var rule = kind === 'metAcid' ? COMP.metAcid : COMP.metAlk;
      // compensated: on the same (shifted) buffer line, with PCO2 given by the rule applied to the final HCO3
      var g = function (pH) { var hco3 = AB_NORMAL.hco3 + dB - beta * (pH - 7.40); return hhPH(hco3, rule(hco3)) - pH; };
      var pHc = bisect(g, 6.6, 7.9, 1e-10);
      var hc = AB_NORMAL.hco3 + dB - beta * (pHc - 7.40);
      Cmp = abPoint(pHc, rule(hc), hc);
    } else {
      var pco2 = isNum(size) ? size : (kind === 'respAcid' ? 70 : 25);
      var ac = bufferLineState(pco2, 0, beta);
      P = abPoint(ac.pH, pco2, ac.hco3);
      var hcC = kind === 'respAcid' ? COMP.respAcidChronic(pco2) : COMP.respAlkChronic(pco2);
      Cmp = abPoint(hhPH(hcC, pco2), pco2, hcC);
    }
    return { normal: N, primary: P, compensated: Cmp };
  }
  /**
   * Add strong acid (mmol/L of ECF, negative = base) to a bicarbonate system.
   * closed: CO2 formed stays (PCO2 rises); open: ventilation holds PCO2 constant.
   */
  function openClosedBuffer(acid, hco3, pco2) {
    hco3 = isNum(hco3) ? hco3 : AB_NORMAL.hco3; pco2 = isNum(pco2) ? pco2 : 40;
    var h2 = Math.max(0.01, hco3 - acid);
    var dissolved = 0.03 * pco2 + acid;
    var closedPco2 = Math.max(0.01, dissolved) / 0.03;
    return {
      start: { pH: hhPH(hco3, pco2), hco3: hco3, pco2: pco2 },
      open: { pH: hhPH(h2, pco2), hco3: h2, pco2: pco2 },
      closed: { pH: hhPH(h2, closedPco2), hco3: h2, pco2: closedPco2 }
    };
  }

  return {
    CONST: CONST, clamp: clamp, mmHgToKPa: mmHgToKPa, kPaToMmHg: kPaToMmHg, bisect: bisect, normCdf: normCdf, normPdf: normPdf,
    // O2
    O2_STD: O2_STD, P50_STD: P50_STD, FETAL_P50: FETAL_P50, MB_P50: MB_P50, BPG_COEF: BPG_COEF,
    satStd: satStd, satStdInv: satStdInv, o2ShiftLog: o2ShiftLog, o2Factor: o2Factor, p50: p50, o2HbFraction: o2HbFraction,
    satMb: satMb, o2Content: o2Content, o2Delivery: o2Delivery, o2State: o2State, o2Curve: o2Curve,
    // membrane
    rtf: rtf, nernst: nernst, ghk: ghk,
    // HH
    HH: HH, hhRates: hhRates, hhSteady: hhSteady, hhSimulate: hhSimulate, hhAt: hhAt, hhThreshold: hhThreshold,
    // PV
    PV_DEFAULTS: PV_DEFAULTS, pvTimes: pvTimes, pvActivation: pvActivation, espvr: espvr, edpvr: edpvr, edpvrVolume: edpvrVolume,
    pvCoupling: pvCoupling, pvSimulate: pvSimulate, pvStarling: pvStarling,
    // renal
    clearance: clearance, rpfFromPAH: rpfFromPAH, rbfFromRPF: rbfFromRPF, filtrationFraction: filtrationFraction, fena: fena, feurea: feurea,
    osmolarClearance: osmolarClearance, freeWaterClearance: freeWaterClearance, electrolyteFreeWaterClearance: electrolyteFreeWaterClearance,
    GLUCOSE_DEFAULTS: GLUCOSE_DEFAULTS, glucoseHandling: glucoseHandling, glucoseThreshold: glucoseThreshold, glucoseSaturation: glucoseSaturation,
    // respiratory
    barometricPressure: barometricPressure, alveolarGas: alveolarGas, aaGradient: aaGradient, expectedAa: expectedAa,
    alveolarVentilation: alveolarVentilation, paco2FromVA: paco2FromVA, bohrDeadSpace: bohrDeadSpace, deadSpaceModel: deadSpaceModel,
    contentStd: contentStd, contentStdInv: contentStdInv, gasExchange: gasExchange,
    // acid–base
    AB_NORMAL: AB_NORMAL, BETA: BETA, COMP: COMP, hhPH: hhPH, hhHCO3: hhHCO3, hhPCO2: hhPCO2, hPlus: hPlus,
    bufferLineState: bufferLineState, bufferShift: bufferShift, disorderPath: disorderPath, openClosedBuffer: openClosedBuffer
  };
});

// Unit tests for student/lib/physiology.js (MTLib.physiology) — Physiology Lab maths.
// Reference values: Severinghaus 1979; Kelman 1966; Hodgkin & Huxley 1952; Hodgkin & Katz 1949;
// Suga & Sagawa 1974 / Sunagawa 1983; Guyton & Hall; West, Respiratory Physiology; Winters 1967.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../student/lib/physiology.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const between = (x, lo, hi, msg) => assert.ok(x >= lo && x <= hi, `${msg || ''} expected ${lo}–${hi}, got ${x}`);

/* ------------------------------------------------------------------ O2 */
test('O2: standard Severinghaus curve has P50 ≈ 26.8 mmHg and SO2(100) ≈ 97.7 %', () => {
  near(P.P50_STD, 26.86, 0.1, 'P50');
  near(P.p50({ pH: 7.40, pco2: 40, temp: 37, bpg: 5 }), 26.86, 0.1, 'P50 at standard conditions');
  between(P.satStd(100) * 100, 97, 98, 'SO2 at 100 mmHg');
  near(P.satStd(26.86), 0.5, 0.001);
  near(P.satStd(40) * 100, 75, 1, 'venous point ≈ 75 %');
  assert.equal(P.satStd(0), 0);
});

test('O2: satStdInv is the exact inverse of satStd', () => {
  for (const p of [5, 15, 26.86, 40, 60, 100, 300]) near(P.satStdInv(P.satStd(p)), p, 1e-6 * p + 1e-9, `PO2 ${p}`);
});

test('O2: Kelman virtual-PO2 exponent uses 0.024/°C, 0.40/pH and 0.06·log(40/PCO2)', () => {
  near(P.o2ShiftLog({ pH: 7.2, pco2: 40, temp: 37, bpg: 5 }), -0.08, 1e-12);
  near(P.o2ShiftLog({ pH: 7.4, pco2: 40, temp: 40, bpg: 5 }), -0.072, 1e-12);
  near(P.o2ShiftLog({ pH: 7.4, pco2: 80, temp: 37, bpg: 5 }), -0.06 * Math.log10(2), 1e-12);
  near(P.o2ShiftLog({ pH: 7.4, pco2: 40, temp: 37, bpg: 6 }), -0.03, 1e-12);
});

test('O2: acidosis, hypercapnia, fever and 2,3-BPG raise P50; alkalosis, cold and HbF lower it', () => {
  const std = P.p50({});
  assert.ok(P.p50({ pH: 7.2 }) > std + 4, 'acidosis right-shifts');
  assert.ok(P.p50({ pH: 7.6 }) < std - 4, 'alkalosis left-shifts');
  assert.ok(P.p50({ pco2: 60 }) > std, 'CO2 right-shifts at constant pH');
  assert.ok(P.p50({ temp: 40 }) > std + 3, 'fever right-shifts');
  assert.ok(P.p50({ temp: 32 }) < std - 4, 'hypothermia left-shifts');
  assert.ok(P.p50({ bpg: 7 }) > std + 3, 'raised 2,3-BPG right-shifts');
  between(P.p50({ bpg: 0 }), 17, 21, 'BPG-depleted stored blood');
  near(P.p50({ fetal: true }), 19, 0.01, 'fetal P50');
  between(P.p50({ pH: 7.3, temp: 39, pco2: 50 }), 31, 36, 'exercising muscle');
});

test('O2: content and delivery (CaO2 = 1.34·Hb·SaO2 + 0.003·PaO2; DO2 = CO·CaO2·10)', () => {
  const s = P.o2State({ po2: 100, hb: 15, co: 5, vo2: 250 });
  near(s.cao2, 1.34 * 15 * P.satStd(100) + 0.3, 1e-9);
  near(s.cao2, 19.95, 0.05);
  near(s.do2, 5 * s.cao2 * 10, 1e-9);
  near(s.cvo2, s.cao2 - 5, 1e-9, 'CvO2 = CaO2 − VO2/(10·CO)');
  between(s.pvo2, 37, 41, 'mixed venous PO2');
  between(s.o2er, 0.24, 0.26, 'extraction ratio');
  near(P.o2Content(15, 1, 0), 20.1, 1e-9);
  near(P.o2Delivery(5, 20), 1000, 1e-9);
});

test('O2: carbon monoxide halves capacity, left-shifts the rest and lowers venous PO2 more than anaemia', () => {
  const co = P.o2State({ po2: 100, hb: 15, cohb: 50, co: 5, vo2: 250 });
  const an = P.o2State({ po2: 100, hb: 7.5, cohb: 0, co: 5, vo2: 250 });
  near(co.capacity, 1.34 * 15 * 0.5, 1e-9);
  near(co.fo2hb, 0.5, 0.01, 'O2Hb fraction of total Hb');
  assert.ok(co.p50 < 16, 'P50 of the remaining Hb is strongly reduced');
  assert.ok(co.spo2Apparent > 0.95, 'pulse oximeter reads falsely high');
  near(co.cao2, an.cao2, 0.3, 'similar arterial content');
  assert.ok(co.pvo2 < an.pvo2 - 8, `CO venous PO2 ${co.pvo2} much lower than anaemia ${an.pvo2}`);
  assert.equal(P.o2HbFraction(50, 0), P.satStd(50));
});

test('O2: myoglobin is hyperbolic with P50 ≈ 2.8 mmHg and binds O2 more tightly than Hb', () => {
  near(P.satMb(2.8), 0.5, 1e-12);
  assert.ok(P.satMb(20) > P.satStd(20) + 0.5);
});

/* ------------------------------------------------------------------ membrane */
test('Membrane: RT/F ≈ 26.7 mV at 37 °C; Nernst gives EK ≈ −95 mV for 4/140 mM', () => {
  near(P.rtf(37), 26.73, 0.01);
  near(P.rtf(37) * Math.LN10, 61.5, 0.1, 'mV per decade');
  near(P.nernst(1, 4, 140, 37), -95, 1, 'EK');
  between(P.nernst(1, 145, 12, 37), 60, 70, 'ENa');
  near(P.nernst(-1, 110, 10, 37), -64.1, 0.5, 'ECl (z = −1)');
  between(P.nernst(2, 1.2, 0.0001, 37), 120, 130, 'ECa (z = 2)');
  assert.ok(Number.isNaN(P.nernst(1, 0, 140, 37)));
  near(P.nernst(1, 4, 140, 6.3), (8.314462618 * 279.45 / 96485.33212) * 1000 * Math.log(4 / 140), 1e-9, 'temperature-dependent');
});

test('Membrane: GHK with typical neuronal values lies between −75 and −65 mV', () => {
  const c = { K: { o: 4, i: 140 }, Na: { o: 145, i: 12 }, Cl: { o: 110, i: 10 } };
  between(P.ghk(c, { K: 1, Na: 0.04, Cl: 0.45 }, 37), -75, -65, 'neuron');
  near(P.ghk(c, { K: 1, Na: 0, Cl: 0 }, 37), P.nernst(1, 4, 140, 37), 1e-9, 'pure K reduces to Nernst');
  assert.ok(P.ghk(c, { K: 1, Na: 20, Cl: 0.45 }, 37) > 40, 'AP-peak permeability approaches ENa');
  const hyperK = { K: { o: 8, i: 140 }, Na: c.Na, Cl: c.Cl };
  assert.ok(P.ghk(hyperK, { K: 1, Na: 0.04, Cl: 0.45 }, 37) > P.ghk(c, { K: 1, Na: 0.04, Cl: 0.45 }, 37) + 5, 'hyperkalaemia depolarises');
  between(P.ghk({ K: { o: 4.5, i: 155 }, Na: { o: 145, i: 12 }, Cl: { o: 120, i: 4 } }, { K: 1, Na: 0.01, Cl: 2 }, 37), -92, -86, 'skeletal muscle');
});

/* ------------------------------------------------------------------ Hodgkin–Huxley */
test('HH: resting gates and resting potential ≈ −65 mV', () => {
  const g = P.hhSteady(-65, 6.3);
  near(g.m, 0.0529, 0.001); near(g.h, 0.5961, 0.001); near(g.n, 0.3177, 0.001);
  const r = P.hhSimulate({ tEnd: 50 });
  near(r.vEnd, -65, 0.5);
  assert.equal(r.spikes.length, 0);
});

test('HH: suprathreshold pulse fires one spike peaking above +30 mV; subthreshold does not', () => {
  const sup = P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 25 });
  assert.equal(sup.spikes.length, 1);
  assert.ok(sup.spikes[0].peak > 30, `peak ${sup.spikes[0].peak}`);
  const sub = P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 2 }], tEnd: 25 });
  assert.equal(sub.spikes.length, 0);
  assert.ok(sub.vMax < -55);
  const thr = P.hhThreshold({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 15 });
  between(thr, 10, 16, 'threshold for a 0.5 ms pulse (µA/cm²)');
  assert.ok(sup.t.length > 100 && sup.v.length === sup.t.length && sup.gNa.length === sup.t.length);
});

test('HH: TTX abolishes the spike; TEA prolongs it without changing rest', () => {
  assert.equal(P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 100 }], tEnd: 20, ttx: true }).spikes.length, 0);
  const dur = r => { let a = null, b = null; for (let i = 0; i < r.t.length; i++) if (r.v[i] > -40) { if (a === null) a = r.t[i]; b = r.t[i]; } return b - a; };
  const ctrl = P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 30 });
  const tea = P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 30, tea: true });
  assert.ok(dur(tea) > dur(ctrl) * 1.5, `TEA ${dur(tea)} vs control ${dur(ctrl)}`);
  near(P.hhSimulate({ tEnd: 40, tea: true }).vEnd, -65, 0.5, 'rest preserved with TEA');
});

test('HH: refractory periods — absolute at 3 ms, relative at 10 ms', () => {
  const two = (iv, amp) => P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }, { start: 2 + iv, dur: 0.5, amp }], tEnd: iv + 15 }).spikes.length;
  assert.equal(two(3, 200), 1, 'absolute refractory: no second spike even at 200 µA/cm²');
  assert.equal(two(10, 20), 1, 'relative refractory: normal stimulus fails');
  assert.equal(two(10, 120), 2, 'relative refractory: stronger stimulus succeeds');
  assert.equal(two(25, 20), 2, 'recovered');
});

test('HH: Q10 = 3 temperature scaling and heat block', () => {
  const s16 = P.hhSteady(-65, 16.3), s6 = P.hhSteady(-65, 6.3);
  near(s6.tm / s16.tm, 3, 1e-9);
  const warm = P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 20, tempC: 20 });
  const cold = P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 20, tempC: 6.3 });
  assert.ok(warm.vMax < cold.vMax, 'smaller spike when warm');
  assert.equal(P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 100 }], tEnd: 20, tempC: 35 }).spikes.length, 0, 'heat block');
  const anode = P.hhSimulate({ pulses: [{ start: 2, dur: 10, amp: -15 }], tEnd: 30 });
  assert.equal(anode.spikes.length, 1, 'anode-break excitation');
});

test('HH: a run takes well under 50 ms', () => {
  P.hhSimulate({ pulses: [{ start: 2, dur: 0.5, amp: 20 }], tEnd: 40 }); // warm-up (JIT)
  for (const o of [{ tEnd: 40 }, { tEnd: 100, tempC: 35 }]) {
    const t0 = process.hrtime.bigint();
    P.hhSimulate(Object.assign({ pulses: [{ start: 2, dur: 0.5, amp: 20 }, { start: 12, dur: 0.5, amp: 40 }] }, o));
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 50, `run took ${ms} ms`);
  }
});

/* ------------------------------------------------------------------ PV loop */
test('PV: baseline loop is physiological and SV = EDV − ESV = ejected volume', () => {
  const r = P.pvSimulate({});
  assert.ok(r.converged);
  near(r.sv, r.edv - r.esv, 1e-9);
  near(r.ejected, r.sv, r.sv * 0.01, 'mass conservation');
  between(r.edv, 110, 135, 'EDV'); between(r.esv, 40, 60, 'ESV'); between(r.ef, 0.55, 0.65, 'EF');
  between(r.co, 4.5, 6.5, 'CO'); between(r.map, 85, 105, 'MAP'); near(r.edp, 8, 0.5, 'EDP ≈ filling pressure');
  between(r.swJ, 0.8, 1.4, 'stroke work (J)');
  near(r.esp, r.params.ees * (r.esv - r.params.v0), 4, 'end-ejection point lies close to the ESPVR (e(t) ≈ 1)');
  assert.ok(r.loop.length > 100 && r.events.avo && r.events.avc);
});

test('PV: higher Ees raises SV and EF; higher afterload (Ea) lowers SV', () => {
  const base = P.pvSimulate({}, { record: false });
  const ino = P.pvSimulate({ ees: 3.75 }, { record: false });
  assert.ok(ino.sv > base.sv + 5 && ino.ef > base.ef && ino.esv < base.esv);
  const vc = P.pvSimulate({ R: 1.7 }, { record: false });
  assert.ok(vc.ea > base.ea, 'Ea rises with resistance');
  assert.ok(vc.sv < base.sv - 5 && vc.esp > base.esp);
  for (const r of [base, ino, vc]) near(r.sv, r.edv - r.esv, 1e-9);
});

test('PV: preload, heart failure, aortic stenosis and tachycardia behave as expected', () => {
  const base = P.pvSimulate({}, { record: false });
  const vol = P.pvSimulate({ fill: 16 }, { record: false });
  assert.ok(vol.edv > base.edv + 15 && vol.sv > base.sv, 'Frank–Starling');
  const bleed = P.pvSimulate({ fill: 3 }, { record: false });
  assert.ok(bleed.sv < base.sv && bleed.map < base.map);
  const hf = P.pvSimulate({ ees: 0.9, v0: 40, fill: 18, hr: 90, R: 1.25 }, { record: false });
  assert.ok(hf.ef < 0.35 && hf.edv > 160, 'systolic failure: low EF, dilated');
  const as = P.pvSimulate({ ava: 0.7 }, { record: false });
  assert.ok(as.gradMean > 40 && as.peakLV > as.sbp + 40, 'severe AS gradient');
  const fast = P.pvSimulate({ hr: 150 }, { record: false });
  assert.ok(fast.edv < base.edv - 10 && fast.co > base.co, 'less filling time, higher CO');
  const st = P.pvStarling({}, [4, 8, 12, 16, 20]);
  for (let i = 1; i < st.length; i++) assert.ok(st[i].sv > st[i - 1].sv, 'Starling curve rises');
});

test('PV: analytic coupling SV = (EDV − V0)·Ees/(Ees + Ea)', () => {
  const a = P.pvCoupling({ edv: 120, v0: 5, ees: 2.5, ea: 1.5 });
  near(a.sv, 115 * 2.5 / 4, 1e-12); near(a.esp, 1.5 * a.sv, 1e-12); near(a.esv, 120 - a.sv, 1e-12);
  near(a.esp, 2.5 * (a.esv - 5), 1e-9, 'ESP on ESPVR');
  assert.ok(P.pvCoupling({ edv: 120, v0: 5, ees: 3.5, ea: 1.5 }).sv > a.sv);
  assert.ok(P.pvCoupling({ edv: 120, v0: 5, ees: 2.5, ea: 2.5 }).sv < a.sv);
  near(P.edpvrVolume(P.edpvr(130, {}), {}), 130, 1e-9);
});

/* ------------------------------------------------------------------ renal */
test('Renal: clearance, RPF/RBF, filtration fraction', () => {
  near(P.clearance(150, 1, 1.2), 125, 1e-9, 'inulin clearance = GFR');
  const rpf = P.rpfFromPAH(585, 0.9);
  near(rpf, 650, 1e-9); near(P.rbfFromRPF(650, 0.45), 650 / 0.55, 1e-9); near(P.filtrationFraction(125, 650), 0.1923, 1e-4);
});

test('Renal: FENa, FEurea and free-water clearance', () => {
  near(P.fena(20, 140, 100, 1), 100 * 20 / 14000, 1e-12);
  near(P.feurea(300, 30, 100, 1), 10, 1e-12);
  near(P.osmolarClearance(600, 300, 1), 2, 1e-12);
  assert.ok(P.freeWaterClearance(100, 290, 3) > 1.9, 'dilute urine: positive CH2O');
  assert.ok(P.freeWaterClearance(900, 290, 0.5) < -1, 'concentrated urine: negative CH2O');
  near(P.freeWaterClearance(290, 290, 1), 0, 1e-12, 'isosmotic urine');
  near(P.electrolyteFreeWaterClearance(2, 50, 30, 125), 0.72, 1e-12);
});

test('Renal: glucose titration curve — threshold, Tm and splay', () => {
  const lo = P.glucoseHandling(100);
  near(lo.filtered, 125, 1e-9, 'filtered load = GFR × P');
  assert.ok(lo.excreted < 0.01 && lo.reabsorbed > 124.9, 'no glycosuria at 100 mg/dL');
  const hi = P.glucoseHandling(800);
  near(hi.reabsorbed, 375, 1, 'reabsorption saturates at Tm');
  near(hi.excreted, hi.filtered - 375, 1);
  between(P.glucoseThreshold(), 180, 220, 'renal threshold mg/dL');
  let prevR = -1, prevE = -1;
  for (let g = 0; g <= 800; g += 25) {
    const x = P.glucoseHandling(g);
    near(x.excreted + x.reabsorbed, x.filtered, 1e-9);
    assert.ok(x.reabsorbed >= prevR - 1e-9 && x.excreted >= prevE - 1e-9, 'monotonic');
    assert.ok(x.reabsorbed <= 375 + 1e-9);
    prevR = x.reabsorbed; prevE = x.excreted;
  }
  const sharp = P.glucoseHandling(350, { splay: 0 });
  near(sharp.excreted, 437.5 - 375, 1e-9, 'no splay: excretion = filtered − Tm');
  assert.ok(P.glucoseHandling(250).excreted > P.glucoseHandling(250, { splay: 0 }).excreted, 'splay: spill before Tm');
  assert.ok(P.glucoseThreshold({ gfr: 187.5 }) < P.glucoseThreshold() - 50, 'pregnancy (↑GFR) lowers the threshold');
  assert.ok(P.glucoseThreshold({ tm: 150 }) < 100, 'reduced Tm (e.g. SGLT2 inhibition) lowers the threshold');
});

/* ------------------------------------------------------------------ respiratory */
test('Resp: barometric pressure (ICAO formula and West model atmosphere)', () => {
  near(P.barometricPressure(0), 760, 1e-9);
  near(P.barometricPressure(8848), 236, 2, 'ICAO underestimates on Everest');
  near(P.barometricPressure(8848, 'west'), 253, 2, 'West: measured ≈ 253 mmHg');
  near(P.barometricPressure(1600), 626.5, 0.5, 'ICAO at 1600 m (Denver measured ≈ 625–635 mmHg)');
});

test('Resp: alveolar gas equation gives PAO2 ≈ 100 mmHg on room air at sea level', () => {
  const a = P.alveolarGas({ fio2: 0.21, pb: 760, paco2: 40, rq: 0.8 });
  near(a.pio2, 149.7, 0.1); between(a.pao2, 98, 104, 'full'); near(a.pao2Simple, 99.7, 0.1, 'simplified');
  near(P.alveolarGas({ fio2: 1, pb: 760, paco2: 40, rq: 0.8 }).pao2, 673, 0.01, 'on 100 % O2 the R term vanishes');
  const ev = P.alveolarGas({ fio2: 0.21, pb: P.barometricPressure(8848, 'west'), paco2: 7.5, rq: 0.85 });
  between(ev.pao2, 32, 40, 'Everest summit with extreme hyperventilation (West 1983: ≈ 35 mmHg)');
  near(P.expectedAa(40).mellemgaard, 10.9, 1e-9); near(P.expectedAa(40).rule, 12.5, 1e-9);
  near(P.aaGradient(100, 90), 10, 1e-12);
});

test('Resp: alveolar ventilation equation and dead space', () => {
  near(P.paco2FromVA(200, 4.3), 40.14, 0.01);
  near(P.paco2FromVA(200, 2.15), 2 * P.paco2FromVA(200, 4.3), 1e-9, 'halving VA doubles PaCO2');
  near(P.alveolarVentilation(500, 150, 12), 4.2, 1e-12);
  near(P.bohrDeadSpace(40, 28), 0.3, 1e-12);
  const n = P.deadSpaceModel({ vt: 500, vdAnat: 150, vdAlv: 0, rr: 12, vco2: 200 });
  near(n.bohr, 0.3, 1e-9); near(n.enghoff, 0.3, 1e-9); near(n.gap, 0, 1e-9);
  const pe = P.deadSpaceModel({ vt: 500, vdAnat: 150, vdAlv: 100, rr: 12, vco2: 200 });
  near(pe.enghoff, 0.5, 1e-9, 'physiological dead space includes alveolar'); near(pe.bohr, 0.3, 1e-9);
  assert.ok(pe.gap > 10 && pe.paco2 > n.paco2, 'PaCO2–PETCO2 gap widens');
});

test('Resp: shunt barely responds to O2 whereas V/Q mismatch does', () => {
  const n21 = P.gasExchange({ fio2: 0.21 });
  between(n21.pao2, 95, 106, 'normal lung');
  const sh21 = P.gasExchange({ fio2: 0.21, shunt: 0.3 }), sh100 = P.gasExchange({ fio2: 1, shunt: 0.3 });
  const vq21 = P.gasExchange({ fio2: 0.21, fLow: 0.5, vqLow: 0.1 }), vq100 = P.gasExchange({ fio2: 1, fLow: 0.5, vqLow: 0.1 });
  assert.ok(sh21.pao2 < 65 && vq21.pao2 < 65, 'both hypoxaemic on air');
  assert.ok(sh100.pao2 < 150, `30 % shunt on 100 % O2: ${sh100.pao2}`);
  assert.ok(vq100.pao2 > 500, `V/Q mismatch on 100 % O2: ${vq100.pao2}`);
  between(P.gasExchange({ fio2: 1, shunt: 0.1 }).pao2, 400, 560, '10 % shunt (iso-shunt diagram)');
  near(P.contentStdInv(P.contentStd(80, 15), 15), 80, 1e-5);
});

/* ------------------------------------------------------------------ acid–base */
test('Acid–base: Henderson–Hasselbalch', () => {
  near(P.hhPH(24, 40), 7.40, 0.01);
  near(P.hhHCO3(7.4, 40), 23.94, 0.01);
  near(P.hhPCO2(P.hhPH(15, 30), 15), 30, 1e-9);
  near(P.hPlus(7.4), 39.8, 0.1);
  near(P.hhPH(12, 20), P.hhPH(24, 40), 1e-12, 'pH depends on the ratio only');
});

test('Acid–base: in-vivo buffer line reproduces acute CO2 titration (~+1 and −2 mmol/L per 10 mmHg)', () => {
  const up = P.bufferLineState(80, 0), down = P.bufferLineState(20, 0);
  between((up.hco3 - P.AB_NORMAL.hco3) / 4, 0.7, 1.3, 'acute hypercapnia');
  between((P.AB_NORMAL.hco3 - down.hco3) / 2, 1.4, 2.4, 'acute hypocapnia');
  near(P.hhPH(up.hco3, 80), up.pH, 1e-9);
  const blood = P.bufferLineState(80, 0, P.BETA.invitro);
  assert.ok(blood.hco3 > up.hco3, 'whole blood in vitro buffers more strongly (Hb)');
});

test('Acid–base: compensation paths follow Winters and the Boston rules', () => {
  const ma = P.disorderPath('metAcid');
  near(ma.compensated.pco2, 1.5 * ma.compensated.hco3 + 8, 1e-6, 'Winters');
  assert.ok(ma.primary.pH < ma.compensated.pH && ma.compensated.pH < 7.4);
  const mk = P.disorderPath('metAlk');
  near(mk.compensated.pco2, 40 + 0.7 * (mk.compensated.hco3 - 24), 1e-6);
  assert.ok(mk.primary.pH > mk.compensated.pH && mk.compensated.pH > 7.4);
  const ra = P.disorderPath('respAcid', 70);
  near(ra.compensated.hco3, 24 + 0.35 * 30, 1e-9); assert.ok(ra.compensated.pH > ra.primary.pH && ra.compensated.pH < 7.4);
  const rk = P.disorderPath('respAlk', 25);
  near(rk.compensated.hco3, 24 - 0.4 * 15, 1e-9); assert.ok(rk.compensated.pH < rk.primary.pH && rk.compensated.pH > 7.4);
  const oc = P.openClosedBuffer(10);
  assert.ok(oc.open.pH > 7.1 && oc.closed.pH < 6.5, 'an open (ventilated) system buffers far better');
});

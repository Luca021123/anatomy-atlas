/* Open Medical Toolkit · Clinician Toolkit · package C2 (acid–base, fluids & drugs)
 * clinician/lib/fluids-drugs.js — pure logic for maintenance fluids, burns resuscitation and TBSA,
 * the paediatric emergency sheet, the infusion converter and the laboratory unit converter.
 * Browser: MTLib.fluidsDrugs   ·   Node (tests): module.exports
 *
 * Sources (each is cited again beside the code that uses it):
 *  [HS]     Holliday MA, Segar WE. The maintenance need for water in parenteral fluid therapy. Pediatrics 1957;19:823–32.
 *  [NICE]   NICE CG174. Intravenous fluid therapy in adults in hospital (2013, updated 2017): 25–30 mL/kg/day water.
 *  [PARK]   Baxter CR, Shires T. Physiological response to crystalloid resuscitation of severe burns. Ann N Y Acad Sci 1968;150:874–94
 *           (Parkland: 4 mL/kg/%TBSA in 24 h, half in the first 8 h from the time of burn).
 *  [BROOKE] Modified Brooke formula 2 mL/kg/%TBSA (Pruitt BA; American Burn Association Advanced Burn Life Support).
 *  [NINES]  Wallace AB. The exposure treatment of burns. Lancet 1951;1:501–4 (rule of nines); paediatric variant as in ATLS.
 *  [LB]     Lund CC, Browder NC. The estimation of areas of burns. Surg Gynecol Obstet 1944;79:352–8.
 *  [APLS]   Advanced Paediatric Life Support (ALSG) weight formulas: 0–12 months (0.5 × months) + 4; 1–5 years (2 × years) + 8;
 *           6–12 years (3 × years) + 7 (as reported in BMC Emerg Med 2012;12:9 and Am J Emerg Med 2015 weight-estimation studies).
 *  [ETT]    Uncuffed tracheal tube ID = age/4 + 4 (Cole); cuffed ID = age/4 + 3.5 (Duracher C et al. Paediatr Anaesth 2008;18:113–8);
 *           oral length = age/2 + 12 cm, nasal age/2 + 15 cm (APLS). Formulas for children aged 1–12 years.
 *  [RCUK25] Resuscitation Council UK 2025 Paediatric advanced life support algorithm and ERC Guidelines 2025 Paediatric Life
 *           Support: adrenaline 10 micrograms/kg (max single dose 1 mg) every 3–5 min; amiodarone 5 mg/kg after the 3rd shock
 *           (max 300 mg) and after the 5th shock (max 150 mg); shocks 4 J/kg (doses above adult energies, 120–200 J, are
 *           unnecessary), escalating stepwise from the 5th shock to 8 J/kg (max 360 J) for refractory VF/pVT.
 *  [RCUKA]  Resuscitation Council UK 2025 Paediatric arrhythmia algorithm: atropine 20 micrograms/kg (max 0.5 mg) up to 11 years;
 *           300–600 micrograms at 12–17 years.
 *  [ANZ]    ANZCOR Guideline 12 (paediatric advanced life support): adenosine 100 micrograms/kg (max 6 mg), then 200 micrograms/kg
 *           (max 12 mg per single dose); ANMF adenosine monograph (first dose ≤ 6 mg, second ≤ 12 mg).
 *  [RCUKC]  Resuscitation Council UK Paediatric emergency drug chart (2026, RCUK 2025 guidelines): fluid bolus 10 mL/kg;
 *           glucose 10% 2 mL/kg (2.5 mL/kg in newborns).
 *  [ANA]    Resuscitation Council UK. Emergency treatment of anaphylaxis (May 2021): IM adrenaline 1 mg/mL — < 6 months
 *           100–150 micrograms; 6 months–6 years 150 micrograms; 6–12 years 300 micrograms; > 12 years and adults 500 micrograms.
 *  [LORA]   Chamberlain JM et al. Pharmacokinetics of intravenous lorazepam in pediatric patients with and without status
 *           epilepticus. J Pediatr 2011;160:667–72 (0.1 mg/kg, maximum initial dose 4 mg); Gonzalez D et al. Clin Pharmacokinet 2017;56:941–51.
 *  [TXA]    Misir A, Mehrotra S. Fluid and medication considerations in the traumatized patient. Curr Pediatr Rev 2018;14:9–27
 *           (tranexamic acid loading dose 15 mg/kg, maximum 1 g).
 *  [SI]     Young DS. Implementation of SI units for clinical laboratory data. Ann Intern Med 1987;106:114–29; molar masses (IUPAC).
 *  [HBA1C]  Hoelzel W et al. Clin Chem 2004;50:166–74 (NGSP % = 0.915 × IFCC % + 2.15, i.e. IFCC mmol/mol = (NGSP − 2.15) × 10.929).
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).fluidsDrugs = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function fmt(x, dp) {
    if (!isNum(x)) return '—';
    var f = Math.pow(10, dp == null ? 0 : dp);
    var r = Math.round((Math.abs(x) + 1e-9) * f) / f * (x < 0 ? -1 : 1);
    return String(+r.toFixed(dp == null ? 0 : dp));
  }
  /** Sensible precision for a dose or volume: 3 significant figures, never more than 2 decimals above 1. */
  function smart(x) {
    if (!isNum(x)) return '—';
    var a = Math.abs(x);
    return fmt(x, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
  }

  /* ================================================================== maintenance fluids */
  /** Holliday–Segar [HS]: 100 mL/kg/day for the first 10 kg, 50 mL/kg/day for the next 10 kg, 20 mL/kg/day above 20 kg. */
  function hollidaySegarDaily(w) {
    if (!(w > 0)) return null;
    return w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20);
  }
  /** Hourly "4-2-1" rule [HS]: 4 mL/kg/h for the first 10 kg, 2 mL/kg/h for the next 10 kg, 1 mL/kg/h above 20 kg. */
  function rule421(w) {
    if (!(w > 0)) return null;
    return w <= 10 ? 4 * w : w <= 20 ? 40 + 2 * (w - 10) : 60 + (w - 20);
  }
  /** Adult routine maintenance [NICE]: 25–30 mL/kg/day of water. */
  function adultMaintenance(w) {
    if (!(w > 0)) return null;
    return { lowDay: 25 * w, highDay: 30 * w, lowHour: 25 * w / 24, highHour: 30 * w / 24 };
  }

  /* ================================================================== burns */
  var BURN_FORMULAS = [
    { id: 'parkland', label: 'Parkland', mlPerKgPct: 4, source: 'Baxter & Shires 1968' },
    { id: 'brooke', label: 'Modified Brooke', mlPerKgPct: 2, source: 'Modified Brooke (ABA ABLS)' }
  ];
  /**
   * Burns resuscitation volume: mL/kg/%TBSA × weight × %TBSA over 24 h, half in the first 8 h from the time of
   * the burn and half over the next 16 h [PARK, BROOKE]. Accounts for a delayed start and fluid already given.
   * o = { weight, tbsa, mlPerKgPct, hoursSinceBurn, givenMl }
   */
  function burnsResuscitation(o) {
    if (!(o.weight > 0) || !(o.tbsa > 0) || o.tbsa > 100 || !(o.mlPerKgPct > 0)) return null;
    var total = o.mlPerKgPct * o.weight * o.tbsa;
    var t = isNum(o.hoursSinceBurn) ? Math.max(0, o.hoursSinceBurn) : 0;
    var given = isNum(o.givenMl) ? Math.max(0, o.givenMl) : 0;
    var r = { total: total, first8: total / 2, next16: total / 2, plannedRateFirst8: total / 16, rateNext16: total / 32, hoursSinceBurn: t, given: given };
    if (t < 8) {
      r.phase = 'first';
      r.remainingFirst = Math.max(0, r.first8 - given);
      r.hoursLeftFirst = 8 - t;
      r.rateNow = r.remainingFirst / r.hoursLeftFirst;
      r.firstHalfComplete = given >= r.first8;
    } else if (t < 24) {
      r.phase = 'second';
      r.remaining = Math.max(0, total - given);
      r.hoursLeft = 24 - t;
      r.rateNow = r.remaining / r.hoursLeft;
      r.behind = given < r.first8;
    } else r.phase = 'beyond';
    return r;
  }

  /** Rule of nines [NINES]; percentages of total body surface area per region. */
  var RULE_OF_NINES = {
    adult: [
      { id: 'head', label: 'Head and neck', pct: 9 },
      { id: 'arm-r', label: 'Right arm', pct: 9 },
      { id: 'arm-l', label: 'Left arm', pct: 9 },
      { id: 'trunk-ant', label: 'Front of trunk', pct: 18 },
      { id: 'trunk-post', label: 'Back of trunk', pct: 18 },
      { id: 'leg-r', label: 'Right leg', pct: 18 },
      { id: 'leg-l', label: 'Left leg', pct: 18 },
      { id: 'perineum', label: 'Perineum and genitalia', pct: 1 }
    ],
    child: [
      { id: 'head', label: 'Head and neck', pct: 18 },
      { id: 'arm-r', label: 'Right arm', pct: 9 },
      { id: 'arm-l', label: 'Left arm', pct: 9 },
      { id: 'trunk-ant', label: 'Front of trunk', pct: 18 },
      { id: 'trunk-post', label: 'Back of trunk', pct: 18 },
      { id: 'leg-r', label: 'Right leg', pct: 14 },
      { id: 'leg-l', label: 'Left leg', pct: 14 }
    ]
  };
  /** Lund & Browder [LB]: age-dependent half-head (A), half-thigh (B) and half-lower-leg (C) per surface. */
  var LB_BANDS = [
    { id: '0', label: 'Under 1 year', A: 9.5, B: 2.75, C: 2.5 },
    { id: '1', label: '1–4 years', A: 8.5, B: 3.25, C: 2.5 },
    { id: '5', label: '5–9 years', A: 6.5, B: 4, C: 2.75 },
    { id: '10', label: '10–14 years', A: 5.5, B: 4.25, C: 3 },
    { id: '15', label: '15 years', A: 4.5, B: 4.5, C: 3.25 },
    { id: 'adult', label: 'Adult (16+)', A: 3.5, B: 4.75, C: 3.5 }
  ];
  var LB_REGIONS = [
    { id: 'head', label: 'Head', ant: 'A', post: 'A' },
    { id: 'neck', label: 'Neck', ant: 1, post: 1 },
    { id: 'trunk', label: 'Trunk', ant: 13, post: 13 },
    { id: 'buttock-r', label: 'Right buttock', post: 2.5 },
    { id: 'buttock-l', label: 'Left buttock', post: 2.5 },
    { id: 'genitalia', label: 'Genitalia', ant: 1 },
    { id: 'upperarm-r', label: 'Right upper arm', ant: 2, post: 2 },
    { id: 'upperarm-l', label: 'Left upper arm', ant: 2, post: 2 },
    { id: 'forearm-r', label: 'Right lower arm', ant: 1.5, post: 1.5 },
    { id: 'forearm-l', label: 'Left lower arm', ant: 1.5, post: 1.5 },
    { id: 'hand-r', label: 'Right hand', ant: 1.25, post: 1.25 },
    { id: 'hand-l', label: 'Left hand', ant: 1.25, post: 1.25 },
    { id: 'thigh-r', label: 'Right thigh', ant: 'B', post: 'B' },
    { id: 'thigh-l', label: 'Left thigh', ant: 'B', post: 'B' },
    { id: 'leg-r', label: 'Right lower leg', ant: 'C', post: 'C' },
    { id: 'leg-l', label: 'Left lower leg', ant: 'C', post: 'C' },
    { id: 'foot-r', label: 'Right foot', ant: 1.75, post: 1.75 },
    { id: 'foot-l', label: 'Left foot', ant: 1.75, post: 1.75 }
  ];
  function lundBrowderBand(ageYears) {
    if (!isNum(ageYears) || ageYears < 0) return null;
    return ageYears < 1 ? '0' : ageYears < 5 ? '1' : ageYears < 10 ? '5' : ageYears < 15 ? '10' : ageYears < 16 ? '15' : 'adult';
  }
  /** Areas for a TBSA model: [{ key, regionId, side, label, pct }]. model: 'nines-adult' | 'nines-child' | 'lund-browder'. */
  function tbsaAreas(model, bandId) {
    if (model === 'nines-adult' || model === 'nines-child') {
      return RULE_OF_NINES[model === 'nines-adult' ? 'adult' : 'child'].map(function (r) { return { key: r.id, regionId: r.id, side: null, label: r.label, pct: r.pct }; });
    }
    var band = LB_BANDS.filter(function (b) { return b.id === bandId; })[0] || LB_BANDS[LB_BANDS.length - 1];
    var out = [];
    LB_REGIONS.forEach(function (r) {
      ['ant', 'post'].forEach(function (side) {
        if (r[side] == null) return;
        var v = typeof r[side] === 'string' ? band[r[side]] : r[side];
        out.push({ key: r.id + ':' + side, regionId: r.id, side: side, label: r.label + (side === 'ant' ? ' — front' : ' — back'), pct: v });
      });
    });
    return out;
  }
  /** Total %TBSA from { areaKey: fraction burned (0–1) }. */
  function tbsaTotal(model, bandId, selections) {
    var t = 0;
    tbsaAreas(model, bandId).forEach(function (a) {
      var f = selections && selections[a.key];
      if (isNum(f) && f > 0) t += a.pct * Math.min(1, f);
    });
    return Math.round(t * 100) / 100;
  }

  /* ================================================================== paediatric emergency sheet */
  /** APLS age-based weight estimate [APLS]. Returns { kg, formula } or null when outside 0–12 years. */
  function aplsWeight(years, months) {
    var y = isNum(years) ? years : 0, m = isNum(months) ? months : 0;
    if (y < 0 || m < 0) return null;
    var total = y * 12 + m;
    if (total < 12) return { kg: 0.5 * total + 4, formula: '(0.5 × age in months) + 4', band: '0–12 months' };
    var yrs = Math.floor(total / 12);
    if (yrs <= 5) return { kg: 2 * yrs + 8, formula: '(2 × age in years) + 8', band: '1–5 years' };
    if (yrs <= 12) return { kg: 3 * yrs + 7, formula: '(3 × age in years) + 7', band: '6–12 years' };
    return null;
  }
  function roundHalfDown(x) { return Math.floor(x * 2 + 1e-9) / 2; }
  function roundHalfUp(x) { return Math.ceil(x * 2 - 1e-9) / 2; }
  /** Tracheal tube estimates [ETT] for ages 1–12 years (completed years). */
  function ettSizes(ageYears) {
    if (!isNum(ageYears) || ageYears < 1 || ageYears >= 13) return null;
    var y = Math.floor(ageYears);
    var u = y / 4 + 4, c = y / 4 + 3.5;
    function sizes(x) { var lo = roundHalfDown(x), hi = roundHalfUp(x); return lo === hi ? [lo] : [lo, hi]; }
    return { age: y, uncuffed: u, cuffed: c, uncuffedSizes: sizes(u), cuffedSizes: sizes(c), oralCm: y / 2 + 12, nasalCm: y / 2 + 15 };
  }
  /** weight × perKg, capped at max. */
  function weightDose(perKg, weight, max) {
    if (!isNum(perKg) || !(weight > 0)) return null;
    var raw = perKg * weight;
    var capped = isNum(max) && raw > max;
    return { raw: raw, dose: capped ? max : raw, capped: capped };
  }
  /** IM adrenaline 1 mg/mL for anaphylaxis by age band [ANA]. ageMonths: completed months. */
  function imAdrenaline(ageMonths) {
    if (!isNum(ageMonths) || ageMonths < 0) return null;
    if (ageMonths < 6) return { band: 'Under 6 months', mcgLo: 100, mcgHi: 150 };
    if (ageMonths < 72) return { band: '6 months to 6 years', mcg: 150 };
    if (ageMonths < 144) return { band: '6–12 years', mcg: 300 };
    if (ageMonths < 156) return { band: '6–12 years', mcg: 300, boundary: true };
    return { band: 'Over 12 years and adults', mcg: 500 };
  }
  var IM_ADRENALINE_BANDS = [
    { band: 'Under 6 months', text: '100–150 micrograms (0.1–0.15 mL)' },
    { band: '6 months to 6 years', text: '150 micrograms (0.15 mL)' },
    { band: '6–12 years', text: '300 micrograms (0.3 mL)' },
    { band: 'Over 12 years and adults', text: '500 micrograms (0.5 mL)' }
  ];

  var SOURCES = {
    RCUK25: 'Resuscitation Council UK 2025 paediatric ALS algorithm; ERC Guidelines 2025 Paediatric Life Support',
    RCUKA: 'Resuscitation Council UK 2025 paediatric arrhythmia algorithm',
    ANZ: 'ANZCOR Guideline 12 (paediatric ALS); ANMF adenosine monograph',
    RCUKC: 'Resuscitation Council UK paediatric emergency drug chart (2026)',
    ANA: 'Resuscitation Council UK, Emergency treatment of anaphylaxis (2021)',
    LORA: 'Chamberlain JM et al. J Pediatr 2011;160:667–72 (PECARN)',
    TXA: 'Misir A, Mehrotra S. Curr Pediatr Rev 2018;14:9–27',
    APLS: 'APLS (ALSG) age-based formulas'
  };

  /**
   * Weight-based paediatric emergency doses. ctx = { weight (kg), ageMonths (optional) }.
   * Each row: { id, group, name, route, perKg, unit, dose, raw, capped, max, maxText, volumeText, note, source }.
   */
  function paedsDoses(ctx) {
    var w = ctx.weight, am = ctx.ageMonths;
    if (!(w > 0)) return [];
    var rows = [];
    function row(o) {
      var d = weightDose(o.perKg, w, o.max);
      rows.push(Object.assign({ raw: d.raw, dose: d.dose, capped: d.capped }, o));
    }
    // Cardiac arrest
    row({ id: 'defib', group: 'arrest', name: 'Defibrillation (VF / pulseless VT)', route: 'Shock', perKg: 4, unit: 'J', max: 200,
      maxText: 'Adult energy for the device (120–200 J)', note: 'Anteroposterior pads under 25 kg; use paediatric mode where available.', source: SOURCES.RCUK25 });
    row({ id: 'defib-refractory', group: 'arrest', name: 'Refractory VF / pVT — from the 5th shock', route: 'Shock', perKg: 8, unit: 'J', max: 360,
      maxText: '8 J/kg, max 360 J', note: 'Escalate stepwise towards this energy.', source: SOURCES.RCUK25 });
    row({ id: 'adrenaline', group: 'arrest', name: 'Adrenaline (epinephrine)', route: 'IV / IO', perKg: 10, unit: 'microgram', max: 1000,
      maxText: '1 mg (10 mL of 1:10,000)', note: 'Every 3–5 min. 1:10,000 = 100 micrograms/mL.', perMl: 100, source: SOURCES.RCUK25 });
    row({ id: 'amiodarone-1', group: 'arrest', name: 'Amiodarone — after the 3rd shock', route: 'IV / IO', perKg: 5, unit: 'mg', max: 300,
      maxText: '300 mg', note: 'Shockable rhythms only.', source: SOURCES.RCUK25 });
    row({ id: 'amiodarone-2', group: 'arrest', name: 'Amiodarone — after the 5th shock', route: 'IV / IO', perKg: 5, unit: 'mg', max: 150,
      maxText: '150 mg', note: 'Second (final) dose if still in VF / pVT.', source: SOURCES.RCUK25 });
    // Arrhythmia
    row({ id: 'adenosine-1', group: 'arrhythmia', name: 'Adenosine — 1st dose (SVT)', route: 'IV rapid bolus + flush', perKg: 0.1, unit: 'mg', max: 6,
      maxText: '6 mg', note: 'Give with continuous ECG recording.', source: SOURCES.ANZ });
    row({ id: 'adenosine-2', group: 'arrhythmia', name: 'Adenosine — 2nd dose', route: 'IV rapid bolus + flush', perKg: 0.2, unit: 'mg', max: 12,
      maxText: '12 mg', note: 'If the first dose fails.', source: SOURCES.ANZ });
    var adolescent = isNum(am) && am >= 144;
    if (adolescent) {
      rows.push({ id: 'atropine', group: 'arrhythmia', name: 'Atropine (bradycardia)', route: 'IV / IO', fixedText: '300–600 micrograms', unit: 'microgram',
        maxText: '12–17 years: 300–600 micrograms', note: 'Adolescent dose range (no per-kg dose).', source: SOURCES.RCUKA });
    } else {
      row({ id: 'atropine', group: 'arrhythmia', name: 'Atropine (bradycardia)', route: 'IV / IO', perKg: 20, unit: 'microgram', max: 500,
        maxText: '0.5 mg (up to 11 years)', note: isNum(am) ? 'Vagally mediated or AV-block bradycardia.' : 'Age 12–17 years: 300–600 micrograms instead.', source: SOURCES.RCUKA });
    }
    // Glucose and fluids
    row({ id: 'glucose', group: 'fluids', name: 'Glucose 10% (hypoglycaemia)', route: 'IV / IO', perKg: 2, unit: 'mL', max: null,
      maxText: 'None stated — repeat if necessary', note: 'Newborns: 2.5 mL/kg. 2 mL/kg of 10% = 200 mg/kg glucose.', source: SOURCES.RCUKC });
    row({ id: 'bolus', group: 'fluids', name: 'Fluid bolus (isotonic crystalloid)', route: 'IV / IO', perKg: 10, unit: 'mL', max: null,
      maxText: 'None stated — reassess after each bolus', note: '20 mL/kg (' + smart(20 * w) + ' mL) only where your local shock guideline specifies it.', source: SOURCES.RCUKC });
    // Seizures
    row({ id: 'lorazepam', group: 'neuro', name: 'Lorazepam (convulsive status epilepticus)', route: 'IV / IO', perKg: 0.1, unit: 'mg', max: 4,
      maxText: '4 mg (initial dose)', note: 'Monitor breathing; follow your local status epilepticus algorithm.', source: SOURCES.LORA });
    // Anaphylaxis
    var im = imAdrenaline(am);
    if (im) {
      rows.push({ id: 'im-adrenaline', group: 'anaphylaxis', name: 'Adrenaline IM 1 mg/mL (1:1000) — anaphylaxis', route: 'IM (anterolateral thigh)',
        band: im.band, mcg: im.mcg, mcgLo: im.mcgLo, mcgHi: im.mcgHi, boundary: !!im.boundary, unit: 'microgram',
        fixedText: im.mcg ? im.mcg + ' micrograms (' + fmt(im.mcg / 1000, 2) + ' mL)' : im.mcgLo + '–' + im.mcgHi + ' micrograms (' + fmt(im.mcgLo / 1000, 2) + '–' + fmt(im.mcgHi / 1000, 2) + ' mL)',
        maxText: 'Age-band dose, not per kg', note: 'Repeat after 5 min if no improvement.' + (im.boundary ? ' RCUK gives 500 micrograms for children over 12 years.' : ''), source: SOURCES.ANA });
    } else {
      rows.push({ id: 'im-adrenaline', group: 'anaphylaxis', name: 'Adrenaline IM 1 mg/mL (1:1000) — anaphylaxis', route: 'IM (anterolateral thigh)', bands: IM_ADRENALINE_BANDS,
        fixedText: 'By age band (enter age)', unit: 'microgram', maxText: 'Age-band dose, not per kg', note: 'Repeat after 5 min if no improvement.', source: SOURCES.ANA });
    }
    // Trauma
    row({ id: 'txa', group: 'trauma', name: 'Tranexamic acid — loading dose (major haemorrhage)', route: 'IV', perKg: 15, unit: 'mg', max: 1000,
      maxText: '1 g', note: 'Give early in major traumatic haemorrhage.', source: SOURCES.TXA });
    rows.forEach(function (r) {
      if (isNum(r.dose)) {
        r.doseText = r.unit === 'microgram' ? smart(r.dose) + ' micrograms' : smart(r.dose) + ' ' + r.unit;
        if (r.perMl) r.volumeText = smart(r.dose / r.perMl) + ' mL of 1:10,000';
        r.perKgText = (r.unit === 'microgram' ? r.perKg + ' micrograms' : r.perKg + ' ' + r.unit) + '/kg';
      } else {
        r.doseText = r.fixedText;
        r.perKgText = '—';
      }
    });
    return rows;
  }
  var PAEDS_GROUPS = [
    { id: 'arrest', label: 'Cardiac arrest' },
    { id: 'arrhythmia', label: 'Arrhythmia' },
    { id: 'fluids', label: 'Glucose and fluids' },
    { id: 'neuro', label: 'Seizures' },
    { id: 'anaphylaxis', label: 'Anaphylaxis' },
    { id: 'trauma', label: 'Trauma' }
  ];

  /* ================================================================== infusion converter */
  // Base quantities: micrograms (mass), units, mmol.
  var AMOUNT_UNITS = [
    { id: 'mg', label: 'mg', kind: 'mass', f: 1000 },
    { id: 'mcg', label: 'micrograms', kind: 'mass', f: 1 },
    { id: 'g', label: 'g', kind: 'mass', f: 1e6 },
    { id: 'units', label: 'units', kind: 'units', f: 1 },
    { id: 'mmol', label: 'mmol', kind: 'mmol', f: 1 }
  ];
  var DOSE_UNITS = [
    { id: 'mcg/kg/min', label: 'micrograms/kg/min', kind: 'mass', f: 1, perKg: true, perMin: true },
    { id: 'mcg/kg/h', label: 'micrograms/kg/h', kind: 'mass', f: 1, perKg: true },
    { id: 'mcg/min', label: 'micrograms/min', kind: 'mass', f: 1, perMin: true },
    { id: 'mcg/h', label: 'micrograms/h', kind: 'mass', f: 1 },
    { id: 'mg/kg/h', label: 'mg/kg/h', kind: 'mass', f: 1000, perKg: true },
    { id: 'mg/min', label: 'mg/min', kind: 'mass', f: 1000, perMin: true },
    { id: 'mg/h', label: 'mg/h', kind: 'mass', f: 1000 },
    { id: 'g/h', label: 'g/h', kind: 'mass', f: 1e6 },
    { id: 'units/kg/h', label: 'units/kg/h', kind: 'units', f: 1, perKg: true },
    { id: 'units/min', label: 'units/min', kind: 'units', f: 1, perMin: true },
    { id: 'units/h', label: 'units/h', kind: 'units', f: 1 },
    { id: 'mmol/kg/h', label: 'mmol/kg/h', kind: 'mmol', f: 1, perKg: true },
    { id: 'mmol/h', label: 'mmol/h', kind: 'mmol', f: 1 }
  ];
  var DROP_FACTORS = [10, 15, 20, 60]; // drops/mL: 10, 15, 20 standard giving sets; 60 microdrop
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function amountUnit(id) { return byId(AMOUNT_UNITS, id); }
  function doseUnit(id) { return byId(DOSE_UNITS, id); }
  /** Concentration in base units per mL (micrograms, units or mmol per mL). */
  function concentration(amount, amountUnitId, volumeMl) {
    var au = amountUnit(amountUnitId);
    if (!au || !(amount > 0) || !(volumeMl > 0)) return null;
    return { perMl: amount * au.f / volumeMl, kind: au.kind };
  }
  function compatible(doseUnitId, amountUnitId) {
    var du = doseUnit(doseUnitId), au = amountUnit(amountUnitId);
    return !!(du && au && du.kind === au.kind);
  }
  /** Base units per hour for a dose. */
  function perHour(dose, du, weight) { return dose * du.f * (du.perKg ? weight : 1) * (du.perMin ? 60 : 1); }
  /** Dose -> rate (mL/h): o = { dose, doseUnit, weight, amount, amountUnit, volume }. */
  function doseToRate(o) {
    var du = doseUnit(o.doseUnit), c = concentration(o.amount, o.amountUnit, o.volume);
    if (!du || !c || du.kind !== c.kind || !isNum(o.dose) || o.dose < 0) return null;
    if (du.perKg && !(o.weight > 0)) return null;
    return perHour(o.dose, du, o.weight) / c.perMl;
  }
  /** Rate (mL/h) -> dose in doseUnit: o = { rate, doseUnit, weight, amount, amountUnit, volume }. */
  function rateToDose(o) {
    var du = doseUnit(o.doseUnit), c = concentration(o.amount, o.amountUnit, o.volume);
    if (!du || !c || du.kind !== c.kind || !isNum(o.rate) || o.rate < 0) return null;
    if (du.perKg && !(o.weight > 0)) return null;
    return o.rate * c.perMl / (du.f * (du.perKg ? o.weight : 1) * (du.perMin ? 60 : 1));
  }
  /** Gravity drip: drops/min = mL/h × drop factor (drops/mL) ÷ 60. */
  function dropsPerMin(mlPerHour, dropFactor) {
    if (!isNum(mlPerHour) || !(dropFactor > 0) || mlPerHour < 0) return null;
    return mlPerHour * dropFactor / 60;
  }
  /** Validate and normalise a user preset (from storage or import). Returns a clean object or null. */
  function cleanPreset(p) {
    if (!p || typeof p !== 'object') return null;
    var name = typeof p.name === 'string' ? p.name.trim().slice(0, 60) : '';
    var amount = Number(p.amount), volume = Number(p.volume);
    if (!name || !(amount > 0) || !(amount < 1e7) || !(volume > 0) || !(volume <= 10000)) return null;
    if (!amountUnit(p.amountUnit) || !doseUnit(p.doseUnit) || !compatible(p.doseUnit, p.amountUnit)) return null;
    return {
      id: typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : 'p' + Math.random().toString(36).slice(2, 10),
      name: name, amount: amount, amountUnit: p.amountUnit, volume: volume, doseUnit: p.doseUnit,
      note: typeof p.note === 'string' ? p.note.trim().slice(0, 200) : ''
    };
  }

  /* ================================================================== laboratory unit converter [SI] */
  // factor: SI value = conventional value × factor. dpSi / dpConv: display decimals.
  var LAB_UNITS = [
    { id: 'glucose', name: 'Glucose', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 18.016, dpSi: 1, dpConv: 0, note: 'mmol/L = mg/dL ÷ 18.016 (180.16 g/mol)' },
    { id: 'creatinine', name: 'Creatinine', si: 'µmol/L', conv: 'mg/dL', factor: 88.4, dpSi: 0, dpConv: 2, note: 'µmol/L = mg/dL × 88.4 (113.12 g/mol)' },
    { id: 'urea', name: 'Urea ↔ BUN', si: 'mmol/L urea', conv: 'mg/dL BUN', factor: 1 / 2.801, dpSi: 1, dpConv: 0, note: 'Urea mmol/L = BUN mg/dL ÷ 2.801 (BUN counts urea nitrogen, 2 × 14.007 g/mol)' },
    { id: 'urea-mass', name: 'Urea (by mass)', si: 'mmol/L', conv: 'mg/dL urea', factor: 1 / 6.006, dpSi: 1, dpConv: 0, note: 'mmol/L = urea mg/dL ÷ 6.006 (60.06 g/mol)' },
    { id: 'cholesterol', name: 'Cholesterol — total, LDL, HDL, non-HDL', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 38.67, dpSi: 2, dpConv: 0, note: 'mmol/L = mg/dL ÷ 38.67 (386.65 g/mol)' },
    { id: 'triglycerides', name: 'Triglycerides', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 88.57, dpSi: 2, dpConv: 0, note: 'mmol/L = mg/dL ÷ 88.57 (as triolein, 885.7 g/mol)' },
    { id: 'calcium', name: 'Calcium', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 4.008, dpSi: 2, dpConv: 1, note: 'mmol/L = mg/dL ÷ 4.008 (40.08 g/mol)' },
    { id: 'magnesium', name: 'Magnesium', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 2.431, dpSi: 2, dpConv: 1, note: 'mmol/L = mg/dL ÷ 2.431 (24.31 g/mol); mEq/L = mmol/L × 2' },
    { id: 'phosphate', name: 'Phosphate (as phosphorus)', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 3.097, dpSi: 2, dpConv: 1, note: 'mmol/L = mg/dL ÷ 3.097 (phosphorus 30.97 g/mol)' },
    { id: 'bilirubin', name: 'Bilirubin', si: 'µmol/L', conv: 'mg/dL', factor: 17.1, dpSi: 0, dpConv: 1, note: 'µmol/L = mg/dL × 17.1 (584.66 g/mol)' },
    { id: 'albumin', name: 'Albumin / total protein', si: 'g/L', conv: 'g/dL', factor: 10, dpSi: 0, dpConv: 1, note: 'g/L = g/dL × 10' },
    { id: 'haemoglobin', name: 'Haemoglobin', si: 'g/L', conv: 'g/dL', factor: 10, dpSi: 0, dpConv: 1, note: 'g/L = g/dL × 10' },
    { id: 'hba1c', name: 'HbA1c', si: 'mmol/mol (IFCC)', conv: '% (DCCT/NGSP)', dpSi: 0, dpConv: 1, note: 'IFCC = (DCCT − 2.15) × 10.929 (Hoelzel 2004)',
      toSi: function (pct) { return (pct - 2.15) * 10.929; }, toConv: function (mmolmol) { return mmolmol / 10.929 + 2.15; } },
    { id: 'urate', name: 'Uric acid (urate)', si: 'µmol/L', conv: 'mg/dL', factor: 59.48, dpSi: 0, dpConv: 1, note: 'µmol/L = mg/dL × 59.48 (168.11 g/mol)' },
    { id: 'lactate', name: 'Lactate', si: 'mmol/L', conv: 'mg/dL', factor: 1 / 9.008, dpSi: 1, dpConv: 0, note: 'mmol/L = mg/dL ÷ 9.008 (90.08 g/mol)' },
    { id: 'vitamin-d', name: 'Vitamin D (25-hydroxy)', si: 'nmol/L', conv: 'ng/mL', factor: 2.496, dpSi: 0, dpConv: 1, note: 'nmol/L = ng/mL × 2.496 (400.64 g/mol)' },
    { id: 'pressure', name: 'Blood-gas pressure', si: 'kPa', conv: 'mmHg', factor: 1 / 7.50062, dpSi: 2, dpConv: 1, note: 'mmHg = kPa × 7.50062' },
    { id: 'temperature', name: 'Temperature', si: '°C', conv: '°F', dpSi: 1, dpConv: 1, note: '°F = °C × 9/5 + 32',
      toSi: function (f) { return (f - 32) * 5 / 9; }, toConv: function (c) { return c * 9 / 5 + 32; } },
    { id: 'weight', name: 'Weight', si: 'kg', conv: 'lb', factor: 0.45359237, dpSi: 2, dpConv: 1, note: '1 lb = 0.45359237 kg; 1 stone = 14 lb' },
    { id: 'height', name: 'Height / length', si: 'cm', conv: 'in', factor: 2.54, dpSi: 1, dpConv: 1, note: '1 inch = 2.54 cm; 1 foot = 12 inches' }
  ];
  function labUnit(id) { return byId(LAB_UNITS, id); }
  function toSi(id, v) { var u = labUnit(id); if (!u || !isNum(v)) return null; return u.toSi ? u.toSi(v) : v * u.factor; }
  function toConv(id, v) { var u = labUnit(id); if (!u || !isNum(v)) return null; return u.toConv ? u.toConv(v) : v / u.factor; }
  function feetInches(cm) {
    if (!isNum(cm) || cm < 0) return null;
    var totalIn = cm / 2.54, ft = Math.floor(totalIn / 12), inch = totalIn - ft * 12;
    if (inch >= 11.95) { ft += 1; inch = 0; }
    return { ft: ft, inch: inch };
  }
  function stonesPounds(kg) {
    if (!isNum(kg) || kg < 0) return null;
    var lb = kg / 0.45359237, st = Math.floor(lb / 14), rem = lb - st * 14;
    if (rem >= 13.95) { st += 1; rem = 0; }
    return { st: st, lb: rem };
  }

  return {
    fmt: fmt, smart: smart, isNum: isNum,
    hollidaySegarDaily: hollidaySegarDaily, rule421: rule421, adultMaintenance: adultMaintenance,
    BURN_FORMULAS: BURN_FORMULAS, burnsResuscitation: burnsResuscitation,
    RULE_OF_NINES: RULE_OF_NINES, LB_BANDS: LB_BANDS, LB_REGIONS: LB_REGIONS, lundBrowderBand: lundBrowderBand,
    tbsaAreas: tbsaAreas, tbsaTotal: tbsaTotal,
    aplsWeight: aplsWeight, ettSizes: ettSizes, weightDose: weightDose, imAdrenaline: imAdrenaline,
    IM_ADRENALINE_BANDS: IM_ADRENALINE_BANDS, paedsDoses: paedsDoses, PAEDS_GROUPS: PAEDS_GROUPS, SOURCES: SOURCES,
    AMOUNT_UNITS: AMOUNT_UNITS, DOSE_UNITS: DOSE_UNITS, DROP_FACTORS: DROP_FACTORS, amountUnit: amountUnit, doseUnit: doseUnit,
    concentration: concentration, compatible: compatible, doseToRate: doseToRate, rateToDose: rateToDose, dropsPerMin: dropsPerMin,
    cleanPreset: cleanPreset,
    LAB_UNITS: LAB_UNITS, labUnit: labUnit, toSi: toSi, toConv: toConv, feetInches: feetInches, stonesPounds: stonesPounds
  };
});

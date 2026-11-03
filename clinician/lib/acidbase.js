/* Open Medical Toolkit · Clinician Toolkit · package C2 (acid–base, fluids & drugs)
 * clinician/lib/acidbase.js — pure logic for the blood-gas interpreter and the electrolyte tools.
 * Browser: MTLib.acidbase   ·   Node (tests): module.exports
 *
 * Internal units: PaCO2, PaO2 and barometric pressure in mmHg; Na, Cl, HCO3, glucose, urea, lactate and
 * ethanol in mmol/L; albumin in g/L; osmolality in mOsm/kg; FiO2 as a fraction (0.21–1.0).
 *
 * Sources (each is cited again beside the code that uses it):
 *  [HEND]  Henderson equation [H+] (nmol/L) = 24 × PaCO2 (mmHg) / HCO3 (mmol/L); Kaufman DA, "Interpretation of
 *          arterial blood gases", American Thoracic Society clinical education series.
 *  [WINT]  Winter's formula: Albert MS, Dell RB, Winters RW. Ann Intern Med 1967;66:312–22.
 *  [BOST]  Bedside compensation rules ("Boston rules" 1–6): Brandis K. Acid–base physiology (anaesthesiaMCQ.com):
 *          acute/chronic respiratory acidosis +1/+4 mmol/L HCO3 per 10 mmHg PaCO2; acute/chronic respiratory
 *          alkalosis −2/−5 per 10 mmHg; metabolic alkalosis PaCO2 = 0.7 × HCO3 + 20 (± 5).
 *  [FIGG]  Albumin-corrected anion gap (+0.25 mmol/L per g/L below normal): Figge J et al. Crit Care Med 1998;26:1807–10.
 *  [GABO]  Raised anion gap as a marker of organic acidosis: Gabow PA et al. N Engl J Med 1980;303:854–8.
 *  [RAST]  Delta ratio: Rastegar A. J Am Soc Nephrol 2007;18:2429–31 (bands as in Brandis K, ref. BOST).
 *  [HOFF]  Osmolar gap (normal −2 ± 6 mOsm): Hoffman RS et al. J Toxicol Clin Toxicol 1993;31:81–93.
 *  [PURS]  Ethanol contribution to osmolality 1.25 × ethanol (mmol/L): Purssell RA et al. Ann Emerg Med 2001;38:653–9.
 *  [MELL]  Normal A–a gradient rises with age (≈ 2.5 + 0.21 × age mmHg): Mellemgaard K. Acta Physiol Scand 1966;67:10–20.
 *  [BERL]  ARDS Definition Task Force. Acute respiratory distress syndrome: the Berlin Definition. JAMA 2012;307:2526–33.
 *  [ISA]   Barometric pressure from altitude: ICAO / ISO 2533 International Standard Atmosphere.
 *  [GOLD]  Mehta AN, Emmett JB, Emmett M. GOLD MARK: an anion gap mnemonic for the 21st century. Lancet 2008;372:892.
 *  [BATL]  Batlle DC et al. The use of the urinary anion gap in hyperchloremic metabolic acidosis. N Engl J Med 1988;318:594–9.
 *  [BERE]  Berend K, de Vries APJ, Gans ROB. Physiological approach to assessment of acid–base disturbances. N Engl J Med 2014;371:1434–45.
 *  [KATZ]  Katz MA. Hyperglycemia-induced hyponatremia. N Engl J Med 1973;289:843–4 (1.6 mmol/L per 100 mg/dL glucose).
 *  [HILL]  Hillier TA, Abbott RD, Barrett EJ. Am J Med 1999;106:399–403 (2.4 mmol/L per 100 mg/dL glucose).
 *  [PAYN]  Payne RB et al. Interpretation of serum calcium in patients with abnormal serum proteins. BMJ 1973;4:643–6.
 *  [ADMA]  Adrogué HJ, Madias NE. Hyponatremia. N Engl J Med 2000;342:1581–9; Hypernatremia. N Engl J Med 2000;342:1493–9.
 *  [ESE]   Spasovski G et al. Clinical practice guideline on diagnosis and treatment of hyponatraemia. Eur J Endocrinol 2014;170:G1–47.
 *  [VERB]  Verbalis JG et al. Diagnosis, evaluation, and treatment of hyponatremia: expert panel recommendations. Am J Med 2013;126:S1–42.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).acidbase = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ constants & small helpers */
  var MMHG_PER_KPA = 7.50062;       // 1 kPa = 7.50062 mmHg
  var PH2O = 47;                    // mmHg, saturated water vapour pressure at 37 °C (alveolar gas equation)
  var RQ = 0.8;                     // assumed respiratory quotient
  var NORMAL = {
    phLo: 7.35, phHi: 7.45, phMid: 7.40,
    paco2Lo: 35, paco2Hi: 45, paco2Mid: 40,   // mmHg (4.7–6.0 kPa)
    hco3Lo: 22, hco3Hi: 26, hco3Mid: 24,      // mmol/L
    ag: 12,                                    // mmol/L, normal anion gap used for the delta ratio [RAST]
    albumin: 40,                               // g/L, normal albumin used for the AG correction [FIGG]
    osmGap: 10,                                // mOsm/kg, upper limit (≈ mean + 2 SD of −2 ± 6 in [HOFF])
    lactate: 2,                                // mmol/L, upper limit of normal
    lactateHigh: 4                             // mmol/L, markedly raised (hypoperfusion threshold in sepsis guidance)
  };
  var CONSISTENCY_TOLERANCE = 0.10;  // flag when calculated and measured [H+] differ by > 10 % (≈ 0.04 pH units)
  var HIDDEN_HAGMA_AG = 20;          // corrected AG ≥ 20 suggests an organic acidosis even if HCO3 is not low [GABO]

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  /** Round and trim trailing zeros: fmt(2.50, 2) -> "2.5". */
  function fmt(x, dp) {
    if (!isNum(x)) return '—';
    var f = Math.pow(10, dp == null ? 0 : dp);
    var r = Math.round((Math.abs(x) + 1e-9) * f) / f * (x < 0 ? -1 : 1);
    return String(+r.toFixed(dp == null ? 0 : dp));
  }

  /* ------------------------------------------------------------------ unit conversions */
  var conv = {
    kpaToMmHg: function (k) { return k * MMHG_PER_KPA; },
    mmHgToKpa: function (m) { return m / MMHG_PER_KPA; },
    glucoseMgdlToMmol: function (x) { return x / 18.016; },      // glucose 180.16 g/mol
    glucoseMmolToMgdl: function (x) { return x * 18.016; },
    bunMgdlToUreaMmol: function (x) { return x / 2.801; },       // BUN = urea nitrogen, 2 × 14.007 g/mol
    ureaMmolToBunMgdl: function (x) { return x * 2.801; },
    lactateMgdlToMmol: function (x) { return x / 9.008; },       // lactic acid 90.08 g/mol
    lactateMmolToMgdl: function (x) { return x * 9.008; },
    albuminGdlToGl: function (x) { return x * 10; },
    albuminGlToGdl: function (x) { return x / 10; },
    ethanolMgdlToMmol: function (x) { return x / 4.607; },       // ethanol 46.07 g/mol
    ethanolMmolToMgdl: function (x) { return x * 4.607; },
    calciumMgdlToMmol: function (x) { return x / 4.008; },       // calcium 40.08 g/mol
    calciumMmolToMgdl: function (x) { return x * 4.008; },
    feetToMetres: function (x) { return x * 0.3048; }
  };

  /** Barometric pressure (mmHg) at an altitude in metres, International Standard Atmosphere [ISA]. */
  function baroFromAltitude(m) {
    if (!isNum(m)) return null;
    return 760 * Math.pow(1 - 2.25577e-5 * m, 5.25588);
  }

  /* ------------------------------------------------------------------ step 1: internal consistency [HEND] */
  function hFromPh(ph) { return Math.pow(10, 9 - ph); }          // nmol/L
  function phFromH(h) { return 9 - Math.log(h) / Math.LN10; }
  function hendersonH(paco2, hco3) { return 24 * paco2 / hco3; } // nmol/L
  function consistencyCheck(ph, paco2, hco3) {
    if (!isNum(ph) || !(paco2 > 0) || !(hco3 > 0)) return null;
    var hMeasured = hFromPh(ph), hCalculated = hendersonH(paco2, hco3);
    var diff = (hCalculated - hMeasured) / hMeasured;
    return {
      hMeasured: hMeasured, hCalculated: hCalculated, phCalculated: phFromH(hCalculated),
      diffPct: diff * 100, consistent: Math.abs(diff) <= CONSISTENCY_TOLERANCE
    };
  }

  /* ------------------------------------------------------------------ step 2: primary disorder */
  function classifyPh(ph) { return ph < NORMAL.phLo ? 'acidaemia' : ph > NORMAL.phHi ? 'alkalaemia' : 'normal'; }

  /**
   * Primary process(es) from pH, PaCO2 (mmHg) and HCO3. Returns { ids:[...], reason }.
   * With an abnormal pH, the component(s) that move the pH in that direction are primary; when both do,
   * the disorder is mixed. With a normal pH and both values abnormal, the side of 7.40 the pH lies on
   * suggests which process is primary [HEND, BERE].
   */
  function primaryDisorders(ph, paco2, hco3) {
    var s = classifyPh(ph);
    var hiCO2 = paco2 > NORMAL.paco2Hi, loCO2 = paco2 < NORMAL.paco2Lo, hiB = hco3 > NORMAL.hco3Hi, loB = hco3 < NORMAL.hco3Lo;
    var ids = [], why;
    if (s === 'acidaemia') {
      if (hiCO2 && loB) { ids = ['resp-acid', 'met-acid']; why = 'Both a raised PaCO₂ and a low HCO₃⁻ lower the pH: combined (mixed) respiratory and metabolic acidosis.'; }
      else if (loB) { ids = ['met-acid']; why = 'Acidaemia with a low HCO₃⁻: primary metabolic acidosis.'; }
      else if (hiCO2) { ids = ['resp-acid']; why = 'Acidaemia with a raised PaCO₂: primary respiratory acidosis.'; }
      else if ((paco2 - NORMAL.paco2Mid) / NORMAL.paco2Mid >= (NORMAL.hco3Mid - hco3) / NORMAL.hco3Mid) { ids = ['resp-acid']; why = 'Mild acidaemia with PaCO₂ and HCO₃⁻ near normal; the PaCO₂ deviates more: mild respiratory acidosis.'; }
      else { ids = ['met-acid']; why = 'Mild acidaemia with PaCO₂ and HCO₃⁻ near normal; the HCO₃⁻ deviates more: mild metabolic acidosis.'; }
    } else if (s === 'alkalaemia') {
      if (loCO2 && hiB) { ids = ['resp-alk', 'met-alk']; why = 'Both a low PaCO₂ and a raised HCO₃⁻ raise the pH: combined (mixed) respiratory and metabolic alkalosis.'; }
      else if (hiB) { ids = ['met-alk']; why = 'Alkalaemia with a raised HCO₃⁻: primary metabolic alkalosis.'; }
      else if (loCO2) { ids = ['resp-alk']; why = 'Alkalaemia with a low PaCO₂: primary respiratory alkalosis.'; }
      else if ((NORMAL.paco2Mid - paco2) / NORMAL.paco2Mid >= (hco3 - NORMAL.hco3Mid) / NORMAL.hco3Mid) { ids = ['resp-alk']; why = 'Mild alkalaemia with PaCO₂ and HCO₃⁻ near normal; the PaCO₂ deviates more: mild respiratory alkalosis.'; }
      else { ids = ['met-alk']; why = 'Mild alkalaemia with PaCO₂ and HCO₃⁻ near normal; the HCO₃⁻ deviates more: mild metabolic alkalosis.'; }
    } else {
      if (hiCO2 && hiB) {
        if (ph <= NORMAL.phMid) { ids = ['resp-acid']; why = 'Normal pH with raised PaCO₂ and HCO₃⁻; pH ≤ 7.40 suggests a primary respiratory acidosis with metabolic compensation (or a mixed respiratory acidosis + metabolic alkalosis).'; }
        else { ids = ['met-alk']; why = 'Normal pH with raised PaCO₂ and HCO₃⁻; pH > 7.40 suggests a primary metabolic alkalosis with respiratory compensation (or a mixed disorder).'; }
      } else if (loCO2 && loB) {
        if (ph < NORMAL.phMid) { ids = ['met-acid']; why = 'Normal pH with low PaCO₂ and HCO₃⁻; pH < 7.40 suggests a primary metabolic acidosis with respiratory compensation (or a mixed metabolic acidosis + respiratory alkalosis).'; }
        else { ids = ['resp-alk']; why = 'Normal pH with low PaCO₂ and HCO₃⁻; pH ≥ 7.40 suggests a primary respiratory alkalosis with metabolic compensation (or a mixed disorder).'; }
      } else if (hiCO2 && loB) { ids = ['resp-acid', 'met-acid']; why = 'Raised PaCO₂ with low HCO₃⁻ should cause acidaemia — check the values (see step 1).'; }
      else if (loCO2 && hiB) { ids = ['resp-alk', 'met-alk']; why = 'Low PaCO₂ with raised HCO₃⁻ should cause alkalaemia — check the values (see step 1).'; }
      else if (hiCO2) { ids = ['resp-acid']; why = 'Normal pH with a raised PaCO₂: respiratory acidosis with (near-)complete metabolic compensation.'; }
      else if (loCO2) { ids = ['resp-alk']; why = 'Normal pH with a low PaCO₂: respiratory alkalosis with metabolic compensation.'; }
      else if (hiB) { ids = ['met-alk']; why = 'Normal pH with a raised HCO₃⁻: compensated metabolic alkalosis.'; }
      else if (loB) { ids = ['met-acid']; why = 'Normal pH with a low HCO₃⁻: compensated metabolic acidosis.'; }
      else { ids = []; why = 'pH, PaCO₂ and HCO₃⁻ are all within normal limits. A raised anion gap can still reveal a hidden mixed disorder (step 4).'; }
    }
    return { status: s, ids: ids, reason: why };
  }

  /* ------------------------------------------------------------------ step 3: expected compensation */
  function band(point, tol) { return { point: point, lo: point - tol, hi: point + tol }; }
  /** Winter's formula: expected PaCO2 (mmHg) = 1.5 × HCO3 + 8 ± 2 [WINT]. */
  function expectedPaco2MetAcid(hco3) { return band(1.5 * hco3 + 8, 2); }
  /** Metabolic alkalosis: expected PaCO2 (mmHg) = 0.7 × HCO3 + 20 ± 5 [BOST rule 6]. */
  function expectedPaco2MetAlk(hco3) { return band(0.7 * hco3 + 20, 5); }
  /** Respiratory acidosis: HCO3 rises 1 (acute) or 4 (chronic) mmol/L per 10 mmHg PaCO2 above 40 [BOST rules 1–2]; ±2 mmol/L allowance. */
  function expectedHco3RespAcid(paco2) { var d = (paco2 - NORMAL.paco2Mid) / 10; return { acute: band(24 + d, 2), chronic: band(24 + 4 * d, 2) }; }
  /** Respiratory alkalosis: HCO3 falls 2 (acute) or 5 (chronic) mmol/L per 10 mmHg PaCO2 below 40 [BOST rules 3–4]; ±2 mmol/L allowance. */
  function expectedHco3RespAlk(paco2) { var d = (NORMAL.paco2Mid - paco2) / 10; return { acute: band(24 - 2 * d, 2), chronic: band(24 - 5 * d, 2) }; }
  function within(x, b) { return x >= b.lo - 1e-9 && x <= b.hi + 1e-9; }

  /** Compare the measured value with the expected compensation for a single primary process. */
  function assessCompensation(primary, paco2, hco3) {
    var r = { primary: primary, additional: [], chronicity: null };
    if (primary === 'met-acid' || primary === 'met-alk') {
      var e = primary === 'met-acid' ? expectedPaco2MetAcid(hco3) : expectedPaco2MetAlk(hco3);
      r.rule = primary === 'met-acid' ? 'winters' : 'metalk';
      r.expected = e; r.measured = paco2; r.measure = 'paco2';
      if (paco2 > e.hi + 1e-9) { r.verdict = 'resp-acid'; r.additional.push('resp-acid'); }
      else if (paco2 < e.lo - 1e-9) { r.verdict = 'resp-alk'; r.additional.push('resp-alk'); }
      else r.verdict = 'appropriate';
      return r;
    }
    var x = primary === 'resp-acid' ? expectedHco3RespAcid(paco2) : expectedHco3RespAlk(paco2);
    r.rule = primary; r.expected = x; r.measured = hco3; r.measure = 'hco3';
    var inA = within(hco3, x.acute), inC = within(hco3, x.chronic);
    if (primary === 'resp-acid') {
      if (hco3 < x.acute.lo - 1e-9) { r.verdict = 'met-acid'; r.additional.push('met-acid'); }
      else if (hco3 > x.chronic.hi + 1e-9) { r.verdict = 'met-alk'; r.additional.push('met-alk'); }
      else r.verdict = 'appropriate';
    } else {
      if (hco3 > x.acute.hi + 1e-9) { r.verdict = 'met-alk'; r.additional.push('met-alk'); }
      else if (hco3 < x.chronic.lo - 1e-9) { r.verdict = 'met-acid'; r.additional.push('met-acid'); }
      else r.verdict = 'appropriate';
    }
    if (r.verdict === 'appropriate') r.chronicity = inA && inC ? 'either' : inA ? 'acute' : inC ? 'chronic' : 'acute-on-chronic';
    return r;
  }

  /* ------------------------------------------------------------------ steps 4–6: gaps */
  /** Anion gap (without K+) and the albumin-corrected gap [FIGG]: AG + 0.25 × (40 − albumin g/L). */
  function anionGap(na, cl, hco3) { return na - cl - hco3; }
  function correctedAnionGap(ag, albuminGL) { return ag + 0.25 * (NORMAL.albumin - albuminGL); }
  /** Delta ratio = (AG − 12) / (24 − HCO3) [RAST]; bands as in Brandis (ref. BOST). */
  function deltaRatio(ag, hco3) {
    if (!isNum(ag) || !isNum(hco3) || hco3 >= NORMAL.hco3Mid) return null;
    var ratio = (ag - NORMAL.ag) / (NORMAL.hco3Mid - hco3);
    var b = ratio < 0.4 ? 'nagma' : ratio < 0.8 ? 'mixed' : ratio <= 2 ? 'pure' : 'alk';
    return { ratio: ratio, band: b };
  }
  /** Calculated osmolality = 2 Na + glucose + urea (+ 1.25 × ethanol [PURS]); osmolar gap = measured − calculated [HOFF]. */
  function calculatedOsmolality(na, glucose, urea, ethanol) {
    if (!isNum(na) || !isNum(glucose) || !isNum(urea)) return null;
    return 2 * na + glucose + urea + (isNum(ethanol) ? 1.25 * ethanol : 0);
  }

  /* ------------------------------------------------------------------ step 7: oxygenation */
  /** Alveolar gas equation (simplified): PAO2 = FiO2 × (Pb − PH2O) − PaCO2 / RQ (all mmHg). */
  function alveolarO2(fio2, pb, paco2) { return fio2 * (pb - PH2O) - paco2 / RQ; }
  /** Upper estimate of the normal A–a gradient breathing air: (age + 10) / 4 mmHg, a rounded form of [MELL]. */
  function expectedAaGradient(age) { return isNum(age) ? (age + 10) / 4 : null; }
  /** Berlin ARDS oxygenation category from PaO2/FiO2 in mmHg [BERL] (requires PEEP/CPAP ≥ 5 cmH2O). */
  function berlinCategory(pf) {
    if (!isNum(pf)) return null;
    return pf > 300 ? 'none' : pf > 200 ? 'mild' : pf > 100 ? 'moderate' : 'severe';
  }
  function oxygenation(o) {
    if (!isNum(o.pao2) || !isNum(o.fio2)) return null;
    var pb = isNum(o.pb) ? o.pb : 760;
    var pAO2 = alveolarO2(o.fio2, pb, o.paco2);
    var aa = pAO2 - o.pao2;
    var roomAir = Math.abs(o.fio2 - 0.21) < 0.005;
    var exp = expectedAaGradient(o.age);
    var pf = o.pao2 / o.fio2;
    return {
      pb: pb, pio2: o.fio2 * (pb - PH2O), pAO2: pAO2, aa: aa, roomAir: roomAir, expectedAa: exp,
      aaRaised: roomAir && isNum(exp) ? aa > exp : null, pf: pf, berlin: berlinCategory(pf),
      highAltitude: pb < 674,          // ≈ 1000 m in the standard atmosphere
      hypoxaemic: o.pao2 < 60,         // PaO2 < 8 kPa: respiratory failure
      type2: o.pao2 < 60 && o.paco2 > NORMAL.paco2Hi
    };
  }

  /* ------------------------------------------------------------------ labels & differentials */
  var LABELS = {
    'met-acid': 'Metabolic acidosis',
    hagma: 'High anion gap metabolic acidosis',
    nagma: 'Normal anion gap (hyperchloraemic) metabolic acidosis',
    'met-alk': 'Metabolic alkalosis',
    'resp-acid': 'Respiratory acidosis',
    'resp-alk': 'Respiratory alkalosis'
  };
  var SHORT = { 'met-acid': 'metabolic acidosis', hagma: 'HAGMA', nagma: 'NAGMA', 'met-alk': 'metabolic alkalosis', 'resp-acid': 'respiratory acidosis', 'resp-alk': 'respiratory alkalosis' };
  var CHRONICITY = { acute: 'Acute', chronic: 'Chronic', 'acute-on-chronic': 'Acute-on-chronic', either: '', indeterminate: '' };

  function labelOf(d) {
    var base = LABELS[d.id] || d.id;
    if ((d.id === 'resp-acid' || d.id === 'resp-alk') && d.chronicity && CHRONICITY[d.chronicity]) {
      return CHRONICITY[d.chronicity] + ' ' + base.charAt(0).toLowerCase() + base.slice(1);
    }
    return base;
  }

  var DIFFERENTIALS = {
    hagma: {
      name: 'HAGMA',
      title: 'High anion gap metabolic acidosis — GOLD MARK',
      items: [
        'Glycols: ethylene glycol, propylene glycol',
        'Oxoproline (pyroglutamic acidosis): chronic paracetamol use with malnutrition or sepsis',
        'L-lactate: shock, hypoxia, sepsis, seizures, metformin, liver failure',
        'D-lactate: short bowel syndrome',
        'Methanol',
        'Aspirin (salicylate) poisoning',
        'Renal failure (uraemic acidosis)',
        'Ketoacidosis: diabetic, alcoholic, starvation'
      ],
      source: 'Mehta AN et al. Lancet 2008;372:892'
    },
    nagma: {
      name: 'NAGMA',
      title: 'Normal anion gap (hyperchloraemic) metabolic acidosis',
      items: [
        'GI bicarbonate loss: diarrhoea, ileostomy, pancreatic or biliary fistula, ureteric diversion (ileal conduit)',
        'Renal tubular acidosis: proximal (type 2), distal (type 1), hyperkalaemic (type 4, hypoaldosteronism)',
        'Carbonic anhydrase inhibitors: acetazolamide, topiramate',
        'Chloride load: large-volume 0.9% sodium chloride, parenteral nutrition',
        'Early chronic kidney disease, tubulointerstitial disease',
        'Recovery phase of ketoacidosis (ketones lost in urine)'
      ],
      extra: 'Urine anion gap (Na⁺ + K⁺ − Cl⁻): negative suggests GI bicarbonate loss; positive suggests impaired renal acidification (Batlle 1988).',
      source: 'Berend K et al. N Engl J Med 2014;371:1434–45; Batlle DC et al. N Engl J Med 1988;318:594–9'
    },
    'met-alk': {
      name: 'metabolic alkalosis',
      title: 'Metabolic alkalosis',
      items: [
        'Chloride-responsive (low urine Cl⁻): vomiting or nasogastric drainage, previous diuretic use, post-hypercapnia, chloride-losing diarrhoea, cystic fibrosis',
        'Chloride-resistant with hypertension: primary hyperaldosteronism, Cushing syndrome, renovascular disease, liquorice',
        'Chloride-resistant without hypertension: current diuretic use, Bartter or Gitelman syndrome, severe hypokalaemia or hypomagnesaemia',
        'Alkali load: bicarbonate, citrate (massive transfusion), milk-alkali syndrome'
      ],
      extra: 'Urine chloride helps: low suggests a chloride-responsive cause; high suggests diuretic effect, mineralocorticoid excess or a tubulopathy.',
      source: 'Berend K et al. N Engl J Med 2014;371:1434–45'
    },
    'resp-acid': {
      name: 'respiratory acidosis',
      title: 'Respiratory acidosis (alveolar hypoventilation)',
      items: [
        'CNS depression: opioids, sedatives, alcohol, head injury, stroke',
        'Neuromuscular: Guillain–Barré syndrome, myasthenia gravis, motor neurone disease, high spinal cord injury',
        'Chest wall: obesity hypoventilation, kyphoscoliosis, flail chest',
        'Airways and lungs: COPD, life-threatening asthma (exhaustion), upper airway obstruction, severe pneumonia or pulmonary oedema',
        'Inadequate mechanical ventilation'
      ],
      source: 'Berend K et al. N Engl J Med 2014;371:1434–45'
    },
    'resp-alk': {
      name: 'respiratory alkalosis',
      title: 'Respiratory alkalosis (hyperventilation)',
      items: [
        'Hypoxaemia: pulmonary embolism, pneumonia, early asthma, high altitude',
        'Pain, anxiety, fever',
        'Early sepsis',
        'Salicylate poisoning (early)',
        'Pregnancy',
        'Liver failure',
        'CNS disease: stroke, subarachnoid haemorrhage, meningitis or encephalitis',
        'Excessive mechanical ventilation'
      ],
      source: 'Berend K et al. N Engl J Med 2014;371:1434–45'
    }
  };

  /* ------------------------------------------------------------------ the stepwise interpreter */
  /**
   * interpret(input, opts) — input: { ph, paco2 (mmHg), hco3, na, cl, albumin (g/L), glucose, urea, osm,
   * ethanol, lactate, pao2 (mmHg), fio2 (fraction or %), age, pb (mmHg) }. opts.gasUnit 'kPa'|'mmHg' formats text.
   * Returns { complete, input, steps:{consistency, primary, compensation, anionGap, delta, osmolar, oxygenation},
   *           disorders:[{id, role, chronicity}], ids, flags, headline, differentials, hints, summary }.
   */
  function interpret(input, opts) {
    opts = opts || {};
    var kpa = opts.gasUnit === 'kPa';
    var x = {};
    Object.keys(input || {}).forEach(function (k) { if (isNum(input[k])) x[k] = input[k]; });
    if (isNum(x.fio2) && x.fio2 > 1) x.fio2 = x.fio2 / 100;
    function K(mmHg, dp) { return (mmHg / MMHG_PER_KPA).toFixed(dp == null ? 1 : dp); }
    function M(mmHg) { return fmt(mmHg, Math.abs(mmHg) < 20 && Math.round(mmHg) !== mmHg ? 1 : 0); }
    /** Pressure in the preferred unit; both=true adds the other unit; dp = kPa decimals. */
    function P(mmHg, both, dp) {
      if (!isNum(mmHg)) return '—';
      var a = kpa ? K(mmHg, dp) + ' kPa' : M(mmHg) + ' mmHg';
      if (!both) return a;
      return a + ' (' + (kpa ? M(mmHg) + ' mmHg' : K(mmHg, dp) + ' kPa') + ')';
    }
    /** Pressure range in both units (kPa to 2 dp so rounding never hides the verdict). */
    function PR(lo, hi) {
      var m = M(lo) + '–' + M(hi) + ' mmHg', k = K(lo, 2) + '–' + K(hi, 2) + ' kPa';
      return kpa ? k + ' (' + m + ')' : m + ' (' + k + ')';
    }
    var res = { complete: false, input: x, steps: {}, disorders: [], ids: [], flags: [], hints: [], differentials: [], headline: '', summary: '' };
    var missing = [];
    if (!isNum(x.ph)) missing.push('pH');
    if (!isNum(x.paco2)) missing.push('PaCO₂');
    if (!isNum(x.hco3)) missing.push('HCO₃⁻');
    if (missing.length) { res.missing = missing; return res; }
    res.complete = true;
    var ph = x.ph, pc = x.paco2, b = x.hco3;
    var dis = res.disorders;
    function find(id) { for (var i = 0; i < dis.length; i++) if (dis[i].id === id) return dis[i]; return null; }
    function add(id, role, extra) { if (!find(id)) dis.push(Object.assign({ id: id, role: role }, extra || {})); }
    function hasMetAcid() { return !!(find('met-acid') || find('hagma') || find('nagma')); }

    /* 1 — internal consistency */
    var c = consistencyCheck(ph, pc, b);
    c.lines = [
      '[H⁺] from pH ' + fmt(ph, 2) + ': ' + fmt(c.hMeasured, 0) + ' nmol/L. From the Henderson equation (24 × PaCO₂ in mmHg ÷ HCO₃⁻): ' + fmt(c.hCalculated, 0) + ' nmol/L (difference ' + fmt(c.diffPct, 0) + '%).',
      c.consistent ? 'Values are internally consistent.' : 'Values are inconsistent (difference > 10%). Recheck transcription, units, a venous or delayed sample, or whether HCO₃⁻ came from a different sample, before interpreting.'
    ];
    c.status = c.consistent ? 'ok' : 'danger';
    res.steps.consistency = c;
    if (!c.consistent) res.flags.push('inconsistent');

    /* 2 — primary disorder */
    var pd = primaryDisorders(ph, pc, b);
    pd.ids.forEach(function (id) { add(id, 'primary'); });
    var phText = pd.status === 'acidaemia' ? 'Acidaemia (pH < 7.35)' : pd.status === 'alkalaemia' ? 'Alkalaemia (pH > 7.45)' : 'pH within the normal range (7.35–7.45)';
    res.steps.primary = { status: pd.status, ids: pd.ids.slice(), mixed: pd.ids.length > 1, reason: pd.reason, lines: [phText + '.', pd.reason] };

    /* 3 — compensation */
    var comp = null;
    if (pd.ids.length === 1) {
      comp = assessCompensation(pd.ids[0], pc, b);
      var L = [];
      if (comp.rule === 'winters') {
        L.push('Winter\'s formula: expected PaCO₂ = 1.5 × ' + fmt(b, 1) + ' + 8 ± 2 = ' + PR(comp.expected.lo, comp.expected.hi) + '. Measured ' + P(pc, true, 2) + '.');
      } else if (comp.rule === 'metalk') {
        L.push('Expected PaCO₂ = 0.7 × ' + fmt(b, 1) + ' + 20 ± 5 = ' + PR(comp.expected.lo, comp.expected.hi) + '. Measured ' + P(pc, true, 2) + '.');
      } else {
        var e = comp.expected, up = comp.rule === 'resp-acid';
        L.push('Expected HCO₃⁻ ' + (up ? '(+1 acute / +4 chronic per 10 mmHg rise in PaCO₂)' : '(−2 acute / −5 chronic per 10 mmHg fall in PaCO₂)') + ': acute ' +
          fmt(e.acute.lo, 1) + '–' + fmt(e.acute.hi, 1) + ', chronic ' + fmt(e.chronic.lo, 1) + '–' + fmt(e.chronic.hi, 1) + ' mmol/L. Measured ' + fmt(b, 1) + ' mmol/L.');
      }
      var v = comp.verdict;
      if (v === 'appropriate') {
        if (comp.chronicity) {
          var lab = { acute: 'acute (little renal compensation yet)', chronic: 'chronic (renal compensation complete)', 'acute-on-chronic': 'acute-on-chronic, or evolving renal compensation', either: 'acute or chronic (indistinguishable at this PaCO₂)' }[comp.chronicity];
          L.push('Within the expected range: ' + lab + '.');
          find(pd.ids[0]).chronicity = comp.chronicity;
        } else L.push('Within the expected range: appropriate respiratory compensation.');
        comp.status = 'ok';
      } else {
        var add2 = { 'resp-acid': 'PaCO₂ is higher than expected: concurrent respiratory acidosis (inadequate ventilation).', 'resp-alk': 'PaCO₂ is lower than expected: concurrent respiratory alkalosis.', 'met-acid': 'HCO₃⁻ is lower than expected: concurrent metabolic acidosis.', 'met-alk': 'HCO₃⁻ is higher than expected: concurrent metabolic alkalosis.' }[v];
        L.push(add2);
        comp.status = 'warn';
        add(v, 'additional');
      }
      comp.lines = L;
    } else if (pd.ids.length > 1) {
      comp = { status: 'warn', verdict: 'mixed', lines: ['Both processes move the pH in the same direction: a mixed disorder by definition, so no compensation is expected.'] };
    } else {
      comp = { status: 'ok', verdict: 'none', lines: ['No primary disturbance to compensate for.'] };
    }
    res.steps.compensation = comp;

    /* 4 — anion gap */
    var agStep;
    if (isNum(x.na) && isNum(x.cl)) {
      var ag = anionGap(x.na, x.cl, b);
      var agc = isNum(x.albumin) ? correctedAnionGap(ag, x.albumin) : null;
      var agv = agc != null ? agc : ag;
      agStep = { ag: ag, agCorrected: agc, value: agv, high: agv > NORMAL.ag, lines: [] };
      agStep.lines.push('AG = Na⁺ − (Cl⁻ + HCO₃⁻) = ' + fmt(x.na, 0) + ' − (' + fmt(x.cl, 0) + ' + ' + fmt(b, 1) + ') = ' + fmt(ag, 1) + ' mmol/L.');
      if (agc != null) agStep.lines.push('Albumin-corrected AG = ' + fmt(ag, 1) + ' + 0.25 × (40 − ' + fmt(x.albumin, 0) + ') = ' + fmt(agc, 1) + ' mmol/L.');
      else agStep.lines.push('Enter albumin to correct the gap: each 10 g/L fall in albumin lowers the AG by about 2.5 mmol/L.');
      agStep.lines.push(agStep.high ? 'Raised (normal about 12 mmol/L; analyser-dependent).' : 'Not raised (normal about 12 mmol/L; analyser-dependent).');
      if (ag < 0) agStep.lines.push('A negative anion gap is implausible: check for laboratory error, bromide or iodide, or severe paraproteinaemia.');
      agStep.status = agStep.high ? 'warn' : 'ok';
      // classify metabolic acidosis
      var ma = find('met-acid');
      if (ma) ma.id = agStep.high ? 'hagma' : 'nagma';
      if (!hasMetAcid() && agv >= HIDDEN_HAGMA_AG) {
        add('hagma', 'hidden');
        agStep.lines.push('A gap of ≥ 20 mmol/L suggests an organic acidosis even though the HCO₃⁻ is not low enough to show it: a hidden high anion gap metabolic acidosis.');
      } else if (!hasMetAcid() && agStep.high) {
        agStep.lines.push('Mildly raised gap without a metabolic acidosis: interpret cautiously (alkalaemia and analyser variation raise the gap slightly); check lactate and ketones if unwell.');
      }
    } else {
      agStep = { status: 'na', lines: ['Enter Na⁺ and Cl⁻ to calculate the anion gap' + (hasMetAcid() ? ' and classify the metabolic acidosis.' : ' and exclude a hidden mixed disorder.')], needs: ['Na⁺', 'Cl⁻'] };
    }
    res.steps.anionGap = agStep;

    /* 5 — delta ratio */
    var dStep;
    if (find('hagma') && isNum(agStep.value)) {
      var dr = deltaRatio(agStep.value, b);
      if (dr) {
        dStep = { ratio: dr.ratio, band: dr.band, lines: ['Delta ratio = (AG − 12) ÷ (24 − HCO₃⁻) = (' + fmt(agStep.value, 1) + ' − 12) ÷ (24 − ' + fmt(b, 1) + ') = ' + fmt(dr.ratio, 2) + '.'] };
        if (dr.band === 'nagma' || dr.band === 'mixed') {
          dStep.lines.push(dr.band === 'nagma' ? '< 0.4: the fall in HCO₃⁻ is far larger than the rise in the gap — a normal anion gap acidosis dominates (combined with the raised gap).' : '0.4–0.8: combined high and normal anion gap metabolic acidosis.');
          add('nagma', 'additional');
          dStep.status = 'warn';
        } else if (dr.band === 'pure') {
          dStep.lines.push('0.8–2: consistent with a pure high anion gap acidosis (about 1 is typical of ketoacidosis with urinary ketone loss; about 1.6 of lactic acidosis).');
          dStep.status = 'ok';
        } else {
          dStep.lines.push('> 2: HCO₃⁻ is higher than the gap predicts — a coexisting metabolic alkalosis or a pre-existing compensated respiratory acidosis.');
          if (!find('resp-acid')) add('met-alk', 'additional');
          dStep.status = 'warn';
        }
      } else {
        dStep = { ratio: null, band: 'hco3-not-low', status: 'warn', lines: ['HCO₃⁻ is not reduced despite a raised anion gap, so the ratio cannot be calculated: an acid load has been offset by a coexisting metabolic alkalosis (or a compensated respiratory acidosis).'] };
        if (!find('resp-acid')) add('met-alk', 'additional');
      }
      dStep.lines.push('Use with caution: the ratio varies widely between patients (Rastegar 2007).');
    } else {
      dStep = { status: 'na', lines: [find('hagma') ? 'Needs the anion gap.' : 'Only applies to a high anion gap metabolic acidosis.'] };
    }
    res.steps.delta = dStep;

    // a metabolic process detected from the gap makes acute/chronic labelling of a respiratory disorder unreliable
    ['resp-acid', 'resp-alk'].forEach(function (rid) {
      var rd = find(rid);
      if (rd && rd.role === 'primary' && rd.chronicity && rd.chronicity !== 'indeterminate') {
        var metOther = rid === 'resp-alk' ? hasMetAcid() : (find('met-alk') || hasMetAcid());
        if (metOther) { rd.chronicity = 'indeterminate'; res.hints.push('A coexisting metabolic disorder also changes HCO₃⁻, so the acute versus chronic nature of the ' + SHORT[rid] + ' cannot be judged from HCO₃⁻.'); }
      }
    });

    /* 6 — osmolar gap */
    var oStep;
    var cOsm = calculatedOsmolality(x.na, x.glucose, x.urea, x.ethanol);
    if (cOsm != null && isNum(x.osm)) {
      var og = x.osm - cOsm;
      oStep = { calculated: cOsm, measured: x.osm, gap: og, high: og > NORMAL.osmGap, status: og > NORMAL.osmGap ? 'warn' : 'ok', lines: [] };
      oStep.lines.push('Calculated osmolality = 2 × Na⁺ + glucose + urea' + (isNum(x.ethanol) ? ' + 1.25 × ethanol' : '') + ' = ' + fmt(cOsm, 0) + ' mOsm/kg; measured ' + fmt(x.osm, 0) + ' → gap ' + fmt(og, 0) + ' mOsm/kg.');
      if (og > NORMAL.osmGap) oStep.lines.push('Raised (> 10). With a high anion gap acidosis, consider methanol or ethylene glycol urgently; ethanol, ketoacidosis, lactic acidosis, mannitol and propylene glycol also raise the gap.');
      else oStep.lines.push('Not raised. A normal gap does not exclude toxic alcohol ingestion, particularly late after ingestion (Hoffman 1993).');
    } else {
      oStep = { status: 'na', lines: ['Enter Na⁺, glucose, urea and measured osmolality to calculate the osmolar gap.'] };
    }
    res.steps.osmolar = oStep;

    /* 7 — oxygenation */
    var ox = oxygenation({ pao2: x.pao2, fio2: x.fio2, paco2: pc, pb: x.pb, age: x.age });
    if (ox) {
      ox.lines = [];
      ox.lines.push('PAO₂ = FiO₂ × (Pb − 47) − PaCO₂ ÷ 0.8 = ' + fmt(x.fio2, 2) + ' × (' + fmt(ox.pb, 0) + ' − 47) − ' + fmt(pc, 0) + ' ÷ 0.8 = ' + P(ox.pAO2, true) + (ox.pb < 755 ? ' (barometric pressure ' + fmt(ox.pb, 0) + ' mmHg)' : '') + '.');
      ox.lines.push('A–a gradient = ' + P(ox.aa, true) + '.' + (ox.roomAir && isNum(ox.expectedAa) ? ' Age-expected upper limit on air ≈ (age + 10) ÷ 4 = ' + P(ox.expectedAa, true) + ': ' + (ox.aaRaised ? 'raised — a V/Q mismatch, shunt or diffusion problem contributes.' : 'normal — any hypoxaemia is explained by hypoventilation or low inspired oxygen.') : ox.roomAir ? ' Enter age to compare with the age-expected value.' : ' Age-expected values apply on room air only; the gradient widens as FiO₂ rises.'));
      if (ox.aa < 0) ox.lines.push('A negative gradient is impossible: check the FiO₂, the barometric pressure and the sample (air bubble).');
      var bt = { none: 'above the ARDS range (> 300 mmHg; > 40 kPa)', mild: 'Berlin "mild" range (200–300 mmHg; 26.7–40 kPa)', moderate: 'Berlin "moderate" range (100–200 mmHg; 13.3–26.7 kPa)', severe: 'Berlin "severe" range (≤ 100 mmHg; ≤ 13.3 kPa)' }[ox.berlin];
      ox.lines.push('PaO₂/FiO₂ = ' + fmt(ox.pf, 0) + ' mmHg (' + (ox.pf / MMHG_PER_KPA).toFixed(1) + ' kPa) — ' + bt + '.' + (ox.berlin !== 'none' ? ' This means ARDS only with onset within 1 week, bilateral opacities not explained by effusion, collapse or nodules, respiratory failure not fully explained by cardiac failure or fluid overload, and PEEP or CPAP ≥ 5 cmH₂O.' : ''));
      if (ox.highAltitude) ox.lines.push('Above about 1000 m the Berlin thresholds need altitude adjustment; rely on the A–a gradient here.');
      if (ox.hypoxaemic) ox.lines.push('PaO₂ < 8 kPa (60 mmHg): respiratory failure, ' + (ox.type2 ? 'type 2 (hypercapnic).' : 'type 1 (normocapnic or hypocapnic).'));
      ox.status = ox.hypoxaemic || ox.berlin === 'severe' || ox.berlin === 'moderate' ? 'danger' : (ox.aaRaised || ox.berlin === 'mild') ? 'warn' : 'ok';
      res.steps.oxygenation = ox;
    } else {
      res.steps.oxygenation = { status: 'na', lines: ['Enter PaO₂ and FiO₂ (with age and altitude if known) for the A–a gradient and PaO₂/FiO₂ ratio.'] };
    }

    /* 8 — differentials and context hints */
    if (find('hagma')) {
      if (isNum(x.lactate) && x.lactate > NORMAL.lactate && isNum(agStep.value)) {
        res.hints.push('Lactate ' + fmt(x.lactate, 1) + ' mmol/L' + (x.lactate >= NORMAL.lactateHigh ? ' (markedly raised)' : '') + ' can account for about ' + fmt(Math.min(x.lactate - 1, Math.max(0, agStep.value - NORMAL.ag)), 0) + ' of the ' + fmt(Math.max(0, agStep.value - NORMAL.ag), 0) + ' mmol/L rise in the anion gap.');
      } else if (isNum(x.lactate) && x.lactate <= NORMAL.lactate) {
        res.hints.push('Lactate is normal: look beyond lactic acidosis (ketones, renal function, toxic alcohols, salicylate).');
      }
      if (isNum(x.glucose) && x.glucose > 11.1) res.hints.push('Glucose ' + fmt(x.glucose, 1) + ' mmol/L: check blood ketones for diabetic ketoacidosis.');
      if (oStep.high) res.hints.push('High anion gap acidosis with a raised osmolar gap: consider methanol or ethylene glycol and seek urgent toxicology advice.');
    } else if (isNum(x.lactate) && x.lactate > NORMAL.lactate) {
      res.hints.push('Lactate ' + fmt(x.lactate, 1) + ' mmol/L is raised: look for hypoperfusion or other causes even without a clear acidosis.');
    }
    if (agStep && isNum(agStep.agCorrected) && agStep.agCorrected > NORMAL.ag && agStep.ag <= NORMAL.ag) res.hints.push('Hypoalbuminaemia was masking the raised anion gap (uncorrected ' + fmt(agStep.ag, 1) + ', corrected ' + fmt(agStep.agCorrected, 1) + ' mmol/L).');
    var dxIds = dis.map(function (d) { return d.id; });
    dxIds.forEach(function (id) {
      var key = id === 'met-acid' ? null : id;
      if (key && DIFFERENTIALS[key]) res.differentials.push(Object.assign({ id: key }, DIFFERENTIALS[key]));
    });
    if (find('met-acid')) { res.differentials.push(Object.assign({ id: 'hagma' }, DIFFERENTIALS.hagma)); res.differentials.push(Object.assign({ id: 'nagma' }, DIFFERENTIALS.nagma)); }

    /* headline */
    res.ids = dis.map(function (d) { return d.id; });
    var names = dis.map(labelOf);
    if (!dis.length) res.headline = agStep && isNum(agStep.value) ? 'No acid–base disorder detected' : 'No disorder on pH, PaCO₂ and HCO₃⁻ (add Na⁺ and Cl⁻ to exclude a hidden mixed disorder)';
    else if (dis.length === 1) {
      var only = dis[0];
      res.headline = names[0];
      if (comp && comp.verdict === 'appropriate' && (only.id === 'hagma' || only.id === 'nagma' || only.id === 'met-acid')) res.headline += ' with appropriate respiratory compensation';
      if (comp && comp.verdict === 'appropriate' && only.id === 'met-alk') res.headline += ' with appropriate respiratory compensation';
    } else res.headline = 'Mixed disorder — ' + names.map(function (n) { return n.charAt(0).toLowerCase() + n.slice(1); }).join(' + ');
    if (res.flags.indexOf('inconsistent') >= 0) res.headline = 'Check values: internally inconsistent — ' + res.headline.charAt(0).toLowerCase() + res.headline.slice(1);
    res.status = res.flags.length ? 'danger' : dis.length > 1 ? 'warn' : dis.length ? (pd.status === 'normal' ? 'info' : 'warn') : 'ok';
    res.summary = summarise(res, x, kpa, P);
    return res;
  }

  function summarise(res, x, kpa, P) {
    var s = res.steps, out = [];
    var gas = 'Blood gas: pH ' + fmt(x.ph, 2) + ', PaCO₂ ' + P(x.paco2, true) + ', HCO₃⁻ ' + fmt(x.hco3, 1) + ' mmol/L';
    if (isNum(x.pao2)) gas += '; PaO₂ ' + P(x.pao2, true) + (isNum(x.fio2) ? ' on FiO₂ ' + fmt(x.fio2, 2) : '');
    out.push(gas + '.');
    var chem = [];
    if (isNum(x.na)) chem.push('Na⁺ ' + fmt(x.na, 0));
    if (isNum(x.cl)) chem.push('Cl⁻ ' + fmt(x.cl, 0));
    if (isNum(x.albumin)) chem.push('albumin ' + fmt(x.albumin, 0) + ' g/L');
    if (isNum(x.glucose)) chem.push('glucose ' + fmt(x.glucose, 1));
    if (isNum(x.urea)) chem.push('urea ' + fmt(x.urea, 1));
    if (isNum(x.lactate)) chem.push('lactate ' + fmt(x.lactate, 1));
    if (isNum(x.osm)) chem.push('osmolality ' + fmt(x.osm, 0) + ' mOsm/kg');
    if (chem.length) out.push('Chemistry (mmol/L unless stated): ' + chem.join(', ') + '.');
    out.push('Interpretation: ' + res.headline + '.');
    out.push('1. Consistency: ' + (s.consistency.consistent ? 'consistent' : 'INCONSISTENT') + ' ([H⁺] ' + fmt(s.consistency.hMeasured, 0) + ' measured vs ' + fmt(s.consistency.hCalculated, 0) + ' nmol/L calculated).');
    out.push('2. ' + s.primary.lines.join(' '));
    out.push('3. ' + s.compensation.lines.join(' '));
    if (isNum(s.anionGap.value)) out.push('4. Anion gap ' + fmt(s.anionGap.ag, 1) + (isNum(s.anionGap.agCorrected) ? ' (albumin-corrected ' + fmt(s.anionGap.agCorrected, 1) + ')' : '') + ' mmol/L — ' + (s.anionGap.high ? 'raised' : 'not raised') + '.');
    if (isNum(s.delta.ratio)) out.push('5. Delta ratio ' + fmt(s.delta.ratio, 2) + ' — ' + { nagma: 'normal anion gap acidosis dominates', mixed: 'combined high and normal anion gap acidosis', pure: 'pure high anion gap acidosis', alk: 'coexisting metabolic alkalosis or compensated respiratory acidosis' }[s.delta.band] + '.');
    if (isNum(s.osmolar.gap)) out.push('6. Osmolar gap ' + fmt(s.osmolar.gap, 0) + ' mOsm/kg — ' + (s.osmolar.high ? 'raised' : 'not raised') + '.');
    if (isNum(s.oxygenation.aa)) out.push('7. A–a gradient ' + P(s.oxygenation.aa) + (s.oxygenation.aaRaised === true ? ' (raised for age)' : s.oxygenation.aaRaised === false ? ' (normal for age)' : '') + '; PaO₂/FiO₂ ' + fmt(s.oxygenation.pf, 0) + ' mmHg' + (s.oxygenation.berlin !== 'none' ? ' (Berlin ' + s.oxygenation.berlin + ' range if ARDS criteria are met)' : '') + '.');
    if (res.hints.length) out.push('Notes: ' + res.hints.join(' '));
    res.differentials.forEach(function (d) { out.push('Consider for ' + d.name + ': ' + d.items.map(function (i) { return i.split(':')[0]; }).join('; ') + '.'); });
    out.push('Decision support only — interpret with the clinical picture.');
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ electrolytes */
  /** Total body water fraction by age and sex [ADMA]: children 0.6; adults < 65 y: men 0.6, women 0.5; ≥ 65 y: men 0.5, women 0.45. */
  function tbwFraction(age, sex) {
    if (!isNum(age)) return null;
    if (age < 18) return 0.6;
    var elderly = age >= 65;
    if (sex === 'female') return elderly ? 0.45 : 0.5;
    return elderly ? 0.5 : 0.6;
  }
  /** Sodium corrected for hyperglycaemia: Na + factor × (glucose mg/dL − 100) / 100; factor 1.6 [KATZ] or 2.4 [HILL]. */
  function correctedSodium(na, glucoseMmol, factor) {
    if (!isNum(na) || !isNum(glucoseMmol)) return null;
    var g = glucoseMmol * 18.016;
    return g <= 100 ? na : na + factor * (g - 100) / 100;
  }
  /** Payne 1973 [PAYN]: adjusted Ca (mg/dL) = Ca (mg/dL) − albumin (g/dL) + 4.0 (≈ +0.025 mmol/L per g/L below 40). Returns mmol/L. */
  function adjustedCalcium(caMmol, albuminGL) {
    if (!isNum(caMmol) || !isNum(albuminGL)) return null;
    var adjMg = caMmol * 4.008 - albuminGL / 10 + 4.0;
    return adjMg / 4.008;
  }
  /** Adrogué–Madias [ADMA]: change in serum Na per litre of infusate = (infusate Na + K − serum Na) / (TBW + 1). */
  function adrogueMadias(serumNa, infusateNa, infusateK, tbw) {
    if (!isNum(serumNa) || !isNum(infusateNa) || !(tbw > 0)) return null;
    return (infusateNa + (isNum(infusateK) ? infusateK : 0) - serumNa) / (tbw + 1);
  }
  var INFUSATES = [
    { id: 'nacl3', label: '3% sodium chloride', na: 513, k: 0 },
    { id: 'nacl09', label: '0.9% sodium chloride', na: 154, k: 0 },
    { id: 'pl148', label: 'Plasma-Lyte 148', na: 140, k: 5 },
    { id: 'hartmann', label: 'Hartmann\'s / lactated Ringer\'s', na: 131, k: 5 },
    { id: 'nacl045', label: '0.45% sodium chloride', na: 77, k: 0 },
    { id: 'nacl018', label: '0.18% sodium chloride with 4% glucose', na: 31, k: 0 },
    { id: 'glucose5', label: '5% glucose (free water)', na: 0, k: 0 }
  ];
  /** ODS high-risk features [VERB]: Na ≤ 105, hypokalaemia, alcohol use disorder, malnutrition, advanced liver disease. */
  function hyponatraemiaLimit(highRisk) { return highRisk ? 8 : 10; } // mmol/L per 24 h [ESE, VERB]

  /**
   * Plan an infusion to raise chronic hyponatraemia with the Adrogué–Madias formula.
   * o: { na, weight, age, sex, infusateNa, infusateK, target (mmol/L rise), hours, highRisk }
   */
  function hyponatraemiaPlan(o) {
    var f = tbwFraction(o.age, o.sex);
    if (!isNum(o.na) || !(o.weight > 0) || f == null || !isNum(o.infusateNa) || !(o.target > 0) || !(o.hours > 0) || o.hours > 24) return null;
    var tbw = f * o.weight;
    var per = adrogueMadias(o.na, o.infusateNa, o.infusateK, tbw);
    var highRisk = !!o.highRisk || o.na <= 105;
    var limit = hyponatraemiaLimit(highRisk); // applies to any 24-h period, so also to a shorter plan
    var r = { tbwFraction: f, tbw: tbw, perLitre: per, highRisk: highRisk, limit24: hyponatraemiaLimit(highRisk), limit: limit, targetRequested: o.target, warnings: [] };
    if (!(per > 0)) { r.error = 'not-raising'; return r; }
    r.exceeds = o.target > limit + 1e-9;
    r.target = r.exceeds ? limit : o.target;
    r.volumeL = r.target / per;
    r.rateMlH = r.volumeL * 1000 / o.hours;
    r.mlPerMmol = 1000 / per;
    r.projectedNa = o.na + r.target;
    return r;
  }
  /** Free-water deficit = TBW × (Na / target − 1) [ADMA hypernatremia]. */
  function freeWaterDeficit(na, weight, f, target) {
    target = isNum(target) ? target : 140;
    if (!isNum(na) || !(weight > 0) || !(f > 0) || !(target > 0)) return null;
    return f * weight * (na / target - 1);
  }
  /** Plan to lower chronic hypernatraemia: o = { na, weight, age, sex, infusateNa, fall (mmol/L), hours }. Limit 10 mmol/L per 24 h [ADMA]. */
  function hypernatraemiaPlan(o) {
    var f = tbwFraction(o.age, o.sex);
    if (!isNum(o.na) || !(o.weight > 0) || f == null || !isNum(o.infusateNa) || !(o.fall > 0) || !(o.hours > 0) || o.hours > 24) return null;
    var tbw = f * o.weight;
    var per = adrogueMadias(o.na, o.infusateNa, 0, tbw); // negative = fall per litre
    var limit = 10; // mmol/L in any 24-h period
    var r = { tbwFraction: f, tbw: tbw, perLitre: per, deficit: freeWaterDeficit(o.na, o.weight, f, 140), limit: limit, fallRequested: o.fall };
    if (!(per < 0)) { r.error = 'not-lowering'; return r; }
    r.exceeds = o.fall > limit + 1e-9;
    r.fall = r.exceeds ? limit : o.fall;
    r.volumeL = r.fall / -per;
    r.rateMlH = r.volumeL * 1000 / o.hours;
    r.projectedNa = o.na - r.fall;
    return r;
  }

  /* ------------------------------------------------------------------ practice library */
  // Values: PaCO2/PaO2 in mmHg, chemistry in mmol/L, albumin g/L. Every case is internally consistent
  // (Henderson equation within 2 %) and `expect` lists the disorders the interpreter must return (unit-tested).
  var CASES = [
    {
      id: 'dka', title: 'Vomiting and deep sighing breaths',
      vignette: '19-year-old with type 1 diabetes, two days of vomiting and abdominal pain, Kussmaul breathing. Breathing room air.',
      values: { ph: 7.17, paco2: 17, hco3: 6, na: 132, cl: 96, albumin: 40, glucose: 30, urea: 10, osm: 310, lactate: 1.8, pao2: 122, fio2: 0.21, age: 19 },
      options: ['High anion gap metabolic acidosis with appropriate respiratory compensation', 'Normal anion gap metabolic acidosis', 'High anion gap metabolic acidosis with a concurrent respiratory acidosis', 'Acute respiratory alkalosis'],
      answer: 0, expect: ['hagma'],
      explanation: 'Acidaemia with a low HCO₃⁻ is a metabolic acidosis. Winter\'s formula predicts PaCO₂ 15–19 mmHg and the measured 17 mmHg fits, so compensation is appropriate. The anion gap is 30 mmol/L and the delta ratio is 1.0: a pure high anion gap acidosis. With glucose 30 mmol/L and a normal lactate this is diabetic ketoacidosis.',
      teaching: ['A delta ratio near 1 is typical of DKA because ketones are lost in the urine.', 'Corrected sodium (Katz) is about 139 mmol/L — the low measured sodium reflects hyperglycaemia.']
    },
    {
      id: 'septic', title: 'Septic shock, tiring',
      vignette: '67-year-old with faecal peritonitis, BP 78/40 on noradrenaline, respiratory rate falling from 34 to 18. FiO₂ 0.40.',
      values: { ph: 7.22, paco2: 30, hco3: 12, na: 138, cl: 100, albumin: 25, glucose: 7, urea: 12, lactate: 8, pao2: 70, fio2: 0.4, age: 67 },
      options: ['High anion gap metabolic acidosis, appropriately compensated', 'High anion gap metabolic acidosis with a concurrent respiratory acidosis', 'Normal anion gap metabolic acidosis with respiratory alkalosis', 'Acute respiratory acidosis'],
      answer: 1, expect: ['hagma', 'resp-acid'],
      explanation: 'Metabolic acidosis (low HCO₃⁻, acidaemia). Winter\'s formula predicts PaCO₂ 24–28 mmHg but it is 30 mmHg: ventilation is not keeping up — a concurrent respiratory acidosis, often a sign of exhaustion. The anion gap of 26 rises to about 30 after correcting for albumin 25 g/L; the delta ratio of about 1.5 fits lactic acidosis (lactate 8 mmol/L).',
      teaching: ['A "normal-looking" PaCO₂ can be too high for the degree of metabolic acidosis.', 'PaO₂/FiO₂ 175 mmHg — moderate range if ARDS criteria are met.']
    },
    {
      id: 'vomiting', title: 'Gastric outlet obstruction',
      vignette: '45-year-old with five days of persistent vomiting from a pyloric ulcer. Dry mucous membranes. Room air.',
      values: { ph: 7.52, paco2: 48, hco3: 38, na: 134, cl: 86, albumin: 42, glucose: 5.5, urea: 14, pao2: 80, fio2: 0.21, age: 45 },
      options: ['Metabolic alkalosis with appropriate respiratory compensation', 'Respiratory acidosis with metabolic compensation', 'Mixed metabolic alkalosis and respiratory acidosis', 'Chronic respiratory alkalosis'],
      answer: 0, expect: ['met-alk'],
      explanation: 'Alkalaemia with a high HCO₃⁻ is a metabolic alkalosis. The expected PaCO₂ is 0.7 × 38 + 20 ± 5 = 42–52 mmHg, and 48 mmHg fits: appropriate hypoventilation, not a separate respiratory acidosis. Loss of gastric acid (hypochloraemia) makes it chloride-responsive.',
      teaching: ['Urine chloride is low in vomiting-induced alkalosis; treat with sodium chloride and potassium.', 'Mild hypoxaemia here is from hypoventilation — the A–a gradient is normal.']
    },
    {
      id: 'opioid', title: 'Found drowsy at home',
      vignette: '30-year-old found drowsy with pinpoint pupils, respiratory rate 6/min. Room air.',
      values: { ph: 7.26, paco2: 60, hco3: 26, na: 140, cl: 104, albumin: 40, pao2: 66, fio2: 0.21, age: 30 },
      options: ['Acute respiratory acidosis with a normal A–a gradient', 'Chronic respiratory acidosis', 'Respiratory acidosis with a concurrent metabolic acidosis', 'Acute respiratory acidosis with a raised A–a gradient'],
      answer: 0, expect: ['resp-acid'],
      explanation: 'Acidaemia with a raised PaCO₂ is a respiratory acidosis. For an acute rise of 20 mmHg the HCO₃⁻ should rise about 2 mmol/L (to ~26) and it has: acute. The A–a gradient is about 9 mmHg, normal for age, so the hypoxaemia is entirely due to hypoventilation — consistent with opioid toxicity.',
      teaching: ['A normal A–a gradient with hypoxaemia points to hypoventilation or low inspired oxygen.']
    },
    {
      id: 'copd-chronic', title: 'Stable severe COPD clinic review',
      vignette: '68-year-old with severe COPD at baseline, on 28% oxygen via Venturi mask for an outpatient test.',
      values: { ph: 7.35, paco2: 60, hco3: 32, na: 138, cl: 98, albumin: 38, pao2: 55, fio2: 0.28, age: 68 },
      options: ['Chronic (compensated) respiratory acidosis', 'Metabolic alkalosis with respiratory compensation', 'Acute respiratory acidosis', 'Acute-on-chronic respiratory acidosis'],
      answer: 0, expect: ['resp-acid'],
      explanation: 'The pH is at the lower limit of normal with high PaCO₂ and HCO₃⁻; a pH ≤ 7.40 points to a primary respiratory acidosis. Chronic compensation predicts HCO₃⁻ 24 + 4 × 2 = 32 mmol/L, exactly as measured. PaO₂ 7.3 kPa with a raised PaCO₂ is type 2 respiratory failure.',
      teaching: ['Renal compensation takes 3–5 days; a fully compensated picture implies a chronic process.']
    },
    {
      id: 'aecopd', title: 'COPD exacerbation in ED',
      vignette: '71-year-old with known COPD, three days of worsening breathlessness and purulent sputum. Drowsy. FiO₂ 0.28.',
      values: { ph: 7.28, paco2: 75, hco3: 34, na: 137, cl: 94, albumin: 36, pao2: 50, fio2: 0.28, age: 71 },
      options: ['Acute-on-chronic respiratory acidosis', 'Chronic respiratory acidosis with a metabolic alkalosis', 'Acute respiratory acidosis with a metabolic acidosis', 'Compensated metabolic alkalosis'],
      answer: 0, expect: ['resp-acid'],
      explanation: 'Acidaemia with PaCO₂ 10 kPa: respiratory acidosis. The expected HCO₃⁻ is 25.5–29.5 if acute and 36–40 if chronic; 34 mmol/L lies in between — an acute rise in PaCO₂ on top of chronic hypercapnia.',
      teaching: ['pH < 7.35 with PaCO₂ > 6.5 kPa despite optimal medical therapy is the usual trigger to consider non-invasive ventilation (BTS/ICS).']
    },
    {
      id: 'pe', title: 'Pleuritic chest pain',
      vignette: '40-year-old, 10 days after a long-haul flight, with sudden pleuritic pain and breathlessness. Room air.',
      values: { ph: 7.54, paco2: 26, hco3: 21.5, na: 139, cl: 106, albumin: 42, pao2: 65, fio2: 0.21, age: 40 },
      options: ['Acute respiratory alkalosis with a raised A–a gradient', 'Chronic respiratory alkalosis', 'Metabolic alkalosis', 'Acute respiratory alkalosis with a normal A–a gradient'],
      answer: 0, expect: ['resp-alk'],
      explanation: 'Alkalaemia with a low PaCO₂ is a respiratory alkalosis. The expected acute fall in HCO₃⁻ is 2 per 10 mmHg (to about 21) — matching the measured 21.5: acute. The A–a gradient of about 52 mmHg is far above the age-expected ~12.5 mmHg, indicating V/Q mismatch, as in pulmonary embolism.',
      teaching: ['Hyperventilation can keep the PaO₂ deceptively near-normal; the A–a gradient unmasks the gas-exchange defect.']
    },
    {
      id: 'salicylate', title: 'Tinnitus after an overdose',
      vignette: '34-year-old, 6 hours after an intentional ingestion, with tinnitus, vomiting and rapid deep breathing. Room air.',
      values: { ph: 7.36, paco2: 22, hco3: 12, na: 140, cl: 104, albumin: 40, glucose: 6, urea: 6, lactate: 2.4, pao2: 112, fio2: 0.21, age: 34 },
      options: ['High anion gap metabolic acidosis with a concurrent respiratory alkalosis', 'Fully compensated metabolic acidosis', 'Chronic respiratory alkalosis', 'Normal anion gap metabolic acidosis'],
      answer: 0, expect: ['hagma', 'resp-alk'],
      explanation: 'The near-normal pH hides two disorders. A low HCO₃⁻ with pH < 7.40 suggests a primary metabolic acidosis; Winter\'s formula predicts PaCO₂ 24–28 mmHg but it is 22 mmHg — a concurrent respiratory alkalosis. The anion gap is 24 mmol/L. This mixed picture is classic for salicylate poisoning.',
      teaching: ['Compensation never overshoots: a "normal" pH with two abnormal values usually means a mixed disorder.', 'Send a salicylate level; sodium bicarbonate and haemodialysis may be needed.']
    },
    {
      id: 'diarrhoea', title: 'Profuse diarrhoea',
      vignette: '26-year-old with three days of watery diarrhoea (cholera outbreak), tachycardic. Room air.',
      values: { ph: 7.30, paco2: 30, hco3: 14.5, na: 137, cl: 113, albumin: 38, glucose: 5, urea: 9, pao2: 104, fio2: 0.21, age: 26 },
      options: ['Normal anion gap metabolic acidosis with appropriate compensation', 'High anion gap metabolic acidosis', 'Mixed metabolic acidosis and respiratory acidosis', 'Acute respiratory alkalosis'],
      answer: 0, expect: ['nagma'],
      explanation: 'Metabolic acidosis with appropriate compensation (Winter\'s 27.75–31.75 mmHg; measured 30). The anion gap is 9.5 (10 corrected for albumin): normal, hyperchloraemic — bicarbonate lost in stool.',
      teaching: ['A negative urine anion gap supports GI bicarbonate loss rather than renal tubular acidosis (Batlle 1988).']
    },
    {
      id: 'aka', title: 'Binge drinking and vomiting',
      vignette: '52-year-old after a week of heavy drinking, not eating, and vomiting for two days. Room air.',
      values: { ph: 7.35, paco2: 39, hco3: 21, na: 136, cl: 88, albumin: 38, glucose: 4.8, urea: 8, lactate: 2.1, pao2: 92, fio2: 0.21, age: 52 },
      options: ['High anion gap metabolic acidosis with a coexisting metabolic alkalosis', 'Normal blood gas', 'Mild normal anion gap acidosis', 'Respiratory acidosis'],
      answer: 0, expect: ['hagma', 'met-alk'],
      explanation: 'The pH, PaCO₂ and HCO₃⁻ look almost normal, but the anion gap is 27 mmol/L. The delta ratio is (27.5 − 12) ÷ (24 − 21) ≈ 5: the HCO₃⁻ has fallen far less than the gap has risen, so vomiting has added a metabolic alkalosis. Alcoholic ketoacidosis with vomiting.',
      teaching: ['Always calculate the anion gap — it is the only clue to this "double" disorder.']
    },
    {
      id: 'ethylene-glycol', title: 'Intoxicated and confused',
      vignette: '44-year-old found confused next to a container of antifreeze. Room air.',
      values: { ph: 7.05, paco2: 15, hco3: 4, na: 140, cl: 104, albumin: 40, glucose: 5, urea: 5, osm: 330, lactate: 3, pao2: 120, fio2: 0.21, age: 44 },
      options: ['High anion gap metabolic acidosis with a raised osmolar gap', 'Normal anion gap metabolic acidosis', 'High anion gap acidosis with a respiratory acidosis', 'Lactic acidosis only'],
      answer: 0, expect: ['hagma'],
      explanation: 'Severe metabolic acidosis with appropriate compensation (Winter\'s 12–16 mmHg; measured 15). The anion gap is 32 and the delta ratio 1.0. Calculated osmolality is 290, measured 330: an osmolar gap of 40 mOsm/kg — toxic alcohol until proven otherwise.',
      teaching: ['Lactate does not explain a gap of this size.', 'Give fomepizole (or ethanol) and discuss haemodialysis with toxicology urgently.']
    },
    {
      id: 'arrest', title: 'Cardiac arrest, after ROSC',
      vignette: '58-year-old with return of spontaneous circulation after 15 minutes of CPR, bag-mask ventilated. FiO₂ 1.0.',
      values: { ph: 6.95, paco2: 70, hco3: 15, na: 140, cl: 100, albumin: 36, lactate: 12, pao2: 180, fio2: 1.0, age: 58 },
      options: ['Mixed respiratory acidosis and high anion gap metabolic acidosis', 'Acute respiratory acidosis only', 'High anion gap metabolic acidosis with respiratory compensation', 'Normal anion gap metabolic acidosis'],
      answer: 0, expect: ['resp-acid', 'hagma'],
      explanation: 'Severe acidaemia with BOTH a raised PaCO₂ and a low HCO₃⁻: each lowers the pH, so this is a combined respiratory and metabolic acidosis. The anion gap is 25 (26 corrected) with lactate 12 mmol/L.',
      teaching: ['When both PaCO₂ and HCO₃⁻ push the pH the same way, the disorder is mixed by definition.']
    },
    {
      id: 'double-alk', title: 'Cirrhosis on diuretics',
      vignette: '61-year-old with cirrhosis and ascites on high-dose furosemide and spironolactone, now confused and breathing fast. Room air.',
      values: { ph: 7.62, paco2: 30, hco3: 30, na: 135, cl: 95, albumin: 35, pao2: 85, fio2: 0.21, age: 61 },
      options: ['Mixed metabolic alkalosis and respiratory alkalosis', 'Metabolic alkalosis with respiratory compensation', 'Chronic respiratory alkalosis', 'Acute respiratory alkalosis'],
      answer: 0, expect: ['resp-alk', 'met-alk'],
      explanation: 'Marked alkalaemia with a low PaCO₂ AND a high HCO₃⁻ — both raise the pH, so this is a combined respiratory alkalosis (liver failure, hyperventilation) and metabolic alkalosis (diuretics).',
      teaching: ['Severe alkalaemia (pH > 7.6) is dangerous: it lowers ionised calcium and the seizure and arrhythmia thresholds.']
    },
    {
      id: 'altitude', title: 'Trekker at 3000 m',
      vignette: '25-year-old healthy trekker, two weeks at 3000 m altitude, well. Room air (altitude 3000 m).',
      values: { ph: 7.44, paco2: 28, hco3: 18.5, na: 140, cl: 110, albumin: 44, pao2: 60, fio2: 0.21, age: 25, altitude: 3000 },
      options: ['Chronic respiratory alkalosis with a normal A–a gradient', 'Metabolic acidosis with respiratory compensation', 'Acute respiratory alkalosis with a raised A–a gradient', 'Normal blood gas'],
      answer: 0, expect: ['resp-alk'],
      explanation: 'Normal pH (≥ 7.40) with low PaCO₂ and HCO₃⁻ suggests a primary respiratory alkalosis. Chronic compensation predicts HCO₃⁻ 24 − 5 × 1.2 = 18 mmol/L — as measured. At 3000 m (barometric pressure about 526 mmHg) the expected PAO₂ is about 66 mmHg, so the A–a gradient is normal: the hypoxaemia is entirely from low inspired oxygen.',
      teaching: ['PaO₂/FiO₂ thresholds are unreliable at altitude; the alveolar gas equation with the real barometric pressure is not.']
    },
    {
      id: 'masked', title: 'Malnourished patient after surgery',
      vignette: '72-year-old, 10 days after a laparotomy, septic with a falling albumin. Room air.',
      values: { ph: 7.33, paco2: 33, hco3: 17, na: 136, cl: 107, albumin: 15, glucose: 6.5, urea: 11, lactate: 5.2, pao2: 74, fio2: 0.21, age: 72 },
      options: ['High anion gap metabolic acidosis unmasked by albumin correction', 'Normal anion gap metabolic acidosis', 'Acute respiratory alkalosis', 'Metabolic acidosis with a respiratory acidosis'],
      answer: 0, expect: ['hagma'],
      explanation: 'Metabolic acidosis with appropriate compensation (Winter\'s 31.5–35.5 mmHg; measured 33). The uncorrected anion gap is 12 — apparently normal — but albumin 15 g/L hides about 6 mmol/L of unmeasured anion: corrected AG ≈ 18, a lactic acidosis (lactate 5.2 mmol/L).',
      teaching: ['Always correct the anion gap for albumin in critically ill patients (Figge 1998).']
    },
    {
      id: 'inconsistent', title: 'A result that does not add up',
      vignette: 'Results transcribed by phone: arterial pH and PaCO₂ from the gas analyser, HCO₃⁻ from a laboratory sample taken the day before.',
      values: { ph: 7.40, paco2: 40, hco3: 15, na: 140, cl: 102, albumin: 40 },
      options: ['The values are internally inconsistent — recheck before interpreting', 'Compensated metabolic acidosis', 'Normal blood gas', 'High anion gap acidosis with metabolic alkalosis'],
      answer: 0, expect: null, expectFlags: ['inconsistent'],
      explanation: 'The Henderson equation gives [H⁺] = 24 × 40 ÷ 15 = 64 nmol/L (pH ≈ 7.19), but the measured pH 7.40 corresponds to 40 nmol/L — a 60% discrepancy. The numbers cannot all be right; repeat or reconcile the samples before drawing any conclusion.',
      teaching: ['Step 1 exists to catch transcription errors and mismatched samples.']
    },
    {
      id: 'ards', title: 'Pneumonia on the ventilator',
      vignette: '55-year-old ventilated for severe bilateral pneumonia, PEEP 10 cmH₂O, FiO₂ 0.60, lung-protective tidal volumes.',
      values: { ph: 7.33, paco2: 48, hco3: 24.5, na: 140, cl: 106, albumin: 32, lactate: 1.6, pao2: 75, fio2: 0.6, age: 55 },
      options: ['Acute respiratory acidosis with moderate ARDS-range hypoxaemia', 'Chronic respiratory acidosis with mild ARDS-range hypoxaemia', 'Metabolic acidosis', 'Acute respiratory acidosis with severe ARDS-range hypoxaemia'],
      answer: 0, expect: ['resp-acid'],
      explanation: 'Mild acute respiratory acidosis (expected acute HCO₃⁻ 22.8–26.8; measured 24.5), accepted as "permissive hypercapnia". PaO₂/FiO₂ = 75 ÷ 0.6 = 125 mmHg with PEEP ≥ 5: the Berlin moderate category.',
      teaching: ['Berlin categories need PEEP or CPAP ≥ 5 cmH₂O and the other criteria (timing, imaging, origin of oedema).']
    }
  ];

  /** Convert a practice case's values to interpreter input (altitude in metres -> barometric pressure). */
  function caseInput(values) {
    var o = {};
    Object.keys(values || {}).forEach(function (k) { if (k !== 'altitude') o[k] = values[k]; });
    if (isNum(values && values.altitude)) o.pb = baroFromAltitude(values.altitude);
    return o;
  }

  return {
    MMHG_PER_KPA: MMHG_PER_KPA, PH2O: PH2O, RQ: RQ, NORMAL: NORMAL, CONSISTENCY_TOLERANCE: CONSISTENCY_TOLERANCE,
    conv: conv, fmt: fmt, isNum: isNum, baroFromAltitude: baroFromAltitude,
    hFromPh: hFromPh, phFromH: phFromH, hendersonH: hendersonH, consistencyCheck: consistencyCheck,
    classifyPh: classifyPh, primaryDisorders: primaryDisorders,
    expectedPaco2MetAcid: expectedPaco2MetAcid, expectedPaco2MetAlk: expectedPaco2MetAlk,
    expectedHco3RespAcid: expectedHco3RespAcid, expectedHco3RespAlk: expectedHco3RespAlk, assessCompensation: assessCompensation,
    anionGap: anionGap, correctedAnionGap: correctedAnionGap, deltaRatio: deltaRatio, calculatedOsmolality: calculatedOsmolality,
    alveolarO2: alveolarO2, expectedAaGradient: expectedAaGradient, berlinCategory: berlinCategory, oxygenation: oxygenation,
    LABELS: LABELS, DIFFERENTIALS: DIFFERENTIALS, labelOf: labelOf, interpret: interpret,
    tbwFraction: tbwFraction, correctedSodium: correctedSodium, adjustedCalcium: adjustedCalcium, adrogueMadias: adrogueMadias,
    INFUSATES: INFUSATES, hyponatraemiaLimit: hyponatraemiaLimit, hyponatraemiaPlan: hyponatraemiaPlan,
    freeWaterDeficit: freeWaterDeficit, hypernatraemiaPlan: hypernatraemiaPlan,
    CASES: CASES, caseInput: caseInput
  };
});

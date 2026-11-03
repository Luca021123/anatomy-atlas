/* Salus · H1 health-check engine (pure logic: no DOM, no MT).
 *
 * Life's Essential 8 (LE8) metric scoring, a transparent diet quick check, FINDRISC, PHQ-2/PHQ-9,
 * GAD-2/GAD-7, AUDIT-C, STOP-BANG, the WHO four-symptom TB screen, the CDC STEADI falls questions,
 * infection-testing nudges, a potassium salt-substitute safety gate, and an evidence-weighted
 * ranking of personal actions.
 *
 * Browser: MTLib.healthEngine · Node (tests): module.exports
 *
 * Evidence labels used in comments (honest about how each value was checked):
 *   [V] confirmed while building this file (3 Nov 2026) against secondary sources that reproduce
 *       the primary table or abstract (supplementary tables, CRAN 'essential8' docs, trial summaries).
 *   [B] taken from docs/research/*.md, where it was secondary-confirmed.
 *   [M] standard published instrument or well-known figure reproduced from the original; not
 *       re-checked in this session. Listed in the build report for clinical review.
 * User-facing text lives in health/tools/checkup.js (wrapped in MT.t); this file returns numbers
 * and short codes only, so it stays testable and translatable.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).healthEngine = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function int0to(v, max) { return typeof v === 'number' && v >= 0 && v <= max && Math.floor(v) === v; }

  /* ------------------------------------------------------------------ sources */
  var SOURCES = {
    le8: { label: 'Lloyd-Jones DM et al. Life’s Essential 8: AHA Presidential Advisory. Circulation 2022;146:e18–e43', url: 'https://doi.org/10.1161/CIR.0000000000001078' },
    whoPa: { label: 'WHO guidelines on physical activity and sedentary behaviour (2020)', url: 'https://www.who.int/publications/i/item/9789240015128' },
    medas: { label: 'Schröder H et al. 14-item Mediterranean Diet Adherence Screener (MEDAS). J Nutr 2011;141:1140–1145' },
    ahaDiet: { label: 'Lichtenstein AH et al. 2021 Dietary Guidance to Improve Cardiovascular Health. Circulation 2021;144:e472–e487' },
    whoDiet: { label: 'WHO Healthy diet fact sheet: at least 400 g fruit and vegetables and under 5 g salt a day', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
    wcrf: { label: 'World Cancer Research Fund. Cancer Prevention Recommendations (2018): red and processed meat' },
    findrisc: { label: 'Lindström J, Tuomilehto J. The Diabetes Risk Score. Diabetes Care 2003;26:725–731' },
    whoAsianBmi: { label: 'WHO Expert Consultation. Appropriate BMI for Asian populations. Lancet 2004;363:157–163' },
    idfWaist: { label: 'International Diabetes Federation. Worldwide definition of the metabolic syndrome (2006): ethnic-specific waist cut-offs' },
    whoWaist: { label: 'WHO Expert Consultation. Waist circumference and waist–hip ratio (2008)' },
    niceWhtr: { label: 'NICE guideline CG189, 2022 update (now NG246): waist-to-height ratio' },
    phq9: { label: 'Kroenke K, Spitzer RL, Williams JBW. The PHQ-9. J Gen Intern Med 2001;16:606–613' },
    phq2: { label: 'Kroenke K, Spitzer RL, Williams JBW. The PHQ-2. Med Care 2003;41:1284–1292' },
    gad7: { label: 'Spitzer RL et al. The GAD-7. Arch Intern Med 2006;166:1092–1097' },
    gad2: { label: 'Kroenke K et al. Anxiety disorders in primary care (GAD-2). Ann Intern Med 2007;146:317–325' },
    auditc: { label: 'Bush K et al. The AUDIT-C. Arch Intern Med 1998;158:1789–1795; Bradley KA et al. Alcohol Clin Exp Res 2007;31:1208–1217' },
    whoAlcohol: { label: 'WHO Regional Office for Europe. No level of alcohol consumption is safe for our health (2023)' },
    stopbang: { label: 'Chung F, Abdullah HR, Liao P. STOP-Bang questionnaire. Chest 2016;149:631–638' },
    w4ss: { label: 'WHO consolidated guidelines on tuberculosis. Module 2: screening (2021)' },
    whoTb: { label: 'WHO Global tuberculosis report 2025 and TB fact sheet', url: 'https://www.who.int/teams/global-tuberculosis-programme/tb-reports' },
    steadi: { label: 'CDC STEADI (Stopping Elderly Accidents, Deaths & Injuries): three key questions', url: 'https://www.cdc.gov/steadi/' },
    ettehad: { label: 'Ettehad D et al. Blood pressure lowering for prevention of cardiovascular disease and death. Lancet 2016;387:957–967' },
    smbp: { label: 'Self-measured blood pressure meta-analyses: Tucker KL et al. PLoS Med 2017; 2024 meta-analysis (PMC11794135)' },
    whoHtn: { label: 'WHO Global report on hypertension 2025' },
    ahaBp: { label: '2025 AHA/ACC high blood pressure guideline (categories kept from 2017)' },
    jha: { label: 'Jha P et al. 21st-century hazards of smoking and benefits of cessation. N Engl J Med 2013;368:341–350' },
    cessation: { label: 'Lindson N et al. Pharmacological and electronic cigarette interventions for smoking cessation (network meta-analysis). Cochrane 2023;CD015226' },
    ding: { label: 'Ding D et al. Daily steps and health outcomes in adults. Lancet Public Health 2025;10:e668–e681' },
    stamatakis: { label: 'Stamatakis E et al. Vigorous intermittent lifestyle physical activity and mortality. Nat Med 2022;28:2521–2529' },
    ssass: { label: 'Neal B et al. Salt Substitute and Stroke Study (SSaSS). N Engl J Med 2021;385:1067–1077' },
    whoLsss: { label: 'WHO. Use of lower-sodium salt substitutes: WHO guideline (2025)', url: 'https://www.who.int/publications/i/item/9789240105591' },
    heSalt: { label: 'He FJ, Li J, MacGregor GA. Longer term modest salt reduction and blood pressure. BMJ 2013;346:f1325' },
    windred: { label: 'Windred DP et al. Sleep regularity and mortality (UK Biobank). SLEEP 2024;47:zsad253' },
    roerecke: { label: 'Roerecke M et al. Reduction in alcohol consumption and blood pressure. Lancet Public Health 2017;2:e108–e120' },
    wood: { label: 'Wood AM et al. Risk thresholds for alcohol consumption (599,912 drinkers). Lancet 2018;391:1513–1523' },
    aune: { label: 'Aune D et al. Fruit and vegetable intake and mortality. Int J Epidemiol 2017;46:1029–1056' },
    dpp: { label: 'Knowler WC et al. Diabetes Prevention Program. N Engl J Med 2002;346:393–403' },
    ctt: { label: 'Cholesterol Treatment Trialists’ Collaboration. Lancet 2010;376:1670–1681' },
    ukpds: { label: 'Stratton IM et al. UKPDS 35: glycaemia and complications. BMJ 2000;321:405–412' },
    idf: { label: 'IDF Diabetes Atlas, 11th edition (2025)' },
    sherrington: { label: 'Sherrington C et al. Exercise for preventing falls in older people. Cochrane 2019;CD012424' },
    friendship: { label: 'Chibanda D et al. Friendship Bench trial. JAMA 2016;316:2618–2626' },
    gollwitzer: { label: 'Gollwitzer PM, Sheeran P. Implementation intentions and goal achievement. Adv Exp Soc Psychol 2006;38:69–119' },
    whoHivst: { label: 'WHO consolidated guidelines on HIV testing services, including HIV self-testing' },
    whoPep: { label: 'WHO guidelines for HIV post-exposure prophylaxis (2024)' },
    start: { label: 'INSIGHT START Study Group. Early antiretroviral therapy. N Engl J Med 2015;373:795–807' },
    hepTesting: { label: 'WHO hepatitis B and C testing guidance (2017); US CDC adult screening advice for hepatitis C (2020) and hepatitis B (2023)' },
    whoSti: { label: 'WHO sexually transmitted infections fact sheet' },
    hoelzel: { label: 'Hoelzel W et al. IFCC–NGSP HbA1c master equation. Clin Chem 2004;50:166–174' }
  };

  /** Condition ids stored in profile.conditions (H1 owns the editing UI; other packages may read them).
   *  Prediabetes uses 'raised-sugar' so text matchers looking for "diabet" do not mistake it for diabetes. */
  var CONDITIONS = ['hypertension', 'diabetes', 'raised-sugar', 'high-cholesterol', 'heart-disease', 'stroke', 'kidney-disease', 'asthma-copd', 'hiv', 'tb', 'depression-anxiety', 'other'];

  /* ------------------------------------------------------------------ units */
  // Cholesterol 1 mmol/L = 38.67 mg/dL; glucose 1 mmol/L = 18.016 mg/dL (molar masses 386.65 and 180.16 g/mol).
  // mg/dL results are rounded to whole numbers, as laboratories report them, before LE8 cut-offs are applied.
  function cholToMgdl(mmol) { return isNum(mmol) ? Math.round(mmol * 38.67) : undefined; }
  function cholToMmol(mgdl) { return isNum(mgdl) ? Math.round(mgdl / 38.67 * 100) / 100 : undefined; }
  function gluToMgdl(mmol) { return isNum(mmol) ? Math.round(mmol * 18.016) : undefined; }
  function gluToMmol(mgdl) { return isNum(mgdl) ? Math.round(mgdl / 18.016 * 10) / 10 : undefined; }
  // HbA1c IFCC (mmol/mol) <-> NGSP (%): NGSP = 0.09148 × IFCC + 2.152 (Hoelzel 2004) [M]
  function a1cToPct(mmolmol) { return isNum(mmolmol) ? Math.round((0.09148 * mmolmol + 2.152) * 10) / 10 : undefined; }
  function a1cToMmolMol(pct) { return isNum(pct) ? Math.round((pct - 2.152) / 0.09148) : undefined; }
  function lbToKg(lb) { return isNum(lb) ? lb * 0.45359237 : undefined; }
  function kgToLb(kg) { return isNum(kg) ? kg / 0.45359237 : undefined; }
  function inToCm(inch) { return isNum(inch) ? inch * 2.54 : undefined; }
  function cmToIn(cm) { return isNum(cm) ? cm / 2.54 : undefined; }
  function ftInToCm(ft, inch) { if (!isNum(ft) && !isNum(inch)) return undefined; return ((ft || 0) * 12 + (inch || 0)) * 2.54; }
  function cmToFtIn(cm) { if (!isNum(cm)) return undefined; var t = Math.round(cm / 2.54); return { ft: Math.floor(t / 12), inch: t % 12 }; }

  /* ------------------------------------------------------------------ body size */
  function bmi(heightCm, weightKg) {
    if (!isNum(heightCm) || !isNum(weightKg) || heightCm <= 0 || weightKg <= 0) return undefined;
    return weightKg / Math.pow(heightCm / 100, 2);
  }
  /** 'under' | 'healthy' | 'over' | 'obese'. WHO TRS 894 cut-offs [M]; Asian action points 23 / 27.5 (WHO 2004) [V]. */
  function bmiCategory(b, asian) {
    if (!isNum(b)) return null;
    if (b < 18.5) return 'under';
    if (asian) return b < 23 ? 'healthy' : b < 27.5 ? 'over' : 'obese';
    return b < 25 ? 'healthy' : b < 30 ? 'over' : 'obese';
  }
  /** 'ok' | 'high' | 'veryhigh'. WHO 2008: men ≥94 / ≥102 cm, women ≥80 / ≥88 cm [B];
   *  IDF 2006 South/East Asian: men ≥90 cm, women ≥80 cm (single "central obesity" level) [B]. */
  function waistCategory(cm, sex, asian) {
    if (!isNum(cm) || (sex !== 'male' && sex !== 'female')) return null;
    if (asian) return cm >= (sex === 'male' ? 90 : 80) ? 'high' : 'ok';
    var inc = sex === 'male' ? 94 : 80, sub = sex === 'male' ? 102 : 88;
    return cm >= sub ? 'veryhigh' : cm >= inc ? 'high' : 'ok';
  }
  /** Waist-to-height ratio band (NICE 2022): <0.5 'ok', 0.5–0.59 'high', ≥0.6 'veryhigh' [M]. Adults, not in pregnancy. */
  function whtr(waistCm, heightCm) {
    if (!isNum(waistCm) || !isNum(heightCm) || heightCm <= 0) return null;
    var r = waistCm / heightCm;
    return { ratio: r2(r), band: r >= 0.6 ? 'veryhigh' : r >= 0.5 ? 'high' : 'ok' };
  }

  /* ======================================================================
     LIFE'S ESSENTIAL 8 (adults ≥20). Each metric 0–100; composite = unweighted mean
     of available metrics; bands high 80–100, moderate 50–79, low 0–49 (Lloyd-Jones 2022).
     ====================================================================== */
  var LE8_KEYS = ['diet', 'activity', 'nicotine', 'sleep', 'bmi', 'lipids', 'glucose', 'bp'];

  /** Moderate-equivalent minutes/week: moderate + 2 × vigorous (WHO 2020 equivalence; CRAN essential8
   *  doubles vigorous minutes the same way [V]). Days 0–7 × minutes per day. */
  function paMinutes(modDays, modMin, vigDays, vigMin) {
    var m = (isNum(modDays) && isNum(modMin)) ? modDays * modMin : (modDays === 0 ? 0 : undefined);
    var v = (isNum(vigDays) && isNum(vigMin)) ? vigDays * vigMin : (vigDays === 0 ? 0 : undefined);
    if (m === undefined && v === undefined) return undefined;
    return (m || 0) + 2 * (v || 0);
  }
  /** PA points: ≥150 → 100; 120–149 → 90; 90–119 → 80; 60–89 → 60; 30–59 → 40; 1–29 → 20; 0 → 0 [B, V]. */
  function le8Activity(min) {
    if (!isNum(min) || min < 0) return null;
    return min >= 150 ? 100 : min >= 120 ? 90 : min >= 90 ? 80 : min >= 60 ? 60 : min >= 30 ? 40 : min > 0 ? 20 : 0;
  }
  /** Nicotine: never 100; former quit ≥5 y 75; 1–<5 y 50; <1 y or current inhaled nicotine-delivery
   *  system (vape) 25; current combustible 0. Minus 20 (floor 0) when living with an active indoor smoker [B].
   *  o: { smoking:'never'|'former'|'current', quit:'lt1'|'1to5'|'5plus', vaping:bool, homeSmoke:bool }.
   *  Smokeless tobacco is not part of the LE8 nicotine metric; the action plan handles it separately. */
  function le8Nicotine(o) {
    o = o || {};
    var base;
    if (o.smoking === 'current') base = 0;
    else if (o.vaping === true) base = 25;
    else if (o.smoking === 'former') base = o.quit === '5plus' ? 75 : o.quit === '1to5' ? 50 : o.quit === 'lt1' ? 25 : null;
    else if (o.smoking === 'never') base = 100;
    else return null;
    if (base === null) return null;
    return o.homeSmoke === true ? Math.max(0, base - 20) : base;
  }
  /** Sleep (average h/night): 7–<9 → 100; 9–<10 → 90; 6–<7 → 70; 5–<6 or ≥10 → 40; 4–<5 → 20; <4 → 0 [V].
   *  (docs/research listed ≥10 h as 0; the published table and CRAN essential8 give 40.) */
  function le8Sleep(h) {
    if (!isNum(h) || h < 0 || h > 24) return null;
    if (h >= 7 && h < 9) return 100;
    if (h >= 9 && h < 10) return 90;
    if (h >= 6 && h < 7) return 70;
    if ((h >= 5 && h < 6) || h >= 10) return 40;
    if (h >= 4) return 20;
    return 0;
  }
  /** BMI: <25 → 100; 25–29.9 → 70; 30–34.9 → 30; 35–39.9 → 15; ≥40 → 0 [V]. Underweight also scores 100
   *  (a known LE8 limitation) — use bmiCategory() to flag it. Not scored in pregnancy. */
  function le8Bmi(b) {
    if (!isNum(b) || b <= 0) return null;
    return b < 25 ? 100 : b < 30 ? 70 : b < 35 ? 30 : b < 40 ? 15 : 0;
  }
  /** Non-HDL cholesterol (mg/dL): <130 → 100; 130–159 → 60; 160–189 → 40; 190–219 → 20; ≥220 → 0;
   *  minus 20 if drug-treated (floor 0) [V]. */
  function le8Lipids(nonHdlMgdl, treated) {
    if (!isNum(nonHdlMgdl) || nonHdlMgdl <= 0) return null;
    var x = nonHdlMgdl, p = x < 130 ? 100 : x < 160 ? 60 : x < 190 ? 40 : x < 220 ? 20 : 0;
    return treated ? Math.max(0, p - 20) : p;
  }
  function a1cDiabetesPoints(a) { return a < 7 ? 40 : a < 8 ? 30 : a < 9 ? 20 : a < 10 ? 10 : 0; }
  /** Blood glucose [V]. No diabetes: FBG <100 mg/dL (or HbA1c <5.7%) → 100; FBG 100–125 (HbA1c 5.7–6.4) → 60.
   *  Diabetes, by HbA1c: <7 → 40; 7–7.9 → 30; 8–8.9 → 20; 9–9.9 → 10; ≥10 → 0.
   *  o: { diabetes:bool, prediabetes:bool (told, no numbers), hba1c:%, fbg:mg/dL }
   *  Returns { points, range:'normal'|'prediabetes'|'diabetes-range'|'diabetes', approx }.
   *  - With diabetes, LE8 needs HbA1c: without it the metric is unscored (points null).
   *  - A diabetes-range value without a diagnosis has no row in the AHA table (CRAN essential8 rejects it) [V].
   *    We score it on the diabetes ladder (HbA1c) or 40 (fasting glucose only), flag approx, and the plan asks
   *    for confirmation — never a better score than a confirmed diabetes would get.
   *  - When FBG and HbA1c disagree we take the worse category. */
  function le8GlucoseDetail(o) {
    o = o || {};
    var a = isNum(o.hba1c) ? o.hba1c : undefined, f = isNum(o.fbg) ? o.fbg : undefined;
    if (o.diabetes) return isNum(a) ? { points: a1cDiabetesPoints(a), range: 'diabetes', approx: false } : { points: null, range: 'diabetes', approx: false };
    if (a === undefined && f === undefined) return o.prediabetes ? { points: 60, range: 'prediabetes', approx: true } : { points: null, range: undefined, approx: false };
    if ((isNum(a) && a >= 6.5) || (isNum(f) && f >= 126)) return { points: isNum(a) && a >= 6.5 ? a1cDiabetesPoints(a) : 40, range: 'diabetes-range', approx: true };
    if ((isNum(a) && a >= 5.7) || (isNum(f) && f >= 100)) return { points: 60, range: 'prediabetes', approx: false };
    return { points: 100, range: 'normal', approx: false }; // a recent normal result outranks an older "borderline" label
  }
  function le8Glucose(o) { return le8GlucoseDetail(o).points; }
  /** Blood pressure (mmHg) [V]: <120 and <80 → 100; 120–129 and <80 → 75; 130–139 or 80–89 → 50;
   *  140–159 or 90–99 → 25; ≥160 or ≥100 → 0. If SBP and DBP fall in different rows use the lower score.
   *  Minus 20 if treated (floor 0). */
  function le8Bp(sys, dia, treated) {
    if (!isNum(sys) || !isNum(dia) || sys <= 0 || dia <= 0) return null;
    var ps = sys < 120 ? 100 : sys < 130 ? 75 : sys < 140 ? 50 : sys < 160 ? 25 : 0;
    var pd = dia < 80 ? 100 : dia < 90 ? 50 : dia < 100 ? 25 : 0;
    var p = Math.min(ps, pd);
    return treated ? Math.max(0, p - 20) : p;
  }
  function le8Band(s) { return !isNum(s) ? null : s >= 80 ? 'high' : s >= 50 ? 'moderate' : 'low'; }
  /** Composite = mean of the available metric scores. score is floored so the shown whole number always
   *  agrees with the band of the unrounded mean (79.9 shows 79, moderate). partial when any metric is missing;
   *  reliable when at least 4 of 8 are present (UI shows a score only then). */
  function le8Composite(m) {
    m = m || {};
    var have = LE8_KEYS.filter(function (k) { return isNum(m[k]); });
    if (!have.length) return null;
    var mean = have.reduce(function (s, k) { return s + m[k]; }, 0) / have.length;
    return {
      score: Math.floor(mean + 1e-9), mean: r2(mean), band: le8Band(mean), count: have.length,
      partial: have.length < LE8_KEYS.length, reliable: have.length >= 4,
      missing: LE8_KEYS.filter(function (k) { return !isNum(m[k]); })
    };
  }

  /* ---------------------------------------------------------------- diet quick check
     The official LE8 diet metric uses the 16-item MEPA screener, whose item wording could not be verified.
     This 14-item check is our transparent approximation. Thresholds come from WHO (fruit and vegetables,
     salt), MEDAS (legumes, nuts, solid fats, sugary drinks, sweets), AHA 2021 guidance (fish 2/week, whole
     grains, liquid plant oils, minimally processed food) and WCRF 2018 (red ≤3/week, processed meat rarely).
     Each healthy answer = 1. The share met is mapped onto the LE8/MEPA bands by proportion of the maximum:
     ≥15/16 → 100; ≥12/16 → 80; ≥8/16 → 50; ≥4/16 → 25; else 0 (MEPA mapping [B]).
     Answer scales: perDay = portions a day 0–5 (5 = 5 or more); perWeek = 0 (less than once a week), 1, 2, 3,
     5 (4–6 times), 7 (every day); grains/salt = 'rarely'|'some'|'most'; oil = 'plant'|'tropical'|'animal'|'margarine'|'unsure'. */
  var DIET_ITEMS = [
    { id: 'veg', scale: 'perDay', ok: function (v) { return v >= 3; } },          // WHO ≥400 g F&V/day: 3 veg + 2 fruit portions
    { id: 'fruit', scale: 'perDay', ok: function (v) { return v >= 2; } },
    { id: 'legumes', scale: 'perWeek', ok: function (v) { return v >= 3; } },     // MEDAS ≥3/week
    { id: 'grains', scale: 'grains', ok: function (v) { return v === 'most'; } },  // AHA 2021: choose whole grains
    { id: 'nuts', scale: 'perWeek', ok: function (v) { return v >= 3; } },        // MEDAS ≥3/week
    { id: 'fish', scale: 'perWeek', ok: function (v) { return v >= 2; } },        // AHA: 2 servings/week
    { id: 'oil', scale: 'oil', ok: function (v) { return v === 'plant'; } },      // AHA 2021 / MEDAS: liquid plant oils
    { id: 'solidFat', scale: 'perWeek', ok: function (v) { return v < 7; } },     // MEDAS: butter/cream <1 a day
    { id: 'redMeat', scale: 'perWeek', ok: function (v) { return v <= 3; } },     // WCRF: ≤3 portions/week
    { id: 'processedMeat', scale: 'perWeek', ok: function (v) { return v < 1; } }, // WCRF: little, if any
    { id: 'sugaryDrinks', scale: 'perWeek', ok: function (v) { return v < 7; } }, // MEDAS: <1 a day
    { id: 'sweets', scale: 'perWeek', ok: function (v) { return v < 3; } },       // MEDAS: <3/week
    { id: 'snacks', scale: 'perWeek', ok: function (v) { return v < 3; } },       // ultra-processed snacks/fast food: our threshold, mirrors sweets
    { id: 'salt', scale: 'salt', ok: function (v) { return v === 'rarely'; } }    // WHO <5 g salt/day; our proxy question
  ];
  function dietPoints(met, total) {
    if (!isNum(met) || !isNum(total) || total <= 0) return null;
    var f = met / total;
    return f >= 15 / 16 ? 100 : f >= 12 / 16 ? 80 : f >= 8 / 16 ? 50 : f >= 4 / 16 ? 25 : 0;
  }
  /** At least 12 of 14 answered → points (unanswered count as not met, conservatively). */
  function dietScore(ans) {
    ans = ans || {};
    var answered = 0, met = 0, items = {};
    DIET_ITEMS.forEach(function (it) {
      var v = ans[it.id];
      if (v === undefined || v === null || v === '') return;
      answered++;
      items[it.id] = !!it.ok(v);
      if (items[it.id]) met++;
    });
    var total = DIET_ITEMS.length;
    return { met: met, answered: answered, total: total, items: items, complete: answered === total, points: answered >= total - 2 ? dietPoints(met, total) : null };
  }

  /* ---------------------------------------------------------------- home blood pressure
     Average of the user's home readings in the last `days` days (default 30). AHA: classify on the average of
     ≥2 readings on ≥2 occasions [B]; `enough` says whether that is met. LE8 is defined on clinic readings, so a
     home average is an approximation (labelled in the UI). */
  function bpAverage(readings, nowMs, days) {
    if (!Array.isArray(readings) || !isNum(nowMs)) return null;
    days = days || 30;
    var cutoff = nowMs - days * 864e5;
    var rows = readings.filter(function (r) {
      if (!r || !isNum(r.sys) || !isNum(r.dia)) return false;
      var tm = Date.parse(r.t);
      return isNum(tm) && tm >= cutoff && tm <= nowMs + 6e4 && r.sys >= 60 && r.sys <= 280 && r.dia >= 30 && r.dia <= 180 && r.sys > r.dia;
    });
    if (!rows.length) return null;
    var dates = {}, sys = 0, dia = 0, first = null, last = null;
    rows.forEach(function (r) {
      dates[String(r.t).slice(0, 10)] = 1; sys += r.sys; dia += r.dia;
      if (!first || r.t < first) first = r.t;
      if (!last || r.t > last) last = r.t;
    });
    var nd = Object.keys(dates).length;
    return { sys: Math.round(sys / rows.length), dia: Math.round(dia / rows.length), n: rows.length, days: nd, enough: rows.length >= 2 && nd >= 2, from: first, to: last };
  }
  /** Simple BP level used by the plan: AHA/ACC categories plus the ≥160/100 and ≥180/120 (crisis) lines [B]. */
  function bpLevel(sys, dia) {
    if (!isNum(sys) || !isNum(dia)) return null;
    if (sys >= 180 || dia >= 120) return 'crisis';
    if (sys >= 160 || dia >= 100) return 'stage2high';
    if (sys >= 140 || dia >= 90) return 'stage2';
    if (sys >= 130 || dia >= 80) return 'stage1';
    if (sys >= 120) return 'elevated';
    return 'normal';
  }

  /** Turn module answers (already in base units) into LE8 metrics + raw values for the results store.
   *  inp: { modDays, modMin, vigDays, vigMin, smoking, quit, vaping, homeSmoke, sleepHours, sleepRegular,
   *         heightCm, weightKg, pregnant, sys, dia, bpTreated, bpSource, bpN, nonHdl, tc, hdl, lipidTreated,
   *         diabetes, prediabetes, hba1c, fbg, diet:{...answers}, smokeless } */
  function le8FromInputs(inp) {
    inp = inp || {};
    var pa = paMinutes(inp.modDays, inp.modMin, inp.vigDays, inp.vigMin);
    var b = bmi(inp.heightCm, inp.weightKg);
    var nonHdl = isNum(inp.nonHdl) ? Math.round(inp.nonHdl) : (isNum(inp.tc) && isNum(inp.hdl) && inp.tc > inp.hdl ? Math.round(inp.tc - inp.hdl) : undefined);
    var g = le8GlucoseDetail({ diabetes: inp.diabetes === true, prediabetes: inp.prediabetes === true, hba1c: inp.hba1c, fbg: inp.fbg });
    var d = dietScore(inp.diet);
    var metrics = {
      diet: d.points,
      activity: le8Activity(pa),
      nicotine: le8Nicotine({ smoking: inp.smoking, quit: inp.quit, vaping: inp.vaping === true, homeSmoke: inp.homeSmoke === true }),
      sleep: le8Sleep(inp.sleepHours),
      bmi: inp.pregnant ? null : le8Bmi(b),
      lipids: le8Lipids(nonHdl, inp.lipidTreated === true),
      glucose: g.points,
      bp: le8Bp(inp.sys, inp.dia, inp.bpTreated === true)
    };
    var raw = {
      paMin: pa, smoking: inp.smoking, quit: inp.quit, vaping: inp.vaping === true, smokeless: inp.smokeless === true, homeSmoke: inp.homeSmoke === true,
      sleepHours: isNum(inp.sleepHours) ? inp.sleepHours : undefined, sleepRegular: inp.sleepRegular,
      bmi: isNum(b) ? r1(b) : undefined, pregnant: !!inp.pregnant,
      sys: isNum(inp.sys) ? Math.round(inp.sys) : undefined, dia: isNum(inp.dia) ? Math.round(inp.dia) : undefined,
      bpTreated: inp.bpTreated === true, bpSource: inp.bpSource, bpN: inp.bpN,
      nonHdl: nonHdl, lipidTreated: inp.lipidTreated === true,
      diabetes: inp.diabetes === true, hba1c: isNum(inp.hba1c) ? inp.hba1c : undefined, fbg: isNum(inp.fbg) ? inp.fbg : undefined,
      glucoseRange: g.range, glucoseApprox: g.approx,
      dietMet: d.met, dietTotal: d.total, dietAnswered: d.answered, dietSalt: inp.diet ? inp.diet.salt : undefined
    };
    return { metrics: metrics, raw: raw, composite: le8Composite(metrics) };
  }

  /* ======================================================================
     FINDRISC (Lindström & Tuomilehto 2003) [B, items/points secondary-confirmed]
     Age <45 0 / 45–54 2 / 55–64 3 / >64 4 · BMI <25 0 / 25–30 1 / >30 3 ·
     waist men <94 0 / 94–102 3 / >102 4, women <80 0 / 80–88 3 / >88 4 ·
     not ≥30 min activity daily 2 · vegetables/fruit not every day 1 · ever BP medicine 2 ·
     ever high glucose 5 · family history second-degree 3 / first-degree 5. Total 0–26.
     Asian adaptation (labelled "adapted, not validated"): IDF 2006 waist cut-off for South/East Asian men
     (≥90 cm instead of ≥94 cm) for the first step; the women's IDF cut-off (80 cm) equals the original.
     ====================================================================== */
  var FINDRISC_BANDS = [
    { id: 'low', min: 0, max: 6, pct: 1, oneIn: 100 },
    { id: 'slight', min: 7, max: 11, pct: 4, oneIn: 25 },
    { id: 'moderate', min: 12, max: 14, pct: 17, oneIn: 6 },
    { id: 'high', min: 15, max: 20, pct: 33, oneIn: 3 },
    { id: 'veryhigh', min: 21, max: 26, pct: 50, oneIn: 2 }
  ];
  var FINDRISC_MAX = { age: 4, bmi: 3, waist: 4, activity: 2, veg: 1, bpMeds: 2, glucose: 5, family: 5 };
  function findriscBand(score) {
    if (!isNum(score)) return null;
    for (var i = 0; i < FINDRISC_BANDS.length; i++) if (score <= FINDRISC_BANDS[i].max) return FINDRISC_BANDS[i].id;
    return 'veryhigh';
  }
  function findriscBandInfo(id) { return FINDRISC_BANDS.filter(function (b) { return b.id === id; })[0] || null; }
  /** o: { age, sex, bmi, waist (cm), asian, active:bool, vegDaily:bool, bpMeds:bool, highGlucose:bool, family:'none'|'second'|'first' } */
  function findrisc(o) {
    o = o || {};
    var items = {}, missing = [];
    if (isNum(o.age)) items.age = o.age < 45 ? 0 : o.age < 55 ? 2 : o.age < 65 ? 3 : 4; else missing.push('age');
    if (isNum(o.bmi)) items.bmi = o.bmi < 25 ? 0 : o.bmi <= 30 ? 1 : 3; else missing.push('bmi');
    if (isNum(o.waist) && (o.sex === 'male' || o.sex === 'female')) {
      var lo = o.sex === 'male' ? (o.asian ? 90 : 94) : 80, hi = o.sex === 'male' ? 102 : 88;
      items.waist = o.waist < lo ? 0 : o.waist <= hi ? 3 : 4;
    } else missing.push('waist');
    if (typeof o.active === 'boolean') items.activity = o.active ? 0 : 2; else missing.push('activity');
    if (typeof o.vegDaily === 'boolean') items.veg = o.vegDaily ? 0 : 1; else missing.push('veg');
    if (typeof o.bpMeds === 'boolean') items.bpMeds = o.bpMeds ? 2 : 0; else missing.push('bpMeds');
    if (typeof o.highGlucose === 'boolean') items.glucose = o.highGlucose ? 5 : 0; else missing.push('glucose');
    if (o.family === 'none' || o.family === 'second' || o.family === 'first') items.family = o.family === 'first' ? 5 : o.family === 'second' ? 3 : 0; else missing.push('family');
    var score = Object.keys(items).reduce(function (s, k) { return s + items[k]; }, 0);
    var max = score + missing.reduce(function (s, k) { return s + FINDRISC_MAX[k]; }, 0);
    var complete = !missing.length;
    return {
      score: score, min: score, max: max, complete: complete, missing: missing, items: items,
      band: complete ? findriscBand(score) : null, bandMin: findriscBand(score), bandMax: findriscBand(max),
      adapted: !!(o.asian && o.sex === 'male')
    };
  }

  /* ======================================================================
     Mood: PHQ-2 / PHQ-9 (Kroenke 2001, 2003) and GAD-2 / GAD-7 (Spitzer 2006; Kroenke 2007) [M]
     Items 0 not at all · 1 several days · 2 more than half the days · 3 nearly every day.
     PHQ-2 ≥3 positive. PHQ-9: 0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 moderately severe, 20–27 severe;
     ≥10 probable depression. Item 9 >0 (any) → same-session safety message. GAD-2 ≥3 positive.
     GAD-7: 0–4 minimal, 5–9 mild, 10–14 moderate, 15–21 severe; ≥10 positive.
     ====================================================================== */
  function sumItems(items, n) {
    if (!Array.isArray(items) || items.length < n) return null;
    var s = 0;
    for (var i = 0; i < n; i++) { if (!int0to(items[i], 3)) return null; s += items[i]; }
    return s;
  }
  function phq2(items) { var s = sumItems(items, 2); return s == null ? null : { score: s, positive: s >= 3 }; }
  function phq9Band(s) { return s >= 20 ? 'severe' : s >= 15 ? 'modsevere' : s >= 10 ? 'moderate' : s >= 5 ? 'mild' : 'minimal'; }
  function phq9(items) {
    var s = sumItems(items, 9);
    if (s == null) return null;
    return { score: s, band: phq9Band(s), positive: s >= 10, item9: items[8], item9Positive: items[8] > 0 };
  }
  function gad2(items) { var s = sumItems(items, 2); return s == null ? null : { score: s, positive: s >= 3 }; }
  function gad7Band(s) { return s >= 15 ? 'severe' : s >= 10 ? 'moderate' : s >= 5 ? 'mild' : 'minimal'; }
  function gad7(items) {
    var s = sumItems(items, 7);
    if (s == null) return null;
    return { score: s, band: gad7Band(s), positive: s >= 10 };
  }

  /* ======================================================================
     AUDIT-C (Bush 1998; Bradley 2007) [M]: three items 0–4, total 0–12.
     Positive ≥4 for men, ≥3 for women; unknown sex uses ≥3 (the safer, lower cut-off).
     ====================================================================== */
  function auditc(q1, q2, q3, sex) {
    if (!int0to(q1, 4)) return null;
    if (q1 === 0) { q2 = 0; q3 = 0; }
    if (!int0to(q2, 4) || !int0to(q3, 4)) return null;
    var score = q1 + q2 + q3, th = sex === 'male' ? 4 : 3;
    return { score: score, threshold: th, positive: score >= th, sexKnown: sex === 'male' || sex === 'female', drinks: q1 > 0 };
  }

  /* ======================================================================
     STOP-BANG (Chung 2008, 2016) [V]: 1 point each for Snoring, Tired, Observed apnoea, Pressure,
     BMI >35, Age >50, Neck >40 cm, male Gender. 0–2 low; 5–8 high; 3–4 intermediate, or high when
     STOP ≥2 plus male sex, BMI >35 or neck >40 cm. Unknown items count 0 and are listed in `unknown`.
     ====================================================================== */
  function stopbang(o) {
    o = o || {};
    var S = o.snore === true, T = o.tired === true, O = o.observed === true, P = o.pressure === true;
    var B = isNum(o.bmi) && o.bmi > 35, A = isNum(o.age) && o.age > 50, N = o.neck === true, G = o.sex === 'male';
    var stop = (S ? 1 : 0) + (T ? 1 : 0) + (O ? 1 : 0) + (P ? 1 : 0);
    var score = stop + (B ? 1 : 0) + (A ? 1 : 0) + (N ? 1 : 0) + (G ? 1 : 0);
    var band = score >= 5 ? 'high' : score <= 2 ? 'low' : (stop >= 2 && (G || B || N)) ? 'high' : 'intermediate';
    var unknown = [];
    ['snore', 'tired', 'observed', 'pressure', 'neck'].forEach(function (k) { if (typeof o[k] !== 'boolean') unknown.push(k); });
    if (!isNum(o.bmi)) unknown.push('bmi');
    if (!isNum(o.age)) unknown.push('age');
    if (o.sex !== 'male' && o.sex !== 'female') unknown.push('sex');
    return { score: score, stop: stop, band: band, unknown: unknown, items: { S: S, T: T, O: O, P: P, B: B, A: A, N: N, G: G } };
  }

  /* ======================================================================
     WHO TB four-symptom screen [B]: any current cough, fever, night sweats or weight loss → positive
     (presumptive TB → needs a WHO-recommended rapid test). Coughing up blood and living with someone
     who has TB are extra prompts (not part of the score).
     ====================================================================== */
  function tbScreen(o) {
    o = o || {};
    var keys = ['cough', 'fever', 'sweats', 'weightLoss'];
    var answered = keys.filter(function (k) { return typeof o[k] === 'boolean'; });
    if (!answered.length) return null;
    var count = keys.filter(function (k) { return o[k] === true; }).length;
    return { positive: count > 0, count: count, complete: answered.length === keys.length, blood: o.blood === true, contact: o.contact === true };
  }

  /* CDC STEADI three key questions [V]: fallen in the past year; unsteady when standing or walking;
     worries about falling. Any yes → at risk (designed for 65+; offered here from 60, WHO's older-age line). */
  function fallsScreen(o) {
    o = o || {};
    var keys = ['fell', 'unsteady', 'worried'];
    var answered = keys.filter(function (k) { return typeof o[k] === 'boolean'; });
    if (!answered.length) return null;
    var count = keys.filter(function (k) { return o[k] === true; }).length;
    return { positive: count > 0, count: count, complete: answered.length === keys.length };
  }

  /* Infection-testing nudges. o: { hivLast:'never'|'over1y'|'past1y'|'unsure'|'skip', hepB, hepC:'yes'|'no'|'unsure',
     exposure:'yes'|'no'|'skip', exposure72h:'yes'|'no'|'unsure', sti:'yes'|'no'|'skip' }.
     PEP should start as soon as possible and within 72 hours of exposure (WHO 2024) [V]. */
  function infectionNeeds(o) {
    o = o || {};
    var exposure = o.exposure === 'yes';
    return {
      hivTest: exposure || o.hivLast === 'never' || o.hivLast === 'over1y' || o.hivLast === 'unsure',
      hivSoon: exposure,
      pep: exposure && (o.exposure72h === 'yes' || o.exposure72h === 'unsure'),
      hepTest: o.hepB === 'no' || o.hepB === 'unsure' || o.hepC === 'no' || o.hepC === 'unsure',
      stiCheck: o.sti === 'yes' || exposure,
      stiSymptoms: o.sti === 'yes'
    };
  }

  /* ======================================================================
     Potassium salt-substitute safety gate (WHO 2025 lower-sodium salt substitute guideline [V]):
     adults only; not in pregnancy, for children, or with kidney impairment or conditions/medicines that
     reduce potassium excretion. Our conservative rule:
       'no'  → child (<18), pregnant, kidney disease (never recommended).
       'ask' → potassium-sparing diuretics, ACE inhibitors, ARBs (incl. sacubitril/valsartan), aliskiren,
               potassium supplements, blood-pressure medicine of unknown type, heart disease, diabetes
               (kidney function unknown), breastfeeding → "ask your health worker first".
     ====================================================================== */
  var MED_PATTERNS = {
    kSparing: /spironolact|eplerenon|amilorid|triamteren|finerenon|canrenon|aldactone|inspra/i,
    acei: /[a-z]pril\b/i,                        // captopril, enalapril, lisinopril, ramipril, perindopril, …
    arb: /sartan\b|entresto|sacubitril/i,        // losartan, valsartan, candesartan, telmisartan, …
    renin: /aliskiren/i,
    kSupp: /potassium|\bkcl\b|slow-?k\b|sando-?k\b/i
  };
  function medFlags(names) {
    var f = { kSparing: false, acei: false, arb: false, renin: false, kSupp: false, any: false };
    (Array.isArray(names) ? names : []).forEach(function (n) {
      var s = String(n || '');
      Object.keys(MED_PATTERNS).forEach(function (k) { if (MED_PATTERNS[k].test(s)) { f[k] = true; f.any = true; } });
    });
    return f;
  }
  /** c: { age, pregnant, breastfeeding, conditions:[ids], medNames:[strings], bpMeds:bool } */
  function saltSubstituteGate(c) {
    c = c || {};
    var no = [], ask = [];
    if (isNum(c.age) && c.age < 18) no.push('child');
    if (c.pregnant) no.push('pregnant');
    if (has(c.conditions, 'kidney-disease')) no.push('kidney');
    var f = medFlags(c.medNames);
    if (f.kSparing) ask.push('med-k-sparing');
    if (f.acei) ask.push('med-acei');
    if (f.arb) ask.push('med-arb');
    if (f.renin) ask.push('med-aliskiren');
    if (f.kSupp) ask.push('med-potassium');
    if (c.bpMeds && !f.kSparing && !f.acei && !f.arb && !f.renin) ask.push('bp-meds');
    if (has(c.conditions, 'heart-disease')) ask.push('heart-disease');
    if (has(c.conditions, 'diabetes')) ask.push('diabetes');
    if (c.breastfeeding) ask.push('breastfeeding');
    return { status: no.length ? 'no' : ask.length ? 'ask' : 'ok', no: no, ask: ask };
  }

  /* ======================================================================
     ACTION PLAN — score = expected benefit × personal relevance × feasibility.
     benefit (0–100): size of the effect in the cited evidence for its main outcome (death, heart attack
       and stroke, diabetes, depression, falls). Observational results are multiplied by 0.7 because they
       can overstate cause and effect. Derivations are next to each number.
     relevance (0–1): how much it applies to this person, from their answers (our documented rules).
     feasibility (0–1): how easy it usually is to start (our judgement); halved-ish when a safety gate says
       "ask your health worker first".
     priority: 'urgent' (today) and 'soon' (within days) always come before 'normal'.
     ====================================================================== */
  var OBS = 0.7;
  var BENEFIT = {
    'crisis-support': 100, 'pep': 100, 'bp-urgent': 100,
    'stop-smoking': 60,        // Jha 2013 [V]: >10 y of life lost; quitting before 40 avoids ~90% of the excess risk; death rate ~3× never-smokers → (3 − 1.2)/3 ≈ 60%
    'check-bp': 36,            // Ettehad 2016 [V]: RR 0.80 per 10 mmHg; finding and treating high BP (≈20 mmHg fall) ≈ 1 − 0.8² = 36% fewer major CV events
    'salt-substitute': 13,     // SSaSS 2021 [V]: major cardiovascular events rate ratio 0.87 (stroke 0.86, death 0.88)
    'steps': 33,               // Ding 2025 [V]: 7,000 vs 2,000 steps/day HR 0.53 → 47% × 0.7
    'vilpa': 27,               // Stamatakis 2022 [V]: 3 bouts/day → 38–40% lower all-cause mortality → 39 × 0.7
    'strength-balance': 23,    // Sherrington 2019 [V]: exercise cuts the rate of falls by 23% (RaR 0.77, RCTs, high certainty)
    'sleep-regularity': 14,    // Windred 2024 [B]: 20–48% lower mortality vs least regular; lower bound 20 × 0.7
    'sleep-apnoea-check': 10,  // no single verified effect size → deliberately low, assigned by us
    'cut-alcohol': 19,         // Wood 2018 [V]: >350 g/week ≈ 4–5 y less life at 40, ≈45% of smoking's ≥10 y → 60 × 0.45 × 0.7
    'diet-swaps': 22,          // Aune 2017 [V]: up to ~⅓ lower all-cause mortality at 800 g/day fruit & veg vs very little → 31 × 0.7
    'weight': 58,              // DPP 2002 [V]: ≥7% weight loss + 150 min/week activity → 58% less type 2 diabetes (RCT)
    'check-glucose': 58,       // DPP 2002 [V]: what finding raised blood sugar early makes possible
    'check-cholesterol': 22,   // CTT 2010 [V]: RR 0.78 per 1 mmol/L lower LDL cholesterol (RCT meta-analysis)
    'tb-test': 50,             // WHO TB fact sheet [M]: untreated TB kills about half; ~85% cured with WHO-recommended treatment → assigned 50
    'hiv-test': 57,            // START 2015 [M]: starting HIV treatment early → 57% fewer serious illnesses
    'hep-test': 20,            // assigned [M]: hepatitis C is curable and hepatitis B treatable (WHO); no single effect size
    'sti-check': 15,           // assigned [M]: most STIs are curable (WHO); no single effect size
    'mental-health-support': 72 // Friendship Bench 2016 [B]: depression caseness ~50% → ~14% at 6 months (RCT) → 72% relative
  };
  var FEAS = {
    'crisis-support': 1, 'pep': 1, 'bp-urgent': 1,
    'stop-smoking': 0.7, 'control-bp': 0.75, 'check-bp': 0.85, 'salt-substitute': 0.85, 'less-salt': 0.8,
    'steps': 0.9, 'vilpa': 0.9, 'strength-balance': 0.8, 'sleep-regularity': 0.8, 'sleep-apnoea-check': 0.6,
    'cut-alcohol': 0.65, 'diet-swaps': 0.85, 'weight': 0.5, 'check-glucose': 0.75, 'diabetes-care': 0.75,
    'check-cholesterol': 0.7, 'lower-cholesterol': 0.7, 'tb-test': 0.8, 'hiv-test': 0.85, 'hep-test': 0.7,
    'sti-check': 0.7, 'mental-health-support': 0.6
  };
  var KIND = {
    'crisis-support': 'urgent', 'pep': 'urgent', 'bp-urgent': 'urgent',
    'stop-smoking': 'habit', 'control-bp': 'habit', 'salt-substitute': 'habit', 'less-salt': 'habit', 'steps': 'habit', 'vilpa': 'habit',
    'strength-balance': 'habit', 'sleep-regularity': 'habit', 'cut-alcohol': 'habit', 'diet-swaps': 'habit', 'weight': 'habit',
    'check-bp': 'test', 'check-glucose': 'test', 'check-cholesterol': 'test', 'tb-test': 'test', 'hiv-test': 'test', 'hep-test': 'test',
    'sti-check': 'test', 'sleep-apnoea-check': 'talk', 'diabetes-care': 'talk', 'lower-cholesterol': 'talk', 'mental-health-support': 'talk'
  };
  var ACTION_SOURCES = {
    'crisis-support': ['phq9'], 'pep': ['whoPep'], 'bp-urgent': ['ahaBp'],
    'stop-smoking': ['jha', 'cessation'], 'control-bp': ['ettehad', 'smbp'], 'check-bp': ['ettehad', 'whoHtn'],
    'salt-substitute': ['ssass', 'whoLsss'], 'less-salt': ['heSalt', 'ettehad'], 'steps': ['ding'], 'vilpa': ['stamatakis'],
    'strength-balance': ['sherrington', 'steadi'], 'sleep-regularity': ['windred', 'le8'], 'sleep-apnoea-check': ['stopbang'],
    'cut-alcohol': ['wood', 'roerecke', 'whoAlcohol'], 'diet-swaps': ['aune', 'whoDiet'], 'weight': ['dpp'],
    'check-glucose': ['dpp', 'idf'], 'diabetes-care': ['ukpds'], 'check-cholesterol': ['ctt'], 'lower-cholesterol': ['ctt'],
    'tb-test': ['w4ss', 'whoTb'], 'hiv-test': ['start', 'whoHivst'], 'hep-test': ['hepTesting'], 'sti-check': ['whoSti'],
    'mental-health-support': ['friendship', 'phq9', 'gad7']
  };
  var EVIDENCE = {
    'stop-smoking': 'observational', 'check-bp': 'trial', 'control-bp': 'trial', 'salt-substitute': 'trial', 'less-salt': 'trial',
    'steps': 'observational', 'vilpa': 'observational', 'strength-balance': 'trial', 'sleep-regularity': 'observational',
    'sleep-apnoea-check': 'assigned', 'cut-alcohol': 'observational', 'diet-swaps': 'observational', 'weight': 'trial',
    'check-glucose': 'trial', 'diabetes-care': 'observational', 'check-cholesterol': 'trial', 'lower-cholesterol': 'trial',
    'tb-test': 'assigned', 'hiv-test': 'trial', 'hep-test': 'assigned', 'sti-check': 'assigned', 'mental-health-support': 'trial',
    'crisis-support': 'guideline', 'pep': 'guideline', 'bp-urgent': 'guideline'
  };

  /** Context for the ranking, from the shared profile and the saved results (both may be partial).
   *  opts: { year (for age from birthYear), today:'YYYY-MM-DD', medNames:[...] } */
  function buildContext(profile, results, opts) {
    profile = profile || {}; results = results || {}; opts = opts || {};
    var age = isNum(profile.birthYear) && isNum(opts.year) ? opts.year - profile.birthYear : (isNum(profile.age) ? profile.age : undefined);
    var conditions = Array.isArray(profile.conditions) ? profile.conditions.slice() : [];
    var le8 = results.le8 || {}, raw = le8.raw || {}, metrics = le8.metrics || {};
    var b = bmi(profile.heightCm, profile.weightKg);
    return {
      age: age, sex: profile.sex, pregnant: !!profile.pregnant, breastfeeding: !!profile.breastfeeding,
      asian: profile.ancestry === 'asian', conditions: conditions,
      bmi: isNum(b) ? b : (isNum(raw.bmi) ? raw.bmi : undefined),
      smoking: profile.smoking || raw.smoking, quit: profile.smokingQuit || raw.quit,
      vaping: profile.vaping === true || raw.vaping === true, smokeless: profile.smokeless === true || raw.smokeless === true,
      homeSmoke: raw.homeSmoke === true,
      metrics: metrics, raw: raw, le8Done: !!results.le8,
      findrisc: results.findrisc || null, phq2: results.phq2 || null, phq9: results.phq9 || null,
      gad2: results.gad2 || null, gad7: results.gad7 || null, auditc: results.auditc || null,
      stopbang: results.stopbang || null, tb: results.tb || null, falls: results.falls || null,
      infections: results.infections || null,
      medNames: Array.isArray(opts.medNames) ? opts.medNames : [],
      bpMeds: raw.bpTreated === true, today: opts.today
    };
  }

  function why(code, vars) { return vars ? { code: code, vars: vars } : { code: code }; }
  function hasC(c, id) { return has(c.conditions, id); }
  function overweightCut(c) { return c.asian ? 23 : 25; }

  var RULES = {
    'crisis-support': function (c) {
      if (c.phq9 && c.phq9.item9 > 0) return { r: 1, priority: 'urgent', why: [why('item9')] };
      return null;
    },
    'pep': function (c) {
      var n = infectionNeeds(c.infections);
      return n.pep ? { r: 1, priority: 'urgent', why: [why('exposure-72h')] } : null;
    },
    'bp-urgent': function (c) {
      return bpLevel(c.raw.sys, c.raw.dia) === 'crisis' ? { r: 1, priority: 'urgent', why: [why('bp-crisis', { sys: c.raw.sys, dia: c.raw.dia })] } : null;
    },
    'tb-test': function (c) {
      if (c.tb && c.tb.positive) return { r: 1, priority: c.tb.blood ? 'urgent' : 'soon', why: [why(c.tb.blood ? 'tb-blood' : 'tb-symptoms', { n: c.tb.count })] };
      if (c.tb && c.tb.contact) return { r: 0.6, why: [why('tb-contact')] };
      return null;
    },
    'stop-smoking': function (c) {
      if (c.smoking === 'current') return { r: 1, why: [why('smoker')].concat(c.homeSmoke ? [why('home-smoke')] : []) };
      if (c.smokeless) return { r: 0.8, why: [why('smokeless')] };
      if (c.vaping) return { r: 0.5, why: [why('vaper')] };
      if (c.smoking === 'former' && c.quit === 'lt1') return { r: 0.3, why: [why('recent-quit')], feas: 0.9 };
      if (c.homeSmoke) return { r: 0.3, why: [why('home-smoke')] };
      return null;
    },
    'control-bp': function (c) {
      var lvl = bpLevel(c.raw.sys, c.raw.dia), v = { sys: c.raw.sys, dia: c.raw.dia }, home = c.raw.bpSource === 'home' ? [why('bp-home', { n: c.raw.bpN || 0 })] : [];
      if (lvl === 'crisis' || lvl === 'stage2high') return { r: 1, priority: 'soon', why: [why('bp-high', v)].concat(home) };
      if (lvl === 'stage2') return { r: 1, why: [why('bp-high', v)].concat(home) };
      if (lvl === 'stage1') return { r: 0.8, why: [why('bp-raised', v)].concat(home) };
      if (lvl === 'elevated') return { r: 0.4, why: [why('bp-elevated', v)].concat(home) };
      if (lvl === 'normal' && c.raw.bpTreated) return { r: 0.3, why: [why('bp-treated-ok', v)] };
      if (!lvl && hasC(c, 'hypertension')) return { r: 0.8, why: [why('htn-no-reading')] };
      return null;
    },
    'check-bp': function (c) {
      if (isNum(c.raw.sys) && isNum(c.raw.dia)) return null;
      if (hasC(c, 'hypertension')) return null; // covered by control-bp
      var r = c.age >= 40 ? 1 : c.age >= 18 ? 0.6 : isNum(c.age) ? 0.3 : 0.7;
      var w = [why('bp-unknown')];
      if (c.age >= 40) w.push(why('age-40'));
      if ((isNum(c.bmi) && c.bmi >= 30) || hasC(c, 'diabetes') || hasC(c, 'kidney-disease')) { r = Math.min(1, r + 0.2); w.push(why('bp-risk-factors')); }
      return { r: r, why: w };
    },
    'salt-substitute': function (c) {
      var lvl = bpLevel(c.raw.sys, c.raw.dia);
      var r, w = [];
      if (hasC(c, 'hypertension') || lvl === 'stage1' || lvl === 'stage2' || lvl === 'stage2high' || lvl === 'crisis') { r = 1; w.push(why('salt-bp')); }
      else if (c.age >= 60) { r = 1; w.push(why('age-60')); }
      else if (lvl === 'elevated') { r = 0.6; w.push(why('bp-elevated', { sys: c.raw.sys, dia: c.raw.dia })); }
      else { r = 0.35; w.push(why('salt-general')); }
      if (c.raw.dietSalt === 'most') { r = Math.min(1, r + 0.1); w.push(why('diet-salt-most')); }
      return { r: r, why: w };
    },
    'less-salt': function (c, gate) {
      var lvl = bpLevel(c.raw.sys, c.raw.dia), high = hasC(c, 'hypertension') || lvl === 'stage1' || lvl === 'stage2' || lvl === 'stage2high' || lvl === 'crisis';
      var w = [];
      if (gate && gate.status !== 'ok') {
        w.push(why(gate.status === 'no' ? 'salt-sub-not-for-you' : 'salt-sub-ask'));
        return { r: high ? 1 : c.age >= 60 ? 0.8 : 0.4, why: w, benefit: high ? 11 : 5 };
      }
      if (c.raw.dietSalt === 'most') return { r: 0.5, why: [why('diet-salt-most')], benefit: high ? 11 : 5 };
      return null;
    },
    'steps': function (c) {
      var p = c.metrics.activity;
      if (!isNum(p)) return { r: 0.5, why: [why('activity-unknown')] };
      if (p >= 100) return null;
      return { r: (100 - p) / 100, why: [why('activity-low', { min: Math.round(c.raw.paMin || 0) })] };
    },
    'vilpa': function (c) {
      var p = c.metrics.activity;
      if (!isNum(p)) return { r: 0.35, why: [why('activity-unknown')] };
      if (p > 60) return null;
      return { r: (100 - p) / 100 * 0.9, why: [why('activity-low', { min: Math.round(c.raw.paMin || 0) })] };
    },
    'strength-balance': function (c) {
      if (c.falls && c.falls.positive) return { r: 1, why: [why('falls-positive')] };
      if (!c.falls && c.age >= 65) return { r: 0.4, why: [why('age-65')] };
      if (c.age >= 60) return { r: 0.2, why: [why('age-60-balance')] };
      return null;
    },
    'sleep-regularity': function (c) {
      var reg = c.raw.sleepRegular, sp = c.metrics.sleep, h = c.raw.sleepHours;
      if (reg === 'yes' && (!isNum(sp) || sp >= 100)) return null;
      var r = reg === 'no' ? 1 : reg === 'some' ? 0.6 : reg === 'yes' ? 0.1 : 0.3, w = [];
      if (reg === 'no' || reg === 'some') w.push(why('sleep-irregular'));
      if (isNum(sp) && sp < 100) {
        r = Math.max(r, (100 - sp) / 100);
        w.push(why(isNum(h) && h >= 9 ? 'sleep-long' : 'sleep-short', { h: h }));
      }
      if (!w.length) w.push(why('sleep-unknown'));
      return { r: r, why: w };
    },
    'sleep-apnoea-check': function (c) {
      if (!c.stopbang) return null;
      if (c.stopbang.band === 'high') return { r: 1, why: [why('stopbang-high', { score: c.stopbang.score })] };
      if (c.stopbang.band === 'intermediate') return { r: 0.6, why: [why('stopbang-mid', { score: c.stopbang.score })] };
      return null;
    },
    'cut-alcohol': function (c) {
      var a = c.auditc;
      if (!a) return null;
      if (c.pregnant && a.score > 0) return { r: 1, priority: 'soon', why: [why('pregnant-alcohol')] };
      if (a.positive) return { r: a.score >= 8 ? 1 : 0.7, why: [why('audit-positive', { score: a.score })] };
      if (a.score > 0) return { r: 0.15, why: [why('audit-low')] };
      return null;
    },
    'diet-swaps': function (c) {
      var p = c.metrics.diet;
      if (!isNum(p)) return { r: 0.4, why: [why('diet-unknown')] };
      if (p >= 100) return null;
      return { r: (100 - p) / 100, why: [why('diet-score', { met: c.raw.dietMet, total: c.raw.dietTotal })] };
    },
    'weight': function (c) {
      var b = c.bmi;
      if (!isNum(b) || b < overweightCut(c)) return null;
      var cuts = c.asian ? [23, 27.5, 32.5, 37.5] : [25, 30, 35, 40];
      var r = b < cuts[1] ? 0.4 : b < cuts[2] ? 0.7 : b < cuts[3] ? 0.85 : 1;
      var w = [why(c.asian ? 'bmi-asian' : 'bmi', { bmi: r1(b) })];
      var dmRisk = hasC(c, 'diabetes') || hasC(c, 'raised-sugar') || c.raw.glucoseRange === 'prediabetes' || c.raw.glucoseRange === 'diabetes-range' || (c.findrisc && c.findrisc.score >= 12);
      if (dmRisk) { r = Math.max(r, 0.8); w.push(why('diabetes-risk')); }
      return { r: r, why: w };
    },
    'check-glucose': function (c) {
      if (hasC(c, 'diabetes')) return null;
      var range = c.raw.glucoseRange;
      if (range === 'diabetes-range') return { r: 1, priority: 'soon', why: [why('glucose-diabetes-range')] };
      if (range === 'prediabetes' || hasC(c, 'raised-sugar')) return { r: 0.3, why: [why('prediabetes-retest')] };
      if (range === 'normal') return null;
      var f = c.findrisc;
      if (f && isNum(f.score)) {
        var s = f.complete ? f.score : f.min;
        var r = s >= 15 ? 1 : s >= 12 ? 0.7 : s >= 7 ? 0.4 : 0.15;
        return { r: r, why: [why('findrisc', { score: f.score, band: f.band || f.bandMin })] };
      }
      var over = isNum(c.bmi) && c.bmi >= overweightCut(c);
      if (c.age >= 35 || over) return { r: 0.5, why: [why('glucose-unknown')].concat(c.age >= 35 ? [why('age-35')] : []).concat(over ? [why('bmi-over')] : []) };
      return { r: 0.2, why: [why('glucose-unknown')] };
    },
    'diabetes-care': function (c) {
      if (!hasC(c, 'diabetes') && !c.raw.diabetes) return null;
      var a = c.raw.hba1c;
      if (!isNum(a)) return { r: 0.8, why: [why('hba1c-unknown')], benefit: 15 };
      var excess = clamp(a - 7, 1, 3);
      var ben = r1(100 * (1 - Math.pow(0.79, excess)) * OBS); // UKPDS 35 [M]: each 1% lower HbA1c ≈ 21% fewer diabetes-related deaths
      if (a < 7) return { r: 0.2, why: [why('hba1c-ok', { a1c: a })], benefit: ben };
      return { r: a >= 9 ? 1 : a >= 8 ? 0.75 : 0.5, priority: a >= 10 ? 'soon' : 'normal', why: [why('hba1c-high', { a1c: a })], benefit: ben };
    },
    'check-cholesterol': function (c) {
      if (isNum(c.raw.nonHdl)) return null;
      if (hasC(c, 'high-cholesterol') || c.raw.lipidTreated) return { r: 0.6, why: [why('chol-known-no-numbers')] };
      var r = c.age >= 40 ? 0.7 : c.age >= 20 ? 0.3 : isNum(c.age) ? 0.1 : 0.5, w = [why('chol-unknown')];
      if (hasC(c, 'diabetes') || hasC(c, 'hypertension') || c.smoking === 'current' || hasC(c, 'heart-disease') || hasC(c, 'stroke')) { r = Math.min(1, r + 0.2); w.push(why('chol-risk-factors')); }
      return { r: r, why: w };
    },
    'lower-cholesterol': function (c) {
      var nh = c.raw.nonHdl;
      if (!isNum(nh)) return null;
      var x = clamp((nh - 130) / 38.67, 0.5, 2.5), ben = r1(100 * (1 - Math.pow(0.78, x))); // CTT 2010 [V]
      var v = { value: nh, mmol: cholToMmol(nh) };
      if (nh >= 190) return { r: 1, why: [why('nonhdl-high', v)], benefit: ben };
      if (nh >= 160) return { r: 0.7, why: [why('nonhdl-high', v)], benefit: ben };
      if (nh >= 130) return { r: 0.4, why: [why('nonhdl-raised', v)], benefit: ben };
      if (c.raw.lipidTreated) return { r: 0.2, why: [why('lipids-treated-ok')], benefit: ben };
      return null;
    },
    'hiv-test': function (c) {
      if (hasC(c, 'hiv')) return null;
      var inf = c.infections;
      if (!inf) return { r: 0.15, why: [why('hiv-unknown')] };
      if (inf.exposure === 'yes') return { r: 1, priority: 'soon', why: [why('exposure')] };
      if (inf.hivLast === 'never' || inf.hivLast === 'unsure') return { r: 0.3, why: [why('hiv-never')] };
      if (inf.hivLast === 'over1y') return { r: 0.2, why: [why('hiv-over1y')] };
      if (inf.hivLast === 'skip') return { r: 0.15, why: [why('hiv-unknown')] };
      return null;
    },
    'hep-test': function (c) {
      var inf = c.infections;
      if (!inf) return { r: 0.1, why: [why('hep-unknown')] };
      var n = infectionNeeds(inf);
      if (inf.exposure === 'yes') return { r: 0.5, why: [why('exposure')] };
      if (n.hepTest) return { r: 0.25, why: [why('hep-never')] };
      return null;
    },
    'sti-check': function (c) {
      var inf = c.infections;
      if (!inf) return null;
      if (inf.sti === 'yes') return { r: 1, priority: 'soon', why: [why('sti-symptoms')] };
      if (inf.exposure === 'yes') return { r: 0.6, why: [why('exposure')] };
      return null;
    },
    'mental-health-support': function (c) {
      var r = 0, w = [], soon = false;
      if (c.phq9) {
        var s = c.phq9.score;
        var pr = s >= 20 ? 1 : s >= 15 ? 0.9 : s >= 10 ? 0.75 : s >= 5 ? 0.35 : 0;
        if (pr > 0) { r = Math.max(r, pr); w.push(why('phq9', { score: s })); }
        if (s >= 20) soon = true;
      } else if (c.phq2 && c.phq2.positive) { r = Math.max(r, 0.6); w.push(why('phq2-positive')); }
      if (c.gad7) {
        var g = c.gad7.score;
        var gr = g >= 15 ? 0.9 : g >= 10 ? 0.75 : g >= 5 ? 0.3 : 0;
        if (gr > 0) { r = Math.max(r, gr); w.push(why('gad7', { score: g })); }
        if (g >= 15) soon = true;
      } else if (c.gad2 && c.gad2.positive) { r = Math.max(r, 0.5); w.push(why('gad2-positive')); }
      if (hasC(c, 'depression-anxiety')) { r = Math.max(r, 0.4); w.push(why('condition-mental')); }
      return r > 0 ? { r: r, priority: soon ? 'soon' : 'normal', why: w } : null;
    }
  };
  var GATES = {
    'salt-substitute': function (c) {
      return saltSubstituteGate({ age: c.age, pregnant: c.pregnant, breastfeeding: c.breastfeeding, conditions: c.conditions, medNames: c.medNames, bpMeds: c.bpMeds });
    },
    'vilpa': function (c) {
      var ask = [];
      if (hasC(c, 'heart-disease') || hasC(c, 'stroke')) ask.push('heart');
      if (c.pregnant) ask.push('pregnant');
      if (c.falls && c.falls.positive) ask.push('falls');
      return { status: ask.length ? 'ask' : 'ok', no: [], ask: ask };
    },
    'weight': function (c) {
      var no = [];
      if (c.pregnant) no.push('pregnant');
      if (isNum(c.age) && c.age < 18) no.push('child');
      return { status: no.length ? 'no' : 'ok', no: no, ask: [] };
    }
  };
  var PRIORITY_RANK = { urgent: 0, soon: 1, normal: 2 };
  var ACTION_IDS = Object.keys(RULES);

  /** Rank every applicable action. Returns [{ id, kind, priority, score, benefit, relevance, feasibility,
   *  why:[{code,vars}], gate:{status,no,ask}, sources:[ids], evidence }] sorted urgent → soon → normal, then score. */
  function rankActions(c) {
    var out = [], saltGate = GATES['salt-substitute'](c);
    ACTION_IDS.forEach(function (id) {
      var gate = id === 'salt-substitute' ? saltGate : GATES[id] ? GATES[id](c) : { status: 'ok', no: [], ask: [] };
      if (gate.status === 'no') return;
      var rel = RULES[id](c, id === 'less-salt' ? saltGate : undefined);
      if (!rel || !(rel.r > 0)) return;
      var ben = isNum(rel.benefit) ? rel.benefit : id === 'control-bp' ? bpBenefit(c) : BENEFIT[id];
      var feas = isNum(rel.feas) ? rel.feas : FEAS[id];
      if (gate.status === 'ask') feas = r2(feas * 0.6);
      var priority = rel.priority || 'normal';
      if (priority === 'normal' && rel.r < 0.1) return;
      out.push({
        id: id, kind: KIND[id], priority: priority, score: r1(ben * rel.r * feas), benefit: r1(ben), relevance: r2(rel.r), feasibility: feas,
        why: rel.why || [], gate: gate, sources: ACTION_SOURCES[id] || [], evidence: EVIDENCE[id] || 'assigned'
      });
    });
    out.sort(function (a, b) { return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (b.score - a.score) || (a.id < b.id ? -1 : 1); });
    return out;
  }
  /** Expected benefit of controlling BP: Ettehad 2016 RR 0.80 per 10 mmHg systolic [V].
   *  Δ = SBP − 120, limited to 10–40 mmHg; diagnosed hypertension without a reading assumes Δ = 20. */
  function bpBenefit(c) {
    var s = c.raw.sys;
    var delta = isNum(s) ? clamp(s - 120, 10, 40) : 20;
    return r1(100 * (1 - Math.pow(0.8, delta / 10)));
  }

  /* ---------------------------------------------------------------- re-check scheduling
     Our suggestion (not a guideline): 3 months if anything needs follow-up, 6 if moderate, otherwise 12. */
  function suggestRecheckMonths(results) {
    results = results || {};
    var le8 = results.le8, f = results.findrisc;
    var follow = (le8 && le8.band === 'low') || (f && f.score >= 15) || (results.phq9 && results.phq9.score >= 10) ||
      (results.gad7 && results.gad7.score >= 10) || (results.auditc && results.auditc.positive) ||
      (results.stopbang && results.stopbang.band === 'high') || (results.tb && results.tb.positive) || (results.falls && results.falls.positive);
    if (follow) return 3;
    if ((le8 && le8.band === 'moderate') || (f && f.score >= 12)) return 6;
    return 12;
  }
  function addMonths(ymd, n) {
    var p = String(ymd || '').split('-').map(Number);
    if (p.length < 3 || p.some(function (x) { return !isNum(x); })) return null;
    var y = p[0], m = p[1] - 1 + n, d = p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    d = Math.min(d, last);
    return y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d;
  }

  return {
    SOURCES: SOURCES, CONDITIONS: CONDITIONS, LE8_KEYS: LE8_KEYS, DIET_ITEMS: DIET_ITEMS, FINDRISC_BANDS: FINDRISC_BANDS, BENEFIT: BENEFIT, FEAS: FEAS,
    ACTION_IDS: ACTION_IDS, ACTION_SOURCES: ACTION_SOURCES, MED_PATTERNS: MED_PATTERNS,
    units: { cholToMgdl: cholToMgdl, cholToMmol: cholToMmol, gluToMgdl: gluToMgdl, gluToMmol: gluToMmol, a1cToPct: a1cToPct, a1cToMmolMol: a1cToMmolMol, lbToKg: lbToKg, kgToLb: kgToLb, inToCm: inToCm, cmToIn: cmToIn, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn },
    bmi: bmi, bmiCategory: bmiCategory, waistCategory: waistCategory, whtr: whtr,
    paMinutes: paMinutes, le8Activity: le8Activity, le8Nicotine: le8Nicotine, le8Sleep: le8Sleep, le8Bmi: le8Bmi, le8Lipids: le8Lipids,
    le8Glucose: le8Glucose, le8GlucoseDetail: le8GlucoseDetail, le8Bp: le8Bp, le8Band: le8Band, le8Composite: le8Composite, le8FromInputs: le8FromInputs,
    dietPoints: dietPoints, dietScore: dietScore,
    bpAverage: bpAverage, bpLevel: bpLevel,
    findrisc: findrisc, findriscBand: findriscBand, findriscBandInfo: findriscBandInfo,
    phq2: phq2, phq9: phq9, phq9Band: phq9Band, gad2: gad2, gad7: gad7, gad7Band: gad7Band,
    auditc: auditc, stopbang: stopbang, tbScreen: tbScreen, fallsScreen: fallsScreen, infectionNeeds: infectionNeeds,
    medFlags: medFlags, saltSubstituteGate: saltSubstituteGate,
    buildContext: buildContext, rankActions: rankActions, bpBenefit: bpBenefit,
    suggestRecheckMonths: suggestRecheckMonths, addMonths: addMonths
  };
});

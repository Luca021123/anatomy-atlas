/* ==========================================================================
   Open Medical Toolkit — Clinician Toolkit
   Package C1a · Calculators: cardiology, thrombosis, renal, hepatology and
   anthropometrics.

   Declarative definitions rendered by MT.calc.render (schema: assets/js/core.js
   section 9) and listed automatically by clinician/tools/calculators.js at
   #/calculators/<id>.

   Rules followed in this file
   - compute(values) is pure: no DOM, no MT, no globals. Numbers arrive in the
     BASE unit, i.e. the first entry of `units` (factor 1).
   - Every coefficient, threshold and interpretation is cited in a comment next
     to the code and in the definition's `references`.
   - Deliberately omitted because not every coefficient/threshold could be
     verified against the publication: the AHA PREVENT equations (Khan 2023,
     coefficients only in the online supplement), the CKD-EPI 2012 cystatin-C-
     only equation, KDIGO monitoring-frequency numbers, and per-category PE
     prevalences for the simplified revised Geneva score.

   Unit conversions
     creatinine   1 mg/dL = 88.42 µmol/L        bilirubin    1 mg/dL = 17.1 µmol/L
     albumin      1 g/dL  = 10 g/L              cholesterol  1 mmol/L = 38.67 mg/dL
     urine ratio  1 mg/mmol = 8.84 mg/g (creatinine 113.12 g/mol; 1 mg/mg = 113.12 mg/mmol)
     weight       1 lb = 0.45359237 kg          length       1 in = 2.54 cm
   ========================================================================== */
(function (root, factory) {
  var defs = factory();
  if (typeof module === 'object' && module.exports) module.exports = defs;
  else root.MTCalcs = (root.MTCalcs || []).concat(defs);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------------
     0. Pure helpers
     ------------------------------------------------------------------------ */
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  /** Round half away from zero (same rule as MT.round). */
  function rnd(x, dp) { var f = Math.pow(10, dp || 0); return (x < 0 ? -1 : 1) * Math.round((Math.abs(x) + Number.EPSILON) * f) / f; }
  /** Fixed decimals as text: fx(1.5, 2) -> "1.50". */
  function fx(x, dp) { return rnd(x, dp || 0).toFixed(dp || 0); }
  /** Fixed decimals with trailing zeros trimmed: ft(1.50, 2) -> "1.5". */
  function ft(x, dp) { var s = fx(x, dp); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  /** Strip floating-point noise from unit-converted inputs before threshold comparisons (35 g/L -> 3.5 g/dL exactly). */
  function q(x) { return rnd(x, 6); }
  /** Sum points of ticked bool inputs and chosen radio/select options (mirrors MT.calc.sumPoints). */
  function points(inputs, v) {
    var t = 0;
    inputs.forEach(function (inp) {
      var x = v[inp.id];
      if (inp.type === 'bool' && x === true && inp.points) t += inp.points;
      if ((inp.type === 'radio' || inp.type === 'select') && x != null) {
        (inp.options || []).forEach(function (o) { if (String(o.value) === String(x) && o.points) t += o.points; });
      }
    });
    return t;
  }
  function female(v) { return v.sex === 'female'; }
  function ref(label, url) { return url ? { label: label, url: url } : { label: label }; }

  /* ------------------------------------------------------------------------
     1. Units and shared inputs (base unit first)
     ------------------------------------------------------------------------ */
  var CREAT_UNITS = [
    { id: 'mgdl', label: 'mg/dL', factor: 1, system: 'conv' },
    { id: 'umol', label: 'µmol/L', factor: 1 / 88.42, system: 'si' }      // 1 mg/dL = 88.42 µmol/L
  ];
  var BILI_UNITS = [
    { id: 'mgdl', label: 'mg/dL', factor: 1, system: 'conv' },
    { id: 'umol', label: 'µmol/L', factor: 1 / 17.1, system: 'si' }       // 1 mg/dL = 17.1 µmol/L
  ];
  var ALB_UNITS = [
    { id: 'gdl', label: 'g/dL', factor: 1, system: 'conv' },
    { id: 'gl', label: 'g/L', factor: 0.1, system: 'si' }                 // 10 g/L = 1 g/dL
  ];
  var CHOL_UNITS = [
    { id: 'mgdl', label: 'mg/dL', factor: 1, system: 'conv' },
    { id: 'mmol', label: 'mmol/L', factor: 38.67, system: 'si' }          // 1 mmol/L = 38.67 mg/dL
  ];
  var WEIGHT_UNITS = [
    { id: 'kg', label: 'kg', factor: 1, system: 'si' },
    { id: 'lb', label: 'lb', factor: 0.45359237, system: 'conv' }
  ];
  var LENGTH_UNITS = [
    { id: 'cm', label: 'cm', factor: 1, system: 'si' },
    { id: 'in', label: 'in', factor: 2.54, system: 'conv' }
  ];
  var MGG_PER_MGMMOL = 8.84; // 1 mmol creatinine = 113.12 mg -> 1 mg/mmol = 1000/113.12 = 8.84 mg/g
  var ACR_UNITS = [
    { id: 'mgmmol', label: 'mg/mmol', factor: 1, system: 'si' },
    { id: 'mgg', label: 'mg/g', factor: 1 / MGG_PER_MGMMOL, system: 'conv' }
  ];
  var RATIO_UNITS = ACR_UNITS.concat([{ id: 'mgmg', label: 'mg/mg (g/g)', factor: 1000 / MGG_PER_MGMMOL, system: 'conv' }]);

  function inSex(hint) { return { id: 'sex', label: 'Sex', type: 'radio', hint: hint, options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }] }; }
  function inAge(min, max, hint) { return { id: 'age', label: 'Age', type: 'number', unit: 'years', min: min, max: max, step: 1, hint: hint }; }
  function inCreat(hint) { return { id: 'creat', label: 'Serum creatinine', type: 'number', units: CREAT_UNITS, min: 0.1, max: 30, hint: hint }; }
  function inBili() { return { id: 'bili', label: 'Total bilirubin', type: 'number', units: BILI_UNITS, min: 0.1, max: 80 }; }
  function inAlb(hint) { return { id: 'alb', label: 'Serum albumin', type: 'number', units: ALB_UNITS, min: 0.5, max: 7, hint: hint }; }
  function inINR() { return { id: 'inr', label: 'INR', type: 'number', min: 0.5, max: 15, step: 0.1 }; }
  function inNa() { return { id: 'na', label: 'Serum sodium', type: 'number', unit: 'mmol/L', min: 100, max: 180 }; }
  function inWeight(min, max, hint) { return { id: 'weight', label: 'Weight', type: 'number', units: WEIGHT_UNITS, min: min, max: max, hint: hint }; }
  function inHeight(min, max, hint) { return { id: 'height', label: 'Height', type: 'number', units: LENGTH_UNITS, min: min, max: max, hint: hint }; }
  function inDialysis() { return { id: 'dialysis', type: 'bool', label: 'Dialysis in the past week', hint: 'At least 2 dialysis sessions, or 24 h of continuous veno-venous haemodialysis (CVVHD), in the past 7 days' }; }

  /* ------------------------------------------------------------------------
     2. References
     ------------------------------------------------------------------------ */
  var R = {
    esc2024af: ref('Van Gelder IC, Rienstra M, Bunting KV, et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45:3314–3414.', 'https://doi.org/10.1093/eurheartj/ehae176'),
    esc2020af: ref('Hindricks G, Potpara T, Dagres N, et al. 2020 ESC Guidelines for the diagnosis and management of atrial fibrillation. Eur Heart J 2021;42:373–498.', 'https://doi.org/10.1093/eurheartj/ehaa612'),
    lip2010: ref('Lip GYH, Nieuwlaat R, Pisters R, Lane DA, Crijns HJGM. Refining clinical risk stratification for predicting stroke and thromboembolism in atrial fibrillation (CHA₂DS₂-VASc): the Euro Heart Survey on Atrial Fibrillation. Chest 2010;137:263–272.', 'https://doi.org/10.1378/chest.09-1584'),
    friberg2012: ref('Friberg L, Rosenqvist M, Lip GYH. Evaluation of risk stratification schemes for ischaemic stroke and bleeding in 182 678 patients with atrial fibrillation: the Swedish Atrial Fibrillation cohort study. Eur Heart J 2012;33:1500–1510.', 'https://doi.org/10.1093/eurheartj/ehr488'),
    pisters2010: ref('Pisters R, Lane DA, Nieuwlaat R, de Vos CB, Crijns HJGM, Lip GYH. A novel user-friendly score (HAS-BLED) to assess 1-year risk of major bleeding in patients with atrial fibrillation: the Euro Heart Survey. Chest 2010;138:1093–1100.', 'https://doi.org/10.1378/chest.10-0134'),
    six2008: ref('Six AJ, Backus BE, Kelder JC. Chest pain in the emergency room: value of the HEART score. Neth Heart J 2008;16:191–196.', 'https://pubmed.ncbi.nlm.nih.gov/18665203/'),
    backus2013: ref('Backus BE, Six AJ, Kelder JC, et al. A prospective validation of the HEART score for chest pain patients at the emergency department. Int J Cardiol 2013;168:2153–2158.', 'https://pubmed.ncbi.nlm.nih.gov/23465250/'),
    antman2000: ref('Antman EM, Cohen M, Bernink PJLM, et al. The TIMI risk score for unstable angina/non-ST elevation MI: a method for prognostication and therapeutic decision making. JAMA 2000;284:835–842.', 'https://pubmed.ncbi.nlm.nih.gov/10938172/'),
    wells1997: ref('Wells PS, Anderson DR, Bormanis J, et al. Value of assessment of pretest probability of deep-vein thrombosis in clinical management. Lancet 1997;350:1795–1798.', 'https://doi.org/10.1016/S0140-6736(97)08140-3'),
    wells2003: ref('Wells PS, Anderson DR, Rodger M, et al. Evaluation of D-dimer in the diagnosis of suspected deep-vein thrombosis. N Engl J Med 2003;349:1227–1235.', 'https://doi.org/10.1056/NEJMoa023153'),
    wells2000: ref('Wells PS, Anderson DR, Rodger M, et al. Derivation of a simple clinical model to categorize patients’ probability of pulmonary embolism: increasing the model’s utility with the SimpliRED D-dimer. Thromb Haemost 2000;83:416–420.', 'https://pubmed.ncbi.nlm.nih.gov/10744147/'),
    vanbelle2006: ref('van Belle A, Büller HR, Huisman MV, et al. (Christopher Study Investigators). Effectiveness of managing suspected pulmonary embolism using an algorithm combining clinical probability, D-dimer testing, and computed tomography. JAMA 2006;295:172–179.', 'https://doi.org/10.1001/jama.295.2.172'),
    kline2004: ref('Kline JA, Mitchell AM, Kabrhel C, Richman PB, Courtney DM. Clinical criteria to prevent unnecessary diagnostic testing in emergency department patients with suspected pulmonary embolism. J Thromb Haemost 2004;2:1247–1255.', 'https://doi.org/10.1111/j.1538-7836.2004.00790.x'),
    kline2008: ref('Kline JA, Courtney DM, Kabrhel C, et al. Prospective multicenter evaluation of the pulmonary embolism rule-out criteria. J Thromb Haemost 2008;6:772–780.', 'https://doi.org/10.1111/j.1538-7836.2008.02944.x'),
    klok2008: ref('Klok FA, Mos ICM, Nijkeuter M, et al. Simplification of the revised Geneva score for assessing clinical probability of pulmonary embolism. Arch Intern Med 2008;168:2131–2136.', 'https://doi.org/10.1001/archinte.168.19.2131'),
    legal2006: ref('Le Gal G, Righini M, Roy PM, et al. Prediction of pulmonary embolism in the emergency department: the revised Geneva score. Ann Intern Med 2006;144:165–171.', 'https://pubmed.ncbi.nlm.nih.gov/16461960/'),
    esc2019pe: ref('Konstantinides SV, Meyer G, Becattini C, et al. 2019 ESC Guidelines for the diagnosis and management of acute pulmonary embolism. Eur Heart J 2020;41:543–603.', 'https://doi.org/10.1093/eurheartj/ehz405'),
    nice158: ref('NICE guideline NG158. Venous thromboembolic diseases: diagnosis, management and thrombophilia testing (2020, updated 2023).', 'https://www.nice.org.uk/guidance/ng158'),
    bazett1920: ref('Bazett HC. An analysis of the time-relations of electrocardiograms. Heart 1920;7:353–370.'),
    fridericia1920: ref('Fridericia LS. Die Systolendauer im Elektrokardiogramm bei normalen Menschen und bei Herzkranken. Acta Med Scand 1920;53:469–486.'),
    sagie1992: ref('Sagie A, Larson MG, Goldberg RJ, Bengtson JR, Levy D. An improved method for adjusting the QT interval for heart rate (the Framingham Heart Study). Am J Cardiol 1992;70:797–801.', 'https://pubmed.ncbi.nlm.nih.gov/1519533/'),
    hodges1983: ref('Hodges M, Salerno D, Erlien D. Bazett’s QT correction reviewed: evidence that a linear QT correction for heart rate is better. J Am Coll Cardiol 1983;1:694 (abstract).'),
    rautaharju2009: ref('Rautaharju PM, Surawicz B, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram, part IV: the ST segment, T and U waves, and the QT interval. Circulation 2009;119:e241–e250.', 'https://pubmed.ncbi.nlm.nih.gov/19228821/'),
    drew2010: ref('Drew BJ, Ackerman MJ, Funk M, et al. Prevention of torsade de pointes in hospital settings: a scientific statement from the AHA and ACCF. Circulation 2010;121:1047–1060.', 'https://doi.org/10.1161/CIRCULATIONAHA.109.192704'),
    vandenberk2016: ref('Vandenberk B, Vandael E, Robyns T, et al. Which QT correction formulae to use for QT monitoring? J Am Heart Assoc 2016;5:e003264.', 'https://doi.org/10.1161/JAHA.116.003264'),
    ssc2021: ref('Evans L, Rhodes A, Alhazzani W, et al. Surviving Sepsis Campaign: international guidelines for management of sepsis and septic shock 2021. Intensive Care Med 2021;47:1181–1247.', 'https://pubmed.ncbi.nlm.nih.gov/34599691/'),
    dagostino2008: ref('D’Agostino RB Sr, Vasan RS, Pencina MJ, et al. General cardiovascular risk profile for use in primary care: the Framingham Heart Study. Circulation 2008;117:743–753.', 'https://doi.org/10.1161/CIRCULATIONAHA.107.699579'),
    ccs2021: ref('Pearson GJ, Thanassoulis G, Anderson TJ, et al. 2021 Canadian Cardiovascular Society guidelines for the management of dyslipidemia for the prevention of cardiovascular disease in adults. Can J Cardiol 2021;37:1129–1150.', 'https://doi.org/10.1016/j.cjca.2021.03.016'),
    inker2021: ref('Inker LA, Eneanya ND, Coresh J, et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749.', 'https://doi.org/10.1056/NEJMoa2102953'),
    delgado2022: ref('Delgado C, Baweja M, Crews DC, et al. A unifying approach for GFR estimation: recommendations of the NKF-ASN Task Force on reassessing the inclusion of race in diagnosing kidney disease. Am J Kidney Dis 2022;79:268–288.', 'https://pubmed.ncbi.nlm.nih.gov/34563581/'),
    kdigo2024: ref('KDIGO CKD Work Group. KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease. Kidney Int 2024;105(4S):S117–S314.', 'https://pubmed.ncbi.nlm.nih.gov/38490803/'),
    kdigo2012: ref('KDIGO CKD Work Group. KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease. Kidney Int Suppl 2013;3:1–150 (Table 7: albuminuria and proteinuria categories).'),
    cg1976: ref('Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron 1976;16:31–41.', 'https://pubmed.ncbi.nlm.nih.gov/1244564/'),
    winter2012: ref('Winter MA, Guhr KN, Berg GM. Impact of various body weights and serum creatinine concentrations on the bias and accuracy of the Cockcroft-Gault equation. Pharmacotherapy 2012;32:604–612.', 'https://doi.org/10.1002/j.1875-9114.2012.01098.x'),
    devine1974: ref('Devine BJ. Gentamicin therapy. Drug Intell Clin Pharm 1974;8:650–655.'),
    bauer1983: ref('Bauer LA, Edwards WA, Dellinger EP, Simonowitz DA. Influence of weight on aminoglycoside pharmacokinetics in normal weight and morbidly obese patients. Eur J Clin Pharmacol 1983;24:643–647.', 'https://pubmed.ncbi.nlm.nih.gov/6873144/'),
    pugh1973: ref('Pugh RNH, Murray-Lyon IM, Dawson JL, Pietroni MC, Williams R. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg 1973;60:646–649.', 'https://pubmed.ncbi.nlm.nih.gov/4541913/'),
    fda2003: ref('US FDA. Guidance for Industry — Pharmacokinetics in patients with impaired hepatic function: study design, data analysis, and impact on dosing and labeling (2003).'),
    kamath2001: ref('Kamath PS, Wiesner RH, Malinchoc M, et al. A model to predict survival in patients with end-stage liver disease. Hepatology 2001;33:464–470.', 'https://pubmed.ncbi.nlm.nih.gov/11172350/'),
    wiesner2003: ref('Wiesner R, Edwards E, Freeman R, et al. Model for end-stage liver disease (MELD) and allocation of donor livers. Gastroenterology 2003;124:91–96.', 'https://pubmed.ncbi.nlm.nih.gov/12512033/'),
    kim2008: ref('Kim WR, Biggins SW, Kremers WK, et al. Hyponatremia and mortality among patients on the liver-transplant waiting list. N Engl J Med 2008;359:1018–1026.', 'https://doi.org/10.1056/NEJMoa0801209'),
    kim2021: ref('Kim WR, Mannalithara A, Heimbach JK, et al. MELD 3.0: the Model for End-Stage Liver Disease updated for the modern era. Gastroenterology 2021;161:1887–1895.', 'https://doi.org/10.1053/j.gastro.2021.08.050'),
    optn: ref('OPTN Policy 9: Allocation of livers and liver-intestines (MELD with the 2016 sodium term; MELD 3.0 from July 2023).', 'https://optn.transplant.hrsa.gov/policies-bylaws/policies/'),
    martin2014: ref('Martin P, DiMartini A, Feng S, Brown R, Fallon M. Evaluation for liver transplantation in adults: 2013 practice guideline by AASLD and the American Society of Transplantation. Hepatology 2014;59:1144–1165.', 'https://doi.org/10.1002/hep.26972'),
    sterling2006: ref('Sterling RK, Lissen E, Clumeck N, et al. Development of a simple noninvasive index to predict significant fibrosis in patients with HIV/HCV coinfection. Hepatology 2006;43:1317–1325.', 'https://pubmed.ncbi.nlm.nih.gov/16729309/'),
    shah2009: ref('Shah AG, Lydecker A, Murray K, et al. Comparison of noninvasive markers of fibrosis in patients with nonalcoholic fatty liver disease. Clin Gastroenterol Hepatol 2009;7:1104–1112.', 'https://doi.org/10.1016/j.cgh.2009.05.033'),
    mcpherson2017: ref('McPherson S, Hardy T, Dufour JF, et al. Age as a confounding factor for the accurate non-invasive diagnosis of advanced NAFLD fibrosis. Am J Gastroenterol 2017;112:740–751.', 'https://pubmed.ncbi.nlm.nih.gov/27725647/'),
    easl2024: ref('EASL–EASD–EASO Clinical Practice Guidelines on the management of metabolic dysfunction-associated steatotic liver disease (MASLD). J Hepatol 2024;81:492–542.', 'https://pubmed.ncbi.nlm.nih.gov/38851997/'),
    rinella2023: ref('Rinella ME, Neuschwander-Tetri BA, Siddiqui MS, et al. AASLD Practice Guidance on the clinical assessment and management of nonalcoholic fatty liver disease. Hepatology 2023;77:1797–1835.', 'https://pubmed.ncbi.nlm.nih.gov/36727674/'),
    wai2003: ref('Wai CT, Greenson JK, Fontana RJ, et al. A simple noninvasive index can predict both significant fibrosis and cirrhosis in patients with chronic hepatitis C. Hepatology 2003;38:518–526.', 'https://doi.org/10.1053/jhep.2003.50346'),
    who2014hcv: ref('World Health Organization. Guidelines for the screening, care and treatment of persons with hepatitis C infection. Geneva: WHO; 2014.'),
    who2015hbv: ref('World Health Organization. Guidelines for the prevention, care and treatment of persons with chronic hepatitis B infection. Geneva: WHO; 2015.'),
    who2000: ref('World Health Organization. Obesity: preventing and managing the global epidemic. Report of a WHO consultation. WHO Technical Report Series 894. Geneva: WHO; 2000.'),
    who2004: ref('WHO Expert Consultation. Appropriate body-mass index for Asian populations and its implications for policy and intervention strategies. Lancet 2004;363:157–163.', 'https://doi.org/10.1016/S0140-6736(03)15268-3'),
    nice189: ref('NICE CG189. Obesity: identification, assessment and management (September 2022 update: ethnicity-specific BMI thresholds and waist-to-height ratio).', 'https://www.nice.org.uk/guidance/cg189'),
    mosteller1987: ref('Mosteller RD. Simplified calculation of body-surface area. N Engl J Med 1987;317:1098.', 'https://doi.org/10.1056/NEJM198710223171717'),
    dubois1916: ref('Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if height and weight be known. Arch Intern Med 1916;17:863–871.'),
    janma2005: ref('Janmahasatian S, Duffull SB, Ash S, et al. Quantification of lean bodyweight. Clin Pharmacokinet 2005;44:1051–1065.', 'https://doi.org/10.2165/00003088-200544100-00004'),
    ardsnet2000: ref('ARDS Network. Ventilation with lower tidal volumes as compared with traditional tidal volumes for acute lung injury and ARDS. N Engl J Med 2000;342:1301–1308.', 'https://doi.org/10.1056/NEJM200005043421801')
  };

  /* ------------------------------------------------------------------------
     3. Cardiology — AF stroke and bleeding risk
     ------------------------------------------------------------------------ */
  var AF_NOTE = { type: 'note', text: 'For atrial fibrillation or flutter. Not for patients with a mechanical heart valve or moderate–severe mitral stenosis: they need a vitamin K antagonist whatever the score.' };
  var AGE_AF = { id: 'age', label: 'Age', type: 'radio', options: [
    { value: 'lt65', label: 'Under 65 years', points: 0 },
    { value: '65to74', label: '65–74 years', points: 1 },
    { value: 'ge75', label: '75 years or older', points: 2 }] };

  // CHA2DS2-VA: 2024 ESC AF guideline, Table "CHA2DS2-VA" (definitions as listed there).
  var IN_VA = [
    AF_NOTE,
    { id: 'chf', type: 'bool', points: 1, label: 'Chronic heart failure', hint: 'Symptoms and signs of heart failure at any LVEF, or asymptomatic LVEF ≤40%' },
    { id: 'htn', type: 'bool', points: 1, label: 'Hypertension', hint: 'Resting BP >140/90 mmHg on at least two occasions, or current antihypertensive treatment' },
    AGE_AF,
    { id: 'dm', type: 'bool', points: 1, label: 'Diabetes mellitus', hint: 'Type 1 or type 2, or treatment with glucose-lowering therapy' },
    { id: 'stroke', type: 'bool', points: 2, label: 'Prior stroke, TIA or arterial thromboembolism' },
    { id: 'vasc', type: 'bool', points: 1, label: 'Vascular disease', hint: 'Coronary artery disease (prior MI, angina, coronary revascularisation, significant CAD on angiography or imaging) or peripheral vascular disease (claudication, revascularisation, aortic intervention, complex aortic plaque)' }
  ];
  // CHA2DS2-VASc: Lip 2010 (Chest), with the original item definitions.
  var IN_VASC = [
    AF_NOTE,
    { id: 'chf', type: 'bool', points: 1, label: 'Congestive heart failure / LV dysfunction', hint: 'Clinical heart failure or objective evidence of moderate–severe LV systolic dysfunction' },
    { id: 'htn', type: 'bool', points: 1, label: 'Hypertension' },
    AGE_AF,
    { id: 'dm', type: 'bool', points: 1, label: 'Diabetes mellitus' },
    { id: 'stroke', type: 'bool', points: 2, label: 'Prior stroke, TIA or thromboembolism' },
    { id: 'vasc', type: 'bool', points: 1, label: 'Vascular disease', hint: 'Prior myocardial infarction, peripheral arterial disease or aortic plaque' },
    { id: 'sex', type: 'radio', label: 'Sex category', options: [{ value: 'male', label: 'Male', points: 0 }, { value: 'female', label: 'Female', points: 1 }] }
  ];
  // Friberg 2012, Swedish AF cohort: annual ischaemic stroke rate (%/year) by CHA2DS2-VASc score
  // in 90 490 patients never on oral anticoagulants (scores 0–9).
  var FRIBERG_STROKE = [0.2, 0.6, 2.2, 3.2, 4.8, 7.2, 9.7, 11.2, 10.8, 12.2];

  /** 2024 ESC thresholds applied to a CHA2DS2-VA (or VASc-minus-sex) score. */
  function esc2024(va) {
    // 2024 ESC AF guideline: CHA2DS2-VA >=2 -> OAC recommended (class I);
    // =1 -> OAC should be considered (class IIa); DOAC preferred over VKA except
    // mechanical valve / moderate-severe mitral stenosis (class I).
    if (va >= 2) return { band: 'danger', title: 'Elevated risk — oral anticoagulation recommended', text: 'A CHA₂DS₂-VA score of 2 or more indicates elevated thromboembolic risk: oral anticoagulation is recommended (2024 ESC, class I), with a DOAC in preference to a vitamin K antagonist. Treat modifiable bleeding risk factors, but do not withhold anticoagulation because of a bleeding score alone.' };
    if (va === 1) return { band: 'warn', title: 'Elevated risk — consider oral anticoagulation', text: 'A CHA₂DS₂-VA score of 1 indicates elevated thromboembolic risk: oral anticoagulation should be considered (2024 ESC, class IIa), preferably a DOAC, through shared decision-making after addressing modifiable bleeding risk factors.' };
    return { band: 'ok', title: 'Low thromboembolic risk', text: 'Oral anticoagulation is not indicated on the basis of the score. Re-assess stroke risk at follow-up visits: age and new comorbidities change the score.' };
  }

  var defCha2ds2va = {
    id: 'cha2ds2va',
    name: 'CHA₂DS₂-VA score (2024 ESC)',
    category: 'Cardiology',
    summary: 'Sex-neutral stroke-risk score for atrial fibrillation with the 2024 ESC thresholds for oral anticoagulation.',
    keywords: ['atrial fibrillation', 'af', 'afib', 'flutter', 'stroke', 'anticoagulation', 'doac', 'cha2ds2-va', 'chads', 'esc 2024', 'thromboembolism'],
    inputs: IN_VA,
    compute: function (v) {
      var s = points(IN_VA, v), e = esc2024(s);
      return {
        value: String(s), unit: 'points', label: 'CHA₂DS₂-VA score (0–8)', band: e.band, title: e.title,
        interpretation: e.text,
        details: [
          { label: 'Scale', value: '0–8 (age ≥75 and prior stroke/TIA score 2)' },
          'Equivalent to the earlier sex-specific CHA₂DS₂-VASc thresholds (≥2 in men / ≥3 in women; 1 in men / 2 in women), because female sex is no longer counted.'
        ],
        warnings: []
      };
    },
    formula: 'C  Chronic heart failure (any LVEF) or asymptomatic LVEF ≤40%   +1\nH  Hypertension   +1\nA₂ Age ≥75 years   +2\nD  Diabetes mellitus   +1\nS₂ Prior stroke, TIA or arterial thromboembolism   +2\nV  Vascular disease (CAD, PAD, complex aortic plaque)   +1\nA  Age 65–74 years   +1\n\n2024 ESC: score ≥2 → OAC recommended (class I); score 1 → OAC should be considered (class IIa).',
    pearls: [
      'The 2024 ESC guideline dropped female sex (the “Sc” of CHA₂DS₂-VASc): it modifies risk with age rather than adding risk on its own, and leaving it out gives one threshold for everyone.',
      'Oral anticoagulation is recommended in AF with hypertrophic cardiomyopathy or cardiac amyloidosis regardless of the score (2024 ESC).',
      'Mechanical heart valves and moderate–severe mitral stenosis are outside the score: use a vitamin K antagonist, not a DOAC.',
      'Antiplatelet therapy is not an alternative to anticoagulation for stroke prevention in AF.',
      'Use bleeding-risk scores (e.g. HAS-BLED) to find and treat modifiable bleeding risk factors, not to decide whether to start or stop anticoagulation (2024 ESC, class III).',
      'Risk is dynamic: recalculate at follow-up visits, after hospital admissions and on each birthday that crosses 65 or 75.'
    ],
    references: [R.esc2024af, R.lip2010]
  };

  var defCha2ds2vasc = {
    id: 'cha2ds2vasc',
    name: 'CHA₂DS₂-VASc score (legacy)',
    category: 'Cardiology',
    summary: 'Classic AF stroke-risk score including female sex, with untreated stroke rates and the 2024 ESC thresholds via the CHA₂DS₂-VA equivalent.',
    keywords: ['atrial fibrillation', 'af', 'afib', 'stroke', 'anticoagulation', 'cha2ds2-vasc', 'chads2', 'vasc', 'warfarin', 'doac'],
    inputs: IN_VASC,
    compute: function (v) {
      var s = points(IN_VASC, v);
      var va = s - (female(v) ? 1 : 0);
      var e = esc2024(va);
      var text = e.text;
      if (female(v) && s === 1) text = 'Female sex is the only risk factor: this is low risk (equivalent CHA₂DS₂-VA 0). ' + text;
      return {
        value: String(s), unit: 'points', label: 'CHA₂DS₂-VASc score (0–9)', band: e.band, title: e.title,
        interpretation: text,
        details: [
          { label: 'CHA₂DS₂-VA equivalent (2024 ESC)', value: String(va) },
          { label: 'Ischaemic stroke without anticoagulation', value: '≈ ' + ft(FRIBERG_STROKE[s], 1) + '% per year' },
          'Stroke rate: Swedish AF cohort, patients never on anticoagulants (Friberg 2012); rates differ between populations and eras.'
        ],
        warnings: []
      };
    },
    formula: 'C  Congestive heart failure / LV dysfunction   +1\nH  Hypertension   +1\nA₂ Age ≥75   +2\nD  Diabetes   +1\nS₂ Stroke / TIA / thromboembolism   +2\nV  Vascular disease (prior MI, PAD, aortic plaque)   +1\nA  Age 65–74   +1\nSc Sex category: female   +1\n\nCHA₂DS₂-VA equivalent = CHA₂DS₂-VASc − 1 for women. The 2020 ESC thresholds (≥2 men / ≥3 women: recommend OAC; 1 man / 2 women: consider) equal the 2024 ESC CHA₂DS₂-VA thresholds (≥2 / 1).',
    pearls: [
      'Prefer the sex-neutral CHA₂DS₂-VA score (2024 ESC); this version is kept for comparison with older records and studies.',
      'Female sex is a risk modifier, not a stand-alone risk factor: a woman whose only point is sex is low risk.',
      'Event rates are cohort averages (Swedish registry 2005–2008) and include patients with very different absolute risk; use them to inform, not replace, shared decisions.',
      'Mechanical valves, moderate–severe mitral stenosis, hypertrophic cardiomyopathy and cardiac amyloidosis are decided outside the score.'
    ],
    references: [R.lip2010, R.friberg2012, R.esc2024af, R.esc2020af]
  };

  // HAS-BLED: Pisters 2010 definitions; major bleeds per 100 patient-years by score (Euro Heart Survey).
  var IN_HASBLED = [
    { type: 'note', text: 'For patients with AF taking, or being considered for, oral anticoagulation.' },
    { id: 'h', type: 'bool', points: 1, label: 'Hypertension, uncontrolled', hint: 'Systolic BP >160 mmHg' },
    { id: 'renal', type: 'bool', points: 1, label: 'Abnormal renal function', hint: 'Chronic dialysis, renal transplant, or serum creatinine ≥200 µmol/L (≥2.26 mg/dL)' },
    { id: 'liver', type: 'bool', points: 1, label: 'Abnormal liver function', hint: 'Chronic liver disease (e.g. cirrhosis) or bilirubin >2× ULN with AST/ALT/ALP >3× ULN' },
    { id: 'stroke', type: 'bool', points: 1, label: 'Stroke (history)' },
    { id: 'bleed', type: 'bool', points: 1, label: 'Bleeding history or predisposition', hint: 'Previous major bleeding, anaemia or a bleeding diathesis' },
    { id: 'inr', type: 'bool', points: 1, label: 'Labile INR', hint: 'Unstable or high INRs, or time in therapeutic range <60% — only applies to patients on a vitamin K antagonist' },
    { id: 'elderly', type: 'bool', points: 1, label: 'Elderly: age over 65 years' },
    { id: 'drugs', type: 'bool', points: 1, label: 'Drugs: antiplatelet agents or NSAIDs' },
    { id: 'alcohol', type: 'bool', points: 1, label: 'Alcohol: 8 or more drinks a week' }
  ];
  var HASBLED_RATE = [1.13, 1.02, 1.88, 3.74, 8.70]; // Pisters 2010, scores 0–4 (bleeds/100 patient-years)

  var defHasbled = {
    id: 'has-bled',
    name: 'HAS-BLED bleeding risk',
    category: 'Cardiology',
    summary: 'One-year major bleeding risk on anticoagulation in atrial fibrillation, used to find modifiable bleeding risk factors.',
    keywords: ['bleeding', 'anticoagulation', 'atrial fibrillation', 'af', 'warfarin', 'doac', 'has-bled', 'hasbled'],
    inputs: IN_HASBLED,
    compute: function (v) {
      var s = points(IN_HASBLED, v);
      var high = s >= 3;
      var details = [{ label: 'Major bleeding in derivation cohort', value: s <= 4 ? ft(HASBLED_RATE[s], 2) + ' per 100 patient-years' : 'too few patients scored ≥5 for a reliable rate (risk is high)' }];
      var modifiable = [];
      if (v.h) modifiable.push('uncontrolled blood pressure');
      if (v.inr) modifiable.push('labile INR (consider a DOAC or improve INR control)');
      if (v.drugs) modifiable.push('antiplatelet/NSAID use');
      if (v.alcohol) modifiable.push('alcohol excess');
      if (modifiable.length) details.push({ label: 'Modifiable factors present', value: modifiable.join('; ') });
      return {
        value: String(s), unit: 'points', label: 'HAS-BLED score (0–9)',
        band: high ? 'warn' : 'ok',
        title: high ? 'High bleeding risk (score ≥3)' : 'Bleeding risk not high (score <3)',
        interpretation: high
          ? 'Score ≥3 flags high bleeding risk: correct modifiable factors and review the patient earlier and more often. A high score alone is not a reason to withhold anticoagulation (2024 ESC).'
          : 'Bleeding risk is not high. Still correct any modifiable factor and re-assess at follow-up.',
        details: details,
        warnings: []
      };
    },
    formula: 'One point each: H uncontrolled hypertension (SBP >160) · A abnormal renal and/or liver function (1 each) · S stroke · B bleeding history/predisposition · L labile INR · E elderly (>65) · D drugs (antiplatelets, NSAIDs) and/or alcohol ≥8 drinks/week (1 each).\nMajor bleeds per 100 patient-years (Pisters 2010): 0 → 1.13, 1 → 1.02, 2 → 1.88, 3 → 3.74, 4 → 8.70.',
    pearls: [
      'The score’s main job is to highlight modifiable risks: blood pressure, labile INR, concomitant antiplatelets/NSAIDs and alcohol.',
      'Using bleeding-risk scores to decide whether to start or stop anticoagulation is not recommended (2024 ESC, class III); net clinical benefit usually favours anticoagulation.',
      'The “L” item applies only to patients on a vitamin K antagonist.',
      'Derived in the Euro Heart Survey (3,978 patients; 53 major bleeds in 1 year), so estimates for higher scores are imprecise.'
    ],
    references: [R.pisters2010, R.esc2024af]
  };

  /* ------------------------------------------------------------------------
     4. Cardiology — chest pain / ACS
     ------------------------------------------------------------------------ */
  // HEART: Six 2008; MACE at 6 weeks by group from Backus 2013 prospective validation (n = 2388).
  var IN_HEART = [
    { type: 'note', text: 'For adults with undifferentiated chest pain in the emergency department. Not for STEMI or haemodynamically unstable patients.' },
    { id: 'history', label: 'History', type: 'radio', options: [
      { value: 0, label: 'Slightly suspicious', points: 0 },
      { value: 1, label: 'Moderately suspicious', points: 1 },
      { value: 2, label: 'Highly suspicious', points: 2 }] },
    { id: 'ecg', label: 'ECG', type: 'radio', options: [
      { value: 0, label: 'Normal', points: 0 },
      { value: 1, label: 'Non-specific repolarisation disturbance', hint: 'e.g. LBBB, pacing, LVH, repolarisation changes from digoxin', points: 1 },
      { value: 2, label: 'Significant ST deviation', hint: 'ST depression or elevation not explained by LBBB, LVH or digoxin', points: 2 }] },
    { id: 'agecat', label: 'Age', type: 'radio', options: [
      { value: 0, label: 'Under 45 years', points: 0 },
      { value: 1, label: '45–64 years', points: 1 },
      { value: 2, label: '65 years or older', points: 2 }] },
    { id: 'risk', label: 'Risk factors', type: 'radio', hint: 'Hypercholesterolaemia, hypertension, diabetes, current or recent (<3 months) smoking, family history of premature CVD, obesity (BMI >30)', options: [
      { value: 0, label: 'No known risk factors', points: 0 },
      { value: 1, label: '1–2 risk factors', points: 1 },
      { value: 2, label: '3 or more risk factors, or known atherosclerotic disease', hint: 'Prior MI, PCI/CABG, stroke/TIA or peripheral arterial disease', points: 2 }] },
    { id: 'trop', label: 'Initial troponin', type: 'radio', hint: 'Relative to the assay’s normal limit (99th percentile upper reference limit)', options: [
      { value: 0, label: 'At or below the normal limit', points: 0 },
      { value: 1, label: '1–3 × the normal limit', points: 1 },
      { value: 2, label: 'More than 3 × the normal limit', points: 2 }] }
  ];

  var defHeart = {
    id: 'heart-score',
    name: 'HEART score for chest pain',
    category: 'Cardiology',
    summary: 'Six-week risk of major adverse cardiac events in emergency-department chest pain.',
    keywords: ['chest pain', 'acs', 'mace', 'troponin', 'heart score', 'emergency', 'acute coronary syndrome', 'discharge'],
    inputs: IN_HEART,
    compute: function (v) {
      var s = points(IN_HEART, v);
      var r;
      // Backus 2013: MACE within 6 weeks 1.7% (0–3), 16.6% (4–6), 50.1% (7–10).
      if (s <= 3) r = { band: 'ok', title: 'Low risk (0–3)', mace: '1.7%', text: 'Low risk: in the prospective validation 1.7% had a major adverse cardiac event within 6 weeks. Consider early discharge with outpatient follow-up when serial troponin testing under your local chest-pain pathway is negative.' };
      else if (s <= 6) r = { band: 'warn', title: 'Intermediate risk (4–6)', mace: '16.6%', text: 'Intermediate risk (16.6% MACE at 6 weeks): observe with serial troponins and arrange further ischaemia evaluation according to local pathway.' };
      else r = { band: 'danger', title: 'High risk (7–10)', mace: '50.1%', text: 'High risk (50.1% MACE at 6 weeks): treat as possible acute coronary syndrome and seek early cardiology review for invasive assessment.' };
      return {
        value: String(s), unit: 'points', label: 'HEART score (0–10)', band: r.band, title: r.title,
        interpretation: r.text,
        details: [{ label: 'MACE within 6 weeks (Backus 2013)', value: r.mace }, 'MACE = acute MI, PCI, CABG or death.'],
        warnings: []
      };
    },
    formula: 'History 0–2 · ECG 0–2 · Age (<45 = 0, 45–64 = 1, ≥65 = 2) · Risk factors (none = 0, 1–2 = 1, ≥3 or atherosclerotic disease = 2) · Troponin (≤ normal limit = 0, 1–3× = 1, >3× = 2).\nGroups (Backus 2013, MACE at 6 weeks): 0–3 low 1.7%; 4–6 intermediate 16.6%; 7–10 high 50.1%.',
    pearls: [
      'A low score never overrides an abnormal ECG or rising troponin: follow your high-sensitivity troponin pathway.',
      'The history element is subjective: score typical features (pressure-like pain, radiation, exertional, relief with nitrates) as more suspicious.',
      'Derived (Six 2008) and validated (Backus 2013) in Dutch emergency departments; MACE was a composite of MI, revascularisation and death.'
    ],
    references: [R.six2008, R.backus2013]
  };

  // TIMI UA/NSTEMI: Antman 2000, 14-day all-cause death, new/recurrent MI or severe recurrent ischaemia needing urgent revascularisation.
  var IN_TIMI = [
    { id: 'age65', type: 'bool', points: 1, label: 'Age 65 years or older' },
    { id: 'rf3', type: 'bool', points: 1, label: 'At least 3 coronary risk factors', hint: 'Family history of CAD, hypertension, hypercholesterolaemia, diabetes, current smoking' },
    { id: 'cad', type: 'bool', points: 1, label: 'Known coronary stenosis ≥50%' },
    { id: 'asa', type: 'bool', points: 1, label: 'Aspirin use in the past 7 days' },
    { id: 'angina', type: 'bool', points: 1, label: 'Severe angina: 2 or more episodes in the past 24 hours' },
    { id: 'st', type: 'bool', points: 1, label: 'ST deviation ≥0.5 mm on the presenting ECG' },
    { id: 'marker', type: 'bool', points: 1, label: 'Raised cardiac biomarkers (troponin or CK-MB)' }
  ];
  var TIMI_RATE = [4.7, 4.7, 8.3, 13.2, 19.9, 26.2, 40.9, 40.9]; // Antman 2000 (TIMI 11B), scores 0/1 … 6/7

  var defTimi = {
    id: 'timi-ua-nstemi',
    name: 'TIMI risk score for UA/NSTEMI',
    category: 'Cardiology',
    summary: 'Fourteen-day risk of death, MI or urgent revascularisation in unstable angina or NSTEMI.',
    keywords: ['acs', 'nstemi', 'unstable angina', 'timi', 'chest pain', 'risk', 'nste-acs'],
    inputs: IN_TIMI,
    compute: function (v) {
      var s = points(IN_TIMI, v), rate = TIMI_RATE[s];
      var band = s <= 2 ? 'ok' : s <= 4 ? 'warn' : 'danger';
      return {
        value: String(s), unit: 'points', label: 'TIMI risk score (0–7)', band: band,
        title: rate + '% risk at 14 days',
        interpretation: 'In TIMI 11B, ' + rate + '% of patients with this score died, had a new or recurrent MI, or needed urgent revascularisation for severe recurrent ischaemia within 14 days. Higher scores identified patients who gained more from intensified antithrombotic therapy and an early invasive approach.',
        details: [{ label: 'Event rates by score', value: '0–1: 4.7% · 2: 8.3% · 3: 13.2% · 4: 19.9% · 5: 26.2% · 6–7: 40.9%' }],
        warnings: []
      };
    },
    formula: 'One point each for: age ≥65; ≥3 CAD risk factors; known stenosis ≥50%; aspirin in past 7 days; ≥2 anginal episodes in 24 h; ST deviation ≥0.5 mm; raised cardiac markers.\n14-day composite event rate (Antman 2000): 0–1 → 4.7%, 2 → 8.3%, 3 → 13.2%, 4 → 19.9%, 5 → 26.2%, 6–7 → 40.9%.',
    pearls: [
      'Derived in 2000 from trial patients treated with heparin or enoxaparin; absolute event rates with contemporary therapy are lower.',
      'ESC guidelines prefer the GRACE score for prognosis in NSTE-ACS; TIMI remains a quick bedside summary.',
      'Not for STEMI (there is a separate TIMI score for STEMI).'
    ],
    references: [R.antman2000]
  };

  /* ------------------------------------------------------------------------
     5. Thrombosis — DVT / PE
     ------------------------------------------------------------------------ */
  // Wells DVT, modified version with "previously documented DVT" (Wells 2003 NEJM), as used by NICE NG158.
  var IN_WDVT = [
    { id: 'cancer', type: 'bool', points: 1, label: 'Active cancer', hint: 'Treatment ongoing, within the previous 6 months, or palliative' },
    { id: 'paralysis', type: 'bool', points: 1, label: 'Paralysis, paresis or recent plaster immobilisation of a leg' },
    { id: 'bedridden', type: 'bool', points: 1, label: 'Recently bedridden ≥3 days, or major surgery within 12 weeks', hint: 'Surgery requiring general or regional anaesthesia' },
    { id: 'tender', type: 'bool', points: 1, label: 'Localised tenderness along the deep venous system' },
    { id: 'swollen', type: 'bool', points: 1, label: 'Entire leg swollen' },
    { id: 'calf', type: 'bool', points: 1, label: 'Calf swelling ≥3 cm larger than the other side', hint: 'Measured 10 cm below the tibial tuberosity' },
    { id: 'pitting', type: 'bool', points: 1, label: 'Pitting oedema confined to the symptomatic leg' },
    { id: 'collateral', type: 'bool', points: 1, label: 'Collateral superficial veins (non-varicose)' },
    { id: 'prevdvt', type: 'bool', points: 1, label: 'Previously documented DVT' },
    { id: 'alt', type: 'bool', points: -2, label: 'An alternative diagnosis is at least as likely as DVT' }
  ];

  var defWellsDvt = {
    id: 'wells-dvt',
    name: 'Wells score for DVT',
    category: 'Thrombosis',
    summary: 'Pre-test probability of deep-vein thrombosis, two-level (NICE) and three-level interpretations.',
    keywords: ['dvt', 'deep vein thrombosis', 'wells', 'd-dimer', 'leg swelling', 'vte', 'ultrasound', 'thrombosis'],
    inputs: IN_WDVT,
    compute: function (v) {
      var s = points(IN_WDVT, v);
      var likely = s >= 2; // Wells 2003 / NICE NG158: likely ≥2, unlikely ≤1
      // Wells 1997 three-level model: ≤0 low (3%), 1–2 moderate (17%), ≥3 high (75%).
      var three = s <= 0 ? 'low (DVT in 3% in the 1997 cohort)' : s <= 2 ? 'moderate (17%)' : 'high (75%)';
      return {
        value: String(s), unit: 'points', label: 'Wells DVT score (−2 to 9)',
        band: likely ? (s >= 3 ? 'danger' : 'warn') : 'ok',
        title: likely ? 'DVT likely (score ≥2)' : 'DVT unlikely (score ≤1)',
        interpretation: likely
          ? 'NICE NG158: offer a proximal leg vein ultrasound within 4 hours (if it cannot be done in time: D-dimer, interim therapeutic anticoagulation and a scan within 24 hours). If the scan is negative, do a D-dimer; if that is positive, repeat the scan 6–8 days later.'
          : 'NICE NG158: offer a D-dimer with the result within 4 hours (or interim anticoagulation if delayed). If positive, arrange a proximal leg vein ultrasound within 4 hours (or within 24 hours with interim anticoagulation). A negative D-dimer makes DVT unlikely: consider other diagnoses.',
        details: [{ label: 'Three-level model (Wells 1997)', value: three }],
        warnings: []
      };
    },
    formula: 'One point each: active cancer; paralysis/paresis/plaster; bedridden ≥3 days or major surgery ≤12 weeks; localised deep-vein tenderness; entire leg swollen; calf swelling ≥3 cm; pitting oedema (symptomatic leg); collateral superficial veins; previously documented DVT.\nMinus 2: alternative diagnosis at least as likely.\nTwo-level (Wells 2003, NICE): ≥2 likely, ≤1 unlikely. Three-level (Wells 1997): ≤0 low, 1–2 moderate, ≥3 high.',
    pearls: [
      'Score the alternative diagnosis honestly: the −2 applies whenever another diagnosis is at least as likely as DVT.',
      'A negative D-dimer rules out DVT only in the “unlikely” group (Wells 2003: 0.4% VTE at 3 months after DVT was ruled out with the D-dimer strategy).',
      'D-dimer is often raised in pregnancy, cancer, after surgery and in older people; the Wells studies did not include pregnant women.',
      'The 3%/17%/75% figures come from the original nine-item 1997 score, before “previously documented DVT” was added.'
    ],
    references: [R.wells1997, R.wells2003, R.nice158]
  };

  // Wells PE: Wells 2000 Thromb Haemost (items and cut-offs from the abstract).
  var IN_WPE = [
    { id: 'dvtsigns', type: 'bool', points: 3, label: 'Clinical signs and symptoms of DVT', hint: 'At minimum leg swelling and pain on palpation of the deep veins' },
    { id: 'altless', type: 'bool', points: 3, label: 'PE is the most likely diagnosis', hint: 'An alternative diagnosis is less likely than PE' },
    { id: 'hr', type: 'bool', points: 1.5, label: 'Heart rate over 100/min' },
    { id: 'immob', type: 'bool', points: 1.5, label: 'Immobilisation ≥3 days or surgery in the previous 4 weeks' },
    { id: 'prev', type: 'bool', points: 1.5, label: 'Previous DVT or PE' },
    { id: 'haemoptysis', type: 'bool', points: 1, label: 'Haemoptysis' },
    { id: 'cancer', type: 'bool', points: 1, label: 'Malignancy', hint: 'On treatment, treated in the last 6 months, or palliative' }
  ];

  var defWellsPe = {
    id: 'wells-pe',
    name: 'Wells score for pulmonary embolism',
    category: 'Thrombosis',
    summary: 'Pre-test probability of PE with two-level (PE likely/unlikely) and three-level interpretations.',
    keywords: ['pe', 'pulmonary embolism', 'wells', 'd-dimer', 'ctpa', 'vte', 'dyspnoea', 'thrombosis'],
    inputs: IN_WPE,
    compute: function (v) {
      var s = points(IN_WPE, v);
      var likely = s > 4; // Wells 2000: PE likely >4, unlikely ≤4
      // Three-level (Wells 2000 derivation): <2 low 3.6%, 2–6 moderate 20.5%, >6 high 66.7%.
      var three = s < 2 ? 'low (PE in 3.6% in the derivation set)' : s <= 6 ? 'moderate (20.5%)' : 'high (66.7%)';
      return {
        value: ft(s, 1), unit: 'points', label: 'Wells PE score (0–12.5)',
        band: likely ? (s > 6 ? 'danger' : 'warn') : 'ok',
        title: likely ? 'PE likely (score >4)' : 'PE unlikely (score ≤4)',
        interpretation: likely
          ? 'NICE NG158: offer a CT pulmonary angiogram (CTPA) immediately, or interim therapeutic anticoagulation if CTPA cannot be done at once. If CTPA is negative and DVT is suspected, consider a proximal leg vein ultrasound.'
          : 'NICE NG158: offer a D-dimer with the result within 4 hours (interim anticoagulation if delayed). If positive, arrange CTPA; if negative, PE is unlikely — stop interim anticoagulation and consider other diagnoses. If suspicion is low (<15%), the PERC rule may avoid testing altogether.',
        details: [
          { label: 'Three-level model', value: three },
          { label: 'PE prevalence by two-level group', value: likely ? '37.1% (Christopher study)' : '7.8% (Wells 2000) to 12.1% (Christopher study)' },
          likely ? 'Do not use D-dimer to exclude PE in the “likely” group.' : '“Unlikely” plus a normal D-dimer: 0.5% VTE at 3 months without treatment (Christopher study).'
        ],
        warnings: []
      };
    },
    formula: 'Clinical signs of DVT 3 · PE most likely diagnosis 3 · Heart rate >100 1.5 · Immobilisation ≥3 days or surgery ≤4 weeks 1.5 · Previous DVT/PE 1.5 · Haemoptysis 1 · Malignancy 1.\nTwo-level: ≤4 PE unlikely, >4 PE likely. Three-level: <2 low, 2–6 moderate, >6 high (Wells 2000).',
    pearls: [
      '“PE is the most likely diagnosis” carries 3 points, so the score depends heavily on clinical gestalt.',
      'In the Christopher study 67% of patients were “PE unlikely”, and a normal D-dimer safely excluded PE in a third of all patients.',
      'Consider an age-adjusted D-dimer cut-off (age × 10 µg/L FEU above 50 years) where your laboratory and local pathway support it.',
      'Not validated in pregnancy; use pregnancy-specific pathways.'
    ],
    references: [R.wells2000, R.vanbelle2006, R.nice158, R.esc2019pe]
  };

  // PERC: Kline 2004 (derivation) and Kline 2008 (prospective multicentre validation).
  var IN_PERC = [
    { id: 'lowgestalt', type: 'bool', label: 'My overall clinical suspicion of PE is low (gestalt <15%)', hint: 'PERC is only valid in low-suspicion patients' },
    { type: 'heading', label: 'Tick any criterion that is PRESENT' },
    { id: 'age50', type: 'bool', points: 1, label: 'Age 50 years or older' },
    { id: 'hr100', type: 'bool', points: 1, label: 'Heart rate 100/min or more' },
    { id: 'sat', type: 'bool', points: 1, label: 'SpO₂ below 95% on room air' },
    { id: 'haemoptysis', type: 'bool', points: 1, label: 'Haemoptysis' },
    { id: 'oestrogen', type: 'bool', points: 1, label: 'Oestrogen use', hint: 'Oral contraceptives, hormone replacement or other oestrogen therapy' },
    { id: 'priorvte', type: 'bool', points: 1, label: 'Prior DVT or PE' },
    { id: 'legswelling', type: 'bool', points: 1, label: 'Unilateral leg swelling' },
    { id: 'surgery', type: 'bool', points: 1, label: 'Surgery or trauma requiring hospitalisation within the past 4 weeks' }
  ];

  var defPerc = {
    id: 'perc',
    name: 'PERC rule (pulmonary embolism rule-out criteria)',
    category: 'Thrombosis',
    summary: 'Rules out PE without a D-dimer in low-suspicion patients who meet all eight criteria.',
    keywords: ['pe', 'pulmonary embolism', 'perc', 'rule out', 'd-dimer', 'emergency', 'kline'],
    showPoints: false,
    inputs: IN_PERC,
    compute: function (v) {
      var n = points(IN_PERC, v);
      if (!v.lowgestalt) {
        return {
          value: null, label: 'PERC', band: 'info', title: 'PERC not applicable',
          interpretation: 'PERC may only be applied when overall clinical suspicion is low (gestalt <15%). Use the Wells or Geneva score with D-dimer or imaging instead.',
          details: [{ label: 'Criteria present', value: String(n) + ' of 8' }], warnings: []
        };
      }
      if (n === 0) {
        return {
          value: 'Negative', label: 'PERC', band: 'ok', title: 'PERC negative — PE ruled out without further testing',
          interpretation: 'Low suspicion and all eight criteria absent: no D-dimer or imaging is needed for PE. In the multicentre validation 1.0% (95% CI 0.6–1.6%) of such patients had VTE or died within 45 days.',
          details: [{ label: 'Criteria present', value: '0 of 8' }], warnings: []
        };
      }
      return {
        value: 'Positive', label: 'PERC', band: 'warn', title: 'PERC positive — cannot rule out with PERC',
        interpretation: n + (n === 1 ? ' criterion is' : ' criteria are') + ' present. Continue the work-up: Wells or simplified Geneva score, then D-dimer or imaging.',
        details: [{ label: 'Criteria present', value: n + ' of 8' }], warnings: []
      };
    },
    formula: 'Apply only if gestalt pre-test probability <15%. PERC-negative = all of: age <50; heart rate <100/min; SpO₂ ≥95% on room air; no haemoptysis; no oestrogen use; no prior DVT/PE; no unilateral leg swelling; no surgery or trauma requiring hospitalisation within 4 weeks.',
    pearls: [
      'PERC lowers the probability of PE below the testing threshold (≈1.8%) only when pre-test suspicion is already low.',
      'Do not use PERC where PE prevalence is high (it performed less well in European cohorts with ~20% prevalence) or in pregnancy.',
      'Kline 2008: low suspicion plus PERC-negative applied to about 20% of 8,138 emergency patients; sensitivity 97.4%, specificity 21.9%.'
    ],
    references: [R.kline2004, R.kline2008, R.nice158]
  };

  // Simplified revised Geneva: Klok 2008 (1 point per item of the revised Geneva score, Le Gal 2006);
  // cut-offs as tabulated in the 2019 ESC PE guideline: three-level 0–1 / 2–4 / ≥5; two-level ≤2 / ≥3.
  var IN_GENEVA = [
    { id: 'age65', type: 'bool', points: 1, label: 'Age over 65 years' },
    { id: 'prev', type: 'bool', points: 1, label: 'Previous DVT or PE' },
    { id: 'surgery', type: 'bool', points: 1, label: 'Surgery under general anaesthesia or lower-limb fracture within the past month' },
    { id: 'cancer', type: 'bool', points: 1, label: 'Active malignancy', hint: 'Solid or haematological; currently active or considered cured for less than 1 year' },
    { id: 'legpain', type: 'bool', points: 1, label: 'Unilateral lower-limb pain' },
    { id: 'haemoptysis', type: 'bool', points: 1, label: 'Haemoptysis' },
    { id: 'hr', label: 'Heart rate', type: 'radio', options: [
      { value: 'lt75', label: 'Below 75/min', points: 0 },
      { value: '75to94', label: '75–94/min', points: 1 },
      { value: 'ge95', label: '95/min or more', points: 2 }] },
    { id: 'palpation', type: 'bool', points: 1, label: 'Pain on deep venous palpation of the leg and unilateral oedema' }
  ];

  var defGeneva = {
    id: 'geneva-simplified',
    name: 'Simplified revised Geneva score (PE)',
    category: 'Thrombosis',
    summary: 'Objective pre-test probability of pulmonary embolism without a gestalt item.',
    keywords: ['pe', 'pulmonary embolism', 'geneva', 'revised geneva', 'd-dimer', 'ctpa', 'vte'],
    inputs: IN_GENEVA,
    compute: function (v) {
      var s = points(IN_GENEVA, v);
      var likely = s >= 3;
      var three = s <= 1 ? 'low (0–1)' : s <= 4 ? 'intermediate (2–4)' : 'high (≥5)';
      return {
        value: String(s), unit: 'points', label: 'Simplified revised Geneva (0–9)',
        band: likely ? (s >= 5 ? 'danger' : 'warn') : 'ok',
        title: likely ? 'PE likely (score ≥3)' : 'PE unlikely (score ≤2)',
        interpretation: likely
          ? 'PE likely: proceed to CT pulmonary angiography (D-dimer cannot exclude PE in this group). Start anticoagulation while waiting if imaging is delayed and bleeding risk allows.'
          : 'PE unlikely: measure a highly sensitive D-dimer; a normal result excludes PE. In Klok 2008 no patient with “PE unlikely” and a normal D-dimer had VTE at 3 months (0%, 95% CI 0–1.2%).',
        details: [{ label: 'Three-level classification', value: three }],
        warnings: []
      };
    },
    formula: 'One point each: age >65; previous DVT/PE; surgery or lower-limb fracture ≤1 month; active malignancy; unilateral leg pain; haemoptysis; leg deep-vein palpation pain with unilateral oedema. Heart rate 75–94: 1 point; ≥95: 2 points.\nTwo-level: ≤2 PE unlikely, ≥3 PE likely. Three-level: 0–1 low, 2–4 intermediate, ≥5 high.',
    pearls: [
      'Fully objective (no “alternative diagnosis” item), so it varies less between clinicians than Wells.',
      'Diagnostic accuracy equals the weighted revised Geneva score (AUC 0.74 vs 0.75; Klok 2008).',
      'Combine the probability with D-dimer and CTPA as in the 2019 ESC algorithm; not validated in pregnancy.'
    ],
    references: [R.klok2008, R.legal2006, R.esc2019pe]
  };

  /* ------------------------------------------------------------------------
     6. Cardiology — QTc and mean arterial pressure
     ------------------------------------------------------------------------ */
  function qtcAll(qt, hr) {
    var rr = 60 / hr; // seconds
    return {
      rr: rr,
      bazett: qt / Math.sqrt(rr),                 // Bazett 1920
      fridericia: qt / Math.pow(rr, 1 / 3),       // Fridericia 1920
      framingham: qt + 154 * (1 - rr),            // Sagie 1992: QTc = QT + 0.154 (1 − RR), in seconds
      hodges: qt + 1.75 * (hr - 60)               // Hodges 1983
    };
  }
  var QTC_NAMES = { bazett: 'Bazett', fridericia: 'Fridericia', framingham: 'Framingham', hodges: 'Hodges' };
  /** AHA/ACCF/HRS 2009: prolonged ≥450 ms (men) / ≥460 ms (women); short ≤390 ms. AHA/ACCF 2010: >500 ms high risk. */
  function qtcClass(q, fem) {
    var lim = fem ? 460 : 450;
    if (q > 500) return 'marked';
    if (q >= lim) return 'long';
    if (q <= 390) return 'short';
    return 'normal';
  }

  var defQtc = {
    id: 'qtc',
    name: 'QTc — corrected QT interval',
    category: 'Cardiology',
    summary: 'Heart-rate-corrected QT by Bazett, Fridericia, Framingham and Hodges with sex-specific limits.',
    keywords: ['qt', 'qtc', 'ecg', 'long qt', 'torsades', 'bazett', 'fridericia', 'framingham', 'hodges', 'drug safety'],
    inputs: [
      { id: 'qt', label: 'Measured QT interval', type: 'number', unit: 'ms', min: 200, max: 800, hint: 'Lead II or V5, from QRS onset to the end of the T wave' },
      { id: 'hr', label: 'Heart rate', type: 'number', unit: '/min', min: 20, max: 250 },
      inSex('Sets the prolongation threshold'),
      { id: 'formula', label: 'Headline formula', type: 'radio', default: 'fridericia', options: [
        { value: 'fridericia', label: 'Fridericia (QT ÷ ∛RR)', hint: 'Recommended: little residual rate dependence' },
        { value: 'framingham', label: 'Framingham (linear)' },
        { value: 'bazett', label: 'Bazett (QT ÷ √RR)', hint: 'Most familiar; over-corrects at fast heart rates' },
        { value: 'hodges', label: 'Hodges (linear)' }] },
      { type: 'heading', label: 'Optional' },
      { id: 'qrs', label: 'QRS duration', type: 'number', unit: 'ms', min: 40, max: 300, required: false },
      { id: 'baseline', label: 'Baseline QTc before a QT-prolonging drug', type: 'number', unit: 'ms', min: 250, max: 700, required: false }
    ],
    compute: function (v) {
      var all = qtcAll(v.qt, v.hr), fem = female(v);
      var key = v.formula || 'fridericia', qtc = rnd(all[key], 0);
      var cls = qtcClass(qtc, fem), lim = fem ? 460 : 450;
      var r = {
        marked: { band: 'danger', title: 'Markedly prolonged QTc (>500 ms)', text: 'QTc above 500 ms is associated with a 2–3-fold higher risk of torsades de pointes. Stop or avoid QT-prolonging drugs where possible, correct potassium and magnesium, and monitor the ECG.' },
        long: { band: 'warn', title: 'Prolonged QTc (≥' + lim + ' ms in ' + (fem ? 'women' : 'men') + ')', text: 'Review QT-prolonging drugs and electrolytes (K⁺, Mg²⁺, Ca²⁺); repeat the ECG and consider congenital long-QT syndrome if unexplained.' },
        short: { band: 'warn', title: 'Short QTc (≤390 ms)', text: 'A QTc of 390 ms or less is short. Check for hypercalcaemia or digoxin, and consider short-QT syndrome if very short with a suggestive history.' },
        normal: { band: 'ok', title: 'QTc within normal limits', text: 'Below the prolongation threshold for ' + (fem ? 'women (460 ms)' : 'men (450 ms)') + '. Re-measure after starting QT-prolonging drugs.' }
      }[cls];
      var details = ['bazett', 'fridericia', 'framingham', 'hodges'].map(function (k) {
        return { label: QTC_NAMES[k] + (k === key ? ' (headline)' : ''), value: fx(all[k], 0) + ' ms' };
      });
      details.push({ label: 'RR interval', value: fx(all.rr * 1000, 0) + ' ms' });
      var warnings = [];
      var classes = ['bazett', 'fridericia', 'framingham', 'hodges'].map(function (k) { return qtcClass(rnd(all[k], 0), fem); });
      if (classes.some(function (c) { return c !== cls; })) warnings.push('The formulas disagree on the category at this heart rate — interpret with caution.');
      if (v.hr > 90 || v.hr < 60) warnings.push('Heart rate ' + fx(v.hr, 0) + '/min: Bazett over-corrects at fast rates and under-corrects at slow rates; prefer Fridericia or Framingham, and re-measure at a rate nearer 60/min if you can.');
      if (isNum(v.qrs) && v.qrs >= 120) warnings.push('QRS ≥120 ms lengthens the QT; the QTc limits assume normal conduction. Consider the JT interval or a QRS-adjusted QT.');
      if (isNum(v.baseline) && qtc - v.baseline >= 60) warnings.push('QTc has risen by ' + fx(qtc - v.baseline, 0) + ' ms from baseline (≥60 ms): high risk of torsades — review the causative drug promptly.');
      return {
        value: fx(qtc, 0), unit: 'ms', label: 'QTc (' + QTC_NAMES[key] + ')', band: r.band, title: r.title,
        interpretation: r.text, details: details, warnings: warnings
      };
    },
    formula: 'RR (s) = 60 ÷ heart rate\nBazett: QTc = QT ÷ √RR\nFridericia: QTc = QT ÷ ∛RR\nFramingham (Sagie 1992): QTc = QT + 154 × (1 − RR)   [ms]\nHodges: QTc = QT + 1.75 × (heart rate − 60)   [ms]\n\nAHA/ACCF/HRS 2009: prolonged ≥450 ms (men), ≥460 ms (women); short ≤390 ms.\nAHA/ACCF 2010: QTc >500 ms, or a rise ≥60 ms after a drug, signals high risk of torsades.',
    pearls: [
      'In 6,609 patients, Fridericia and Framingham corrected best and predicted mortality better; Bazett performed worst and over-classified QT prolongation (Vandenberk 2016).',
      'Measure the longest QT in lead II or V5 using the tangent method; exclude U waves that are separate from the T wave.',
      'In atrial fibrillation, average the QT and RR over several beats.',
      'Each 10 ms increase in QTc raises torsades risk; there is no QTc at which torsades is certain.',
      'Common contributors: drugs (antiarrhythmics, macrolides, fluoroquinolones, antipsychotics, methadone, ondansetron), hypokalaemia, hypomagnesaemia, hypocalcaemia, bradycardia and structural heart disease.'
    ],
    references: [R.rautaharju2009, R.drew2010, R.vandenberk2016, R.bazett1920, R.fridericia1920, R.sagie1992, R.hodges1983]
  };

  var defMap = {
    id: 'mean-arterial-pressure',
    name: 'Mean arterial pressure (MAP)',
    category: 'Cardiology',
    summary: 'Estimated MAP and pulse pressure from systolic and diastolic blood pressure.',
    keywords: ['map', 'mean arterial pressure', 'blood pressure', 'perfusion', 'shock', 'sepsis', 'vasopressor', 'pulse pressure'],
    inputs: [
      { id: 'sbp', label: 'Systolic BP', type: 'number', unit: 'mmHg', min: 40, max: 300 },
      { id: 'dbp', label: 'Diastolic BP', type: 'number', unit: 'mmHg', min: 10, max: 200 }
    ],
    compute: function (v) {
      if (v.dbp >= v.sbp) {
        return { value: null, label: 'Mean arterial pressure', band: 'warn', title: 'Check the readings', interpretation: 'Diastolic pressure must be lower than systolic pressure.', details: [], warnings: [] };
      }
      var map = v.dbp + (v.sbp - v.dbp) / 3;
      var low = rnd(map, 0) < 65;
      return {
        value: fx(map, 0), unit: 'mmHg', label: 'Mean arterial pressure',
        band: low ? 'danger' : 'ok',
        title: low ? 'Below 65 mmHg' : 'MAP 65 mmHg or more',
        interpretation: low
          ? 'A MAP below 65 mmHg is under the initial target recommended for adults with septic shock on vasopressors (Surviving Sepsis Campaign 2021). Assess perfusion (mental state, urine output, lactate, capillary refill) and treat the cause.'
          : 'At or above the 65 mmHg initial target used in septic shock (Surviving Sepsis Campaign 2021). Targets differ in other settings (e.g. raised intracranial pressure, chronic hypertension); individualise.',
        details: [{ label: 'Pulse pressure', value: fx(v.sbp - v.dbp, 0) + ' mmHg' }],
        warnings: []
      };
    },
    formula: 'MAP = DBP + (SBP − DBP) ÷ 3\nPulse pressure = SBP − DBP',
    pearls: [
      'The formula assumes diastole lasts about two-thirds of the cardiac cycle, so it is less accurate at fast heart rates.',
      'Oscillometric cuffs measure MAP directly and derive systolic and diastolic values; arterial lines integrate the waveform and are preferred in shock.',
      'A MAP target is a starting point: perfusion markers matter more than the number.'
    ],
    references: [R.ssc2021]
  };

  /* ------------------------------------------------------------------------
     7. Cardiology — Framingham 2008 general CVD risk (D'Agostino 2008)
     ------------------------------------------------------------------------ */
  // Coefficients, baseline 10-year survival S0(10) and mean linear predictor from D'Agostino 2008, Table 2 (lipid model)
  // and the office-based BMI model; risk = 1 − S0 ^ exp(Σβx − mean).
  var FRAM = {
    lipid: {
      female: { age: 2.32888, tc: 1.20904, hdl: -0.70833, sbp: 2.76157, sbpTreated: 2.82263, smoker: 0.52873, diabetes: 0.69154, s0: 0.95012, mean: 26.1931 },
      male: { age: 3.06117, tc: 1.12370, hdl: -0.93263, sbp: 1.93303, sbpTreated: 1.99881, smoker: 0.65451, diabetes: 0.57367, s0: 0.88936, mean: 23.9802 }
    },
    bmi: {
      female: { age: 2.72107, bmi: 0.51125, sbp: 2.81291, sbpTreated: 2.88267, smoker: 0.61868, diabetes: 0.77763, s0: 0.94833, mean: 26.0145 },
      male: { age: 3.11296, bmi: 0.79277, sbp: 1.85508, sbpTreated: 1.92672, smoker: 0.70953, diabetes: 0.53160, s0: 0.88431, mean: 23.9388 }
    }
  };
  function framingham(model, v, bmi) {
    var c = FRAM[model][female(v) ? 'female' : 'male'];
    var lp = c.age * Math.log(v.age) + (v.treated ? c.sbpTreated : c.sbp) * Math.log(v.sbp) + (v.smoker ? c.smoker : 0) + (v.diabetes ? c.diabetes : 0);
    if (model === 'lipid') lp += c.tc * Math.log(v.tc) + c.hdl * Math.log(v.hdl);
    else lp += c.bmi * Math.log(bmi);
    return 1 - Math.pow(c.s0, Math.exp(lp - c.mean));
  }
  function framResult(risk, extraDetails) {
    var p = rnd(risk * 100, 1);
    // Canadian Cardiovascular Society 2021: FRS <10% low, 10–19.9% intermediate, ≥20% high.
    var cat = p >= 20 ? { band: 'danger', title: 'High risk (≥20%)', text: 'High 10-year risk: statin therapy is recommended in CCS guidelines, alongside lifestyle measures and blood-pressure control.' }
      : p >= 10 ? { band: 'warn', title: 'Intermediate risk (10–19.9%)', text: 'Intermediate risk: discuss statin therapy (CCS 2021 recommends it when LDL-C, non-HDL-C or apoB is raised, or with additional risk factors), plus lifestyle measures.' }
      : { band: 'ok', title: 'Low risk (<10%)', text: 'Low 10-year risk: focus on lifestyle; statins are generally not indicated unless LDL-C is markedly raised (e.g. ≥5 mmol/L) or other conditions apply.' };
    return {
      value: p < 1 ? '<1' : fx(p, 1), unit: '% in 10 years', label: '10-year general CVD risk (Framingham 2008)', band: cat.band, title: cat.title,
      interpretation: cat.text + ' Outcome: coronary death, MI, coronary insufficiency, angina, stroke or TIA, peripheral arterial disease or heart failure.',
      details: extraDetails, warnings: []
    };
  }
  var FRAM_COMMON = [
    inSex(),
    inAge(30, 74, 'Valid for ages 30–74 (derivation cohort)'),
    { id: 'sbp', label: 'Systolic blood pressure', type: 'number', unit: 'mmHg', min: 70, max: 260 },
    { id: 'treated', type: 'bool', label: 'On blood-pressure-lowering treatment' },
    { id: 'smoker', type: 'bool', label: 'Current smoker' },
    { id: 'diabetes', type: 'bool', label: 'Diabetes' }
  ];
  var FRAM_PEARLS = [
    'For primary prevention only — people with established cardiovascular disease are already high risk.',
    'Derived in a largely white US population (8,491 Framingham participants aged 30–74); it may over- or under-estimate risk elsewhere — prefer a locally calibrated tool (e.g. SCORE2, QRISK3, PREVENT) where one exists.',
    'Use the lipid version when cholesterol results are available; the BMI version suits settings without laboratory tests.'
  ];

  var defFramLipid = {
    id: 'framingham-2008',
    name: 'Framingham 10-year CVD risk (2008, lipids)',
    category: 'Cardiology',
    summary: 'General cardiovascular risk in primary prevention using cholesterol, blood pressure, smoking and diabetes.',
    keywords: ['framingham', 'cardiovascular risk', 'cvd', 'statin', 'primary prevention', 'cholesterol', 'd\'agostino', 'frs'],
    inputs: FRAM_COMMON.concat([
      { id: 'tc', label: 'Total cholesterol', type: 'number', units: CHOL_UNITS, min: 58, max: 773 },
      { id: 'hdl', label: 'HDL cholesterol', type: 'number', units: CHOL_UNITS, min: 8, max: 193 }
    ]),
    compute: function (v) {
      return framResult(framingham('lipid', v), [{ label: 'Model', value: 'Framingham general CVD, lipid version (D’Agostino 2008)' }]);
    },
    formula: '10-year risk = 1 − S₀ ^ exp(Σβx − mean)\nWomen: 2.32888·ln(age) + 1.20904·ln(TC) − 0.70833·ln(HDL) + 2.76157·ln(SBP untreated) or 2.82263·ln(SBP treated) + 0.52873·smoker + 0.69154·diabetes; S₀ = 0.95012; mean = 26.1931\nMen: 3.06117·ln(age) + 1.12370·ln(TC) − 0.93263·ln(HDL) + 1.93303·ln(SBP untreated) or 1.99881·ln(SBP treated) + 0.65451·smoker + 0.57367·diabetes; S₀ = 0.88936; mean = 23.9802\nCholesterol in mg/dL (mmol/L × 38.67).',
    pearls: FRAM_PEARLS,
    references: [R.dagostino2008, R.ccs2021]
  };

  var defFramBmi = {
    id: 'framingham-2008-bmi',
    name: 'Framingham 10-year CVD risk (2008, BMI — no labs)',
    category: 'Cardiology',
    summary: 'Office-based general cardiovascular risk using BMI instead of cholesterol.',
    keywords: ['framingham', 'cardiovascular risk', 'cvd', 'bmi', 'non-laboratory', 'office', 'primary prevention'],
    inputs: FRAM_COMMON.concat([inWeight(30, 300), inHeight(120, 230)]),
    compute: function (v) {
      var bmi = v.weight / Math.pow(v.height / 100, 2);
      if (bmi < 12 || bmi > 80) return null;
      return framResult(framingham('bmi', v, bmi), [{ label: 'BMI used', value: fx(bmi, 1) + ' kg/m²' }, { label: 'Model', value: 'Framingham general CVD, BMI version (D’Agostino 2008)' }]);
    },
    formula: '10-year risk = 1 − S₀ ^ exp(Σβx − mean)\nWomen: 2.72107·ln(age) + 0.51125·ln(BMI) + 2.81291·ln(SBP untreated) or 2.88267·ln(SBP treated) + 0.61868·smoker + 0.77763·diabetes; S₀ = 0.94833; mean = 26.0145\nMen: 3.11296·ln(age) + 0.79277·ln(BMI) + 1.85508·ln(SBP untreated) or 1.92672·ln(SBP treated) + 0.70953·smoker + 0.53160·diabetes; S₀ = 0.88431; mean = 23.9388',
    pearls: FRAM_PEARLS,
    references: [R.dagostino2008, R.ccs2021]
  };

  /* ------------------------------------------------------------------------
     8. Renal
     ------------------------------------------------------------------------ */
  /** CKD-EPI 2021 creatinine equation (race-free; Inker 2021). scr in mg/dL. */
  function ckdEpiCr(scr, age, fem) {
    var k = fem ? 0.7 : 0.9, a = fem ? -0.241 : -0.302, x = scr / k;
    return 142 * Math.pow(Math.min(x, 1), a) * Math.pow(Math.max(x, 1), -1.200) * Math.pow(0.9938, age) * (fem ? 1.012 : 1);
  }
  /** CKD-EPI 2021 creatinine–cystatin C equation (Inker 2021). scr mg/dL, scys mg/L. */
  function ckdEpiCrCys(scr, scys, age, fem) {
    var k = fem ? 0.7 : 0.9, a = fem ? -0.219 : -0.144, x = scr / k, y = scys / 0.8;
    return 135 * Math.pow(Math.min(x, 1), a) * Math.pow(Math.max(x, 1), -0.544) *
      Math.pow(Math.min(y, 1), -0.323) * Math.pow(Math.max(y, 1), -0.778) * Math.pow(0.9961, age) * (fem ? 0.963 : 1);
  }
  // KDIGO GFR categories (2012 and 2024): G1 ≥90, G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 <15.
  var G_CATS = [
    { id: 'G1', min: 90, range: '≥90', name: 'Normal or high' },
    { id: 'G2', min: 60, range: '60–89', name: 'Mildly decreased' },
    { id: 'G3a', min: 45, range: '45–59', name: 'Mildly to moderately decreased' },
    { id: 'G3b', min: 30, range: '30–44', name: 'Moderately to severely decreased' },
    { id: 'G4', min: 15, range: '15–29', name: 'Severely decreased' },
    { id: 'G5', min: -Infinity, range: '<15', name: 'Kidney failure' }
  ];
  /** GFR category of a reported (integer-rounded) eGFR. */
  function gCat(egfr) { var e = rnd(egfr, 0); for (var i = 0; i < G_CATS.length; i++) if (e >= G_CATS[i].min) return G_CATS[i]; return G_CATS[G_CATS.length - 1]; }
  function egfrText(g) {
    return {
      G1: 'Normal or high GFR. CKD is present only if markers of kidney damage (e.g. albuminuria, haematuria, structural abnormality) persist for more than 3 months.',
      G2: 'Mildly decreased GFR. Not CKD unless markers of kidney damage persist for more than 3 months — check the urine albumin:creatinine ratio.',
      G3a: 'Mildly to moderately decreased GFR. If sustained for more than 3 months this is CKD: stage with urine ACR, review medicines and doses, and manage cardiovascular risk.',
      G3b: 'Moderately to severely decreased GFR. If sustained this is CKD: stage with urine ACR, adjust drug doses, avoid nephrotoxins and monitor more often.',
      G4: 'Severely decreased GFR: refer to nephrology (KDIGO: eGFR <30), adjust drug doses and start planning for kidney failure.',
      G5: 'Kidney failure range: urgent nephrology involvement.'
    }[g.id];
  }
  function egfrBand(g) { return g.id === 'G1' || g.id === 'G2' ? 'ok' : g.id === 'G3a' || g.id === 'G3b' ? 'warn' : 'danger'; }
  var EGFR_PEARLS = [
    'Assumes stable creatinine: do not use during acute kidney injury or rapidly changing function.',
    'Creatinine reflects muscle mass as well as GFR: eGFR overestimates GFR in people with low muscle mass (frailty, amputation, cirrhosis) and underestimates it in very muscular people or after a high-meat meal or creatine supplements.',
    'Use IDMS-standardised creatinine. For adults ≥18 years only; not validated in pregnancy.',
    'KDIGO 2024 recommends cystatin C (eGFRcr-cys) when eGFRcr may be inaccurate or the decision is critical.',
    'For drug dosing in people with very large or small bodies, convert to absolute GFR: eGFR × BSA ÷ 1.73 (mL/min).'
  ];

  var defCkdEpi = {
    id: 'ckd-epi-2021',
    name: 'eGFR — CKD-EPI 2021 creatinine (race-free)',
    category: 'Renal',
    summary: 'Estimated GFR from serum creatinine, age and sex with the KDIGO GFR category.',
    keywords: ['egfr', 'gfr', 'ckd-epi', 'creatinine', 'kidney function', 'renal function', 'ckd', 'race-free', 'nkf'],
    inputs: [inAge(18, 110), inSex(), inCreat('IDMS-standardised, at steady state')],
    compute: function (v) {
      var fem = female(v), e = ckdEpiCr(v.creat, v.age, fem), g = gCat(e);
      return {
        value: fx(e, 0), unit: 'mL/min/1.73 m²', label: 'eGFR (CKD-EPI 2021)', band: egfrBand(g),
        title: g.id + ' — ' + g.name,
        interpretation: egfrText(g),
        details: [
          { label: 'KDIGO GFR category', value: g.id + ' (' + g.range + ')' },
          { label: 'Creatinine', value: ft(v.creat, 2) + ' mg/dL = ' + fx(v.creat * 88.42, 0) + ' µmol/L' }
        ],
        warnings: v.age >= 90 ? ['Few participants over 90 contributed to the equation; interpret with care.'] : []
      };
    },
    formula: 'eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^age × 1.012 [if female]\nκ = 0.7 (female) or 0.9 (male); α = −0.241 (female) or −0.302 (male); Scr in mg/dL (µmol/L ÷ 88.42).',
    pearls: EGFR_PEARLS,
    references: [R.inker2021, R.delgado2022, R.kdigo2024]
  };

  var defCkdEpiCys = {
    id: 'ckd-epi-2021-cys',
    name: 'eGFR — CKD-EPI 2021 creatinine–cystatin C',
    category: 'Renal',
    summary: 'More accurate eGFR combining creatinine and cystatin C, race-free.',
    keywords: ['egfr', 'cystatin c', 'cystatin', 'ckd-epi', 'creatinine', 'gfr', 'kidney function', 'ckd'],
    inputs: [inAge(18, 110), inSex(), inCreat('IDMS-standardised, at steady state'),
      { id: 'cys', label: 'Serum cystatin C', type: 'number', unit: 'mg/L', min: 0.2, max: 10, hint: 'Standardised to the international reference material (ERM-DA471/IFCC)' }],
    compute: function (v) {
      var fem = female(v), e = ckdEpiCrCys(v.creat, v.cys, v.age, fem), g = gCat(e), ecr = ckdEpiCr(v.creat, v.age, fem);
      var warnings = [];
      if (Math.abs(ecr - e) / e > 0.3) warnings.push('eGFRcr and eGFRcr-cys differ by more than 30%: look for non-GFR influences on creatinine (muscle mass, diet) or cystatin C (thyroid disease, high-dose steroids, inflammation, obesity) and consider measured GFR.');
      return {
        value: fx(e, 0), unit: 'mL/min/1.73 m²', label: 'eGFR (CKD-EPI 2021 Cr–Cys)', band: egfrBand(g),
        title: g.id + ' — ' + g.name,
        interpretation: egfrText(g),
        details: [
          { label: 'KDIGO GFR category', value: g.id + ' (' + g.range + ')' },
          { label: 'eGFR from creatinine alone (2021)', value: fx(ecr, 0) + ' mL/min/1.73 m²' },
          { label: 'Creatinine', value: ft(v.creat, 2) + ' mg/dL = ' + fx(v.creat * 88.42, 0) + ' µmol/L' }
        ],
        warnings: warnings
      };
    },
    formula: 'eGFR = 135 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−0.544 × min(Scys/0.8, 1)^−0.323 × max(Scys/0.8, 1)^−0.778 × 0.9961^age × 0.963 [if female]\nκ = 0.7 (female) or 0.9 (male); α = −0.219 (female) or −0.144 (male); Scr in mg/dL, Scys in mg/L.',
    pearls: [
      'The combined equation was the most accurate in the 2021 validation (P30 >90%) and the least affected by removing race.',
      'Cystatin C is less affected by muscle mass and diet but is raised by thyroid dysfunction, corticosteroids, inflammation and obesity.',
      'Use when creatinine-based eGFR is doubtful (e.g. sarcopenia, amputation, extremes of body size) or before high-stakes decisions such as diagnosing CKD at eGFR 45–59 without albuminuria.'
    ].concat(EGFR_PEARLS.slice(0, 1)),
    references: [R.inker2021, R.delgado2022, R.kdigo2024]
  };

  // Cockcroft–Gault (1976) with body-weight options; Devine (1974) ideal body weight;
  // adjusted body weight with factor 0.4 (Bauer 1983); automatic choice per Winter 2012.
  function devineIbw(heightCm, fem) { return (fem ? 45.5 : 50) + 2.3 * (heightCm / 2.54 - 60); }
  function adjBw(ibw, tbw) { return ibw + 0.4 * (tbw - ibw); }
  function cgCrCl(age, wt, scr, fem) { return (140 - age) * wt / (72 * scr) * (fem ? 0.85 : 1); }

  var defCg = {
    id: 'cockcroft-gault',
    name: 'Creatinine clearance — Cockcroft–Gault',
    category: 'Renal',
    summary: 'Estimated creatinine clearance for drug dosing, with actual, ideal or adjusted body weight.',
    keywords: ['creatinine clearance', 'crcl', 'cockcroft', 'gault', 'drug dosing', 'renal dosing', 'doac', 'kidney function', 'ideal body weight', 'adjusted body weight'],
    inputs: [
      inAge(18, 110), inSex(), inWeight(25, 350), inHeight(120, 230, 'Needed for ideal and adjusted body weight'), inCreat('At steady state'),
      { id: 'basis', label: 'Body weight used', type: 'radio', default: 'auto', options: [
        { value: 'auto', label: 'Automatic (Winter 2012)', hint: 'Actual if underweight or below IBW; ideal if BMI 18.5–24.9; adjusted if BMI ≥25' },
        { value: 'actual', label: 'Actual body weight' },
        { value: 'ideal', label: 'Ideal body weight (Devine)' },
        { value: 'adjusted', label: 'Adjusted body weight (IBW + 0.4 × excess)' }] }
    ],
    compute: function (v) {
      var fem = female(v), tbw = v.weight, ibw = devineIbw(v.height, fem);
      if (ibw <= 0) return null;
      var abw = tbw > ibw ? adjBw(ibw, tbw) : tbw;
      var bmi = tbw / Math.pow(v.height / 100, 2);
      var basis = v.basis || 'auto', used, why;
      if (basis === 'auto') {
        if (bmi < 18.5 || tbw <= ibw) { used = 'actual'; why = bmi < 18.5 ? 'underweight (BMI <18.5)' : 'actual weight ≤ ideal weight'; }
        else if (bmi < 25) { used = 'ideal'; why = 'BMI 18.5–24.9'; }
        else { used = 'adjusted'; why = 'BMI ≥25 (overweight or obese)'; }
      } else used = basis;
      var wt = used === 'actual' ? tbw : used === 'ideal' ? ibw : abw;
      var cl = cgCrCl(v.age, wt, v.creat, fem);
      var label = { actual: 'actual', ideal: 'ideal', adjusted: 'adjusted' };
      var clr = rnd(cl, 0), band = clr >= 60 ? 'ok' : clr >= 30 ? 'warn' : 'danger';
      var warnings = [];
      if (v.height < 152.4) warnings.push('Height under 152 cm (5 ft): the Devine formula extrapolates below its base height, so ideal and adjusted weights are uncertain.');
      if (used === 'ideal' && tbw < ibw) warnings.push('Actual weight is below ideal weight: using ideal weight overestimates clearance.');
      return {
        value: fx(cl, 0), unit: 'mL/min', label: 'Creatinine clearance (Cockcroft–Gault)', band: band,
        title: 'Using ' + label[used] + ' body weight (' + fx(wt, 1) + ' kg)',
        interpretation: 'Use the dose bands in the product information (many — including DOACs and aminoglycosides — were set with Cockcroft–Gault in mL/min, not eGFR). Not normalised to body-surface area. Unreliable when creatinine is changing (AKI), with very low muscle mass, or in oedematous states.' + (basis === 'auto' ? ' Weight chosen automatically: ' + why + '.' : ''),
        details: [
          { label: 'CrCl with actual weight (' + fx(tbw, 1) + ' kg)', value: fx(cgCrCl(v.age, tbw, v.creat, fem), 0) + ' mL/min' },
          { label: 'CrCl with ideal weight (' + fx(ibw, 1) + ' kg)', value: fx(cgCrCl(v.age, ibw, v.creat, fem), 0) + ' mL/min' },
          { label: 'CrCl with adjusted weight (' + fx(abw, 1) + ' kg)', value: fx(cgCrCl(v.age, abw, v.creat, fem), 0) + ' mL/min' },
          { label: 'BMI', value: fx(bmi, 1) + ' kg/m²' },
          { label: 'Creatinine', value: ft(v.creat, 2) + ' mg/dL = ' + fx(v.creat * 88.42, 0) + ' µmol/L' }
        ],
        warnings: warnings
      };
    },
    formula: 'CrCl (mL/min) = (140 − age) × weight (kg) ÷ (72 × creatinine [mg/dL]) × 0.85 if female\nSI form: (140 − age) × weight × 1.23 ÷ creatinine (µmol/L) in men, × 1.04 in women (72 ÷ 88.42 ≈ 0.814).\nIdeal body weight (Devine): 50 kg (men) or 45.5 kg (women) + 2.3 kg per inch above 5 ft\nAdjusted body weight = IBW + 0.4 × (actual − IBW)\nAutomatic choice (Winter 2012): actual weight if BMI <18.5 or actual ≤ IBW; IBW if BMI 18.5–24.9; adjusted weight if BMI ≥25.',
    pearls: [
      'Winter 2012 (3,678 patients with 24-h urine collections): actual weight was unbiased in underweight patients, ideal weight in normal-weight patients, and adjusted weight (0.4) was least biased in overweight and obese patients.',
      'Rounding low creatinine up to 0.8 or 1.0 mg/dL in older patients did not improve accuracy (Winter 2012).',
      'Derived in 1976 from 249 men with older creatinine assays; IDMS-standardised creatinine reads slightly lower, so the formula may overestimate clearance a little.',
      'Check the drug’s own labelling: some newer drugs specify eGFR, and local antimicrobial or chemotherapy protocols may prescribe a weight scalar.'
    ],
    references: [R.cg1976, R.winter2012, R.devine1974, R.bauer1983]
  };

  // KDIGO albuminuria categories. The mg/mmol and mg/g thresholds are rounded equivalents
  // (KDIGO 2012 Table 7, unchanged in 2024): ACR A1 <3 mg/mmol (<30 mg/g), A2 3–30 (30–300), A3 >30 (>300).
  // PCR equivalents: <15 mg/mmol (<150 mg/g), 15–50 (150–500), >50 (>500).
  function cat3(x, lo, hi) { return x < lo ? 1 : x <= hi ? 2 : 3; }
  /** Category in both unit systems; the more inclusive (higher) one is used, flagged when they differ. */
  function albCat(mgmmol, test) {
    var mgg = q(mgmmol * MGG_PER_MGMMOL);
    mgmmol = q(mgmmol);
    var t = test === 'pcr' ? { si: [15, 50], conv: [150, 500] } : { si: [3, 30], conv: [30, 300] };
    var a = cat3(mgmmol, t.si[0], t.si[1]), b = cat3(mgg, t.conv[0], t.conv[1]);
    return { cat: Math.max(a, b), si: a, conv: b, grey: a !== b };
  }
  var A_NAMES = { 1: 'Normal to mildly increased', 2: 'Moderately increased', 3: 'Severely increased' };
  // KDIGO heat map (2012 Figure 2 / 2024): rows G1..G5, columns A1..A3.
  var KDIGO_RISK = {
    G1: ['low', 'mod', 'high'], G2: ['low', 'mod', 'high'], G3a: ['mod', 'high', 'vhigh'],
    G3b: ['high', 'vhigh', 'vhigh'], G4: ['vhigh', 'vhigh', 'vhigh'], G5: ['vhigh', 'vhigh', 'vhigh']
  };
  var RISK_NAMES = { low: 'Low risk', mod: 'Moderately increased risk', high: 'High risk', vhigh: 'Very high risk' };
  var RISK_SHORT = { low: 'Low', mod: 'Moderate', high: 'High', vhigh: 'Very high' };
  var RISK_BAND = { low: 'ok', mod: 'warn', high: 'danger', vhigh: 'danger' };

  var KD_CSS = [
    '.c1a-kd { padding: 14px; }',
    '.c1a-kd h3 { margin: 0 0 .5rem; font-size: 1rem; }',
    '.c1a-kd table { width: 100%; border-collapse: separate; border-spacing: 3px; table-layout: fixed; font-size: .8rem; }',
    '.c1a-kd th { font-weight: 700; color: var(--text-2); text-align: center; padding: 3px 2px; line-height: 1.2; }',
    '.c1a-kd th[scope="row"] { text-align: left; }',
    '.c1a-kd .c1a-kd-sub { display: block; font-weight: 500; color: var(--muted); font-size: .72rem; }',
    '.c1a-kd td { text-align: center; padding: 8px 2px; border-radius: 6px; border: 1px solid transparent; color: var(--text); font-weight: 600; line-height: 1.15; }',
    '.c1a-kd .r-low { background: var(--ok-soft); border-color: var(--ok-border); }',
    '.c1a-kd .r-mod { background: var(--warn-soft); border-color: var(--warn-border); }',
    '.c1a-kd .r-high { background: color-mix(in srgb, var(--warn-border) 50%, var(--danger-soft)); border-color: var(--warn-border); }',
    '.c1a-kd .r-vhigh { background: var(--danger-soft); border-color: var(--danger-border); }',
    '.c1a-kd td.is-row { box-shadow: inset 0 0 0 2px var(--border-strong); }',
    '.c1a-kd td.is-cur { box-shadow: inset 0 0 0 3px var(--text); }',
    '.c1a-kd .c1a-kd-you { display: block; font-size: .7rem; font-weight: 800; }',
    '.c1a-kd .c1a-kd-note { font-size: .8rem; color: var(--muted); margin: .5rem 0 0; }'
  ].join('\n');

  var A_COLS = [{ id: 'A1', range: '<3 mg/mmol · <30 mg/g' }, { id: 'A2', range: '3–30 · 30–300' }, { id: 'A3', range: '>30 · >300' }];

  /** Draws the heat map (browser only; called from render with the runtime's DOM builder). */
  function drawKdigo(h, host, g, a) {
    while (host.firstChild) host.removeChild(host.firstChild);
    var head = h('tr', h('th', { scope: 'col' }, h('span.sr-only', 'GFR category')), A_COLS.map(function (c) {
      return h('th', { scope: 'col' }, c.id, h('span.c1a-kd-sub', c.range));
    }));
    var body = G_CATS.map(function (gc) {
      return h('tr', h('th', { scope: 'row' }, gc.id, h('span.c1a-kd-sub', gc.range)), [0, 1, 2].map(function (i) {
        var risk = KDIGO_RISK[gc.id][i], cur = g === gc.id && a === i + 1, row = g === gc.id && !a;
        return h('td', { class: ['r-' + risk, cur ? 'is-cur' : '', row ? 'is-row' : ''], 'aria-current': cur ? 'true' : null },
          RISK_SHORT[risk], cur ? h('span.c1a-kd-you', '● this patient') : null);
      }));
    });
    host.appendChild(h('h3', 'KDIGO risk heat map'));
    host.appendChild(h('table', { 'aria-label': 'KDIGO prognosis of CKD by GFR category (rows) and albuminuria category (columns)' }, h('thead', head), h('tbody', body)));
    host.appendChild(h('p.c1a-kd-note', g ? (a ? 'Highlighted: ' + g + ' A' + a + '.' : 'Row ' + g + ' outlined — add a urine ACR to place the patient in a column.') : 'Enter eGFR (and ACR) to place the patient on the map.'));
    host.appendChild(h('p.c1a-kd-note', 'Low = green, moderately increased = yellow, high = orange, very high = red. Low risk with no other markers of kidney damage means no CKD.'));
  }

  var defKdigo = {
    id: 'kdigo-ckd',
    name: 'CKD staging — KDIGO GFR & albuminuria (heat map)',
    category: 'Renal',
    summary: 'KDIGO G and A categories with the colour-coded prognosis heat map and referral prompts.',
    keywords: ['ckd', 'chronic kidney disease', 'kdigo', 'staging', 'albuminuria', 'acr', 'egfr', 'heat map', 'referral', 'nephrology'],
    inputs: [
      { id: 'egfr', label: 'eGFR', type: 'number', unit: 'mL/min/1.73 m²', min: 1, max: 200, hint: 'Use the CKD-EPI 2021 calculator if you only have creatinine' },
      { id: 'acr', label: 'Urine albumin:creatinine ratio (ACR)', type: 'number', units: ACR_UNITS, min: 0, max: 3000, required: false, hint: 'Optional — needed for the A category. Confirm raised values on repeat samples.' },
      { id: 'chronic', type: 'bool', label: 'Abnormality present for more than 3 months', hint: 'CKD requires persistence for >3 months; otherwise consider acute kidney injury or disease' }
    ],
    compute: function (v) {
      var g = gCat(v.egfr);
      var hasA = isNum(v.acr);
      var ac = hasA ? albCat(v.acr, 'acr') : null;
      var details = [{ label: 'GFR category', value: g.id + ' — ' + g.name + ' (' + g.range + ')' }], warnings = [];
      if (hasA) {
        details.push({ label: 'Albuminuria category', value: 'A' + ac.cat + ' — ' + A_NAMES[ac.cat] });
        details.push({ label: 'ACR', value: ft(v.acr, 1) + ' mg/mmol = ' + fx(v.acr * MGG_PER_MGMMOL, 0) + ' mg/g' });
        if (ac.grey) warnings.push('This ACR lies between the rounded KDIGO cut-offs (3 mg/mmol ≈ 26.5 mg/g; 30 mg/g ≈ 3.4 mg/mmol; likewise 30 mg/mmol vs 300 mg/g). Classified as A' + ac.cat + ' (mg/mmol threshold); by the mg/g threshold it would be A' + ac.conv + '. Repeat the test.');
      }
      if (!v.chronic) warnings.push('CKD needs abnormalities for more than 3 months — confirm with repeat tests before labelling CKD.');
      var refer = [];
      if (g.min < 30) refer.push('eGFR <30');
      if (hasA && q(v.acr) >= 30) refer.push('ACR ≥30 mg/mmol (≥300 mg/g)');
      if (!hasA) {
        return {
          value: g.id, label: 'KDIGO category', band: egfrBand(g), title: g.id + ' — ' + g.name,
          interpretation: egfrText(g) + ' Add a urine ACR for the albuminuria category and the full risk category.' + (refer.length ? ' Referral criterion met: ' + refer.join('; ') + '.' : ''),
          details: details, warnings: warnings
        };
      }
      var risk = KDIGO_RISK[g.id][ac.cat - 1];
      var noCkd = risk === 'low';
      var text = {
        low: 'Low risk: if there are no other markers of kidney damage this is not CKD. Re-check if risk factors (diabetes, hypertension) are present.',
        mod: 'Moderately increased risk: confirm chronicity, control blood pressure and cardiovascular risk, review medicines, and monitor eGFR and ACR at least annually.',
        high: 'High risk: optimise kidney-protective treatment (blood pressure, RAS inhibitor and SGLT2 inhibitor where indicated per KDIGO 2024), adjust drug doses and monitor more often.',
        vhigh: 'Very high risk: involve nephrology, optimise kidney-protective and cardiovascular treatment, adjust drug doses and monitor closely.'
      }[risk];
      return {
        value: g.id + ' A' + ac.cat, label: 'KDIGO category', band: RISK_BAND[risk],
        title: RISK_NAMES[risk] + (noCkd ? ' (no CKD without other markers)' : ''),
        interpretation: text + (refer.length ? ' Referral criterion met: ' + refer.join('; ') + '.' : ''),
        details: details, warnings: warnings
      };
    },
    render: function (container, api) {
      var MT = api.MT, h = MT.h, def = api.def, lastVals = null;
      MT.css('c1a-kdigo', KD_CSS);
      var plain = {};
      Object.keys(def).forEach(function (k) { if (k !== 'render') plain[k] = def[k]; });
      plain.compute = function (v) { lastVals = v; return def.compute(v); };
      MT.calc.render(plain, container);
      var host = h('section.card.c1a-kd', { 'aria-live': 'polite' });
      var col = container.querySelector('.sticky-top');
      if (col && col.firstChild) col.insertBefore(host, col.firstChild.nextSibling); else container.appendChild(host);
      function sync() {
        var shown = container.querySelector('.result:not(.empty)');
        var g = null, a = null;
        if (shown && lastVals && isNum(lastVals.egfr)) {
          g = gCat(lastVals.egfr).id;
          if (isNum(lastVals.acr)) a = albCat(lastVals.acr, 'acr').cat;
        }
        drawKdigo(h, host, g, a);
      }
      ['input', 'change', 'click'].forEach(function (t) { container.addEventListener(t, function () { setTimeout(sync, 0); }, true); });
      sync();
    },
    formula: 'GFR categories (mL/min/1.73 m²): G1 ≥90 · G2 60–89 · G3a 45–59 · G3b 30–44 · G4 15–29 · G5 <15\nAlbuminuria (ACR): A1 <3 mg/mmol (<30 mg/g) · A2 3–30 (30–300) · A3 >30 (>300)\nHeat map: G1–G2 A1 low; G1–G2 A2 and G3a A1 moderately increased; G1–G2 A3, G3a A2 and G3b A1 high; all others very high.\n1 mg/mmol = 8.84 mg/g.',
    pearls: [
      'CKD = abnormal kidney structure or function for more than 3 months: eGFR <60 or markers of damage (albuminuria ACR ≥3 mg/mmol, haematuria, electrolyte or tubular disorders, structural or histological abnormality, transplant).',
      'Confirm albuminuria with repeat early-morning samples: exercise, infection, fever, menstruation and marked hyperglycaemia raise ACR transiently.',
      'KDIGO referral triggers include eGFR <30, ACR ≥30 mg/mmol (≥300 mg/g), acute kidney injury or a sustained abrupt fall in eGFR, progression, unexplained haematuria with red cell casts, refractory hypertension (≥4 drugs) and persistent potassium abnormalities.',
      'The mg/mmol and mg/g cut-offs are rounded equivalents; values between them are flagged.'
    ],
    references: [R.kdigo2024, R.kdigo2012]
  };

  var defUrineRatio = {
    id: 'urine-acr-pcr',
    name: 'Urine ACR / PCR — unit converter',
    category: 'Renal',
    summary: 'Converts albumin:creatinine or protein:creatinine ratios between mg/mmol, mg/g and mg/mg, with the KDIGO category.',
    keywords: ['acr', 'pcr', 'uacr', 'upcr', 'albumin creatinine ratio', 'protein creatinine ratio', 'albuminuria', 'proteinuria', 'mg/mmol', 'mg/g', 'conversion'],
    inputs: [
      { id: 'test', label: 'Test', type: 'radio', default: 'acr', options: [
        { value: 'acr', label: 'Albumin:creatinine ratio (ACR)' },
        { value: 'pcr', label: 'Protein:creatinine ratio (PCR)' }] },
      { id: 'ratio', label: 'Ratio', type: 'number', units: RATIO_UNITS, min: 0, max: 5000, hint: 'Switch the unit to convert the value in place' }
    ],
    compute: function (v) {
      var x = v.ratio, test = v.test === 'pcr' ? 'pcr' : 'acr', c = albCat(x, test);
      var mgg = x * MGG_PER_MGMMOL;
      var name = test === 'acr' ? 'ACR' : 'PCR';
      var band = c.cat === 1 ? 'ok' : c.cat === 2 ? 'warn' : 'danger';
      var titles = test === 'acr'
        ? { 1: 'A1 — normal to mildly increased', 2: 'A2 — moderately increased albuminuria', 3: 'A3 — severely increased albuminuria' }
        : { 1: 'Equivalent to A1 (normal to mildly increased)', 2: 'Equivalent to A2 (moderately increased)', 3: 'Equivalent to A3 (severely increased)' };
      var warnings = [];
      if (c.grey) warnings.push('This value lies between the rounded mg/mmol and mg/g cut-offs: category ' + c.si + ' by mg/mmol, ' + c.conv + ' by mg/g. The higher category is shown; repeat the test.');
      return {
        value: ft(x, 1), unit: 'mg/mmol', label: 'Urine ' + name, band: band, title: titles[c.cat],
        interpretation: (c.cat === 1 ? 'Within the normal to mildly increased range.' : 'Raised: confirm on a repeat early-morning sample (2 of 3 samples over 3–6 months) and assess for CKD, diabetes and hypertension.') + ' KDIGO thresholds are given in both unit systems as rounded equivalents.',
        details: [
          { label: 'mg/mmol (= g/mol)', value: ft(x, 2) },
          { label: 'mg/g', value: ft(mgg, 1) },
          { label: 'mg/mg (= g/g)', value: ft(mgg / 1000, 3) },
          { label: 'Approximate ' + (test === 'acr' ? 'albumin' : 'protein') + ' excretion', value: '≈ ' + fx(mgg, 0) + ' mg/day if creatinine excretion is ~1 g/day' }
        ],
        warnings: warnings
      };
    },
    formula: '1 mg/mmol = 1 g/mol = 8.84 mg/g (creatinine 113.12 g/mol)\n1 mg/mg = 1 g/g = 1000 mg/g = 113.1 mg/mmol\nKDIGO (2012 Table 7): ACR <3 / 3–30 / >30 mg/mmol (<30 / 30–300 / >300 mg/g)\nPCR <15 / 15–50 / >50 mg/mmol (<150 / 150–500 / >500 mg/g)',
    pearls: [
      'ACR is preferred to PCR for detecting and staging CKD because it is more sensitive at low levels; PCR is often used to quantify heavy proteinuria.',
      'A ratio in mg/g roughly equals daily excretion in mg only if the person excretes about 1 g creatinine a day; it overestimates excretion in people with low muscle mass.',
      'The mg/mmol and mg/g thresholds are rounded (3 mg/mmol = 26.5 mg/g exactly), so a value can fall in different categories in each system.'
    ],
    references: [R.kdigo2012, R.kdigo2024]
  };

  /* ------------------------------------------------------------------------
     9. Hepatology
     ------------------------------------------------------------------------ */
  // Child–Pugh (Pugh 1973; INR thresholds as used in current practice in place of PT prolongation).
  var IN_CP = [
    inBili(),
    inAlb(),
    inINR(),
    { id: 'ascites', label: 'Ascites', type: 'radio', options: [
      { value: 1, label: 'None', points: 1 },
      { value: 2, label: 'Slight / mild', points: 2 },
      { value: 3, label: 'Moderate or severe', points: 3 }] },
    { id: 'enceph', label: 'Hepatic encephalopathy', type: 'radio', options: [
      { value: 1, label: 'None', points: 1 },
      { value: 2, label: 'Grade 1–2', points: 2 },
      { value: 3, label: 'Grade 3–4', points: 3 }] }
  ];
  function cpBili(mgdl) { return mgdl < 2 ? 1 : mgdl <= 3 ? 2 : 3; }       // <2, 2–3, >3 mg/dL
  function cpAlb(gdl) { return gdl > 3.5 ? 1 : gdl >= 2.8 ? 2 : 3; }        // >3.5, 2.8–3.5, <2.8 g/dL
  function cpInr(inr) { return inr < 1.7 ? 1 : inr <= 2.3 ? 2 : 3; }        // <1.7, 1.7–2.3, >2.3

  var defChildPugh = {
    id: 'child-pugh',
    name: 'Child–Pugh score',
    category: 'Hepatology',
    summary: 'Severity of chronic liver disease (class A, B or C) from bilirubin, albumin, INR, ascites and encephalopathy.',
    keywords: ['child pugh', 'child-turcotte-pugh', 'ctp', 'cirrhosis', 'liver', 'hepatic impairment', 'drug dosing'],
    inputs: IN_CP,
    compute: function (v) {
      var pb = cpBili(q(v.bili)), pa = cpAlb(q(v.alb)), pi = cpInr(q(v.inr));
      var s = pb + pa + pi + Number(v.ascites) + Number(v.enceph);
      var cls = s <= 6 ? 'A' : s <= 9 ? 'B' : 'C';
      var r = {
        A: { band: 'ok', title: 'Class A (5–6 points) — well-compensated', text: 'Child–Pugh A: well-compensated disease. Corresponds to “mild” hepatic impairment in drug labelling.' },
        B: { band: 'warn', title: 'Class B (7–9 points) — significant functional compromise', text: 'Child–Pugh B: significant functional compromise. Corresponds to “moderate” hepatic impairment in drug labelling; consider referral for transplant assessment if decompensated.' },
        C: { band: 'danger', title: 'Class C (10–15 points) — decompensated', text: 'Child–Pugh C: decompensated disease with poor prognosis. Corresponds to “severe” hepatic impairment in drug labelling; discuss with a hepatology/transplant centre.' }
      }[cls];
      var warnings = [];
      var umol = q(v.bili * 17.1);
      if ((umol >= 34 && umol < 34.2) || (umol > 50 && umol <= 51.3)) warnings.push('Bilirubin ' + fx(umol, 1) + ' µmol/L lies between the exact (34.2 / 51.3 µmol/L) and rounded (34 / 50 µmol/L) SI cut-offs; the score uses the original mg/dL thresholds.');
      return {
        value: String(s), unit: 'points', label: 'Child–Pugh score (5–15)', band: r.band, title: r.title,
        interpretation: r.text,
        details: [
          { label: 'Bilirubin', value: ft(v.bili, 2) + ' mg/dL (' + fx(umol, 0) + ' µmol/L) → ' + pb },
          { label: 'Albumin', value: ft(v.alb, 2) + ' g/dL (' + ft(v.alb * 10, 1) + ' g/L) → ' + pa },
          { label: 'INR', value: ft(v.inr, 2) + ' → ' + pi },
          { label: 'Ascites + encephalopathy', value: String(Number(v.ascites) + Number(v.enceph)) }
        ],
        warnings: warnings
      };
    },
    formula: 'Bilirubin: <2 mg/dL (<34.2 µmol/L) 1 · 2–3 mg/dL (34.2–51.3) 2 · >3 mg/dL (>51.3) 3\nAlbumin: >3.5 g/dL (>35 g/L) 1 · 2.8–3.5 (28–35) 2 · <2.8 (<28) 3\nINR: <1.7 1 · 1.7–2.3 2 · >2.3 3\nAscites: none 1 · slight 2 · moderate–severe 3\nEncephalopathy: none 1 · grade 1–2 2 · grade 3–4 3\nClass A 5–6 · B 7–9 · C 10–15',
    pearls: [
      'Pugh (1973) used prothrombin-time prolongation (1–4 s, 4–6 s, >6 s); INR thresholds are the modern substitute.',
      'Ascites and encephalopathy grading are subjective, and albumin infusions, vitamin K antagonists (INR) and haemolysis or Gilbert syndrome (bilirubin) distort the score.',
      'A modified bilirubin scale is sometimes used in cholestatic disease (PBC, PSC); this calculator uses the standard scale.',
      'FDA hepatic-impairment guidance maps Child–Pugh A/B/C to mild/moderate/severe impairment for drug labelling.',
      'For transplant prioritisation use MELD 3.0 rather than Child–Pugh.'
    ],
    references: [R.pugh1973, R.fda2003]
  };

  /** Original MELD with UNOS conventions (Kamath 2001; OPTN). Returns the integer MELD(i). */
  function meldI(bili, inr, creat, dialysis) {
    var b = Math.max(bili, 1), i = Math.max(inr, 1), c = dialysis ? 4 : clamp(creat, 1, 4);
    var raw = 0.957 * Math.log(c) + 0.378 * Math.log(b) + 1.120 * Math.log(i) + 0.643;
    return { raw: raw, meld: rnd(raw * 10, 0), b: b, i: i, c: c }; // round to tenth then ×10 = nearest integer of raw×10
  }
  /** MELD-Na (OPTN 2016): applied when MELD(i) > 11; Na bounded 125–137. */
  function meldNa(mi, na) {
    var n = clamp(na, 125, 137);
    return mi > 11 ? mi + 1.32 * (137 - n) - 0.033 * mi * (137 - n) : mi;
  }
  /** MELD 3.0 (Kim 2021; OPTN 2023). Returns raw (unrounded) score. */
  function meld3(fem, bili, na, inr, creat, alb, dialysis) {
    var b = Math.max(bili, 1), i = Math.max(inr, 1), c = dialysis ? 3 : clamp(creat, 1, 3), n = clamp(na, 125, 137), a = clamp(alb, 1.5, 3.5);
    return (fem ? 1.33 : 0) + 4.56 * Math.log(b) + 0.82 * (137 - n) - 0.24 * (137 - n) * Math.log(b) +
      9.09 * Math.log(i) + 11.14 * Math.log(c) + 1.85 * (3.5 - a) - 1.83 * (3.5 - a) * Math.log(c) + 6;
  }
  /** MELD 3.0 survival function (Kim 2021): S(t) = S0(t) ^ exp(0.17698 × MELD 3.0 − 3.56); S0(90 d) = 0.946, S0(30 d) = 0.981. */
  function meld3Survival(score, days) { var s0 = days === 30 ? 0.981 : 0.946; return Math.pow(s0, Math.exp(0.17698 * score - 3.56)); }
  function meldBand(m) { return m <= 9 ? 'ok' : m <= 19 ? 'warn' : 'danger'; }
  var MELD_TIER_MORT = [ // Wiesner 2003: 3-month mortality by MELD in chronic liver disease on the transplant waiting list
    { max: 9, mort: '1.9%' }, { max: 19, mort: '6.0%' }, { max: 29, mort: '19.6%' }, { max: 39, mort: '52.6%' }, { max: Infinity, mort: '71.3%' }];
  function referText(m) { return m >= 15 ? ' A MELD of 15 or more meets the AASLD threshold for referral for liver-transplant evaluation.' : ''; }
  var MELD_COMMON_PEARLS = [
    'Lab values below 1.0 are set to 1.0; dialysis at least twice (or 24 h of CVVHD) in the past week counts as the maximum creatinine.',
    'Not for patients on warfarin or other vitamin K antagonists (INR does not reflect liver synthetic function), and not for children under 12 (use PELD).',
    'Patients with hepatocellular carcinoma and other conditions may receive exception points; MELD reflects only laboratory-defined urgency.'
  ];

  var defMeld = {
    id: 'meld',
    name: 'MELD score (original)',
    category: 'Hepatology',
    summary: 'Model for End-stage Liver Disease from bilirubin, INR and creatinine (UNOS conventions).',
    keywords: ['meld', 'cirrhosis', 'liver transplant', 'end-stage liver disease', 'prognosis', 'unos'],
    inputs: [inBili(), inINR(), inCreat(), inDialysis()],
    compute: function (v) {
      var m = meldI(v.bili, v.inr, v.creat, v.dialysis);
      var score = Math.min(m.meld, 40);
      var tier = MELD_TIER_MORT.filter(function (t) { return score <= t.max; })[0];
      return {
        value: String(score), unit: 'points', label: 'MELD (6–40)', band: meldBand(score),
        title: 'Three-month mortality ≈ ' + tier.mort,
        interpretation: 'Among transplant candidates with chronic liver disease, 3-month mortality was ' + tier.mort + ' for this MELD band (Wiesner 2003). Allocation in the US now uses MELD 3.0.' + referText(score),
        details: [
          { label: 'Values used', value: 'bilirubin ' + ft(m.b, 2) + ' mg/dL, INR ' + ft(m.i, 2) + ', creatinine ' + ft(m.c, 2) + ' mg/dL' },
          { label: '3-month mortality by MELD', value: '≤9: 1.9% · 10–19: 6.0% · 20–29: 19.6% · 30–39: 52.6% · ≥40: 71.3%' }
        ],
        warnings: m.meld > 40 ? ['Uncapped MELD ' + m.meld + '; allocation caps the score at 40.'] : []
      };
    },
    formula: 'MELD(i) = 0.957 × ln(creatinine) + 0.378 × ln(bilirubin) + 1.120 × ln(INR) + 0.643, rounded to one decimal and multiplied by 10.\nUnits mg/dL. Values <1 set to 1; creatinine capped at 4.0 (4.0 if dialysed ≥2 times or 24 h CVVHD in the past week). Maximum 40.',
    pearls: MELD_COMMON_PEARLS,
    references: [R.kamath2001, R.wiesner2003, R.optn, R.martin2014]
  };

  var defMeldNa = {
    id: 'meld-na',
    name: 'MELD-Na (UNOS/OPTN 2016)',
    category: 'Hepatology',
    summary: 'MELD with the serum sodium adjustment used for US liver allocation from 2016 to 2023.',
    keywords: ['meld-na', 'meld na', 'meldna', 'sodium', 'hyponatraemia', 'cirrhosis', 'liver transplant', 'unos'],
    inputs: [inBili(), inINR(), inCreat(), inNa(), inDialysis()],
    compute: function (v) {
      var m = meldI(v.bili, v.inr, v.creat, v.dialysis);
      var raw = meldNa(m.meld, v.na), score = Math.min(rnd(raw, 0), 40);
      var applied = m.meld > 11;
      return {
        value: String(score), unit: 'points', label: 'MELD-Na (6–40)', band: meldBand(score),
        title: applied ? 'Sodium-adjusted MELD' : 'MELD(i) ≤11 — sodium term not applied',
        interpretation: 'Higher scores mean higher short-term mortality without transplant; hyponatraemia adds most at lower MELD values.' + referText(score) + ' US allocation moved to MELD 3.0 in 2023.',
        details: [
          { label: 'MELD(i) before sodium adjustment', value: String(Math.min(m.meld, 40)) },
          { label: 'Sodium used', value: fx(clamp(v.na, 125, 137), 0) + ' mmol/L (bounded 125–137)' }
        ],
        warnings: []
      };
    },
    formula: 'MELD(i) as for MELD (rounded to one decimal × 10).\nIf MELD(i) > 11: MELD-Na = MELD(i) + 1.32 × (137 − Na) − 0.033 × MELD(i) × (137 − Na)\nNa bounded to 125–137 mmol/L; result rounded; maximum 40.',
    pearls: [
      'Kim 2008: lower serum sodium (between 125 and 140 mmol/L) predicted waiting-list death independently of MELD.'
    ].concat(MELD_COMMON_PEARLS),
    references: [R.kim2008, R.optn, R.martin2014]
  };

  var defMeld3 = {
    id: 'meld-3',
    name: 'MELD 3.0 (Kim 2021, OPTN 2023)',
    category: 'Hepatology',
    summary: 'Updated MELD adding female sex and albumin, with predicted 90-day survival.',
    keywords: ['meld 3.0', 'meld3', 'meld', 'albumin', 'cirrhosis', 'liver transplant', 'optn', '90-day mortality'],
    inputs: [inSex(), inBili(), inNa(), inINR(), inCreat(), inAlb(), inDialysis()],
    compute: function (v) {
      var raw = meld3(female(v), v.bili, v.na, v.inr, v.creat, v.alb, v.dialysis);
      var score = rnd(raw, 0), shown = Math.min(score, 40);
      var s90 = meld3Survival(score, 90), s30 = meld3Survival(score, 30);
      return {
        value: String(shown), unit: 'points', label: 'MELD 3.0', band: meldBand(shown),
        title: 'Predicted 90-day survival ' + fx(s90 * 100, 1) + '%',
        interpretation: 'Predicted mortality without transplant: ' + fx((1 - s30) * 100, 1) + '% at 30 days and ' + fx((1 - s90) * 100, 1) + '% at 90 days (Kim 2021 survival model).' + referText(shown),
        details: [
          { label: 'Bounded values', value: 'bilirubin ' + ft(Math.max(v.bili, 1), 2) + ' mg/dL, Na ' + fx(clamp(v.na, 125, 137), 0) + ', INR ' + ft(Math.max(v.inr, 1), 2) + ', creatinine ' + ft(v.dialysis ? 3 : clamp(v.creat, 1, 3), 2) + ' mg/dL, albumin ' + ft(clamp(v.alb, 1.5, 3.5), 2) + ' g/dL' },
          { label: 'Unrounded score', value: fx(raw, 2) }
        ],
        warnings: score > 40 ? ['Score ' + score + ' exceeds 40; OPTN allocation caps MELD 3.0 at 40.'] : []
      };
    },
    formula: 'MELD 3.0 = 1.33 (if female) + 4.56·ln(bilirubin) + 0.82·(137 − Na) − 0.24·(137 − Na)·ln(bilirubin) + 9.09·ln(INR) + 11.14·ln(creatinine) + 1.85·(3.5 − albumin) − 1.83·(3.5 − albumin)·ln(creatinine) + 6\nBounds: bilirubin, INR, creatinine ≥1.0; creatinine ≤3.0 (3.0 if dialysed ≥2 times or 24 h CVVHD in the past week); Na 125–137 mmol/L; albumin 1.5–3.5 g/dL. Rounded to an integer; OPTN caps at 40.\n90-day survival = 0.946 ^ exp(0.17698 × MELD 3.0 − 3.56); 30-day uses 0.981.',
    pearls: [
      'Female sex adds 1.33 points because creatinine overestimates kidney function in women.',
      'Creatinine is capped at 3.0 mg/dL (was 4.0); from creatinine ≈2.7 mg/dL upward, low albumin slightly lowers the score through the interaction term.',
      'Kim 2021: concordance 0.869 vs 0.862 for MELD-Na; net 8.8% of deaths correctly reclassified to a higher tier.'
    ].concat(MELD_COMMON_PEARLS),
    references: [R.kim2021, R.optn, R.martin2014]
  };

  // FIB-4 (Sterling 2006). Cut-offs: HIV/HCV <1.45 / >3.25 (Sterling 2006); MASLD <1.30 / >2.67 (Shah 2009,
  // AASLD 2023, EASL 2024); age ≥65 lower cut-off 2.0 and unreliable <35 years (McPherson 2017; EASL 2024).
  var defFib4 = {
    id: 'fib-4',
    name: 'FIB-4 index (liver fibrosis)',
    category: 'Hepatology',
    summary: 'Non-invasive index for advanced liver fibrosis with MASLD and viral-hepatitis cut-offs and age adjustment.',
    keywords: ['fib-4', 'fib4', 'fibrosis', 'masld', 'nafld', 'mash', 'nash', 'fatty liver', 'hepatitis c', 'hiv', 'cirrhosis'],
    inputs: [
      inAge(18, 100),
      { id: 'ast', label: 'AST', type: 'number', unit: 'U/L', min: 1, max: 10000 },
      { id: 'alt', label: 'ALT', type: 'number', unit: 'U/L', min: 1, max: 10000 },
      { id: 'plt', label: 'Platelet count', type: 'number', unit: '×10⁹/L', min: 1, max: 2000 },
      { id: 'context', label: 'Clinical context', type: 'radio', default: 'masld', options: [
        { value: 'masld', label: 'MASLD / NAFLD (fatty liver)' },
        { value: 'viral', label: 'Chronic hepatitis C or HIV/HCV co-infection' }] }
    ],
    compute: function (v) {
      var f = (v.age * v.ast) / (v.plt * Math.sqrt(v.alt));
      var val = rnd(f, 2), warnings = [], r;
      if (v.context === 'viral') {
        if (val < 1.45) r = { band: 'ok', title: 'Advanced fibrosis unlikely (<1.45)', text: 'Below 1.45: advanced fibrosis is unlikely (negative predictive value 90% in the derivation study).' };
        else if (val <= 3.25) r = { band: 'warn', title: 'Indeterminate (1.45–3.25)', text: 'Indeterminate: use elastography or another test to stage fibrosis.' };
        else r = { band: 'danger', title: 'Advanced fibrosis likely (>3.25)', text: 'Above 3.25: advanced fibrosis is likely (positive predictive value 65%, specificity 97%); assess for cirrhosis.' };
      } else {
        var lo = v.age >= 65 ? 2.0 : 1.3;
        if (val < lo) r = { band: 'ok', title: 'Low risk of advanced fibrosis (<' + ft(lo, 2) + ')', text: 'Low risk: advanced fibrosis is unlikely. Manage metabolic risk factors and repeat FIB-4 in 1–3 years (EASL 2024).' };
        else if (val <= 2.67) r = { band: 'warn', title: 'Indeterminate (' + ft(lo, 2) + '–2.67)', text: 'Indeterminate: arrange a second-line test such as vibration-controlled transient elastography (VCTE) or ELF; refer if liver stiffness is ≥8 kPa.' };
        else r = { band: 'danger', title: 'High risk of advanced fibrosis (>2.67)', text: 'High risk: confirm with elastography and refer to hepatology.' };
        if (v.age >= 65) warnings.push('Age 65 or over: the lower cut-off is raised to 2.0 because FIB-4 rises with age (McPherson 2017).');
      }
      if (v.age < 35) warnings.push('Under 35 years FIB-4 performs poorly (McPherson 2017); prefer elastography.');
      return {
        value: fx(f, 2), label: 'FIB-4', band: r.band, title: r.title, interpretation: r.text,
        details: [
          { label: 'MASLD cut-offs', value: '<1.30 (or <2.0 if ≥65 y) low · >2.67 high' },
          { label: 'HCV / HIV cut-offs', value: '<1.45 low · >3.25 high' }
        ],
        warnings: warnings
      };
    },
    formula: 'FIB-4 = (age [years] × AST [U/L]) ÷ (platelets [10⁹/L] × √ALT [U/L])\nMASLD: <1.30 low (age ≥65: <2.0); 1.30–2.67 indeterminate; >2.67 high.\nHCV / HIV–HCV: <1.45 low; 1.45–3.25 indeterminate; >3.25 high.',
    pearls: [
      'FIB-4 is the recommended first step in MASLD (AASLD 2023, EASL–EASD–EASO 2024), followed by elastography when not low.',
      'It rules out advanced fibrosis better than it rules it in: a high value needs confirmation.',
      'Acute hepatitis, alcohol excess, muscle injury (AST) and thrombocytopenia from other causes distort the index.'
    ],
    references: [R.sterling2006, R.shah2009, R.mcpherson2017, R.easl2024, R.rinella2023]
  };

  // APRI (Wai 2003). Significant fibrosis: ≤0.5 / >1.5; cirrhosis: <1.0 / >2.0 (Wai 2003; WHO 2014 HCV, 2015 HBV).
  var defApri = {
    id: 'apri',
    name: 'APRI (AST to platelet ratio index)',
    category: 'Hepatology',
    summary: 'Simple fibrosis and cirrhosis index used where elastography is not available (WHO hepatitis guidelines).',
    keywords: ['apri', 'ast platelet ratio', 'fibrosis', 'cirrhosis', 'hepatitis c', 'hepatitis b', 'who'],
    inputs: [
      { id: 'ast', label: 'AST', type: 'number', unit: 'U/L', min: 1, max: 10000 },
      { id: 'astuln', label: 'AST upper limit of normal', type: 'number', unit: 'U/L', min: 10, max: 200, placeholder: 'e.g. 40', hint: 'Use your laboratory’s reference limit' },
      { id: 'plt', label: 'Platelet count', type: 'number', unit: '×10⁹/L', min: 1, max: 2000 }
    ],
    compute: function (v) {
      var a = (v.ast / v.astuln) * 100 / v.plt, x = rnd(a, 2), r;
      if (x > 2) r = { band: 'danger', title: 'Cirrhosis likely (>2.0)', text: 'APRI above 2.0 suggests cirrhosis (WHO uses >2 in adults to identify cirrhosis and prioritise treatment). Screen for varices and hepatocellular carcinoma per guidelines.' };
      else if (x > 1.5) r = { band: 'warn', title: 'Significant fibrosis likely (>1.5)', text: 'Significant fibrosis (≥F2) is likely; cirrhosis is indeterminate between 1.0 and 2.0. Confirm with elastography where available.' };
      else if (x >= 1) r = { band: 'warn', title: 'Indeterminate (1.0–1.5)', text: 'Indeterminate for both significant fibrosis and cirrhosis: use elastography or repeat over time.' };
      else if (x > 0.5) r = { band: 'info', title: 'Cirrhosis unlikely (<1.0)', text: 'Cirrhosis is unlikely; significant fibrosis cannot be excluded (indeterminate 0.5–1.5).' };
      else r = { band: 'ok', title: 'Significant fibrosis unlikely (≤0.5)', text: 'Significant fibrosis and cirrhosis are unlikely.' };
      return {
        value: fx(a, 2), label: 'APRI', band: r.band, title: r.title, interpretation: r.text,
        details: [
          { label: 'Significant fibrosis (≥F2)', value: x <= 0.5 ? 'unlikely (≤0.5)' : x > 1.5 ? 'likely (>1.5)' : 'indeterminate (0.5–1.5)' },
          { label: 'Cirrhosis (F4)', value: x < 1 ? 'unlikely (<1.0)' : x > 2 ? 'likely (>2.0)' : 'indeterminate (1.0–2.0)' }
        ],
        warnings: []
      };
    },
    formula: 'APRI = (AST ÷ AST upper limit of normal) × 100 ÷ platelets (10⁹/L)\nSignificant fibrosis: ≤0.5 unlikely, >1.5 likely. Cirrhosis: <1.0 unlikely, >2.0 likely.',
    pearls: [
      'Derived in chronic hepatitis C (Wai 2003); performance is weaker in hepatitis B.',
      'High specificity but limited sensitivity for cirrhosis at the 2.0 cut-off: a low APRI does not exclude cirrhosis with certainty.',
      'Acute hepatitis, haemolysis, muscle injury and other causes of low platelets give misleading values.'
    ],
    references: [R.wai2003, R.who2014hcv, R.who2015hbv]
  };

  /* ------------------------------------------------------------------------
     10. Anthropometrics
     ------------------------------------------------------------------------ */
  function bmiOf(v) { return v.weight / Math.pow(v.height / 100, 2); }
  // WHO TRS 894 (2000) adult classes; lower cut-offs: WHO 2004 Asian action points (23, 27.5, 32.5, 37.5)
  // and NICE CG189 (2022) for South Asian, Chinese, other Asian, Middle Eastern, Black African or African-Caribbean backgrounds.
  function bmiClass(b, lower) {
    if (b < 16) return { cls: 'Underweight — severe thinness', band: 'danger' };
    if (b < 17) return { cls: 'Underweight — moderate thinness', band: 'warn' };
    if (b < 18.5) return { cls: 'Underweight — mild thinness', band: 'warn' };
    if (lower) {
      if (b < 23) return { cls: 'Healthy weight', band: 'ok' };
      if (b < 27.5) return { cls: 'Overweight — increased risk (23–27.4)', band: 'warn' };
      if (b < 32.5) return { cls: 'Obesity — high risk (≥27.5)', band: 'warn' };
      if (b < 37.5) return { cls: 'Obesity — high risk (≥32.5 action point)', band: 'danger' };
      return { cls: 'Obesity — high risk (≥37.5 action point)', band: 'danger' };
    }
    if (b < 25) return { cls: 'Normal weight', band: 'ok' };
    if (b < 30) return { cls: 'Overweight (pre-obese)', band: 'warn' };
    if (b < 35) return { cls: 'Obesity class I', band: 'warn' };
    if (b < 40) return { cls: 'Obesity class II', band: 'danger' };
    return { cls: 'Obesity class III', band: 'danger' };
  }

  var defBmi = {
    id: 'bmi',
    name: 'Body mass index (BMI)',
    category: 'Anthropometrics',
    summary: 'BMI with WHO classes and the lower Asian and NICE ethnicity-specific cut-offs.',
    keywords: ['bmi', 'body mass index', 'obesity', 'overweight', 'underweight', 'asian', 'who', 'weight'],
    inputs: [inWeight(20, 350), inHeight(100, 250),
      { id: 'scale', label: 'Cut-offs', type: 'radio', default: 'standard', options: [
        { value: 'standard', label: 'Standard WHO cut-offs' },
        { value: 'lower', label: 'Lower cut-offs (23 / 27.5)', hint: 'Asian populations (WHO 2004); NICE also applies them to South Asian, Chinese, other Asian, Middle Eastern, Black African and African-Caribbean family backgrounds' }] }],
    compute: function (v) {
      var b = bmiOf(v), lower = v.scale === 'lower', c = bmiClass(rnd(b, 1), lower);
      var h2 = Math.pow(v.height / 100, 2), top = lower ? 22.9 : 24.9;
      return {
        value: fx(b, 1), unit: 'kg/m²', label: 'Body mass index', band: c.band, title: c.cls,
        interpretation: 'BMI screens for under- and overweight but does not measure body fat or its distribution. Combine with waist-to-height ratio and clinical assessment.' + (lower ? ' Lower thresholds reflect higher cardiometabolic risk at a given BMI.' : ''),
        details: [
          { label: 'Healthy-weight range for this height', value: fx(18.5 * h2, 1) + '–' + fx(top * h2, 1) + ' kg (BMI 18.5–' + ft(top, 1) + ')' },
          { label: 'Cut-offs used', value: lower ? '18.5 · 23 · 27.5 · 32.5 · 37.5' : '18.5 · 25 · 30 · 35 · 40' }
        ],
        warnings: []
      };
    },
    formula: 'BMI = weight (kg) ÷ height (m)²\nWHO: <18.5 underweight (<16 severe, 16–16.9 moderate, 17–18.4 mild thinness) · 18.5–24.9 normal · 25–29.9 overweight · 30–34.9 obesity I · 35–39.9 obesity II · ≥40 obesity III\nLower cut-offs (WHO 2004 Asian action points; NICE 2022): 23 overweight/increased risk · 27.5 obesity/high risk · further action points 32.5 and 37.5',
    pearls: [
      'Not for children and adolescents (use BMI-for-age centiles) or pregnancy.',
      'Muscular people may be misclassified as overweight; older adults with sarcopenia may have excess fat at a normal BMI.',
      'NICE recommends also measuring waist-to-height ratio in adults with a BMI under 35.'
    ],
    references: [R.who2000, R.who2004, R.nice189]
  };

  var defBsa = {
    id: 'bsa',
    name: 'Body surface area (Mosteller, DuBois)',
    category: 'Anthropometrics',
    summary: 'BSA for drug dosing and indexing (cardiac index, eGFR de-indexing).',
    keywords: ['bsa', 'body surface area', 'mosteller', 'dubois', 'chemotherapy', 'dosing', 'cardiac index'],
    inputs: [inWeight(1, 350), inHeight(40, 250)],
    compute: function (v) {
      var most = Math.sqrt(v.height * v.weight / 3600);                                   // Mosteller 1987
      var dub = 0.007184 * Math.pow(v.weight, 0.425) * Math.pow(v.height, 0.725);         // Du Bois 1916
      return {
        value: fx(most, 2), unit: 'm²', label: 'BSA (Mosteller)', band: 'info', title: 'DuBois: ' + fx(dub, 2) + ' m²',
        interpretation: 'Use the formula your protocol specifies (most chemotherapy protocols accept Mosteller). Many protocols cap BSA or require a decision about actual versus adjusted weight in obesity.',
        details: [
          { label: 'Mosteller', value: fx(most, 3) + ' m²' },
          { label: 'DuBois & DuBois', value: fx(dub, 3) + ' m²' },
          { label: 'Absolute GFR factor (BSA ÷ 1.73)', value: fx(most / 1.73, 2) }
        ],
        warnings: []
      };
    },
    formula: 'Mosteller: BSA (m²) = √(height [cm] × weight [kg] ÷ 3600)\nDuBois: BSA (m²) = 0.007184 × weight^0.425 × height^0.725',
    pearls: [
      'DuBois was derived from only nine people in 1916; Mosteller is a simplification that agrees closely in adults.',
      'To convert an indexed eGFR (mL/min/1.73 m²) to absolute mL/min, multiply by BSA ÷ 1.73.'
    ],
    references: [R.mosteller1987, R.dubois1916]
  };

  var defIbw = {
    id: 'ideal-body-weight',
    name: 'Ideal body weight (Devine)',
    category: 'Anthropometrics',
    summary: 'Devine ideal body weight for drug dosing; equals ARDSNet predicted body weight.',
    keywords: ['ibw', 'ideal body weight', 'devine', 'predicted body weight', 'pbw', 'tidal volume', 'dosing'],
    inputs: [inSex(), inHeight(120, 230)],
    compute: function (v) {
      var fem = female(v), ibw = devineIbw(v.height, fem);
      if (ibw <= 0) return null;
      var warnings = v.height < 152.4 ? ['Height under 152 cm (5 ft): the formula extrapolates below its base height and becomes unreliable.'] : [];
      return {
        value: fx(ibw, 1), unit: 'kg', label: 'Ideal body weight (Devine)', band: 'info', title: (fem ? 'Female' : 'Male') + ', ' + fx(v.height, 0) + ' cm',
        interpretation: 'Use as the dosing weight only where a drug or protocol specifies ideal body weight; ventilator tidal volumes are set per kg of predicted (ideal) body weight, e.g. 6 mL/kg = ' + fx(6 * ibw, 0) + ' mL.',
        details: [
          { label: 'Height', value: fx(v.height, 1) + ' cm = ' + ft(v.height / 2.54, 1) + ' in' },
          { label: '6–8 mL/kg tidal volume', value: fx(6 * ibw, 0) + '–' + fx(8 * ibw, 0) + ' mL' }
        ],
        warnings: warnings
      };
    },
    formula: 'Men: 50 kg + 2.3 kg per inch over 5 ft (152.4 cm)\nWomen: 45.5 kg + 2.3 kg per inch over 5 ft\nMetric: 50 (or 45.5) + 0.91 × (height cm − 152.4)',
    pearls: [
      'Devine introduced the formula for gentamicin dosing in 1974; it was not derived from outcome data on “ideal” weight.',
      'The ARDSNet predicted body weight (50 or 45.5 + 0.91 × [cm − 152.4]) is the same formula in metric units.'
    ],
    references: [R.devine1974, R.ardsnet2000]
  };

  var defAdjBw = {
    id: 'adjusted-body-weight',
    name: 'Adjusted body weight',
    category: 'Anthropometrics',
    summary: 'Dosing weight for obesity: ideal body weight plus 40% of the excess.',
    keywords: ['adjusted body weight', 'abw', 'adjbw', 'dosing weight', 'obesity', 'aminoglycoside', 'ideal body weight'],
    inputs: [inSex(), inHeight(120, 230), inWeight(25, 350)],
    compute: function (v) {
      var fem = female(v), ibw = devineIbw(v.height, fem);
      if (ibw <= 0) return null;
      var pctIbw = v.weight / ibw * 100;
      var below = v.weight <= ibw;
      var abw = below ? v.weight : adjBw(ibw, v.weight);
      var warnings = v.height < 152.4 ? ['Height under 152 cm (5 ft): ideal body weight is extrapolated and uncertain.'] : [];
      return {
        value: fx(abw, 1), unit: 'kg', label: 'Adjusted body weight', band: 'info',
        title: below ? 'Actual weight is at or below ideal — use actual weight' : 'Actual weight ' + fx(pctIbw, 0) + '% of ideal',
        interpretation: below ? 'Adjustment only applies when actual weight exceeds ideal body weight.' : 'Adjusted weight is commonly used for aminoglycoside dosing and for Cockcroft–Gault in overweight or obese patients. Follow the drug-specific recommendation.',
        details: [
          { label: 'Ideal body weight (Devine)', value: fx(ibw, 1) + ' kg' },
          { label: 'Actual weight', value: fx(v.weight, 1) + ' kg (' + fx(pctIbw, 0) + '% of IBW)' },
          { label: 'BMI', value: fx(bmiOf(v), 1) + ' kg/m²' }
        ],
        warnings: warnings
      };
    },
    formula: 'Adjusted body weight = IBW + 0.4 × (actual weight − IBW)\nIBW (Devine) = 50 kg (men) or 45.5 kg (women) + 2.3 kg per inch over 5 ft',
    pearls: [
      'The 0.4 factor comes from aminoglycoside pharmacokinetics in obesity (Bauer 1983); other drugs use other scalars (e.g. 0.3 or lean body weight).',
      'For Cockcroft–Gault, adjusted weight was the least biased scalar in overweight and obese patients (Winter 2012).'
    ],
    references: [R.bauer1983, R.winter2012, R.devine1974]
  };

  var defLbw = {
    id: 'lean-body-weight',
    name: 'Lean body weight (Janmahasatian)',
    category: 'Anthropometrics',
    summary: 'Fat-free mass estimate for dosing in obesity, valid across extremes of body size.',
    keywords: ['lean body weight', 'lbw', 'fat-free mass', 'ffm', 'janmahasatian', 'dosing', 'obesity', 'anaesthesia'],
    inputs: [inSex(), inHeight(120, 230), inWeight(25, 350)],
    compute: function (v) {
      var fem = female(v), b = bmiOf(v);
      // Janmahasatian 2005: LBW = 9270 × TBW ÷ (6680 + 216 × BMI) in men; ÷ (8780 + 244 × BMI) in women.
      var lbw = 9270 * v.weight / (fem ? 8780 + 244 * b : 6680 + 216 * b);
      return {
        value: fx(lbw, 1), unit: 'kg', label: 'Lean body weight', band: 'info', title: fx(lbw / v.weight * 100, 0) + '% of total body weight',
        interpretation: 'Lean body weight approximates fat-free mass and is the recommended dosing scalar for some drugs in obesity. Check drug-specific guidance.',
        details: [{ label: 'BMI', value: fx(b, 1) + ' kg/m²' }, { label: 'Total body weight', value: fx(v.weight, 1) + ' kg' }],
        warnings: []
      };
    },
    formula: 'Men: LBW = 9270 × weight ÷ (6680 + 216 × BMI)\nWomen: LBW = 9270 × weight ÷ (8780 + 244 × BMI)\nWeight in kg, BMI in kg/m².',
    pearls: [
      'Developed against DXA in 373 adults with BMI 17–70 kg/m²; unlike the older James formula it does not fall paradoxically at very high weights.',
      'Not validated in children or pregnancy.'
    ],
    references: [R.janma2005]
  };

  var defWhtr = {
    id: 'waist-to-height',
    name: 'Waist-to-height ratio (NICE 2022)',
    category: 'Anthropometrics',
    summary: 'Central adiposity: keep your waist to less than half your height.',
    keywords: ['waist', 'waist to height', 'whtr', 'central obesity', 'abdominal obesity', 'nice', 'cardiometabolic'],
    inputs: [
      { id: 'waist', label: 'Waist circumference', type: 'number', units: LENGTH_UNITS, min: 40, max: 250, hint: 'Midway between the lowest rib and the top of the hip bone, after breathing out' },
      inHeight(100, 250)
    ],
    compute: function (v) {
      var r = v.waist / v.height, x = rnd(r, 2), c;
      // NICE CG189 (2022): 0.4–0.49 healthy central adiposity; 0.5–0.59 increased; ≥0.6 high.
      if (x >= 0.6) c = { band: 'danger', title: 'High central adiposity (≥0.6)', text: 'Further increased health risks (type 2 diabetes, hypertension, cardiovascular disease). Offer support to reduce weight and assess cardiometabolic risk.' };
      else if (x >= 0.5) c = { band: 'warn', title: 'Increased central adiposity (0.5–0.59)', text: 'Increased health risks: aim to keep the waist to less than half the height, and check cardiometabolic risk factors.' };
      else if (x >= 0.4) c = { band: 'ok', title: 'Healthy central adiposity (0.4–0.49)', text: 'No increased health risk from central adiposity.' };
      else c = { band: 'info', title: 'Below 0.4', text: 'Not classified by NICE; check BMI for underweight.' };
      return {
        value: fx(r, 2), label: 'Waist-to-height ratio', band: c.band, title: c.title, interpretation: c.text,
        details: [{ label: 'Waist for a ratio below 0.5', value: 'under ' + ft(v.height / 2, 1) + ' cm (' + ft(v.height / 2 / 2.54, 1) + ' in)' }],
        warnings: []
      };
    },
    formula: 'Waist-to-height ratio = waist circumference ÷ height (same units)\nNICE: 0.4–0.49 healthy · 0.5–0.59 increased health risk · ≥0.6 further increased health risk',
    pearls: [
      'NICE recommends it for adults with BMI under 35, of all ethnicities and both sexes.',
      'Not valid in pregnancy; interpret with care in conditions with ascites or abdominal masses.'
    ],
    references: [R.nice189]
  };

  return [
    defCha2ds2va, defCha2ds2vasc, defHasbled, defHeart, defTimi, defQtc, defMap, defFramLipid, defFramBmi,
    defWellsDvt, defWellsPe, defPerc, defGeneva,
    defCkdEpi, defCkdEpiCys, defCg, defKdigo, defUrineRatio,
    defChildPugh, defMeld, defMeldNa, defMeld3, defFib4, defApri,
    defBmi, defBsa, defIbw, defAdjBw, defLbw, defWhtr
  ];
});

# Scoring algorithms - research notes (compiled 2026-11-03)

## READ FIRST: verification limits of this session
- Web fetch was blocked for ALL hosts (ahajournals, PMC, ncbi, cran, github mirrors, rdrr.io, ucd.ie all failed DNS). Only WebSearch (summarised snippets), PubMed metadata and PMC full-text-as-text (tables stripped) worked.
- Therefore NO table below is "VERIFIED from primary table". Confidence labels used:
  - SECONDARY-CONFIRMED = value appeared in at least one secondary source returned in-session (supplement, R-package doc, secondary paper table).
  - TEXT-VERIFIED = stated in primary-paper prose retrieved via PubMed/PMC.
  - UNVERIFIED-MEMORY = reproduced from published instrument as known to the author; NOT checked in-session. Engineers must have a clinician/reviewer check against the primary table before shipping.
- Items 3 (INTERHEART points) and 4 (WHO 2019 coefficients) are NOT obtainable; see sections.

---
## 1. AHA Life's Essential 8 (LE8) - adult (age >=20) individual scoring
Each metric 0-100. Composite = unweighted mean of the 8 metric scores (TEXT-VERIFIED). Categories: 80-100 high; 50-79 moderate; 0-49 low (TEXT-VERIFIED).
Domains: behaviours (diet, PA, nicotine, sleep); factors (BMI, non-HDL, glucose, BP).

| Metric | Level | Points |
|---|---|---|
| Diet (MEPA 0-16 total) | 15-16 | 100 |
| | 12-14 | 80 |
| | 8-11 | 50 |
| | 4-7 | 25 |
| | 0-3 | 0 |
| Diet (population alternative, HEI-2015/DASH percentile; NOT for app) | >=95th / 75-94 / 50-74 / 25-49 / 1-24 | 100/80/50/25/0 |
| Physical activity (min/week moderate or vigorous) | >=150 | 100 |
| | 120-149 | 90 |
| | 90-119 | 80 |
| | 60-89 | 60 |
| | 30-59 | 40 |
| | 1-29 | 20 |
| | 0 | 0 |
| Nicotine exposure | Never smoker | 100 |
| | Former, quit >=5 y | 75 |
| | Former, quit 1 to <5 y | 50 |
| | Former, quit <1 y OR currently uses inhaled nicotine delivery system only (e-cig/vape) | 25 |
| | Current combustible smoker | 0 |
| | ADJUSTMENT: living with active indoor smoker | subtract 20 (floor 0) |
| Sleep (average h/night) | 7 to <9 | 100 |
| | 9 to <10 | 90 |
| | 6 to <7 | 70 |
| | 5 to <6 | 40 |
| | <5 and >=4 | 20 |
| | <4 or >=10 | 0 |
| BMI (kg/m2) | <25 | 100 |
| | 25.0-29.9 | 70 |
| | 30.0-34.9 | 30 |
| | 35.0-39.9 | 15 |
| | >=40 | 0 |
| Blood lipids (non-HDL-C, mg/dL) | <130 | 100 |
| | 130-159 | 60 |
| | 160-189 | 40 |
| | 190-219 | 20 |
| | >=220 | 0 |
| | ADJUSTMENT: drug-treated lipids | subtract 20 |
| Blood glucose, no diabetes | FPG <100 mg/dL (or HbA1c <5.7%) | 100 |
| | FPG 100-125 (HbA1c 5.7-6.4%) | 60 |
| Blood glucose, diabetes (HbA1c %) | <7.0 | 40 |
| | 7.0-7.9 | 30 |
| | 8.0-8.9 | 20 |
| | 9.0-9.9 | 10 |
| | >=10.0 | 0 |
| Blood pressure (mmHg) | <120 AND <80 | 100 |
| | 120-129 AND <80 | 75 |
| | 130-139 OR 80-89 | 50 |
| | 140-159 OR 90-99 | 25 |
| | >=160 OR >=100 | 0 |
| | ADJUSTMENT: treated BP | subtract 20 |
Rules: if systolic and diastolic fall in different rows use the LOWER score. Adjustments applied after base score, minimum 0.

Notes / conflicts
- Sleep, PA, nicotine (incl. -20 secondhand), PA ladder, MEPA bands, composite categories: SECONDARY-CONFIRMED or TEXT-VERIFIED. One 2024 study table lists BMI 25-29.9 = 75; AHA original believed 70 (UNVERIFIED-MEMORY; confirm). A 2025 BMC paper used a different nicotine ladder (70/40/20/0) - non-AHA; ignore.
- Sleep rows <7 h, non-HDL, glucose, BP ladders and the BP/lipid -20 treated adjustments: UNVERIFIED-MEMORY (not retrievable). Treat as must-check.
- Underweight (BMI <18.5) scores 100 under LE8 (known limitation, noted in TEXT of a 2024 study); consider an app-level caution.
- AHA states the table "should not be used as the sole guide for individuals" (TEXT-VERIFIED); present as a monitoring score, not a diagnosis.

### MEPA 16-item screener (Gardener/Rundek et al., Mediterranean Eating Pattern for Americans)
- Total 0-16, each item scored 0 or 1; maps to diet points as above (mapping SECONDARY-CONFIRMED from a PR citing Lloyd-Jones Table; 0-16 structure confirmed).
- Item verbatim wording and per-item thresholds: NOT RETRIEVED (original: Gardener H et al., J Acad Nutr Diet / Nutr J 2017, PMID 28168764). Item topics per secondary summary: olive oil, vegetables, fruit, whole grains, legumes, nuts, fish/seafood, red and processed meat, sweets, fast food/fried food, etc. DO NOT implement item text from this file; obtain the instrument from PMID 28168764 / AHA advisory supplement and have it reviewed (licence also to be checked).

Evidence for messaging (SECONDARY, verify before display)
- NHANES 2005-2018 (Ma et al., Circulation 2023): at age 50, high (80+) vs low (<50) LE8 -> about 8 more years total life expectancy (reported 33.4 vs 25.3 y; AHA release: ~7.5 y men, ~8.9 y women with highest vs lowest scores).
- UK Biobank (JAMA Intern Med 2023): ideal vs poor LE8 at age 50 -> roughly 5.2 y (men) and 6.3 y (women) longer total life expectancy; more years free of CVD/cancer/diabetes.
- Other: LE8 inversely associated with COPD (high vs low CVH adjusted OR 0.169, NHANES 2007-18; PMC11558873, TEXT-VERIFIED).

2023-2025 AHA updates relevant to an individual score (UNVERIFIED-MEMORY except where noted)
- PREVENT equations (Khan et al., Circulation 2024): 10- and 30-year total CVD, ASCVD, heart failure; base inputs age, sex, total-C, HDL-C, SBP, BP-treatment, diabetes, smoking, eGFR, statin use (+BMI for HF); optional UACR, HbA1c, SDI. Replaces Pooled Cohort Equations in 2025 AHA/ACC BP guideline for risk-based decisions.
- CKM (cardiovascular-kidney-metabolic) syndrome stages 0-4: AHA Presidential Advisory 2023 (Ndumele). LE8 is the suggested health-promotion frame.
- Healthy People 2030 methodology notes a 2024 revision broadening secondhand-smoke exposure beyond the home (SECONDARY).
Source: [Lloyd-Jones et al., Circulation 2022; DOI 10.1161/CIR.0000000000001078; PMID 35766027; PMC10503546]
Confidence: composite/categories TEXT-VERIFIED; MEPA bands, PA, nicotine SECONDARY-CONFIRMED; remaining rows (UNVERIFIED - primary table stripped from retrieved text; MEPA item wording not obtained)

---
## 2. FINDRISC (Lindstrom & Tuomilehto, Diabetes Care 2003;26:725)
| Item | Option | Points |
|---|---|---|
| Age | <45 / 45-54 / 55-64 / >64 | 0 / 2 / 3 / 4 |
| BMI | <25 / 25-30 / >30 | 0 / 1 / 3 |
| Waist, men | <94 / 94-102 / >102 cm | 0 / 3 / 4 |
| Waist, women | <80 / 80-88 / >88 cm | 0 / 3 / 4 |
| Physical activity >=30 min/day (or 4 h/wk) | yes / no | 0 / 2 |
| Vegetables, fruit or berries | every day / not every day | 0 / 1 |
| Ever taken antihypertensive medication | no / yes | 0 / 2 |
| Ever had high blood glucose (health exam, illness, pregnancy) | no / yes | 0 / 5 |
| Family history of diabetes | none / second-degree (grandparent, aunt, uncle, cousin) / first-degree (parent, sibling, child) | 0 / 3 / 5 |
Total 0-26.

| Total | Category | Est. 10-y risk of T2DM |
|---|---|---|
| <7 | Low | 1% (1 in 100) |
| 7-11 | Slightly elevated | 4% (1 in 25) |
| 12-14 | Moderate | 17% (1 in 6) |
| 15-20 | High | 33% (1 in 3) |
| >20 | Very high | 50% (1 in 2) |
- Items, points, age/waist/family/BMI ladders: SECONDARY-CONFIRMED (R package doc + 2024 tables). Band labels 1 in 100/25/6 confirmed via LOINC; 33% and 50% for 15-20 and >20 confirmed by secondary; 1%/4%/17% figures match standard FINDRISC (memory).
- Ethnicity adaptations (UNVERIFIED-MEMORY): no single validated Asian FINDRISC; common practice substitutes IDF South/East Asian waist cut-offs (men >=90, women >=80 as "increased") and Asian BMI (>=23 / >=27.5); published Indian/other variants use re-derived points and thresholds, so any substitution must be labelled "adapted, not validated". Common screen-positive threshold for testing: >=15 (secondary) (some adaptations 9-12).
Source: [Diabetes Care 2003;26(3):725-731; PMID 12610029]
Confidence: SECONDARY-CONFIRMED (not primary table)

---
## 3. INTERHEART Modifiable Risk Score (McGorrian, Eur Heart J 2011;32:581-589, doi 10.1093/eurheartj/ehq448; PMID 21177699)
- NOT OBTAINED. Point values per item were not retrievable (full paper and supplement unreachable). Do not implement from memory.
- Confirmed structure (secondary): non-laboratory tool has 9 components: age & sex, smoking (active/passive), diabetes, hypertension, family history of CVD, waist-hip ratio, psychosocial (stress, depression), diet, leisure-time physical activity. Non-lab maximum reported as 48 in later papers (SPICES), original text snippet said 32 (conflict). Cut-offs used in one Malaysian study (low 0-9, moderate 10-15, high 16-48) are local, not from derivation.
- Validation (abstract, confirmed): INTERHEART case-control n=19,470; split-sample c-statistic 0.71 (0.70-0.72); each 1-point increase ~12% higher MI odds in low-risk cohort; no gain from adding further modifiable factors in external cohort.
- Action: obtain the paper's Table (e.g. Eur Heart J full text or SPICES Table, PMC10733186) from a reachable network, then specify.
Confidence: (UNVERIFIED - point table not retrievable in this session)

---
## 4. WHO 2019 CVD risk charts, non-laboratory model (Kaptoge et al., Lancet Glob Health 2019;7:e1332; PMID 31488387; doi 10.1016/S2214-109X(19)30318-3; PMC7025029)
Obtained (TEXT-VERIFIED, from full text):
- Non-lab model inputs: age, smoking (current vs other), SBP, BMI. Lab model adds total cholesterol and diabetes history (non-lab has NO diabetes input; underperforms in diabetes - about 45% of men / 25% of women with diabetes at >20% risk on lab model are >20% on non-lab).
- Sex-specific, separate models for CHD (non-fatal MI + fatal CHD) and stroke (fatal + non-fatal); combined to one CVD risk after separate recalibration; assumes independence.
- Derivation: ERFC 85 cohorts, 376,177 people, ages 40-80, 19,333 events over 10 y; Cox, age interaction terms.
- Centring: age 60, SBP 120 mmHg, BMI 25, total cholesterol 6 mmol/L.
- Recalibration: age- and sex-specific mean risk-factor levels (NCD-RisC) and MI/stroke incidence (GBD 2017) for 21 GBD regions.
- Chart colours: >10% orange, >20% red (10-y risk).
- Internal C-index 0.666 (men non-lab) to 0.757 (women lab).
NOT obtainable in this session: coefficients, baseline survival, region parameters. Coefficients and recalibration inputs are in the paper's appendix / Stata program "whocvdrisk" (Kaptoge, Pennells). Open implementations exist: CRAN WHORiskCalculator v1.0.0 (2026-04-07; function calculate_who_risk_nonlab; get_regions()) and GitHub andredot/who_cvd_calculator (recalibration on complementary log-log scale; intercept/slope per region, sex, endpoint, model, year). Neither source code could be read (network blocked; GitHub access limited to this repo). Not attempted to reconstruct from memory.
Recommendation: STOP; engineering should vendor the CRAN/GitHub parameter tables after licence review and validate against published chart values. Mention non-lab limitation and 40-80 age range in UI.
Source: [Lancet Glob Health 2019; PMID 31488387]
Confidence: model description TEXT-VERIFIED; coefficients/recalibration (NOT OBTAINED)

---
## 5. Screening instruments (all UNVERIFIED-MEMORY of standard published versions unless noted)

### AUDIT-C (Bush 1998, Arch Intern Med)
| Q | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| 1 How often do you have a drink containing alcohol? | Never | Monthly or less | 2-4 times/month | 2-3 times/week | 4+ times/week |
| 2 Drinks on a typical drinking day | 1-2 | 3-4 | 5-6 | 7-9 | 10+ |
| 3 How often 6 or more drinks on one occasion? | Never | Less than monthly | Monthly | Weekly | Daily/almost daily |
Total 0-12. Positive: >=4 men, >=3 women (VA/US; Bradley 2007). UK/WHO usage: >=5 increasing/higher risk. Standard-drink size is national (US 14 g, UK 8 g, WHO 10 g ethanol); localise item 2 wording.

### PHQ-2 / PHQ-9 (Kroenke 2001, 2003)
Items scored 0 Not at all, 1 Several days, 2 More than half the days, 3 Nearly every day (past 2 weeks). PHQ-2 = items 1-2 (little interest; feeling down), range 0-6, positive >=3.
| PHQ-9 total (0-27) | Severity |
|---|---|
| 0-4 | None/minimal |
| 5-9 | Mild |
| 10-14 | Moderate |
| 15-19 | Moderately severe |
| 20-27 | Severe |
Cut-off >=10 for probable major depression (sens/spec ~88%). Item 9 (thoughts of being better off dead / self-harm): ANY response >0 (even "several days") must trigger a same-session safety message, crisis resources and recommendation for clinical assessment, regardless of total; never auto-diagnose. Add functional-difficulty question (not scored).

### GAD-2 / GAD-7 (Spitzer 2006)
GAD-2 = items 1-2 (nervous/on edge; unable to stop worrying), 0-6, positive >=3. GAD-7 items scored 0-3, range 0-21.
| GAD-7 | Severity |
|---|---|
| 0-4 | Minimal |
| 5-9 | Mild |
| 10-14 | Moderate |
| 15-21 | Severe |
Cut-off >=10 (sens 89%, spec 82%).

### STOP-BANG (Chung 2008/2016) - 1 point per Yes
Snoring loudly; Tired (daytime); Observed apnoea; Pressure (hypertension/treated); BMI >35; Age >50; Neck circumference >40 cm (16 in) (some use sex-specific: >43 cm men, >41 cm women); Gender male.
| Score | Risk of moderate-severe OSA |
|---|---|
| 0-2 | Low |
| 3-4 | Intermediate |
| 5-8 | High |
| or STOP >=2 AND (male OR BMI >35 OR neck >40 cm) | High |

### WHO TB screening
- Four-symptom screen (W4SS) for people living with HIV: current cough (any duration), fever, night sweats, weight loss; any one positive = presumptive TB, needs rapid molecular WHO-recommended test (mWRD). General population symptom definition commonly: cough >=2 weeks (+ haemoptysis, fever, night sweats, weight loss).
- WHO 2021 consolidated guidelines Module 2 (SECONDARY-CONFIRMED): for PLHIV, W4SS or CXR or CRP (>=5 mg/L) or mWRD options; CRP >=5 mg/L as alternative screen; CXR (human or computer-aided detection) recommended for 10+ (and PLHIV) as screening; W4SS+CRP sensitivity 0.84, specificity 0.64 (conference-deck figure). Adults/adolescents PLHIV on ART: CRP and CXR add value.
- Any 2025 changes to screening: NOT found (2025 updates found concerned treatment). UNVERIFIED - check WHO TB Knowledge Sharing Platform Module 2.
Source: [Kroenke Spitzer PHQ-9 J Gen Intern Med 2001 PMID 11556941; Spitzer GAD-7 Arch Intern Med 2006 PMID 16717171; Bush Arch Intern Med 1998 PMID 9738608; Chung Chest 2016; WHO TB Module 2 2021]
Confidence: (UNVERIFIED - not re-checked against primary tables in this session)

---
## 6. Sleep Regularity Index and Windred 2024
Phillips AJK et al., Sci Rep 2017;7:3216 (formula from memory, UNVERIFIED-MEMORY):
SRI = -100 + (200 / (M(N-1))) * SUM_{j=1..M} SUM_{i=1..N-1} delta(s_{i,j}, s_{i+1,j})
N = days, M = epochs per day (e.g., 1-min), s = 1 asleep / 0 awake, delta = 1 if the two states match. Range -100 (perfectly opposite) to +100 (perfectly regular); 0 = random. Interpretation: probability of being in same state at two time points 24 h apart, rescaled.
Diary approximation (design suggestion, not validated): build a day x time grid (15-min bins) from bed/wake times (naps optional); for each consecutive day pair, % agreement across 96 bins; SRI ~= 2 x mean% agreement - 100. Needs >=5 (ideally 7) consecutive days; label "diary-estimated". Midpoint-SD or bed/wake-time SD (minutes) are simpler alternatives.
Windred DP et al., Sleep 2024;47(1):zsad253 (SECONDARY-CONFIRMED): UK Biobank 60,977 participants, >10M h accelerometry, 1,859 deaths, median up to 7.8 y; top four SRI quintiles (SRI 71.6-98.5) had 20-48% lower all-cause mortality than the bottom quintile (SRI <71.6); also lower cancer and cardiometabolic mortality; SRI was a stronger mortality predictor than sleep duration. Earlier abstract: +1 SD SRI (10.7) -> 20.4% lower hazard (preliminary).
Source: [Phillips Sci Rep 2017; Windred Sleep 2024; DOI 10.1093/sleep/zsad253]
Confidence: Windred figures SECONDARY-CONFIRMED; SRI formula (UNVERIFIED - memory)

---
## 7. Blood pressure
2025 AHA/ACC guideline (Circulation/Hypertension 2025; doi 10.1161/CIRCULATIONAHA... / HYP.0000000000000249) categories retained from 2017 (SECONDARY-CONFIRMED); category set by higher of SBP/DBP; based on average of >=2 readings on >=2 occasions.
| Category | SBP | | DBP |
|---|---|---|---|
| Normal | <120 | and | <80 |
| Elevated | 120-129 | and | <80 |
| Stage 1 | 130-139 | or | 80-89 |
| Stage 2 | >=140 | or | >=90 |
- 2017/2025 home threshold equivalence (UNVERIFIED-MEMORY): home average >=130/80 corresponds to office >=130/80 (stage 1).
ESH 2023 (UNVERIFIED-MEMORY): office categories: optimal <120/<80; normal 120-129 and/or 80-84; high-normal 130-139 and/or 85-89; grade 1 140-159 and/or 90-99; grade 2 160-179 and/or 100-109; grade 3 >=180 and/or >=110; isolated systolic >=140 and <90. Hypertension thresholds: office >=140/90; home >=135/85; 24-h ABPM >=130/80 (day >=135/85, night >=120/70).
Home protocol (ESH/AHA consensus, UNVERIFIED-MEMORY): validated upper-arm cuff, seated 5 min, back/arm supported at heart level, no caffeine/exercise/smoking 30 min before; 2 readings 1-2 min apart morning (before meds/food) and evening; 7 consecutive days (minimum 3-4); discard day-1 readings; average all remaining readings. 2025 guideline confirms HBPM, validated devices, no cuffless devices (SECONDARY).
Urgent/emergency (AHA public guidance, UNVERIFIED-MEMORY on exact wording): reading >=180 systolic and/or >=120 diastolic: rest 5 min, retest. If still high WITHOUT symptoms: same-day clinician contact. If high WITH symptoms (chest pain, shortness of breath, back pain, numbness/weakness, vision change, difficulty speaking, confusion, severe headache, seizure) -> call emergency services (hypertensive emergency = severe BP + acute organ damage). 2025 guideline: >180/120 without organ damage managed promptly as outpatient (SECONDARY). Also advise urgent care for in pregnancy >=160/110.
Confidence: categories SECONDARY-CONFIRMED; remainder (UNVERIFIED - memory, check against guideline text)

---
## 8. Body measures (UNVERIFIED-MEMORY unless noted)
| Measure | Cut-off | Meaning |
|---|---|---|
| BMI (WHO) | <18.5 / 18.5-24.9 / 25-29.9 / >=30 | Under / normal / overweight / obese (I 30-34.9, II 35-39.9, III >=40) |
| BMI Asian (WHO 2004 expert consultation) | <18.5 / 18.5-22.9 / 23-27.4 / >=27.5 | Under / normal / increased risk / high risk (action points 23, 27.5, 32.5, 37.5) |
| Waist-to-height ratio (NICE 2022) | <0.5 (0.4-0.49 healthy) / 0.5-0.59 / >=0.6 | Low risk / increased risk / high risk. Boundary 0.5 = "keep waist < half your height" |
| WHO waist circumference | Men >=94 cm; women >=80 cm | Increased risk |
| | Men >=102 cm; women >=88 cm | Substantially increased risk |
| WHO waist-hip ratio | Men >=0.90; women >=0.85 | Abdominal obesity |
| IDF/Asian waist | Men >=90 cm; women >=80 cm | Central obesity (South/East Asian) |
Note NICE issued new overweight/obesity guidance in 2025 (NG246); confirm WHtR wording before display. Adult use only; BMI/WHtR not valid for children or pregnancy.
Source: [WHO Technical Report 894 (2000); WHO Lancet 2004;363:157 (PMID 14726171); WHO waist-hip consultation 2008; NICE CG189 (2022 update)]
Confidence: (UNVERIFIED - memory, no primary table retrieved)

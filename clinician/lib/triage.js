/* ==========================================================================
   MTLib.triage — South African Triage Scale (SATS), ADULT version.
   Pure logic, no DOM, no MT.

   Sources
   [1] Gottschalk SB, Wood D, DeVries S, Wallis LA, Bruijns S; Cape Triage Group.
       The Cape Triage Score: a new triage system South Africa. Proposal from the
       Cape Triage Group. Emerg Med J 2006;23:149-153. doi:10.1136/emj.2005.028332
   [2] Twomey M, Wallis LA, Myers JE. Limitations in validating emergency
       department triage scales. Emerg Med J 2007;24:477-479; and
       Twomey M et al. The South African Triage Scale (adult version) provides
       reliable acuity ratings. Int Emerg Nurs 2012;20:142-150.
   [3] Emergency Medicine Society of South Africa (EMSSA). The South African
       Triage Scale (SATS) Training Manual, 2012. emssa.org.za
       (adult = older than 12 years / taller than 150 cm).

   VERIFICATION STATUS (what was and was not confirmed when this file was written)
   - Colour decision from TEWS: >=7 red, 5-6 orange, 3-4 yellow, 0-2 green; target
     times red immediate, orange 10 min, yellow 60 min, green 240 min. Confirmed
     from several secondary sources quoting [1]-[3].
   - Adult TEWS grid layout (score columns 3 2 1 0 1 2 3): respiratory rate
     <9 | 9-14 | 15-20 | 21-29 | >29; pulse <=40 | 41-50 | 51-100 | 101-110 |
     111-129 | >=130; systolic BP <=70 | 71-80 | 81-100 | 101-199 | >=200;
     temperature <35 | 35-38.4 | >38.4; mobility walking / with help / stretcher;
     AVPU; trauma. Row positions confirmed from partial reproductions of [1]-[3];
     the individual point values are the published SATS values. Caveat: the
     trauma item (1 point) and the exact AVPU/mobility cells could not be read
     cell-by-cell in the extracts available; they follow the standard SATS chart.
     Clinicians should compare with their facility's printed chart.
   - The discriminator lists (emergency / very urgent / urgent) below are
     compiled from the published SATS adult chart as summarised in secondary
     sources; the complete chart in [3] contains more items. The UI states this,
     and offers a senior-clinician override for anything not listed.
   - PAEDIATRIC TEWS (younger/older child tables) is deliberately NOT implemented:
     the exact age-banded tables could not be verified.
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).triage = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLOURS = ['green', 'yellow', 'orange', 'red'];            // ascending urgency
  var RANK = { blue: -1, green: 0, yellow: 1, orange: 2, red: 3 };
  /** Maximum target time to be seen, minutes (SATS [3]). */
  var TARGET_MIN = { red: 0, orange: 10, yellow: 60, green: 240 };
  var COLOUR_LABEL = { red: 'RED — emergency', orange: 'ORANGE — very urgent', yellow: 'YELLOW — urgent', green: 'GREEN — routine' };
  var TARGET_TEXT = { red: 'Immediately', orange: 'Within 10 minutes', yellow: 'Within 60 minutes', green: 'Within 240 minutes (4 hours)' };

  /* --------------------------- TEWS item scoring -------------------------- */
  function isN(x) { return typeof x === 'number' && isFinite(x); }

  function scoreMobility(m) {
    if (m === 'walking') return 0;
    if (m === 'help') return 1;
    if (m === 'stretcher') return 2;
    return null;
  }
  /** Respiratory rate, breaths/min. <9:2  9-14:0  15-20:1  21-29:2  >29:3 */
  function scoreRR(rr) {
    if (!isN(rr) || rr < 0) return null;
    if (rr < 9) return 2;
    if (rr < 15) return 0;
    if (rr < 21) return 1;
    if (rr < 30) return 2;
    return 3;
  }
  /** Heart rate, beats/min. <=40:2  41-50:1  51-100:0  101-110:1  111-129:2  >=130:3 */
  function scoreHR(hr) {
    if (!isN(hr) || hr < 0) return null;
    if (hr < 41) return 2;
    if (hr < 51) return 1;
    if (hr < 101) return 0;
    if (hr < 111) return 1;
    if (hr < 130) return 2;
    return 3;
  }
  /** Systolic BP, mmHg. <=70:3  71-80:2  81-100:1  101-199:0  >=200:2 */
  function scoreSBP(sbp) {
    if (!isN(sbp) || sbp < 0) return null;
    if (sbp < 71) return 3;
    if (sbp < 81) return 2;
    if (sbp < 101) return 1;
    if (sbp < 200) return 0;
    return 2;
  }
  /** Temperature, deg C. <35:2  35-38.4:0  >38.4:2 */
  function scoreTemp(t) {
    if (!isN(t) || t < 20 || t > 45) return null;
    if (t < 35) return 2;
    if (t <= 38.4) return 0;
    return 2;
  }
  /** AVPU. Alert 0, Voice 1, Pain 2, Unresponsive 3 */
  function scoreAVPU(a) {
    return { A: 0, V: 1, P: 2, U: 3 }[a] === undefined ? null : { A: 0, V: 1, P: 2, U: 3 }[a];
  }
  /** Trauma (any injury/trauma presentation): yes 1, no 0 */
  function scoreTrauma(t) { return t === true ? 1 : t === false ? 0 : null; }

  var ITEMS = ['mobility', 'rr', 'hr', 'sbp', 'temp', 'avpu', 'trauma'];
  var SCORERS = { mobility: scoreMobility, rr: scoreRR, hr: scoreHR, sbp: scoreSBP, temp: scoreTemp, avpu: scoreAVPU, trauma: scoreTrauma };

  /**
   * Adult TEWS. input = { mobility:'walking'|'help'|'stretcher', rr, hr, sbp, temp, avpu:'A'|'V'|'P'|'U', trauma:boolean }
   * returns { total, parts:{item:score|null}, missing:[items], complete:boolean }
   * `total` sums the entered items only; callers must check `complete`.
   */
  function tews(input) {
    input = input || {};
    var parts = {}, missing = [], total = 0;
    ITEMS.forEach(function (k) {
      var s = SCORERS[k](input[k]);
      parts[k] = s;
      if (s == null) missing.push(k); else total += s;
    });
    return { total: total, parts: parts, missing: missing, complete: missing.length === 0 };
  }

  /** TEWS total → colour. 0-2 green, 3-4 yellow, 5-6 orange, >=7 red. */
  function colourFromTews(total) {
    if (!isN(total)) return null;
    if (total >= 7) return 'red';
    if (total >= 5) return 'orange';
    if (total >= 3) return 'yellow';
    return 'green';
  }

  /* ------------------------------ Discriminators -------------------------- */
  // Emergency signs: any one => RED, TEWS not needed (SATS [3]).
  var EMERGENCY = [
    { id: 'airway', label: 'Airway compromised / obstructed' },
    { id: 'notbreathing', label: 'Not breathing' },
    { id: 'arrest', label: 'Cardiac arrest' },
    { id: 'seizure-now', label: 'Seizure — currently fitting' },
    { id: 'burn-facial', label: 'Burn — facial / inhalation' },
    { id: 'hypo', label: 'Hypoglycaemia — glucose < 3 mmol/L' }
  ];
  // Very urgent discriminators: any one => at least ORANGE.
  var VERY_URGENT = [
    { id: 'sob-acute', label: 'Shortness of breath — acute' },
    { id: 'chest-pain', label: 'Chest pain' },
    { id: 'loc-reduced', label: 'Level of consciousness reduced' },
    { id: 'focal-neuro', label: 'Focal neurology — acute (e.g. new weakness, speech or facial droop)' },
    { id: 'seizure-post', label: 'Seizure — post-ictal' },
    { id: 'aggression', label: 'Aggression / psychosis — danger to self or others' },
    { id: 'poison', label: 'Poisoning / overdose' },
    { id: 'haem-uncontrolled', label: 'Haemorrhage — uncontrolled' },
    { id: 'cough-blood', label: 'Coughing blood' },
    { id: 'vomit-blood', label: 'Vomiting fresh blood' },
    { id: 'stabbed-neck', label: 'Stabbed neck' },
    { id: 'diabetic-keto', label: 'Diabetic — glucose > 11 mmol/L with ketonuria' },
    { id: 'preg-abd', label: 'Pregnancy with abdominal trauma or abdominal pain' },
    { id: 'burn-major', label: 'Burn — > 20 %, circumferential, chemical or electrical' },
    { id: 'limb', label: 'Threatened limb' },
    { id: 'dislocation-large', label: 'Dislocation of a large joint' },
    { id: 'fracture-compound', label: 'Fracture — compound (open)' },
    { id: 'eye', label: 'Eye injury' },
    { id: 'high-energy', label: 'Mechanism of injury — high energy transfer' },
    { id: 'pain-severe', label: 'Pain — severe' }
  ];
  // Urgent discriminators: any one => at least YELLOW.
  var URGENT = [
    { id: 'abd-pain', label: 'Abdominal pain' },
    { id: 'vomit-persist', label: 'Vomiting — persistent' },
    { id: 'diabetic-hyper', label: 'Diabetic — glucose > 17 mmol/L without ketonuria' },
    { id: 'haem-controlled', label: 'Haemorrhage — controlled / minor' },
    { id: 'fracture-closed', label: 'Fracture — closed' },
    { id: 'dislocation-small', label: 'Dislocation — finger / toe' },
    { id: 'burn-other', label: 'Burn — other' },
    { id: 'pain-moderate', label: 'Pain — moderate' }
  ];

  /* ----------------------------- Final priority --------------------------- */
  /** Is this an adult for the adult SATS? SATS [3]: older than 12 years or taller than 150 cm. */
  function ageGroup(ageYears, heightCm) {
    if (isN(ageYears)) { if (ageYears > 12) return 'adult'; if (ageYears >= 0) return 'child'; }
    if (isN(heightCm)) return heightCm > 150 ? 'adult' : 'child';
    return 'unknown';
  }

  function maxColour(a, b) { return (RANK[b] > RANK[a]) ? b : a; }

  /**
   * Combine everything into a final priority.
   * opts = { emergency:[ids], veryUrgent:[ids], urgent:[ids], tews: <result of tews()>|null,
   *          override: { colour, reason } | null, dead: boolean }
   * Highest of: emergency (red) / very urgent (orange) / urgent (yellow) / TEWS colour.
   * A senior-health-professional override replaces the computed colour (reason required to take effect).
   * Returns { colour, label, targetMin, targetText, computed, basis:[strings], tewsColour, overridden, incomplete }
   */
  function priority(opts) {
    opts = opts || {};
    if (opts.dead) return { colour: 'blue', label: 'BLUE — dead', targetMin: null, targetText: 'Confirm death per local policy', computed: 'blue', basis: ['Patient dead on arrival'], tewsColour: null, overridden: false, incomplete: false };
    var basis = [], colour = 'green';
    var em = (opts.emergency || []).filter(function (id) { return find(EMERGENCY, id); });
    var vu = (opts.veryUrgent || []).filter(function (id) { return find(VERY_URGENT, id); });
    var ug = (opts.urgent || []).filter(function (id) { return find(URGENT, id); });
    if (em.length) { colour = 'red'; em.forEach(function (id) { basis.push('Emergency sign: ' + find(EMERGENCY, id).label); }); }
    if (vu.length) { colour = maxColour(colour, 'orange'); vu.forEach(function (id) { basis.push('Very urgent: ' + find(VERY_URGENT, id).label); }); }
    if (ug.length) { colour = maxColour(colour, 'yellow'); ug.forEach(function (id) { basis.push('Urgent: ' + find(URGENT, id).label); }); }
    var tewsColour = null, incomplete = false;
    if (opts.tews) {
      tewsColour = colourFromTews(opts.tews.total);
      incomplete = !opts.tews.complete;
      if (opts.tews.missing && opts.tews.missing.length < ITEMS.length) {
        colour = maxColour(colour, tewsColour);
        basis.push('TEWS ' + opts.tews.total + (incomplete ? ' (incomplete)' : '') + ' → ' + tewsColour);
      }
    } else incomplete = true;
    var computed = colour, overridden = false;
    var ov = opts.override;
    if (ov && ov.colour && RANK[ov.colour] !== undefined && ov.colour !== 'blue' && ov.reason && String(ov.reason).replace(/\s/g, '').length >= 3) {
      if (ov.colour !== colour) { overridden = true; basis.push('Senior health professional override to ' + ov.colour + ': ' + String(ov.reason).trim()); colour = ov.colour; }
    }
    return { colour: colour, label: COLOUR_LABEL[colour], targetMin: TARGET_MIN[colour], targetText: TARGET_TEXT[colour], computed: computed, basis: basis, tewsColour: tewsColour, overridden: overridden, incomplete: incomplete };
  }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  return {
    COLOURS: COLOURS, RANK: RANK, TARGET_MIN: TARGET_MIN, COLOUR_LABEL: COLOUR_LABEL, TARGET_TEXT: TARGET_TEXT,
    ITEMS: ITEMS, EMERGENCY: EMERGENCY, VERY_URGENT: VERY_URGENT, URGENT: URGENT,
    scoreMobility: scoreMobility, scoreRR: scoreRR, scoreHR: scoreHR, scoreSBP: scoreSBP, scoreTemp: scoreTemp, scoreAVPU: scoreAVPU, scoreTrauma: scoreTrauma,
    tews: tews, colourFromTews: colourFromTews, ageGroup: ageGroup, priority: priority
  };
});

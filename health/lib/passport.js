/* Salus H4 — pure logic: health passport summary + IPS, prevention rules, heat/air maths.
 * No DOM, no MT. Strings returned here are English source text; the UI wraps them in MT.t().
 *
 * Sources (named where used below):
 *  - HL7 FHIR R4 + International Patient Summary IG (https://hl7.org/fhir/uv/ips/), LOINC section codes.
 *  - WHO "Summary of WHO Position Papers - Recommendations for Routine Immunization" (Tables 1 and 2).
 *  - WHO guideline for screening and treatment of cervical pre-cancer lesions (2021).
 *  - USPSTF final recommendations: breast 2024, colorectal 2021, lung 2021, prostate 2018, AAA 2019,
 *    osteoporosis 2018, HIV 2019, hepatitis C 2020, diabetes 2021, hypertension 2021.
 *  - US ACIP adult schedule (hep B 2022, pneumococcal 2024, RSV 2024/2025, zoster 2022). WHO has no routine
 *    adult position for zoster/RSV-in-older-adults, so those rows are labelled as US advice.
 *  - NOAA/NWS Rothfusz heat index regression (NWS Technical Attachment SR 90-23) with the NWS adjustments.
 *  - Stull R (2011) Wet-bulb temperature from relative humidity and air temperature, J Appl Meteorol Climatol 50:2267.
 *  - WHO Global Air Quality Guidelines 2021; WHO Global Solar UV Index guide (2002); US EPA AQI breakpoints.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).passport = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ dates */
  function pd(s) { if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate()); var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function addYears(d, y) { var whole = Math.floor(y), x = new Date(d.getFullYear() + whole, d.getMonth(), d.getDate()); var extraMonths = Math.round((y - whole) * 12); if (extraMonths) x.setMonth(x.getMonth() + extraMonths); return x; }
  function diffDays(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5); }
  function ageYears(dob, today) {
    var b = pd(dob), t = pd(today); if (!b || !t) return undefined;
    var a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a < 0 ? undefined : a;
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(pd(s)); }

  /* --------------------------------------------------------------- utf-8 size */
  function utf8Length(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /* ============================================================ 1. PASSPORT */
  var SECTIONS = [
    { id: 'id', label: 'Name, birth date, sex, blood group' },
    { id: 'allergies', label: 'Allergies' },
    { id: 'unwell', label: 'If I am found unwell' },
    { id: 'conditions', label: 'Health conditions' },
    { id: 'meds', label: 'Medicines' },
    { id: 'devices', label: 'Implants and devices' },
    { id: 'pregnancy', label: 'Pregnancy' },
    { id: 'contacts', label: 'Emergency contacts' },
    { id: 'vaccines', label: 'Vaccines' },
    { id: 'wishes', label: 'Organ donor and advance directive' }
  ];
  /* QR capacity (bytes, byte mode): v40 L 2953, M 2331, Q 1663, H 1273 (ISO/IEC 18004). Phone cameras read big QR codes
     poorly, so the presets stay well below the maximum. */
  var BUDGETS = { small: 450, standard: 900, large: 1800 };
  var QR_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

  function emptyPassport() {
    return { v: 1, updatedAt: null, id: { name: '', dob: '', sex: '', blood: '', lang: '' }, allergies: [], conditions: [], meds: [], vaccines: [], devices: [],
      pregnancy: { pregnant: false, due: '' }, contacts: [], donor: '', directive: '', unwell: '' };
  }
  function sexLetter(s) { return s === 'female' ? 'F' : s === 'male' ? 'M' : s === 'other' ? 'X' : ''; }
  function listOf(a, fn) { return (a || []).map(fn).filter(Boolean); }

  /* Each part: { id, lines:[ {text, items?:[...], label} ] } built in priority order. */
  function summaryParts(d, today) {
    var id = d.id || {}, parts = [], age = ageYears(id.dob, today);
    var head = [];
    if (clean(id.name)) head.push('Name: ' + clean(id.name));
    if (id.dob) head.push('Born: ' + id.dob + (age != null ? ' (' + age + 'y)' : ''));
    if (id.sex) head.push('Sex: ' + sexLetter(id.sex));
    if (id.blood) head.push('Blood: ' + id.blood);
    if (clean(id.lang)) head.push('Language: ' + clean(id.lang));
    if (head.length) parts.push({ id: 'id', label: '', items: head, sep: '  ' });
    var al = listOf(d.allergies, function (a) { if (!clean(a.substance)) return ''; var x = clean(a.substance); var r = []; if (clean(a.reaction)) r.push(clean(a.reaction)); if (a.severity) r.push(a.severity); return x + (r.length ? ' (' + r.join(', ') + ')' : ''); });
    parts.push({ id: 'allergies', label: 'ALLERGIES', items: al.length ? al : null, empty: 'none recorded' });
    if (clean(d.unwell)) parts.push({ id: 'unwell', label: 'IF FOUND UNWELL', items: [clean(d.unwell)], sep: ' ' });
    var co = listOf(d.conditions, function (c) { return clean(c.name); });
    if (co.length) parts.push({ id: 'conditions', label: 'CONDITIONS', items: co });
    var me = listOf(d.meds, function (m) { var n = clean(m.name); if (!n) return ''; return n + (clean(m.dose) ? ' ' + clean(m.dose) : ''); });
    if (me.length) parts.push({ id: 'meds', label: 'MEDICINES', items: me });
    var dv = listOf(d.devices, function (x) { return clean(x.name); });
    if (dv.length) parts.push({ id: 'devices', label: 'IMPLANTS', items: dv });
    if (d.pregnancy && d.pregnancy.pregnant) parts.push({ id: 'pregnancy', label: 'PREGNANT', items: [d.pregnancy.due ? 'yes, due ' + d.pregnancy.due : 'yes'], sep: ' ' });
    var ct = listOf(d.contacts, function (c) { if (!clean(c.name) && !clean(c.phone)) return ''; return clean(c.name) + (clean(c.relation) ? ' (' + clean(c.relation) + ')' : '') + (clean(c.phone) ? ' ' + clean(c.phone) : ''); });
    if (ct.length) parts.push({ id: 'contacts', label: 'CONTACT', items: ct });
    var vx = listOf(d.vaccines, function (v) { return clean(v.name) ? clean(v.name) + (v.date ? ' ' + v.date : '') : ''; });
    if (vx.length) parts.push({ id: 'vaccines', label: 'VACCINES', items: vx });
    var w = [];
    if (d.donor === 'yes') w.push('Organ donor: yes'); else if (d.donor === 'no') w.push('Organ donor: no');
    if (clean(d.directive)) w.push(clean(d.directive));
    if (w.length) parts.push({ id: 'wishes', label: 'WISHES', items: w, sep: ' ' });
    return parts;
  }
  function renderPart(p, items, more) {
    var sep = p.sep || '; ';
    var body = (items && items.length ? items.join(sep) : (p.empty || ''));
    if (more > 0) body += ' (+' + more + ' more)';
    return (p.label ? p.label + ': ' : '') + body;
  }
  /**
   * buildSummary(data, { sections:{id:bool}, maxBytes, today })
   * Plain text for a QR code. Sections are added in priority order; a section that does not fit is shortened
   * item by item ("(+2 more)"), and if even one item does not fit it is dropped. Returns
   * { text, bytes, truncated, dropped:[section ids], shortened:[section ids] }.
   */
  function buildSummary(d, opts) {
    opts = opts || {};
    var today = opts.today || ymd(new Date()), max = opts.maxBytes || BUDGETS.standard, sel = opts.sections || {};
    var headLine = 'HEALTH PASSPORT';
    var foot = 'Self-entered' + (d.updatedAt ? ', updated ' + String(d.updatedAt).slice(0, 10) : '') + '. Not a medical record.';
    var reserve = utf8Length(headLine + '\n' + foot + '\n(more details left out)\n');
    var lines = [], dropped = [], shortened = [], used = 0;
    summaryParts(d, today).forEach(function (p) {
      if (sel[p.id] === false) return;
      var cost = function (t) { return utf8Length(t) + 1; };
      var full = renderPart(p, p.items, 0);
      if (!p.items && p.id === 'allergies' && !opts.showEmptyAllergies) return;
      if (used + cost(full) + reserve <= max) { lines.push(full); used += cost(full); return; }
      // try fewer items, keeping the most important (first) ones
      var n = p.items ? p.items.length : 0, ok = false;
      for (var k = n - 1; k >= 1 && !ok; k--) {
        var t = renderPart(p, p.items.slice(0, k), n - k);
        if (used + cost(t) + reserve <= max) { lines.push(t); used += cost(t); shortened.push(p.id); ok = true; }
      }
      if (!ok && n >= 1) {
        // a single very long item: cut text (keeps allergy / unwell instruction partly readable)
        var room = max - used - reserve - utf8Length((p.label ? p.label + ': ' : '') + '…') - 1;
        if (room > 24) { var s = p.items[0]; while (s.length && utf8Length(s) > room) s = s.slice(0, -1); if (s.length > 8) { var tt = (p.label ? p.label + ': ' : '') + s.replace(/\s+\S*$/, '') + '…'; lines.push(tt); used += cost(tt); shortened.push(p.id); ok = true; } }
      }
      if (!ok) dropped.push(p.id);
    });
    var truncated = dropped.length > 0 || shortened.length > 0;
    var text = [headLine].concat(lines);
    if (truncated) text.push('(more details left out)');
    text.push(foot);
    text = text.join('\n');
    return { text: text, bytes: utf8Length(text), truncated: truncated, dropped: dropped, shortened: shortened };
  }
  /** Pick the smallest QR error-correction level whose capacity holds the text (L is the densest but still scans). */
  function qrLevelFor(bytes) { return bytes <= QR_CAPACITY.M ? 'M' : bytes <= QR_CAPACITY.L ? 'L' : null; }

  /* ---------- FHIR R4 International Patient Summary (shaped, not formally validated) ---------- */
  var LOINC = { allergies: '48765-2', meds: '10160-0', problems: '11450-4', immunizations: '11369-6', summaryDoc: '60591-5', results: '30954-2', devices: '46264-8', directives: '42348-3' };
  var SEV_FHIR = { mild: 'mild', moderate: 'moderate', severe: 'severe' };
  function narrative(txt) { return { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">' + String(txt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' }; }
  function stripDiv(div) { return String(div || '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  function sect(title, loinc, refs, emptyText) {
    var s = { title: title, code: { coding: [{ system: 'http://loinc.org', code: loinc, display: title }] }, text: narrative(refs.length ? refs.length + ' item(s)' : emptyText) };
    if (refs.length) s.entry = refs.map(function (r) { return { reference: r }; });
    else s.emptyReason = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason', code: 'unavailable' }] };
    return s;
  }
  function buildIps(d, opts) {
    opts = opts || {};
    var now = opts.now || new Date().toISOString(), entries = [];
    function add(res) { var u = 'urn:uuid:' + uuid(); entries.push({ fullUrl: u, resource: res }); return u; }
    var id = d.id || {};
    var patient = { resourceType: 'Patient', name: [{ text: clean(id.name) || 'Unknown' }] };
    if (id.sex === 'female' || id.sex === 'male' || id.sex === 'other') patient.gender = id.sex;
    if (id.dob) patient.birthDate = id.dob;
    if (clean(id.lang)) patient.communication = [{ language: { text: clean(id.lang) }, preferred: true }];
    var contacts = listOf(d.contacts, function (c) { return (clean(c.name) || clean(c.phone)) ? c : null; });
    if (contacts.length) patient.contact = contacts.map(function (c) { var o = { relationship: [{ text: clean(c.relation) || 'Emergency contact' }], name: { text: clean(c.name) } }; if (clean(c.phone)) o.telecom = [{ system: 'phone', value: clean(c.phone) }]; return o; });
    var compPlaceholder = { resourceType: 'Composition' };
    var compUrl = add(compPlaceholder), patUrl = add(patient);
    function subj() { return { reference: patUrl }; }
    var al = [], co = [], me = [], im = [], dv = [], rs = [];
    (d.allergies || []).forEach(function (a) {
      if (!clean(a.substance)) return;
      var r = { resourceType: 'AllergyIntolerance', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] }, code: { text: clean(a.substance) }, patient: subj() };
      if (a.severity === 'severe') r.criticality = 'high'; else if (a.severity) r.criticality = 'low';
      if (clean(a.reaction) || SEV_FHIR[a.severity]) { var re = { manifestation: [{ text: clean(a.reaction) || 'Reaction not described' }] }; if (SEV_FHIR[a.severity]) re.severity = SEV_FHIR[a.severity]; r.reaction = [re]; }
      al.push(add(r));
    });
    (d.conditions || []).forEach(function (c) { if (clean(c.name)) co.push(add({ resourceType: 'Condition', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, code: { text: clean(c.name) }, subject: subj() })); });
    (d.meds || []).forEach(function (m) { if (clean(m.name)) { var r = { resourceType: 'MedicationStatement', status: 'active', medicationCodeableConcept: { text: clean(m.name) }, subject: subj() }; if (clean(m.dose)) r.dosage = [{ text: clean(m.dose) }]; me.push(add(r)); } });
    (d.vaccines || []).forEach(function (v) { if (clean(v.name)) { var r = { resourceType: 'Immunization', status: 'completed', vaccineCode: { text: clean(v.name) }, patient: subj() }; if (v.date) r.occurrenceDateTime = v.date; else r.occurrenceString = 'unknown'; im.push(add(r)); } });
    (d.devices || []).forEach(function (x) { if (clean(x.name)) dv.push(add({ resourceType: 'DeviceUseStatement', status: 'active', subject: subj(), device: { display: clean(x.name) } })); });
    if (id.blood) rs.push(add({ resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '882-1', display: 'ABO and Rh group [Type] in Blood' }] }, subject: subj(), valueCodeableConcept: { text: id.blood } }));
    if (d.pregnancy && d.pregnancy.pregnant) { var po = { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '82810-3', display: 'Pregnancy status' }] }, subject: subj(), valueCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '77386006', display: 'Pregnant' }], text: 'Pregnant' } }; if (d.pregnancy.due) po.note = [{ text: 'Due ' + d.pregnancy.due }]; rs.push(add(po)); }
    var sections = [
      sect('Allergies and intolerances', LOINC.allergies, al, 'No information recorded'),
      sect('Medication summary', LOINC.meds, me, 'No information recorded'),
      sect('Problem list', LOINC.problems, co, 'No information recorded')
    ];
    if (im.length) sections.push(sect('Immunizations', LOINC.immunizations, im, ''));
    if (dv.length) sections.push(sect('Medical devices', LOINC.devices, dv, ''));
    if (rs.length) sections.push(sect('Results (blood group, pregnancy)', LOINC.results, rs, ''));
    [['unwell', 'Salus: If I am found unwell', d.unwell], ['donor', 'Salus: Organ donor', d.donor === 'yes' ? 'yes' : d.donor === 'no' ? 'no' : ''], ['directive', 'Salus: Advance directive', d.directive]].forEach(function (x) {
      if (clean(x[2])) sections.push({ title: x[1], code: { text: x[1] }, text: narrative(clean(x[2])) });
    });
    var comp = {
      resourceType: 'Composition', status: 'final',
      type: { coding: [{ system: 'http://loinc.org', code: LOINC.summaryDoc, display: 'Patient summary Document' }] },
      subject: subj(), date: now, author: [{ display: 'Self-entered by the patient (Salus)' }],
      title: 'International Patient Summary (IPS-shaped, not formally validated)', section: sections
    };
    entries[0].resource = comp;
    return {
      resourceType: 'Bundle', type: 'document', timestamp: now,
      identifier: { system: 'urn:ietf:rfc:3986', value: 'urn:uuid:' + uuid() },
      meta: { tag: [{ system: 'https://open-medical-toolkit.invalid/salus', code: 'ips-shaped-not-validated', display: 'IPS-shaped, not formally validated' }] },
      entry: entries
    };
  }
  /** Validate a parsed JSON value as an IPS-shaped bundle. Returns { ok, errors:[], warnings:[], counts }. */
  function validateIps(b) {
    var errors = [], warnings = [], counts = {};
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, errors: ['This file is not a health passport.'], warnings: warnings, counts: counts };
    if (b.resourceType !== 'Bundle') errors.push('The file is not a FHIR Bundle.');
    if (b.type !== 'document') errors.push('The Bundle type must be "document".');
    if (!Array.isArray(b.entry)) errors.push('The Bundle has no entries.');
    else {
      if (b.entry.length > 2000) errors.push('The file has too many entries.');
      b.entry.forEach(function (e, i) { if (!e || !e.resource || typeof e.resource.resourceType !== 'string') errors.push('Entry ' + (i + 1) + ' is not a valid resource.'); else counts[e.resource.resourceType] = (counts[e.resource.resourceType] || 0) + 1; });
      if (!counts.Patient) errors.push('There is no Patient resource.');
      else if (counts.Patient > 1) warnings.push('More than one Patient found; only the first is used.');
      if (!counts.Composition) warnings.push('There is no Composition (IPS sections). Resources are still read.');
      else { var c = b.entry[0] && b.entry[0].resource; if (c && c.resourceType === 'Composition' && Array.isArray(c.section)) { var codes = c.section.map(function (s) { return s && s.code && s.code.coding && s.code.coding[0] && s.code.coding[0].code; }); [LOINC.allergies, LOINC.meds, LOINC.problems].forEach(function (k) { if (codes.indexOf(k) < 0) warnings.push('IPS section ' + k + ' is missing.'); }); } }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, counts: counts };
  }
  function txt(cc) { return cc ? (cc.text || (cc.coding && cc.coding[0] && (cc.coding[0].display || cc.coding[0].code)) || '') : ''; }
  function cut(s, n) { return String(s == null ? '' : s).slice(0, n || 200); }
  /** Convert a validated IPS-shaped bundle back into passport data. Returns { data, skipped }. */
  function parseIps(b) {
    var d = emptyPassport(), skipped = 0, nid = 0;
    function nx() { return 'imp' + (++nid) + '-' + Math.random().toString(36).slice(2, 6); }
    var res = {}; (b.entry || []).forEach(function (e) { var r = e.resource; (res[r.resourceType] = res[r.resourceType] || []).push(r); });
    var p = (res.Patient || [])[0] || {};
    d.id.name = cut(p.name && p.name[0] && (p.name[0].text || [(p.name[0].given || []).join(' '), p.name[0].family].join(' ').trim()), 80);
    if (d.id.name === 'Unknown') d.id.name = '';
    if (/^(female|male|other)$/.test(p.gender || '')) d.id.sex = p.gender;
    if (isDate(p.birthDate)) d.id.dob = p.birthDate; else if (/^\d{4}$/.test(p.birthDate || '')) d.id.dob = p.birthDate + '-01-01';
    d.id.lang = cut(p.communication && p.communication[0] && txt(p.communication[0].language), 40);
    (p.contact || []).slice(0, 10).forEach(function (c) { d.contacts.push({ id: nx(), name: cut(c.name && c.name.text, 80), relation: cut(c.relationship && c.relationship[0] && c.relationship[0].text, 40), phone: cut(c.telecom && c.telecom[0] && c.telecom[0].value, 40) }); });
    (res.AllergyIntolerance || []).slice(0, 100).forEach(function (a) { var r = a.reaction && a.reaction[0]; var sev = r && r.severity; if (!sev) sev = a.criticality === 'high' ? 'severe' : ''; d.allergies.push({ id: nx(), substance: cut(txt(a.code), 100), reaction: cut(r && r.manifestation && r.manifestation[0] ? txt(r.manifestation[0]) : '', 100), severity: /^(mild|moderate|severe)$/.test(sev) ? sev : '' }); });
    (res.Condition || []).slice(0, 100).forEach(function (c) { d.conditions.push({ id: nx(), name: cut(txt(c.code), 100) }); });
    (res.MedicationStatement || []).slice(0, 100).forEach(function (m) { d.meds.push({ id: nx(), name: cut(txt(m.medicationCodeableConcept) || (m.medicationReference && m.medicationReference.display) || '', 100), dose: cut(m.dosage && m.dosage[0] && m.dosage[0].text, 100) }); });
    (res.Immunization || []).slice(0, 200).forEach(function (v) { var dt = v.occurrenceDateTime ? String(v.occurrenceDateTime).slice(0, 10) : ''; d.vaccines.push({ id: nx(), name: cut(txt(v.vaccineCode), 100), date: isDate(dt) ? dt : (/^\d{4}-\d{2}$/.test(dt) ? dt : '') }); });
    (res.DeviceUseStatement || []).slice(0, 50).forEach(function (x) { d.devices.push({ id: nx(), name: cut(x.device && x.device.display, 100) }); });
    (res.Observation || []).forEach(function (o) {
      var code = o.code && o.code.coding && o.code.coding[0] && o.code.coding[0].code;
      if (code === '882-1') { var bl = txt(o.valueCodeableConcept); d.id.blood = BLOOD.indexOf(bl) >= 0 ? bl : ''; }
      else if (code === '82810-3') { d.pregnancy.pregnant = true; var n = o.note && o.note[0] && o.note[0].text; var m = /(\d{4}-\d{2}-\d{2})/.exec(n || ''); if (m) d.pregnancy.due = m[1]; }
      else skipped++;
    });
    var comp = (res.Composition || [])[0];
    if (comp && Array.isArray(comp.section)) comp.section.forEach(function (s) {
      var t = s && s.code && s.code.text, body = cut(stripDiv(s.text && s.text.div), 500).trim();
      if (t === 'Salus: If I am found unwell') d.unwell = body; else if (t === 'Salus: Advance directive') d.directive = body; else if (t === 'Salus: Organ donor') d.donor = body === 'yes' ? 'yes' : body === 'no' ? 'no' : '';
    });
    ['allergies', 'conditions', 'meds', 'vaccines', 'devices', 'contacts'].forEach(function (k) { var n = d[k].length; d[k] = d[k].filter(function (x) { return (x.substance || x.name || x.phone); }); skipped += n - d[k].length; });
    return { data: d, skipped: skipped };
  }
  var BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  /** Merge imported data into current data (imported rows added if not already there). */
  function mergePassport(cur, inc) {
    var out = JSON.parse(JSON.stringify(cur));
    ['name', 'dob', 'sex', 'blood', 'lang'].forEach(function (k) { if (!out.id[k] && inc.id[k]) out.id[k] = inc.id[k]; });
    function key(x) { return (x.substance || x.name || x.phone || '').toLowerCase(); }
    ['allergies', 'conditions', 'meds', 'vaccines', 'devices', 'contacts'].forEach(function (k) {
      var have = {}; out[k].forEach(function (x) { have[key(x)] = 1; });
      inc[k].forEach(function (x) { if (!have[key(x)]) out[k].push(x); });
    });
    ['unwell', 'directive', 'donor'].forEach(function (k) { if (!out[k] && inc[k]) out[k] = inc[k]; });
    if (inc.pregnancy && inc.pregnancy.pregnant && !out.pregnancy.pregnant) out.pregnancy = inc.pregnancy;
    return out;
  }

  /* ========================================================== 2. PREVENTION */
  var FLAGS = {
    diabetes: /diabet/, heart: /heart|cardiac|coronary|stroke|atrial|angina/, lung: /copd|asthma|lung|emphysema|bronch/, kidney: /kidney|renal|ckd|dialysis/,
    liver: /liver|cirrho|hepatitis/, hiv: /\bhiv\b|aids/, immuno: /immun|cancer|transplant|chemo|steroid|\bhiv\b|lupus|leuk|lymphoma/, mental: /mental|depress|schizo|bipolar|psychos|anxiety/
  };
  /** Build the person model from profile + checkup results + user overrides. */
  function personFrom(profile, results, over, today) {
    profile = profile || {}; over = over || {}; results = results || {};
    var conds = (profile.conditions || []).map(function (c) { return String(c).toLowerCase().replace(/[_-]/g, ' '); });
    function flag(k) { if (over[k] != null && over[k] !== '') return !!over[k]; return conds.some(function (c) { return FLAGS[k].test(c); }); }
    var age; var dob = over.dob || '';
    if (dob && ageYears(dob, today) != null) age = ageYears(dob, today);
    else if (typeof profile.birthYear === 'number') age = pd(today).getFullYear() - profile.birthYear;
    else if (typeof profile.age === 'number') age = profile.age;
    var sm = over.smoking || profile.smoking;
    if (sm === true || sm === 'yes' || sm === 'current' || sm === 'smoker') sm = 'current'; else if (sm === 'former' || sm === 'ex' || sm === 'quit') sm = 'former'; else if (sm === false || sm === 'no' || sm === 'never') sm = 'never'; else sm = undefined;
    var bmi = (typeof profile.weightKg === 'number' && typeof profile.heightCm === 'number' && profile.heightCm > 0) ? profile.weightKg / Math.pow(profile.heightCm / 100, 2) : undefined;
    return {
      age: age, sex: over.sex || profile.sex, pregnant: over.pregnant != null ? !!over.pregnant : !!profile.pregnant,
      diabetes: flag('diabetes'), heart: flag('heart'), lung: flag('lung'), kidney: flag('kidney'), liver: flag('liver'), hiv: flag('hiv'), immuno: flag('immuno'),
      healthWorker: !!over.healthWorker, smoking: sm, packYears: typeof over.packYears === 'number' ? over.packYears : undefined, quitYearsAgo: typeof over.quitYearsAgo === 'number' ? over.quitYearsAgo : undefined,
      tbRisk: !!(over.tbRisk || (results.tb && results.tb.positive)), bmi: bmi, asian: profile.ancestry === 'asian'
    };
  }
  function atRisk(p) { return p.diabetes || p.heart || p.lung || p.kidney || p.liver || p.immuno || p.hiv; }
  var R = 'recommended', C = 'consider', D = 'discuss';
  var RULES = [
    /* ---------------- vaccines ---------------- */
    { id: 'flu', kind: 'vaccine', title: 'Flu (influenza) vaccine', icon: '💉', interval: 1,
      elig: function (p) { return (p.pregnant || p.age >= 65 || atRisk(p) || p.healthWorker) ? R : C; },
      who: 'Every year. Strongly advised if you are pregnant, 65 or older, have a long-term illness, or work in health care.',
      what: 'One injection (or nasal spray in some places) each year, before the flu season.', why: 'Flu can cause pneumonia, heart attacks and hospital stays in older people, pregnant women and people with long-term illness. The vaccine changes each year.',
      source: 'WHO position paper on influenza vaccines (2022) and WHO SAGE priority groups.' },
    { id: 'covid', kind: 'vaccine', title: 'COVID-19 vaccine', icon: '💉', interval: 1,
      elig: function (p) { return (p.age >= 60 || p.pregnant || atRisk(p) || p.healthWorker) ? R : null; },
      who: 'WHO SAGE high-priority groups: older adults, people with other illnesses or weak immunity, pregnant women and health workers. Higher-risk people may be advised a dose every 6 to 12 months.',
      what: 'A booster dose of the vaccine your country uses now.', why: 'It lowers the chance of severe illness and death in the groups most at risk.',
      source: 'WHO SAGE Roadmap for prioritizing uses of COVID-19 vaccines (updated 2023/2025).', note: 'Advice changes often. Ask your clinic what is offered now.' },
    { id: 'td', kind: 'vaccine', title: 'Tetanus and diphtheria booster (Td or Tdap)', icon: '💉', interval: 10,
      elig: function (p) { return p.age >= 15 ? R : null; },
      who: 'Everyone, with a booster about every 10 years. WHO aims for 6 doses over a lifetime.',
      what: 'One injection. After a dirty wound, a booster may be needed sooner if your last one was over 5 years ago.', why: 'Tetanus is deadly and can come from any dirty cut. Diphtheria can block the throat.',
      source: 'WHO position paper on tetanus vaccines (2017); WHO diphtheria position paper (2017).' },
    { id: 'tdap-preg', kind: 'vaccine', title: 'Tetanus (Td/Tdap) in every pregnancy', icon: '🤰', interval: null, once: false,
      elig: function (p) { return p.pregnant ? R : null; },
      who: 'Pregnant women. If you were never fully vaccinated you need at least 2 doses in pregnancy. Many countries give Tdap in every pregnancy, often at 27 to 36 weeks.',
      what: 'One or two injections during pregnancy.', why: 'It protects your newborn from tetanus and whooping cough (pertussis) in the first weeks of life.',
      source: 'WHO position paper on tetanus (2017); WHO pertussis position paper (2015).' },
    { id: 'rsv-mat', kind: 'vaccine', title: 'RSV vaccine in late pregnancy', icon: '🤰', interval: null,
      elig: function (p) { return p.pregnant ? C : null; },
      who: 'Pregnant women, in the third trimester, where the vaccine is available (single dose). In some places the baby gets an RSV antibody injection instead. Usually the mother or the baby gets one, not both.',
      what: 'One injection.', why: 'It protects young babies from severe RSV chest infections.',
      source: 'WHO RSV position paper (May 2025).' },
    { id: 'hepb', kind: 'vaccine', title: 'Hepatitis B vaccine', icon: '💉', interval: null, once: true,
      elig: function (p) { return (p.age >= 19 && p.age <= 59) || p.diabetes || p.hiv || p.liver || p.kidney || p.healthWorker ? R : (p.age >= 60 ? C : null); },
      who: 'If you have never had the 3-dose course. Advised for adults to age 59 in the US schedule, and for health workers and people with diabetes, liver or kidney disease or HIV in every country.',
      what: '2 or 3 injections over about 6 months.', why: 'Hepatitis B can silently damage the liver for years and cause liver cancer.',
      source: 'WHO hepatitis B position paper (2017); US ACIP adult schedule (2022).' },
    { id: 'hpv', kind: 'vaccine', title: 'HPV vaccine (catch-up)', icon: '💉', interval: null, once: true,
      elig: function (p) { return (p.age >= 9 && p.age <= 26) ? R : (p.age >= 27 && p.age <= 45 ? C : null); },
      who: 'Best at 9 to 14 years. WHO says a single dose works well for ages 9 to 20; from 21, or with weak immunity or HIV, 2 to 3 doses. Catch-up to age 26 in many schedules. At 27 to 45 it is a shared decision with your clinic.',
      what: 'One to three injections, depending on your age and health.', why: 'HPV causes almost all cervical cancer and many other cancers.',
      source: 'WHO HPV position paper (Dec 2022); US ACIP HPV catch-up advice.' },
    { id: 'pcv', kind: 'vaccine', title: 'Pneumococcal vaccine', icon: '💉', interval: null, once: true,
      elig: function (p) { return (p.age >= 65 || (p.age >= 19 && (atRisk(p) || p.smoking === 'current'))) ? R : (p.age >= 50 ? C : null); },
      who: 'Adults 65 and older, and younger adults with heart, lung, liver or kidney disease, diabetes, HIV, weak immunity or who smoke. The US schedule now starts at 50.',
      what: 'Usually one injection (a conjugate vaccine).', why: 'It protects against pneumonia, blood infection and meningitis from pneumococcus bacteria.',
      source: 'WHO pneumococcal position paper (2019); US ACIP adult schedule (2024).', note: 'WHO leaves adult use to each country.' },
    { id: 'zoster', kind: 'vaccine', title: 'Shingles (zoster) vaccine', icon: '💉', interval: null, once: true,
      elig: function (p) { return p.age >= 50 ? C : (p.age >= 19 && p.immuno ? C : null); },
      who: 'US advice: 2 doses of the recombinant vaccine from age 50, or from 19 with weak immunity. WHO has no routine recommendation, and many countries do not offer it free.',
      what: '2 injections, 2 to 6 months apart.', why: 'It prevents shingles and the long nerve pain that can follow.',
      source: 'US ACIP shingles recommendation (2022). No routine WHO position.' },
    { id: 'rsv-old', kind: 'vaccine', title: 'RSV vaccine for older adults', icon: '💉', interval: null, once: true,
      elig: function (p) { var risk = p.lung || p.heart || p.diabetes || p.kidney || p.immuno || p.liver; return p.age >= 75 ? R : (p.age >= 50 && risk ? R : (p.age >= 60 ? C : null)); },
      who: 'US advice: one dose for everyone 75 and older, and for ages 50 to 74 with lung or heart disease, diabetes, kidney disease or weak immunity. WHO has no routine older-adult recommendation yet.',
      what: 'One injection, ideally before the RSV season.', why: 'RSV can cause serious chest infections in older adults.',
      source: 'US ACIP RSV recommendations (June 2024; April 2025 update for ages 50 to 59).', note: 'Not available everywhere. Ask your clinic.' },
    /* ---------------- screening ---------------- */
    { id: 'cervical', kind: 'screening', title: 'Cervical cancer screening (HPV test)', icon: '🩺', interval: function (p) { return p.hiv ? 3 : 5; },
      elig: function (p) { if (p.sex !== 'female') return null; return (p.hiv ? p.age >= 25 : p.age >= 30) && p.age <= 65 ? R : (p.age >= 21 && p.age < 30 ? C : null); },
      who: 'Women from 30, every 5 to 10 years with an HPV DNA test. Women living with HIV: from 25, every 3 to 5 years. Women 21 to 29 can ask about a Pap test every 3 years (US advice).',
      what: 'A swab from the cervix. In many places you can collect the sample yourself.', why: 'It finds the virus or early changes years before cancer, when treatment is simple.',
      source: 'WHO guideline for screening and treatment of cervical pre-cancer lesions (2021); USPSTF cervical cancer 2018.', note: 'If you have had your cervix removed, you may not need this.' },
    { id: 'breast', kind: 'screening', title: 'Breast cancer screening (mammogram)', icon: '🩺', interval: 2,
      elig: function (p) { if (p.sex !== 'female') return null; return (p.age >= 50 && p.age <= 69) ? R : ((p.age >= 40 && p.age <= 74) ? C : null); },
      who: 'WHO: organised screening for ages 50 to 69. US task force: every 2 years from 40 to 74. At 40 to 49 and 70 to 74, talk it over with your clinic.',
      what: 'An X-ray of each breast, about every 2 years.', why: 'It can find breast cancer early, when it is easier to treat.',
      source: 'USPSTF breast cancer 2024; WHO position paper on mammography screening (2014).', note: 'See a health worker at any age if you feel a new lump, a skin change or nipple discharge.' },
    { id: 'colorectal', kind: 'screening', title: 'Bowel (colorectal) cancer screening', icon: '🩺', interval: 1,
      intervals: [{ label: 'Stool blood test (FIT), every year', years: 1 }, { label: 'Colonoscopy, every 10 years', years: 10 }, { label: 'Stool DNA test, every 3 years', years: 3 }],
      elig: function (p) { return (p.age >= 45 && p.age <= 75) ? (p.age >= 50 ? R : C) : null; },
      who: 'Ages 45 to 75 (US task force); 50 to 74 in many other countries.',
      what: 'A stool test at home, or a camera test of the bowel (colonoscopy).', why: 'It finds polyps and early cancer. Removing polyps can stop cancer from starting.',
      source: 'USPSTF colorectal cancer 2021.', note: 'Blood in your stool or a lasting change in bowel habit needs a clinic visit, not a screening test.' },
    { id: 'lung', kind: 'screening', title: 'Lung cancer screening (low-dose CT)', icon: '🩺', interval: 1,
      elig: function (p) { return (p.age >= 50 && p.age <= 80 && typeof p.packYears === 'number' && p.packYears >= 20 && (p.smoking === 'current' || (p.smoking === 'former' && typeof p.quitYearsAgo === 'number' && p.quitYearsAgo <= 15))) ? R : null; },
      who: 'Ages 50 to 80 who smoked at least 20 pack-years and still smoke or quit in the last 15 years. (A pack-year is a pack a day for a year.)',
      what: 'A quick low-dose CT scan of the chest every year.', why: 'It can find lung cancer early. The best protection is to stop smoking.',
      source: 'USPSTF lung cancer 2021.', note: 'Available in few countries. Stop-smoking help works at any age.' },
    { id: 'prostate', kind: 'screening', title: 'Prostate cancer (PSA blood test)', icon: '🩺', interval: null,
      elig: function (p) { return (p.sex === 'male' && p.age >= 55 && p.age <= 69) ? D : null; },
      who: 'Men 55 to 69: a shared decision. Talk with a clinician about the good and bad sides first. Not advised from 70.',
      what: 'A blood test (PSA). A high result leads to more tests.', why: 'It can find some cancers early, but it also finds slow cancers that would never cause harm.',
      source: 'USPSTF prostate cancer 2018.' },
    { id: 'bp', kind: 'screening', title: 'Blood pressure check', icon: '❤️', interval: 1, link: '#/bp',
      elig: function (p) { return p.age >= 18 ? R : null; },
      who: 'All adults, at least once a year. More often if it was high.', what: 'A quick arm-cuff reading, or log home readings.', why: 'High blood pressure has no signs but causes strokes, heart attacks and kidney disease.',
      source: 'WHO Global report on hypertension (2023/2025); USPSTF hypertension 2021.' },
    { id: 'diabetes', kind: 'screening', title: 'Diabetes risk check (blood sugar)', icon: '🩸', interval: 3, link: '#/checkup',
      elig: function (p) { if (p.diabetes) return null; return p.age >= 35 ? R : ((p.age >= 18 && p.bmi >= (p.asian ? 23 : 25)) ? C : null); },
      who: 'Every 3 years from age 35, and earlier if you are overweight (BMI 25 or more; 23 or more in Asian people) or have a close relative with diabetes.',
      what: 'A finger-prick or blood test (fasting glucose or HbA1c), or a risk questionnaire.', why: 'Many people with diabetes do not know it. Early care protects eyes, feet, kidneys and heart.',
      source: 'USPSTF prediabetes and type 2 diabetes 2021; IDF Diabetes Atlas 11th ed. (2025).' },
    { id: 'cholesterol', kind: 'screening', title: 'Cholesterol check', icon: '🩸', interval: 5,
      elig: function (p) { return p.age >= 40 ? R : (p.age >= 20 ? C : null); },
      who: 'Adults from 40 every 5 years (more often if high). From age 20 if you have family heart disease.', what: 'A blood test for cholesterol (lipids).', why: 'High cholesterol raises the risk of heart attack and stroke and can be treated.',
      source: 'AHA/ACC cholesterol guideline 2018 (check every 4 to 6 years from age 20).' },
    { id: 'hiv', kind: 'screening', title: 'HIV test', icon: '🧪', interval: null, once: true,
      elig: function (p) { return (p.age >= 15 && p.age <= 65) ? R : null; },
      who: 'Everyone aged 15 to 65 at least once, and again after any new risk. Pregnant women in every pregnancy. A private self-test kit is an option.',
      what: 'A finger-prick or mouth-swab test (results in minutes) or a blood test.', why: 'Treatment today keeps people with HIV healthy and prevents passing it on.',
      source: 'USPSTF HIV 2019; WHO guidelines on HIV self-testing (2016/2019).' },
    { id: 'hepbc', kind: 'screening', title: 'Hepatitis B and C test', icon: '🧪', interval: null, once: true,
      elig: function (p) { return p.age >= 18 ? R : null; },
      who: 'Every adult at least once. More often with ongoing risk.', what: 'A blood test.', why: 'Both can damage the liver silently for years. Hepatitis C can now be cured, and hepatitis B can be controlled.',
      source: 'USPSTF hepatitis C 2020; CDC universal hepatitis B screening 2023; WHO hepatitis testing guidelines.' },
    { id: 'tb', kind: 'screening', title: 'Tuberculosis (TB) check', icon: '🧪', interval: null, urgent: true,
      elig: function (p) { return (p.tbRisk || p.hiv) ? R : null; },
      who: 'If you have a cough for 2 weeks or more, fever, night sweats or weight loss, have lived with someone who has TB, or have HIV.',
      what: 'A sputum test or chest X-ray at a clinic. It is free in most countries.', why: 'TB is curable, but untreated it spreads and can kill.',
      source: 'WHO consolidated guidelines on TB screening (2021).' },
    { id: 'eye-dm', kind: 'screening', title: 'Diabetes eye check', icon: '👁️', interval: 1,
      elig: function (p) { return p.diabetes ? R : null; }, who: 'Everyone with diabetes, every year.', what: 'An eye doctor looks at the back of your eye.', why: 'Diabetes can harm the eye without any change in your sight until late.', source: 'ADA Standards of Care in Diabetes (2025), retinopathy.' },
    { id: 'foot-dm', kind: 'screening', title: 'Diabetes foot check', icon: '🦶', interval: 1,
      elig: function (p) { return p.diabetes ? R : null; }, who: 'Everyone with diabetes, every year (more often if you have numb feet). Check your own feet every day.', what: 'A health worker checks feeling, pulses and skin on your feet.', why: 'Numb feet can get sores that you do not notice. These can lead to amputation.', source: 'ADA Standards of Care in Diabetes (2025), foot care; IWGDF guidance.' },
    { id: 'kidney-dm', kind: 'screening', title: 'Kidney check (urine and blood)', icon: '🧪', interval: 1,
      elig: function (p) { return (p.diabetes || p.kidney) ? R : null; }, who: 'People with diabetes or kidney disease, every year.', what: 'A urine test for protein and a blood test for kidney function.', why: 'Kidney damage is silent early on and can be slowed if found.', source: 'ADA Standards of Care in Diabetes (2025); KDIGO 2024.' },
    { id: 'dental', kind: 'screening', title: 'Dental check', icon: '🦷', interval: 1,
      elig: function (p) { return p.age >= 3 ? R : null; }, who: 'Once a year, or as your dentist advises.', what: 'A dentist checks teeth and gums.', why: 'Gum disease and decay are common, painful and linked to heart disease and diabetes.', source: 'WHO oral health fact sheet.' },
    { id: 'vision', kind: 'screening', title: 'Eye and vision check', icon: '👁️', interval: function (p) { return p.age >= 65 ? 1 : 2; },
      elig: function (p) { return p.age >= 40 ? R : null; }, who: 'From 40, every 2 years; every year from 65.', what: 'An eye test and a check of eye pressure.', why: 'Glaucoma and cataract are common and treatable. Glasses can change a life.', source: 'American Academy of Ophthalmology preferred practice pattern; WHO World report on vision (2019).' },
    { id: 'hearing', kind: 'screening', title: 'Hearing check', icon: '👂', interval: 3,
      elig: function (p) { return p.age >= 50 ? R : null; }, who: 'From 50, about every 3 years, or any time you have trouble hearing.', what: 'A short hearing test.', why: 'Hearing loss is common and linked to isolation and memory problems. Hearing aids help.', source: 'WHO World report on hearing (2021); ASHA adult screening guidance.' },
    { id: 'bone', kind: 'screening', title: 'Bone density scan (osteoporosis)', icon: '🦴', interval: null,
      elig: function (p) { return (p.sex === 'female' && p.age >= 65) ? R : null; }, who: 'Women 65 and older. Younger women after menopause with high risk can ask too.', what: 'A painless low-dose X-ray scan (DXA) of hip and spine.', why: 'Weak bones break easily. Treatment and falls prevention lower the risk.', source: 'USPSTF osteoporosis 2018.' },
    { id: 'aaa', kind: 'screening', title: 'Aortic aneurysm ultrasound (once)', icon: '❤️', interval: null, once: true,
      elig: function (p) { return (p.sex === 'male' && p.age >= 65 && p.age <= 75 && (p.smoking === 'current' || p.smoking === 'former')) ? R : null; }, who: 'Men 65 to 75 who have ever smoked: one ultrasound of the belly.', what: 'A painless ultrasound of the main blood vessel in your belly.', why: 'A swollen aorta has no signs, and if it bursts it is often deadly.', source: 'USPSTF abdominal aortic aneurysm 2019.' },
    { id: 'anc', kind: 'screening', title: 'Antenatal check-ups (pregnancy)', icon: '🤰', interval: null,
      elig: function (p) { return p.pregnant ? R : null; }, who: 'At least 8 visits: by 12 weeks, then at 20, 26, 30, 34, 36, 38 and 40 weeks. Include tests for HIV, syphilis, hepatitis B, anaemia and blood pressure.', what: 'Check-ups with a midwife or doctor.', why: 'They find problems early and make birth safer for you and your baby.', source: 'WHO recommendations on antenatal care for a positive pregnancy experience (2016).', link: '#/get-help' }
  ];

  /** Evaluate the rules for a person. Returns { items, missing:[...] }. Items carry level 'recommended'|'consider'|'discuss'. */
  function evaluate(p, today) {
    var missing = [];
    if (p.age == null) missing.push('age');
    if (!p.sex) missing.push('sex');
    var items = [];
    if (p.age == null) return { items: items, missing: missing };
    RULES.forEach(function (r) {
      var lvl;
      try { lvl = r.elig(p); } catch (e) { lvl = null; }
      if (!lvl) return;
      items.push({ id: r.id, kind: r.kind, title: r.title, icon: r.icon, level: lvl, interval: typeof r.interval === 'function' ? r.interval(p) : r.interval, intervals: r.intervals || null, once: !!r.once, who: r.who, what: r.what, why: r.why, source: r.source, note: r.note || '', link: r.link || '', urgent: !!r.urgent });
    });
    return { items: items, missing: missing };
  }
  /** Attach a due status. rec = { date:'YYYY-MM-DD', years?:number } or null. */
  function withStatus(item, rec, today) {
    var t = pd(today), out = Object.assign({}, item, { lastDate: null, nextDate: null, status: 'check' });
    var years = rec && rec.years ? rec.years : item.interval;
    if (rec && isDate(rec.date)) {
      out.lastDate = rec.date;
      if (item.once || !years) { out.status = 'ok'; return out; }
      var nxt = addYears(pd(rec.date), years); out.nextDate = ymd(nxt);
      var left = diffDays(t, nxt);
      out.status = left < 0 ? 'overdue' : left <= 60 ? 'soon' : 'ok';
      out.daysLeft = left;
      return out;
    }
    out.status = item.level === R ? 'check' : item.level === D ? 'discuss' : 'consider';
    return out;
  }
  function summarise(list) {
    var c = { overdue: 0, check: 0, soon: 0, ok: 0, consider: 0, discuss: 0 };
    list.forEach(function (i) { if (c[i.status] != null && (i.level === R || i.status === 'overdue')) c[i.status]++; });
    return c;
  }

  /* ----- Child schedule: typical WHO EPI (Table 2, Dec 2025 edition). Days are from birth. ----- */
  var WK = 7, MO = function (m) { return Math.round(m * 30.4375); }, YR = function (y) { return Math.round(y * 365.25); };
  var CHILD_DOSES = [
    { id: 'bcg', vac: 'BCG (tuberculosis)', dose: 'Single dose', due: 0, grace: 14, note: 'At birth, or as soon as possible. Used where TB is common.' },
    { id: 'hepb0', vac: 'Hepatitis B', dose: 'Birth dose', due: 0, grace: 1, note: 'Best within 24 hours of birth.' },
    { id: 'opv0', vac: 'Oral polio (OPV)', dose: 'Birth dose', due: 0, grace: 14, optional: true, note: 'Only in countries that give a birth dose.' },
    { id: 'penta1', vac: 'DTP-HepB-Hib (pentavalent)', dose: 'Dose 1', due: 6 * WK },
    { id: 'opv1', vac: 'Oral polio (OPV)', dose: 'Dose 1', due: 6 * WK },
    { id: 'pcv1', vac: 'Pneumococcal (PCV)', dose: 'Dose 1', due: 6 * WK },
    { id: 'rota1', vac: 'Rotavirus', dose: 'Dose 1', due: 6 * WK, grace: 70, note: 'Must start before 15 weeks of age in most schedules.' },
    { id: 'penta2', vac: 'DTP-HepB-Hib (pentavalent)', dose: 'Dose 2', due: 10 * WK },
    { id: 'opv2', vac: 'Oral polio (OPV)', dose: 'Dose 2', due: 10 * WK },
    { id: 'pcv2', vac: 'Pneumococcal (PCV)', dose: 'Dose 2', due: 10 * WK },
    { id: 'rota2', vac: 'Rotavirus', dose: 'Dose 2', due: 10 * WK, grace: 120, note: 'Some brands need a third dose at 14 weeks.' },
    { id: 'penta3', vac: 'DTP-HepB-Hib (pentavalent)', dose: 'Dose 3', due: 14 * WK },
    { id: 'opv3', vac: 'Oral polio (OPV)', dose: 'Dose 3', due: 14 * WK },
    { id: 'ipv1', vac: 'Inactivated polio (IPV)', dose: 'Dose 1', due: 14 * WK, note: 'Given from 14 weeks. Some countries give a second dose at 9 months.' },
    { id: 'pcv3', vac: 'Pneumococcal (PCV)', dose: 'Dose 3', due: 14 * WK, note: 'Some countries use 2 doses plus a booster at 9 months instead.' },
    { id: 'mr1', vac: 'Measles-rubella', dose: 'Dose 1', due: MO(9), note: 'At 9 months. In outbreaks it can be given from 6 months.' },
    { id: 'yf', vac: 'Yellow fever', dose: 'Single dose', due: MO(9), optional: true, note: 'Only in countries with yellow fever risk.' },
    { id: 'dtp-b1', vac: 'DTP booster', dose: 'Booster 1', due: MO(12), grace: 180, note: 'Between 12 and 23 months.' },
    { id: 'mr2', vac: 'Measles-rubella', dose: 'Dose 2', due: MO(15), grace: 90, note: 'At 15 to 18 months.' },
    { id: 'dtp-b2', vac: 'Tetanus-diphtheria booster', dose: 'Booster 2', due: YR(4), grace: 1100, note: 'At 4 to 7 years (school entry).' },
    { id: 'hpv', vac: 'HPV', dose: 'Single dose', due: YR(9), grace: YR(6), note: 'At 9 to 14 years. WHO says one dose is enough for healthy children.' },
    { id: 'td-b3', vac: 'Tetanus-diphtheria booster', dose: 'Booster 3', due: YR(9), grace: YR(6), note: 'At 9 to 15 years.' }
  ];
  /** child status: given = { doseId: true|'YYYY-MM-DD' }. Returns rows with status given|overdue|due|upcoming|optional. */
  function childSchedule(dob, given, today) {
    var b = pd(dob), t = pd(today); given = given || {};
    if (!b || !t) return null;
    var days = diffDays(b, t); if (days < 0) return null;
    var rows = CHILD_DOSES.map(function (d) {
      var dueDate = addDays(b, d.due), grace = d.grace == null ? 28 : d.grace, st;
      if (given[d.id]) st = 'given';
      else if (days < d.due - 14) st = 'upcoming';
      else if (days < d.due) st = 'soon';
      else if (days <= d.due + grace) st = 'due';
      else st = 'overdue';
      return { id: d.id, vac: d.vac, dose: d.dose, note: d.note || '', optional: !!d.optional, dueDate: ymd(dueDate), dueDays: d.due, status: st, ageDays: days, givenOn: typeof given[d.id] === 'string' ? given[d.id] : '' };
    });
    return { ageDays: days, ageYears: ageYears(dob, today), rows: rows, beyondChild: ageYears(dob, today) >= 18 };
  }
  function ageLabel(days) {
    if (days < 28) return { n: days, unit: 'days' };
    if (days < 120) return { n: Math.floor(days / 7), unit: 'weeks' };
    if (days < 730) return { n: Math.floor(days / 30.4375), unit: 'months' };
    return { n: Math.floor(days / 365.25), unit: 'years' };
  }

  /* ========================================================== 3. ENVIRONMENT */
  function cToF(c) { return c * 9 / 5 + 32; }
  function fToC(f) { return (f - 32) * 5 / 9; }
  /** NOAA/NWS heat index (Rothfusz regression + adjustments), inputs/outputs in deg F and % RH. Below ~80F the simple formula is used. */
  function heatIndexF(T, RH) {
    var simple = 0.5 * (T + 61 + (T - 68) * 1.2 + RH * 0.094);
    if ((simple + T) / 2 < 80) return simple;
    var hi = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH - 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
    if (RH < 13 && T >= 80 && T <= 112) hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    else if (RH > 85 && T >= 80 && T <= 87) hi += ((RH - 85) / 10) * ((87 - T) / 5);
    return hi;
  }
  function heatIndexC(tC, RH) { return fToC(heatIndexF(cToF(tC), RH)); }
  /** Stull (2011) wet-bulb temperature, deg C and % RH (valid for RH 5-99%, T -20..50 C). */
  function wetBulbC(T, RH) {
    return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331) + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
  }
  var HEAT_LEVELS = [
    { level: 0, key: 'low', label: 'Low heat risk', type: 'ok' },
    { level: 1, key: 'caution', label: 'Caution', type: 'info' },
    { level: 2, key: 'extreme-caution', label: 'Extreme caution', type: 'warn' },
    { level: 3, key: 'danger', label: 'Danger', type: 'danger' },
    { level: 4, key: 'extreme-danger', label: 'Extreme danger', type: 'danger' }
  ];
  /** NWS heat-index bands (F): <80 low; 80-90 caution; 90-103 extreme caution; 103-125 danger; >=125 extreme danger. */
  function heatLevelFromFeelsC(c) { var f = cToF(c); return f >= 125 ? 4 : f >= 103 ? 3 : f >= 90 ? 2 : f >= 80 ? 1 : 0; }
  /**
   * heatRisk({ tempC, rh, apparentC? }, vulnerable) - feels-like is the higher of the heat index and the supplied apparent temperature.
   * Wet-bulb floors: >=28 C is at least level 2, >=31 C at least level 3 (research on human limits is about 31 C in humid heat; conservative here).
   * Vulnerable people move up one level once any heat risk exists.
   */
  function heatRisk(o, vulnerable) {
    var hi = heatIndexC(o.tempC, o.rh), feels = typeof o.apparentC === 'number' ? Math.max(hi, o.apparentC) : hi;
    var wb = wetBulbC(o.tempC, Math.min(99, Math.max(5, o.rh)));
    var lvl = heatLevelFromFeelsC(feels);
    if (wb >= 31) lvl = Math.max(lvl, 3); else if (wb >= 28) lvl = Math.max(lvl, 2);
    var base = lvl;
    if (vulnerable && lvl >= 1) lvl = Math.min(4, lvl + 1);
    var meta = HEAT_LEVELS[lvl];
    return { heatIndexC: hi, feelsC: feels, wetBulbC: wb, level: lvl, baseLevel: base, label: meta.label, type: meta.type, raised: lvl !== base };
  }
  var DRUG_GROUPS = {
    diuretic: { label: 'water tablet (diuretic)', re: /furosemide|frusemide|hydrochlorothiazide|\bhctz\b|chlorthalidone|indapamide|spironolactone|bumetanide|torsemide|torasemide|amiloride|water (pill|tablet)|diuretic/i },
    anticholinergic: { label: 'anticholinergic medicine', re: /oxybutynin|tolterodine|solifenacin|amitriptyline|diphenhydramine|promethazine|hyoscine|scopolamine|benztropine|trihexyphenidyl|atropine|chlorphenamine|hydroxyzine|imipramine|nortriptyline/i },
    antipsychotic: { label: 'antipsychotic', re: /haloperidol|risperidone|olanzapine|quetiapine|clozapine|chlorpromazine|aripiprazole|paliperidone|fluphenazine|lithium/i },
    betablocker: { label: 'beta-blocker', re: /atenolol|metoprolol|propranolol|bisoprolol|carvedilol|nebivolol|labetalol|nadolol|sotalol|timolol/i },
    other: { label: 'medicine that can dry you out (ACE inhibitor, ARB or SGLT2 inhibitor)', re: /lisinopril|enalapril|ramipril|perindopril|captopril|losartan|valsartan|candesartan|telmisartan|irbesartan|dapagliflozin|empagliflozin|canagliflozin/i }
  };
  /** Vulnerability factors. input: { age, pregnant, conditionsText:[], medNames:[] }. Returns [{id,label}]. */
  function vulnerability(o) {
    var f = [], conds = (o.conditionsText || []).join(' | ').toLowerCase().replace(/[_-]/g, ' ');
    if (typeof o.age === 'number' && o.age >= 65) f.push({ id: 'age65', label: 'Age 65 or older' });
    if (typeof o.age === 'number' && o.age < 5) f.push({ id: 'age5', label: 'Child under 5' });
    if (o.pregnant) f.push({ id: 'pregnant', label: 'Pregnancy' });
    if (FLAGS.heart.test(conds)) f.push({ id: 'heart', label: 'Heart disease' });
    if (FLAGS.kidney.test(conds)) f.push({ id: 'kidney', label: 'Kidney disease' });
    if (FLAGS.diabetes.test(conds)) f.push({ id: 'diabetes', label: 'Diabetes' });
    if (FLAGS.mental.test(conds)) f.push({ id: 'mental', label: 'Mental health condition' });
    if (FLAGS.lung.test(conds)) f.push({ id: 'lung', label: 'Lung disease' });
    var names = (o.medNames || []).join(' | ');
    Object.keys(DRUG_GROUPS).forEach(function (k) { if (DRUG_GROUPS[k].re.test(names)) f.push({ id: 'med-' + k, label: 'Takes a ' + DRUG_GROUPS[k].label }); });
    return f;
  }
  /** WHO UV index categories (2002). */
  function uvCategory(uv) { return uv >= 11 ? { label: 'Extreme', type: 'danger' } : uv >= 8 ? { label: 'Very high', type: 'danger' } : uv >= 6 ? { label: 'High', type: 'warn' } : uv >= 3 ? { label: 'Moderate', type: 'warn' } : { label: 'Low', type: 'ok' }; }
  /** US EPA AQI categories. */
  function aqiCategory(aqi) { return aqi > 300 ? { label: 'Hazardous', type: 'danger' } : aqi > 200 ? { label: 'Very unhealthy', type: 'danger' } : aqi > 150 ? { label: 'Unhealthy', type: 'danger' } : aqi > 100 ? { label: 'Unhealthy for sensitive people', type: 'warn' } : aqi > 50 ? { label: 'Moderate', type: 'info' } : { label: 'Good', type: 'ok' }; }
  /** WHO 2021 Global Air Quality Guidelines (ug/m3). */
  var WHO_AQG = { pm25: { h24: 15, annual: 5 }, pm10: { h24: 45, annual: 15 }, no2: { h24: 25, annual: 10 }, o3: { h8: 100, peak: 60 } };
  function pm25Band(v) { return v <= WHO_AQG.pm25.annual ? 'within the WHO yearly guideline' : v <= WHO_AQG.pm25.h24 ? 'within the WHO 24-hour guideline' : (v / WHO_AQG.pm25.h24).toFixed(1).replace(/\.0$/, '') + ' times the WHO 24-hour guideline'; }


  /* ---------- glue used by the widget and tools (pure) ---------- */
  /** Vulnerability from the shared profile and the medicine list saved by the coach ('health.coach.meds'). */
  function vulnerabilityFrom(profile, medsStore, today) {
    profile = profile || {};
    var p = personFrom(profile, null, {}, today || ymd(new Date()));
    var names = ((medsStore && medsStore.items) || []).filter(function (m) { return m && m.active !== false; }).map(function (m) { return String(m.name || ''); });
    return vulnerability({ age: p.age, pregnant: p.pregnant, conditionsText: (profile.conditions || []).map(String), medNames: names });
  }
  /** Risk from a cached environment fetch: { t, current:{ tempC, rh, apparentC } }. Returns null when stale (>maxAgeH hours) or incomplete. */
  function heatFromCache(cache, vulnerable, nowMs, maxAgeH) {
    if (!cache || !cache.current || typeof cache.current.tempC !== 'number' || typeof cache.current.rh !== 'number') return null;
    if (nowMs && cache.t && (nowMs - cache.t) > (maxAgeH || 6) * 3600e3) return null;
    return heatRisk(cache.current, vulnerable);
  }
  /** Dates we can fill in from other Salus tools: BP log (latest reading) and the health-check diabetes score. */
  function autoRecords(bpStore, results) {
    var out = {};
    var rd = bpStore && bpStore.readings;
    if (Array.isArray(rd) && rd.length) { var latest = rd.map(function (r) { return String(r && r.t || '').slice(0, 10); }).filter(isDate).sort().pop(); if (latest) out.bp = { date: latest, auto: true }; }
    if (results && results.findrisc && results.updatedAt && isDate(String(results.updatedAt).slice(0, 10))) out.diabetes = { date: String(results.updatedAt).slice(0, 10), auto: true };
    return out;
  }

  return {
    vulnerabilityFrom: vulnerabilityFrom, heatFromCache: heatFromCache, autoRecords: autoRecords,
    SECTIONS: SECTIONS, BUDGETS: BUDGETS, QR_CAPACITY: QR_CAPACITY, BLOOD: BLOOD, LOINC: LOINC,
    ageYears: ageYears, isDate: isDate, utf8Length: utf8Length, uuid: uuid, ymd: ymd, addDays: addDays, addYears: addYears, diffDays: diffDays, parseDate: pd,
    emptyPassport: emptyPassport, buildSummary: buildSummary, qrLevelFor: qrLevelFor, buildIps: buildIps, validateIps: validateIps, parseIps: parseIps, mergePassport: mergePassport,
    RULES: RULES, CHILD_DOSES: CHILD_DOSES, personFrom: personFrom, evaluate: evaluate, withStatus: withStatus, summarise: summarise, childSchedule: childSchedule, ageLabel: ageLabel,
    cToF: cToF, fToC: fToC, heatIndexF: heatIndexF, heatIndexC: heatIndexC, wetBulbC: wetBulbC, heatRisk: heatRisk, HEAT_LEVELS: HEAT_LEVELS, vulnerability: vulnerability, DRUG_GROUPS: DRUG_GROUPS,
    uvCategory: uvCategory, aqiCategory: aqiCategory, WHO_AQG: WHO_AQG, pm25Band: pm25Band
  };
});

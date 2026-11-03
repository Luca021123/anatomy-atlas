const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const L = require('../../health/lib/passport.js');

function sample() {
  const d = L.emptyPassport();
  d.updatedAt = '2026-11-03T10:00:00Z';
  d.id = { name: 'Amina Khan', dob: '1974-05-12', sex: 'female', blood: 'O+', lang: 'Urdu' };
  d.allergies = [{ id: 'a', substance: 'Penicillin', reaction: 'rash', severity: 'severe' }, { id: 'b', substance: 'Peanuts', reaction: 'swelling', severity: 'moderate' }];
  d.conditions = [{ id: 'c', name: 'Type 2 diabetes' }, { id: 'c2', name: 'Epilepsy' }];
  d.meds = [{ id: 'm', name: 'Metformin', dose: '500 mg twice a day' }];
  d.vaccines = [{ id: 'v', name: 'Tetanus (Td)', date: '2021-03-04' }];
  d.devices = [{ id: 'x', name: 'Pacemaker' }];
  d.pregnancy = { pregnant: true, due: '2027-02-01' };
  d.contacts = [{ id: 'k', name: 'Sara', relation: 'sister', phone: '+92 300 1234567' }];
  d.donor = 'yes'; d.directive = 'No resuscitation if terminally ill.'; d.unwell = 'I have epilepsy. Give sugar if confused.';
  return d;
}

test('summary includes selected sections and respects section choice', () => {
  const s = L.buildSummary(sample(), { today: '2026-11-03', maxBytes: 2000 });
  assert.match(s.text, /^HEALTH PASSPORT/);
  assert.match(s.text, /Name: Amina Khan/); assert.match(s.text, /\(52y\)/);
  assert.match(s.text, /ALLERGIES: Penicillin \(rash, severe\); Peanuts/);
  assert.match(s.text, /IF FOUND UNWELL: I have epilepsy/);
  assert.equal(s.truncated, false);
  const t = L.buildSummary(sample(), { today: '2026-11-03', maxBytes: 2000, sections: { meds: false, contacts: false, vaccines: false } });
  assert.doesNotMatch(t.text, /Metformin|Sara|Tetanus/);
  assert.match(t.text, /CONDITIONS/);
});
test('summary truncates under byte budget, keeping safety-critical lines first', () => {
  const d = sample();
  for (let i = 0; i < 40; i++) d.meds.push({ id: 'm' + i, name: 'Medicine number ' + i, dose: '10 mg' });
  const s = L.buildSummary(d, { today: '2026-11-03', maxBytes: 450 });
  assert.ok(s.bytes <= 450, 'bytes ' + s.bytes);
  assert.equal(s.truncated, true);
  assert.match(s.text, /ALLERGIES: Penicillin/);
  assert.match(s.text, /IF FOUND UNWELL/);
  assert.match(s.text, /more details left out/);
  assert.ok(s.dropped.length + s.shortened.length > 0);
});
test('summary counts UTF-8 bytes, not characters', () => {
  assert.equal(L.utf8Length('é'), 2); assert.equal(L.utf8Length('€'), 3); assert.equal(L.utf8Length('😀'), 4); assert.equal(L.utf8Length('abc'), 3);
  const d = L.emptyPassport(); d.id.name = 'محمد '.repeat(60);
  const s = L.buildSummary(d, { maxBytes: 300 });
  assert.ok(s.bytes <= 300);
});
test('summary fits the QR encoder and module count matches version', () => {
  const qrcode = require('../../health/vendor/qrcode.js');
  const s = L.buildSummary(sample(), { today: '2026-11-03', maxBytes: L.BUDGETS.standard });
  const lvl = L.qrLevelFor(s.bytes); assert.equal(lvl, 'M');
  const q = qrcode(0, lvl); q.addData(s.text); q.make();
  const n = q.getModuleCount(); assert.equal((n - 17) % 4, 0);
  assert.ok(n >= 21 && n <= 177);
  let dark = 0; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dark++;
  assert.ok(dark > n * n * 0.3 && dark < n * n * 0.7);
  // finder pattern corner is dark
  assert.ok(q.isDark(0, 0) && q.isDark(0, n - 1) && q.isDark(n - 1, 0));
  // largest preset must still fit
  const big = 'x'.repeat(L.BUDGETS.large); const q2 = qrcode(0, 'M'); q2.addData(big); q2.make(); assert.ok(q2.getModuleCount() <= 177);
});

test('IPS bundle structure, references and LOINC section codes', () => {
  const b = L.buildIps(sample(), { now: '2026-11-03T10:00:00Z' });
  assert.equal(b.resourceType, 'Bundle'); assert.equal(b.type, 'document');
  const types = b.entry.map(e => e.resource.resourceType);
  assert.equal(types[0], 'Composition'); assert.equal(types[1], 'Patient');
  ['AllergyIntolerance', 'Condition', 'MedicationStatement', 'Immunization'].forEach(t => assert.ok(types.includes(t), t));
  assert.equal(types.filter(t => t === 'AllergyIntolerance').length, 2);
  const comp = b.entry[0].resource;
  const bycode = Object.fromEntries(comp.section.filter(s => s.code.coding).map(s => [s.code.coding[0].code, s]));
  assert.equal(bycode['48765-2'].entry.length, 2); assert.equal(bycode['10160-0'].entry.length, 1);
  assert.equal(bycode['11450-4'].entry.length, 2); assert.equal(bycode['11369-6'].entry.length, 1);
  assert.equal(comp.type.coding[0].code, '60591-5');
  const urls = new Set(b.entry.map(e => e.fullUrl));
  comp.section.forEach(s => (s.entry || []).forEach(r => assert.ok(urls.has(r.reference))));
  assert.ok(urls.has(comp.subject.reference));
  b.entry.slice(2).forEach(e => { const r = e.resource; const ref = (r.patient || r.subject).reference; assert.equal(ref, b.entry[1].fullUrl); });
  assert.match(comp.title, /not formally validated/);
  const al = b.entry.find(e => e.resource.resourceType === 'AllergyIntolerance').resource;
  assert.equal(al.criticality, 'high'); assert.equal(al.reaction[0].severity, 'severe');
});
test('IPS empty sections carry emptyReason', () => {
  const b = L.buildIps(L.emptyPassport());
  const comp = b.entry[0].resource;
  ['48765-2', '10160-0', '11450-4'].forEach(c => { const s = comp.section.find(x => x.code.coding[0].code === c); assert.ok(s.emptyReason); assert.equal(s.entry, undefined); });
  assert.deepEqual(L.validateIps(b).errors, []);
});
test('IPS round trip: export then import restores the passport', () => {
  const d = sample(); const b = JSON.parse(JSON.stringify(L.buildIps(d)));
  const v = L.validateIps(b); assert.equal(v.ok, true);
  const { data } = L.parseIps(b);
  assert.equal(data.id.name, 'Amina Khan'); assert.equal(data.id.dob, '1974-05-12'); assert.equal(data.id.sex, 'female'); assert.equal(data.id.blood, 'O+'); assert.equal(data.id.lang, 'Urdu');
  assert.deepEqual(data.allergies.map(a => [a.substance, a.reaction, a.severity]), [['Penicillin', 'rash', 'severe'], ['Peanuts', 'swelling', 'moderate']]);
  assert.deepEqual(data.conditions.map(c => c.name), ['Type 2 diabetes', 'Epilepsy']);
  assert.equal(data.meds[0].name, 'Metformin'); assert.equal(data.meds[0].dose, '500 mg twice a day');
  assert.equal(data.vaccines[0].date, '2021-03-04'); assert.equal(data.devices[0].name, 'Pacemaker');
  assert.equal(data.pregnancy.pregnant, true); assert.equal(data.pregnancy.due, '2027-02-01');
  assert.equal(data.contacts[0].phone, '+92 300 1234567'); assert.equal(data.donor, 'yes');
  assert.equal(data.unwell, 'I have epilepsy. Give sugar if confused.'); assert.equal(data.directive, 'No resuscitation if terminally ill.');
});
test('IPS special characters survive the narrative round trip', () => {
  const d = L.emptyPassport(); d.unwell = 'Allergic to <latex> & "dust"';
  const { data } = L.parseIps(JSON.parse(JSON.stringify(L.buildIps(d))));
  assert.equal(data.unwell, 'Allergic to <latex> & "dust"');
});
test('IPS validation rejects bad files', () => {
  assert.equal(L.validateIps(null).ok, false); assert.equal(L.validateIps([]).ok, false);
  assert.equal(L.validateIps({ resourceType: 'Patient' }).ok, false);
  assert.equal(L.validateIps({ resourceType: 'Bundle', type: 'collection', entry: [] }).ok, false);
  const noPatient = { resourceType: 'Bundle', type: 'document', entry: [{ resource: { resourceType: 'Composition' } }] };
  assert.ok(L.validateIps(noPatient).errors.some(e => /Patient/.test(e)));
  assert.equal(L.validateIps({ resourceType: 'Bundle', type: 'document', entry: [{ nope: 1 }] }).ok, false);
});
test('merge adds only new rows', () => {
  const a = sample(), b = sample(); b.allergies.push({ id: 'z', substance: 'Latex', reaction: '', severity: '' }); b.id.name = 'Other';
  const m = L.mergePassport(a, b); assert.equal(m.allergies.length, 3); assert.equal(m.id.name, 'Amina Khan'); assert.equal(m.meds.length, 1);
});

/* ---------------------------------------------------------------- prevention */
const T = '2026-11-03';
function ev(p) { return Object.fromEntries(L.evaluate(Object.assign({ age: 40, sex: 'female', pregnant: false }, p), T).items.map(i => [i.id, i])); }
test('evaluate needs age; reports missing sex', () => {
  assert.deepEqual(L.evaluate({ age: undefined }, T).missing, ['age', 'sex']);
  assert.equal(L.evaluate({ age: undefined }, T).items.length, 0);
  assert.deepEqual(L.evaluate({ age: 30 }, T).missing, ['sex']);
});
test('cervical screening boundaries (WHO 2021)', () => {
  assert.equal(ev({ age: 29 }).cervical.level, 'consider');
  assert.equal(ev({ age: 30 }).cervical.level, 'recommended'); assert.equal(ev({ age: 30 }).cervical.interval, 5);
  assert.equal(ev({ age: 65 }).cervical.level, 'recommended'); assert.equal(ev({ age: 66 }).cervical, undefined);
  assert.equal(ev({ age: 25, hiv: true }).cervical.level, 'recommended'); assert.equal(ev({ age: 25, hiv: true }).cervical.interval, 3);
  assert.equal(ev({ age: 24, hiv: true }).cervical.level, 'consider');
  assert.equal(ev({ age: 40, sex: 'male' }).cervical, undefined);
});
test('breast screening boundaries (USPSTF 2024 / WHO)', () => {
  assert.equal(ev({ age: 39 }).breast, undefined);
  assert.equal(ev({ age: 40 }).breast.level, 'consider'); assert.equal(ev({ age: 49 }).breast.level, 'consider');
  assert.equal(ev({ age: 50 }).breast.level, 'recommended'); assert.equal(ev({ age: 69 }).breast.level, 'recommended');
  assert.equal(ev({ age: 70 }).breast.level, 'consider'); assert.equal(ev({ age: 74 }).breast.level, 'consider'); assert.equal(ev({ age: 75 }).breast, undefined);
  assert.equal(ev({ age: 52 }).breast.interval, 2);
});
test('colorectal 45-75, lung needs 20 pack-years and quit within 15, prostate 55-69, AAA, bone', () => {
  assert.equal(ev({ age: 44 }).colorectal, undefined); assert.ok(ev({ age: 45 }).colorectal); assert.ok(ev({ age: 75 }).colorectal); assert.equal(ev({ age: 76 }).colorectal, undefined);
  const smoker = { age: 60, smoking: 'current', packYears: 20 };
  assert.ok(ev(smoker).lung); assert.equal(ev({ age: 60, smoking: 'current', packYears: 19 }).lung, undefined);
  assert.equal(ev({ age: 49, smoking: 'current', packYears: 30 }).lung, undefined); assert.equal(ev({ age: 81, smoking: 'current', packYears: 30 }).lung, undefined);
  assert.ok(ev({ age: 60, smoking: 'former', packYears: 25, quitYearsAgo: 15 }).lung); assert.equal(ev({ age: 60, smoking: 'former', packYears: 25, quitYearsAgo: 16 }).lung, undefined);
  assert.equal(ev({ age: 60, smoking: 'never' }).lung, undefined);
  assert.equal(ev({ age: 54, sex: 'male' }).prostate, undefined); assert.equal(ev({ age: 55, sex: 'male' }).prostate.level, 'discuss'); assert.equal(ev({ age: 69, sex: 'male' }).prostate.level, 'discuss'); assert.equal(ev({ age: 70, sex: 'male' }).prostate, undefined);
  assert.ok(ev({ age: 65, sex: 'male', smoking: 'former' }).aaa); assert.equal(ev({ age: 65, sex: 'male', smoking: 'never' }).aaa, undefined); assert.equal(ev({ age: 76, sex: 'male', smoking: 'current' }).aaa, undefined); assert.equal(ev({ age: 64, sex: 'male', smoking: 'current' }).aaa, undefined);
  assert.ok(ev({ age: 65 }).bone); assert.equal(ev({ age: 64 }).bone, undefined); assert.equal(ev({ age: 70, sex: 'male' }).bone, undefined);
});
test('other screening: diabetes eye/foot, TB, HIV, hearing, BP', () => {
  assert.ok(ev({ diabetes: true })['eye-dm'] && ev({ diabetes: true })['foot-dm']); assert.equal(ev({})['eye-dm'], undefined);
  assert.equal(ev({ diabetes: true }).diabetes, undefined);
  assert.equal(ev({}).tb, undefined); assert.ok(ev({ tbRisk: true }).tb.urgent); assert.ok(ev({ hiv: true }).tb);
  assert.ok(ev({ age: 15 }).hiv); assert.equal(ev({ age: 14 }).hiv, undefined); assert.equal(ev({ age: 66 }).hiv, undefined);
  assert.equal(ev({ age: 49 }).hearing, undefined); assert.ok(ev({ age: 50 }).hearing);
  assert.equal(ev({ age: 17 }).bp, undefined); assert.equal(ev({ age: 18 }).bp.interval, 1);
  assert.equal(ev({ age: 34 }).diabetes, undefined); assert.equal(ev({ age: 35 }).diabetes.level, 'recommended'); assert.equal(ev({ age: 30, bmi: 27 }).diabetes.level, 'consider');
  assert.equal(ev({ age: 30, bmi: 23.5, asian: true }).diabetes.level, 'consider'); assert.equal(ev({ age: 30, bmi: 23.5 }).diabetes, undefined);
});
test('vaccine rules by age, pregnancy and risk', () => {
  assert.equal(ev({ age: 30 }).flu.level, 'consider');
  assert.equal(ev({ age: 30, pregnant: true }).flu.level, 'recommended');
  assert.equal(ev({ age: 65 }).flu.level, 'recommended');
  assert.equal(ev({ age: 59 }).covid, undefined); assert.equal(ev({ age: 60 }).covid.level, 'recommended'); assert.equal(ev({ age: 30, pregnant: true }).covid.level, 'recommended'); assert.equal(ev({ age: 30, diabetes: true }).covid.level, 'recommended');
  assert.ok(ev({ age: 30, pregnant: true })['tdap-preg']); assert.ok(ev({ age: 30, pregnant: true })['rsv-mat']); assert.equal(ev({ age: 30 })['tdap-preg'], undefined); assert.equal(ev({ age: 30 })['rsv-mat'], undefined);
  assert.equal(ev({ age: 8 }).hpv, undefined); assert.equal(ev({ age: 9 }).hpv.level, 'recommended'); assert.equal(ev({ age: 26 }).hpv.level, 'recommended'); assert.equal(ev({ age: 27 }).hpv.level, 'consider'); assert.equal(ev({ age: 46 }).hpv, undefined);
  assert.equal(ev({ age: 64 }).pcv.level, 'consider'); assert.equal(ev({ age: 65 }).pcv.level, 'recommended'); assert.equal(ev({ age: 40, lung: true }).pcv.level, 'recommended'); assert.equal(ev({ age: 40 }).pcv, undefined);
  assert.equal(ev({ age: 49 }).zoster, undefined); assert.equal(ev({ age: 50 }).zoster.level, 'consider');
  assert.equal(ev({ age: 75 })['rsv-old'].level, 'recommended'); assert.equal(ev({ age: 62 })['rsv-old'].level, 'consider'); assert.equal(ev({ age: 62, lung: true })['rsv-old'].level, 'recommended'); assert.equal(ev({ age: 52, lung: true })['rsv-old'].level, 'recommended'); assert.equal(ev({ age: 52 })['rsv-old'], undefined);
  assert.equal(ev({ age: 14 }).td, undefined); assert.equal(ev({ age: 15 }).td.interval, 10);
  assert.equal(ev({ age: 30 }).hepb.level, 'recommended'); assert.equal(ev({ age: 62 }).hepb.level, 'consider');
});
test('personFrom merges profile, results and overrides', () => {
  const p = L.personFrom({ birthYear: 1974, sex: 'female', pregnant: false, conditions: ['type2_diabetes', 'copd'], smoking: true, weightKg: 80, heightCm: 160, ancestry: 'asian' }, { tb: { positive: true } }, { packYears: 22 }, T);
  assert.equal(p.age, 52); assert.equal(p.diabetes, true); assert.equal(p.lung, true); assert.equal(p.smoking, 'current'); assert.equal(p.packYears, 22); assert.equal(p.tbRisk, true); assert.equal(p.asian, true); assert.ok(Math.abs(p.bmi - 31.25) < 0.01);
  const q = L.personFrom({ birthYear: 1974 }, null, { dob: '2020-01-01', sex: 'male', diabetes: true }, T);
  assert.equal(q.age, 6); assert.equal(q.sex, 'male'); assert.equal(q.diabetes, true);
});
test('a 52-year-old woman checklist', () => {
  const items = L.evaluate(L.personFrom({ birthYear: 1974, sex: 'female', smoking: 'never' }, {}, {}, T), T).items.map(i => i.id);
  ['cervical', 'breast', 'colorectal', 'bp', 'diabetes', 'cholesterol', 'hiv', 'hepbc', 'flu', 'td', 'vision', 'dental', 'hearing'].forEach(id => assert.ok(items.includes(id), id));
  ['prostate', 'aaa', 'bone', 'lung', 'hpv', 'tb'].forEach(id => assert.ok(!items.includes(id), id));
});
test('due status: never done, soon, ok, overdue, once', () => {
  const it = L.evaluate({ age: 52, sex: 'female' }, T).items.find(i => i.id === 'breast');
  assert.equal(L.withStatus(it, null, T).status, 'check');
  assert.equal(L.withStatus(it, { date: '2025-11-03' }, T).status, 'ok');
  const ok = L.withStatus(it, { date: '2024-11-03' }, T); assert.equal(ok.status, 'soon'); assert.equal(ok.nextDate, '2026-11-03');
  assert.equal(L.withStatus(it, { date: '2024-10-01' }, T).status, 'overdue'); assert.equal(L.withStatus(it, { date: '2024-10-01' }, T).nextDate, '2026-10-01');
  const once = L.evaluate({ age: 30, sex: 'male' }, T).items.find(i => i.id === 'hiv'); assert.equal(L.withStatus(once, { date: '2000-01-01' }, T).status, 'ok');
  const custom = L.evaluate({ age: 55, sex: 'male' }, T).items.find(i => i.id === 'colorectal'); assert.equal(L.withStatus(custom, { date: '2020-01-01', years: 10 }, T).status, 'ok'); assert.equal(L.withStatus(custom, { date: '2020-01-01', years: 10 }, T).nextDate, '2030-01-01');
  const c = L.summarise([L.withStatus(it, { date: '2024-10-01' }, T), L.withStatus(it, null, T)]); assert.equal(c.overdue, 1); assert.equal(c.check, 1);
});

/* ------------------------------------------------------------- child schedule */
function child(dob, given) { return Object.fromEntries(L.childSchedule(dob, given, T).rows.map(r => [r.id, r])); }
test('child schedule: newborn, 6 weeks, 10 weeks, 9 months, 15 months', () => {
  assert.equal(child('2026-11-03').bcg.status, 'due'); assert.equal(child('2026-11-03').penta1.status, 'upcoming');
  assert.equal(child('2026-09-22').penta1.status, 'due'); // 42 days old
  assert.equal(child('2026-09-22').penta1.dueDate, '2026-11-03');
  assert.equal(child('2026-09-25').penta1.status, 'soon');
  assert.equal(child('2026-09-22', { penta1: true }).penta1.status, 'given');
  assert.equal(child('2026-06-01').penta1.status, 'overdue'); assert.equal(child('2026-06-01').penta2.status, 'overdue'); assert.equal(child('2026-06-01').penta3.status, 'overdue');
  assert.equal(child('2026-06-01').mr1.status, 'upcoming');
  assert.equal(child('2026-01-30').mr1.status, 'due'); // ~9 months
  assert.equal(child('2026-01-30').mr1.dueDays, 274);
  assert.equal(child('2025-07-01').mr2.status, 'due');
  assert.equal(child('2025-07-01').mr1.status, 'overdue');
  assert.equal(child('2025-07-01').hpv.status, 'upcoming');
});
test('child schedule: HPV single dose at 9-14 years; invalid dates', () => {
  assert.equal(child('2017-10-01').hpv.status, 'due'); assert.equal(child('2012-06-01').hpv.status, 'due');
  assert.equal(child('2008-01-01').hpv.status, 'overdue'); assert.equal(child('2020-01-01').hpv.status, 'upcoming');
  assert.equal(L.childSchedule('2030-01-01', {}, T), null); assert.equal(L.childSchedule('', {}, T), null);
  assert.equal(L.childSchedule('2000-01-01', {}, T).beyondChild, true);
  assert.equal(L.ageLabel(10).unit, 'days'); assert.equal(L.ageLabel(60).unit, 'weeks'); assert.equal(L.ageLabel(300).unit, 'months'); assert.equal(L.ageLabel(2000).unit, 'years');
});

/* ---------------------------------------------------------------- environment */
test('NOAA heat index matches published examples', () => {
  assert.ok(Math.abs(L.heatIndexF(90, 70) - 106) < 1.5);   // NWS chart: 90F/70% ~ 105-106
  assert.ok(Math.abs(L.heatIndexF(96, 65) - 121) < 2);      // NWS chart ~121
  assert.ok(Math.abs(L.heatIndexF(80, 40) - 80) < 1.5);     // NWS chart 80
  assert.ok(Math.abs(L.heatIndexF(100, 50) - 118) < 2);     // NWS chart 118
  assert.ok(L.heatIndexF(75, 50) < 80);                     // simple formula below 80
  // adjustments
  const dry = L.heatIndexF(95, 10), noAdj = (() => { const T = 95, RH = 10; return -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH - 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH; })();
  assert.ok(dry < noAdj);
  const wet = L.heatIndexF(85, 95), noAdj2 = (() => { const T = 85, RH = 95; return -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH - 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH; })();
  assert.ok(wet > noAdj2);
  assert.ok(Math.abs(L.heatIndexC(32.2, 70) - 41.1) < 1);
});
test('Stull wet-bulb matches the paper examples', () => {
  assert.ok(Math.abs(L.wetBulbC(20, 50) - 13.7) < 0.1);
  assert.ok(Math.abs(L.wetBulbC(0, 50) - (-3.6)) < 0.3);   // Stull Table: ~ -3.6 C
  assert.ok(Math.abs(L.wetBulbC(30, 99) - 29.9) < 0.6);    // near saturation wet-bulb ~ air temp
  assert.ok(L.wetBulbC(35, 50) < 35);
});
test('heat risk categories and vulnerability uplift', () => {
  assert.equal(L.heatRisk({ tempC: 20, rh: 50 }).level, 0);
  assert.equal(L.heatRisk({ tempC: 29, rh: 50 }).level, 1);
  assert.equal(L.heatRisk({ tempC: 34, rh: 60 }).level >= 2, true);
  assert.equal(L.heatRisk({ tempC: 42, rh: 60 }).level >= 3, true);
  const a = L.heatRisk({ tempC: 29, rh: 50 }, false), b = L.heatRisk({ tempC: 29, rh: 50 }, true);
  assert.equal(b.level, a.level + 1); assert.equal(b.raised, true);
  assert.equal(L.heatRisk({ tempC: 18, rh: 40 }, true).level, 0);
  assert.ok(L.heatRisk({ tempC: 32, rh: 90 }).level >= 2); // wet-bulb floor
  assert.equal(L.heatRisk({ tempC: 20, rh: 50, apparentC: 40 }).level, 3);
});
test('vulnerability factors from age, conditions and medicines', () => {
  const f = L.vulnerability({ age: 70, pregnant: false, conditionsText: ['Type 2 diabetes', 'kidney_disease'], medNames: ['Furosemide 40mg', 'Metoprolol', 'Amitriptyline', 'Risperidone'] }).map(x => x.id);
  ['age65', 'diabetes', 'kidney', 'med-diuretic', 'med-betablocker', 'med-anticholinergic', 'med-antipsychotic'].forEach(id => assert.ok(f.includes(id), id));
  assert.deepEqual(L.vulnerability({ age: 3 }).map(x => x.id), ['age5']);
  assert.deepEqual(L.vulnerability({ age: 30, pregnant: true }).map(x => x.id), ['pregnant']);
  assert.deepEqual(L.vulnerability({ age: 30, medNames: ['Paracetamol'] }), []);
});
test('UV, AQI and WHO air guideline helpers', () => {
  assert.equal(L.uvCategory(2).label, 'Low'); assert.equal(L.uvCategory(3).label, 'Moderate'); assert.equal(L.uvCategory(6).label, 'High'); assert.equal(L.uvCategory(8).label, 'Very high'); assert.equal(L.uvCategory(11).label, 'Extreme');
  assert.equal(L.aqiCategory(50).label, 'Good'); assert.equal(L.aqiCategory(51).label, 'Moderate'); assert.equal(L.aqiCategory(101).type, 'warn'); assert.equal(L.aqiCategory(151).label, 'Unhealthy'); assert.equal(L.aqiCategory(301).label, 'Hazardous');
  assert.equal(L.WHO_AQG.pm25.h24, 15); assert.equal(L.WHO_AQG.pm25.annual, 5);
  assert.match(L.pm25Band(30), /2 times/); assert.match(L.pm25Band(10), /24-hour/); assert.match(L.pm25Band(4), /yearly/);
});

test('glue: vulnerabilityFrom, heatFromCache, autoRecords', () => {
  const v = L.vulnerabilityFrom({ birthYear: 1950, conditions: ['heart_disease'] }, { items: [{ name: 'Furosemide', active: true }, { name: 'Atenolol', active: false }] }, '2026-11-03').map(x => x.id);
  assert.deepEqual(v.sort(), ['age65', 'heart', 'med-diuretic'].sort());
  const now = Date.now();
  assert.equal(L.heatFromCache({ t: now, current: { tempC: 35, rh: 60 } }, false, now).level >= 2, true);
  assert.equal(L.heatFromCache({ t: now - 10 * 3600e3, current: { tempC: 35, rh: 60 } }, false, now), null);
  assert.equal(L.heatFromCache(null, false, now), null);
  const a = L.autoRecords({ readings: [{ t: '2026-10-01T08:00:00Z' }, { t: '2026-10-20T08:00:00Z' }] }, { findrisc: { score: 5 }, updatedAt: '2026-09-02T00:00:00Z' });
  assert.equal(a.bp.date, '2026-10-20'); assert.equal(a.diabetes.date, '2026-09-02');
  assert.deepEqual(L.autoRecords(null, null), {});
});

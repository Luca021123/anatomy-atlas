// Sanity tests for the core runtime helpers that do not need a DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function loadCore() {
  const sandbox = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Number, String, Array, Object, RegExp, Error, isFinite };
  sandbox.globalThis = sandbox; sandbox.window = undefined;
  // Minimal document stub (core only touches document lazily or in guarded code paths)
  sandbox.document = { documentElement: { setAttribute() {}, removeAttribute() {}, lang: 'en', dir: 'ltr' }, addEventListener() {}, getElementById() { return null; } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/core.js'), 'utf8'), sandbox);
  return sandbox.MT;
}
test('MT.num parses decimal commas and rejects junk', () => {
  const MT = loadCore();
  assert.equal(MT.num('36,5'), 36.5);
  assert.equal(MT.num(' 120 '), 120);
  assert.equal(MT.num(''), undefined);
  assert.equal(MT.num('abc'), undefined);
});
test('MT.round rounds half away from zero', () => {
  const MT = loadCore();
  assert.equal(MT.round(2.345, 2), 2.35);
  assert.equal(MT.round(-2.5, 0), -3);
});
test('MT.t interpolates and falls back to English', () => {
  const MT = loadCore();
  MT.i18n.add('xx', { 'Hello {name}': 'Hallo {name}' }, { name: 'Test' });
  assert.equal(MT.t('Hello {name}', { name: 'Ana' }), 'Hello Ana');
  MT.i18n.lang = 'xx';
  assert.equal(MT.t('Hello {name}', { name: 'Ana' }), 'Hallo Ana');
  assert.equal(MT.t('Untranslated'), 'Untranslated');
});
test('MT.ics.build produces a valid VCALENDAR with alarm and rrule', () => {
  const MT = loadCore();
  const ics = MT.ics.build({ name: 'Meds', events: [{ uid: 'a1', title: 'Take amlodipine, 5 mg', start: new Date(2026, 10, 3, 8, 0), durationMin: 5, rrule: 'FREQ=DAILY', alarmMin: 0 }] });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20261103T080000/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /SUMMARY:Take amlodipine\\, 5 mg/);
  assert.match(ics, /BEGIN:VALARM/);
});

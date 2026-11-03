// Unit tests for the pure Recall Lab helpers in student/lib/fsrs.js:
// cloze parsing, Anki/CSV import parsing, HTML cleaning, CSV export and DST-safe study days.
process.env.TZ = 'Europe/London'; // has DST (29 Mar and 25 Oct 2026)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../student/lib/fsrs.js');

test('cloze numbers, segments, hints and plain text', () => {
  const text = 'The {{c1::median}} nerve passes through the {{c2::carpal tunnel::space}}; {{c1::median}} again.';
  assert.deepEqual(F.clozeNumbers(text), [1, 2]);
  assert.deepEqual(F.clozeNumbers('no cloze here'), []);
  assert.deepEqual(F.clozeNumbers('{{c3::x}} {{c10::y}} {{c3::z}}'), [3, 10]);
  const seg = F.clozeSegments(text, 1);
  assert.equal(seg.filter((s) => s.type === 'cloze').length, 2, 'every occurrence of c1 is hidden');
  assert.ok(seg.some((s) => s.type === 'text' && s.text === 'carpal tunnel'), 'other clozes are shown as answers');
  assert.equal(F.clozeText(text, 1, false), 'The […] nerve passes through the carpal tunnel; […] again.');
  assert.equal(F.clozeText(text, 2, false), 'The median nerve passes through the [space]; median again.');
  assert.equal(F.clozeText(text, 2, true), 'The median nerve passes through the carpal tunnel; median again.');
  assert.equal(F.clozeStrip(text), 'The median nerve passes through the carpal tunnel; median again.');
  // multi-line and special characters inside a cloze
  assert.equal(F.clozeText('A\n{{c1::K⁺ < 3.5\nmmol/L}}', 1, true), 'A\nK⁺ < 3.5\nmmol/L');
});

test('htmlToText cleans Anki HTML without mangling plain inequalities', () => {
  assert.equal(F.htmlToText('<b>K</b><sup>+</sup> &lt; 3.5<br>mmol/L'), 'K+ < 3.5\nmmol/L');
  assert.equal(F.htmlToText('<div>line 1</div><div>line 2</div>'), 'line 1\nline 2');
  assert.equal(F.htmlToText('pH &gt; 7.45 &amp; HCO&#x2083;&#8315;'), 'pH > 7.45 & HCO₃⁻');
  assert.equal(F.htmlToText('x < 3 and y > 2'), 'x < 3 and y > 2', 'non-tag angle brackets survive');
  assert.equal(F.htmlToText('Heart [sound:lub.mp3]<img src="ecg.png">'), 'Heart [image]');
  assert.equal(F.htmlToText('<ul><li>one</li><li>two</li></ul>'), '• one\n• two');
  assert.equal(F.htmlToText('&#0;&#xD800;ok'), 'ok', 'invalid code points are dropped');
  assert.equal(F.looksLikeHtml('a<br>b'), true);
  assert.equal(F.looksLikeHtml('a < b'), false);
});

test('parseDelimited reads Anki plain-text exports with header directives', () => {
  const txt = '#separator:tab\n#html:true\n#tags column:3\nWhat is the <b>carina</b> level?\tT4/T5\tanatomy thorax\nSecond\tcard\t\n';
  const p = F.parseDelimited(txt);
  assert.equal(p.delimiter, '\t');
  assert.equal(p.html, true);
  assert.equal(p.columns.tags, 2);
  assert.equal(p.rows.length, 2);
  const map = F.suggestMapping(p);
  assert.deepEqual([map.front, map.back, map.tags, map.header], [0, 1, 2, false]);
  const out = F.rowsToCards(p, map);
  assert.equal(out.cards.length, 2);
  assert.equal(out.cards[0].front, 'What is the carina level?');
  assert.deepEqual(out.cards[0].tags, ['anatomy', 'thorax']);
});

test('Anki export with guid/notetype/deck columns and cloze notes', () => {
  const txt = '#separator:tab\n#html:false\n#guid column:1\n#notetype column:2\n#deck column:3\n#tags column:6\n' +
    'abc123\tCloze\tMed::Anatomy\tThe {{c1::phrenic}} nerve is C3–C5.\tdiaphragm\tnerves\n' +
    'def456\tBasic\tMed::Anatomy\tFront\tBack\t\n';
  const p = F.parseDelimited(txt);
  const map = F.suggestMapping(p);
  assert.equal(map.front, 3);
  assert.equal(map.back, 4);
  assert.equal(map.deck, 2);
  assert.equal(map.tags, 5);
  const { cards } = F.rowsToCards(p, map);
  assert.equal(cards[0].type, 'cloze');
  assert.equal(cards[0].text, 'The {{c1::phrenic}} nerve is C3–C5.');
  assert.equal(cards[0].extra, 'diaphragm');
  assert.equal(cards[0].deckName, 'Med::Anatomy');
  assert.equal(cards[1].type, 'basic');
});

test('CSV with header row, quotes, embedded delimiters and newlines', () => {
  const csv = 'Question,Answer,Tags\n"Na⁺, normal range","135–145 mmol/L",labs\n"Say ""hi""","line 1\nline 2",\n,missing front,\nonly front,,\n';
  const p = F.parseDelimited(csv);
  assert.equal(p.delimiter, ',');
  const map = F.suggestMapping(p);
  assert.deepEqual([map.front, map.back, map.tags, map.header], [0, 1, 2, true]);
  const out = F.rowsToCards(p, map);
  assert.equal(out.cards.length, 2);
  assert.equal(out.cards[0].front, 'Na⁺, normal range');
  assert.equal(out.cards[1].front, 'Say "hi"');
  assert.equal(out.cards[1].back, 'line 1\nline 2');
  assert.deepEqual(out.skipped.map((s) => s.reason), ['empty front', 'empty back']);
});

test('delimiter detection: semicolon and tab files without directives', () => {
  assert.equal(F.parseDelimited('a;b;c\nd;e;f\n').delimiter, ';');
  assert.equal(F.parseDelimited('a\tb, with comma\nc\td\n').delimiter, '\t');
  assert.equal(F.parseDelimited('﻿front,back\r\nx,y\r\n').rows.length, 2, 'BOM and CRLF handled');
  const three = F.parseDelimited('Carina level?\tT4/T5\tanatomy thorax\nApex beat?\tLeft 5th ICS, MCL\tanatomy\n');
  const m3 = F.suggestMapping(three);
  assert.deepEqual([m3.front, m3.back, m3.tags, m3.header], [0, 1, 2, false], 'front<TAB>back<TAB>tags');
});

test('toCSV quotes when needed and round-trips through the parser', () => {
  const rows = [['front', 'back', 'tags'], ['a, b', 'say "hi"', 'x y'], ['multi\nline', ' padded ', '']];
  const csv = F.toCSV(rows);
  assert.match(csv, /"a, b","say ""hi"""/);
  assert.deepEqual(F.splitDelimited(csv.replace(/\r\n/g, '\n'), ','), rows);
});

test('splitTags normalises tag lists', () => {
  assert.deepEqual(F.splitTags('#cardio  renal,renal  acid-base'), ['cardio', 'renal', 'acid-base']);
  assert.deepEqual(F.splitTags(['a b', '', 'c']), ['a-b', 'c']);
});

test('DST: day intervals keep the local clock time and study days stay whole', () => {
  // 28 Mar 2026 10:00 GMT → +3 days crosses the spring-forward change (29 Mar)
  const before = new Date(2026, 2, 28, 10, 0).getTime();
  const after = F.addDays(before, 3);
  assert.equal(new Date(after).getHours(), 10);
  assert.equal(F.dayNumber(after, 4) - F.dayNumber(before, 4), 3);
  assert.equal((after - before) / 3600e3, 71, 'one hour shorter in absolute time');
  // a review scheduled across the change is still due on the right study day
  const card = { st: 2, s: 3, d: 5, lr: before - 3 * 864e5, due: before, stp: 0, n: 2, l: 0 };
  const res = F.schedule(card, 3, before);
  assert.equal(F.dueInDays(res.card, before), res.log.days);
  assert.equal(F.formatInterval(res.log.ivl), res.log.days + 'd', 'button label uses whole days');
  // autumn change: 24 Oct 2026 03:30 local is before the 4 am rollover → previous study day
  assert.equal(F.dayKey(new Date(2026, 9, 24, 3, 30).getTime(), 4), '2026-10-23');
  assert.equal(F.dayKey(new Date(2026, 9, 25, 12, 0).getTime(), 4), '2026-10-25');
});

// Quiz-builder tests for the Anatomy Atlas: every generated question has four unique options and
// exactly one correct answer that matches the underlying data.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../student/data/anatomy.js');
const Q = D.quiz, H = D.helpers;

function seeded(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function check(q) {
  assert.equal(q.options.length, 4, q.prompt);
  assert.equal(new Set(q.options).size, 4, 'duplicate options: ' + q.prompt);
  assert.ok(q.answer >= 0 && q.answer < 4);
  assert.equal(q.options[q.answer], q.correct);
  assert.ok(q.prompt.length > 10 && q.explain.length > 10);
}

test('shuffle keeps every element and is deterministic for a seed', () => {
  const a = Q.shuffle([1, 2, 3, 4, 5, 6], seeded(7)), b = Q.shuffle([1, 2, 3, 4, 5, 6], seeded(7));
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice().sort(), [1, 2, 3, 4, 5, 6]);
});

test('which-nerve questions: correct nerve, no ancestors or descendants among distractors', () => {
  const rng = seeded(11);
  D.muscles.filter((m) => !m.dual).forEach((m) => {
    for (let i = 0; i < 6; i++) {
      const q = Q.nerveQuestion(m, rng);
      check(q);
      const nv = H.nerveById(m.nerve);
      assert.equal(q.correct, Q.nerveLabel(nv));
      const fam = H.nerveFamily(nv.id).concat(nv.parent ? [nv.parent] : []).map((id) => Q.nerveLabel(H.nerveById(id)));
      q.options.forEach((o) => { if (o !== q.correct) assert.ok(!fam.includes(o), m.id + ': distractor ' + o + ' is related to the answer'); });
    }
  });
});

test('main-action questions are valid for every muscle', () => {
  const rng = seeded(5);
  D.muscles.forEach((m) => {
    const q = Q.actionQuestion(m, rng);
    check(q);
    assert.equal(q.correct, Q.shortAction(m));
  });
});

test('foramen questions in both directions never offer a second correct answer', () => {
  const rng = seeded(21);
  for (let i = 0; i < 600; i++) {
    const q = Q.foramenQuestion(rng, i % 2 ? 'which-foramen' : 'which-item');
    check(q);
    if (q.prompt.startsWith('Through which')) {
      const item = q.prompt.replace(/^Through which opening does this pass: /, '').replace(/\?$/, '');
      const holders = D.foramina.filter((f) => f.contents.includes(item)).map((f) => f.name);
      assert.deepEqual(holders, [q.correct], item);
      q.options.forEach((o) => { if (o !== q.correct) assert.ok(!holders.includes(o)); });
    } else {
      const f = D.foramina.find((x) => q.prompt.endsWith('the ' + x.name + '?'));
      assert.ok(f, q.prompt);
      assert.ok(f.contents.includes(q.correct));
      q.options.forEach((o) => { if (o !== q.correct) assert.ok(!f.contents.includes(o), q.prompt + ' / ' + o); });
    }
  }
});

test('lesion questions: clues exist for every lesion and options are lesion names', () => {
  [D.brachial, D.lumbosacral].forEach((P) => {
    const names = P.lesions.map((l) => l.short);
    P.lesions.forEach((les) => {
      const q = Q.lesionQuestion(P, seeded(3), les);
      check(q);
      assert.equal(q.correct, les.short);
      q.options.forEach((o) => assert.ok(names.includes(o)));
      assert.equal(q.clues.length, 4);
      q.clues.forEach((c) => assert.ok(c.text && c.text.length > 3, les.id + ' ' + c.label));
      // clues must not give away the answer name outright
      assert.ok(!q.clues[0].text.toLowerCase().includes(les.name.toLowerCase()));
    });
  });
});

test('lesion clues are distinguishing: no two lesions share both muscle list and sensory text', () => {
  [D.brachial, D.lumbosacral].forEach((P) => {
    const seen = new Set();
    P.lesions.forEach((l) => { const k = l.muscles.join('|') + '#' + l.sensory; assert.ok(!seen.has(k), l.id); seen.add(k); });
  });
});

test('cranial nerve questions', () => {
  const rng = seeded(99);
  for (let i = 0; i < 300; i++) check(Q.cranialQuestion(rng));
  assert.equal(Q.cranialLabel('cn-vii'), 'CN VII Facial');
  assert.equal(Q.cranialLabel('spinal-accessory'), 'CN XI Accessory');
});

test('dermatome / myotome / reflex questions of every kind', () => {
  const rng = seeded(1234);
  ['derm', 'landmark', 'myotome', 'reflex'].forEach((kind) => {
    for (let i = 0; i < 200; i++) check(Q.dermatomeQuestion(rng, kind));
  });
  // known answers
  const q = Q.dermatomeQuestion(seeded(2), 'landmark');
  assert.ok(['T4', 'T10', 'C6', 'C7', 'C8', 'L4', 'L5', 'S1', 'T6', 'L1', 'C5', 'S2'].includes(q.correct));
  const map = { 'the nipples': 'T4', 'the umbilicus': 'T10', 'the thumb': 'C6', 'the middle finger': 'C7', 'the little finger': 'C8', 'the medial malleolus': 'L4' };
  for (let i = 0; i < 400; i++) {
    const x = Q.dermatomeQuestion(seeded(i + 1), 'landmark');
    Object.keys(map).forEach((k) => { if (x.prompt.endsWith('at ' + k + '?')) assert.equal(x.correct, map[k]); });
  }
  for (let i = 0; i < 100; i++) {
    const x = Q.dermatomeQuestion(seeded(i + 7), 'reflex');
    if (/biceps jerk/.test(x.prompt)) assert.equal(x.correct, 'C5–C6');
    if (/triceps jerk/.test(x.prompt)) assert.equal(x.correct, 'C6–C8');
    if (/ankle \(achilles\) jerk/.test(x.prompt)) assert.equal(x.correct, 'S1–S2');
  }
});

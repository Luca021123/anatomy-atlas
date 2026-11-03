// Data-integrity tests for the Anatomy Atlas (student/data/anatomy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../student/data/anatomy.js');
const H = D.helpers;

const SEG = new Set(H.SEQ);
const CN = new Set(H.CN_TOKENS);
const validRoot = (r) => SEG.has(r) || CN.has(r);
const uniq = (arr) => new Set(arr).size === arr.length;
const nerveIds = new Set(D.nerves.map((n) => n.id));
const muscleIds = new Set(D.muscles.map((m) => m.id));

test('root expansion and labels', () => {
  assert.deepEqual(H.expandRoots('C5-C7'), ['C5', 'C6', 'C7']);
  assert.deepEqual(H.expandRoots('C8-T1'), ['C8', 'T1']);
  assert.deepEqual(H.expandRoots('L5,S1'), ['L5', 'S1']);
  assert.deepEqual(H.expandRoots('L4-S1'), ['L4', 'L5', 'S1']);
  assert.deepEqual(H.expandRoots('CN VII'), ['CN VII']);
  assert.equal(H.rootsLabel(['C5', 'C6', 'C7']), 'C5–C7');
  assert.equal(H.rootsLabel(['C8', 'T1']), 'C8–T1');
  assert.equal(H.rootsLabel(['S1']), 'S1');
});

test('there are at least 90 muscles across all regions', () => {
  assert.ok(D.muscles.length >= 90, 'muscle count ' + D.muscles.length);
  const regions = new Set(D.regions.map((r) => r.id));
  D.muscles.forEach((m) => assert.ok(regions.has(m.region), m.id + ' region'));
  D.regions.forEach((r) => assert.ok(D.muscles.some((m) => m.region === r.id), 'no muscles in ' + r.id));
  assert.ok(D.muscles.filter((m) => m.region === 'upper-limb').length >= 35);
  assert.ok(D.muscles.filter((m) => m.region === 'lower-limb').length >= 35);
});

test('every muscle has all required fields', () => {
  const req = ['id', 'name', 'region', 'group', 'origin', 'insertion', 'nerve', 'action', 'blood', 'clinical'];
  D.muscles.forEach((m) => {
    req.forEach((f) => assert.ok(typeof m[f] === 'string' && m[f].trim().length > 2, m.id + '.' + f));
    assert.ok(Array.isArray(m.roots) && m.roots.length >= 1, m.id + ' roots');
    assert.ok(m.rootsText.length > 0);
    assert.ok(m.action.length > 8 && m.blood.length > 5 && m.clinical.length > 15, m.id + ' text too short');
  });
});

test('ids are unique across muscles, nerves, nodes, lesions, foramina and cranial nerves', () => {
  assert.ok(uniq(D.muscles.map((m) => m.id)), 'muscles');
  assert.ok(uniq(D.nerves.map((n) => n.id)), 'nerves');
  assert.ok(uniq(D.muscles.map((m) => m.name)), 'muscle names');
  [D.brachial, D.lumbosacral].forEach((p) => {
    assert.ok(uniq(p.nodes.map((n) => n.id)), p.id + ' nodes');
    assert.ok(uniq(p.lesions.map((l) => l.id)), p.id + ' lesions');
    assert.ok(uniq(p.lesions.map((l) => l.short)), p.id + ' lesion short names');
  });
  assert.ok(uniq(D.foramina.map((f) => f.id)), 'foramina');
  assert.ok(uniq(D.cranial.map((c) => c.id)), 'cranial');
  assert.ok(uniq(D.dermatomes.map((d) => d.level)), 'dermatomes');
  assert.ok(uniq(D.myotomes.map((d) => d.level)), 'myotomes');
});

test('every innervating nerve referenced by a muscle exists in the nerve list', () => {
  D.muscles.forEach((m) => {
    assert.ok(nerveIds.has(m.nerve), m.id + ' -> unknown nerve ' + m.nerve);
    if (m.also) assert.ok(nerveIds.has(m.also), m.id + ' -> unknown secondary nerve ' + m.also);
    assert.equal(m.dual, !!m.also);
  });
  D.nerves.forEach((n) => { if (n.parent) assert.ok(nerveIds.has(n.parent), n.id + ' parent'); });
  // every nerve is either a parent of another, supplies a muscle, or is a sensory/diagram-only structure
  D.nerves.filter((n) => n.kind === 'motor').forEach((n) => assert.ok(H.musclesOfNerve(n.id).length > 0, 'motor nerve with no muscle: ' + n.id));
});

test('root values are valid spinal or cranial segments', () => {
  D.nerves.forEach((n) => {
    assert.ok(n.roots.length >= 1, n.id);
    n.roots.concat(n.variant).forEach((r) => assert.ok(validRoot(r), n.id + ' root ' + r));
  });
  D.muscles.forEach((m) => m.roots.forEach((r) => assert.ok(validRoot(r), m.id + ' root ' + r)));
  // cranial nerve roots are CN tokens; spinal nerve roots are not
  D.nerves.filter((n) => n.group === 'cranial').forEach((n) => n.roots.forEach((r) => assert.match(r, /^CN /)));
  D.muscles.filter((m) => m.nerve.startsWith('cn-')).forEach((m) => m.roots.forEach((r) => assert.match(r, /^CN /)));
});

test('muscle root values are consistent with their nerve (including variants and secondary supply)', () => {
  D.muscles.forEach((m) => {
    const allowed = new Set();
    [m.nerve, m.also].filter(Boolean).forEach((id) => {
      const n = H.nerveById(id);
      n.roots.concat(n.variant).forEach((r) => allowed.add(r));
      // a branch may carry fibres of its parent nerve
      if (n.parent) { const p = H.nerveById(n.parent); p.roots.concat(p.variant).forEach((r) => allowed.add(r)); }
    });
    m.roots.forEach((r) => assert.ok(allowed.has(r), m.id + ' root ' + r + ' not in nerve ' + m.nerve + ' (' + [...allowed].join(',') + ')'));
  });
});

test('standard teaching: classic nerve root values', () => {
  const roots = (id) => H.nerveById(id).rootsText.replace(/ \(.*\)$/, '');
  assert.equal(roots('musculocutaneous'), 'C5–C7');
  assert.equal(roots('axillary'), 'C5–C6');
  assert.equal(roots('radial'), 'C5–T1');
  assert.equal(roots('median'), 'C6–T1');
  assert.equal(roots('ulnar'), 'C8–T1');
  assert.deepEqual(H.nerveById('ulnar').variant, ['C7']);
  assert.deepEqual(H.nerveById('median').variant, ['C5']);
  assert.equal(roots('long-thoracic'), 'C5–C7');
  assert.equal(roots('femoral'), 'L2–L4');
  assert.equal(roots('obturator'), 'L2–L4');
  assert.equal(roots('sciatic'), 'L4–S3');
  assert.equal(roots('pudendal'), 'S2–S4');
  assert.equal(roots('phrenic'), 'C3–C5');
  assert.equal(roots('superior-gluteal'), 'L4–S1');
  assert.equal(roots('inferior-gluteal'), 'L5–S2');
});

test('standard teaching: classic muscle to nerve pairs', () => {
  const pairs = {
    deltoid: 'axillary', 'teres-minor': 'axillary', 'biceps-brachii': 'musculocutaneous', brachialis: 'musculocutaneous', 'coracobrachialis': 'musculocutaneous',
    'triceps-brachii': 'radial', 'serratus-anterior': 'long-thoracic', 'latissimus-dorsi': 'thoracodorsal', 'supraspinatus': 'suprascapular', infraspinatus: 'suprascapular',
    'rhomboid-major': 'dorsal-scapular', trapezius: 'spinal-accessory', 'pronator-teres': 'median', 'flexor-carpi-ulnaris': 'ulnar', 'flexor-pollicis-longus': 'anterior-interosseous',
    'abductor-pollicis-brevis': 'median-recurrent', 'adductor-pollicis': 'ulnar-deep', 'extensor-digitorum': 'posterior-interosseous', brachioradialis: 'radial',
    'gluteus-maximus': 'inferior-gluteal', 'gluteus-medius': 'superior-gluteal', 'rectus-femoris': 'femoral', sartorius: 'femoral', 'adductor-longus': 'obturator', gracilis: 'obturator',
    semitendinosus: 'tibial', 'biceps-femoris-short': 'common-fibular', 'tibialis-anterior': 'deep-fibular', 'fibularis-longus': 'superficial-fibular', gastrocnemius: 'tibial',
    'tibialis-posterior': 'tibial', diaphragm: 'phrenic', masseter: 'cn-v3', 'orbicularis-oculi': 'cn-vii', 'lateral-rectus': 'cn-vi', 'superior-oblique': 'cn-iv', genioglossus: 'cn-xii',
    stylopharyngeus: 'cn-ix', 'posterior-cricoarytenoid': 'recurrent-laryngeal', cricothyroid: 'external-laryngeal', 'levator-palpebrae-superioris': 'cn-iii',
    'dorsal-interossei': 'ulnar-deep', 'lumbricals-1-2': 'median', 'lumbricals-3-4': 'ulnar-deep'
  };
  Object.keys(pairs).forEach((id) => { const m = H.muscleById(id); assert.ok(m, id); assert.equal(m.nerve, pairs[id], id); });
});

test('dual-supplied muscles are flagged', () => {
  ['pectoralis-major', 'flexor-digitorum-profundus', 'flexor-pollicis-brevis', 'adductor-magnus', 'subscapularis', 'brachialis', 'pectineus'].forEach((id) => assert.ok(H.muscleById(id).dual, id));
});

test('nerve families and reverse look-ups', () => {
  assert.ok(H.nerveFamily('median').includes('anterior-interosseous'));
  assert.ok(H.nerveFamily('median').includes('median-recurrent'));
  assert.ok(H.nerveFamily('sciatic').includes('medial-plantar'));
  assert.ok(H.nerveFamily('common-fibular').includes('deep-fibular'));
  const radial = H.musclesOfNerve('radial').map((m) => m.id);
  assert.ok(radial.includes('triceps-brachii') && radial.includes('extensor-indicis') && radial.includes('supinator'));
  assert.ok(!H.musclesOfNerve('radial', false).some((m) => m.id === 'extensor-indicis'));
  assert.ok(H.musclesOfNerve('ulnar').some((m) => m.id === 'dorsal-interossei'));
});

test('every action filter tag matches at least one muscle; all muscles have a tag or a good reason', () => {
  D.actionTags.forEach((t) => assert.ok(D.muscles.some((m) => t.re.test(m.action)), t.id));
  const untagged = D.muscles.filter((m) => !H.tagsOf(m).length);
  assert.ok(untagged.length / D.muscles.length < 0.15, 'too many untagged: ' + untagged.map((m) => m.id).join(','));
});

for (const key of ['brachial', 'lumbosacral']) {
  test(key + ': graph is well formed', () => {
    const P = D[key];
    const ids = new Set(P.nodes.map((n) => n.id));
    P.nodes.forEach((n) => {
      assert.ok(n.label && n.name && n.type && n.grp, n.id);
      assert.ok(P.groups.some((g) => g.id === n.grp), n.id + ' group ' + n.grp);
      if (n.nerve) assert.ok(nerveIds.has(n.nerve), n.id + ' nerve ' + n.nerve);
      ['roots', 'injury', 'sign', 'sensory', 'motor'].forEach((f) => {
        // motor text is optional for nodes whose nerve provides muscles
        if (f === 'motor' && n.nerve && (H.musclesOfNerve(n.nerve).length || H.nerveById(n.nerve).kind === 'sensory')) return;
        assert.ok(typeof n[f] === 'string' && n[f].length >= 2, n.id + '.' + f);
      });
      if (n.nerve) {
        const nv = H.nerveById(n.nerve);
        const norm = (s) => s.replace(/ \(.*\)$/, '').replace(/\s/g, '').replace(/,/g, '');
        const dispRoots = n.roots.replace(/ \(.*\)$/, '');
        const nr = nv.roots.concat([]);
        const label = H.rootsLabel(nr);
        const asArr = H.expandRoots(dispRoots.replace(/–/g, '-'));
        asArr.forEach((r) => assert.ok(nv.roots.concat(nv.variant).includes(r), n.id + ' displays root ' + r + ' that its nerve lacks'));
        assert.ok(norm(label).length > 0);
      }
    });
    P.edges.forEach((e) => {
      const [a, b] = e.split('>');
      assert.ok(ids.has(a) && ids.has(b), 'edge ' + e);
    });
    assert.ok(uniq(P.edges), 'duplicate edges');
    // every node is connected
    const touched = new Set();
    P.edges.forEach((e) => e.split('>').forEach((x) => touched.add(x)));
    P.nodes.forEach((n) => assert.ok(touched.has(n.id), n.id + ' is isolated'));
  });

  test(key + ': layouts place every node inside the viewBox without overlaps', () => {
    const P = D[key];
    ['wide', 'narrow'].forEach((name) => {
      const L = P.layouts[name];
      const [W, Hh] = L.vb;
      const ids = Object.keys(L.pos);
      assert.equal(ids.length, P.nodes.length, name + ' has a position for every node');
      P.nodes.forEach((n) => assert.ok(L.pos[n.id], name + ' missing ' + n.id));
      const rects = ids.map((id) => { const [cx, cy, w, h] = L.pos[id]; return { id, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }; });
      rects.forEach((r) => assert.ok(r.x0 >= 0 && r.x1 <= W && r.y0 >= 0 && r.y1 <= Hh, name + ' ' + r.id + ' outside viewBox'));
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const hit = a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
        assert.ok(!hit, name + ': ' + a.id + ' overlaps ' + b.id);
      }
      Object.keys(L.lanes || {}).forEach((e) => assert.ok(P.edges.includes(e), 'lane for unknown edge ' + e));
    });
  });

  test(key + ': lesions reference real muscles and nodes and carry full clinical content', () => {
    const P = D[key];
    const ids = new Set(P.nodes.map((n) => n.id));
    assert.ok(P.lesions.length >= (key === 'brachial' ? 9 : 8));
    P.lesions.forEach((l) => {
      ['name', 'short', 'mechanism', 'sensory', 'sign', 'spared'].forEach((f) => assert.ok(typeof l[f] === 'string' && l[f].length >= 4, l.id + '.' + f));
      assert.ok(l.sites.length >= 1, l.id + ' sites');
      l.sites.concat(l.affected, l.partial).forEach((id) => assert.ok(ids.has(id), l.id + ' unknown node ' + id));
      assert.ok(uniq(l.muscles), l.id + ' duplicate muscle');
      l.muscles.forEach((id) => assert.ok(muscleIds.has(id), l.id + ' unknown muscle ' + id));
      const overlap = l.sites.filter((s) => l.affected.includes(s) || l.partial.includes(s));
      assert.equal(overlap.length, 0, l.id + ' site also listed as affected');
      if (l.id !== 'meralgia') assert.ok(l.muscles.length >= 1, l.id + ' needs paralysed muscles');
    });
  });
}

test('brachial plexus: required structures and lesions are present', () => {
  const ids = new Set(D.brachial.nodes.map((n) => n.id));
  ['c5', 'c6', 'c7', 'c8', 't1', 'trunk-upper', 'trunk-middle', 'trunk-lower', 'cord-lat', 'cord-post', 'cord-med',
    'musculocutaneous', 'axillary', 'radial', 'median', 'ulnar', 'dorsal-scapular', 'long-thoracic', 'suprascapular', 'n-subclavius', 'lateral-pectoral', 'medial-pectoral',
    'upper-subscapular', 'lower-subscapular', 'thoracodorsal', 'mcn-arm', 'mcn-forearm'].forEach((id) => assert.ok(ids.has(id), id));
  assert.equal(D.brachial.nodes.filter((n) => n.type === 'division').length, 6);
  ['erb', 'klumpke', 'long-thoracic', 'axillary-neck', 'radial-shaft', 'median-carpal', 'median-elbow', 'ulnar-elbow', 'ulnar-wrist'].forEach((id) => assert.ok(D.brachial.lesions.some((l) => l.id === id), id));
  // anatomy of the pathway: posterior divisions -> posterior cord; lower anterior -> medial cord, etc.
  const E = new Set(D.brachial.edges);
  ['div-up-post>cord-post', 'div-mid-post>cord-post', 'div-low-post>cord-post', 'div-up-ant>cord-lat', 'div-mid-ant>cord-lat', 'div-low-ant>cord-med',
    'cord-lat>median', 'cord-med>median', 'cord-med>ulnar', 'cord-lat>musculocutaneous', 'cord-post>axillary', 'cord-post>radial', 'c7>trunk-middle', 'c8>trunk-lower', 't1>trunk-lower'].forEach((e) => assert.ok(E.has(e), e));
  // classic clinical facts
  const L = (id) => D.brachial.lesions.find((l) => l.id === id);
  assert.ok(L('erb').muscles.includes('deltoid') && L('erb').muscles.includes('biceps-brachii') && !L('erb').muscles.includes('dorsal-interossei'));
  assert.ok(L('klumpke').muscles.includes('dorsal-interossei') && !L('klumpke').muscles.includes('deltoid'));
  assert.deepEqual(L('long-thoracic').muscles, ['serratus-anterior']);
  assert.deepEqual(L('axillary-neck').muscles.sort(), ['deltoid', 'teres-minor']);
  assert.ok(!L('radial-shaft').muscles.includes('triceps-brachii'), 'triceps is spared in the spiral groove');
  assert.ok(L('radial-shaft').muscles.includes('extensor-digitorum'));
  assert.ok(L('median-carpal').muscles.includes('opponens-pollicis') && !L('median-carpal').muscles.includes('pronator-teres'));
  assert.ok(L('median-elbow').muscles.includes('pronator-teres') && L('median-elbow').muscles.includes('flexor-pollicis-longus'));
  assert.ok(L('ulnar-elbow').muscles.includes('flexor-carpi-ulnaris') && !L('ulnar-wrist').muscles.includes('flexor-carpi-ulnaris'));
  assert.ok(L('ulnar-wrist').muscles.includes('dorsal-interossei'));
  // every muscle supplied by the median nerve proper at the elbow is represented except FDP/FDS pairs handled via 'also'
  H.musclesOfNerve('median').forEach((m) => assert.ok(L('median-elbow').muscles.includes(m.id) || m.id === 'flexor-pollicis-brevis', 'median-elbow misses ' + m.id));
});

test('lumbosacral plexus: required structures and lesions are present', () => {
  const ids = new Set(D.lumbosacral.nodes.map((n) => n.id));
  ['iliohypogastric', 'ilioinguinal', 'genitofemoral', 'lateral-femoral-cutaneous', 'femoral', 'obturator', 'superior-gluteal', 'inferior-gluteal', 'sciatic', 'tibial', 'common-fibular',
    'superficial-fibular', 'deep-fibular', 'pudendal', 'posterior-femoral-cutaneous'].forEach((id) => assert.ok(ids.has(id), id));
  const L = (id) => D.lumbosacral.lesions.find((l) => l.id === id);
  ['foot-drop', 'trendelenburg', 'meralgia', 'obturator', 'femoral', 'sciatic', 'tibial'].forEach((id) => assert.ok(L(id), id));
  assert.ok(L('foot-drop').muscles.includes('tibialis-anterior') && !L('foot-drop').muscles.includes('tibialis-posterior'));
  assert.deepEqual(L('trendelenburg').muscles.slice(0, 2), ['gluteus-medius', 'gluteus-minimus']);
  assert.deepEqual(L('meralgia').muscles, []);
  assert.ok(L('femoral').muscles.includes('vastus-lateralis'));
  assert.ok(L('obturator').muscles.includes('adductor-longus') && L('obturator').muscles.includes('gracilis'));
  assert.ok(L('l5').muscles.includes('tibialis-posterior'), 'L5 radiculopathy weakens inversion unlike a fibular palsy');
});

test('cranial nerves: twelve complete entries', () => {
  assert.equal(D.cranial.length, 12);
  assert.deepEqual(D.cranial.map((c) => c.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(D.cranial.map((c) => c.numeral), ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']);
  ['modality'].forEach((f) => D.cranial.forEach((c) => assert.ok(c[f].length >= 4, c.id + '.' + f)));
  const req = ['components', 'nuclei', 'exit', 'foramen', 'branches', 'test', 'lesion', 'causes'];
  D.cranial.forEach((c) => {
    req.forEach((f) => assert.ok(typeof c[f] === 'string' && c[f].length > 8, c.id + '.' + f));
    assert.ok(c.name.length >= 4);
    assert.ok(Array.isArray(c.functions) && c.functions.length >= 1, c.id + ' functions');
    assert.ok(nerveIds.has(c.id), c.id + ' must be in the nerve list');
    assert.ok(D.brainstemExits[c.id], c.id + ' exit level');
  });
  const mod = (n) => D.cranial[n - 1].modality;
  [1, 2, 8].forEach((n) => assert.equal(mod(n), 'Sensory'));
  [3, 4, 6, 11, 12].forEach((n) => assert.equal(mod(n), 'Motor'));
  [5, 7, 9, 10].forEach((n) => assert.match(mod(n), /Both/));
  assert.match(D.cranial[3].exit, /[Dd]orsal/);
  assert.match(D.cranial[2].foramen, /Superior orbital fissure/);
  assert.match(D.cranial[11].foramen, /Hypoglossal canal/);
  assert.match(D.cranial[7].foramen, /Internal acoustic meatus/);
});

test('cranial quiz bank answers refer to real cranial nerves', () => {
  const ids = new Set(D.cranial.map((c) => c.id));
  D.quiz.cranialBank.forEach((q) => { assert.ok(ids.has(q.a), q.q); assert.ok(q.why.length > 10); });
  assert.ok(D.quiz.cranialBank.length >= 30);
  assert.ok(uniq(D.quiz.cranialBank.map((q) => q.q)));
});

test('dermatomes, myotomes and reflexes', () => {
  const levels = D.dermatomes.map((d) => d.level);
  ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'T1', 'T2', 'T4', 'T10', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'S2', 'S3', 'S4-5'].forEach((l) => assert.ok(levels.includes(l), l));
  const dm = (l) => D.dermatomes.find((d) => d.level === l);
  assert.match(dm('C6').point, /thumb/i);
  assert.match(dm('C7').point, /middle finger/i);
  assert.match(dm('C8').point, /little finger/i);
  assert.match(dm('T4').point, /nipple/i);
  assert.match(dm('T10').point, /umbilicus/i);
  assert.match(dm('L4').point, /medial malleolus/i);
  assert.match(dm('L5').point, /dorsum of the foot/i);
  assert.match(dm('S1').point, /lateral heel/i);
  D.dermatomes.forEach((d) => {
    (d.level === 'S4-5' ? ['S4', 'S5'] : [d.level]).forEach((x) => assert.ok(validRoot(x), d.level));
    assert.ok(d.point.length > 5 && d.area.length > 5 && ['front', 'back', 'both'].includes(d.view));
  });
  D.myotomes.forEach((m) => { m.muscles.forEach((id) => assert.ok(muscleIds.has(id), m.level + ' ' + id)); assert.ok(m.movement && m.note); });
  const key = D.myotomes.filter((m) => m.key).map((m) => m.level);
  assert.deepEqual(key, ['C5', 'C6', 'C7', 'C8', 'T1', 'L2', 'L3', 'L4', 'L5', 'S1'], 'ISNCSCI key muscle levels');
  D.reflexes.forEach((r) => {
    H.expandRoots(r.roots).forEach((x) => assert.ok(validRoot(x), r.id + ' ' + x));
    assert.ok(nerveIds.has(r.nerve), r.id + ' nerve ' + r.nerve);
    assert.ok(r.test.length > 20);
  });
  const rf = (id) => H.rootsLabel(H.expandRoots(D.reflexes.find((r) => r.id === id).roots));
  assert.equal(rf('biceps'), 'C5–C6');
  assert.equal(rf('brachioradialis'), 'C5–C6');
  assert.equal(rf('triceps'), 'C6–C8');
  assert.equal(rf('knee'), 'L2–L4');
  assert.equal(rf('ankle'), 'S1–S2');
});

test('skull foramina: contents, keys and uniqueness', () => {
  assert.ok(D.foramina.length >= 25);
  const need = ['cribriform-plate', 'optic-canal', 'superior-orbital-fissure', 'foramen-rotundum', 'foramen-ovale', 'foramen-spinosum', 'carotid-canal', 'internal-acoustic-meatus', 'jugular-foramen', 'hypoglossal-canal', 'foramen-magnum', 'stylomastoid-foramen'];
  need.forEach((id) => assert.ok(D.foramina.some((f) => f.id === id), id));
  const F = (id) => D.foramina.find((f) => f.id === id);
  assert.ok(F('foramen-rotundum').contents.some((c) => /V2/.test(c)));
  assert.ok(F('foramen-ovale').contents.some((c) => /V3/.test(c)));
  assert.ok(F('foramen-spinosum').contents.some((c) => /Middle meningeal artery/.test(c)));
  assert.ok(F('superior-orbital-fissure').contents.some((c) => /CN III/.test(c)) && F('superior-orbital-fissure').contents.some((c) => /CN VI/.test(c)));
  assert.ok(F('jugular-foramen').contents.some((c) => /CN IX/.test(c)) && F('jugular-foramen').contents.some((c) => /CN X\)/.test(c)) && F('jugular-foramen').contents.some((c) => /CN XI/.test(c)));
  assert.ok(F('optic-canal').contents.some((c) => /CN II/.test(c)));
  assert.ok(F('hypoglossal-canal').contents.some((c) => /CN XII/.test(c)));
  D.foramina.forEach((f) => {
    assert.ok(f.name && f.location && f.contents.length >= 1 && f.note !== undefined, f.id);
    assert.ok(D.fossaLabels[f.fossa], f.id + ' fossa');
    f.key.forEach((k) => {
      assert.ok(f.contents.includes(k), f.id + ' key not in contents: ' + k);
      D.foramina.filter((o) => o.id !== f.id).forEach((o) => assert.ok(!o.contents.includes(k), 'key "' + k + '" of ' + f.id + ' also listed in ' + o.id));
    });
  });
  assert.equal(F('foramen-lacerum').key.length, 0, 'no quiz item for the foramen lacerum trap');
  assert.ok(D.foramina.filter((f) => f.key.length).length >= 20);
});

test('sources are cited', () => {
  assert.ok(D.sources.length >= 4);
  assert.ok(D.brachial.sources.length >= 2 && D.lumbosacral.sources.length >= 2);
});

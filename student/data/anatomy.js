/* Open Medical Toolkit — Anatomy Atlas data (student suite, package S3).
 *
 * Teaching conventions follow Moore’s Clinically Oriented Anatomy (8th/9th ed.) and
 * Gray’s Anatomy for Students (4th/5th ed.). Where textbooks differ the variant is
 * stored in `variant` / `note` fields and shown in the UI. Dermatome key points follow
 * the ISNCSCI (ASIA) sensory key points. Cranial nerve detail follows Moore, Gray’s,
 * Blumenfeld "Neuroanatomy through Clinical Cases" and the standard bedside neurological
 * examination (e.g. Bickley, Bates’ Guide to Physical Examination).
 *
 * Exported as MTData.anatomy in the browser and module.exports under Node.
 * Pure data: no DOM, no MT.
 */
(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else (root.MTData = root.MTData || {}).anatomy = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- spinal / cranial segment helpers ---------- */
  var SEQ = [];
  (function () {
    var i;
    for (i = 1; i <= 8; i++) SEQ.push('C' + i);
    for (i = 1; i <= 12; i++) SEQ.push('T' + i);
    for (i = 1; i <= 5; i++) SEQ.push('L' + i);
    for (i = 1; i <= 5; i++) SEQ.push('S' + i);
    SEQ.push('Co1');
  })();
  var CRANIAL = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  var CN_TOKENS = CRANIAL.map(function (r) { return 'CN ' + r; });

  /** "C5-C7" -> ['C5','C6','C7']; "L5,S1" -> ['L5','S1']; "CN VII" -> ['CN VII']. */
  function expandRoots(spec) {
    if (!spec) return [];
    var out = [];
    String(spec).split(',').forEach(function (tok) {
      tok = tok.trim();
      var m = tok.match(/^([CTLS]\d+|Co1)-([CTLS]\d+|Co1)$/);
      if (m) {
        var a = SEQ.indexOf(m[1]), b = SEQ.indexOf(m[2]);
        if (a < 0 || b < 0 || b < a) { out.push(tok); return; }
        for (var i = a; i <= b; i++) out.push(SEQ[i]);
      } else if (tok) out.push(tok);
    });
    return out;
  }
  /** ['C5','C6','C7'] -> "C5–C7"; ['L5','S1'] -> "L5, S1" (en-dash ranges when 3+ contiguous). */
  function rootsLabel(list) {
    if (!list || !list.length) return '';
    if (list.length === 1) return list[0].replace('Co1', 'Co1');
    if (list[0].indexOf('CN') === 0) return list.join(', ');
    var idx = list.map(function (r) { return SEQ.indexOf(r); });
    var contiguous = idx.every(function (v, i) { return i === 0 || v === idx[i - 1] + 1; });
    if (contiguous) return list[0] + '–' + list[list.length - 1];
    return list.join(', ');
  }

  var REGIONS = [
    { id: 'upper-limb', label: 'Upper limb' },
    { id: 'lower-limb', label: 'Lower limb' },
    { id: 'back', label: 'Back' },
    { id: 'thorax', label: 'Thorax' },
    { id: 'abdomen', label: 'Abdominal wall & pelvis' },
    { id: 'head-neck', label: 'Head & neck' }
  ];

  /* ====================================================================
     NERVES (every muscle's innervating nerve must be listed here)
     N(id, name, roots, group, opts) — roots are the usual textbook segments;
     opts.variant = extra segments reported by some texts; opts.parent = parent nerve id.
     ==================================================================== */
  function N(id, name, roots, group, o) {
    o = o || {};
    var r = expandRoots(roots), v = expandRoots(o.variant);
    return {
      id: id, name: name, roots: r, variant: v, group: group,
      rootsText: o.rootsText || (rootsLabel(r) + (v.length ? ' (' + rootsLabel(v) + ' in some texts)' : '')),
      parent: o.parent || null, kind: o.kind || 'mixed', note: o.note || ''
    };
  }
  var nerves = [
    // brachial plexus: roots and trunk branches
    N('dorsal-scapular', 'Dorsal scapular nerve', 'C5', 'brachial', { variant: 'C4', kind: 'motor', note: 'Arises from the C5 root, often piercing the middle scalene; runs deep to levator scapulae and the rhomboids with the dorsal scapular artery.' }),
    N('long-thoracic', 'Long thoracic nerve', 'C5-C7', 'brachial', { kind: 'motor', note: 'Arises from the roots (before the trunks), pierces the middle scalene and descends on the lateral thoracic wall on serratus anterior. Long, superficial course makes it vulnerable.' }),
    N('suprascapular', 'Suprascapular nerve', 'C5-C6', 'brachial', { variant: 'C4', kind: 'mixed', note: 'From the upper trunk; passes under the superior transverse scapular ligament (artery runs over it), then around the spinoglenoid notch.' }),
    N('n-subclavius', 'Nerve to subclavius', 'C5-C6', 'brachial', { kind: 'motor', note: 'From the upper trunk; may give an accessory phrenic contribution.' }),
    N('lateral-pectoral', 'Lateral pectoral nerve', 'C5-C7', 'brachial', { kind: 'motor', note: 'From the lateral cord; pierces the clavipectoral fascia; supplies mainly pectoralis major (clavicular head).' }),
    N('medial-pectoral', 'Medial pectoral nerve', 'C8-T1', 'brachial', { variant: 'C7', kind: 'motor', note: 'From the medial cord; passes through or around pectoralis minor to reach pectoralis major.' }),
    N('upper-subscapular', 'Upper subscapular nerve', 'C5-C6', 'brachial', { variant: 'C7', kind: 'motor', note: 'From the posterior cord; supplies the upper part of subscapularis.' }),
    N('thoracodorsal', 'Thoracodorsal nerve (middle subscapular)', 'C6-C8', 'brachial', { kind: 'motor', note: 'From the posterior cord; runs with the thoracodorsal artery on the posterior axillary wall to latissimus dorsi. At risk in axillary node dissection.' }),
    N('lower-subscapular', 'Lower subscapular nerve', 'C5-C6', 'brachial', { variant: 'C7', kind: 'motor', note: 'From the posterior cord; supplies the lower subscapularis and teres major.' }),
    N('mcn-arm', 'Medial cutaneous nerve of the arm', 'T1', 'brachial', { variant: 'C8', kind: 'sensory', note: 'From the medial cord (T1); joins the intercostobrachial nerve (T2) to supply the medial arm.' }),
    N('mcn-forearm', 'Medial cutaneous nerve of the forearm', 'C8-T1', 'brachial', { kind: 'sensory', note: 'From the medial cord; pierces the deep fascia with the basilic vein; supplies the medial forearm.' }),
    N('musculocutaneous', 'Musculocutaneous nerve', 'C5-C7', 'brachial', { note: 'Lateral cord; pierces coracobrachialis; ends as the lateral cutaneous nerve of the forearm. Supplies the anterior arm compartment.' }),
    N('axillary', 'Axillary nerve', 'C5-C6', 'brachial', { note: 'Posterior cord; exits through the quadrangular space with the posterior circumflex humeral artery, winds around the surgical neck of the humerus. Gives the superior lateral cutaneous nerve of the arm (regimental-badge area).' }),
    N('radial', 'Radial nerve', 'C5-T1', 'brachial', { note: 'Posterior cord; descends in the radial (spiral) groove with the profunda brachii artery; pierces the lateral intermuscular septum; divides at the lateral epicondyle into superficial (sensory) and deep/posterior interosseous (motor) branches.' }),
    N('posterior-interosseous', 'Posterior interosseous nerve (deep radial)', 'C7-C8', 'brachial', { parent: 'radial', variant: 'C6', kind: 'motor', note: 'Motor continuation of the deep branch of the radial nerve; pierces and travels through the supinator (arcade of Frohse). Supplies the extensor compartment of the forearm distal to brachioradialis/ECRL.' }),
    N('median', 'Median nerve', 'C6-T1', 'brachial', { variant: 'C5', note: 'Formed from lateral and medial cord roots (the "M" or "V" shape) anterior to the axillary artery; no branches in the arm; supplies the anterior forearm compartment except FCU and the medial half of FDP, and the thenar muscles and lateral two lumbricals.' }),
    N('anterior-interosseous', 'Anterior interosseous nerve', 'C8-T1', 'brachial', { parent: 'median', variant: 'C7', kind: 'motor', note: 'Branch of the median nerve in the proximal forearm; supplies FPL, lateral half of FDP and pronator quadratus. Pure motor (plus joint afferents).' }),
    N('median-recurrent', 'Recurrent (thenar) branch of the median nerve', 'C8-T1', 'brachial', { parent: 'median', kind: 'motor', note: 'Leaves the median nerve just distal to the flexor retinaculum and curls proximally over the thenar muscles. Superficial and vulnerable to lacerations of the thenar eminence.' }),
    N('ulnar', 'Ulnar nerve', 'C8-T1', 'brachial', { variant: 'C7', note: 'Medial cord; passes posterior to the medial epicondyle (cubital tunnel), between the heads of FCU, then through Guyon’s canal at the wrist. No branches in the arm.' }),
    N('ulnar-deep', 'Deep branch of the ulnar nerve', 'C8-T1', 'brachial', { parent: 'ulnar', kind: 'motor', note: 'Arises at the pisiform/hook of the hamate; winds around the hook of the hamate into the deep palm; supplies the hypothenar muscles, interossei, medial two lumbricals, adductor pollicis and the deep head of flexor pollicis brevis.' }),
    // cervical / thoracic
    N('spinal-accessory', 'Accessory nerve (CN XI)', 'CN XI', 'cervical', { kind: 'motor', note: 'Cranial root joins the vagus; spinal root (C1–C5) ascends through the foramen magnum, exits via the jugular foramen and supplies sternocleidomastoid and trapezius. C3–C4 carry their proprioception.' }),
    N('cervical-rami', 'Cervical ventral rami (direct muscular branches)', 'C2-C8', 'cervical', { kind: 'motor' }),
    N('ansa-cervicalis', 'Ansa cervicalis', 'C1-C3', 'cervical', { kind: 'motor', note: 'Superior root (C1, running with CN XII) and inferior root (C2–C3) supply the infrahyoid ("strap") muscles except thyrohyoid.' }),
    N('phrenic', 'Phrenic nerve', 'C3-C5', 'cervical', { note: 'Sole motor supply of the diaphragm; also sensory to the central diaphragm, pericardium and mediastinal pleura. "C3, 4, 5 keeps the diaphragm alive."' }),
    N('dorsal-rami', 'Dorsal (posterior) rami of spinal nerves', 'C1-S5', 'trunk', { note: 'Supply the intrinsic back muscles (erector spinae, transversospinalis) and overlying skin segmentally.' }),
    N('intercostal', 'Intercostal nerves', 'T1-T11', 'trunk', { note: 'Ventral rami of T1–T11; run in the costal groove between the innermost and internal intercostals, inferior to the vein and artery.' }),
    N('abdominal-wall-nerves', 'Thoraco-abdominal (T7–T11), subcostal (T12), iliohypogastric & ilioinguinal (L1) nerves', 'T7-L1', 'trunk', { note: 'Anterior abdominal wall muscles are supplied segmentally by the lower intercostal, subcostal, iliohypogastric and ilioinguinal nerves; these run between internal oblique and transversus abdominis.' }),
    // lumbosacral plexus
    N('lumbar-plexus-rami', 'Lumbar ventral rami (direct muscular branches)', 'T12-L4', 'lumbosacral', { kind: 'motor', note: 'Direct branches to psoas major (L1–L3) and quadratus lumborum (T12–L4).' }),
    N('iliohypogastric', 'Iliohypogastric nerve', 'T12-L1', 'lumbosacral', { note: 'Emerges from the lateral border of psoas major; supplies internal oblique/transversus abdominis and skin over the iliac crest (lateral cutaneous) and suprapubic region (anterior cutaneous).' }),
    N('ilioinguinal', 'Ilioinguinal nerve', 'L1', 'lumbosacral', { note: 'Enters the inguinal canal through the deep ring area, runs on the spermatic cord/round ligament; supplies skin of the upper medial thigh, root of penis/anterior scrotum or mons pubis/labia majora. At risk in hernia repair.' }),
    N('genitofemoral', 'Genitofemoral nerve', 'L1-L2', 'lumbosacral', { note: 'Pierces psoas major and descends on its anterior surface. Genital branch supplies cremaster (efferent limb of the cremasteric reflex); femoral branch supplies skin over the femoral triangle (afferent limb).' }),
    N('lateral-femoral-cutaneous', 'Lateral femoral cutaneous nerve', 'L2-L3', 'lumbosacral', { kind: 'sensory', note: 'Crosses iliacus and passes under/through the inguinal ligament near the ASIS; purely sensory to the anterolateral thigh.' }),
    N('femoral', 'Femoral nerve', 'L2-L4', 'lumbosacral', { note: 'Largest branch of the lumbar plexus; emerges lateral to psoas major, passes deep to the inguinal ligament lateral to the femoral artery (outside the femoral sheath).' }),
    N('saphenous', 'Saphenous nerve', 'L3-L4', 'lumbosacral', { parent: 'femoral', kind: 'sensory', note: 'Longest branch of the femoral nerve; passes through the adductor canal and accompanies the great saphenous vein to the medial malleolus and medial foot.' }),
    N('obturator', 'Obturator nerve', 'L2-L4', 'lumbosacral', { note: 'Emerges from the medial border of psoas major, passes through the obturator canal; anterior branch (adductor longus/brevis, gracilis) and posterior branch (obturator externus, adductor magnus adductor part).' }),
    N('superior-gluteal', 'Superior gluteal nerve', 'L4-S1', 'lumbosacral', { kind: 'motor', note: 'Leaves the pelvis through the greater sciatic foramen above piriformis; passes between gluteus medius and minimus.' }),
    N('inferior-gluteal', 'Inferior gluteal nerve', 'L5-S2', 'lumbosacral', { kind: 'motor', note: 'Leaves through the greater sciatic foramen below piriformis; supplies gluteus maximus only.' }),
    N('n-piriformis', 'Nerve to piriformis', 'S1-S2', 'lumbosacral', { kind: 'motor' }),
    N('n-obturator-internus', 'Nerve to obturator internus (and superior gemellus)', 'L5-S2', 'lumbosacral', { kind: 'motor', note: 'Leaves below piriformis, re-enters the perineum via the lesser sciatic foramen.' }),
    N('n-quadratus-femoris', 'Nerve to quadratus femoris (and inferior gemellus)', 'L4-S1', 'lumbosacral', { kind: 'motor' }),
    N('sciatic', 'Sciatic nerve', 'L4-S3', 'lumbosacral', { note: 'Two nerves in a common sheath: tibial (from the anterior divisions) and common fibular (from the posterior divisions). Leaves through the greater sciatic foramen below piriformis; usually divides at the apex of the popliteal fossa.' }),
    N('tibial', 'Tibial nerve', 'L4-S3', 'lumbosacral', { parent: 'sciatic', note: 'Supplies the hamstring part of adductor magnus, semitendinosus, semimembranosus, biceps long head, the posterior leg and (via plantar nerves) the sole.' }),
    N('common-fibular', 'Common fibular (peroneal) nerve', 'L4-S2', 'lumbosacral', { parent: 'sciatic', note: 'Winds around the neck of the fibula where it is superficial and easily injured; divides into superficial and deep fibular nerves. Supplies the short head of biceps femoris.' }),
    N('deep-fibular', 'Deep fibular nerve', 'L4-S1', 'lumbosacral', { parent: 'common-fibular', note: 'Supplies the anterior compartment of the leg and extensor digitorum brevis; sensory to the first web space only.' }),
    N('superficial-fibular', 'Superficial fibular nerve', 'L5-S2', 'lumbosacral', { parent: 'common-fibular', note: 'Supplies the lateral compartment (fibularis longus and brevis); sensory to the lower lateral leg and most of the dorsum of the foot.' }),
    N('medial-plantar', 'Medial plantar nerve', 'S1-S3', 'lumbosacral', { parent: 'tibial', note: 'Larger terminal branch of the tibial nerve: abductor hallucis, flexor digitorum brevis, flexor hallucis brevis and 1st lumbrical; skin of the medial sole and medial 3½ toes ("median nerve of the foot").' }),
    N('lateral-plantar', 'Lateral plantar nerve', 'S1-S3', 'lumbosacral', { parent: 'tibial', note: 'Supplies the remaining intrinsic foot muscles and the skin of the lateral 1½ toes ("ulnar nerve of the foot").' }),
    N('pudendal', 'Pudendal nerve', 'S2-S4', 'lumbosacral', { note: 'Leaves via the greater sciatic foramen, re-enters through the lesser sciatic foramen, runs in the pudendal (Alcock) canal; supplies perineal muscles, external anal and urethral sphincters and perineal skin. Landmark for pudendal block: ischial spine.' }),
    N('n-levator-ani', 'Nerve to levator ani', 'S3-S4', 'lumbosacral', { variant: 'S4', kind: 'motor', note: 'Direct sacral branches, plus perineal branch of the pudendal nerve.' }),
    N('posterior-femoral-cutaneous', 'Posterior femoral cutaneous nerve', 'S1-S3', 'lumbosacral', { kind: 'sensory', note: 'Leaves below piriformis; supplies skin of the posterior thigh and popliteal fossa, the perineum (perineal branches) and inferior buttock (inferior clunial nerves).' }),
    // cranial nerves
    N('cn-i', 'Olfactory nerve (CN I)', 'CN I', 'cranial', { kind: 'sensory' }),
    N('cn-ii', 'Optic nerve (CN II)', 'CN II', 'cranial', { kind: 'sensory' }),
    N('cn-iii', 'Oculomotor nerve (CN III)', 'CN III', 'cranial', { kind: 'mixed' }),
    N('cn-iv', 'Trochlear nerve (CN IV)', 'CN IV', 'cranial', { kind: 'motor' }),
    N('cn-v', 'Trigeminal nerve (CN V)', 'CN V', 'cranial', { kind: 'mixed' }),
    N('cn-v3', 'Mandibular nerve (CN V3)', 'CN V', 'cranial', { parent: 'cn-v', kind: 'mixed', note: 'Only division of the trigeminal nerve with a motor root; supplies the muscles of mastication, mylohyoid, anterior belly of digastric, tensor tympani and tensor veli palatini.' }),
    N('cn-vi', 'Abducens nerve (CN VI)', 'CN VI', 'cranial', { kind: 'motor' }),
    N('cn-vii', 'Facial nerve (CN VII)', 'CN VII', 'cranial', { kind: 'mixed' }),
    N('cn-viii', 'Vestibulocochlear nerve (CN VIII)', 'CN VIII', 'cranial', { kind: 'sensory' }),
    N('cn-ix', 'Glossopharyngeal nerve (CN IX)', 'CN IX', 'cranial', { kind: 'mixed' }),
    N('cn-x', 'Vagus nerve (CN X)', 'CN X', 'cranial', { kind: 'mixed' }),
    N('external-laryngeal', 'External laryngeal nerve (of the superior laryngeal nerve, CN X)', 'CN X', 'cranial', { parent: 'cn-x', kind: 'motor', note: 'Supplies cricothyroid; at risk beside the superior thyroid artery in thyroidectomy (lowers vocal pitch, weak high notes).' }),
    N('recurrent-laryngeal', 'Recurrent laryngeal nerve (CN X)', 'CN X', 'cranial', { parent: 'cn-x', kind: 'mixed', note: 'Supplies all intrinsic laryngeal muscles except cricothyroid. The left loops under the aortic arch; the right under the right subclavian artery. At risk in thyroid surgery.' }),
    N('cn-xii', 'Hypoglossal nerve (CN XII)', 'CN XII', 'cranial', { kind: 'motor' })
  ];

  /* ====================================================================
     MUSCLES
     M(id, name, region, group, origin, insertion, nerve, roots, action, blood, clinical, opts)
     opts.also = second innervating nerve id (dual supply -> excluded from "which nerve" quiz)
     opts.note = textbook variation / extra roots
     ==================================================================== */
  function M(id, name, region, group, origin, insertion, nerve, roots, action, blood, clinical, o) {
    o = o || {};
    var r = expandRoots(roots);
    return {
      id: id, name: name, region: region, group: group, origin: origin, insertion: insertion,
      nerve: nerve, roots: r, rootsText: rootsLabel(r), action: action, blood: blood, clinical: clinical,
      also: o.also || null, dual: !!o.also, note: o.note || ''
    };
  }
  var UL = 'upper-limb', LL = 'lower-limb';
  var muscles = [
    /* ---- Upper limb: pectoral and scapular girdle ---- */
    M('trapezius', 'Trapezius', UL, 'Posterior shoulder girdle', 'Medial third of superior nuchal line, external occipital protuberance, nuchal ligament, spinous processes of C7–T12', 'Lateral third of clavicle, acromion and spine of scapula', 'spinal-accessory', 'CN XI', 'Elevates (upper fibres), retracts (middle) and depresses (lower) the scapula; upper and lower fibres rotate the glenoid upward for abduction above 90°', 'Superficial branch of transverse cervical artery, dorsal scapular artery, occipital artery, posterior intercostal arteries', 'Accessory nerve injury (e.g. node biopsy in the posterior triangle) gives a drooping shoulder, weak shrug and difficulty abducting beyond 90°.', { note: 'C3–C4 carry proprioception only.' }),
    M('levator-scapulae', 'Levator scapulae', UL, 'Posterior shoulder girdle', 'Posterior tubercles of the transverse processes of C1–C4', 'Superior angle and medial border of scapula (above the spine)', 'dorsal-scapular', 'C5', 'Elevates the scapula and rotates the glenoid cavity inferiorly', 'Dorsal scapular artery, transverse cervical (descending branch) and ascending cervical arteries', 'Common site of myofascial trigger points ("stiff neck") at the superior scapular angle.', { note: 'Also receives branches of the C3–C4 cervical ventral rami.' }),
    M('rhomboid-major', 'Rhomboid major', UL, 'Posterior shoulder girdle', 'Spinous processes of T2–T5', 'Medial border of scapula from the spine to the inferior angle', 'dorsal-scapular', 'C5', 'Retracts the scapula and rotates the glenoid inferiorly; fixes the scapula to the thoracic wall', 'Dorsal scapular artery', 'Weakness lets the medial border lift off the chest (mild winging), best seen when the hands are pushed backward on the hips.', { note: 'Some texts give C4–C5.' }),
    M('rhomboid-minor', 'Rhomboid minor', UL, 'Posterior shoulder girdle', 'Nuchal ligament and spinous processes of C7–T1', 'Medial border of scapula at the root of the spine', 'dorsal-scapular', 'C5', 'Retracts the scapula and rotates the glenoid inferiorly', 'Dorsal scapular artery', 'Lies superior to rhomboid major; both are tested by pushing the elbows back against resistance with hands on hips.', { note: 'Some texts give C4–C5.' }),
    M('latissimus-dorsi', 'Latissimus dorsi', UL, 'Posterior shoulder girdle', 'Spinous processes of T7–T12 via thoracolumbar fascia, iliac crest, lower 3–4 ribs, inferior angle of scapula', 'Floor of the intertubercular sulcus of the humerus', 'thoracodorsal', 'C6-C8', 'Extends, adducts and medially rotates the humerus; drives the body upward in climbing and crutch-walking', 'Thoracodorsal artery; posterior intercostal and lumbar perforators', 'Used as a pedicled flap for breast reconstruction (thoracodorsal vessels); the nerve is at risk in axillary clearance.'),
    M('serratus-anterior', 'Serratus anterior', UL, 'Pectoral & scapular', 'Outer surfaces of ribs 1–8 (slips)', 'Anterior surface of the medial border of the scapula', 'long-thoracic', 'C5-C7', 'Protracts the scapula and rotates it upward (inferior angle moves laterally), allowing abduction beyond 90°; holds the scapula against the chest wall', 'Lateral thoracic artery, thoracodorsal artery, superior thoracic artery', 'Long thoracic nerve palsy: winged scapula that is most obvious when pushing against a wall.'),
    M('pectoralis-major', 'Pectoralis major', UL, 'Pectoral & scapular', 'Clavicular head: medial half of clavicle; sternocostal head: sternum and upper 6 costal cartilages, external oblique aponeurosis', 'Lateral lip of the intertubercular sulcus', 'lateral-pectoral', 'C5-T1', 'Adducts and medially rotates the humerus; clavicular head flexes, sternocostal head extends the flexed arm', 'Pectoral branch of the thoracoacromial artery, internal thoracic perforators, lateral thoracic artery', 'Congenital absence (Poland syndrome) and rupture during bench press are classic; the breast lies on it.', { also: 'medial-pectoral', note: 'Clavicular head C5–C6 (lateral pectoral); sternocostal head C7–T1 (medial and lateral pectoral).' }),
    M('pectoralis-minor', 'Pectoralis minor', UL, 'Pectoral & scapular', 'Ribs 3–5 near the costal cartilages', 'Coracoid process of the scapula', 'medial-pectoral', 'C8-T1', 'Protracts and depresses the scapula, stabilising it against the thoracic wall', 'Pectoral branch of the thoracoacromial artery, lateral thoracic artery', 'Landmark dividing the axillary artery into three parts; pectoralis minor syndrome compresses the brachial plexus beneath it.'),
    M('subclavius', 'Subclavius', UL, 'Pectoral & scapular', 'Junction of rib 1 and its costal cartilage', 'Inferior surface of the middle third of the clavicle', 'n-subclavius', 'C5-C6', 'Anchors and depresses the clavicle, stabilising the sternoclavicular joint', 'Clavicular branch of the thoracoacromial artery, suprascapular artery', 'Cushions the subclavian vessels and plexus beneath a fractured clavicle.'),
    M('deltoid', 'Deltoid', UL, 'Scapulohumeral', 'Lateral third of clavicle, acromion, spine of scapula', 'Deltoid tuberosity of the humerus', 'axillary', 'C5-C6', 'Abducts the arm from 15° to 90° (middle fibres); anterior fibres flex and medially rotate, posterior fibres extend and laterally rotate', 'Posterior circumflex humeral artery, deltoid branches of the thoracoacromial and profunda brachii arteries', 'Axillary nerve damage (surgical-neck fracture, shoulder dislocation) flattens the shoulder and numbs the regimental-badge patch.'),
    M('supraspinatus', 'Supraspinatus', UL, 'Rotator cuff', 'Supraspinous fossa of the scapula', 'Superior facet of the greater tubercle of the humerus', 'suprascapular', 'C5-C6', 'Initiates abduction (first 0–15°) and steadies the humeral head in the glenoid', 'Suprascapular artery', 'Most frequently torn rotator cuff tendon; painful arc at 60–120° and positive empty-can test.', { note: 'Some texts give C4–C6.' }),
    M('infraspinatus', 'Infraspinatus', UL, 'Rotator cuff', 'Infraspinous fossa of the scapula', 'Middle facet of the greater tubercle', 'suprascapular', 'C5-C6', 'Laterally rotates the arm and stabilises the glenohumeral joint', 'Suprascapular artery, circumflex scapular artery', 'Weakness of external rotation with elbow at the side; selective atrophy follows entrapment at the spinoglenoid notch (volleyball players).'),
    M('teres-minor', 'Teres minor', UL, 'Rotator cuff', 'Upper two-thirds of the lateral border of the scapula', 'Inferior facet of the greater tubercle', 'axillary', 'C5-C6', 'Laterally rotates the arm and stabilises the humeral head', 'Circumflex scapular artery, posterior circumflex humeral artery', 'Passes through the quadrangular space with the axillary nerve; atrophy suggests an axillary nerve lesion.'),
    M('subscapularis', 'Subscapularis', UL, 'Rotator cuff', 'Subscapular fossa', 'Lesser tubercle of the humerus', 'upper-subscapular', 'C5-C6', 'Medially rotates the arm and stabilises the humeral head anteriorly', 'Subscapular artery, suprascapular and dorsal scapular arteries', 'Tested by the lift-off and belly-press tests; tendon rupture follows anterior dislocation.', { also: 'lower-subscapular', note: 'Upper and lower subscapular nerves (C5–C6, C7 in some texts).' }),
    M('teres-major', 'Teres major', UL, 'Scapulohumeral', 'Dorsal surface of the inferior angle of the scapula', 'Medial lip of the intertubercular sulcus', 'lower-subscapular', 'C5-C6', 'Adducts and medially rotates the arm', 'Circumflex scapular artery, thoracodorsal artery', 'Forms the inferior border of the quadrangular space; "lat’s little helper".'),
    /* ---- Arm ---- */
    M('biceps-brachii', 'Biceps brachii', UL, 'Arm: anterior', 'Short head: tip of the coracoid process; long head: supraglenoid tubercle', 'Radial tuberosity and bicipital aponeurosis', 'musculocutaneous', 'C5-C6', 'Supinates the forearm and flexes the elbow (strongest supinator when the elbow is flexed); weakly flexes the shoulder', 'Muscular branches of the brachial artery', 'Biceps reflex tests C5–C6; long-head rupture produces a "Popeye" bulge.'),
    M('brachialis', 'Brachialis', UL, 'Arm: anterior', 'Distal half of the anterior humerus', 'Ulnar tuberosity and coronoid process', 'musculocutaneous', 'C5-C6', 'Flexes the elbow in all positions of the forearm (the "workhorse")', 'Brachial artery muscular branches, radial recurrent artery', 'A small lateral part is supplied by the radial nerve, so it is not completely lost in a musculocutaneous lesion.', { also: 'radial', note: 'Musculocutaneous nerve (C5–C6) to the main part; a small lateral part receives a radial nerve branch.' }),
    M('coracobrachialis', 'Coracobrachialis', UL, 'Arm: anterior', 'Tip of the coracoid process', 'Medial surface of the humeral shaft (mid-level)', 'musculocutaneous', 'C5-C7', 'Flexes and adducts the arm; stabilises the humeral head', 'Muscular branches of the brachial artery', 'The musculocutaneous nerve pierces it; its tendon points to the axillary artery and is a landmark for the brachial plexus cords.'),
    M('triceps-brachii', 'Triceps brachii', UL, 'Arm: posterior', 'Long head: infraglenoid tubercle; lateral head: posterior humerus above the radial groove; medial head: posterior humerus below the groove', 'Olecranon of the ulna (common tendon)', 'radial', 'C6-C8', 'Extends the elbow (all heads); long head also extends and adducts the shoulder', 'Profunda brachii artery, superior ulnar collateral artery', 'Triceps reflex tests C7; spared in radial-groove lesions because branches arise in the axilla/upper arm.'),
    M('anconeus', 'Anconeus', UL, 'Arm: posterior', 'Lateral epicondyle of the humerus', 'Lateral olecranon and upper posterior ulna', 'radial', 'C7-C8', 'Assists triceps in elbow extension and stabilises the elbow; abducts the ulna during pronation', 'Middle collateral artery, posterior interosseous recurrent artery', 'Branch comes from the nerve to the medial head of triceps.'),
    /* ---- Anterior forearm ---- */
    M('pronator-teres', 'Pronator teres', UL, 'Forearm: anterior', 'Humeral head: medial epicondyle; ulnar head: coronoid process', 'Middle of the lateral surface of the radius', 'median', 'C6-C7', 'Pronates the forearm and flexes the elbow', 'Ulnar and radial arteries (anterior ulnar recurrent branches)', 'Median nerve can be compressed between its two heads (pronator syndrome).'),
    M('flexor-carpi-radialis', 'Flexor carpi radialis', UL, 'Forearm: anterior', 'Medial epicondyle (common flexor origin)', 'Bases of metacarpals 2 and 3', 'median', 'C6-C7', 'Flexes and abducts (radially deviates) the wrist', 'Radial artery', 'Tendon is the landmark for the radial artery pulse and for median nerve (just ulnar to it) at the wrist.'),
    M('palmaris-longus', 'Palmaris longus', UL, 'Forearm: anterior', 'Medial epicondyle', 'Flexor retinaculum and palmar aponeurosis', 'median', 'C7-C8', 'Weakly flexes the wrist and tenses the palmar aponeurosis', 'Ulnar artery', 'Absent in about 15% of people; commonly harvested as a tendon graft. Lies superficial to the median nerve at the wrist.'),
    M('flexor-carpi-ulnaris', 'Flexor carpi ulnaris', UL, 'Forearm: anterior', 'Humeral head: medial epicondyle; ulnar head: olecranon and posterior border of ulna', 'Pisiform, hook of the hamate, base of metacarpal 5', 'ulnar', 'C7-C8', 'Flexes and adducts (ulnarly deviates) the wrist', 'Ulnar artery (posterior ulnar recurrent branch)', 'Ulnar nerve passes between its heads; tendon is the guide to the ulnar nerve at the wrist.', { note: 'C7 reflects the variant (C7–T1) ulnar root value given in some texts.' }),
    M('flexor-digitorum-superficialis', 'Flexor digitorum superficialis', UL, 'Forearm: anterior', 'Humeroulnar head: medial epicondyle and coronoid; radial head: anterior radius', 'Sides of the middle phalanges of digits 2–5', 'median', 'C7-T1', 'Flexes the proximal interphalangeal joints (and MCP and wrist)', 'Ulnar artery, radial artery', 'Tested by holding the other fingers extended while flexing one finger (isolates FDS from FDP).'),
    M('flexor-digitorum-profundus', 'Flexor digitorum profundus', UL, 'Forearm: anterior', 'Proximal three-quarters of the medial and anterior ulna and interosseous membrane', 'Bases of the distal phalanges of digits 2–5', 'ulnar', 'C8-T1', 'Flexes the distal interphalangeal joints (and PIP, MCP and wrist)', 'Anterior interosseous artery, ulnar artery muscular branches', 'Dual supply: medial half (digits 4–5) by ulnar nerve, lateral half (digits 2–3) by the anterior interosseous nerve.', { also: 'anterior-interosseous' }),
    M('flexor-pollicis-longus', 'Flexor pollicis longus', UL, 'Forearm: anterior', 'Anterior surface of the radius and interosseous membrane', 'Base of the distal phalanx of the thumb', 'anterior-interosseous', 'C8-T1', 'Flexes the interphalangeal joint of the thumb', 'Anterior interosseous artery, radial artery', 'Anterior interosseous nerve palsy: cannot form an "OK" circle (pinch the tips of thumb and index).'),
    M('pronator-quadratus', 'Pronator quadratus', UL, 'Forearm: anterior', 'Distal fourth of the anterior ulna', 'Distal fourth of the anterior radius', 'anterior-interosseous', 'C8-T1', 'Pronates the forearm (starts pronation; the deep pronator)', 'Anterior interosseous artery', 'Lies deep to the flexor tendons; acts with pronator teres. Loss weakens pronation with the elbow flexed.'),
    /* ---- Posterior forearm ---- */
    M('brachioradialis', 'Brachioradialis', UL, 'Forearm: posterior', 'Proximal two-thirds of the lateral supracondylar ridge of the humerus', 'Lateral surface of the distal radius, above the styloid process', 'radial', 'C5-C6', 'Flexes the forearm at the elbow, most strongly in the mid-prone (thumbs-up) position', 'Radial recurrent artery', 'Supplied by the radial nerve above the elbow, so spared in posterior interosseous lesions. Supinator (brachioradialis) reflex: C5–C6.', { note: 'C5–C7 in some texts.' }),
    M('extensor-carpi-radialis-longus', 'Extensor carpi radialis longus', UL, 'Forearm: posterior', 'Lateral supracondylar ridge of the humerus', 'Base of metacarpal 2 (dorsal)', 'radial', 'C6-C7', 'Extends and abducts the wrist', 'Radial artery, radial recurrent artery', 'Spared in posterior interosseous nerve palsy, so the wrist extends but deviates radially.'),
    M('extensor-carpi-radialis-brevis', 'Extensor carpi radialis brevis', UL, 'Forearm: posterior', 'Lateral epicondyle (common extensor origin)', 'Base of metacarpal 3 (dorsal)', 'posterior-interosseous', 'C7-C8', 'Extends and abducts the wrist; steadies the wrist during gripping', 'Radial artery, radial recurrent artery', 'Tendinopathy here is the usual cause of "tennis elbow" (lateral epicondylalgia).', { note: 'Often arises from the radial nerve itself before the supinator.' }),
    M('extensor-digitorum', 'Extensor digitorum', UL, 'Forearm: posterior', 'Lateral epicondyle (common extensor origin)', 'Extensor expansions (middle and distal phalanges) of digits 2–5', 'posterior-interosseous', 'C7-C8', 'Extends the MCP joints of digits 2–5 (and wrist, and IP joints through the expansions)', 'Posterior interosseous artery', 'Paralysis gives "finger drop" with preserved wrist extension (ECRL intact).'),
    M('extensor-digiti-minimi', 'Extensor digiti minimi', UL, 'Forearm: posterior', 'Common extensor tendon', 'Extensor expansion of digit 5', 'posterior-interosseous', 'C7-C8', 'Extends the little finger (allows independent extension, as in pointing "horns")', 'Posterior interosseous artery', 'Independent extension of the little finger is tested with the fist closed and the fifth finger extended.'),
    M('extensor-carpi-ulnaris', 'Extensor carpi ulnaris', UL, 'Forearm: posterior', 'Common extensor tendon and posterior border of ulna', 'Base of metacarpal 5', 'posterior-interosseous', 'C7-C8', 'Extends and adducts (ulnarly deviates) the wrist', 'Posterior interosseous artery, ulnar artery', 'ECU tendinitis/subluxation causes ulnar-sided wrist pain.'),
    M('supinator', 'Supinator', UL, 'Forearm: posterior', 'Lateral epicondyle, radial collateral and annular ligaments, supinator crest of ulna', 'Lateral surface of the proximal radius', 'radial', 'C5-C6', 'Supinates the forearm (the deep supinator; biceps adds power with elbow flexed)', 'Radial recurrent artery, posterior interosseous artery', 'The deep branch of the radial nerve passes through it (arcade of Frohse); entrapment causes the posterior interosseous syndrome.', { note: 'Supplied by the deep branch of the radial nerve (before it becomes the posterior interosseous nerve).' }),
    M('abductor-pollicis-longus', 'Abductor pollicis longus', UL, 'Forearm: posterior', 'Posterior surfaces of ulna, interosseous membrane, radius', 'Base of metacarpal 1 (lateral)', 'posterior-interosseous', 'C7-C8', 'Abducts the thumb and extends it at the carpometacarpal joint', 'Posterior interosseous artery', 'With extensor pollicis brevis forms the first dorsal compartment: de Quervain tenosynovitis (positive Finkelstein test).'),
    M('extensor-pollicis-brevis', 'Extensor pollicis brevis', UL, 'Forearm: posterior', 'Posterior radius and interosseous membrane', 'Base of the proximal phalanx of the thumb', 'posterior-interosseous', 'C7-C8', 'Extends the thumb MCP joint and CMC joint', 'Posterior interosseous artery', 'Forms the radial (lateral) border of the anatomical snuffbox.'),
    M('extensor-pollicis-longus', 'Extensor pollicis longus', UL, 'Forearm: posterior', 'Posterior ulna and interosseous membrane', 'Base of the distal phalanx of the thumb', 'posterior-interosseous', 'C7-C8', 'Extends the interphalangeal joint of the thumb (and the MCP and CMC joints)', 'Posterior interosseous artery', 'Winds around Lister’s tubercle and forms the ulnar border of the snuffbox; may rupture after distal radial fracture.'),
    M('extensor-indicis', 'Extensor indicis', UL, 'Forearm: posterior', 'Posterior ulna and interosseous membrane', 'Extensor expansion of digit 2', 'posterior-interosseous', 'C7-C8', 'Extends the index finger independently ("pointing")', 'Posterior interosseous artery', 'Common donor tendon for transfer to restore thumb extension.'),
    /* ---- Hand ---- */
    M('abductor-pollicis-brevis', 'Abductor pollicis brevis', UL, 'Hand: thenar', 'Flexor retinaculum, tubercles of scaphoid and trapezium', 'Lateral side of the base of the proximal phalanx of the thumb', 'median-recurrent', 'C8-T1', 'Abducts the thumb at right angles to the palm (palmar abduction), starting opposition', 'Superficial palmar branch of the radial artery, princeps pollicis artery', 'First muscle to waste in carpal tunnel syndrome; tested by pointing the thumb to the ceiling with the palm up.'),
    M('opponens-pollicis', 'Opponens pollicis', UL, 'Hand: thenar', 'Flexor retinaculum and tubercle of the trapezium', 'Lateral border of metacarpal 1', 'median-recurrent', 'C8-T1', 'Opposes the thumb (brings the pulp to the pulp of the other digits)', 'Superficial palmar branch of the radial artery, princeps pollicis artery', 'Loss of opposition makes the "ape hand" of a median nerve lesion.'),
    M('flexor-pollicis-brevis', 'Flexor pollicis brevis', UL, 'Hand: thenar', 'Flexor retinaculum and trapezium (superficial head); trapezoid and capitate (deep head)', 'Base of the proximal phalanx of the thumb (lateral side)', 'median-recurrent', 'C8-T1', 'Flexes the thumb at the metacarpophalangeal joint', 'Superficial palmar branch of the radial artery, princeps pollicis artery', 'Superficial head: recurrent branch of the median nerve; deep head: deep branch of the ulnar nerve (so often spared in isolated median lesions).', { also: 'ulnar-deep' }),
    M('adductor-pollicis', 'Adductor pollicis', UL, 'Hand: central', 'Oblique head: capitate, bases of metacarpals 2–3; transverse head: shaft of metacarpal 3', 'Medial side of the base of the proximal phalanx of the thumb (via sesamoid)', 'ulnar-deep', 'C8-T1', 'Adducts the thumb towards the palm', 'Deep palmar arch, princeps pollicis artery', 'Weakness gives Froment’s sign (flexion of the thumb IP joint via FPL when gripping paper).'),
    M('lumbricals-1-2', 'Lumbricals 1 and 2', UL, 'Hand: central', 'Radial sides of the FDP tendons to digits 2 and 3', 'Lateral side of the extensor expansion of digits 2 and 3', 'median', 'C8-T1', 'Flex the MCP joints and extend the interphalangeal joints', 'Superficial palmar arch, common palmar digital arteries', 'Lost in median nerve lesions, which weakens MCP flexion and IP extension of the index and middle fingers (the ulnar lumbricals keep the ring and little fingers working).'),
    M('lumbricals-3-4', 'Lumbricals 3 and 4', UL, 'Hand: central', 'Adjacent sides of the FDP tendons to digits 3–4 and 4–5', 'Lateral side of the extensor expansion of digits 4 and 5', 'ulnar-deep', 'C8-T1', 'Flex the MCP joints and extend the interphalangeal joints', 'Superficial palmar arch, common palmar digital arteries', 'Paralysis leaves the ring and little fingers hyperextended at the MCP and flexed at the IP joints: the ulnar claw.'),
    M('palmar-interossei', 'Palmar interossei (3)', UL, 'Hand: central', 'Palmar surfaces of metacarpals 2, 4 and 5', 'Extensor expansions of digits 2, 4 and 5', 'ulnar-deep', 'C8-T1', 'Adduct digits 2, 4 and 5 towards the middle finger ("PAD"); help the lumbricals flex MCPs', 'Deep palmar arch, palmar metacarpal arteries', 'Tested by gripping a sheet of paper between the fingers.'),
    M('dorsal-interossei', 'Dorsal interossei (4)', UL, 'Hand: central', 'Adjacent sides of two metacarpals', 'Extensor expansions and bases of the proximal phalanges of digits 2–4', 'ulnar-deep', 'C8-T1', 'Abduct digits 2–4 away from the middle finger ("DAB"); help the lumbricals', 'Dorsal metacarpal arteries, deep palmar arch', 'First dorsal interosseous wasting is the earliest visible sign of ulnar neuropathy; T1 myotome (finger abduction).'),
    M('abductor-digiti-minimi-hand', 'Abductor digiti minimi (hand)', UL, 'Hand: hypothenar', 'Pisiform and tendon of flexor carpi ulnaris', 'Medial side of the base of the proximal phalanx of the little finger', 'ulnar-deep', 'C8-T1', 'Abducts the little finger', 'Ulnar artery (deep palmar branch)', 'Hypothenar wasting indicates ulnar nerve (C8–T1) pathology.'),
    M('flexor-digiti-minimi-brevis', 'Flexor digiti minimi brevis', UL, 'Hand: hypothenar', 'Hook of the hamate and flexor retinaculum', 'Base of the proximal phalanx of the little finger', 'ulnar-deep', 'C8-T1', 'Flexes the little finger at the MCP joint', 'Ulnar artery (deep palmar branch)', 'The hook of the hamate lies against the deep ulnar nerve; hook fractures can injure it.'),
    M('opponens-digiti-minimi', 'Opponens digiti minimi', UL, 'Hand: hypothenar', 'Hook of the hamate and flexor retinaculum', 'Medial border of metacarpal 5', 'ulnar-deep', 'C8-T1', 'Draws the fifth metacarpal forward and rotates it (cups the palm)', 'Ulnar artery (deep palmar branch)', 'Contributes to the hollow of the palm.'),
    M('palmaris-brevis', 'Palmaris brevis', UL, 'Hand: hypothenar', 'Flexor retinaculum and palmar aponeurosis', 'Skin of the medial border of the hand', 'ulnar', 'C8-T1', 'Wrinkles the skin of the hypothenar eminence and deepens the hollow of the palm', 'Ulnar artery', 'Supplied by the superficial branch of the ulnar nerve, which usually spares it in deep-branch (motor-only) lesions.'),

    /* ---- Lower limb: gluteal region ---- */
    M('gluteus-maximus', 'Gluteus maximus', LL, 'Gluteal region', 'Gluteal surface of the ilium behind the posterior gluteal line, dorsal sacrum and coccyx, sacrotuberous ligament', 'Iliotibial tract and gluteal tuberosity of the femur', 'inferior-gluteal', 'L5-S2', 'Extends the thigh (rising from sitting, climbing) and laterally rotates it; upper fibres assist abduction', 'Inferior and superior gluteal arteries', 'Paralysis gives a gluteus maximus gait: backward lurch of the trunk at heel strike and difficulty climbing stairs.'),
    M('gluteus-medius', 'Gluteus medius', LL, 'Gluteal region', 'Gluteal surface of the ilium between the anterior and posterior gluteal lines', 'Lateral surface of the greater trochanter', 'superior-gluteal', 'L4-S1', 'Abducts the thigh and, in single-leg stance, holds the pelvis level (prevents the contralateral hip dropping)', 'Superior gluteal artery', 'Weakness gives a positive Trendelenburg sign: the pelvis drops on the unsupported side when standing on the affected leg.'),
    M('gluteus-minimus', 'Gluteus minimus', LL, 'Gluteal region', 'Gluteal surface of the ilium between the anterior and inferior gluteal lines', 'Anterior surface of the greater trochanter', 'superior-gluteal', 'L4-S1', 'Abducts and medially rotates the thigh; stabilises the pelvis in stance with gluteus medius', 'Superior gluteal artery', 'Both abductors are supplied by the superior gluteal nerve; hip surgery through a lateral approach can injure it.'),
    M('tensor-fasciae-latae', 'Tensor fasciae latae', LL, 'Gluteal region', 'Anterior superior iliac spine and anterior iliac crest', 'Iliotibial tract (to the lateral tibial condyle, Gerdy’s tubercle)', 'superior-gluteal', 'L4-L5', 'Abducts, flexes and medially rotates the thigh; tenses the iliotibial tract to steady the knee', 'Superior gluteal artery, lateral circumflex femoral artery', 'Tight iliotibial tract causes iliotibial band syndrome in runners.'),
    M('piriformis', 'Piriformis', LL, 'Gluteal region', 'Anterior surface of the sacrum (S2–S4) and sacrotuberous ligament', 'Superior border of the greater trochanter', 'n-piriformis', 'S1-S2', 'Laterally rotates the extended thigh and abducts the flexed thigh; stabilises the femoral head', 'Superior and inferior gluteal arteries', 'Key landmark of the gluteal region: superior gluteal structures emerge above it, everything else below. Piriformis syndrome: sciatic nerve irritation.'),
    M('obturator-internus', 'Obturator internus (with superior gemellus)', LL, 'Gluteal region', 'Internal surface of the obturator membrane and surrounding bone; superior gemellus: ischial spine', 'Medial surface of the greater trochanter', 'n-obturator-internus', 'L5-S2', 'Laterally rotates the extended thigh and abducts the flexed thigh; stabilises the hip', 'Obturator artery, internal pudendal and inferior gluteal arteries', 'Its fascia forms the lateral wall of the ischioanal fossa and the pudendal canal.', { note: 'Moore gives L5–S1.' }),
    M('quadratus-femoris', 'Quadratus femoris (with inferior gemellus)', LL, 'Gluteal region', 'Lateral border of the ischial tuberosity', 'Quadrate tubercle on the intertrochanteric crest', 'n-quadratus-femoris', 'L4-S1', 'Laterally rotates the thigh and stabilises the femoral head in the acetabulum', 'Medial circumflex femoral artery, inferior gluteal artery', 'The sciatic nerve lies on it; the medial circumflex femoral artery runs on its upper border (avascular necrosis risk in femoral neck fractures).'),
    /* ---- Anterior thigh and hip flexors ---- */
    M('psoas-major', 'Psoas major', LL, 'Hip flexors', 'Sides of the T12–L5 vertebral bodies and intervening discs, and the transverse processes of L1–L5', 'Lesser trochanter of the femur (with iliacus as iliopsoas)', 'lumbar-plexus-rami', 'L1-L3', 'Principal flexor of the thigh at the hip; flexes the trunk when the thigh is fixed (sit-ups)', 'Lumbar arteries, iliolumbar artery', 'Psoas abscess (tuberculosis) tracks in its sheath into the thigh; irritation causes pain on hip extension (psoas sign in appendicitis).'),
    M('iliacus', 'Iliacus', LL, 'Hip flexors', 'Iliac fossa, ala of the sacrum', 'Tendon of psoas major and the lesser trochanter', 'femoral', 'L2-L3', 'Flexes the thigh at the hip (with psoas major)', 'Iliolumbar artery, deep circumflex iliac artery, medial circumflex femoral artery', 'Retroperitoneal haematoma in an anticoagulated patient compresses the femoral nerve here.'),
    M('sartorius', 'Sartorius', LL, 'Anterior thigh', 'Anterior superior iliac spine', 'Superior part of the medial surface of the tibia (pes anserinus)', 'femoral', 'L2-L3', 'Flexes, abducts and laterally rotates the thigh and flexes the knee (tailor’s sitting position)', 'Muscular branches of the femoral artery, superficial circumflex iliac artery', 'Longest muscle in the body; its medial border forms the lateral boundary of the femoral triangle (with the inguinal ligament and adductor longus) and it roofs the adductor canal.'),
    M('rectus-femoris', 'Rectus femoris', LL, 'Anterior thigh', 'Anterior inferior iliac spine and the ilium above the acetabulum', 'Base of the patella, then tibial tuberosity via the patellar ligament', 'femoral', 'L2-L4', 'Extends the knee and flexes the hip', 'Lateral circumflex femoral artery (descending branch), femoral artery', 'Avulsion of its straight head from the AIIS occurs in adolescent kickers; quadriceps contusions ("charley horse").'),
    M('vastus-lateralis', 'Vastus lateralis', LL, 'Anterior thigh', 'Greater trochanter, intertrochanteric line, lateral lip of the linea aspera', 'Base and lateral border of the patella, then tibial tuberosity', 'femoral', 'L2-L4', 'Extends the knee', 'Descending branch of lateral circumflex femoral artery, profunda femoris perforators', 'Preferred intramuscular injection site in infants and for self-administered injections.'),
    M('vastus-medialis', 'Vastus medialis', LL, 'Anterior thigh', 'Intertrochanteric line, medial lip of the linea aspera', 'Base and medial border of the patella', 'femoral', 'L2-L4', 'Extends the knee; oblique fibres (VMO) prevent lateral patellar displacement', 'Femoral artery muscular branches, descending genicular artery, profunda femoris', 'Early quadriceps wasting after knee injury occurs here; weakness predisposes to patellar maltracking.'),
    M('vastus-intermedius', 'Vastus intermedius', LL, 'Anterior thigh', 'Anterior and lateral surfaces of the upper femoral shaft', 'Base of the patella (deep to rectus femoris)', 'femoral', 'L2-L4', 'Extends the knee (articularis genu tenses the suprapatellar bursa)', 'Lateral circumflex femoral artery (descending branch)', 'Together the four heads form the quadriceps; the knee-jerk reflex (L3–L4) tests the femoral nerve.'),
    M('pectineus', 'Pectineus', LL, 'Anterior thigh', 'Pectineal line of the pubis', 'Pectineal line of the femur, below the lesser trochanter', 'femoral', 'L2-L3', 'Flexes and adducts the thigh', 'Medial circumflex femoral artery, obturator artery', 'Forms part of the floor of the femoral triangle; its deep part is often supplied by the obturator nerve.', { also: 'obturator', note: 'Femoral nerve (L2–L3) to the anterior part; obturator nerve (anterior branch) to the deep part.' }),
    /* ---- Medial thigh ---- */
    M('adductor-longus', 'Adductor longus', LL, 'Medial thigh', 'Body of the pubis below the pubic crest', 'Middle third of the linea aspera', 'obturator', 'L2-L4', 'Adducts the thigh', 'Profunda femoris perforators, obturator artery', 'Commonest site of groin ("adductor") strains in footballers; medial border of the femoral triangle.'),
    M('adductor-brevis', 'Adductor brevis', LL, 'Medial thigh', 'Body and inferior ramus of the pubis', 'Pectineal line and upper linea aspera', 'obturator', 'L2-L4', 'Adducts the thigh', 'Profunda femoris, medial circumflex femoral and obturator arteries', 'Lies between the anterior and posterior branches of the obturator nerve.'),
    M('adductor-magnus', 'Adductor magnus', LL, 'Medial thigh', 'Inferior pubic ramus, ischial ramus (adductor part); ischial tuberosity (hamstring part)', 'Gluteal tuberosity, linea aspera and adductor tubercle', 'obturator', 'L2-L4', 'Adducts the thigh; the hamstring part extends it', 'Profunda femoris perforators, obturator artery, popliteal artery', 'The adductor hiatus between its two parts transmits the femoral vessels into the popliteal fossa.', { also: 'tibial', note: 'Adductor part: obturator nerve; hamstring part: tibial division of the sciatic nerve (L4).' }),
    M('gracilis', 'Gracilis', LL, 'Medial thigh', 'Body and inferior ramus of the pubis', 'Superior part of the medial surface of the tibia (pes anserinus)', 'obturator', 'L2-L3', 'Adducts the thigh, flexes the knee and medially rotates the leg', 'Medial circumflex femoral artery, profunda femoris', 'The only adductor crossing two joints; used as a free muscle flap and tendon graft.'),
    M('obturator-externus', 'Obturator externus', LL, 'Medial thigh', 'External surface of the obturator membrane and adjacent bone', 'Trochanteric fossa of the femur', 'obturator', 'L3-L4', 'Laterally rotates the thigh and stabilises the femoral head', 'Obturator artery, medial circumflex femoral artery', 'Its tendon lies between the hip capsule and quadratus femoris.'),
    /* ---- Posterior thigh ---- */
    M('biceps-femoris-long', 'Biceps femoris, long head', LL, 'Posterior thigh (hamstrings)', 'Ischial tuberosity', 'Head of the fibula', 'tibial', 'L5-S2', 'Extends the thigh and flexes and laterally rotates the knee', 'Perforating branches of the profunda femoris, inferior gluteal artery', 'Hamstring strains most often involve the long head at the myotendinous junction.'),
    M('biceps-femoris-short', 'Biceps femoris, short head', LL, 'Posterior thigh (hamstrings)', 'Lateral lip of the linea aspera and lateral supracondylar line', 'Head of the fibula', 'common-fibular', 'L5-S2', 'Flexes and laterally rotates the knee', 'Perforating branches of the profunda femoris', 'The only hamstring supplied by the common fibular nerve: a useful key to separating tibial from fibular components of a sciatic lesion.'),
    M('semitendinosus', 'Semitendinosus', LL, 'Posterior thigh (hamstrings)', 'Ischial tuberosity', 'Superior part of the medial surface of the tibia (pes anserinus)', 'tibial', 'L5-S2', 'Extends the thigh, flexes the knee and medially rotates the flexed leg', 'Perforating branches of the profunda femoris, inferior gluteal artery', 'Tendon commonly harvested (with gracilis) for ACL reconstruction.'),
    M('semimembranosus', 'Semimembranosus', LL, 'Posterior thigh (hamstrings)', 'Ischial tuberosity', 'Posterior part of the medial tibial condyle; oblique popliteal ligament', 'tibial', 'L5-S2', 'Extends the thigh, flexes the knee and medially rotates the flexed leg', 'Perforating branches of the profunda femoris, inferior gluteal artery', 'Its bursa communicates with the knee: a Baker (popliteal) cyst bulges between it and the medial head of gastrocnemius.'),
    /* ---- Leg ---- */
    M('tibialis-anterior', 'Tibialis anterior', LL, 'Leg: anterior', 'Lateral condyle and upper half of the lateral surface of the tibia, interosseous membrane', 'Medial cuneiform and base of metatarsal 1', 'deep-fibular', 'L4-L5', 'Dorsiflexes and inverts the foot', 'Anterior tibial artery', 'Paralysis causes foot drop: toes catch on the ground and the patient adopts a high-stepping (steppage) gait.'),
    M('extensor-hallucis-longus', 'Extensor hallucis longus', LL, 'Leg: anterior', 'Middle half of the anterior fibular surface and interosseous membrane', 'Dorsal base of the distal phalanx of the great toe', 'deep-fibular', 'L5-S1', 'Extends the great toe and assists dorsiflexion', 'Anterior tibial artery', 'Great toe extension is the standard test of the L5 myotome.'),
    M('extensor-digitorum-longus', 'Extensor digitorum longus', LL, 'Leg: anterior', 'Lateral tibial condyle, upper anterior fibula, interosseous membrane', 'Middle and distal phalanges of toes 2–5', 'deep-fibular', 'L5-S1', 'Extends toes 2–5 and dorsiflexes the foot', 'Anterior tibial artery', 'Anterior compartment syndrome threatens this and the other deep fibular-supplied muscles.'),
    M('fibularis-tertius', 'Fibularis tertius', LL, 'Leg: anterior', 'Distal third of the anterior fibula', 'Dorsal base of metatarsal 5', 'deep-fibular', 'L5-S1', 'Dorsiflexes and everts the foot', 'Anterior tibial artery', 'Absent in about 10% of people.'),
    M('fibularis-longus', 'Fibularis longus', LL, 'Leg: lateral', 'Head and upper two-thirds of the lateral surface of the fibula', 'Base of metatarsal 1 and medial cuneiform', 'superficial-fibular', 'L5-S2', 'Everts the foot and weakly plantarflexes; supports the transverse and lateral longitudinal arches', 'Fibular artery (anterior tibial branches)', 'Weak eversion and loss of sensation on the dorsum of the foot follow common fibular nerve injury at the fibular neck.'),
    M('fibularis-brevis', 'Fibularis brevis', LL, 'Leg: lateral', 'Distal two-thirds of the lateral surface of the fibula', 'Tuberosity at the base of metatarsal 5', 'superficial-fibular', 'L5-S2', 'Everts the foot and weakly plantarflexes', 'Fibular artery', 'Avulsion fracture of the base of the fifth metatarsal follows inversion injuries.'),
    M('gastrocnemius', 'Gastrocnemius', LL, 'Leg: posterior (superficial)', 'Medial and lateral condyles of the femur', 'Calcaneus via the tendo calcaneus (Achilles tendon)', 'tibial', 'S1-S2', 'Plantarflexes the foot and flexes the knee', 'Sural arteries (from the popliteal artery), posterior tibial artery', 'Achilles reflex tests S1; Achilles rupture is shown by the Thompson (calf squeeze) test.'),
    M('soleus', 'Soleus', LL, 'Leg: posterior (superficial)', 'Posterior head and upper fibula, soleal line and medial border of tibia', 'Calcaneus via the tendo calcaneus', 'tibial', 'S1-S2', 'Plantarflexes the foot; essential for standing posture and the venous calf pump', 'Posterior tibial and fibular arteries, sural arteries', 'Soleal veins are the usual origin of deep vein thrombosis; "peripheral heart".'),
    M('plantaris', 'Plantaris', LL, 'Leg: posterior (superficial)', 'Inferior end of the lateral supracondylar line of the femur', 'Calcaneus (medial to the tendo calcaneus)', 'tibial', 'S1-S2', 'Weakly assists plantarflexion and knee flexion', 'Sural arteries (popliteal)', 'Rupture can mimic a deep vein thrombosis ("tennis leg"); tendon used for grafting.'),
    M('popliteus', 'Popliteus', LL, 'Leg: posterior (deep)', 'Lateral femoral condyle and lateral meniscus', 'Posterior tibia above the soleal line', 'tibial', 'L4-S1', 'Unlocks the extended knee by laterally rotating the femur on the tibia (or medially rotating the tibia); flexes the knee', 'Inferior medial and lateral genicular arteries, posterior tibial artery', 'Forms part of the floor of the popliteal fossa.'),
    M('tibialis-posterior', 'Tibialis posterior', LL, 'Leg: posterior (deep)', 'Interosseous membrane, adjacent posterior tibia and fibula', 'Tuberosity of the navicular, cuneiforms and bases of metatarsals 2–4', 'tibial', 'L4-L5', 'Plantarflexes and inverts the foot; supports the medial longitudinal arch', 'Posterior tibial and fibular arteries', 'Dysfunction (PTTD) causes an acquired flat foot; tendon lies behind the medial malleolus.'),
    M('flexor-digitorum-longus', 'Flexor digitorum longus', LL, 'Leg: posterior (deep)', 'Posterior surface of the tibia (medial to tibialis posterior)', 'Bases of the distal phalanges of toes 2–5', 'tibial', 'S2-S3', 'Flexes toes 2–5 and plantarflexes the foot; supports the arches', 'Posterior tibial artery', '"Tom": order in the tarsal tunnel is Tibialis posterior, flexor Digitorum longus, posterior tibial Artery and Vein, tibial Nerve, flexor Hallucis longus.'),
    M('flexor-hallucis-longus', 'Flexor hallucis longus', LL, 'Leg: posterior (deep)', 'Posterior fibula and interosseous membrane', 'Base of the distal phalanx of the great toe', 'tibial', 'S2-S3', 'Flexes the great toe; propels the body forward in push-off', 'Fibular artery, posterior tibial artery', 'Runs under the sustentaculum tali; stenosing tenosynovitis in ballet dancers.'),
    /* ---- Foot ---- */
    M('extensor-digitorum-brevis', 'Extensor digitorum brevis', LL, 'Foot', 'Anterior calcaneus', 'Extensor tendons of toes 1–4', 'deep-fibular', 'L5-S1', 'Extends toes 1–4', 'Dorsalis pedis (lateral tarsal) artery', 'Swelling on the dorsolateral foot below the ankle (EDB belly) can be mistaken for an ankle sprain; used for nerve conduction of the deep fibular nerve.'),
    M('abductor-hallucis', 'Abductor hallucis', LL, 'Foot', 'Medial calcaneal tuberosity, flexor retinaculum', 'Medial side of the base of the proximal phalanx of the great toe', 'medial-plantar', 'S2-S3', 'Abducts and flexes the great toe; supports the medial longitudinal arch', 'Medial plantar artery', 'Compression of the nerve to the abductor digiti minimi/medial plantar nerve occurs in "jogger’s foot".', { note: 'Some texts give S1–S2.' }),
    M('flexor-digitorum-brevis', 'Flexor digitorum brevis', LL, 'Foot', 'Medial calcaneal tuberosity and plantar aponeurosis', 'Sides of the middle phalanges of toes 2–5', 'medial-plantar', 'S2-S3', 'Flexes the lateral four toes at the proximal interphalangeal joints', 'Medial plantar artery', 'Tendons are split by those of FDL; the muscle lies in the central plantar compartment.'),
    M('abductor-digiti-minimi-foot', 'Abductor digiti minimi (foot)', LL, 'Foot', 'Lateral and medial calcaneal tuberosity, plantar aponeurosis', 'Lateral side of the base of the proximal phalanx of the little toe', 'lateral-plantar', 'S2-S3', 'Abducts and flexes the little toe', 'Lateral plantar artery', 'Entrapment of its nerve (Baxter’s nerve) causes chronic heel pain.'),
    M('quadratus-plantae', 'Quadratus plantae (flexor accessorius)', LL, 'Foot', 'Medial and lateral surfaces of the calcaneus', 'Lateral border of the FDL tendon', 'lateral-plantar', 'S2-S3', 'Straightens the pull of FDL so that the toes flex directly backwards', 'Lateral plantar artery', 'Lateral plantar nerve supplies most of the deep sole muscles ("ulnar nerve of the foot").'),
    M('flexor-hallucis-brevis', 'Flexor hallucis brevis', LL, 'Foot', 'Cuboid and lateral cuneiform', 'Both sides of the base of the proximal phalanx of the great toe (with sesamoids)', 'medial-plantar', 'S2-S3', 'Flexes the great toe at the metatarsophalangeal joint', 'Medial plantar artery, first plantar metatarsal artery', 'Sesamoids in its tendons can fracture or become inflamed (sesamoiditis).'),

    /* ---- Back ---- */
    M('erector-spinae', 'Erector spinae (iliocostalis, longissimus, spinalis)', 'back', 'Intrinsic back', 'Posterior sacrum, iliac crest, lumbar and lower thoracic spinous processes (common tendon)', 'Ribs, transverse processes, and mastoid process (columns ascend to the skull)', 'dorsal-rami', 'C1-S3', 'Extends and laterally flexes the vertebral column and head; controls forward flexion eccentrically', 'Posterior branches of the intercostal and lumbar arteries, lateral sacral arteries, deep cervical and occipital arteries', 'Acute spasm after lifting is a common cause of low back pain.'),
    M('splenius-capitis', 'Splenius capitis', 'back', 'Intrinsic back', 'Nuchal ligament and spinous processes of C7–T3/T4', 'Mastoid process and lateral superior nuchal line', 'dorsal-rami', 'C2-C5', 'Extends the head; unilaterally rotates and laterally flexes it to the same side', 'Occipital artery, transverse cervical artery', 'Forms the floor of the posterior triangle with levator scapulae.'),
    M('quadratus-lumborum', 'Quadratus lumborum', 'back', 'Posterior abdominal wall', 'Iliolumbar ligament and posterior iliac crest', 'Medial half of the 12th rib and transverse processes of L1–L4', 'lumbar-plexus-rami', 'T12-L4', 'Laterally flexes the trunk, fixes the 12th rib during inspiration and extends the lumbar spine', 'Lumbar arteries, subcostal artery, iliolumbar artery', 'Weakness produces trunk instability; the kidneys lie anterior to it, so a perinephric abscess can irritate it.'),
    /* ---- Thorax ---- */
    M('diaphragm', 'Diaphragm', 'thorax', 'Respiratory', 'Xiphoid process, costal margin (ribs 7–12), crura from L1–L3 vertebral bodies', 'Central tendon', 'phrenic', 'C3-C5', 'Principal muscle of inspiration: contracts and descends to increase thoracic volume', 'Pericardiacophrenic, musculophrenic, superior and inferior phrenic arteries', '"C3, 4, 5 keeps the diaphragm alive"; phrenic irritation refers pain to the shoulder tip (C4 dermatome).'),
    M('external-intercostals', 'External intercostals', 'thorax', 'Thoracic wall', 'Inferior border of the rib above', 'Superior border of the rib below', 'intercostal', 'T1-T11', 'Elevate the ribs in inspiration (bucket-handle and pump-handle movements)', 'Posterior and anterior intercostal arteries', 'Chest drain: insert above the rib (superior border of the lower rib) to avoid the neurovascular bundle in the costal groove.'),
    M('internal-intercostals', 'Internal intercostals', 'thorax', 'Thoracic wall', 'Costal groove of the rib above', 'Superior border of the rib below', 'intercostal', 'T1-T11', 'Depress the ribs in forced expiration (interosseous part); interchondral part helps elevate', 'Posterior and anterior intercostal arteries', 'Innermost intercostals and the neurovascular bundle lie in the plane between them and the internal intercostals.'),
    /* ---- Abdominal wall and pelvis ---- */
    M('rectus-abdominis', 'Rectus abdominis', 'abdomen', 'Anterior abdominal wall', 'Pubic symphysis and pubic crest', 'Xiphoid process and costal cartilages 5–7', 'abdominal-wall-nerves', 'T7-T12', 'Flexes the trunk, compresses the abdomen and stabilises the pelvis', 'Superior and inferior epigastric arteries', 'Divarication (diastasis recti) after pregnancy; rectus sheath haematoma from inferior epigastric injury.'),
    M('external-oblique', 'External oblique', 'abdomen', 'Anterior abdominal wall', 'External surfaces of ribs 5–12', 'Linea alba, pubic tubercle and anterior iliac crest', 'abdominal-wall-nerves', 'T7-T12', 'Compresses the abdomen, flexes the trunk, and rotates it to the opposite side', 'Lower intercostal, subcostal, deep circumflex iliac and superior epigastric arteries', 'Its aponeurosis forms the inguinal ligament; fibres run "hands in pockets".'),
    M('internal-oblique', 'Internal oblique', 'abdomen', 'Anterior abdominal wall', 'Thoracolumbar fascia, anterior two-thirds of the iliac crest, lateral half of the inguinal ligament', 'Ribs 10–12, linea alba and pubic crest (conjoint tendon)', 'abdominal-wall-nerves', 'T7-L1', 'Compresses the abdomen and rotates the trunk to the same side; flexes the trunk', 'Lower intercostal, subcostal and deep circumflex iliac arteries, superior and inferior epigastric arteries', 'Gives the cremaster muscle; its lower fibres form the roof of the inguinal canal.'),
    M('transversus-abdominis', 'Transversus abdominis', 'abdomen', 'Anterior abdominal wall', 'Internal surfaces of costal cartilages 7–12, thoracolumbar fascia, iliac crest, lateral third of the inguinal ligament', 'Linea alba and pubic crest (conjoint tendon)', 'abdominal-wall-nerves', 'T7-L1', 'Compresses the abdomen and increases intra-abdominal pressure ("corset" muscle)', 'Deep circumflex iliac, inferior epigastric, intercostal and lumbar arteries', 'The neurovascular plane between it and internal oblique is the target of the TAP block.'),
    M('levator-ani', 'Levator ani', 'abdomen', 'Pelvic floor', 'Posterior body of the pubis, tendinous arch of the obturator fascia, ischial spine', 'Perineal body, anococcygeal ligament and coccyx', 'n-levator-ani', 'S3-S4', 'Supports the pelvic viscera, resists intra-abdominal pressure and maintains anorectal angle (continence)', 'Inferior gluteal artery, inferior vesical (or vaginal) and pudendal arteries', 'Childbirth injury weakens it and predisposes to pelvic organ prolapse and stress incontinence.'),
    M('external-anal-sphincter', 'External anal sphincter', 'abdomen', 'Pelvic floor', 'Anococcygeal ligament and coccyx (deep to subcutaneous parts)', 'Perineal body (encircles the anal canal)', 'pudendal', 'S2-S4', 'Voluntary closure of the anal canal', 'Inferior rectal artery (from the internal pudendal)', 'Obstetric anal sphincter injury is graded by the extent of external and internal sphincter involvement; supplied by the inferior rectal nerve (pudendal).'),
    /* ---- Head and neck ---- */
    M('sternocleidomastoid', 'Sternocleidomastoid', 'head-neck', 'Neck', 'Manubrium (sternal head) and medial third of the clavicle (clavicular head)', 'Mastoid process and lateral superior nuchal line', 'spinal-accessory', 'CN XI', 'Tilts the head to the same side and rotates the face to the opposite side; together flex the neck', 'Occipital and posterior auricular arteries (upper part), superior thyroid and suprascapular arteries (lower part)', 'Congenital torticollis from fibrosis; right SCM weakness turns the face to the right when testing rotation against resistance.', { note: 'C2–C3 carry proprioception.' }),
    M('scalenus-anterior', 'Scalenus anterior', 'head-neck', 'Neck', 'Anterior tubercles of the transverse processes of C3–C6', 'Scalene tubercle of the first rib', 'cervical-rami', 'C5-C6', 'Elevates the first rib in inspiration; flexes and rotates the neck', 'Ascending cervical (inferior thyroid) and transverse cervical arteries', 'The phrenic nerve crosses its anterior surface; the subclavian vein lies in front and the subclavian artery and brachial plexus behind it (interscalene gap).'),
    M('masseter', 'Masseter', 'head-neck', 'Mastication', 'Maxillary process of the zygomatic bone and the zygomatic arch', 'Lateral surface of the ramus and angle of the mandible', 'cn-v3', 'CN V', 'Elevates and protrudes the mandible (closes the jaw)', 'Masseteric artery, transverse facial artery, facial artery', 'Masseteric reflex (jaw jerk) tests CN V3; the parotid duct crosses its surface.'),
    M('temporalis', 'Temporalis', 'head-neck', 'Mastication', 'Temporal fossa and deep surface of the temporal fascia', 'Coronoid process and anterior border of the ramus of the mandible', 'cn-v3', 'CN V', 'Elevates the mandible; posterior fibres retract it', 'Deep temporal arteries (maxillary), superficial temporal artery', 'Hollowing of the temples indicates wasting; the pterion lies over the anterior branch of the middle meningeal artery.'),
    M('medial-pterygoid', 'Medial pterygoid', 'head-neck', 'Mastication', 'Medial surface of the lateral pterygoid plate, pyramidal process of the palatine bone, maxillary tuberosity', 'Medial surface of the ramus and angle of the mandible', 'cn-v3', 'CN V', 'Elevates and protrudes the mandible; assists grinding', 'Pterygoid branches of the maxillary artery, facial artery', 'Forms a sling with the masseter around the angle of the mandible.'),
    M('lateral-pterygoid', 'Lateral pterygoid', 'head-neck', 'Mastication', 'Upper head: infratemporal surface of the greater wing of the sphenoid; lower head: lateral surface of the lateral pterygoid plate', 'Neck of the mandible (pterygoid fovea) and articular disc of the TMJ', 'cn-v3', 'CN V', 'Protrudes the mandible and opens the mouth (with suprahyoid muscles); alternating action produces side-to-side grinding', 'Pterygoid branches of the maxillary artery', 'The only masticatory muscle that depresses the jaw: the jaw deviates towards the weak side on opening.'),
    M('mylohyoid', 'Mylohyoid', 'head-neck', 'Suprahyoid', 'Mylohyoid line of the mandible', 'Median raphe and body of the hyoid bone', 'cn-v3', 'CN V', 'Elevates the floor of the mouth and hyoid; depresses the mandible', 'Submental artery (facial), mylohyoid branch of the inferior alveolar artery', 'Forms the muscular floor of the mouth; supplied by the nerve to mylohyoid (branch of the inferior alveolar nerve).'),
    M('digastric-posterior', 'Digastric, posterior belly', 'head-neck', 'Suprahyoid', 'Mastoid notch of the temporal bone', 'Intermediate tendon attached to the hyoid', 'cn-vii', 'CN VII', 'Elevates the hyoid and steadies it; depresses the mandible with the anterior belly', 'Occipital and posterior auricular arteries', 'The facial nerve (stylomastoid foramen) is a posterior-belly relation; the anterior belly is supplied by CN V3 (nerve to mylohyoid).'),
    M('frontalis', 'Frontalis (occipitofrontalis, frontal belly)', 'head-neck', 'Facial expression', 'Epicranial aponeurosis (galea aponeurotica)', 'Skin of the eyebrows and forehead', 'cn-vii', 'CN VII', 'Raises the eyebrows and wrinkles the forehead', 'Supra-orbital, supratrochlear and superficial temporal arteries', 'Forehead is spared in upper motor neurone facial palsy (bilateral cortical input) but paralysed in a lower motor neurone lesion (e.g. Bell’s palsy).'),
    M('orbicularis-oculi', 'Orbicularis oculi', 'head-neck', 'Facial expression', 'Medial orbital margin and medial palpebral ligament', 'Skin around the orbit and the tarsal plates', 'cn-vii', 'CN VII', 'Closes the eyelids (palpebral part gently, orbital part tightly)', 'Facial, ophthalmic, superficial temporal and infra-orbital arteries', 'Facial palsy prevents lid closure: corneal exposure; Bell’s phenomenon (eye rolls upward) is seen.'),
    M('orbicularis-oris', 'Orbicularis oris', 'head-neck', 'Facial expression', 'Muscle fibres around the mouth, maxilla and mandible (via modiolus)', 'Skin and mucous membrane of the lips', 'cn-vii', 'CN VII', 'Closes and protrudes the lips (whistling, kissing)', 'Superior and inferior labial branches of the facial artery', 'Facial weakness causes drooling and difficulty puffing out the cheeks.'),
    M('buccinator', 'Buccinator', 'head-neck', 'Facial expression', 'Maxilla and mandible (alveolar processes), pterygomandibular raphe', 'Modiolus at the angle of the mouth, orbicularis oris', 'cn-vii', 'CN VII', 'Presses the cheek against the teeth (keeps food between the molars) and aids blowing', 'Buccal branch of the maxillary artery, facial artery', 'The parotid duct pierces it; food pools in the cheek in facial palsy.', { note: 'Sensory supply of the cheek is by the buccal branch of CN V3; motor by CN VII.' }),
    M('zygomaticus-major', 'Zygomaticus major', 'head-neck', 'Facial expression', 'Zygomatic bone (lateral surface)', 'Modiolus at the angle of the mouth', 'cn-vii', 'CN VII', 'Draws the angle of the mouth up and laterally (smiling)', 'Facial artery (superior labial branch), infra-orbital artery', 'Asymmetric smile reveals facial nerve weakness.'),
    M('platysma', 'Platysma', 'head-neck', 'Facial expression', 'Fascia over pectoralis major and deltoid', 'Inferior border of the mandible and skin of the lower face', 'cn-vii', 'CN VII', 'Depresses the mandible and lower lip; tenses the neck skin', 'Submental artery (facial), suprascapular artery', 'Its cervical branch from the facial nerve; neck incisions must close the platysma layer for good cosmesis.'),
    M('stapedius', 'Stapedius', 'head-neck', 'Facial expression', 'Pyramidal eminence on the posterior wall of the tympanic cavity', 'Neck of the stapes', 'cn-vii', 'CN VII', 'Dampens loud sound by tilting the stapes (stapedial reflex)', 'Stylomastoid branch of the posterior auricular artery', 'Paralysis causes hyperacusis (sounds seem unbearably loud) and loss of the stapedial reflex.'),
    M('levator-palpebrae-superioris', 'Levator palpebrae superioris', 'head-neck', 'Extra-ocular and eyelid', 'Lesser wing of the sphenoid above the optic canal', 'Upper eyelid (tarsal plate and skin)', 'cn-iii', 'CN III', 'Elevates the upper eyelid', 'Ophthalmic artery (lacrimal and supra-orbital branches)', 'Ptosis in oculomotor palsy (complete) vs Horner syndrome (partial, from superior tarsal muscle); myasthenia gravis gives fatiguable ptosis.', { note: 'The superior tarsal (Müller) muscle is sympathetic.' }),
    M('superior-rectus', 'Superior rectus', 'head-neck', 'Extra-ocular and eyelid', 'Common tendinous ring (annulus of Zinn)', 'Superior sclera, behind the corneoscleral limbus', 'cn-iii', 'CN III', 'Elevates (best in abduction), intorts and adducts the eye', 'Muscular branches of the ophthalmic artery', 'Tested by asking the patient to look up and out.'),
    M('inferior-rectus', 'Inferior rectus', 'head-neck', 'Extra-ocular and eyelid', 'Common tendinous ring', 'Inferior sclera', 'cn-iii', 'CN III', 'Depresses (best in abduction), extorts and adducts the eye', 'Ophthalmic and infra-orbital arteries', 'Entrapped in orbital floor "blow-out" fractures, restricting upgaze.'),
    M('medial-rectus', 'Medial rectus', 'head-neck', 'Extra-ocular and eyelid', 'Common tendinous ring', 'Medial sclera', 'cn-iii', 'CN III', 'Adducts the eye', 'Muscular branches of the ophthalmic artery', 'Weak adduction with intact abduction suggests an oculomotor lesion or an internuclear ophthalmoplegia (MLF).'),
    M('inferior-oblique', 'Inferior oblique', 'head-neck', 'Extra-ocular and eyelid', 'Orbital surface of the maxilla (anteromedial floor of the orbit)', 'Posterolateral sclera', 'cn-iii', 'CN III', 'Elevates (best in adduction), extorts and abducts the eye', 'Infra-orbital artery, muscular branches of the ophthalmic artery', 'The only extra-ocular muscle that does not arise from the orbital apex.'),
    M('lateral-rectus', 'Lateral rectus', 'head-neck', 'Extra-ocular and eyelid', 'Common tendinous ring', 'Lateral sclera', 'cn-vi', 'CN VI', 'Abducts the eye', 'Lacrimal artery', 'Abducens palsy: horizontal diplopia worse on looking to the affected side; a false-localising sign of raised intracranial pressure.'),
    M('superior-oblique', 'Superior oblique', 'head-neck', 'Extra-ocular and eyelid', 'Body of the sphenoid above the optic canal', 'Superolateral sclera, via the trochlea', 'cn-iv', 'CN IV', 'Depresses (best in adduction), intorts and abducts the eye', 'Muscular branches of the ophthalmic artery', 'Trochlear palsy: vertical diplopia on looking down (stairs, reading) and head tilt away from the lesion. "SO4 LR6, all the rest 3".'),
    M('genioglossus', 'Genioglossus', 'head-neck', 'Tongue', 'Superior mental spine of the mandible', 'Tongue (undersurface) and body of the hyoid', 'cn-xii', 'CN XII', 'Protrudes the tongue and depresses its centre', 'Lingual artery (sublingual branch), submental artery', 'In a unilateral hypoglossal lesion the tongue deviates towards the weak side on protrusion; safety muscle of the airway in sleep.'),
    M('stylopharyngeus', 'Stylopharyngeus', 'head-neck', 'Pharynx and palate', 'Medial aspect of the styloid process', 'Pharyngeal wall and posterior border of the thyroid cartilage', 'cn-ix', 'CN IX', 'Elevates the pharynx and larynx in swallowing', 'Pharyngeal branches of the ascending pharyngeal artery, tonsillar artery', 'The only muscle supplied by the glossopharyngeal nerve.'),
    M('levator-veli-palatini', 'Levator veli palatini', 'head-neck', 'Pharynx and palate', 'Petrous temporal bone and cartilage of the auditory tube', 'Palatine aponeurosis', 'cn-x', 'CN X', 'Elevates the soft palate to seal the nasopharynx in swallowing and speech', 'Ascending palatine and greater palatine arteries', 'Vagal lesion: the uvula deviates away from the affected side and the palate fails to rise on saying "ah".', { note: 'Fibres reach it via the pharyngeal plexus (CN X with cranial accessory fibres).' }),
    M('tensor-veli-palatini', 'Tensor veli palatini', 'head-neck', 'Pharynx and palate', 'Scaphoid fossa, spine of the sphenoid, cartilage of the auditory tube', 'Palatine aponeurosis (around the pterygoid hamulus)', 'cn-v3', 'CN V', 'Tenses the soft palate and opens the auditory tube on swallowing and yawning', 'Ascending palatine artery, greater palatine artery', 'The only palatal muscle not supplied by the vagus (pharyngeal plexus); dysfunction contributes to otitis media in cleft palate.'),
    M('cricothyroid', 'Cricothyroid', 'head-neck', 'Larynx', 'Anterolateral arch of the cricoid cartilage', 'Inferior horn and lower border of the thyroid cartilage', 'external-laryngeal', 'CN X', 'Tilts the thyroid cartilage forward, tensing and lengthening the vocal folds (raises pitch)', 'Cricothyroid branch of the superior thyroid artery', 'External laryngeal nerve injury in thyroidectomy gives voice fatigue and loss of high pitch.'),
    M('posterior-cricoarytenoid', 'Posterior cricoarytenoid', 'head-neck', 'Larynx', 'Posterior surface of the cricoid lamina', 'Muscular process of the arytenoid cartilage', 'recurrent-laryngeal', 'CN X', 'Abducts the vocal folds (the only abductor, the "safety muscle")', 'Inferior laryngeal artery (from the inferior thyroid)', 'Bilateral recurrent laryngeal nerve injury leaves the cords adducted: stridor and airway obstruction.'),
    M('sternohyoid', 'Sternohyoid', 'head-neck', 'Infrahyoid', 'Posterior manubrium and medial clavicle', 'Body of the hyoid bone', 'ansa-cervicalis', 'C1-C3', 'Depresses the hyoid after swallowing', 'Superior thyroid artery, lingual artery', 'Strap muscles are divided or retracted at thyroidectomy.')
  ];

  /* ====================================================================
     PLEXUS SCHEMATICS
     node(id, type, grp, label, info) — info: name, roots, nerve (id in `nerves`),
     motor, sensory, injury, sign, notes. Motor lists for named nerves are derived from
     the muscle table at runtime (see MTData.anatomy.musclesOfNerve).
     Layouts are hand-placed [cx, cy, w, h] per node for a wide and a narrow (phone) viewBox.
     ==================================================================== */
  function node(id, type, grp, label, info) {
    info = info || {};
    info.id = id; info.type = type; info.grp = grp; info.label = label;
    if (!info.name) info.name = Array.isArray(label) ? label.join(' ') : label;
    return info;
  }

  var brachial = {
    id: 'brachial-plexus',
    title: 'Brachial plexus',
    mnemonic: '"Real Texans Drink Cold Beer": Roots, Trunks, Divisions, Cords, Branches.',
    sources: ['Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy, 8th–9th ed. (Upper limb: brachial plexus)', 'Standring S (ed). Gray’s Anatomy, 42nd ed. (Brachial plexus)', 'Drake RL et al. Gray’s Anatomy for Students, 5th ed.'],
    groups: [
      { id: 'lat', label: 'Lateral cord path', color: 'var(--chart-1)' },
      { id: 'post', label: 'Posterior cord path', color: 'var(--chart-4)' },
      { id: 'med', label: 'Medial cord path', color: 'var(--chart-3)' },
      { id: 'mix', label: 'Median (lateral + medial cords)', color: 'var(--chart-5)' },
      { id: 'none', label: 'Roots, trunks, proximal branches', color: 'var(--border-strong)' }
    ],
    columns: [['Roots', 'root'], ['Trunks', 'trunk'], ['Divisions', 'division'], ['Cords', 'cord'], ['Branches', 'branch']],
    nodes: [
      node('c5', 'root', 'none', 'C5', { name: 'C5 root (ventral ramus)', roots: 'C5', motor: 'Deltoid, supraspinatus, infraspinatus, biceps, brachialis, rhomboids (dorsal scapular), serratus anterior (long thoracic). Myotome: shoulder abduction.', sensory: 'Lateral upper arm over deltoid (C5 dermatome); lateral antecubital fossa.', injury: 'C4–C5 disc herniation or foraminal stenosis (C5 radiculopathy); traction or avulsion in high-energy trauma (motorcycle crash).', sign: 'Weak shoulder abduction and elbow flexion; reduced biceps reflex (C5–C6). Preganglionic avulsion adds winged scapula (dorsal scapular and long thoracic lost) and a normal sensory nerve action potential despite numbness.' }),
      node('c6', 'root', 'none', 'C6', { name: 'C6 root (ventral ramus)', roots: 'C6', motor: 'Biceps, brachialis, brachioradialis, extensor carpi radialis longus, supinator, serratus anterior, pectoralis major (clavicular head). Myotome: elbow flexion and wrist extension.', sensory: 'Lateral forearm, thumb and part of the index finger (C6 dermatome).', injury: 'C5/C6 disc herniation (C6 radiculopathy), upper-trunk traction.', sign: 'Weak wrist extension and elbow flexion; reduced biceps and brachioradialis reflexes; thumb paraesthesia.' }),
      node('c7', 'root', 'none', 'C7', { name: 'C7 root (ventral ramus)', roots: 'C7', motor: 'Triceps, wrist flexors (FCR), finger extensors, latissimus dorsi, serratus anterior, pectoralis major (sternocostal). Myotome: elbow extension, wrist flexion.', sensory: 'Middle finger (C7 dermatome).', injury: 'C6/C7 disc herniation is the commonest cervical radiculopathy.', sign: 'Weak triceps and wrist flexion; reduced triceps reflex; middle-finger numbness.' }),
      node('c8', 'root', 'none', 'C8', { name: 'C8 root (ventral ramus)', roots: 'C8', motor: 'Finger flexors (FDS, FDP), intrinsic hand muscles with T1, extensor indicis and pollicis. Myotome: finger flexion.', sensory: 'Little finger and medial hand and forearm (C8 dermatome).', injury: 'C7/T1 disc herniation (uncommon); lower-trunk traction; thoracic outlet compression by a cervical rib.', sign: 'Weak grip and hand intrinsic wasting; little-finger numbness.' }),
      node('t1', 'root', 'none', 'T1', { name: 'T1 root (ventral ramus)', roots: 'T1', motor: 'Intrinsic hand muscles (finger abduction and adduction: interossei), thenar and hypothenar muscles. T1 also carries preganglionic sympathetic fibres to the head and neck (via the stellate ganglion).', sensory: 'Medial forearm and arm (T1 dermatome).', injury: 'Pancoast (apical lung) tumour, cervical rib, birth or traction injury (Klumpke).', sign: 'Hand weakness with Horner syndrome (ptosis, miosis, anhidrosis) when the sympathetic outflow is damaged.' }),

      node('trunk-upper', 'trunk', 'none', ['Upper', 'trunk'], { name: 'Upper trunk (C5–C6)', roots: 'C5–C6', motor: 'Branches: suprascapular nerve and nerve to subclavius. Divides into anterior and posterior divisions. Supplies shoulder abduction and external rotation, elbow flexion and supination.', sensory: 'Lateral arm, lateral forearm and thumb (through its branches).', injury: 'Erb point (about 2–3 cm above the clavicle, posterior to sternocleidomastoid) is where C5 and C6 unite. Excessive lateral flexion of the neck away from a depressed shoulder (fall, motorcycle crash) or shoulder dystocia at birth stretches it.', sign: 'Erb–Duchenne palsy: "waiter’s tip" posture.' }),
      node('trunk-middle', 'trunk', 'none', ['Middle', 'trunk'], { name: 'Middle trunk (C7)', roots: 'C7', motor: 'Continuation of the C7 root; no named branches. Contributes to the median and radial nerves through the lateral and posterior cords.', sensory: 'Middle finger and posterior forearm (through its derivatives).', injury: 'Isolated injury is rare; may be damaged in combination with upper-trunk lesions or by anterior shoulder dislocation.', sign: 'Weak elbow, wrist and finger extension; weakened wrist flexion; middle-finger numbness.' }),
      node('trunk-lower', 'trunk', 'none', ['Lower', 'trunk'], { name: 'Lower trunk (C8–T1)', roots: 'C8–T1', motor: 'No named branches. Passes over the first rib behind the subclavian artery, in the groove for the lower trunk. Feeds the medial cord (anterior division) and posterior cord (posterior division).', sensory: 'Medial arm, forearm and ulnar side of the hand (through its derivatives).', injury: 'Sudden upward traction (grasping a branch when falling; breech delivery with arm pulled upward), cervical rib or fibrous band (neurogenic thoracic outlet syndrome), Pancoast tumour.', sign: 'Klumpke palsy: claw hand, with Horner syndrome if the T1 sympathetic fibres are involved.' }),

      node('div-up-ant', 'division', 'lat', 'Ant.', { name: 'Anterior division, upper trunk', roots: 'C5–C6', motor: 'Anterior (flexor-compartment) fibres; joins the lateral cord.', sensory: 'Lateral forearm via the musculocutaneous nerve.', injury: 'The divisions lie behind the clavicle (the retroclavicular space) and are rarely injured in isolation; clavicle fractures can involve them.', sign: 'Combined with the upper trunk lesion pattern.' }),
      node('div-up-post', 'division', 'post', 'Post.', { name: 'Posterior division, upper trunk', roots: 'C5–C6', motor: 'Posterior (extensor-compartment) fibres; joins the posterior cord, giving axillary and radial contributions.', sensory: 'Lateral arm (axillary) and radial territory.', injury: 'See upper trunk.', sign: 'See upper trunk.' }),
      node('div-mid-ant', 'division', 'lat', 'Ant.', { name: 'Anterior division, middle trunk', roots: 'C7', motor: 'Joins the lateral cord; contributes to the median nerve (lateral root) and lateral pectoral nerve.', sensory: 'Part of the median territory.', injury: 'Rarely isolated.', sign: 'Combined patterns only.' }),
      node('div-mid-post', 'division', 'post', 'Post.', { name: 'Posterior division, middle trunk', roots: 'C7', motor: 'Joins the posterior cord; main source of C7 fibres in the radial nerve (triceps, wrist and finger extensors).', sensory: 'Posterior forearm.', injury: 'Rarely isolated.', sign: 'Combined patterns only.' }),
      node('div-low-ant', 'division', 'med', 'Ant.', { name: 'Anterior division, lower trunk', roots: 'C8–T1', motor: 'Forms the whole medial cord: ulnar nerve, medial root of the median nerve, medial pectoral and medial cutaneous nerves.', sensory: 'Medial arm and forearm, ulnar hand.', injury: 'See lower trunk.', sign: 'See lower trunk.' }),
      node('div-low-post', 'division', 'post', 'Post.', { name: 'Posterior division, lower trunk', roots: 'C8–T1', motor: 'Joins the posterior cord; its C8 fibres run in the radial nerve (extensor indicis, extensor pollicis and abductor pollicis longus via the posterior interosseous nerve) and thoracodorsal nerve.', sensory: 'Little contribution.', injury: 'See lower trunk.', sign: 'See lower trunk.' }),

      node('cord-lat', 'cord', 'lat', ['Lateral', 'cord'], { name: 'Lateral cord (C5–C7)', roots: 'C5–C7', motor: 'Formed from the anterior divisions of the upper and middle trunks. Branches: lateral pectoral nerve, musculocutaneous nerve, lateral root of the median nerve. Supplies the anterior arm flexors, pronator teres, flexor carpi radialis, pectoralis major.', sensory: 'Lateral forearm (musculocutaneous) and the lateral palm and digits (via the median).', injury: 'Anterior glenohumeral dislocation, axillary trauma, humeral neck fracture.', sign: 'Weak elbow flexion, forearm pronation and wrist flexion, with lateral forearm and radial-palm sensory loss.' }),
      node('cord-post', 'cord', 'post', ['Posterior', 'cord'], { name: 'Posterior cord (C5–T1)', roots: 'C5–T1', motor: 'Formed from all three posterior divisions. Branches ("STAR"): Subscapular nerves (upper and lower), Thoracodorsal, Axillary, Radial. Supplies the whole extensor compartment of the limb and the deltoid.', sensory: 'Regimental-badge patch (axillary), posterior arm, forearm and dorsum of the hand (radial).', injury: 'Crutch compression in the axilla, shoulder dislocation, humeral neck fracture, prolonged compression in sleep or anaesthesia.', sign: 'Wrist drop with weak shoulder abduction, extension and medial rotation; triceps and deltoid weak.' }),
      node('cord-med', 'cord', 'med', ['Medial', 'cord'], { name: 'Medial cord (C8–T1)', roots: 'C8–T1', motor: 'Continuation of the anterior division of the lower trunk. Branches: medial pectoral, medial cutaneous nerve of the arm, medial cutaneous nerve of the forearm, ulnar nerve, medial root of the median nerve.', sensory: 'Medial arm and forearm, ulnar-side hand, and part of the median territory.', injury: 'Pancoast tumour, cervical rib, hyperabduction injuries; the cord lies medial to the axillary artery.', sign: 'Claw hand, weak finger flexion and intrinsics, sensory loss on the medial arm, forearm and hand.' }),

      node('musculocutaneous', 'terminal', 'lat', 'Musculocutaneous', { name: 'Musculocutaneous nerve', roots: 'C5–C7', nerve: 'musculocutaneous', sensory: 'Lateral cutaneous nerve of the forearm: skin of the lateral (radial) half of the forearm.', injury: 'Uncommon: anterior shoulder dislocation, coracobrachialis entrapment, humeral fracture, surgery.', sign: 'Weak elbow flexion and supination (some flexion remains through brachioradialis); absent biceps reflex; lateral forearm numbness.' }),
      node('axillary', 'terminal', 'post', 'Axillary', { name: 'Axillary nerve', roots: 'C5–C6', nerve: 'axillary', sensory: 'Superior lateral cutaneous nerve of the arm: "regimental badge" patch over the lower deltoid.', injury: 'Surgical-neck fracture of the humerus, anterior shoulder dislocation, quadrangular space syndrome, intramuscular injection into the deltoid.', sign: 'Flattened shoulder contour; weak abduction from 15° to 90°; badge-patch numbness.' }),
      node('radial', 'terminal', 'post', 'Radial', { name: 'Radial nerve', roots: 'C5–T1', nerve: 'radial', sensory: 'Posterior cutaneous nerves of the arm and forearm, then the superficial radial nerve to the dorsum of the lateral hand and proximal parts of the lateral 3½ digits. Autonomous zone: dorsum of the first web space.', injury: 'Axilla (crutches): triceps also lost. Spiral groove (humeral shaft fracture, "Saturday-night palsy"): triceps spared. Proximal forearm (supinator, posterior interosseous nerve): finger drop without sensory loss.', sign: 'Wrist drop.' }),
      node('median', 'terminal', 'mix', 'Median', { name: 'Median nerve', roots: 'C6–T1 (C5 in some texts)', nerve: 'median', sensory: 'Palmar surface of the lateral 3½ digits with the nail beds on the dorsum, and the central palm; the palmar cutaneous branch supplies the thenar skin and arises proximal to the carpal tunnel. Autonomous zone: tip of the index finger.', injury: 'Wrist (carpal tunnel syndrome, lacerations); proximal forearm (pronator teres, supracondylar fracture, ligament of Struthers); anterior interosseous branch (Kiloh–Nevin).', sign: '"Ape hand" with thenar wasting at the wrist; "hand of benediction" on attempting a fist when the lesion is proximal.' }),
      node('ulnar', 'terminal', 'med', 'Ulnar', { name: 'Ulnar nerve', roots: 'C8–T1 (often C7 too)', nerve: 'ulnar', sensory: 'Medial 1½ digits (palmar and dorsal) and the medial hand. The palmar and dorsal cutaneous branches arise proximal to the wrist. Autonomous zone: tip of the little finger.', injury: 'Medial epicondyle and cubital tunnel (funny bone, elbow fracture, cubital tunnel syndrome); Guyon’s canal at the wrist (cycling, hook of hamate fracture).', sign: '"Claw hand" (main en griffe), Froment’s sign, loss of finger abduction/adduction, hypothenar and first dorsal interosseous wasting.' }),

      node('dorsal-scapular', 'collateral', 'none', 'Dorsal scapular', { name: 'Dorsal scapular nerve', roots: 'C5 (C4 in some texts)', nerve: 'dorsal-scapular', sensory: 'None (motor only).', injury: 'Rare: scalene entrapment, neck surgery; can mimic C5 radiculopathy.', sign: 'Medial border of the scapula lifts; weak scapular retraction.' }),
      node('long-thoracic', 'collateral', 'none', 'Long thoracic', { name: 'Long thoracic nerve', roots: 'C5–C7', nerve: 'long-thoracic', sensory: 'None (motor only).', injury: 'Axillary node dissection, mastectomy, stab wound or blow to the lateral chest wall, carrying heavy loads, viral neuritis (Parsonage–Turner syndrome).', sign: 'Winged scapula; arm cannot be raised above the horizontal.' }),
      node('suprascapular', 'collateral', 'none', 'Suprascapular', { name: 'Suprascapular nerve', roots: 'C5–C6', nerve: 'suprascapular', sensory: 'Posterior glenohumeral capsule and acromioclavicular joint (no skin).', injury: 'Suprascapular notch entrapment (overhead athletes), spinoglenoid ganglion cyst (infraspinatus only), shoulder trauma.', sign: 'Weak initiation of abduction and external rotation; deep posterior shoulder pain; supraspinatus and infraspinatus wasting.' }),
      node('n-subclavius', 'collateral', 'none', 'N. to subclavius', { name: 'Nerve to subclavius', roots: 'C5–C6', nerve: 'n-subclavius', sensory: 'None.', injury: 'Clinically silent. May give an accessory phrenic nerve contribution (C5).', sign: 'No recognised deficit.' }),
      node('lateral-pectoral', 'collateral', 'lat', 'Lateral pectoral', { name: 'Lateral pectoral nerve', roots: 'C5–C7', nerve: 'lateral-pectoral', sensory: 'None.', injury: 'Axillary surgery, mastectomy.', sign: 'Weak pectoral adduction and medial rotation; clavicular head wasting.' }),
      node('medial-pectoral', 'collateral', 'med', 'Medial pectoral', { name: 'Medial pectoral nerve', roots: 'C8–T1', nerve: 'medial-pectoral', sensory: 'None.', injury: 'Axillary surgery, cervical rib; sometimes involved in Klumpke palsy.', sign: 'Atrophy of pectoralis minor and the sternocostal head of pectoralis major.' }),
      node('upper-subscapular', 'collateral', 'post', 'Upper subscapular', { name: 'Upper subscapular nerve', roots: 'C5–C6', nerve: 'upper-subscapular', sensory: 'None.', injury: 'Rarely isolated; posterior cord lesions, shoulder surgery.', sign: 'Weak medial rotation of the shoulder (partial).' }),
      node('thoracodorsal', 'collateral', 'post', 'Thoracodorsal', { name: 'Thoracodorsal nerve', roots: 'C6–C8', nerve: 'thoracodorsal', sensory: 'None.', injury: 'Axillary lymph-node clearance (runs with the thoracodorsal vessels), latissimus dorsi flap harvest.', sign: 'Weak adduction, extension and medial rotation of the arm; difficulty with chin-ups and crutch use.' }),
      node('lower-subscapular', 'collateral', 'post', 'Lower subscapular', { name: 'Lower subscapular nerve', roots: 'C5–C6', nerve: 'lower-subscapular', sensory: 'None.', injury: 'Rarely isolated; posterior cord lesions, shoulder surgery.', sign: 'Weak medial rotation and adduction.' }),
      node('mcn-arm', 'collateral', 'med', 'Med. cut. n. of arm', { name: 'Medial cutaneous nerve of the arm', roots: 'T1 (C8)', nerve: 'mcn-arm', sensory: 'Skin of the medial arm; joins the intercostobrachial nerve (T2).', injury: 'Medial cord and lower-trunk lesions, thoracic outlet syndrome, axillary surgery.', sign: 'Numbness of the medial arm.' }),
      node('mcn-forearm', 'collateral', 'med', ['Med. cutaneous', 'n. of forearm'], { name: 'Medial cutaneous nerve of the forearm', roots: 'C8–T1', nerve: 'mcn-forearm', sensory: 'Skin of the medial forearm, from elbow to wrist.', injury: 'Medial cord and lower-trunk lesions; helps distinguish cord/trunk lesions from an isolated ulnar neuropathy (which spares it).', sign: 'Numbness of the medial forearm.' })
    ],
    edges: [
      'c5>trunk-upper', 'c6>trunk-upper', 'c7>trunk-middle', 'c8>trunk-lower', 't1>trunk-lower',
      'trunk-upper>div-up-ant', 'trunk-upper>div-up-post', 'trunk-middle>div-mid-ant', 'trunk-middle>div-mid-post', 'trunk-lower>div-low-ant', 'trunk-lower>div-low-post',
      'div-up-ant>cord-lat', 'div-mid-ant>cord-lat', 'div-low-ant>cord-med', 'div-up-post>cord-post', 'div-mid-post>cord-post', 'div-low-post>cord-post',
      'cord-lat>musculocutaneous', 'cord-lat>median', 'cord-med>median', 'cord-med>ulnar', 'cord-post>axillary', 'cord-post>radial',
      'c5>dorsal-scapular', 'c5>long-thoracic', 'c6>long-thoracic', 'c7>long-thoracic',
      'trunk-upper>suprascapular', 'trunk-upper>n-subclavius',
      'cord-lat>lateral-pectoral', 'cord-med>medial-pectoral', 'cord-med>mcn-arm', 'cord-med>mcn-forearm',
      'cord-post>upper-subscapular', 'cord-post>thoracodorsal', 'cord-post>lower-subscapular'
    ],
    layouts: {
      wide: { vb: [700, 612], font: 13, pos: {
        'dorsal-scapular': [63, 60, 112, 28], 'long-thoracic': [63, 168, 112, 28],
        c5: [170, 60, 44, 30], c6: [170, 104, 44, 30], c7: [170, 232, 44, 30], c8: [170, 372, 44, 30], t1: [170, 416, 44, 30],
        suprascapular: [205, 20, 96, 26], 'n-subclavius': [334, 20, 126, 26],
        'trunk-upper': [266, 84, 78, 38], 'trunk-middle': [266, 232, 78, 38], 'trunk-lower': [266, 394, 78, 38],
        'div-up-post': [366, 66, 54, 28], 'div-up-ant': [366, 108, 54, 28], 'div-mid-post': [366, 210, 54, 28], 'div-mid-ant': [366, 254, 54, 28], 'div-low-post': [366, 366, 54, 28], 'div-low-ant': [366, 420, 54, 28],
        'cord-post': [470, 126, 78, 38], 'cord-lat': [470, 300, 78, 38], 'cord-med': [470, 476, 78, 38],
        'upper-subscapular': [628, 52, 132, 30], thoracodorsal: [628, 90, 132, 30], 'lower-subscapular': [628, 128, 132, 30], axillary: [628, 170, 132, 34], radial: [628, 214, 132, 34],
        'lateral-pectoral': [628, 272, 132, 30], musculocutaneous: [628, 314, 132, 34], median: [628, 362, 132, 36],
        'medial-pectoral': [628, 418, 132, 30], 'mcn-arm': [628, 458, 132, 30], 'mcn-forearm': [628, 500, 132, 38], ulnar: [628, 548, 132, 34]
      }, heads: [[170, 'Roots'], [266, 'Trunks'], [366, 'Divisions'], [470, 'Cords'], [628, 'Branches']], headY: 598 },
      narrow: { vb: [380, 640], font: 11, pos: {
        'long-thoracic': [58, 14, 108, 22], 'dorsal-scapular': [86, 44, 104, 22],
        suprascapular: [206, 14, 94, 22], 'n-subclavius': [316, 14, 112, 22],
        c5: [47, 112, 32, 26], c6: [47, 148, 32, 26], c7: [47, 262, 32, 26], c8: [47, 388, 32, 26], t1: [47, 424, 32, 26],
        'trunk-upper': [106, 130, 46, 34], 'trunk-middle': [106, 262, 46, 34], 'trunk-lower': [106, 406, 46, 34],
        'div-up-post': [160, 112, 34, 24], 'div-up-ant': [160, 148, 34, 24], 'div-mid-post': [160, 240, 34, 24], 'div-mid-ant': [160, 276, 34, 24], 'div-low-post': [160, 380, 34, 24], 'div-low-ant': [160, 432, 34, 24],
        'cord-post': [213, 170, 50, 34], 'cord-lat': [213, 340, 50, 34], 'cord-med': [213, 508, 50, 34],
        'upper-subscapular': [316, 100, 114, 28], thoracodorsal: [316, 134, 114, 28], 'lower-subscapular': [316, 168, 114, 28], axillary: [316, 206, 114, 30], radial: [316, 246, 114, 30],
        'lateral-pectoral': [316, 300, 114, 28], musculocutaneous: [316, 338, 114, 30], median: [316, 382, 114, 32],
        'medial-pectoral': [316, 434, 114, 28], 'mcn-arm': [316, 470, 114, 28], 'mcn-forearm': [316, 510, 114, 34], ulnar: [316, 554, 114, 30]
      }, lanes: { 'c5>long-thoracic': 10, 'c6>long-thoracic': 10, 'c7>long-thoracic': 10, 'c5>dorsal-scapular': 20 }, heads: [[47, 'Roots'], [106, 'Trunks'], [160, 'Div.'], [213, 'Cords'], [316, 'Branches']], headY: 614 }
    },
    lesions: [
      { id: 'erb', name: 'Erb–Duchenne palsy (upper trunk, C5–C6)', short: 'Erb–Duchenne', sites: ['trunk-upper'], affected: ['c5', 'c6', 'suprascapular', 'n-subclavius', 'div-up-ant', 'div-up-post', 'cord-lat', 'musculocutaneous', 'axillary'], partial: ['radial', 'cord-post'],
        mechanism: 'Excessive widening of the neck–shoulder angle: fall or motorcycle crash on the shoulder, or shoulder dystocia / traction on the neck at birth. Preganglionic (root avulsion) injuries are worse.',
        muscles: ['supraspinatus', 'infraspinatus', 'deltoid', 'teres-minor', 'biceps-brachii', 'brachialis', 'coracobrachialis', 'brachioradialis', 'supinator'],
        sensory: 'Lateral upper arm, lateral forearm and thumb (C5–C6 dermatomes); loss may be patchy.',
        sign: '"Waiter’s tip" (porter’s tip) posture: arm adducted and medially rotated, elbow extended, forearm pronated, wrist flexed. Biceps and brachioradialis reflexes absent.',
        spared: 'Hand intrinsic muscles and finger movements (C8–T1) are normal.' },
      { id: 'klumpke', name: 'Klumpke palsy (lower trunk, C8–T1)', short: 'Klumpke', sites: ['trunk-lower'], affected: ['c8', 't1', 'div-low-ant', 'div-low-post', 'cord-med', 'ulnar', 'medial-pectoral', 'mcn-arm', 'mcn-forearm'], partial: ['median', 'radial', 'cord-post', 'cord-lat'],
        mechanism: 'Sudden upward traction on the arm (grasping a branch when falling, breech delivery with the arm pulled up), cervical rib or Pancoast tumour compressing the lower trunk.',
        muscles: ['palmar-interossei', 'dorsal-interossei', 'lumbricals-3-4', 'lumbricals-1-2', 'adductor-pollicis', 'abductor-pollicis-brevis', 'opponens-pollicis', 'flexor-pollicis-brevis', 'abductor-digiti-minimi-hand', 'flexor-digiti-minimi-brevis', 'opponens-digiti-minimi', 'flexor-digitorum-profundus'],
        sensory: 'Medial forearm, medial arm (partly) and the ulnar border of the hand and fingers (C8–T1).',
        sign: '"Claw hand": MCP joints hyperextended and interphalangeal joints flexed. Horner syndrome (ptosis, miosis, anhidrosis) if the T1 sympathetic fibres are damaged, which suggests root avulsion.',
        spared: 'Shoulder and elbow movement are preserved.' },
      { id: 'long-thoracic', name: 'Long thoracic nerve injury', short: 'Long thoracic', sites: ['long-thoracic'], affected: [], partial: [],
        mechanism: 'Axillary node dissection or mastectomy, stab wound, a blow or traction at the lateral chest wall, carrying heavy loads on the shoulder, or neuralgic amyotrophy.',
        muscles: ['serratus-anterior'],
        sensory: 'None (purely motor nerve).',
        sign: 'Winged scapula: medial border of the scapula lifts off the chest wall when the patient pushes against a wall; arm cannot be abducted above the horizontal (scapula cannot rotate upward).',
        spared: 'Trapezius winging (accessory nerve) differs: the lateral border moves away from the spine and shoulder droops.' },
      { id: 'axillary-neck', name: 'Axillary nerve at the surgical neck of the humerus', short: 'Axillary (surgical neck)', sites: ['axillary'], affected: [], partial: [],
        mechanism: 'Surgical-neck fracture, anterior inferior glenohumeral dislocation, quadrangular space syndrome, or injection into the deltoid.',
        muscles: ['deltoid', 'teres-minor'],
        sensory: '"Regimental badge" patch over the lower deltoid (superior lateral cutaneous nerve of the arm).',
        sign: 'Flattened shoulder contour with wasting; abduction weak beyond the initial 15° supplied by supraspinatus.',
        spared: 'Rotator cuff muscles other than teres minor, and the biceps.' },
      { id: 'radial-shaft', name: 'Radial nerve in the spiral groove (mid-shaft humerus)', short: 'Radial (mid-shaft humerus)', sites: ['radial'], affected: [], partial: [],
        mechanism: 'Mid-shaft humeral fracture (Holstein–Lewis in the distal third), "Saturday-night palsy" from sleeping with the arm over a chair, tourniquet or cast compression.',
        muscles: ['brachioradialis', 'extensor-carpi-radialis-longus', 'extensor-carpi-radialis-brevis', 'supinator', 'extensor-digitorum', 'extensor-digiti-minimi', 'extensor-carpi-ulnaris', 'abductor-pollicis-longus', 'extensor-pollicis-brevis', 'extensor-pollicis-longus', 'extensor-indicis'],
        sensory: 'Dorsum of the lateral hand and proximal lateral 3½ digits (superficial radial); autonomous zone: dorsal first web space. The posterior cutaneous nerve of the arm (from the axilla) is spared.',
        sign: 'Wrist drop (cannot extend the wrist or MCP joints); grip is weak because the wrist cannot be stabilised.',
        spared: 'Triceps is spared (its branches leave in the axilla and upper arm, proximal to the groove). A lesion in the axilla (crutches) also paralyses triceps.' },
      { id: 'median-carpal', name: 'Median nerve at the carpal tunnel', short: 'Median (carpal tunnel)', sites: ['median'], affected: [], partial: [],
        mechanism: 'Carpal tunnel syndrome (repetitive use, pregnancy, hypothyroidism, diabetes, rheumatoid arthritis, acromegaly), Colles fracture, wrist lacerations.',
        muscles: ['abductor-pollicis-brevis', 'opponens-pollicis', 'flexor-pollicis-brevis', 'lumbricals-1-2'],
        sensory: 'Palmar side of the lateral 3½ digits and their dorsal nail beds. The thenar eminence skin is spared (palmar cutaneous branch arises proximal to the tunnel).',
        sign: 'Thenar wasting ("ape hand"), weak thumb abduction and opposition; positive Tinel and Phalen tests; nocturnal paraesthesia relieved by shaking the hand (flick sign).',
        spared: 'Forearm muscles (pronators, wrist and long finger flexors) are normal.' },
      { id: 'median-elbow', name: 'Median nerve at the elbow / proximal forearm', short: 'Median (elbow)', sites: ['median'], affected: [], partial: [],
        mechanism: 'Supracondylar humeral fracture (children), ligament of Struthers, dislocation of the elbow, pronator teres compression (pronator syndrome), anterior interosseous branch compression (Kiloh–Nevin syndrome).',
        muscles: ['pronator-teres', 'flexor-carpi-radialis', 'palmaris-longus', 'flexor-digitorum-superficialis', 'flexor-digitorum-profundus', 'flexor-pollicis-longus', 'pronator-quadratus', 'abductor-pollicis-brevis', 'opponens-pollicis', 'flexor-pollicis-brevis', 'lumbricals-1-2'],
        sensory: 'Palmar side of the lateral 3½ digits and the thenar eminence (palmar cutaneous branch involved) plus the dorsal nail beds.',
        sign: '"Hand of benediction" on attempting a fist (index and middle fingers stay straight); weak pronation; wrist flexion deviates ulnarward; cannot make an "OK" circle (anterior interosseous nerve component).',
        spared: 'Flexor carpi ulnaris and the ulnar half of flexor digitorum profundus (ring and little finger flexion) are preserved.' },
      { id: 'ulnar-elbow', name: 'Ulnar nerve at the medial epicondyle (cubital tunnel)', short: 'Ulnar (elbow)', sites: ['ulnar'], affected: [], partial: [],
        mechanism: 'Blow to the "funny bone", medial epicondyle fracture, cubital tunnel syndrome (prolonged elbow flexion), elbow arthritis or subluxation.',
        muscles: ['flexor-carpi-ulnaris', 'flexor-digitorum-profundus', 'palmaris-brevis', 'abductor-digiti-minimi-hand', 'flexor-digiti-minimi-brevis', 'opponens-digiti-minimi', 'adductor-pollicis', 'flexor-pollicis-brevis', 'palmar-interossei', 'dorsal-interossei', 'lumbricals-3-4'],
        sensory: 'Medial 1½ digits on both palmar and dorsal surfaces and the medial hand (dorsal and palmar cutaneous branches involved).',
        sign: 'Claw hand (ring and little fingers) – paradoxically milder than at the wrist because FDP to those fingers is also paralysed ("ulnar paradox"); Froment’s sign, Wartenberg sign (abducted little finger), weak wrist flexion deviating radially.',
        spared: 'Median-innervated muscles, including the thenar group, and the radial half of FDP.' },
      { id: 'ulnar-wrist', name: 'Ulnar nerve at the wrist (Guyon’s canal)', short: 'Ulnar (wrist)', sites: ['ulnar'], affected: [], partial: [],
        mechanism: 'Cycling (handlebar palsy), hook-of-hamate fracture, ganglion, repetitive pressure from tools or crutches, lacerations.',
        muscles: ['palmaris-brevis', 'abductor-digiti-minimi-hand', 'flexor-digiti-minimi-brevis', 'opponens-digiti-minimi', 'adductor-pollicis', 'flexor-pollicis-brevis', 'palmar-interossei', 'dorsal-interossei', 'lumbricals-3-4'],
        sensory: 'Palmar side of the little finger and medial half of the ring finger only if the superficial branch is involved; the dorsal ulnar hand is spared (dorsal cutaneous branch arises about 5 cm proximal to the wrist).',
        sign: 'Prominent claw hand of the ring and little fingers (FDP is intact so the IP joints flex strongly), Froment’s sign, hypothenar and interosseous wasting.',
        spared: 'Flexor carpi ulnaris and the ulnar half of FDP; sensation on the dorsum of the medial hand.' }
    ]
  };

  var lumbosacral = {
    id: 'lumbosacral-plexus',
    title: 'Lumbosacral plexus',
    mnemonic: 'Lumbar plexus: "I Instruct Girls, Let Friends Observe" (Iliohypogastric, Ilioinguinal, Genitofemoral, Lateral femoral cutaneous, Femoral, Obturator).',
    sources: ['Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy, 8th–9th ed. (Lower limb; Pelvis and perineum)', 'Standring S (ed). Gray’s Anatomy, 42nd ed. (Lumbar and sacral plexuses)', 'Drake RL et al. Gray’s Anatomy for Students, 5th ed.'],
    groups: [
      { id: 'lum', label: 'Lumbar plexus (L1–L4)', color: 'var(--chart-1)' },
      { id: 'sac', label: 'Sacral plexus (L4–S4)', color: 'var(--chart-4)' },
      { id: 'sci', label: 'Sciatic nerve and branches', color: 'var(--chart-5)' },
      { id: 'none', label: 'Roots and divisions', color: 'var(--border-strong)' }
    ],
    columns: [['Roots', 'root'], ['Divisions', 'division'], ['Branches', 'branch']],
    nodes: [
      node('t12', 'root', 'none', 'T12', { name: 'T12 (subcostal nerve)', roots: 'T12', motor: 'Subcostal nerve: external and internal oblique, transversus abdominis and pyramidalis. Often sends a branch to L1.', sensory: 'Skin over the iliac crest and upper buttock (lateral cutaneous branch) and lower abdomen.', injury: 'Flank incisions (nephrectomy); T12 vertebral lesions.', sign: 'Flank bulge from abdominal wall denervation; numbness above the iliac crest.' }),
      node('l1', 'root', 'none', 'L1', { name: 'L1 root', roots: 'L1', motor: 'Hip flexion (iliopsoas), lower internal oblique/transversus, cremaster (genitofemoral). Myotome: hip flexion (L1–L2).', sensory: 'Inguinal region and upper anterior thigh (L1 dermatome).', injury: 'Upper lumbar disc or tumour (rare); hernia surgery affects its branches (ilioinguinal, iliohypogastric).', sign: 'Groin numbness; weak hip flexion; reduced cremasteric reflex.' }),
      node('l2', 'root', 'none', 'L2', { name: 'L2 root', roots: 'L2', motor: 'Hip flexion (iliopsoas), sartorius, hip adductors.', sensory: 'Anterior mid-thigh (L2 dermatome).', injury: 'L1/L2 and L2/L3 disc herniation, psoas pathology.', sign: 'Weak hip flexion and adduction; anterior thigh numbness.' }),
      node('l3', 'root', 'none', 'L3', { name: 'L3 root', roots: 'L3', motor: 'Knee extension (quadriceps), hip adduction. Patellar reflex L3–L4.', sensory: 'Lower anterior thigh to the medial femoral condyle (L3 dermatome).', injury: 'L2/L3 and L3/L4 disc herniation, diabetic amyotrophy.', sign: 'Quadriceps weakness, reduced knee jerk, positive femoral stretch test.' }),
      node('l4', 'root', 'none', 'L4', { name: 'L4 root', roots: 'L4', motor: 'Knee extension, ankle dorsiflexion and inversion (tibialis anterior). Contributes to both the lumbar and sacral plexuses (the nervus furcalis).', sensory: 'Medial leg and medial malleolus (L4 dermatome).', injury: 'L3/L4 disc herniation (L4 radiculopathy).', sign: 'Weak dorsiflexion and knee extension; reduced knee jerk; medial leg numbness.' }),
      node('l5', 'root', 'none', 'L5', { name: 'L5 root', roots: 'L5', motor: 'Great toe extension (extensor hallucis longus), ankle dorsiflexion, hip abduction (gluteus medius), foot inversion and eversion. Myotome: big-toe extension.', sensory: 'Lateral leg and dorsum of the foot, including the great toe (L5 dermatome).', injury: 'L4/L5 disc herniation is the commonest lumbar radiculopathy; also lumbosacral trunk injury.', sign: 'Foot drop, weak toe extension, hip abduction weakness (Trendelenburg) and weak inversion/eversion: differs from a common fibular palsy by involving inversion and gluteus medius.' }),
      node('s1', 'root', 'none', 'S1', { name: 'S1 root', roots: 'S1', motor: 'Plantarflexion (gastrocnemius, soleus), hamstrings, gluteus maximus. Myotome: plantarflexion; ankle reflex S1.', sensory: 'Lateral foot, heel and sole (S1 dermatome).', injury: 'L5/S1 disc herniation (S1 radiculopathy).', sign: 'Weak toe-walking, absent ankle jerk, lateral foot numbness.' }),
      node('s2', 'root', 'none', 'S2', { name: 'S2 root', roots: 'S2', motor: 'Toe flexion, foot intrinsics, hamstrings; pelvic splanchnic (S2–S4) parasympathetic fibres to bladder, rectum and genitalia.', sensory: 'Posterior thigh and popliteal fossa (S2 dermatome).', injury: 'Cauda equina compression.', sign: 'Posterior thigh numbness; see cauda equina syndrome.' }),
      node('s3', 'root', 'none', 'S3', { name: 'S3 root', roots: 'S3', motor: 'Pelvic floor and sphincters (pudendal, S2–S4), pelvic splanchnic nerves.', sensory: 'Medial buttock and ischial tuberosity region (S3 dermatome).', injury: 'Cauda equina compression (central disc, tumour), sacral fracture.', sign: 'Saddle anaesthesia, urinary retention, faecal incontinence.' }),
      node('s4', 'root', 'none', 'S4', { name: 'S4 root', roots: 'S4', motor: 'Pelvic floor (levator ani), external anal sphincter (S2–S4); S2–S4 "keep the penis off the floor".', sensory: 'Perianal skin (S4–S5).', injury: 'Cauda equina syndrome; sacral fractures.', sign: 'Perianal numbness, reduced anal tone and absent anal reflex: a surgical emergency.' }),

      node('lad', 'division', 'lum', ['Lumbar', 'ant. div.'], { name: 'Lumbar anterior divisions (L1–L4)', roots: 'L1–L4', motor: 'Form the obturator nerve and genitofemoral nerve; they supply the medial (adductor) compartment of the thigh. (Mnemonic: anterior divisions supply flexors/adductors.)', sensory: 'Medial thigh (obturator cutaneous branch), genital and femoral triangle skin.', injury: 'Pelvic side-wall surgery, psoas haematoma.', sign: 'Adductor weakness, groin sensory loss.' }),
      node('lpd', 'division', 'lum', ['Lumbar', 'post. div.'], { name: 'Lumbar posterior divisions (L2–L4)', roots: 'L2–L4', motor: 'Form the femoral nerve and the lateral femoral cutaneous nerve; they supply the extensor compartment of the thigh.', sensory: 'Anterior and lateral thigh, medial leg (saphenous).', injury: 'Retroperitoneal haematoma, psoas abscess.', sign: 'Weak knee extension, lateral and anterior thigh sensory loss.' }),
      node('lst', 'division', 'none', ['Lumbosacral', 'trunk'], { name: 'Lumbosacral trunk (L4 descending branch + L5)', roots: 'L4–L5', motor: 'Descends over the pelvic brim and the ala of the sacrum to join the sacral plexus; contains the fibres that become the deep fibular nerve, tibialis anterior supply and gluteal nerves.', sensory: 'Lateral leg and dorsum of the foot (through its derivatives).', injury: 'Pelvic fracture (sacral ala), pressure from the fetal head in labour, sacroiliac surgery, tumours.', sign: 'Post-partum or post-traumatic foot drop with gluteus medius weakness.' }),
      node('sad', 'division', 'sac', ['Sacral', 'ant. div.'], { name: 'Sacral anterior divisions (L4–S4)', roots: 'L4–S4', motor: 'Give the tibial part of the sciatic nerve, the pudendal nerve, the nerves to quadratus femoris and obturator internus, and part of the posterior femoral cutaneous nerve. They supply the flexor compartments.', sensory: 'Sole, perineum and posterior thigh.', injury: 'Pelvic tumours, trauma, prolonged labour.', sign: 'Weak hamstrings and plantarflexion; perineal numbness.' }),
      node('spd', 'division', 'sac', ['Sacral', 'post. div.'], { name: 'Sacral posterior divisions (L4–S3)', roots: 'L4–S3', motor: 'Give the common fibular part of the sciatic nerve, the superior and inferior gluteal nerves, the nerve to piriformis and part of the posterior femoral cutaneous nerve. They supply the extensor/abductor compartments.', sensory: 'Lateral leg and dorsum of the foot.', injury: 'Pelvic trauma, L4–S1 disc herniation, tumours.', sign: 'Foot drop and weak abduction/extension of the hip.' }),

      node('iliohypogastric', 'collateral', 'lum', 'Iliohypogastric', { name: 'Iliohypogastric nerve', roots: 'T12–L1', nerve: 'iliohypogastric', motor: 'Lower fibres of internal oblique and transversus abdominis.', sensory: 'Lateral cutaneous branch: skin over the iliac crest and lateral gluteal region; anterior cutaneous branch: skin of the suprapubic region.', injury: 'Pfannenstiel and appendicectomy incisions, hernia repair, TAP block.', sign: 'Suprapubic and lateral hip numbness or neuropathic pain; weakness predisposes to direct inguinal hernia.' }),
      node('ilioinguinal', 'collateral', 'lum', 'Ilioinguinal', { name: 'Ilioinguinal nerve', roots: 'L1', nerve: 'ilioinguinal', motor: 'Lower fibres of internal oblique and transversus abdominis.', sensory: 'Upper medial thigh, root of the penis and anterior scrotum (or mons pubis and anterior labia majora).', injury: 'Inguinal hernia repair, appendicectomy, Pfannenstiel incision, mesh entrapment.', sign: 'Groin numbness or burning pain extending to the scrotum/labia; inguinal pain on hip extension.' }),
      node('genitofemoral', 'collateral', 'lum', 'Genitofemoral', { name: 'Genitofemoral nerve', roots: 'L1–L2', nerve: 'genitofemoral', motor: 'Cremaster muscle (genital branch); no other muscles.', sensory: 'Femoral branch: skin over the femoral triangle (afferent limb of the cremasteric reflex); genital branch: scrotum/labia majora.', injury: 'Pierces psoas major: injured in psoas surgery, inguinal hernia repair, retroperitoneal masses.', sign: 'Absent cremasteric reflex (stroke the upper medial thigh: testis fails to rise); anterior upper-thigh numbness.' }),
      node('lateral-femoral-cutaneous', 'collateral', 'lum', ['Lat. femoral', 'cutaneous'], { name: 'Lateral femoral cutaneous nerve', roots: 'L2–L3', nerve: 'lateral-femoral-cutaneous', sensory: 'Skin of the anterolateral thigh down to the knee. Purely sensory.', injury: 'Entrapment under or through the inguinal ligament next to the ASIS: tight belts, obesity, pregnancy, diabetes, prolonged hip extension (prone surgery).', sign: 'Meralgia paraesthetica: burning, tingling and numbness over the anterolateral thigh without weakness.' }),
      node('femoral', 'collateral', 'lum', 'Femoral', { name: 'Femoral nerve', roots: 'L2–L4', nerve: 'femoral', sensory: 'Anterior and medial thigh (anterior cutaneous branches) and, via the saphenous nerve, the medial leg and foot.', injury: 'Retroperitoneal haematoma (anticoagulants), pelvic or hip surgery with retractors, femoral artery catheterisation, diabetic amyotrophy, gunshot.', sign: 'Quadriceps weakness: the knee buckles on walking down stairs; absent patellar reflex.' }),
      node('saphenous', 'collateral', 'lum', 'Saphenous', { name: 'Saphenous nerve', roots: 'L3–L4', nerve: 'saphenous', sensory: 'Medial leg and medial border of the foot to the ball of the great toe.', injury: 'Adductor canal compression, harvesting or stripping of the great saphenous vein, knee surgery (infrapatellar branch).', sign: 'Medial leg numbness or neuralgia; no weakness.' }),
      node('obturator', 'collateral', 'lum', 'Obturator', { name: 'Obturator nerve', roots: 'L2–L4', nerve: 'obturator', sensory: 'Small area on the medial mid-thigh (cutaneous branch of the anterior division).', injury: 'Pelvic side-wall surgery or lymphadenectomy, obturator hernia (Howship–Romberg sign: pain on the medial thigh), pelvic fracture, difficult labour, endometriosis.', sign: 'Weak adduction: cannot cross one leg over the other; abducted, circumducting gait.' }),

      node('superior-gluteal', 'collateral', 'sac', ['Superior', 'gluteal'], { name: 'Superior gluteal nerve', roots: 'L4–S1', nerve: 'superior-gluteal', sensory: 'None (motor only).', injury: 'Misplaced gluteal injection (inferior or medial to the safe upper outer quadrant), posterior approach to the hip, acetabular fracture, L5 radiculopathy.', sign: 'Trendelenburg sign: when standing on the affected leg the pelvis drops on the opposite side; waddling gait if bilateral.' }),
      node('inferior-gluteal', 'collateral', 'sac', ['Inferior', 'gluteal'], { name: 'Inferior gluteal nerve', roots: 'L5–S2', nerve: 'inferior-gluteal', sensory: 'None (motor only).', injury: 'Posterior hip surgery, buttock trauma, deep gluteal compression.', sign: 'Gluteus maximus gait: backward lurch of the trunk at heel strike; difficulty rising from a chair and climbing stairs.' }),
      node('n-piriformis', 'collateral', 'sac', ['N. to', 'piriformis'], { name: 'Nerve to piriformis', roots: 'S1–S2', nerve: 'n-piriformis', sensory: 'None.', injury: 'Not usually injured alone.', sign: 'No clinical deficit (other lateral rotators compensate).' }),
      node('n-obturator-internus', 'collateral', 'sac', ['N. to obturator', 'internus'], { name: 'Nerve to obturator internus', roots: 'L5–S2', nerve: 'n-obturator-internus', sensory: 'None.', injury: 'Pelvic surgery; not usually injured alone.', sign: 'Weak lateral rotation (rarely noticed).' }),
      node('n-quadratus-femoris', 'collateral', 'sac', ['N. to quadratus', 'femoris'], { name: 'Nerve to quadratus femoris', roots: 'L4–S1', nerve: 'n-quadratus-femoris', sensory: 'None (motor; also an articular branch to the hip).', injury: 'Posterior hip surgery.', sign: 'Weak lateral rotation (rarely noticed).' }),
      node('posterior-femoral-cutaneous', 'collateral', 'sac', ['Post. femoral', 'cutaneous'], { name: 'Posterior femoral cutaneous nerve', roots: 'S1–S3', nerve: 'posterior-femoral-cutaneous', sensory: 'Posterior thigh, popliteal fossa, perineum (perineal branches) and inferior buttock (inferior clunial nerves).', injury: 'Deep gluteal compression, posterior hip dislocation, prolonged sitting, injection.', sign: 'Numbness of the back of the thigh and perineum; pain on sitting.' }),
      node('pudendal', 'collateral', 'sac', 'Pudendal', { name: 'Pudendal nerve', roots: 'S2–S4', nerve: 'pudendal', sensory: 'Perineum and external genitalia (dorsal nerve of the penis/clitoris, posterior scrotal/labial nerves, inferior rectal nerve).', injury: 'Prolonged or instrumental labour, cycling, pelvic fracture, entrapment at the ischial spine or in Alcock’s canal. Pudendal block: needle directed at the ischial spine.', sign: 'Perineal numbness or pain worse on sitting (pudendal neuralgia); faecal and urinary incontinence; loss of the anal wink.' }),
      node('sciatic', 'collateral', 'sci', 'Sciatic', { name: 'Sciatic nerve', roots: 'L4–S3', nerve: 'sciatic', sensory: 'None directly; its branches supply the posterolateral leg and the foot.', injury: 'Posterior hip dislocation or acetabular fracture, hip replacement, deep gluteal injection (inferior medial quadrant), piriformis syndrome, hamstring avulsion.', sign: 'Flail foot with weak knee flexion; the common fibular division is more vulnerable and often more severely affected.' }),
      node('tibial', 'collateral', 'sci', 'Tibial', { name: 'Tibial nerve', roots: 'L4–S3', nerve: 'tibial', sensory: 'Posterior leg and sural territory (lateral foot), heel (medial calcaneal) and the sole (medial and lateral plantar nerves).', injury: 'Popliteal fossa trauma or Baker cyst, knee dislocation, tarsal tunnel syndrome behind the medial malleolus (plantar branches only).', sign: 'Cannot plantarflex or invert; cannot stand on tiptoe; claw toes, loss of sole sensation with trophic ulcers; absent ankle jerk.' }),
      node('common-fibular', 'collateral', 'sci', ['Common', 'fibular'], { name: 'Common fibular (peroneal) nerve', roots: 'L4–S2', nerve: 'common-fibular', sensory: 'Lateral cutaneous nerve of the calf (upper lateral leg); its branches supply the lower lateral leg and dorsum of the foot.', injury: 'Fracture of the fibular neck, knee dislocation, tight plaster cast, leg crossing, prolonged lithotomy or bedrest, rapid weight loss.', sign: 'Foot drop with steppage gait; loss of eversion and toe extension; inversion is preserved.' }),
      node('medial-plantar', 'collateral', 'sci', ['Medial', 'plantar'], { name: 'Medial plantar nerve', roots: 'S1–S3', nerve: 'medial-plantar', sensory: 'Medial two-thirds of the sole and medial 3½ toes.', injury: 'Tarsal tunnel syndrome, jogger’s foot (entrapment at the knot of Henry).', sign: 'Burning pain in the medial sole; weak great-toe flexion/abduction.' }),
      node('lateral-plantar', 'collateral', 'sci', ['Lateral', 'plantar'], { name: 'Lateral plantar nerve', roots: 'S1–S3', nerve: 'lateral-plantar', sensory: 'Lateral third of the sole and lateral 1½ toes.', injury: 'Tarsal tunnel syndrome, Baxter’s nerve entrapment (heel pain).', sign: 'Lateral sole numbness; clawing of the toes from intrinsic muscle weakness.' }),
      node('superficial-fibular', 'collateral', 'sci', ['Superficial', 'fibular'], { name: 'Superficial fibular nerve', roots: 'L5–S2', nerve: 'superficial-fibular', sensory: 'Lower lateral leg and most of the dorsum of the foot (except the first web space).', injury: 'Ankle inversion sprains, fascial hernia of the lateral compartment, fibular neck fracture.', sign: 'Weak eversion; numbness of the dorsum of the foot.' }),
      node('deep-fibular', 'collateral', 'sci', ['Deep', 'fibular'], { name: 'Deep fibular nerve', roots: 'L4–S1', nerve: 'deep-fibular', sensory: 'Skin of the first web space between the great and second toes only.', injury: 'Anterior compartment syndrome, anterior tarsal tunnel syndrome (beneath the extensor retinaculum), tight shoe laces, fibular neck fracture.', sign: 'Foot drop and toe extension weakness; numbness confined to the first web space.' })
    ],
    edges: [
      't12>iliohypogastric', 'l1>iliohypogastric', 'l1>ilioinguinal',
      'l1>lad', 'l2>lad', 'l3>lad', 'l4>lad', 'l2>lpd', 'l3>lpd', 'l4>lpd',
      'lad>genitofemoral', 'lad>obturator', 'lpd>lateral-femoral-cutaneous', 'lpd>femoral', 'femoral>saphenous',
      'l4>lst', 'l5>lst', 'lst>sad', 'lst>spd',
      's1>sad', 's2>sad', 's3>sad', 's4>sad', 's1>spd', 's2>spd', 's3>spd',
      'spd>superior-gluteal', 'spd>inferior-gluteal', 'spd>n-piriformis', 'spd>posterior-femoral-cutaneous', 'sad>posterior-femoral-cutaneous',
      'sad>n-obturator-internus', 'sad>n-quadratus-femoris', 'sad>pudendal',
      'sad>sciatic', 'spd>sciatic', 'sciatic>tibial', 'sciatic>common-fibular',
      'tibial>medial-plantar', 'tibial>lateral-plantar', 'common-fibular>superficial-fibular', 'common-fibular>deep-fibular'
    ],
    layouts: {
      wide: { vb: [700, 650], font: 13, pos: {
        t12: [34, 30, 40, 28], l1: [34, 70, 40, 28], l2: [34, 110, 40, 28], l3: [34, 150, 40, 28], l4: [34, 196, 40, 28], l5: [34, 256, 40, 28], s1: [34, 320, 40, 28], s2: [34, 362, 40, 28], s3: [34, 404, 40, 28], s4: [34, 446, 40, 28],
        lad: [128, 128, 100, 40], lpd: [128, 196, 100, 40], lst: [128, 262, 100, 40], spd: [128, 336, 100, 40], sad: [128, 458, 100, 40],
        iliohypogastric: [275, 30, 130, 28], ilioinguinal: [275, 66, 130, 28], genitofemoral: [275, 102, 130, 28], 'lateral-femoral-cutaneous': [275, 142, 130, 34], femoral: [275, 182, 130, 28], obturator: [275, 218, 130, 28],
        'superior-gluteal': [275, 272, 130, 34], 'inferior-gluteal': [275, 312, 130, 34], 'n-piriformis': [275, 352, 130, 34], 'n-obturator-internus': [275, 394, 130, 36], 'n-quadratus-femoris': [275, 436, 130, 36], 'posterior-femoral-cutaneous': [275, 478, 130, 36], pudendal: [275, 516, 130, 28], sciatic: [275, 566, 130, 32],
        saphenous: [431, 182, 118, 28], tibial: [431, 536, 118, 30], 'common-fibular': [431, 596, 118, 34],
        'medial-plantar': [610, 502, 140, 34], 'lateral-plantar': [610, 544, 140, 34], 'superficial-fibular': [610, 590, 140, 34], 'deep-fibular': [610, 630, 140, 34]
      }, heads: [[34, 'Roots'], [128, 'Divisions'], [275, 'Branches']], headY: 0 },
      narrow: { vb: [380, 650], font: 10.5, pos: {
        t12: [17, 30, 26, 26], l1: [17, 70, 26, 26], l2: [17, 110, 26, 26], l3: [17, 150, 26, 26], l4: [17, 196, 26, 26], l5: [17, 256, 26, 26], s1: [17, 320, 26, 26], s2: [17, 362, 26, 26], s3: [17, 404, 26, 26], s4: [17, 446, 26, 26],
        lad: [66, 128, 50, 38], lpd: [66, 196, 50, 38], lst: [66, 262, 50, 38], spd: [66, 336, 50, 38], sad: [66, 458, 50, 38],
        iliohypogastric: [160, 30, 88, 26], ilioinguinal: [160, 66, 88, 26], genitofemoral: [160, 102, 88, 26], 'lateral-femoral-cutaneous': [160, 142, 88, 32], femoral: [160, 182, 88, 26], obturator: [160, 218, 88, 26],
        'superior-gluteal': [160, 272, 88, 32], 'inferior-gluteal': [160, 312, 88, 32], 'n-piriformis': [160, 352, 88, 32], 'n-obturator-internus': [160, 394, 88, 34], 'n-quadratus-femoris': [160, 436, 88, 34], 'posterior-femoral-cutaneous': [160, 478, 88, 34], pudendal: [160, 516, 88, 26], sciatic: [160, 566, 88, 30],
        saphenous: [254, 182, 70, 26], tibial: [254, 536, 70, 28], 'common-fibular': [254, 596, 70, 32],
        'medial-plantar': [334, 502, 72, 32], 'lateral-plantar': [334, 544, 72, 32], 'superficial-fibular': [334, 590, 72, 32], 'deep-fibular': [334, 630, 72, 32]
      }, lanes: {}, heads: [[17, 'Roots'], [66, 'Div.'], [160, 'Branches']], headY: 0 }
    },
    lesions: [
      { id: 'foot-drop', name: 'Common fibular nerve at the fibular neck (foot drop)', short: 'Foot drop (common fibular)', sites: ['common-fibular'], affected: ['superficial-fibular', 'deep-fibular'], partial: [],
        mechanism: 'Fibular-neck fracture, knee dislocation, tight plaster cast or stocking, habitual leg-crossing, prolonged lithotomy or bed rest, rapid weight loss.',
        muscles: ['tibialis-anterior', 'extensor-hallucis-longus', 'extensor-digitorum-longus', 'fibularis-tertius', 'fibularis-longus', 'fibularis-brevis', 'extensor-digitorum-brevis'],
        sensory: 'Lateral lower leg and dorsum of the foot (superficial fibular); first web space (deep fibular).',
        sign: 'Foot drop with high-stepping (steppage) gait: the toes drag; weak dorsiflexion and eversion. Inversion (tibialis posterior) and plantarflexion are preserved.',
        spared: 'Short head of biceps femoris is supplied proximal to the fibular neck and is usually preserved; tibial-nerve muscles are normal.' },
      { id: 'trendelenburg', name: 'Superior gluteal nerve injury (positive Trendelenburg sign)', short: 'Trendelenburg (superior gluteal)', sites: ['superior-gluteal'], affected: [], partial: [],
        mechanism: 'Misplaced gluteal injection, posterior or lateral approach to the hip, acetabular or pelvic fracture, or an L5 radiculopathy.',
        muscles: ['gluteus-medius', 'gluteus-minimus', 'tensor-fasciae-latae'],
        sensory: 'None (a purely motor nerve).',
        sign: 'Positive Trendelenburg sign: standing on the affected leg, the pelvis drops on the opposite (unsupported) side. The patient may lurch the trunk toward the affected side to compensate; a bilateral lesion gives a waddling gait.',
        spared: 'Gluteus maximus (inferior gluteal nerve) so hip extension is normal.' },
      { id: 'inferior-gluteal', name: 'Inferior gluteal nerve injury', short: 'Inferior gluteal', sites: ['inferior-gluteal'], affected: [], partial: [],
        mechanism: 'Posterior hip surgery or dislocation, deep gluteal trauma.',
        muscles: ['gluteus-maximus'],
        sensory: 'None.',
        sign: 'Gluteus maximus gait: the trunk is thrown backward at heel strike; difficulty rising from a chair, climbing stairs and running.',
        spared: 'Hip abduction (superior gluteal nerve) and Trendelenburg sign are normal.' },
      { id: 'meralgia', name: 'Lateral femoral cutaneous nerve entrapment (meralgia paraesthetica)', short: 'Meralgia paraesthetica', sites: ['lateral-femoral-cutaneous'], affected: [], partial: [],
        mechanism: 'Entrapment where it passes under or through the inguinal ligament near the ASIS: tight belts or trousers, obesity, pregnancy, diabetes, prolonged hip extension.',
        muscles: [],
        sensory: 'Burning, tingling and numbness of the anterolateral thigh down to the knee.',
        sign: 'Pure sensory syndrome: no weakness and a normal knee jerk; symptoms are worse standing and walking, relieved by sitting; tenderness medial to the ASIS.',
        spared: 'All muscles; sensation of the anteromedial thigh (femoral nerve).' },
      { id: 'femoral', name: 'Femoral nerve injury', short: 'Femoral', sites: ['femoral'], affected: ['saphenous'], partial: [],
        mechanism: 'Retroperitoneal (iliacus/psoas) haematoma in an anticoagulated patient, pelvic or hip surgery with retractors, femoral artery catheterisation, diabetic amyotrophy, gunshot wounds.',
        muscles: ['iliacus', 'sartorius', 'pectineus', 'rectus-femoris', 'vastus-lateralis', 'vastus-medialis', 'vastus-intermedius'],
        sensory: 'Anterior thigh and, through the saphenous nerve, the medial leg and foot.',
        sign: 'Weak knee extension: the knee buckles when walking downstairs or on ascent; wasted quadriceps; absent patellar (knee) reflex (L3–L4). Hip flexion is weakened but preserved by psoas major.',
        spared: 'Hip adduction (obturator) and psoas major.' },
      { id: 'obturator', name: 'Obturator nerve injury', short: 'Obturator', sites: ['obturator'], affected: [], partial: [],
        mechanism: 'Pelvic side-wall surgery or lymphadenectomy, obturator hernia, pelvic fracture, difficult labour, endometriosis.',
        muscles: ['adductor-longus', 'adductor-brevis', 'adductor-magnus', 'gracilis', 'obturator-externus'],
        sensory: 'Small patch on the medial mid-thigh (may be absent).',
        sign: 'Weak adduction: cannot cross one leg over the other; the thigh drifts into abduction and the gait circumducts. Obturator hernia: pain down the medial thigh (Howship–Romberg sign).',
        spared: 'Hip flexion and knee extension (femoral nerve); hamstring part of adductor magnus (tibial nerve).' },
      { id: 'sciatic', name: 'Sciatic nerve injury (e.g. posterior hip dislocation)', short: 'Sciatic', sites: ['sciatic'], affected: ['tibial', 'common-fibular', 'medial-plantar', 'lateral-plantar', 'superficial-fibular', 'deep-fibular'], partial: [],
        mechanism: 'Posterior hip dislocation or acetabular fracture, total hip arthroplasty, deep gluteal injection into the lower medial buttock, piriformis syndrome.',
        muscles: ['biceps-femoris-long', 'biceps-femoris-short', 'semitendinosus', 'semimembranosus', 'tibialis-anterior', 'extensor-hallucis-longus', 'extensor-digitorum-longus', 'fibularis-longus', 'fibularis-brevis', 'gastrocnemius', 'soleus', 'tibialis-posterior', 'flexor-digitorum-longus', 'flexor-hallucis-longus', 'abductor-hallucis', 'flexor-digitorum-brevis'],
        sensory: 'Posterolateral leg and the whole foot except the medial strip (saphenous nerve).',
        sign: 'Flail foot (no active movement below the knee), weak knee flexion, absent ankle jerk; high lesions spare the hip adductors and extensors of the knee. The common fibular division is usually the worse affected: foot drop dominates.',
        spared: 'Quadriceps (femoral), adductors (obturator), gluteal muscles, and the saphenous territory.' },
      { id: 'tibial', name: 'Tibial nerve injury (popliteal fossa)', short: 'Tibial', sites: ['tibial'], affected: ['medial-plantar', 'lateral-plantar'], partial: [],
        mechanism: 'Popliteal fossa trauma, knee dislocation, Baker cyst or popliteal aneurysm. Tarsal tunnel syndrome affects only the plantar branches.',
        muscles: ['gastrocnemius', 'soleus', 'plantaris', 'popliteus', 'tibialis-posterior', 'flexor-digitorum-longus', 'flexor-hallucis-longus', 'abductor-hallucis', 'flexor-digitorum-brevis', 'flexor-hallucis-brevis', 'abductor-digiti-minimi-foot', 'quadratus-plantae'],
        sensory: 'Sole of the foot and the posterior calf/lateral foot (via sural nerve).',
        sign: 'Cannot plantarflex or invert the foot or stand on tiptoe; the foot is held dorsiflexed and everted (calcaneovalgus); clawing of the toes; absent ankle jerk; insensitive sole with risk of ulceration.',
        spared: 'Dorsiflexion, eversion and toe extension (fibular nerves).' },
      { id: 'ilioinguinal', name: 'Ilioinguinal / iliohypogastric nerve injury', short: 'Ilioinguinal / iliohypogastric', sites: ['ilioinguinal', 'iliohypogastric'], affected: [], partial: [],
        mechanism: 'Inguinal hernia repair, appendicectomy or Pfannenstiel (low transverse) incision, mesh entrapment, TAP block.',
        muscles: ['internal-oblique', 'transversus-abdominis'],
        sensory: 'Upper medial thigh, groin, root of the penis and anterior scrotum (or mons pubis and labia majora), suprapubic skin and the skin over the iliac crest.',
        sign: 'Burning or numb groin after surgery, worse on hip extension; denervation of the lower fibres of internal oblique and transversus weakens the inguinal canal roof and predisposes to a direct inguinal hernia.',
        spared: 'Limb strength.' },
      { id: 'pudendal', name: 'Pudendal nerve injury', short: 'Pudendal', sites: ['pudendal'], affected: [], partial: [],
        mechanism: 'Prolonged or instrumental labour, cycling, ischial spine entrapment, pelvic fracture, sacrospinous ligament fixation.',
        muscles: ['external-anal-sphincter'],
        sensory: 'Perineum, penis/clitoris, scrotum/labia and perianal skin.',
        sign: 'Perineal numbness; faecal and stress urinary incontinence from sphincter weakness; loss of the anal wink; pain worse sitting (pudendal neuralgia, Alcock canal syndrome).',
        spared: 'Limb function.' },
      { id: 'l5', name: 'L5 radiculopathy (differential of foot drop)', short: 'L5 radiculopathy', sites: ['l5'], affected: ['lst', 'sad', 'spd'], partial: [],
        mechanism: 'L4/L5 disc herniation (the commonest cause), lateral recess stenosis; also lumbosacral trunk injury.',
        muscles: ['tibialis-anterior', 'extensor-hallucis-longus', 'extensor-digitorum-longus', 'gluteus-medius', 'tibialis-posterior', 'fibularis-longus', 'fibularis-brevis'],
        sensory: 'Lateral leg and dorsum of the foot including the great toe (L5 dermatome); back and sciatic-type leg pain.',
        sign: 'Foot drop with weak inversion (tibialis posterior) and weak hip abduction (Trendelenburg): features that distinguish it from a common fibular palsy. Positive straight-leg raise; no reflex change (there is no L5 tendon reflex).',
        spared: 'Plantarflexion (S1) and knee extension (L3–L4).' }
    ]
  };

  /* ====================================================================
     CRANIAL NERVES
     Sources: Moore COA; Gray’s Anatomy for Students; Blumenfeld, Neuroanatomy through
     Clinical Cases; Bates’ Guide to Physical Examination (cranial nerve exam).
     ==================================================================== */
  var cranial = [
    { n: 1, numeral: 'I', id: 'cn-i', name: 'Olfactory', modality: 'Sensory', components: 'Special visceral afferent (smell)',
      nuclei: 'Olfactory epithelium (bipolar receptor neurons) project to the olfactory bulb (mitral cells), then via the olfactory tract to the piriform cortex and amygdala. The only sensory pathway that reaches the cortex without a thalamic relay.',
      exit: 'Not a brainstem nerve: about 20 filaments leave the olfactory epithelium and enter the olfactory bulb (forebrain) beneath the frontal lobe.',
      foramen: 'Cribriform plate of the ethmoid bone', branches: 'Olfactory filaments (fila olfactoria) only.',
      functions: ['Smell (olfaction); contributes to flavour perception'],
      test: 'Occlude one nostril and test the other with a familiar, non-irritating scent (coffee, soap, cloves) with the eyes closed. Avoid ammonia, which stimulates CN V.',
      lesion: 'Anosmia (loss), hyposmia (reduced), parosmia (distorted smell); the patient often complains of lost taste (flavour).',
      causes: 'Viral upper respiratory infection (including COVID-19) is the commonest cause; head trauma (shearing of filaments at the cribriform plate, with CSF rhinorrhoea); olfactory groove meningioma (Foster Kennedy syndrome); early Parkinson and Alzheimer disease; Kallmann syndrome; smoking; nasal polyps (conductive).',
      pearls: 'Shearing of the filaments in a frontal head injury can cause anosmia and a CSF leak from the nose.' },
    { n: 2, numeral: 'II', id: 'cn-ii', name: 'Optic', modality: 'Sensory', components: 'Special somatic afferent (vision)',
      nuclei: 'Retinal ganglion cell axons pass through the optic chiasm to the lateral geniculate nucleus of the thalamus, then optic radiations to the primary visual cortex (occipital lobe). Pretectal nuclei and superior colliculus receive collaterals (pupillary light reflex, saccades).',
      exit: 'Diencephalic: an outgrowth of the brain rather than a peripheral nerve; the retina to optic nerve to chiasm (above the pituitary) to optic tract to the lateral geniculate nucleus.',
      foramen: 'Optic canal (lesser wing of the sphenoid), with the ophthalmic artery', branches: 'None (optic nerve, chiasm, tract, radiation).',
      functions: ['Vision (acuity, colour, visual fields)', 'Afferent limb of the pupillary light reflex'],
      test: 'Visual acuity (Snellen chart), colour vision (Ishihara), visual fields to confrontation, pupillary light reflex (swinging-flashlight test for a relative afferent pupillary defect), fundoscopy for the optic disc.',
      lesion: 'Optic nerve: monocular visual loss with a relative afferent pupillary defect (Marcus Gunn pupil) and reduced colour vision. Chiasm: bitemporal hemianopia. Optic tract or radiation: contralateral homonymous hemianopia (optic radiation temporal fibres: upper quadrantanopia, "pie in the sky"; parietal: lower).',
      causes: 'Optic neuritis (multiple sclerosis), ischaemic optic neuropathy (including giant cell arteritis), glaucoma, compression by pituitary adenoma or craniopharyngioma (chiasm), trauma, papilloedema in raised intracranial pressure (disc swelling), toxic or nutritional neuropathy.',
      pearls: 'The optic nerve is invested by meninges and CSF, so raised intracranial pressure causes papilloedema.' },
    { n: 3, numeral: 'III', id: 'cn-iii', name: 'Oculomotor', modality: 'Motor', components: 'General somatic efferent (extra-ocular muscles, levator palpebrae) and general visceral efferent (parasympathetic: sphincter pupillae, ciliary muscle)',
      nuclei: 'Oculomotor nucleus (midbrain, at the level of the superior colliculus); Edinger–Westphal nucleus (parasympathetic; relay in the ciliary ganglion).',
      exit: 'Ventral midbrain: interpeduncular fossa, between the cerebral peduncles.',
      foramen: 'Superior orbital fissure (through the common tendinous ring)',
      branches: 'Superior division: superior rectus and levator palpebrae superioris. Inferior division: medial rectus, inferior rectus, inferior oblique, and the parasympathetic root to the ciliary ganglion.',
      functions: ['Moves the eye up, down and in (all extra-ocular muscles except lateral rectus and superior oblique)', 'Elevates the upper eyelid', 'Pupillary constriction and accommodation (parasympathetic)'],
      test: 'Follow a target in an "H" pattern, look for ptosis, check pupil size and direct/consensual light reflexes and the accommodation response.',
      lesion: 'Complete palsy: eye "down and out" (unopposed lateral rectus and superior oblique), complete ptosis, dilated non-reactive pupil, and diplopia. Pupil-sparing palsy suggests ischaemia of the nerve trunk (diabetes, hypertension) rather than compression, because the parasympathetic fibres run superficially.',
      causes: 'Posterior communicating artery aneurysm (painful, pupil involved), uncal herniation from raised intracranial pressure, diabetic or hypertensive microvascular infarction, cavernous sinus lesions, midbrain stroke (Weber syndrome: ipsilateral CN III palsy with contralateral hemiparesis), trauma, multiple sclerosis.',
      pearls: 'A dilated pupil with ptosis and a "down and out" eye in a patient with headache is a posterior communicating artery aneurysm until proven otherwise.' },
    { n: 4, numeral: 'IV', id: 'cn-iv', name: 'Trochlear', modality: 'Motor', components: 'General somatic efferent (superior oblique)',
      nuclei: 'Trochlear nucleus (midbrain, at the level of the inferior colliculus). Fibres decussate before leaving, so each nerve supplies the contralateral superior oblique.',
      exit: 'Dorsal midbrain, just below the inferior colliculus: the only cranial nerve to leave the dorsal brainstem. It has the longest intracranial course and curves around the cerebral peduncle.',
      foramen: 'Superior orbital fissure (outside the common tendinous ring)', branches: 'None; supplies the superior oblique only.',
      functions: ['Depresses the adducted eye (looking down and in, e.g. reading or going down stairs) and intorts the eye'],
      test: 'Ask the patient to look down and in; check for vertical or torsional diplopia and head tilt. In the Bielschowsky head-tilt test the vertical deviation increases when the head tilts toward the affected side.',
      lesion: 'Vertical (oblique) diplopia worse on looking down and inward; the affected eye is slightly elevated (hypertropia) and extorted; the patient tilts the head away from the lesion to compensate.',
      causes: 'Head trauma (the thin, long nerve is stretched against the tentorial edge; the commonest cause, frequently bilateral after severe trauma), microvascular (diabetes), congenital palsy, tumour, raised intracranial pressure, cavernous sinus lesions.',
      pearls: '"SO4 LR6 and the rest are 3": superior oblique = CN IV, lateral rectus = CN VI, all others = CN III.' },
    { n: 5, numeral: 'V', id: 'cn-v', name: 'Trigeminal', modality: 'Both (mixed)', components: 'General somatic afferent (face, scalp, cornea, mucosa, dura) and special visceral efferent (muscles of the first pharyngeal arch)',
      nuclei: 'Sensory: mesencephalic (proprioception, jaw jerk), principal sensory (pons; fine touch) and spinal trigeminal (pain and temperature, extends from pons to C2–C3). Motor: trigeminal motor nucleus (mid-pons).',
      exit: 'Lateral pons: a large sensory root and a smaller motor root (the motor root passes with V3 only).',
      foramen: 'V1: superior orbital fissure; V2: foramen rotundum; V3: foramen ovale',
      branches: 'V1 ophthalmic (frontal: supraorbital and supratrochlear; lacrimal; nasociliary). V2 maxillary (zygomatic, infraorbital, greater and lesser palatine, nasopalatine, superior alveolar). V3 mandibular (auriculotemporal, lingual, inferior alveolar and mental, buccal; motor: masseteric, deep temporal, pterygoid nerves, nerve to mylohyoid).',
      functions: ['Sensation of the face, scalp (anterior to the vertex), cornea, nasal and oral mucosa, anterior two-thirds of the tongue (general sensation), teeth, and dura of the anterior and middle cranial fossae', 'Motor: mastication (masseter, temporalis, medial and lateral pterygoids), mylohyoid, anterior belly of digastric, tensor tympani, tensor veli palatini'],
      test: 'Light touch and pinprick over the forehead, cheek and jaw (compare sides); corneal reflex (afferent V1, efferent VII); clench teeth and palpate masseters/temporalis; open the mouth against resistance (jaw deviates toward the weak side); jaw jerk.',
      lesion: 'Facial numbness in the distribution of the division involved, absent corneal reflex, wasting and weakness of mastication with jaw deviation to the side of the lesion on opening, and loss of the jaw jerk (or exaggerated jerk with upper motor neurone lesions above the pons).',
      causes: 'Trigeminal neuralgia (paroxysms of lancinating pain in V2/V3, triggered by touch or chewing; vascular compression by the superior cerebellar artery or multiple sclerosis), herpes zoster ophthalmicus (V1; Hutchinson sign on the nose tip), cerebellopontine angle tumours (corneal reflex lost early), cavernous sinus lesions (V1/V2 with III, IV, VI), lateral medullary stroke (ipsilateral facial pain and temperature loss), trauma.',
      pearls: 'The only cranial nerve whose divisions leave the skull through three separate foramina in a row: "Standing Room Only" (SRO): Superior orbital fissure, foramen Rotundum, foramen Ovale.' },
    { n: 6, numeral: 'VI', id: 'cn-vi', name: 'Abducens', modality: 'Motor', components: 'General somatic efferent (lateral rectus)',
      nuclei: 'Abducens nucleus (caudal pons, in the floor of the fourth ventricle at the facial colliculus; facial nerve fibres loop around it).',
      exit: 'Pontomedullary junction, medially (between the pons and the pyramid of the medulla).',
      foramen: 'Superior orbital fissure (through the common tendinous ring)', branches: 'None. Long subarachnoid course, climbs the clivus and passes through Dorello’s canal to the cavernous sinus, adjacent to the internal carotid artery.',
      functions: ['Abducts the eye (lateral rectus)'],
      test: 'Look laterally; the failing eye cannot abduct. Check for horizontal diplopia worse on looking toward the affected side and at distance.',
      lesion: 'Horizontal diplopia, eye cannot abduct, convergent squint (esotropia) at rest; patient turns the head toward the affected side to reduce diplopia.',
      causes: 'Raised intracranial pressure (a false-localising sign because of its long course), microvascular (diabetes, hypertension), cavernous sinus lesions or internal carotid aneurysm, petrous apex infection (Gradenigo syndrome), pontine stroke or Millard–Gubler syndrome, multiple sclerosis, Wernicke encephalopathy, trauma.',
      pearls: 'Internuclear ophthalmoplegia (medial longitudinal fasciculus lesion) differs: failure of adduction of the ipsilateral eye with nystagmus of the abducting eye.' },
    { n: 7, numeral: 'VII', id: 'cn-vii', name: 'Facial', modality: 'Both (mixed)', components: 'Special visceral efferent (muscles of facial expression, stapedius, stylohyoid, posterior belly of digastric), general visceral efferent (lacrimal, submandibular, sublingual, nasal glands), special visceral afferent (taste, anterior two-thirds of tongue) and general somatic afferent (small area of the external ear)',
      nuclei: 'Facial motor nucleus (caudal pons); superior salivatory nucleus (parasympathetic); nucleus of the solitary tract (taste); spinal trigeminal nucleus (ear sensation).',
      exit: 'Pontomedullary junction (cerebellopontine angle), lateral to the abducens nerve and medial to the vestibulocochlear nerve; the nervus intermedius (sensory/parasympathetic) lies between VII and VIII.',
      foramen: 'Internal acoustic meatus, then the facial canal; exits the skull through the stylomastoid foramen',
      branches: 'In the facial canal: greater petrosal nerve (lacrimation), nerve to stapedius, chorda tympani (taste, submandibular and sublingual glands). At the stylomastoid foramen: posterior auricular nerve and nerves to the posterior belly of digastric and stylohyoid. In the parotid: temporal, zygomatic, buccal, marginal mandibular and cervical branches ("To Zanzibar By Motor Car").',
      functions: ['Facial expression, eyelid closure, buccinator, platysma, stapedius', 'Taste from the anterior two-thirds of the tongue (chorda tympani)', 'Lacrimation and salivation (submandibular, sublingual glands)'],
      test: 'Inspect symmetry at rest; raise the eyebrows, screw the eyes tightly shut against resistance, show the teeth, puff out the cheeks, whistle. Ask about hyperacusis and altered taste; test lacrimation if relevant.',
      lesion: 'Lower motor neurone (nuclear or peripheral) lesion: weakness of the whole ipsilateral face including the forehead, inability to close the eye (Bell phenomenon: eye rolls up), loss of the nasolabial fold, drooping mouth; may include hyperacusis, loss of taste, and reduced tearing depending on the level. Upper motor neurone lesion: contralateral lower face weak with forehead sparing (bilateral cortical input to the upper face).',
      causes: 'Bell palsy (acute idiopathic LMN palsy; HSV reactivation is implicated), Ramsay Hunt syndrome (varicella zoster with ear vesicles), Lyme disease, parotid tumour or surgery, otitis media and cholesteatoma, temporal bone fracture, cerebellopontine angle tumour (vestibular schwannoma), Guillain–Barré syndrome (bilateral), sarcoidosis, pontine stroke.',
      pearls: 'Protect the cornea in any facial palsy with lubricant and eye closure; the forehead is spared in an upper motor neurone lesion.' },
    { n: 8, numeral: 'VIII', id: 'cn-viii', name: 'Vestibulocochlear', modality: 'Sensory', components: 'Special somatic afferent (hearing and balance)',
      nuclei: 'Cochlear nuclei (dorsal and ventral) then bilateral central auditory pathways via the superior olivary complex, lateral lemniscus, inferior colliculus and medial geniculate body to the primary auditory cortex (Heschl gyrus). Vestibular nuclei (superior, medial, lateral, inferior) at the pontomedullary junction connect to the cerebellum, medial longitudinal fasciculus and vestibulospinal tracts.',
      exit: 'Pontomedullary junction (cerebellopontine angle), lateral to the facial nerve.',
      foramen: 'Internal acoustic meatus (with the facial nerve and labyrinthine artery)', branches: 'Cochlear nerve (hearing) and vestibular nerve (balance; superior and inferior divisions).',
      functions: ['Hearing', 'Balance and head position; vestibulo-ocular reflex'],
      test: 'Whispered voice or finger rub; Rinne (air conduction normally exceeds bone conduction) and Weber (lateralisation) tuning-fork tests; Dix–Hallpike manoeuvre, head-impulse test, Romberg test and gait for vestibular function.',
      lesion: 'Sensorineural hearing loss (Rinne positive in both ears; Weber lateralises to the better ear), tinnitus, vertigo, nystagmus, imbalance, nausea. Conductive loss shows the Weber lateralised to the affected ear and a negative Rinne.',
      causes: 'Vestibular schwannoma (acoustic neuroma; bilateral in NF2), ototoxic drugs (aminoglycosides, loop diuretics, cisplatin), Ménière disease, vestibular neuritis and labyrinthitis, presbycusis, noise, meningioma at the cerebellopontine angle, multiple sclerosis, anterior inferior cerebellar artery stroke.',
      pearls: 'A unilateral sensorineural hearing loss needs MRI to exclude a vestibular schwannoma.' },
    { n: 9, numeral: 'IX', id: 'cn-ix', name: 'Glossopharyngeal', modality: 'Both (mixed)', components: 'Special visceral efferent (stylopharyngeus), general visceral efferent (parotid via otic ganglion), general visceral afferent (carotid body and sinus), general somatic afferent (pharynx, tonsil, posterior third of tongue, middle ear) and special visceral afferent (taste, posterior third of the tongue)',
      nuclei: 'Nucleus ambiguus (motor), inferior salivatory nucleus (parasympathetic), nucleus of the solitary tract (taste and visceral afferents), spinal trigeminal nucleus.',
      exit: 'Medulla, post-olivary (posterolateral) sulcus, the most rostral of the IX–X–XI group.',
      foramen: 'Jugular foramen (anterior part, with the inferior petrosal sinus)',
      branches: 'Tympanic nerve (of Jacobson; to the lesser petrosal nerve and otic ganglion), carotid sinus nerve (of Hering), pharyngeal, muscular (stylopharyngeus), tonsillar and lingual branches.',
      functions: ['Taste and general sensation from the posterior third of the tongue; sensation of the oropharynx and middle ear', 'Carotid sinus baroreceptors and carotid body chemoreceptors', 'Parotid salivation; stylopharyngeus elevates the pharynx'],
      test: 'Gag reflex (afferent IX, efferent X), swallowing, voice quality; taste rarely tested clinically. Asymmetry of palatal elevation is a vagal sign.',
      lesion: 'Loss of the gag reflex (afferent side), loss of posterior-third taste and oropharyngeal sensation, mild dysphagia; glossopharyngeal neuralgia gives severe paroxysmal throat/ear pain triggered by swallowing and may cause syncope through reflex bradycardia.',
      causes: 'Jugular foramen syndrome (IX, X, XI together), medullary stroke (Wallenberg syndrome), skull base or neck tumours, carotid dissection, tonsillectomy, vascular compression in neuralgia, Eagle syndrome (elongated styloid process), trauma.',
      pearls: 'Stylopharyngeus is the only muscle supplied by the glossopharyngeal nerve.' },
    { n: 10, numeral: 'X', id: 'cn-x', name: 'Vagus', modality: 'Both (mixed)', components: 'Special visceral efferent (pharynx, larynx, palate), general visceral efferent (parasympathetic to thoracic and abdominal viscera as far as the splenic flexure), general visceral afferent, general somatic afferent (external ear canal) and special visceral afferent (epiglottic taste)',
      nuclei: 'Nucleus ambiguus (motor to pharynx and larynx), dorsal motor nucleus of the vagus (parasympathetic), nucleus of the solitary tract (visceral afferents), spinal trigeminal nucleus (ear).',
      exit: 'Medulla, post-olivary sulcus (below IX, above the cranial root of XI).',
      foramen: 'Jugular foramen (with IX and XI), then through the carotid sheath',
      branches: 'Auricular (Arnold), meningeal, pharyngeal plexus, superior laryngeal (internal: sensory above the vocal folds; external: cricothyroid), recurrent laryngeal (all other intrinsic laryngeal muscles; sensory below the vocal folds), cardiac, pulmonary, oesophageal plexus, anterior and posterior vagal trunks.',
      functions: ['Palate elevation, swallowing and phonation (pharyngeal and laryngeal muscles)', 'Parasympathetic: slows the heart, bronchoconstriction, gut motility and secretion', 'Visceral sensation and the afferent limb of the cough reflex'],
      test: 'Ask the patient to say "ahh": the soft palate rises symmetrically and the uvula stays central; assess voice (hoarse or nasal), swallowing, cough. Gag reflex (efferent limb). Laryngoscopy for vocal-fold movement.',
      lesion: 'Unilateral: uvula deviates away from the side of the lesion, soft palate droops, hoarse voice and dysphagia. Recurrent laryngeal injury: hoarseness and breathy voice (unilateral), stridor and airway obstruction (bilateral).',
      causes: 'Thyroid and neck surgery (recurrent laryngeal nerve), left recurrent laryngeal nerve: lung tumour, aortic aneurysm or enlarged mediastinal nodes; jugular foramen lesions; lateral medullary stroke; skull base tumours; Guillain–Barré syndrome; diabetic autonomic neuropathy.',
      pearls: 'The left recurrent laryngeal nerve loops under the aortic arch, the right under the right subclavian artery. All intrinsic laryngeal muscles except cricothyroid are supplied by the recurrent laryngeal nerve.' },
    { n: 11, numeral: 'XI', id: 'spinal-accessory', name: 'Accessory', modality: 'Motor', components: 'Special visceral efferent (sternocleidomastoid and trapezius)',
      nuclei: 'Spinal accessory nucleus in the ventral horn of the upper cervical cord (C1–C5). (The so-called cranial root from the nucleus ambiguus joins the vagus.)',
      exit: 'The spinal roots emerge from the lateral surface of the upper cervical cord (C1–C5), ascend through the foramen magnum, then join and leave via the jugular foramen.',
      foramen: 'Jugular foramen (having entered through the foramen magnum)',
      branches: 'External branch to sternocleidomastoid, then across the posterior triangle to trapezius.',
      functions: ['Sternocleidomastoid: turns the head to the opposite side and tilts it to the same side', 'Trapezius: shrugs and braces the shoulders; helps rotate the scapula for abduction above 90°'],
      test: 'Shrug the shoulders against resistance; turn the head against resistance and palpate the opposite SCM; inspect for shoulder droop and scapular winging.',
      lesion: 'Weak shrug, drooping shoulder with the scapula displaced laterally, difficulty abducting the arm above 90°, and weak head turning to the opposite side. Central lesions: SCM is controlled by the ipsilateral hemisphere, trapezius by the contralateral hemisphere.',
      causes: 'Posterior triangle surgery (lymph node biopsy, cannulation), radical neck dissection, trauma, jugular foramen lesions, motor neurone disease, poliomyelitis, radiotherapy.',
      pearls: 'Passes superficially in the posterior triangle of the neck, a hazard in lymph-node biopsy.' },
    { n: 12, numeral: 'XII', id: 'cn-xii', name: 'Hypoglossal', modality: 'Motor', components: 'General somatic efferent (intrinsic and extrinsic tongue muscles, except palatoglossus)',
      nuclei: 'Hypoglossal nucleus (medulla, hypoglossal trigone in the floor of the fourth ventricle).',
      exit: 'Medulla, pre-olivary sulcus (between the pyramid and the olive).',
      foramen: 'Hypoglossal canal (occipital bone)',
      branches: 'Muscular branches to the tongue muscles; carries C1 fibres to geniohyoid, thyrohyoid and the superior root of the ansa cervicalis.',
      functions: ['Tongue movement for speech, chewing and swallowing (genioglossus protrudes the tongue)'],
      test: 'Inspect the tongue at rest for wasting and fasciculation, ask the patient to protrude it (deviation) and move it side to side; test the strength by pushing against the cheek.',
      lesion: 'Lower motor neurone: ipsilateral wasting and fasciculation, and the protruded tongue deviates toward the side of the lesion (the weak genioglossus cannot push). Upper motor neurone: small, stiff tongue with slow movement; on protrusion it deviates away from the damaged hemisphere (toward the weak side).',
      causes: 'Medial medullary stroke (ipsilateral tongue weakness with contralateral hemiparesis), carotid dissection or endarterectomy, skull base tumours or metastases, motor neurone disease (bulbar), syringobulbia, trauma.',
      pearls: '"Tongue licks its wounds": it points toward the lesion in a lower motor neurone palsy.' }
  ];
  var cranialNerveMnemonics = [
    { title: 'Names', text: 'On Old Olympus’s Towering Top, A Famous Vocal German Viewed Some Hops.' },
    { title: 'Sensory, motor or both', text: 'Some Say Marry Money, But My Brother Says Big Brains Matter More (S S M M B M B S B B M M).' },
    { title: 'Skull openings of V', text: '"Standing Room Only": Superior orbital fissure (V1), foramen Rotundum (V2), foramen Ovale (V3).' },
    { title: 'Eye muscles', text: '"LR6 SO4": lateral rectus = CN VI, superior oblique = CN IV, all others CN III.' }
  ];
  // Brainstem level of each nerve's exit/entry; used by the schematic and tests.
  var brainstemExits = { 'cn-i': 'Olfactory bulb (forebrain)', 'cn-ii': 'Optic chiasm (diencephalon)', 'cn-iii': 'Midbrain, interpeduncular fossa', 'cn-iv': 'Midbrain, dorsal (below inferior colliculus)', 'cn-v': 'Pons, lateral', 'cn-vi': 'Pontomedullary junction, medial', 'cn-vii': 'Pontomedullary junction (cerebellopontine angle)', 'cn-viii': 'Pontomedullary junction (cerebellopontine angle), lateral to VII', 'cn-ix': 'Medulla, post-olivary sulcus', 'cn-x': 'Medulla, post-olivary sulcus', 'spinal-accessory': 'Medulla (cranial root) and cervical cord C1–C5 (spinal root)', 'cn-xii': 'Medulla, pre-olivary sulcus' };

  /* ====================================================================
     DERMATOMES, MYOTOMES, REFLEXES
     Key sensory points: International Standards for Neurological Classification of
     Spinal Cord Injury (ISNCSCI, ASIA). Myotomes: ISNCSCI key muscles plus standard
     bedside teaching (Moore COA; Bates; Medical Research Council power scale).
     view: 'front' | 'back' | 'both' (where the key point is shown on the body figure).
     ==================================================================== */
  var dermatomes = [
    { level: 'C2', point: 'Occipital protuberance (at least 1 cm lateral to the midline)', area: 'Back of the head and upper neck', view: 'back' },
    { level: 'C3', point: 'Supraclavicular fossa (at the midclavicular line)', area: 'Neck and the skin over the clavicle', view: 'front' },
    { level: 'C4', point: 'Top of the acromioclavicular joint', area: 'Shoulder tip and upper chest; diaphragmatic (phrenic) pain is referred here', view: 'both' },
    { level: 'C5', point: 'Lateral (radial) side of the antecubital fossa, just proximal to the elbow crease', area: 'Lateral upper arm over the deltoid', view: 'front' },
    { level: 'C6', point: 'Dorsal surface of the proximal phalanx of the thumb', area: 'Lateral forearm, thumb and index finger', view: 'front' },
    { level: 'C7', point: 'Dorsal surface of the proximal phalanx of the middle finger', area: 'Posterior forearm and middle finger', view: 'front' },
    { level: 'C8', point: 'Dorsal surface of the proximal phalanx of the little finger', area: 'Medial forearm and hand, ring and little fingers', view: 'front' },
    { level: 'T1', point: 'Medial (ulnar) side of the antecubital fossa, just proximal to the medial epicondyle', area: 'Medial forearm and arm', view: 'front' },
    { level: 'T2', point: 'Apex of the axilla', area: 'Medial arm, upper chest and upper back', view: 'front' },
    { level: 'T3', point: 'Third intercostal space at the midclavicular line', area: 'Upper chest', view: 'front' },
    { level: 'T4', point: 'Fourth intercostal space at the midclavicular line (nipple line)', area: 'Chest at the level of the nipples', view: 'front' },
    { level: 'T5', point: 'Fifth intercostal space (midway between T4 and T6)', area: 'Chest below the nipples', view: 'front' },
    { level: 'T6', point: 'Sixth intercostal space (level of the xiphoid process)', area: 'Lower chest at the xiphisternum', view: 'front' },
    { level: 'T7', point: 'Seventh intercostal space (midway between T6 and T8)', area: 'Upper abdomen at the costal margin', view: 'front' },
    { level: 'T8', point: 'Eighth intercostal space (midway between T6 and T10)', area: 'Upper abdomen', view: 'front' },
    { level: 'T9', point: 'Ninth intercostal space (midway between T8 and T10)', area: 'Upper abdomen', view: 'front' },
    { level: 'T10', point: 'Tenth intercostal space (level of the umbilicus)', area: 'Abdomen at the umbilicus; appendicitis pain referred here early', view: 'front' },
    { level: 'T11', point: 'Eleventh intercostal space (midway between T10 and T12)', area: 'Lower abdomen', view: 'front' },
    { level: 'T12', point: 'Midpoint of the inguinal ligament', area: 'Suprapubic and groin region', view: 'front' },
    { level: 'L1', point: 'Half the distance between the key points for T12 and L2', area: 'Inguinal region and upper anterior thigh', view: 'front' },
    { level: 'L2', point: 'Mid-anterior thigh', area: 'Anterior and medial thigh', view: 'front' },
    { level: 'L3', point: 'Medial femoral condyle', area: 'Lower anterior thigh to the medial knee', view: 'front' },
    { level: 'L4', point: 'Medial malleolus', area: 'Medial leg and ankle', view: 'front' },
    { level: 'L5', point: 'Dorsum of the foot at the third metatarsophalangeal joint', area: 'Lateral leg, dorsum of the foot and great toe', view: 'front' },
    { level: 'S1', point: 'Lateral heel', area: 'Lateral foot, little toe, heel and sole', view: 'both' },
    { level: 'S2', point: 'Popliteal fossa in the midline', area: 'Posterior thigh and calf', view: 'back' },
    { level: 'S3', point: 'Ischial tuberosity', area: 'Medial buttock and upper posterior thigh', view: 'back' },
    { level: 'S4-5', point: 'Perianal area (within 1 cm of the mucocutaneous junction)', area: 'Perianal skin and perineum ("saddle")', view: 'back' }
  ];
  var myotomes = [
    { level: 'C1-C2', movement: 'Neck flexion and extension (upper cervical)', muscles: [], key: false, note: 'Prevertebral and suboccipital muscles.' },
    { level: 'C3', movement: 'Lateral flexion of the neck', muscles: [], key: false, note: 'Scalenes; with C4 supplies the diaphragm.' },
    { level: 'C4', movement: 'Shoulder elevation (shrug)', muscles: ['trapezius', 'levator-scapulae'], key: false, note: 'C3–C5 also drives the diaphragm via the phrenic nerve.' },
    { level: 'C5', movement: 'Shoulder abduction; elbow flexion', muscles: ['deltoid', 'supraspinatus', 'biceps-brachii'], key: true, keyMuscle: 'Elbow flexors (biceps, brachialis)', note: 'ISNCSCI key muscle: elbow flexors.' },
    { level: 'C6', movement: 'Wrist extension', muscles: ['extensor-carpi-radialis-longus', 'extensor-carpi-radialis-brevis'], key: true, keyMuscle: 'Wrist extensors', note: 'ISNCSCI key muscle: wrist extensors.' },
    { level: 'C7', movement: 'Elbow extension; wrist flexion', muscles: ['triceps-brachii', 'flexor-carpi-radialis'], key: true, keyMuscle: 'Elbow extensors (triceps)', note: 'ISNCSCI key muscle: elbow extensors.' },
    { level: 'C8', movement: 'Finger flexion (long finger flexors)', muscles: ['flexor-digitorum-profundus', 'flexor-digitorum-superficialis'], key: true, keyMuscle: 'Finger flexors (FDP to the middle finger)', note: 'ISNCSCI key muscle: finger flexors.' },
    { level: 'T1', movement: 'Finger abduction and adduction (interossei)', muscles: ['dorsal-interossei', 'abductor-digiti-minimi-hand'], key: true, keyMuscle: 'Small finger abductor (abductor digiti minimi)', note: 'ISNCSCI key muscle: little finger abductor.' },
    { level: 'L1', movement: 'Hip flexion (with L2)', muscles: ['psoas-major'], key: false, note: 'Hip flexion tests L1–L2.' },
    { level: 'L2', movement: 'Hip flexion', muscles: ['psoas-major', 'iliacus', 'sartorius'], key: true, keyMuscle: 'Hip flexors (iliopsoas)', note: 'ISNCSCI key muscle: hip flexors.' },
    { level: 'L3', movement: 'Knee extension; hip adduction', muscles: ['rectus-femoris', 'vastus-lateralis', 'vastus-medialis', 'vastus-intermedius', 'adductor-longus'], key: true, keyMuscle: 'Knee extensors (quadriceps)', note: 'ISNCSCI key muscle: knee extensors.' },
    { level: 'L4', movement: 'Ankle dorsiflexion (and inversion)', muscles: ['tibialis-anterior'], key: true, keyMuscle: 'Ankle dorsiflexors (tibialis anterior)', note: 'ISNCSCI key muscle: ankle dorsiflexors.' },
    { level: 'L5', movement: 'Great-toe extension; hip abduction', muscles: ['extensor-hallucis-longus', 'gluteus-medius', 'extensor-digitorum-longus'], key: true, keyMuscle: 'Long toe extensors (extensor hallucis longus)', note: 'ISNCSCI key muscle: long toe extensors.' },
    { level: 'S1', movement: 'Ankle plantarflexion; eversion; hip extension', muscles: ['gastrocnemius', 'soleus', 'fibularis-longus', 'gluteus-maximus'], key: true, keyMuscle: 'Ankle plantarflexors (gastrocnemius, soleus)', note: 'ISNCSCI key muscle: ankle plantarflexors.' },
    { level: 'S2', movement: 'Knee flexion (hamstrings); toe flexion', muscles: ['semimembranosus', 'semitendinosus', 'biceps-femoris-long', 'flexor-digitorum-longus'], key: false, note: 'Hamstrings L5–S2.' },
    { level: 'S3-S4', movement: 'Pelvic floor and anal sphincter contraction', muscles: ['levator-ani', 'external-anal-sphincter'], key: false, note: 'Voluntary anal contraction is part of the ISNCSCI examination.' }
  ];
  var reflexes = [
    { id: 'biceps', name: 'Biceps jerk', roots: 'C5-C6', nerve: 'musculocutaneous', test: 'Place a thumb on the biceps tendon in the antecubital fossa and strike it with the tendon hammer; the elbow flexes.' },
    { id: 'brachioradialis', name: 'Brachioradialis (supinator) jerk', roots: 'C5-C6', nerve: 'radial', test: 'Tap the lateral radius 5 cm above the wrist; the elbow flexes and the forearm supinates slightly. The inverted supinator jerk (finger flexion instead) suggests a C5–C6 cord lesion.' },
    { id: 'triceps', name: 'Triceps jerk', roots: 'C6-C8', nerve: 'radial', test: 'Support the arm and tap the triceps tendon above the olecranon; the elbow extends.' },
    { id: 'finger', name: 'Finger flexor jerk', roots: 'C8', nerve: 'median', test: 'Tap the examiner’s fingers lying across the patient’s fingers; the fingers flex.' },
    { id: 'knee', name: 'Knee (patellar) jerk', roots: 'L2-L4', nerve: 'femoral', test: 'Strike the patellar tendon with the knee relaxed and flexed; the knee extends (mainly L3–L4).' },
    { id: 'hamstring', name: 'Medial hamstring jerk', roots: 'L5', nerve: 'tibial', test: 'Tap the examiner’s finger over the semitendinosus tendon behind the medial knee; the knee flexes. Often the only available L5 reflex.' },
    { id: 'ankle', name: 'Ankle (Achilles) jerk', roots: 'S1-S2', nerve: 'tibial', test: 'Dorsiflex the foot slightly and tap the Achilles tendon; the foot plantarflexes (mainly S1).' },
    { id: 'plantar', name: 'Plantar response (Babinski)', roots: 'L5-S2', nerve: 'tibial', test: 'Stroke the lateral sole from heel to the toes; the normal adult response is toe flexion. Great-toe extension with fanning is an upper motor neurone sign.' },
    { id: 'cremasteric', name: 'Cremasteric reflex', roots: 'L1-L2', nerve: 'genitofemoral', test: 'Stroke the upper medial thigh; the ipsilateral testis rises (afferent: femoral branch; efferent: genital branch of the genitofemoral nerve).' },
    { id: 'abdominal', name: 'Superficial abdominal reflexes', roots: 'T7-T12', nerve: 'abdominal-wall-nerves', test: 'Stroke the skin of each quadrant toward the umbilicus; the umbilicus moves toward the stimulus. Upper T7–T10, lower T10–T12.' },
    { id: 'anal', name: 'Anal wink / bulbocavernosus', roots: 'S2-S4', nerve: 'pudendal', test: 'Stroking perianal skin causes external anal sphincter contraction; absence suggests a conus or cauda equina lesion.' }
  ];
  var reflexGrades = [
    ['0', 'Absent'], ['1+', 'Present but diminished (hypoactive)'], ['2+', 'Normal'], ['3+', 'Brisker than normal (may be pathological)'], ['4+', 'Very brisk with sustained clonus']
  ];
  var powerGrades = [
    ['0', 'No contraction'], ['1', 'Flicker of muscle contraction'], ['2', 'Movement with gravity eliminated'], ['3', 'Movement against gravity'], ['4', 'Movement against some resistance'], ['5', 'Normal power']
  ];

  /* ====================================================================
     SKULL FORAMINA
     Sources: Moore COA (Head: cranial base); Gray’s Anatomy for Students; Standring.
     `key` lists the items used in the quiz: each is unique to that opening.
     ==================================================================== */
  function F(id, name, fossa, location, contents, key, note) {
    return { id: id, name: name, fossa: fossa, location: location, contents: contents, key: key || [], note: note || '' };
  }
  var foramina = [
    F('cribriform-plate', 'Cribriform plate', 'anterior', 'Ethmoid bone, floor of the anterior cranial fossa', ['Olfactory nerve (CN I) filaments'], ['Olfactory nerve (CN I) filaments'], 'Fracture causes anosmia and CSF rhinorrhoea; the anterior ethmoidal nerve and artery enter the cranial cavity via the anterior ethmoidal foramen and cross the cribriform plate.'),
    F('foramen-caecum', 'Foramen caecum', 'anterior', 'Between the frontal crest and the crista galli', ['Emissary vein linking nasal veins and the superior sagittal sinus (variable; often closed in adults)'], ['Emissary vein linking nasal veins and the superior sagittal sinus (variable; often closed in adults)'], 'A route for spread of nasal infection to the dural venous sinuses in children.'),
    F('anterior-ethmoidal', 'Anterior ethmoidal foramen', 'orbit', 'Medial wall of the orbit (frontoethmoidal suture)', ['Anterior ethmoidal artery', 'Anterior ethmoidal nerve (V1)'], ['Anterior ethmoidal artery'], 'The nerve supplies the nasal mucosa and external nose; injury or inflammation of the external nasal branch gives Hutchinson sign in zoster.'),
    F('posterior-ethmoidal', 'Posterior ethmoidal foramen', 'orbit', 'Medial wall of the orbit, near the optic canal', ['Posterior ethmoidal artery', 'Posterior ethmoidal nerve (V1)'], ['Posterior ethmoidal artery'], 'Lies about 5–10 mm from the optic canal; landmark in orbital surgery.'),
    F('optic-canal', 'Optic canal', 'middle', 'Lesser wing of the sphenoid, between the body and the two roots of the lesser wing', ['Optic nerve (CN II)', 'Ophthalmic artery'], ['Optic nerve (CN II)', 'Ophthalmic artery'], 'Fracture or tumour compression causes monocular visual loss; the optic nerve is wrapped in meninges, so papilloedema reflects raised intracranial pressure.'),
    F('superior-orbital-fissure', 'Superior orbital fissure', 'middle', 'Between the greater and lesser wings of the sphenoid', ['Oculomotor nerve (CN III)', 'Trochlear nerve (CN IV)', 'Abducens nerve (CN VI)', 'Ophthalmic nerve branches: lacrimal, frontal, nasociliary (V1)', 'Superior ophthalmic vein', 'Sympathetic fibres to the orbit'], ['Oculomotor nerve (CN III)', 'Trochlear nerve (CN IV)', 'Abducens nerve (CN VI)', 'Superior ophthalmic vein', 'Ophthalmic nerve branches: lacrimal, frontal, nasociliary (V1)'], 'Superior orbital fissure syndrome: ophthalmoplegia, ptosis, a fixed dilated pupil and V1 anaesthesia. Within the tendinous ring pass CN III, CN VI and the nasociliary nerve; the lacrimal and frontal nerves, CN IV and the superior ophthalmic vein pass outside it.'),
    F('inferior-orbital-fissure', 'Inferior orbital fissure', 'orbit', 'Between the greater wing of the sphenoid and the maxilla', ['Zygomatic nerve (V2)', 'Infraorbital nerve and vessels (entering the infraorbital groove)', 'Inferior ophthalmic vein tributaries to the pterygoid venous plexus', 'Orbital branches of the pterygopalatine ganglion'], ['Zygomatic nerve (V2)'], 'Communicates between the orbit and the infratemporal and pterygopalatine fossae.'),
    F('foramen-rotundum', 'Foramen rotundum', 'middle', 'Greater wing of the sphenoid, leading to the pterygopalatine fossa', ['Maxillary nerve (V2)'], ['Maxillary nerve (V2)'], 'V2 is purely sensory.'),
    F('foramen-ovale', 'Foramen ovale', 'middle', 'Greater wing of the sphenoid, leading to the infratemporal fossa', ['Mandibular nerve (V3) and its motor root', 'Accessory meningeal artery', 'Lesser petrosal nerve (variable; may use its own canaliculus)', 'Emissary veins to the pterygoid venous plexus'], ['Mandibular nerve (V3) and its motor root', 'Accessory meningeal artery'], 'Used for percutaneous trigeminal ganglion procedures in neuralgia; emissary veins allow infection to reach the cavernous sinus.'),
    F('foramen-spinosum', 'Foramen spinosum', 'middle', 'Greater wing of the sphenoid, posterolateral to the foramen ovale', ['Middle meningeal artery and vein', 'Meningeal branch of the mandibular nerve (nervus spinosus)'], ['Middle meningeal artery and vein'], 'The middle meningeal artery is torn in epidural haematoma, typically after a blow to the pterion.'),
    F('foramen-lacerum', 'Foramen lacerum', 'middle', 'Between the apex of the petrous temporal bone, the sphenoid and the occipital bone', ['Filled with cartilage in life', 'Internal carotid artery passes over its upper part (not through it)', 'Greater petrosal nerve ends here and joins the deep petrosal nerve to form the nerve of the pterygoid canal', 'Meningeal branch of the ascending pharyngeal artery'], [], 'A classic exam trap: nothing of consequence passes completely through the foramen lacerum.'),
    F('carotid-canal', 'Carotid canal', 'middle', 'Petrous part of the temporal bone, leading to the foramen lacerum', ['Internal carotid artery', 'Internal carotid sympathetic plexus'], ['Internal carotid artery', 'Internal carotid sympathetic plexus'], 'The sympathetic plexus accompanies the artery; injury to it contributes to Horner syndrome.'),
    F('internal-acoustic-meatus', 'Internal acoustic meatus', 'posterior', 'Posterior surface of the petrous temporal bone', ['Facial nerve (CN VII)', 'Vestibulocochlear nerve (CN VIII)', 'Labyrinthine artery'], ['Vestibulocochlear nerve (CN VIII)', 'Labyrinthine artery'], 'Vestibular schwannoma enlarges this canal; CN VII lies anterior-superior to the vestibular nerves.'),
    F('petrotympanic-fissure', 'Petrotympanic fissure (of Glaser)', 'other', 'Between the squamous and tympanic parts of the temporal bone, behind the temporomandibular joint', ['Chorda tympani (exits the middle ear)', 'Anterior tympanic artery'], ['Chorda tympani (exits the middle ear)', 'Anterior tympanic artery'], 'The chorda tympani carries taste from the anterior two-thirds of the tongue and parasympathetic fibres to the submandibular ganglion.'),
    F('jugular-foramen', 'Jugular foramen', 'posterior', 'Between the petrous temporal bone and the occipital bone', ['Glossopharyngeal nerve (CN IX)', 'Vagus nerve (CN X)', 'Accessory nerve (CN XI)', 'Origin of the internal jugular vein (from the sigmoid sinus)', 'Inferior petrosal sinus', 'Meningeal branches of the ascending pharyngeal and occipital arteries'], ['Glossopharyngeal nerve (CN IX)', 'Vagus nerve (CN X)', 'Inferior petrosal sinus', 'Origin of the internal jugular vein (from the sigmoid sinus)'], 'Jugular foramen (Vernet) syndrome: IX, X and XI palsies with dysphagia, hoarseness and trapezius weakness. Anterior part: inferior petrosal sinus; intermediate: IX, X, XI; posterior: sigmoid sinus and the internal jugular vein.'),
    F('hypoglossal-canal', 'Hypoglossal canal', 'posterior', 'Occipital bone, above the occipital condyle', ['Hypoglossal nerve (CN XII)', 'Meningeal branch of the ascending pharyngeal artery', 'Emissary venous plexus'], ['Hypoglossal nerve (CN XII)'], 'Lesions cause ipsilateral tongue wasting and deviation toward the lesion.'),
    F('foramen-magnum', 'Foramen magnum', 'posterior', 'Occipital bone, the large opening at the skull base', ['Medulla oblongata (spinomedullary junction) with its meninges', 'Vertebral arteries', 'Anterior and posterior spinal arteries', 'Ascending spinal roots of the accessory nerve (CN XI)', 'Tectorial membrane, alar and apical ligaments'], ['Medulla oblongata (spinomedullary junction) with its meninges', 'Vertebral arteries', 'Anterior and posterior spinal arteries'], 'Tonsillar herniation through the foramen magnum compresses the medulla (coning): cardiorespiratory arrest.'),
    F('condylar-canal', 'Condylar (posterior condylar) canal', 'posterior', 'Occipital bone, posterior to the occipital condyle', ['Posterior condylar emissary vein (sigmoid sinus to the suboccipital venous plexus)'], ['Posterior condylar emissary vein (sigmoid sinus to the suboccipital venous plexus)'], 'Inconstant.'),
    F('mastoid-foramen', 'Mastoid foramen', 'posterior', 'Posterior part of the mastoid process, near the occipitomastoid suture', ['Mastoid emissary vein', 'Meningeal branch of the occipital artery'], ['Mastoid emissary vein'], 'Mastoid emissary vein links the sigmoid sinus with the occipital veins; mastoiditis can spread to the sinus.'),
    F('stylomastoid-foramen', 'Stylomastoid foramen', 'other', 'Between the styloid and mastoid processes (inferior surface)', ['Facial nerve (CN VII) leaves the skull', 'Stylomastoid artery'], ['Stylomastoid artery'], 'Bell palsy is thought to arise from compression in the facial canal; parotid surgery risks the nerve at this exit.'),
    F('pterygoid-canal', 'Pterygoid (Vidian) canal', 'other', 'Base of the medial pterygoid plate, from the foramen lacerum to the pterygopalatine fossa', ['Nerve of the pterygoid canal (greater petrosal and deep petrosal nerves)', 'Artery of the pterygoid canal'], ['Nerve of the pterygoid canal (greater petrosal and deep petrosal nerves)', 'Artery of the pterygoid canal'], 'Carries parasympathetic (lacrimal and nasal glands) and sympathetic fibres to the pterygopalatine ganglion.'),
    F('sphenopalatine-foramen', 'Sphenopalatine foramen', 'other', 'Between the orbital and sphenoidal processes of the palatine bone', ['Sphenopalatine artery', 'Posterior superior lateral nasal nerves', 'Nasopalatine nerve entering the nasal cavity'], ['Sphenopalatine artery'], 'The sphenopalatine artery is the main source in posterior epistaxis.'),
    F('greater-palatine-foramen', 'Greater palatine foramen', 'face', 'Posterolateral hard palate', ['Greater palatine nerve', 'Greater palatine artery'], ['Greater palatine nerve'], 'Site of the greater palatine nerve block for anaesthesia of the posterior hard palate.'),
    F('lesser-palatine-foramina', 'Lesser palatine foramina', 'face', 'Posterior to the greater palatine foramen', ['Lesser palatine nerves', 'Lesser palatine arteries'], ['Lesser palatine nerves'], 'Supply the soft palate and tonsil.'),
    F('incisive-foramen', 'Incisive foramen', 'face', 'Midline of the anterior hard palate behind the incisor teeth', ['Nasopalatine nerve (terminal)', 'Terminal branch of the greater palatine artery'], [], 'Site for nasopalatine block for anaesthesia of the anterior hard palate.'),
    F('supraorbital-foramen', 'Supraorbital foramen / notch', 'face', 'Superior orbital margin', ['Supraorbital nerve (V1)', 'Supraorbital artery and vein'], ['Supraorbital nerve (V1)'], 'Pressure on the notch is painful in a conscious patient; used for the supraorbital block.'),
    F('infraorbital-foramen', 'Infraorbital foramen', 'face', 'Maxilla, below the inferior orbital margin', ['Infraorbital nerve (terminal V2) and vessels'], [], 'Site for the infraorbital nerve block (upper lip, lateral nose, lower eyelid); fractured floor of the orbit may cause numbness here.'),
    F('zygomaticofacial-foramen', 'Zygomaticofacial foramen', 'face', 'Lateral surface of the zygomatic bone', ['Zygomaticofacial nerve (V2)'], ['Zygomaticofacial nerve (V2)'], 'Supplies the skin over the cheek bone; may be damaged in zygomatic fractures.'),
    F('mental-foramen', 'Mental foramen', 'face', 'Body of the mandible, below the second premolar', ['Mental nerve (branch of inferior alveolar, V3)', 'Mental vessels'], ['Mental nerve (branch of inferior alveolar, V3)'], 'Numb chin and lower lip ("numb chin syndrome") may reveal malignancy or mandibular fracture.'),
    F('mandibular-foramen', 'Mandibular foramen', 'face', 'Medial surface of the ramus of the mandible', ['Inferior alveolar nerve', 'Inferior alveolar artery and vein'], ['Inferior alveolar nerve'], 'Site of the inferior alveolar nerve block (dental anaesthesia); the lingula guards the foramen.'),
    F('parietal-foramen', 'Parietal foramen', 'other', 'Posterior part of the parietal bone near the sagittal suture', ['Parietal emissary vein'], ['Parietal emissary vein'], 'Inconstant; links scalp veins to the superior sagittal sinus.')
  ];
  var fossaLabels = { anterior: 'Anterior cranial fossa', middle: 'Middle cranial fossa', posterior: 'Posterior cranial fossa', orbit: 'Orbit', face: 'Face and palate', other: 'Skull base (other)' };

  /* ====================================================================
     LOOK-UPS AND HELPERS
     ==================================================================== */
  var nerveIndex = {}, muscleIndex = {};
  nerves.forEach(function (n) { nerveIndex[n.id] = n; });
  muscles.forEach(function (m) { muscleIndex[m.id] = m; });

  /** The nerve id plus all of its descendant branches (e.g. median -> anterior-interosseous, median-recurrent). */
  function nerveFamily(id) {
    var out = [id];
    nerves.forEach(function (n) { if (n.parent && out.indexOf(n.parent) >= 0 && out.indexOf(n.id) < 0) out.push(n.id); });
    // second pass for grandchildren (sciatic -> tibial -> medial-plantar)
    nerves.forEach(function (n) { if (n.parent && out.indexOf(n.parent) >= 0 && out.indexOf(n.id) < 0) out.push(n.id); });
    return out;
  }
  /** Muscles supplied by a nerve (primary or secondary supply). With branches = true includes its sub-branches. */
  function musclesOfNerve(id, branches) {
    var ids = branches === false ? [id] : nerveFamily(id);
    return muscles.filter(function (m) { return ids.indexOf(m.nerve) >= 0 || (m.also && ids.indexOf(m.also) >= 0); });
  }
  /** Movement filter tags for the muscle browser: matched against the action text. */
  var actionTags = [
    { id: 'flexion', label: 'Flexion', re: /\bflex/i },
    { id: 'extension', label: 'Extension', re: /\bextend|\bextension/i },
    { id: 'abduction', label: 'Abduction', re: /\babduct/i },
    { id: 'adduction', label: 'Adduction', re: /\badduct/i },
    { id: 'medial-rotation', label: 'Medial rotation', re: /medially? rotat|medial rotation|medially rotates/i },
    { id: 'lateral-rotation', label: 'Lateral rotation', re: /laterally? rotat|lateral rotation|laterally rotates/i },
    { id: 'pronation', label: 'Pronation', re: /\bpronat/i },
    { id: 'supination', label: 'Supination', re: /\bsupinat/i },
    { id: 'elevation', label: 'Elevation', re: /\belevat|\braises|\braise\b/i },
    { id: 'depression', label: 'Depression', re: /\bdepress/i },
    { id: 'protraction', label: 'Protraction / retraction', re: /\bprotract|\bretract|\bprotrudes?\b/i },
    { id: 'plantarflexion', label: 'Plantarflexion', re: /plantar\s?flex/i },
    { id: 'dorsiflexion', label: 'Dorsiflexion', re: /dorsiflex/i },
    { id: 'inversion', label: 'Inversion / eversion', re: /\binvert|\bevert|\binversion|\beversion/i },
    { id: 'opposition', label: 'Opposition', re: /\boppos/i },
    { id: 'respiration', label: 'Respiration', re: /inspiration|expiration|breath/i },
    { id: 'mastication', label: 'Mastication / jaw', re: /\bmandible|\bjaw/i },
    { id: 'eye', label: 'Eye / eyelid movement', re: /\bthe eye\b|\beyelid|\beyebrow/i }
  ];
  function tagsOf(m) { return actionTags.filter(function (t) { return t.re.test(m.action); }).map(function (t) { return t.id; }); }


  /* ====================================================================
     QUIZ BUILDERS (pure; take an rng so tests can be deterministic)
     Each returns { prompt, options:[...4 unique strings], answer:index, explain, topic }
     ==================================================================== */
  function defRng() { return Math.random(); }
  function shuffle(arr, rng) {
    var a = arr.slice(), r = rng || defRng;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(arr, rng) { return arr[Math.floor((rng || defRng)() * arr.length)]; }
  function finish(prompt, correct, distractors, explain, topic, rng) {
    var uniq = [];
    distractors.forEach(function (d) { if (d !== correct && uniq.indexOf(d) < 0) uniq.push(d); });
    var opts = shuffle([correct].concat(uniq.slice(0, 3)), rng);
    return { prompt: prompt, options: opts, answer: opts.indexOf(correct), explain: explain, topic: topic, correct: correct };
  }
  function nerveLabel(n) { return n.name.replace(/\s*\(CN [IVX]+\)/, '') + ' (' + n.rootsText.replace(/ \(.*\)$/, '') + ')'; }

  function nerveQuestion(m, rng) {
    var nv = nerveIndex[m.nerve];
    var fam = nerveFamily(nv.id).concat(nv.parent ? [nv.parent] : []);
    if (m.also) fam = fam.concat(nerveFamily(m.also), [m.also]);
    var cnt = {}, regs = {};
    muscles.forEach(function (x) { cnt[x.nerve] = (cnt[x.nerve] || 0) + 1; (regs[x.nerve] = regs[x.nerve] || {})[x.region] = true; });
    var pool = nerves.filter(function (n) { return cnt[n.id] && fam.indexOf(n.id) < 0 && n.id !== nv.id; });
    var tier1 = pool.filter(function (n) { return regs[n.id][m.region] && cnt[n.id] >= 3; });
    var tier2 = pool.filter(function (n) { return tier1.indexOf(n) < 0 && (regs[n.id][m.region] || n.group === nv.group); });
    var tier3 = pool.filter(function (n) { return tier1.indexOf(n) < 0 && tier2.indexOf(n) < 0 && cnt[n.id] >= 2; });
    var ds = shuffle(tier1, rng).concat(shuffle(tier2, rng), shuffle(tier3, rng), shuffle(pool, rng)).slice(0, 12).map(nerveLabel);
    return finish('Which nerve supplies ' + m.name + '?', nerveLabel(nv), ds,
      m.name + ': ' + nv.name + ' (' + nv.rootsText + '). ' + (m.note ? m.note + ' ' : '') + m.clinical, 'nerve', rng);
  }
  function shortAction(m) { var s = m.action.split(';')[0]; return s.length > 150 ? s.slice(0, 147).replace(/\s+\S*$/, '') + '…' : s; }
  function actionQuestion(m, rng) {
    var tags = tagsOf({ action: shortAction(m) });
    var others = muscles.filter(function (x) { return x.id !== m.id && shortAction(x) !== shortAction(m); });
    var dj = function (x) { var t = tagsOf({ action: shortAction(x) }); return !t.some(function (g) { return tags.indexOf(g) >= 0; }); };
    var cand = shuffle(others.filter(function (x) { return x.region === m.region && dj(x); }), rng).concat(shuffle(others.filter(function (x) { return x.region !== m.region && dj(x); }), rng));
    var ds = [];
    cand.forEach(function (x) { var a = shortAction(x); if (ds.indexOf(a) < 0) ds.push(a); });
    return finish('What is the main action of ' + m.name + '?', shortAction(m), ds.slice(0, 3), m.name + ': ' + m.action + '.', 'action', rng);
  }
  function foramenQuestion(rng, mode) {
    var pool = foramina.filter(function (f) { return f.key.length; });
    var f = pick(pool, rng);
    mode = mode || (rng() < 0.5 ? 'which-foramen' : 'which-item');
    function inContents(fx, item) { return fx.contents.indexOf(item) >= 0; }
    if (mode === 'which-foramen') {
      var item = pick(f.key, rng);
      var ds = shuffle(foramina.filter(function (x) { return x.id !== f.id && !inContents(x, item); }), rng);
      var near = ds.filter(function (x) { return x.fossa === f.fossa; }).concat(ds.filter(function (x) { return x.fossa !== f.fossa; }));
      return finish('Through which opening does this pass: ' + item + '?', f.name, near.map(function (x) { return x.name; }), f.name + ' (' + f.location + '): ' + f.contents.join('; ') + '. ' + f.note, 'foramen', rng);
    }
    var correct = pick(f.key, rng);
    var others = [];
    foramina.forEach(function (x) { if (x.id !== f.id) x.key.forEach(function (k) { if (!inContents(f, k) && others.indexOf(k) < 0) others.push(k); }); });
    var sameFossa = shuffle(others.filter(function (k) { return foramina.some(function (x) { return x.fossa === f.fossa && x.key.indexOf(k) >= 0; }); }), rng);
    var diff = shuffle(others.filter(function (k) { return sameFossa.indexOf(k) < 0; }), rng);
    return finish('Which of these passes through the ' + f.name + '?', correct, sameFossa.concat(diff), f.name + ' (' + f.location + '): ' + f.contents.join('; ') + '. ' + f.note, 'foramen', rng);
  }
  function lesionClues(les) {
    var ms = les.muscles.map(function (id) { return muscleIndex[id].name; });
    var clues = [];
    clues.push({ label: 'Weakness / paralysis', text: ms.length ? ms.slice(0, 6).join(', ') + (ms.length > 6 ? ' and ' + (ms.length - 6) + ' more' : '') : 'No muscle weakness' });
    clues.push({ label: 'Sensory loss', text: les.sensory });
    clues.push({ label: 'Classic sign', text: les.sign });
    clues.push({ label: 'Mechanism', text: les.mechanism });
    return clues;
  }
  function lesionQuestion(plexus, rng, lesion) {
    var les = lesion || pick(plexus.lesions, rng);
    var ds = shuffle(plexus.lesions.filter(function (x) { return x.id !== les.id; }), rng).map(function (x) { return x.short; });
    var q = finish('Name the lesion from the deficits.', les.short, ds, les.name + '. ' + les.sign + ' ' + les.spared, 'lesion', rng);
    q.lesionId = les.id; q.clues = lesionClues(les);
    return q;
  }
  function cranialQuestion(rng) {
    var q = pick(cranialBank, rng);
    var correct = cranialLabel(q.a);
    var ds = shuffle(cranial.filter(function (c) { return c.id !== q.a; }), rng).map(function (c) { return cranialLabel(c.id); });
    var r = finish(q.q, correct, ds, q.why, 'cranial', rng);
    return r;
  }
  function cranialLabel(id) {
    var c = cranial.filter(function (x) { return x.id === id; })[0];
    return 'CN ' + c.numeral + ' ' + c.name;
  }
  var cranialBank = [
    { q: 'Which cranial nerve leaves the brainstem from its dorsal surface?', a: 'cn-iv', why: 'The trochlear nerve exits below the inferior colliculus, decussates and wraps around the cerebral peduncle.' },
    { q: 'Which cranial nerve passes through the foramen rotundum (as its maxillary division)?', a: 'cn-v', why: 'V2 passes through the foramen rotundum; V1 through the superior orbital fissure; V3 through the foramen ovale.' },
    { q: 'Which cranial nerve passes through the optic canal?', a: 'cn-ii', why: 'The optic nerve (with the ophthalmic artery) passes through the optic canal.' },
    { q: 'Which nerve supplies the lateral rectus?', a: 'cn-vi', why: 'LR6: abducens supplies the lateral rectus.' },
    { q: 'Which nerve supplies the superior oblique?', a: 'cn-iv', why: 'SO4: trochlear nerve.' },
    { q: 'Which nerve supplies stylopharyngeus, the only muscle it innervates?', a: 'cn-ix', why: 'Glossopharyngeal nerve: stylopharyngeus.' },
    { q: 'What is the efferent limb of the corneal reflex?', a: 'cn-vii', why: 'Afferent V1 (nasociliary), efferent facial nerve to orbicularis oculi.' },
    { q: 'What is the afferent limb of the corneal reflex?', a: 'cn-v', why: 'Ophthalmic division of the trigeminal nerve carries corneal sensation.' },
    { q: 'What is the afferent limb of the gag reflex?', a: 'cn-ix', why: 'Glossopharyngeal afferent, vagal efferent.' },
    { q: 'What is the efferent limb of the gag reflex?', a: 'cn-x', why: 'The vagus nerve (nucleus ambiguus) contracts the pharyngeal muscles.' },
    { q: 'A patient has complete ptosis, a dilated non-reactive pupil and an eye that is deviated down and out. Which nerve is affected?', a: 'cn-iii', why: 'Oculomotor palsy: unopposed lateral rectus and superior oblique.' },
    { q: 'A patient has vertical diplopia when going downstairs and tilts the head away from the lesion. Which nerve is affected?', a: 'cn-iv', why: 'Superior oblique palsy: vertical/torsional diplopia worst on looking down and in.' },
    { q: 'On protrusion the tongue deviates toward the side of a lower motor neurone lesion. Which nerve is affected?', a: 'cn-xii', why: 'Hypoglossal: the weak genioglossus cannot push the tongue to the opposite side.' },
    { q: 'Which nerve carries taste from the anterior two-thirds of the tongue?', a: 'cn-vii', why: 'Chorda tympani, a branch of the facial nerve.' },
    { q: 'Which nerve carries taste from the posterior third of the tongue?', a: 'cn-ix', why: 'Glossopharyngeal nerve.' },
    { q: 'After a lesion the uvula deviates away from the affected side and the voice is hoarse. Which nerve is involved?', a: 'cn-x', why: 'Vagus: weak levator veli palatini on the affected side.' },
    { q: 'A patient has a weak shrug and a drooping shoulder after a lymph-node biopsy in the posterior triangle of the neck. Which nerve is injured?', a: 'spinal-accessory', why: 'The accessory nerve runs superficially in the posterior triangle to trapezius.' },
    { q: 'Rinne and Weber tests assess which cranial nerve?', a: 'cn-viii', why: 'Vestibulocochlear nerve (hearing).' },
    { q: 'Which cranial nerve supplies the muscles of mastication?', a: 'cn-v', why: 'Mandibular division of the trigeminal nerve.' },
    { q: 'In a lower motor neurone facial palsy the forehead is also paralysed. Which nerve is affected?', a: 'cn-vii', why: 'Facial nerve: bilateral cortical input spares the forehead only in upper motor neurone lesions.' },
    { q: 'Hyperacusis follows paralysis of the stapedius. Which nerve supplies it?', a: 'cn-vii', why: 'The nerve to stapedius arises from the facial nerve in the facial canal.' },
    { q: 'Which cranial nerve supplies parasympathetic fibres to the parotid gland (via the otic ganglion)?', a: 'cn-ix', why: 'Tympanic nerve, lesser petrosal nerve, otic ganglion, auriculotemporal nerve.' },
    { q: 'Which cranial nerve supplies parasympathetic fibres to the heart and most of the gut?', a: 'cn-x', why: 'Vagus nerve (dorsal motor nucleus).' },
    { q: 'Which nerve emerges from the interpeduncular fossa of the midbrain?', a: 'cn-iii', why: 'Oculomotor nerve.' },
    { q: 'Which nerve passes through the hypoglossal canal?', a: 'cn-xii', why: 'Hypoglossal nerve.' },
    { q: 'Bell palsy involves which nerve?', a: 'cn-vii', why: 'Idiopathic lower motor neurone facial nerve palsy.' },
    { q: 'Trigeminal neuralgia involves which nerve?', a: 'cn-v', why: 'Paroxysmal lancinating facial pain, usually V2/V3, often from vascular compression at the root entry zone.' },
    { q: 'Anosmia after a fracture of the cribriform plate is due to injury to which nerve?', a: 'cn-i', why: 'Olfactory nerve filaments are sheared.' },
    { q: 'Papilloedema is swelling of the disc of which nerve?', a: 'cn-ii', why: 'The optic nerve sheath communicates with the subarachnoid space, so raised intracranial pressure swells the disc.' },
    { q: 'A relative afferent pupillary defect (Marcus Gunn pupil) indicates a lesion of which nerve?', a: 'cn-ii', why: 'Optic nerve (afferent limb of the light reflex).' },
    { q: 'Which nerve passes through the internal acoustic meatus together with the facial nerve?', a: 'cn-viii', why: 'Vestibulocochlear nerve with the labyrinthine artery.' },
    { q: 'Carotid sinus baroreceptor afferents travel in which cranial nerve?', a: 'cn-ix', why: 'The carotid sinus nerve of Hering joins the glossopharyngeal nerve.' },
    { q: 'Which nerve gives off the recurrent laryngeal nerve?', a: 'cn-x', why: 'The recurrent laryngeal nerve is a branch of the vagus.' },
    { q: 'What is the afferent limb of the pupillary light reflex?', a: 'cn-ii', why: 'Optic nerve to the pretectal nuclei.' },
    { q: 'What is the efferent limb of the pupillary light reflex?', a: 'cn-iii', why: 'Parasympathetic fibres of the oculomotor nerve (Edinger–Westphal nucleus, ciliary ganglion).' },
    { q: 'The jaw deviates to the right on opening. Which nerve is weak on that side?', a: 'cn-v', why: 'Lateral pterygoid weakness (mandibular nerve) makes the jaw deviate toward the weak side.' },
    { q: 'Which nerve exits the skull via the stylomastoid foramen?', a: 'cn-vii', why: 'The facial nerve leaves the facial canal here to enter the parotid.' }
  ];
  function dermatomeQuestion(rng, kind) {
    kind = kind || pick(['derm', 'derm', 'myotome', 'reflex', 'landmark'], rng);
    if (kind === 'derm') {
      var d = pick(dermatomes, rng);
      var near = dermatomes.filter(function (x) { return x.level !== d.level && Math.abs(dermatomes.indexOf(x) - dermatomes.indexOf(d)) <= 4; });
      var far = dermatomes.filter(function (x) { return x.level !== d.level && near.indexOf(x) < 0; });
      var ds = shuffle(near, rng).concat(shuffle(far, rng)).map(function (x) { return x.level; });
      return finish('Which spinal level supplies the skin at: ' + d.point.charAt(0).toLowerCase() + d.point.slice(1) + '?', d.level, ds, d.level + ': ' + d.point + ' (' + d.area + ').', 'dermatome', rng);
    }
    if (kind === 'landmark') {
      var L = ['T4', 'T10', 'C6', 'C7', 'C8', 'L4', 'L5', 'S1', 'T6', 'L1', 'C5', 'S2'];
      var lv = pick(L, rng), dd = dermatomes.filter(function (x) { return x.level === lv; })[0];
      var short = { T4: 'the nipples', T10: 'the umbilicus', C6: 'the thumb', C7: 'the middle finger', C8: 'the little finger', L4: 'the medial malleolus', L5: 'the dorsum of the foot (third MTP joint) and great toe', S1: 'the lateral heel and sole', T6: 'the xiphoid process', L1: 'the inguinal region', C5: 'the lateral upper arm over the deltoid', S2: 'the popliteal fossa' };
      var ds2 = shuffle(L.filter(function (x) { return x !== lv; }), rng);
      return finish('Which dermatome is classically tested at ' + short[lv] + '?', lv, ds2, dd.level + ': ' + dd.point + '.', 'dermatome', rng);
    }
    if (kind === 'myotome') {
      var ms = myotomes.filter(function (x) { return x.key; });
      var m = pick(ms, rng);
      var ds3 = shuffle(ms.filter(function (x) { return x.level !== m.level; }), rng).map(function (x) { return x.level; });
      return finish('Which spinal root is the main myotome for: ' + m.keyMuscle.toLowerCase() + '?', m.level, ds3, m.level + ': ' + m.movement + '. ' + m.note, 'myotome', rng);
    }
    var rf = pick(reflexes.filter(function (x) { return ['biceps', 'brachioradialis', 'triceps', 'knee', 'ankle', 'hamstring', 'cremasteric'].indexOf(x.id) >= 0; }), rng);
    var label = function (x) { return rootsLabel(expandRoots(x.roots)); };
    var ds4 = shuffle(reflexes.filter(function (x) { return label(x) !== label(rf); }), rng).map(label);
    return finish('Which root(s) mediate the ' + rf.name.toLowerCase() + '?', label(rf), ds4, rf.name + ': ' + label(rf) + ' (' + rf.nerve.replace(/-/g, ' ') + ' nerve). ' + rf.test, 'reflex', rng);
  }

  var quiz = {
    shuffle: shuffle, pick: pick, shortAction: shortAction, nerveLabel: nerveLabel, cranialLabel: cranialLabel,
    nerveQuestion: nerveQuestion, actionQuestion: actionQuestion, foramenQuestion: foramenQuestion,
    lesionQuestion: lesionQuestion, lesionClues: lesionClues, cranialQuestion: cranialQuestion, dermatomeQuestion: dermatomeQuestion,
    cranialBank: cranialBank
  };
  return {
    version: 1,
    regions: REGIONS,
    nerves: nerves,
    muscles: muscles,
    brachial: brachial,
    lumbosacral: lumbosacral,
    cranial: cranial,
    cranialNerveMnemonics: cranialNerveMnemonics,
    brainstemExits: brainstemExits,
    dermatomes: dermatomes,
    myotomes: myotomes,
    reflexes: reflexes,
    reflexGrades: reflexGrades,
    powerGrades: powerGrades,
    foramina: foramina,
    fossaLabels: fossaLabels,
    actionTags: actionTags,
    sources: [
      'Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy, 8th–9th ed. Wolters Kluwer.',
      'Drake RL, Vogl AW, Mitchell AWM. Gray’s Anatomy for Students, 5th ed. Elsevier.',
      'Standring S (ed). Gray’s Anatomy: The Anatomical Basis of Clinical Practice, 42nd ed. Elsevier.',
      'Kirshblum SC et al. International Standards for Neurological Classification of Spinal Cord Injury (ISNCSCI), revised 2019. J Spinal Cord Med 2021 (key sensory points and key muscles).',
      'Blumenfeld H. Neuroanatomy through Clinical Cases, 2nd ed. Sinauer.',
      'Medical Research Council. Aids to the Examination of the Peripheral Nervous System (muscle power scale).'
    ],
    quiz: quiz,
    helpers: {
      SEQ: SEQ, CN_TOKENS: CN_TOKENS, expandRoots: expandRoots, rootsLabel: rootsLabel,
      nerveById: function (id) { return nerveIndex[id] || null; },
      muscleById: function (id) { return muscleIndex[id] || null; },
      nerveFamily: nerveFamily, musclesOfNerve: musclesOfNerve, tagsOf: tagsOf
    }
  };
});

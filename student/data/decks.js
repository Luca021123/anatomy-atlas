/* ==========================================================================
   Recall Lab · built-in flashcard decks  →  MTData.decks
   --------------------------------------------------------------------------
   High-yield cards for first- and second-year medical students. Every card
   has a stable id (deck prefix + number, e.g. "anat-ul-012"): progress is
   stored against these ids, so never renumber or reuse an id — add new
   cards with new numbers and retire old ones by deleting them.

   Card shapes:
     { id, deck, type: 'basic', front, back, extra?, tags: [] }
     { id, deck, type: 'cloze', text: '… {{c1::answer}} …', extra?, tags: [] }
   Several clozes (c1, c2 …) in one text produce several sub-cards.

   Facts were checked against standard teaching texts (see SOURCES) and,
   for clinical numbers, the guideline named in the card. Reference ranges
   are typical adult values and vary between laboratories.
   ========================================================================== */
(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else (root.MTData = root.MTData || {}).decks = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOURCES = {
    moore: 'Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Philadelphia: Wolters Kluwer; 2018.',
    gray: "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020.",
    guyton: 'Hall JE, Hall ME. Guyton and Hall Textbook of Medical Physiology. 14th ed. Philadelphia: Elsevier; 2021.',
    lehninger: 'Nelson DL, Cox MM. Lehninger Principles of Biochemistry. 8th ed. New York: Macmillan; 2021.',
    rang: "Ritter JM, Flower RJ, Henderson G, Loke YK, MacEwan D, Rang HP. Rang & Dale's Pharmacology. 9th ed. Elsevier; 2020.",
    bnf: 'British National Formulary (BNF) and MHRA Drug Safety Updates (current editions).',
    toxbase: 'UK National Poisons Information Service (TOXBASE) and the BNF section on emergency treatment of poisoning.',
    murray: 'Murray PR, Rosenthal KS, Pfaller MA. Medical Microbiology. 9th ed. Elsevier; 2020.',
    robbins: 'Kumar V, Abbas AK, Aster JC. Robbins & Cotran Pathologic Basis of Disease. 10th ed. Elsevier; 2020.',
    janeway: "Murphy K, Weaver C. Janeway's Immunobiology. 9th ed. Garland Science; 2016.",
    ohcm: 'Wilkinson IB, Raine T, Wiles K, Goodhart A, Hall C, O’Neill H. Oxford Handbook of Clinical Medicine. 10th ed. Oxford University Press; 2017.',
    guidelines: 'Guidelines named on individual cards: Resuscitation Council UK / ERC (resuscitation, anaphylaxis), RCP NEWS2 (2017), JBDS-IP (DKA), BTS/SIGN (asthma), NICE (NG51, NG136, CG141, NG217), ESC (heart failure 2021, ACS 2023, pulmonary hypertension 2022), KDIGO (AKI), WHO (diabetes, anaemia), Sepsis-3 (JAMA 2016), Fourth Universal Definition of MI (2018), ATLS 10th ed.'
  };

  var DECKS = [
    { id: 'anat', name: 'Anatomy', icon: '🦴', description: 'Clinically oriented gross anatomy and neuroanatomy: nerve injuries, surface landmarks, vascular territories.', sources: ['moore', 'gray'],
      subdecks: [{ id: 'anat-ul', name: 'Upper limb' }, { id: 'anat-ll', name: 'Lower limb' }, { id: 'anat-th', name: 'Thorax' }, { id: 'anat-ab', name: 'Abdomen & pelvis' }, { id: 'anat-hn', name: 'Head & neck' }, { id: 'anat-neuro', name: 'Neuroanatomy' }] },
    { id: 'phys', name: 'Physiology', icon: '🫀', description: 'Core mechanisms and the numbers that matter: cardiovascular, respiratory, renal, acid–base, endocrine, neuro and GI.', sources: ['guyton'],
      subdecks: [{ id: 'phys-cv', name: 'Cardiovascular' }, { id: 'phys-resp', name: 'Respiratory' }, { id: 'phys-renal', name: 'Renal' }, { id: 'phys-ab', name: 'Acid–base' }, { id: 'phys-endo', name: 'Endocrine' }, { id: 'phys-neuro', name: 'Neurophysiology' }, { id: 'phys-gi', name: 'Gastrointestinal' }] },
    { id: 'biochem', name: 'Biochemistry & metabolism', icon: '🧪', description: 'Rate-limiting enzymes, vitamins and cofactors, inborn errors of metabolism and lipoproteins.', sources: ['lehninger'], subdecks: [] },
    { id: 'pharm', name: 'Pharmacology', icon: '💊', description: 'Mechanisms of action, key adverse effects, dangerous interactions and antidotes.', sources: ['rang', 'bnf', 'toxbase'],
      subdecks: [{ id: 'pharm-mech', name: 'Mechanisms' }, { id: 'pharm-adr', name: 'Key adverse effects' }, { id: 'pharm-int', name: 'Interactions' }, { id: 'pharm-antidote', name: 'Antidotes' }] },
    { id: 'micro', name: 'Microbiology & infectious disease', icon: '🦠', description: 'Organisms, laboratory clues, toxins, serology and first-line treatments.', sources: ['murray'], subdecks: [] },
    { id: 'path', name: 'Pathology & immunology', icon: '🔬', description: 'Cell injury, inflammation, neoplasia, haematology, renal pathology and the immune system.', sources: ['robbins', 'janeway'], subdecks: [] },
    { id: 'clin', name: 'Clinical essentials', icon: '🚑', description: 'Red flags, emergencies and normal values with units — always check local protocols and laboratory ranges.', sources: ['ohcm', 'guidelines'],
      subdecks: [{ id: 'clin-rf', name: 'Red flags' }, { id: 'clin-em', name: 'Emergencies' }, { id: 'clin-nv', name: 'Normal values' }] }
  ];

  var CARDS = [];
  function deckOf(id) { return id.replace(/-\d{3}$/, ''); }
  function tagList(t) { return String(t || '').split(/\s+/).filter(Boolean); }
  /** Basic card: front / back (+ optional "why" or mnemonic in extra). */
  function B(id, tags, front, back, extra) {
    var c = { id: id, deck: deckOf(id), type: 'basic', front: front, back: back, tags: tagList(tags) };
    if (extra) c.extra = extra;
    CARDS.push(c);
  }
  /** Cloze card: text with {{c1::…}} deletions (+ optional extra). */
  function C(id, tags, text, extra) {
    var c = { id: id, deck: deckOf(id), type: 'cloze', text: text, tags: tagList(tags) };
    if (extra) c.extra = extra;
    CARDS.push(c);
  }

  /* ======================= ANATOMY · Upper limb ======================= */
  B('anat-ul-001', 'brachial-plexus nerves mnemonic',
    'What are the five parts of the brachial plexus, from proximal to distal?',
    'Roots (anterior rami of C5–T1) → trunks → divisions → cords → branches.',
    'Mnemonic: “Real Texans Drink Cold Beer”. The cords are named by their relation to the axillary artery (lateral, medial, posterior).');
  B('anat-ul-002', 'nerves fractures shoulder',
    'Fracture of the surgical neck of the humerus: which nerve is at risk, and what is the deficit?',
    'Axillary nerve (C5–C6): weak abduction (deltoid) and lateral rotation (teres minor), with numbness over the lateral upper arm (“regimental badge” area).',
    'It winds round the surgical neck with the posterior circumflex humeral artery. Anterior shoulder dislocation can injure it too — test sensation before and after reduction.');
  B('anat-ul-003', 'nerves fractures',
    'Mid-shaft fracture of the humerus: which nerve is injured, and what is the classic sign?',
    'Radial nerve in the radial (spiral) groove → wrist drop (weak wrist and finger extension) with numbness over the dorsal first web space.',
    'Triceps is usually spared because its branches arise proximal to the groove. The profunda brachii artery runs with the nerve.');
  B('anat-ul-004', 'fractures arteries nerves paediatrics',
    'Supracondylar fracture of the humerus in a child: which structures are at risk?',
    'The brachial artery and the median nerve (often its anterior interosseous branch); the radial and ulnar nerves can also be injured.',
    'Check distal pulses, capillary refill and the “OK” sign (anterior interosseous nerve). Missed ischaemia leads to compartment syndrome and Volkmann ischaemic contracture.');
  B('anat-ul-005', 'brachial-plexus nerves',
    'Erb (Erb–Duchenne) palsy: which roots, and what posture results?',
    'Upper trunk, C5–C6 → “waiter’s tip”: arm adducted and medially rotated, elbow extended, forearm pronated.',
    'Cause: excessive separation of head and shoulder (shoulder dystocia, a fall onto the shoulder). Deltoid, supraspinatus, infraspinatus, biceps and brachialis are weak.');
  B('anat-ul-006', 'brachial-plexus nerves',
    'Klumpke palsy: which roots, and what are the signs?',
    'Lower trunk, C8–T1 → paralysis of the intrinsic hand muscles (claw hand) with numbness along the medial forearm and hand; Horner syndrome if T1 is involved.',
    'Cause: forceful upward pull of the arm (grabbing a branch while falling, traction at a breech delivery). Also consider a Pancoast tumour or cervical rib.');
  B('anat-ul-007', 'nerves shoulder mnemonic',
    'Injury to the long thoracic nerve produces which sign?',
    'Winging of the scapula (serratus anterior paralysis); the patient cannot raise the arm above the horizontal.',
    'Roots C5–C7 (“C5, 6, 7 raise your wings to heaven”). At risk in axillary surgery because it runs superficially on serratus anterior.');
  C('anat-ul-008', 'muscles shoulder mnemonic',
    'The rotator cuff muscles are {{c1::supraspinatus}}, {{c2::infraspinatus}}, {{c3::teres minor}} and {{c4::subscapularis}}.',
    'SITS. Supraspinatus starts abduction and is the most often torn or impinged; infraspinatus and teres minor rotate laterally; subscapularis rotates medially (the only one inserting on the lesser tubercle).');
  B('anat-ul-009', 'hand wrist nerves',
    'What passes through the carpal tunnel?',
    'The median nerve and nine tendons: four of flexor digitorum superficialis, four of flexor digitorum profundus and flexor pollicis longus.',
    'Flexor carpi radialis runs in its own split of the flexor retinaculum; the ulnar nerve and artery pass superficial to it, through Guyon’s canal.');
  B('anat-ul-010', 'hand wrist nerves clinical',
    'In carpal tunnel syndrome, why is sensation over the thenar eminence usually normal?',
    'The palmar cutaneous branch of the median nerve leaves above the wrist and passes superficial to the flexor retinaculum, so it is not compressed.',
    'Symptoms: tingling in the thumb, index, middle and radial half of the ring finger, often at night; later thenar wasting (abductor pollicis brevis).');
  B('anat-ul-011', 'hand nerves muscles mnemonic',
    'Which hand muscles does the median nerve supply?',
    'LOAF: the Lateral two lumbricals, Opponens pollicis, Abductor pollicis brevis and Flexor pollicis brevis.',
    'All the other intrinsic hand muscles (interossei, medial two lumbricals, hypothenar muscles, adductor pollicis) are supplied by the ulnar nerve.');
  B('anat-ul-012', 'hand nerves clinical',
    'Ulnar nerve injury at the wrist: what posture does the hand adopt?',
    'Clawing of the ring and little fingers — hyperextended MCP joints and flexed IP joints — from paralysis of the medial lumbricals and interossei.',
    'Ulnar paradox: a lesion at the elbow causes less clawing because flexor digitorum profundus to these fingers is weak too. Froment sign = weak adductor pollicis.');
  B('anat-ul-013', 'wrist fractures surface-anatomy',
    'What are the boundaries of the anatomical snuffbox, and why does tenderness there matter?',
    'Radial side: abductor pollicis longus and extensor pollicis brevis tendons; ulnar side: extensor pollicis longus; floor: scaphoid (and trapezium); it contains the radial artery. Tenderness suggests a scaphoid fracture.',
    'The scaphoid’s blood supply enters distally, so a waist fracture can cause avascular necrosis of the proximal pole. Early X-rays may be normal — immobilise and re-image.');
  B('anat-ul-014', 'muscles forearm',
    'Which muscles supinate the forearm?',
    'Biceps brachii (most powerful, with the elbow flexed) and supinator.',
    'That is why turning a screwdriver clockwise with the right hand (supination) is the strong movement.');
  B('anat-ul-015', 'elbow arteries nerves mnemonic',
    'What lies in the cubital fossa, from lateral to medial?',
    'Biceps tendon, brachial artery, median nerve (TAN: Tendon, Artery, Nerve); the radial nerve lies at the lateral edge under brachioradialis.',
    'The median cubital vein crosses the roof (the usual venepuncture site); the bicipital aponeurosis protects the artery and nerve beneath it.');
  B('anat-ul-016', 'reflexes nerves mnemonic',
    'Which spinal roots do the biceps, brachioradialis and triceps reflexes test?',
    'Biceps C5–C6; brachioradialis (supinator) C5–C6; triceps C7–C8.',
    '“1-2 buckle my shoe (S1–S2 ankle), 3-4 kick the door (L3–L4 knee), 5-6 pick up sticks (C5–C6 biceps), 7-8 lay them straight (C7–C8 triceps).”');
  C('anat-ul-017', 'dermatomes hand',
    'Hand dermatomes: thumb {{c1::C6}}, middle finger {{c2::C7}}, little finger {{c3::C8}}.',
    'C5 covers the lateral upper arm (regimental badge area); T1 the medial forearm and elbow.');
  B('anat-ul-018', 'nerves forearm',
    'Posterior interosseous nerve lesion: how does it differ from a radial nerve lesion in the arm?',
    'Finger and thumb drop without wrist drop — extensor carpi radialis longus is spared, so the wrist extends with radial deviation — and no sensory loss.',
    'The posterior interosseous nerve is the deep motor branch of the radial nerve; it can be compressed as it passes through supinator.');
  B('anat-ul-019', 'nerves arm',
    'What does the musculocutaneous nerve supply?',
    'Motor: coracobrachialis, biceps brachii and brachialis (elbow flexion, supination). Sensory: the lateral forearm, as the lateral cutaneous nerve of the forearm.');

  /* ======================= ANATOMY · Lower limb ======================= */
  B('anat-ll-001', 'nerves fractures knee',
    'Fracture of the fibular neck: which nerve is injured, and what is the deficit?',
    'Common fibular (peroneal) nerve → foot drop (no dorsiflexion or eversion) with a high-stepping gait, and numbness over the lateral leg and dorsum of the foot.',
    'It winds superficially round the fibular neck, so tight casts, crossed legs and prolonged squatting can compress it too.');
  B('anat-ll-002', 'nerves foot',
    'Deep fibular nerve lesion: where is the sensory loss?',
    'The first dorsal web space, between the big and second toes.',
    'The deep fibular nerve supplies the anterior compartment (the dorsiflexors).');
  B('anat-ll-003', 'groin arteries veins mnemonic',
    'What lies in the femoral triangle, from lateral to medial?',
    'NAVeL: femoral Nerve, Artery, Vein, (empty space) and Lymphatics in the femoral canal.',
    'Boundaries: inguinal ligament (superior), sartorius (lateral), adductor longus (medial). The femoral sheath encloses the artery, vein and canal but not the nerve.');
  B('anat-ll-004', 'nerves hip gait',
    'Superior gluteal nerve injury: what sign appears?',
    'A positive Trendelenburg sign — standing on the affected leg, the pelvis drops on the opposite (unsupported) side because gluteus medius and minimus are weak.',
    'Gait becomes waddling. Causes: hip surgery, a misplaced gluteal injection, hip disease.');
  B('anat-ll-005', 'nerves clinical procedures',
    'Where in the buttock is an intramuscular injection safe, and why?',
    'The upper outer (superolateral) quadrant — it avoids the sciatic nerve, which runs through the inferomedial part.',
    'Many guidelines now prefer the ventrogluteal site (gluteus medius, between the anterior superior iliac spine and the iliac crest).');
  B('anat-ll-006', 'knee ligaments',
    'A lateral blow to the flexed knee classically injures which three structures (the “unhappy triad”)?',
    'The anterior cruciate ligament, the medial (tibial) collateral ligament and the medial meniscus.',
    'This is the classic O’Donoghue triad; MRI series show that the lateral meniscus is actually torn more often in acute ACL injuries.');
  B('anat-ll-007', 'knee ligaments examination',
    'What do the anterior drawer and Lachman tests examine?',
    'The anterior cruciate ligament, which stops the tibia sliding forwards on the femur.',
    'Lachman (knee at 20–30° of flexion) is the more sensitive test. The posterior drawer test examines the posterior cruciate ligament.');
  B('anat-ll-008', 'nerves reflexes thigh',
    'Which nerve supplies the quadriceps, and which roots does the knee jerk test?',
    'Femoral nerve (L2–L4); the knee (patellar) reflex tests L3–L4.');
  B('anat-ll-009', 'nerves reflexes',
    'Which root does the ankle jerk test?',
    'S1 (via the tibial nerve).',
    'An L5/S1 disc prolapse compressing S1 gives a reduced ankle jerk, weak plantarflexion and numbness of the lateral foot.');
  C('anat-ll-010', 'veins surface-anatomy',
    'The great saphenous vein passes {{c1::anterior to the medial malleolus}} and drains into the {{c2::femoral vein}} at the saphenous opening.',
    'It is used for venous cut-down and as a bypass graft; the saphenous nerve runs with it in the leg and can be injured.');
  B('anat-ll-011', 'hip arteries fractures',
    'Which artery is the main blood supply of the femoral head in adults?',
    'The medial circumflex femoral artery, through retinacular branches running along the femoral neck.',
    'Displaced intracapsular neck-of-femur fractures disrupt it → avascular necrosis, hence arthroplasty. The artery of the ligamentum teres contributes little in adults.');
  B('anat-ll-012', 'ankle nerves arteries mnemonic',
    'Which structures pass behind the medial malleolus (through the tarsal tunnel), from anterior to posterior?',
    'Tibialis posterior, flexor Digitorum longus, posterior tibial Artery, Vein and tibial Nerve, flexor Hallucis longus (“Tom, Dick And Very Nervous Harry”).',
    'The posterior tibial pulse is felt here, midway between the medial malleolus and the calcaneal tendon.');
  B('anat-ll-013', 'knee muscles',
    'Which muscle “unlocks” the fully extended knee?',
    'Popliteus — it laterally rotates the femur on the fixed tibia to start flexion.');
  B('anat-ll-014', 'dermatomes foot',
    'Lower-limb dermatomes: which root supplies the big toe and dorsum of the foot, and which the little toe and lateral foot?',
    'L5: dorsum of the foot and big toe. S1: lateral border of the foot, little toe and sole.',
    'L4 covers the medial leg and medial malleolus; L3 the area just above the knee.');
  B('anat-ll-015', 'leg compartments nerves',
    'Name the three compartments of the leg and their nerves.',
    'Anterior (dorsiflexion) — deep fibular nerve; lateral (eversion) — superficial fibular nerve; posterior (plantarflexion) — tibial nerve.',
    'The anterior compartment is the commonest site of compartment syndrome after a tibial fracture.');
  B('anat-ll-016', 'groin hernia clinical',
    'How do you tell a femoral from an inguinal hernia by its relation to the pubic tubercle?',
    'Femoral: below and lateral to the pubic tubercle. Inguinal: above and medial to it.',
    'Femoral hernias are commoner in women and strangulate easily because the femoral ring is narrow and rigid — they need prompt repair.');
  B('anat-ll-017', 'nerves thigh',
    'Obturator nerve: roots and main motor supply?',
    'L2–L4; the adductor compartment of the thigh (adductor longus, brevis, the adductor part of magnus, gracilis, obturator externus).',
    'The hamstring part of adductor magnus is supplied by the tibial division of the sciatic nerve.');
  B('anat-ll-018', 'nerves knee',
    'Where does the sciatic nerve usually divide, and into what?',
    'Into the tibial and common fibular nerves, usually at the apex of the popliteal fossa.',
    'Sometimes it divides much higher, in the pelvis or gluteal region.');

  /* ========================= ANATOMY · Thorax ========================= */
  B('anat-th-001', 'airway surface-anatomy',
    'At what vertebral level does the trachea bifurcate?',
    'About T4/T5 — level with the sternal angle (the carina).',
    'The carina sits lower (about T6) in deep inspiration and when upright.');
  B('anat-th-002', 'surface-anatomy mediastinum',
    'Which landmarks lie at the level of the sternal angle (of Louis)?',
    'The 2nd costal cartilages, the T4/T5 disc, the tracheal bifurcation, the start and end of the aortic arch, the boundary between superior and inferior mediastinum, and the azygos vein entering the SVC.',
    'Count ribs and intercostal spaces from the 2nd costal cartilage.');
  B('anat-th-003', 'airway clinical',
    'Why is an inhaled foreign body more likely to enter the right main bronchus?',
    'It is wider, shorter and more vertical than the left.',
    'Aspiration while upright usually affects the right lower lobe; when lying supine, the posterior segment of the upper lobe and the superior segment of the lower lobe.');
  B('anat-th-004', 'procedures pleura',
    'Where is the “safe triangle” for chest drain insertion?',
    'Bounded by the lateral border of pectoralis major, the anterior border of latissimus dorsi and a horizontal line at nipple level (5th intercostal space), with its apex below the axilla.',
    'Insert just above the upper border of a rib to avoid the intercostal neurovascular bundle (BTS pleural guideline).');
  B('anat-th-005', 'procedures nerves mnemonic',
    'In what order do the intercostal vein, artery and nerve lie in the costal groove (superior to inferior)?',
    'Vein, Artery, Nerve (VAN), sheltered under the lower border of the rib above.',
    'That is why needles and drains are passed just above a rib.');
  B('anat-th-006', 'heart arteries',
    'What determines coronary “dominance”, and which pattern is commonest?',
    'The artery that gives off the posterior descending (interventricular) artery; right dominance is commonest (about 70%).',
    'Roughly 10% are left dominant (from the circumflex) and 20% co-dominant.');
  B('anat-th-007', 'heart arteries ecg',
    'Which coronary artery usually supplies the SA and AV nodes?',
    'SA node: the right coronary artery in about 60% of people (otherwise the circumflex). AV node: usually the right coronary artery (in right-dominant hearts).',
    'Hence bradycardia and AV block complicating inferior (RCA) myocardial infarction.');
  B('anat-th-008', 'heart arteries ecg',
    'Occlusion of the left anterior descending artery affects which territory, and which ECG leads show it?',
    'The anterior (anteroseptal) left ventricle and anterior two-thirds of the septum — changes in V1–V4.',
    'Circumflex → lateral (I, aVL, V5–V6); right coronary → inferior (II, III, aVF).');
  B('anat-th-009', 'nerves diaphragm mnemonic',
    'Phrenic nerve: roots and supply, and why does diaphragmatic irritation hurt in the shoulder?',
    'C3–C5; motor to the diaphragm and sensory to the central diaphragm, pericardium and mediastinal pleura. Pain is referred to the shoulder tip (C4 dermatome).',
    '“C3, 4, 5 keeps the diaphragm alive.”');
  B('anat-th-010', 'diaphragm surface-anatomy mnemonic',
    'At which vertebral levels do the IVC, oesophagus and aorta pass through the diaphragm?',
    'IVC T8, oesophagus T10, aorta T12.',
    '“I ate (8) ten eggs at twelve.”');
  B('anat-th-011', 'nerves larynx clinical',
    'Around which structures do the right and left recurrent laryngeal nerves loop?',
    'Right: the right subclavian artery. Left: the arch of the aorta, beside the ligamentum arteriosum.',
    'So hoarseness can be the first sign of a left hilar lung cancer, an aortic arch aneurysm or a large left atrium.');
  B('anat-th-012', 'lymphatics',
    'Where does the thoracic duct drain?',
    'Into the junction of the left subclavian and left internal jugular veins (the left venous angle).',
    'It drains lymph from everywhere except the right side of the head, neck and thorax and the right upper limb (right lymphatic duct).');
  B('anat-th-013', 'heart examination surface-anatomy',
    'Where is the normal apex beat?',
    'Left 5th intercostal space, in the midclavicular line.',
    'Displaced laterally and down when the left ventricle dilates; heaving with left ventricular hypertrophy.');
  B('anat-th-014', 'heart examination mnemonic',
    'Where are the four classic auscultation areas?',
    'Aortic: right 2nd intercostal space at the sternal edge. Pulmonary: left 2nd space at the sternal edge. Tricuspid: left lower sternal edge (4th–5th space). Mitral: the apex (left 5th space, midclavicular line).',
    '“All Physicians Take Money”, clockwise from the upper right.');
  B('anat-th-015', 'pleura lungs surface-anatomy',
    'How far down do the lungs and the pleura reach in the midclavicular, midaxillary and paravertebral lines?',
    'Lungs: 6th, 8th and 10th ribs. Pleura: 8th, 10th and 12th ribs (two ribs lower).',
    'The gap between them, the costodiaphragmatic recess, is where effusions collect and where pleural aspiration is done.');
  C('anat-th-016', 'embryology heart',
    'Fetal remnants: ductus arteriosus → {{c1::ligamentum arteriosum}}; foramen ovale → {{c2::fossa ovalis}}; umbilical vein → {{c3::ligamentum teres (round ligament of the liver)}}; ductus venosus → {{c4::ligamentum venosum}}.',
    'The umbilical arteries become the medial umbilical ligaments.');

  /* ================= ANATOMY · Abdomen & pelvis ================= */
  B('anat-ab-001', 'surface-anatomy',
    'What lies at the transpyloric plane (L1)?',
    'The pylorus, neck of the pancreas, duodenojejunal flexure, renal hila, fundus of the gallbladder (tip of the 9th costal cartilage), origin of the superior mesenteric artery and the end of the spinal cord.',
    'It lies halfway between the jugular notch and the pubic symphysis.');
  B('anat-ab-002', 'hernia groin mnemonic',
    'Direct vs indirect inguinal hernia: how do they differ anatomically?',
    'Indirect: enters the deep ring lateral to the inferior epigastric vessels and follows the canal (it can reach the scrotum). Direct: pushes through the posterior wall medial to the vessels (Hesselbach’s triangle).',
    'Indirect hernias are commoner (persistent processus vaginalis); direct hernias are typical of older men with a weak wall. “MDs don’t LIe”: Medial Direct, Lateral Indirect.');
  B('anat-ab-003', 'hernia groin',
    'What are the boundaries of Hesselbach’s (inguinal) triangle?',
    'Inferior epigastric vessels (laterally), the lateral border of rectus abdominis (medially) and the inguinal ligament (inferiorly).',
    'Direct inguinal hernias protrude through it.');
  B('anat-ab-004', 'groin surface-anatomy',
    'Where is the deep inguinal ring?',
    'Just above the midpoint of the inguinal ligament, lateral to the inferior epigastric vessels.',
    'The superficial ring lies above and medial to the pubic tubercle. The femoral pulse is at the mid-inguinal point (halfway between the anterior superior iliac spine and the pubic symphysis).');
  B('anat-ab-005', 'groin male-reproductive mnemonic',
    'What is in the spermatic cord?',
    'Rule of threes — arteries: testicular, cremasteric, artery to the vas; nerves: genital branch of the genitofemoral nerve and autonomic fibres (the ilioinguinal nerve runs alongside, outside the cord); others: vas deferens, pampiniform venous plexus, lymphatics.');
  B('anat-ab-006', 'arteries gut',
    'Which arteries supply the foregut, midgut and hindgut?',
    'Coeliac trunk (T12), superior mesenteric artery (L1) and inferior mesenteric artery (L3).',
    'The midgut ends two-thirds of the way along the transverse colon; the watershed near the splenic flexure is vulnerable to ischaemic colitis.');
  B('anat-ab-007', 'surface-anatomy gut',
    'What is McBurney’s point?',
    'One-third of the way along a line from the anterior superior iliac spine to the umbilicus — the surface marking of the base of the appendix.',
    'The tip of the appendix varies in position; retrocaecal is commonest.');
  B('anat-ab-008', 'veins liver clinical',
    'Name the main portosystemic anastomoses and what they produce in portal hypertension.',
    'Lower oesophagus (left gastric ↔ azygos) → varices; anorectum (superior ↔ middle and inferior rectal veins) → rectal varices; umbilicus (paraumbilical ↔ epigastric veins) → caput medusae; retroperitoneum.',
    'Oesophageal varices can bleed catastrophically.');
  B('anat-ab-009', 'biliary surgery arteries',
    'What are the boundaries of Calot’s (hepatocystic) triangle, and its key content?',
    'Cystic duct, common hepatic duct and the inferior surface of the liver; it contains the cystic artery (usually from the right hepatic artery).',
    'Clearing it to the “critical view of safety” before clipping prevents bile duct injury in cholecystectomy.');
  B('anat-ab-010', 'peritoneum mnemonic',
    'Which abdominal structures are retroperitoneal?',
    'SAD PUCKER: Suprarenal glands, Aorta and IVC, Duodenum (2nd–4th parts), Pancreas (except the tail), Ureters, Colon (ascending and descending), Kidneys, oEsophagus (abdominal part), Rectum (mostly).');
  B('anat-ab-011', 'kidney',
    'Why is the right kidney usually lower than the left?',
    'Because the liver lies above it.',
    'The left renal vein is longer (it crosses in front of the aorta below the SMA), so the left kidney is usually preferred for live donation.');
  B('anat-ab-012', 'kidney ureter clinical',
    'At which three points does the ureter narrow (where stones lodge)?',
    'The pelviureteric junction, where it crosses the pelvic brim (iliac vessels), and the vesicoureteric junction (the narrowest).',
    'Ureteric colic radiates from “loin to groin”.');
  B('anat-ab-013', 'ureter surgery mnemonic',
    '“Water under the bridge”: what does it describe?',
    'The ureter (water) passes under the uterine artery — and under the vas deferens in males.',
    'The ureter is at risk when the uterine artery is clamped during hysterectomy.');
  B('anat-ab-014', 'anorectum lymphatics',
    'Why does the pectinate (dentate) line matter clinically?',
    'Above it: endoderm, visceral (painless) innervation, internal haemorrhoids, adenocarcinoma, lymph to internal iliac nodes. Below it: ectoderm, somatic (painful) pudendal innervation, external haemorrhoids, squamous cell carcinoma, lymph to superficial inguinal nodes.');
  B('anat-ab-015', 'nerves pelvis procedures mnemonic',
    'Pudendal nerve: roots, and where is it blocked?',
    'S2–S4; it is blocked near the ischial spine (pudendal block).',
    '“S2, 3, 4 keeps the penis off the floor” — it also supplies the external anal and urethral sphincters.');
  B('anat-ab-016', 'lymphatics male-reproductive oncology',
    'Lymph from the testis drains to which nodes, and from the scrotum to which?',
    'Testis → para-aortic (lumbar) nodes near L1–L2, following the testicular vessels. Scrotum → superficial inguinal nodes.',
    'So testicular cancer spreads to para-aortic nodes, not the groin, unless the scrotum is involved.');

  /* ======================= ANATOMY · Head & neck ======================= */
  B('anat-hn-001', 'cranial-nerves stroke',
    'Facial weakness: how do an upper and a lower motor neuron lesion differ?',
    'Upper motor neuron (e.g., stroke): weakness of the lower face on the opposite side, with the forehead spared. Lower motor neuron (e.g., Bell palsy): the whole face on the same side, forehead included.',
    'The forehead is spared in UMN lesions because its part of the facial nucleus receives input from both hemispheres.');
  B('anat-hn-002', 'larynx airway',
    'Which is the only muscle that abducts (opens) the vocal cords?',
    'Posterior cricoarytenoid (recurrent laryngeal nerve).',
    'Bilateral recurrent laryngeal nerve damage can therefore cause stridor and airway obstruction.');
  B('anat-hn-003', 'larynx nerves surgery',
    'Which intrinsic laryngeal muscle is NOT supplied by the recurrent laryngeal nerve?',
    'Cricothyroid — supplied by the external branch of the superior laryngeal nerve; it tenses the cords (pitch).',
    'The external branch runs with the superior thyroid artery and can be injured at thyroidectomy (voice fatigue, loss of high notes).');
  B('anat-hn-004', 'arteries skull head-injury',
    'Middle meningeal artery: origin, entry into the skull and clinical importance?',
    'A branch of the maxillary artery; it enters through the foramen spinosum and runs deep to the pterion, where a fracture can tear it → extradural haematoma.',
    'Classic story: head injury, lucid interval, then rapid deterioration; a biconvex (lens-shaped) collection on CT that does not cross sutures.');
  C('anat-hn-005', 'cranial-nerves skull mnemonic',
    'The trigeminal divisions leave the skull through: V1 the {{c1::superior orbital fissure}}, V2 the {{c2::foramen rotundum}}, V3 the {{c3::foramen ovale}}.',
    '“Standing Room Only.” The middle meningeal artery passes through the foramen spinosum.');
  B('anat-hn-006', 'cranial-nerves skull',
    'What passes through the jugular foramen?',
    'Cranial nerves IX, X and XI, the internal jugular vein (continuing from the sigmoid sinus) and the inferior petrosal sinus.');
  B('anat-hn-007', 'cranial-nerves eye clinical',
    'Oculomotor nerve palsy: how does the eye look, and what does pupil involvement suggest?',
    '“Down and out” with ptosis. A dilated, unreactive pupil suggests compression (e.g., a posterior communicating artery aneurysm); ischaemic (diabetic) palsies often spare the pupil.',
    'Pupillary fibres run on the surface of the nerve, so external compression affects them first.');
  B('anat-hn-008', 'cranial-nerves eye',
    'Trochlear nerve palsy: which muscle, and what symptom?',
    'Superior oblique → vertical double vision, worst looking down and in (reading, going downstairs); the head tilts away from the affected side.',
    'The trochlear is the only cranial nerve that leaves the back of the brainstem and crosses to the other side.');
  B('anat-hn-009', 'cranial-nerves eye raised-icp',
    'Abducens nerve palsy: what is seen, and why is it a “false localising sign”?',
    'Failure of abduction with horizontal double vision. Its long intracranial course makes it vulnerable to raised intracranial pressure from a lesion far away.');
  B('anat-hn-010', 'veins face infection',
    'Why is infection of the “danger triangle” of the face dangerous?',
    'Facial veins communicate with the cavernous sinus through the ophthalmic veins, so infection can spread inwards and cause cavernous sinus thrombosis.',
    'The triangle runs from the corners of the mouth to the bridge of the nose.');
  B('anat-hn-011', 'cranial-nerves veins',
    'Which structures pass through the cavernous sinus?',
    'In its lateral wall: cranial nerves III, IV, V1 and V2. Through the sinus itself: the internal carotid artery and the abducens nerve (VI, the most vulnerable).',
    'Cavernous sinus thrombosis: ophthalmoplegia (often VI first), proptosis, chemosis and numbness in V1/V2.');
  B('anat-hn-012', 'neck arteries veins nerves',
    'What does the carotid sheath contain?',
    'The common/internal carotid artery (medial), internal jugular vein (lateral) and vagus nerve (posterior, between them).',
    'Deep cervical lymph nodes lie along it; the ansa cervicalis is embedded in its anterior wall.');
  C('anat-hn-013', 'cranial-nerves face mnemonic',
    'Branches of the facial nerve in the parotid: {{c1::temporal}}, {{c2::zygomatic}}, {{c3::buccal}}, {{c4::marginal mandibular}} and {{c5::cervical}}.',
    '“To Zanzibar By Motor Car.” In the parotid the facial nerve is most superficial, then the retromandibular vein, then the external carotid artery.');
  B('anat-hn-014', 'cranial-nerves glands',
    'Which cranial nerve carries the parasympathetic secretomotor supply to the parotid gland?',
    'The glossopharyngeal nerve (IX), via the lesser petrosal nerve, the otic ganglion and the auriculotemporal nerve (V3).',
    'Frey syndrome after parotidectomy — sweating over the cheek when eating — comes from misdirected regrowth of these fibres.');
  B('anat-hn-015', 'cranial-nerves tongue',
    'Tongue: which nerves carry taste and general sensation, and which supplies its muscles?',
    'Anterior two-thirds: general sensation by the lingual nerve (V3), taste by the chorda tympani (VII). Posterior third: both by IX. Motor: XII (all except palatoglossus, supplied by X).');
  B('anat-hn-016', 'cranial-nerves tongue',
    'Hypoglossal nerve lesion: which way does the tongue deviate on protrusion?',
    'Towards the side of the lesion (the healthy genioglossus pushes it across).',
    'A lower motor neuron lesion also causes wasting and fasciculation on that side.');
  B('anat-hn-017', 'scalp head-injury mnemonic',
    'Name the layers of the scalp and the clinically important one.',
    'SCALP: Skin, dense Connective tissue, Aponeurosis (galea), Loose areolar tissue, Pericranium. The loose areolar layer is the “danger layer” — emissary veins can carry infection into the skull.',
    'Scalp wounds bleed heavily because vessels in the dense connective tissue are held open.');
  B('anat-hn-018', 'thyroid neck examination',
    'Why does a thyroid swelling move up on swallowing?',
    'The thyroid is enclosed in pretracheal fascia attached to the larynx (thyroid and cricoid cartilages).',
    'A thyroglossal cyst also moves up when the tongue is protruded.');

  /* ======================= ANATOMY · Neuroanatomy ======================= */
  B('anat-neuro-001', 'cortex speech stroke',
    'Where is Broca’s area, and what does damage cause?',
    'The inferior frontal gyrus of the dominant (usually left) hemisphere → expressive (non-fluent) aphasia with relatively preserved comprehension.',
    'Often with right face and arm weakness (neighbouring motor cortex, MCA territory).');
  B('anat-neuro-002', 'cortex speech stroke',
    'Where is Wernicke’s area, and what does damage cause?',
    'The posterior superior temporal gyrus of the dominant hemisphere → receptive (fluent) aphasia: fluent but meaningless speech with poor comprehension.',
    'Patients are often unaware of their errors.');
  B('anat-neuro-003', 'stroke arteries',
    'Middle cerebral artery stroke: typical deficits?',
    'Contralateral weakness and sensory loss of the face and arm more than the leg, homonymous hemianopia, plus aphasia (dominant side) or neglect (non-dominant side).');
  B('anat-neuro-004', 'stroke arteries',
    'Anterior cerebral artery stroke: typical deficits?',
    'Contralateral weakness and sensory loss of the leg more than the arm — the leg area lies on the medial surface of the hemisphere.',
    'There may also be apathy, behavioural change and urinary incontinence.');
  B('anat-neuro-005', 'stroke vision',
    'Posterior cerebral artery stroke: classic visual finding?',
    'Contralateral homonymous hemianopia with macular sparing.',
    'Macular sparing reflects collateral (MCA) supply to the occipital pole.');
  B('anat-neuro-006', 'spinal-cord tracts',
    'Dorsal column–medial lemniscus pathway: which modalities, and where does it cross?',
    'Fine touch, vibration and proprioception; it crosses in the medulla (internal arcuate fibres → medial lemniscus).',
    'So a spinal cord lesion causes loss on the same side below the lesion.');
  B('anat-neuro-007', 'spinal-cord tracts',
    'Spinothalamic tract: which modalities, and where does it cross?',
    'Pain and temperature (and crude touch); fibres cross within one or two segments of entry, in the anterior white commissure.',
    'So a cord lesion causes loss on the opposite side below it. Syringomyelia damages the crossing fibres first → cape-like loss of pain and temperature.');
  B('anat-neuro-008', 'spinal-cord clinical',
    'Brown-Séquard syndrome (cord hemisection): what are the findings?',
    'Same side below the lesion: spastic weakness (corticospinal) and loss of vibration and proprioception (dorsal columns). Opposite side: loss of pain and temperature (spinothalamic), starting a level or two below.');
  B('anat-neuro-009', 'spinal-cord tracts motor',
    'Where do most corticospinal fibres cross?',
    'In the pyramidal decussation of the lower medulla (about 85–90% form the lateral corticospinal tract).',
    'So lesions above the decussation cause contralateral weakness and lesions in the cord cause ipsilateral weakness.');
  B('anat-neuro-010', 'motor examination',
    'Upper vs lower motor neuron signs?',
    'Upper: increased tone (spasticity), brisk reflexes, extensor plantar (Babinski), little wasting. Lower: reduced tone, reduced or absent reflexes, wasting and fasciculation.',
    'Pyramidal weakness pattern in UMN lesions: arm extensors and leg flexors are weakest.');
  B('anat-neuro-011', 'cerebellum examination mnemonic',
    'What are the signs of a cerebellar lesion?',
    'DANISH: Dysdiadochokinesia, Ataxia, Nystagmus, Intention tremor, Slurred (scanning) speech, Hypotonia — on the same side as the lesion.',
    'Midline (vermis) lesions mainly cause truncal and gait ataxia.');
  B('anat-neuro-012', 'csf ventricles',
    'Trace the flow of cerebrospinal fluid.',
    'Lateral ventricles → interventricular foramina (of Monro) → third ventricle → cerebral aqueduct (of Sylvius) → fourth ventricle → median (Magendie) and lateral (Luschka) apertures → subarachnoid space → arachnoid granulations → dural venous sinuses.',
    'Blockage at the aqueduct causes non-communicating (obstructive) hydrocephalus.');
  B('anat-neuro-013', 'csf',
    'Where is CSF made, how much per day, and what is its total volume?',
    'Mainly by the choroid plexus; about 500 mL a day; total volume about 150 mL (renewed 3–4 times a day).');
  B('anat-neuro-014', 'csf procedures spinal-cord',
    'At what level is a lumbar puncture done in adults, and why?',
    'The L3/L4 or L4/L5 interspace — the spinal cord ends at about L1/L2, so below that the needle meets only the cauda equina.',
    'The line joining the iliac crests (Tuffier’s line) crosses about L4.');
  B('anat-neuro-015', 'vision',
    'Visual field defects: optic chiasm compression vs optic tract lesion?',
    'Chiasm (e.g., pituitary adenoma): bitemporal hemianopia. Optic tract: contralateral homonymous hemianopia.',
    'Temporal lobe (Meyer’s loop) lesion → contralateral superior quadrantanopia (“pie in the sky”); parietal → inferior quadrantanopia.');
  B('anat-neuro-016', 'autonomic eye',
    'Horner syndrome: features, and which pathway is interrupted?',
    'Partial ptosis, miosis and anhidrosis (± apparent enophthalmos), from interruption of the sympathetic pathway: hypothalamus → T1 cord → sympathetic chain/superior cervical ganglion → along the carotid artery.',
    'Causes include a Pancoast (lung apex) tumour, carotid dissection (painful) and lateral medullary stroke.');
  B('anat-neuro-017', 'cranial-nerves eye reflexes',
    'Pupillary light reflex: afferent and efferent limbs?',
    'Afferent: optic nerve (II) → pretectal nuclei → both Edinger–Westphal nuclei. Efferent: parasympathetic fibres in the oculomotor nerve (III) → ciliary ganglion → sphincter pupillae.',
    'Both pupils constrict (consensual reflex). A relative afferent pupillary defect points to optic nerve or severe retinal disease.');

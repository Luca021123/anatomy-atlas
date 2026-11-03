/* ==========================================================================
   Salus · H2 "Get help now" — lay triage logic (MTLib.triageLay)

   Pure functions and constants only: no DOM, no MT. Every user-facing string
   here is an ENGLISH SOURCE string; the UI passes it through MT.t() at render
   time so it can be translated later. Keep wording at reading grade ~6.

   Design rules (docs/research/public-health-brief.md, section C; npj Digit Med
   2022 review of symptom checkers): red-flag first, rule based, conservative.
   The only outcomes are 'emergency', 'urgent' and 'watch'. There is NO "fine"
   outcome: 'watch' always carries a safety net ("watch for…, get care if…").

   Sources (shown in the UI through SOURCES):
   - WHO IMCI chart booklet (2014): 4 general danger signs; fast-breathing cut-offs
     counted for one full minute (under 2 months >=60; 2 up to 12 months >=50;
     12 months up to 5 years >=40); chest indrawing; stridor in a calm child; severe
     dehydration; severe palmar pallor; stiff neck. VERIFIED in research notes
     (docs/research/emergency-prevention-fsrs.md, topic 2). Chest indrawing is
     classed as "go now" here (pre-2014 charts and many national adaptations),
     which is the conservative choice.
   - WHO (2015) PSBI guideline: the 7 young-infant signs (not feeding well,
     convulsions, fast breathing >=60, severe chest indrawing, fever, low body
     temperature <35.5 C, movement only when stimulated). Fever cut-off uses the
     IMCI chart value 37.5 C (the lower, more conservative of the two in use).
   - WHO PCPNC (2015) and WHO ANC recommendations (2016): pregnancy and
     postpartum danger signs (UNVERIFIED this session; mainstream, conservative).
   - FAST stroke recognition (ERC/RCUK 2025 First Aid, ILCOR 2025); "balance and
     eyes" shown as an extra emergency item (AHA/ASA BE-FAST public education).
   - Heart-attack warning signs (AHA; ERC 2025 First Aid).
   - UK Sepsis Trust adult lay signs (VERIFIED in research notes); NICE NG51.
   - Adult breathing: >=30/min is the danger sign (task brief). Normal resting
     range 12-20/min and the slow-breathing bands follow RCP NEWS2 (2017)
     (long-standing guidance, UNVERIFIED this session); used only to send people
     to care sooner, never to reassure.
   - WHO mhGAP-IG 2.0 (2016) self-harm/suicide module; WHO LIVE LIFE (2021).
   - Emergency numbers: see EMERGENCY_NUMBERS below.
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;      // Node tests
  else (root.MTLib = root.MTLib || {}).triageLay = lib;                         // browser: MTLib.triageLay
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Possible outcomes, most serious first. Deliberately no "fine"/"ok" level. */
  var LEVELS = ['emergency', 'urgent', 'watch'];
  /** GSM-standard emergency number: works from most mobile phones in most countries. */
  var FALLBACK_NUMBER = '112';

  /* ----------------------------------------------------------------------
     Sources (labels are proper names of documents; shown in the UI)
     ---------------------------------------------------------------------- */
  var SOURCES = {
    imci: { label: 'WHO. Integrated Management of Childhood Illness (IMCI) chart booklet. Geneva: WHO; 2014.' },
    psbi: { label: 'WHO. Managing possible serious bacterial infection in young infants when referral is not feasible. Geneva: WHO; 2015.', url: 'https://www.who.int/publications/i/item/9789241509268' },
    pcpnc: { label: 'WHO. Pregnancy, childbirth, postpartum and newborn care: a guide for essential practice, 3rd edition. Geneva: WHO; 2015.' },
    anc: { label: 'WHO recommendations on antenatal care for a positive pregnancy experience. Geneva: WHO; 2016.', url: 'https://www.who.int/publications/i/item/9789241549912' },
    ercFirstAid: { label: 'European Resuscitation Council Guidelines 2025: First Aid.', url: 'https://www.resuscitationjournal.com/article/S0300-9572(25)00264-3/fulltext' },
    ilcor: { label: 'ILCOR 2025 International Consensus on First Aid Science with Treatment Recommendations.', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001358' },
    ahaRedCross: { label: 'American Heart Association and American Red Cross. 2024 Guidelines for First Aid.', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001281' },
    sepsisTrust: { label: 'UK Sepsis Trust. Sepsis: spot the signs.', url: 'https://sepsistrust.org/' },
    nice51: { label: 'NICE guideline NG51. Suspected sepsis: recognition, diagnosis and early management.', url: 'https://www.nice.org.uk/guidance/ng51' },
    news2: { label: 'Royal College of Physicians. National Early Warning Score (NEWS) 2. London: RCP; 2017.' },
    mhgap: { label: 'WHO. mhGAP Intervention Guide, version 2.0 (self-harm and suicide). Geneva: WHO; 2016.' },
    liveLife: { label: 'WHO. LIVE LIFE: an implementation guide for suicide prevention in countries. Geneva: WHO; 2021.' }
  };

  /* ----------------------------------------------------------------------
     "Do I need help now?" groups and danger signs.
     Sign ids are globally unique, so a sign keeps its level even if the
     caller passes the wrong group. link: 'fa:<first-aid id>' | 'breath:<band>' | 'crisis'
     ---------------------------------------------------------------------- */
  var GROUPS = [
    {
      id: 'adult', icon: '🧑', label: 'An adult, or a child over 5',
      hint: 'Sudden illness or injury in anyone over 5 years old.',
      subject: 'the person',
      sources: ['ercFirstAid', 'ilcor', 'sepsisTrust', 'nice51', 'ahaRedCross'],
      sections: [
        {
          level: 'emergency', title: 'Sudden or serious signs',
          signs: [
            { id: 'ad-stroke', icon: '😐', text: 'Face drooping, an arm or leg suddenly weak or numb, or speech slurred or strange (stroke signs)', link: 'fa:stroke' },
            { id: 'ad-stroke2', icon: '👁️', text: 'Sudden loss of balance, or sudden loss of sight or double vision', link: 'fa:stroke' },
            { id: 'ad-chest', icon: '💔', text: 'Chest pain, pressure or tightness for more than a few minutes. It may spread to the arm, jaw, neck or back', link: 'fa:heart-attack' },
            { id: 'ad-breath', icon: '😮', text: 'Severe trouble breathing: cannot speak in full sentences, or lips are blue or grey' },
            { id: 'ad-unresp', icon: '😶', text: 'Not responding, very hard to wake, or not breathing normally', link: 'fa:cpr' },
            { id: 'ad-confused', icon: '😵', text: 'Suddenly confused, very drowsy, or acting very strangely' },
            { id: 'ad-seizure', icon: '⚡', text: 'A fit (seizure) that lasts more than 5 minutes, is their first fit, or they do not wake up properly after it', link: 'fa:seizure' },
            { id: 'ad-headache', icon: '🤕', text: 'Sudden, very bad headache: the worst ever, at full strength within about a minute' },
            { id: 'ad-bleed', icon: '🩸', text: 'Heavy bleeding that does not stop when you press on it, or vomiting blood', link: 'fa:bleeding' },
            { id: 'ad-allergy', icon: '💉', text: 'Swelling of the lips, tongue or throat, or trouble breathing, after a food, sting or medicine', link: 'fa:anaphylaxis' },
            { id: 'ad-rash', icon: '🔴', text: 'Fever with a stiff neck, or with a rash that does not fade when you press a glass on it' },
            { id: 'ad-dehyd', icon: '💧', text: 'Severe dehydration: no urine (pee) or very little, very dizzy or faint, cannot keep any drink down', link: 'fa:dehydration' },
            { id: 'ad-suicide', icon: '💭', text: 'Has hurt themselves, or talks about ending their life and has a plan', link: 'crisis' },
            { id: 'ad-poison', icon: '☠️', text: 'Has taken an overdose, or swallowed poison or a chemical', link: 'fa:poisoning' },
            { id: 'ad-injury', icon: '🚑', text: 'A serious injury: a bad fall, a crash, a deep wound, or a large burn', link: 'fa:bleeding' }
          ]
        },
        {
          level: 'emergency', title: 'Signs of sepsis (a severe reaction to an infection)',
          note: 'Sepsis is more likely if there is also an infection or a fever. Confusion and severe breathlessness (above) are also signs of sepsis.',
          signs: [
            { id: 'ad-sep-shiver', icon: '🥶', text: 'Extreme shivering, or very bad muscle pain' },
            { id: 'ad-sep-urine', icon: '🚱', text: 'Has not passed any urine (pee) all day' },
            { id: 'ad-sep-skin', icon: '🎨', text: 'Skin is blotchy (mottled), bluish, grey or very pale' },
            { id: 'ad-sep-feel', icon: '😰', text: 'Says "I feel like I might die", or something feels very wrong' }
          ]
        },
        {
          level: 'urgent', title: 'Other warning signs',
          signs: [
            { id: 'ad-u-fever', icon: '🌡️', text: 'A fever that has lasted more than 3 days' },
            { id: 'ad-u-malaria', icon: '🦟', text: 'Fever, and they live in or have visited an area with malaria' },
            { id: 'ad-u-breath', icon: '💨', text: 'Breathing is faster or harder than usual, but they can still talk', link: 'breath:adult' },
            { id: 'ad-u-gut', icon: '🤢', text: 'Vomiting or diarrhoea for more than 2 days, or blood in the poo' },
            { id: 'ad-u-belly', icon: '😣', text: 'Bad pain in the belly that is not going away' },
            { id: 'ad-u-urine', icon: '🚽', text: 'Pain when passing urine, with fever or pain in the back or side' },
            { id: 'ad-u-skin', icon: '🩹', text: 'A wound or area of skin that is red, hot, swollen and getting worse' },
            { id: 'ad-u-leg', icon: '🦵', text: 'One leg is painful, red or swollen' },
            { id: 'ad-u-cough', icon: '😷', text: 'Coughing up blood' }
          ]
        }
      ],
      whileWaiting: [
        'Stay with them.',
        'If they are not breathing normally, start CPR.',
        'If they are breathing but will not wake up, roll them onto their side (recovery position).',
        'Do not give food or drink if they are drowsy, confused, or in severe pain.',
        'Get their medicines and any health papers ready to take with you.'
      ],
      watchFor: [
        'Trouble breathing, or chest pain',
        'Confusion, or being very sleepy',
        'Weakness of the face, arm or leg, or slurred speech',
        'A rash that does not fade under a glass',
        'Passing very little or no urine'
      ],
      careIf: [
        'They get worse, or a new sign appears.',
        'You are worried. Trust that feeling.'
      ],
      notBetterDays: 3,
      notBetter: 'Get care if they are not getting better after 3 days.'
    },
    {
      id: 'child', icon: '🧒', label: 'A child from 2 months to 5 years',
      hint: 'Uses the WHO danger signs for sick children (IMCI).',
      subject: 'the child',
      sources: ['imci', 'nice51'],
      sections: [
        {
          level: 'emergency', title: 'Danger signs',
          signs: [
            { id: 'ch-drink', icon: '🍼', text: 'Not able to drink or breastfeed' },
            { id: 'ch-vomit', icon: '🤮', text: 'Vomits everything (cannot keep anything down)' },
            { id: 'ch-fits', icon: '⚡', text: 'Has had fits (convulsions) in this illness, or is having one now', link: 'fa:seizure' },
            { id: 'ch-sleepy', icon: '😴', text: 'Very sleepy, floppy or hard to wake, or unconscious' },
            { id: 'ch-indrawing', icon: '⬇️', text: 'The lower chest pulls in (sinks in) each time the child breathes in' },
            { id: 'ch-stridor', icon: '🔊', text: 'A harsh, noisy sound when breathing in, even when calm' },
            { id: 'ch-blue', icon: '🔵', text: 'Blue or grey lips or tongue' },
            { id: 'ch-neck', icon: '🤕', text: 'Stiff neck (cannot bend the head forward)' },
            { id: 'ch-rash', icon: '🔴', text: 'Fever with a rash that does not fade when you press a glass on it' },
            { id: 'ch-dehyd', icon: '💧', text: 'Diarrhoea, with sunken eyes and skin that goes back very slowly when pinched', link: 'fa:dehydration' },
            { id: 'ch-pale', icon: '✋', text: 'The palms of the hands are very pale (white)' },
            { id: 'ch-injury', icon: '☠️', text: 'Swallowed poison or medicine, a bad burn, or a serious injury', link: 'fa:poisoning' }
          ]
        },
        {
          level: 'urgent', title: 'Other warning signs',
          signs: [
            { id: 'ch-u-fast', icon: '⏱️', text: 'Fast breathing: 50 or more breaths in 1 minute (2 to 12 months), or 40 or more (1 to 5 years)', link: 'breath:child' },
            { id: 'ch-u-thirsty', icon: '🥤', text: 'Diarrhoea, with sunken eyes, or very thirsty and drinks eagerly', link: 'fa:dehydration' },
            { id: 'ch-u-blood', icon: '🩸', text: 'Blood in the poo' },
            { id: 'ch-u-malaria', icon: '🦟', text: 'Fever, and you live in or have visited an area with malaria' },
            { id: 'ch-u-ear', icon: '👂', text: 'Ear pain, or pus coming from the ear' },
            { id: 'ch-u-thin', icon: '🦶', text: 'Swelling of both feet, or the child is very thin' }
          ]
        }
      ],
      whileWaiting: [
        'Keep the child warm.',
        'Keep breastfeeding, or give small sips of fluid, if the child can drink.',
        'If the child has a fit, lay them on their side. Do not put anything in the mouth.',
        'Take the child\'s health card and any medicines with you.'
      ],
      // WHO IMCI "when to return immediately" (mother's card)
      watchFor: [
        'Not able to drink or breastfeed',
        'Becomes sicker',
        'Develops a fever',
        'Fast or difficult breathing',
        'Blood in the poo, or drinking poorly'
      ],
      careIf: [
        'Any of these signs appear. Go at once.',
        'You are worried. Trust that feeling.'
      ],
      notBetterDays: 2,
      notBetter: 'Take the child to a health worker if they are not better in 2 days.'
    },
    {
      id: 'infant', icon: '👶', label: 'A baby under 2 months old',
      hint: 'Young babies can become very sick quickly. Uses WHO signs for young infants.',
      subject: 'the baby',
      sources: ['psbi', 'imci'],
      sections: [
        {
          level: 'emergency', title: 'Danger signs',
          signs: [
            { id: 'in-feed', icon: '🍼', text: 'Not feeding well, or has stopped feeding' },
            { id: 'in-fits', icon: '⚡', text: 'Fits (convulsions)' },
            { id: 'in-fast', icon: '⏱️', text: 'Fast breathing: 60 or more breaths in 1 minute', link: 'breath:infant' },
            { id: 'in-indrawing', icon: '⬇️', text: 'The lower chest sinks in deeply each time the baby breathes in' },
            { id: 'in-fever', icon: '🌡️', text: 'Fever: feels hot, or temperature 37.5 °C or more' },
            { id: 'in-cold', icon: '❄️', text: 'Feels cold, or temperature below 35.5 °C' },
            { id: 'in-move', icon: '😴', text: 'Moves only when touched, or does not move at all' },
            { id: 'in-blue', icon: '🔵', text: 'Blue or grey lips or tongue' },
            { id: 'in-yellow', icon: '🟡', text: 'Yellow skin on the first day of life, or yellow palms and soles' }
          ]
        },
        {
          level: 'urgent', title: 'Other warning signs',
          signs: [
            { id: 'in-u-diarrhoea', icon: '💧', text: 'Diarrhoea: much more watery poo than usual for this baby', link: 'fa:dehydration' },
            { id: 'in-u-cord', icon: '🔴', text: 'The belly button is red or has pus, or there are skin spots with pus' },
            { id: 'in-u-eyes', icon: '👁️', text: 'Eyes are red or swollen, or have pus' }
          ]
        }
      ],
      whileWaiting: [
        'Keep the baby warm: hold the baby skin-to-skin on your chest and cover you both.',
        'Keep breastfeeding on the way, if the baby can feed.',
        'Take the baby\'s health card with you.'
      ],
      watchFor: [
        'Feeding poorly',
        'Fever, or feeling cold',
        'Fast breathing, or the chest sinking in',
        'Fits',
        'Moving less than usual',
        'Yellow skin'
      ],
      careIf: [
        'The baby seems unwell in any way. Get them checked today.',
        'You are worried. Trust that feeling.'
      ],
      notBetterDays: 1,
      notBetter: 'Young babies can get very sick quickly. If the baby is not better within 1 day, see a health worker.'
    },
    {
      id: 'pregnant', icon: '🤰', label: 'Someone pregnant, or who gave birth in the last 6 weeks',
      hint: 'Uses the WHO danger signs in pregnancy and after birth.',
      subject: 'the mother',
      sources: ['pcpnc', 'anc'],
      sections: [
        {
          level: 'emergency', title: 'Danger signs',
          signs: [
            { id: 'pr-bleed', icon: '🩸', text: 'Bleeding from the vagina during pregnancy' },
            { id: 'pr-pph', icon: '🩸', text: 'After birth: heavy bleeding (soaking a pad in an hour or less), or large clots' },
            { id: 'pr-fits', icon: '⚡', text: 'Fits (convulsions)' },
            { id: 'pr-headache', icon: '🤕', text: 'Severe headache, with blurred vision or seeing spots' },
            { id: 'pr-belly', icon: '😣', text: 'Severe pain in the belly' },
            { id: 'pr-breath', icon: '😮', text: 'Fast or difficult breathing, or chest pain' },
            { id: 'pr-feverweak', icon: '🌡️', text: 'Fever, and too weak to get out of bed' },
            { id: 'pr-move', icon: '👶', text: 'The baby is moving less than usual, or has stopped moving' },
            { id: 'pr-waters', icon: '💧', text: 'Waters break, or fluid leaks from the vagina, before labour starts' },
            { id: 'pr-early', icon: '⏰', text: 'Regular labour pains more than 3 weeks before the due date' },
            { id: 'pr-faint', icon: '😵', text: 'Fainting, or very drowsy or confused' },
            { id: 'pr-harm', icon: '💭', text: 'Thoughts of harming herself or the baby, or seeing or hearing things that are not there', link: 'crisis' }
          ]
        },
        {
          level: 'urgent', title: 'Other warning signs',
          signs: [
            { id: 'pr-u-fever', icon: '🌡️', text: 'Fever' },
            { id: 'pr-u-swell', icon: '🖐️', text: 'Swelling of the face, hands or fingers' },
            { id: 'pr-u-leg', icon: '🦵', text: 'One leg is painful, red or swollen' },
            { id: 'pr-u-smell', icon: '🤢', text: 'Bad-smelling fluid from the vagina' },
            { id: 'pr-u-breast', icon: '🤱', text: 'A painful, red, hot area on the breast' },
            { id: 'pr-u-urine', icon: '🚽', text: 'Pain or burning when passing urine' },
            { id: 'pr-u-vomit', icon: '🤮', text: 'Vomiting so much that she cannot keep food or drink down' },
            { id: 'pr-u-mood', icon: '😔', text: 'Feeling very sad, hopeless or anxious most of the day' }
          ]
        }
      ],
      whileWaiting: [
        'Lie on your left side while you wait.',
        'Ask someone to go with you.',
        'Take your pregnancy or health card with you.'
      ],
      watchFor: [
        'Bleeding',
        'Severe headache or blurred vision',
        'Fits',
        'Severe belly pain',
        'Fever',
        'The baby moving less than usual'
      ],
      careIf: [
        'Any of these signs appear. Go at once.',
        'You feel unwell or are worried. Trust that feeling.'
      ],
      notBetterDays: 1,
      notBetter: 'If you feel unwell and are not better within 1 day, see a health worker.'
    },
    {
      id: 'mental', icon: '💭', label: 'Someone in a mental-health crisis',
      hint: 'Suicidal thoughts, self-harm, or very distressing thoughts. "The person" can be you.',
      subject: 'the person',
      sources: ['mhgap', 'liveLife'],
      sections: [
        {
          level: 'emergency', title: 'Danger signs',
          signs: [
            { id: 'mh-harmed', icon: '🩹', text: 'Has hurt themselves badly, or taken an overdose or poison', link: 'fa:overdose' },
            { id: 'mh-plan', icon: '📝', text: 'Talks about ending their life and has a plan or a way to do it (pills, a weapon, rope, pesticide)', link: 'crisis' },
            { id: 'mh-goodbye', icon: '👋', text: 'Is saying goodbye, giving things away, or has written a note', link: 'crisis' },
            { id: 'mh-others', icon: '⚠️', text: 'May hurt someone else' },
            { id: 'mh-psychosis', icon: '🌀', text: 'Sees or hears things others cannot, or is very confused, and may not be safe' },
            { id: 'mh-intox', icon: '🍺', text: 'Is very drunk or high and cannot keep themselves safe' }
          ]
        },
        {
          level: 'urgent', title: 'Other warning signs',
          signs: [
            { id: 'mh-u-thoughts', icon: '💭', text: 'Has thoughts of suicide, but no plan, and can stay safe for now', link: 'crisis' },
            { id: 'mh-u-selfharm', icon: '🩹', text: 'Has hurt themselves recently (a small injury)' },
            { id: 'mh-u-mania', icon: '🌙', text: 'Has hardly slept for days and seems very "high", out of control, or not like themselves' },
            { id: 'mh-u-coping', icon: '😔', text: 'Feels hopeless, or cannot eat, drink or look after themselves' }
          ]
        }
      ],
      whileWaiting: [
        'Stay with them. Do not leave them alone.',
        'Remove things they could use to hurt themselves: medicines, weapons, ropes, pesticides and other poisons.',
        'Speak calmly. Listen without judging.',
        'If they took an overdose, take the medicine packets with you to the hospital.'
      ],
      watchFor: [
        'Talking about suicide or wanting to die',
        'Hurting themselves',
        'Saying goodbye or giving things away',
        'Using more alcohol or drugs',
        'Pulling away from everyone'
      ],
      careIf: [
        'Any of these signs appear. Get help at once.',
        'Thoughts of suicide come back. Call a helpline. You do not have to be in danger to call.'
      ],
      notBetterDays: 14,
      notBetter: 'If low mood, worry or stress lasts most days for 2 weeks or more, talk to a health worker.'
    }
  ];

  var GROUP_INDEX = {}, SIGN_INDEX = {};
  GROUPS.forEach(function (g) {
    GROUP_INDEX[g.id] = g;
    g.sections.forEach(function (sec) {
      sec.signs.forEach(function (s) {
        if (SIGN_INDEX[s.id]) throw new Error('Duplicate sign id ' + s.id);
        SIGN_INDEX[s.id] = { id: s.id, icon: s.icon, text: s.text, link: s.link || null, level: sec.level, group: g.id };
      });
    });
  });

  /**
   * Assess ticked danger signs. Unknown ids are ignored; known ids keep their level
   * whatever group is passed. Returns { level: 'emergency'|'urgent'|'watch', group,
   * emergency:[ids], urgent:[ids], count }. Never returns a reassuring "fine" level.
   */
  function assess(groupId, selectedIds) {
    var em = [], ur = [], seen = {};
    (Array.isArray(selectedIds) ? selectedIds : []).forEach(function (id) {
      var s = SIGN_INDEX[id];
      if (!s || seen[id]) return;
      seen[id] = true;
      if (s.level === 'emergency') em.push(id); else if (s.level === 'urgent') ur.push(id);
    });
    return {
      level: em.length ? 'emergency' : (ur.length ? 'urgent' : 'watch'),
      group: GROUP_INDEX[groupId] ? groupId : null,
      emergency: em,
      urgent: ur,
      count: em.length + ur.length
    };
  }
  function groupSigns(groupId, level) {
    var g = GROUP_INDEX[groupId], out = [];
    if (!g) return out;
    g.sections.forEach(function (sec) { if (!level || sec.level === level) sec.signs.forEach(function (s) { out.push(SIGN_INDEX[s.id]); }); });
    return out;
  }

  /* ----------------------------------------------------------------------
     Breath counter. WHO IMCI: count for one full minute while the child is
     calm. Fast breathing: under 2 months >=60; 2 up to 12 months >=50;
     12 months up to 5 years >=40. A young infant with fast breathing has a
     PSBI sign -> 'emergency'; an older child with fast breathing alone ->
     'urgent' (see a health worker today).
     Adult (16+): >=30 = danger sign (task brief); 21-29 faster than the normal
     resting range (12-20) -> 'urgent'; 9-11 -> 'urgent'; <=8 -> 'emergency'
     (RCP NEWS2 bands; conservative). No cut-off is offered for 5-15 years.
     ---------------------------------------------------------------------- */
  var MAX_RATE = 150;
  var BREATH_BANDS = [
    { id: 'infant', label: 'Baby under 2 months', minMonths: 0, maxMonths: 2, fast: 60, fastLevel: 'emergency', group: 'infant' },
    { id: 'baby', label: 'Baby 2 to 12 months', minMonths: 2, maxMonths: 12, fast: 50, fastLevel: 'urgent', group: 'child' },
    { id: 'child', label: 'Child 1 to 5 years', minMonths: 12, maxMonths: 60, fast: 40, fastLevel: 'urgent', group: 'child' },
    { id: 'adult', label: 'Adult (16 years or older)', minMonths: 192, maxMonths: Infinity, veryFast: 30, fast: 21, normalLow: 12, normalHigh: 20, verySlow: 8, group: 'adult' }
  ];
  var BAND_INDEX = {};
  BREATH_BANDS.forEach(function (b) { BAND_INDEX[b.id] = b; });

  /** IMCI age band for an age in months (2 months -> 'baby'; 12 months -> 'child'); null for 5-15 years. */
  function bandForAgeMonths(months) {
    if (typeof months !== 'number' || !isFinite(months) || months < 0) return null;
    for (var i = 0; i < BREATH_BANDS.length; i++) { var b = BREATH_BANDS[i]; if (months >= b.minMonths && months < b.maxMonths) return b.id; }
    return null;
  }
  function validRate(rate) { return typeof rate === 'number' && isFinite(rate) && rate >= 0 && rate <= MAX_RATE; }

  /**
   * Classify a one-minute breath count. Returns null for an unknown band or an
   * implausible count, else { band, rate, level, reason, threshold, fast }.
   * reason: 'none' | 'fast' | 'not-fast' | 'very-fast' | 'normal' | 'slow' | 'very-slow'
   */
  function classifyBreathing(bandId, rate) {
    var b = BAND_INDEX[bandId];
    if (!b || !validRate(rate)) return null;
    rate = Math.round(rate);
    function out(level, reason, threshold) { return { band: b.id, rate: rate, level: level, reason: reason, threshold: threshold, fast: reason === 'fast' || reason === 'very-fast' }; }
    if (rate === 0) return out('emergency', 'none', null);
    if (b.id === 'adult') {
      if (rate >= b.veryFast) return out('emergency', 'very-fast', b.veryFast);
      if (rate >= b.fast) return out('urgent', 'fast', b.fast);
      if (rate >= b.normalLow) return out('watch', 'normal', b.normalLow);
      if (rate > b.verySlow) return out('urgent', 'slow', b.normalLow);
      return out('emergency', 'very-slow', b.verySlow);
    }
    if (rate >= b.fast) return out(b.fastLevel, 'fast', b.fast);
    return out('watch', 'not-fast', b.fast);
  }

  /* ----------------------------------------------------------------------
     Emergency numbers.
     Built-in list limited to long-standing national numbers we are highly
     confident of. Origin: community aggregators (research brief section D)
     plus long-standing public knowledge; NOT checked against national
     regulators in this build, so the UI always labels them "check locally".
     Fields: n English name; e number to call in a medical emergency;
     alt other emergency number(s) (display only); amb/pol/fire service numbers
     when different from e; poison centre; mh mental-health crisis line;
     gbv violence/abuse helpline; note English note.
     ---------------------------------------------------------------------- */
  var EU112 = { e: '112' };
  function eu(name, extra) { var o = { n: name, e: EU112.e }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  var MOBILE_112 = 'From a mobile phone you can also call 112.';
  var EMERGENCY_NUMBERS = {
    // Americas
    US: { n: 'United States', e: '911', mh: '988', poison: '1-800-222-1222', gbv: '1-800-799-7233' },
    CA: { n: 'Canada', e: '911', mh: '988' },
    MX: { n: 'Mexico', e: '911' },
    PR: { n: 'Puerto Rico', e: '911', mh: '988' },
    BR: { n: 'Brazil', e: '192', pol: '190', fire: '193', mh: '188' },
    AR: { n: 'Argentina', e: '107', pol: '911', fire: '100' },
    CL: { n: 'Chile', e: '131', pol: '133', fire: '132' },
    CO: { n: 'Colombia', e: '123' },
    PE: { n: 'Peru', e: '106', pol: '105', fire: '116' },
    EC: { n: 'Ecuador', e: '911' },
    UY: { n: 'Uruguay', e: '911' },
    CR: { n: 'Costa Rica', e: '911' },
    PA: { n: 'Panama', e: '911' },
    DO: { n: 'Dominican Republic', e: '911' },
    // Europe: 112 works in every EU country for ambulance, police and fire
    AT: eu('Austria', { amb: '144', pol: '133', fire: '122' }),
    BE: eu('Belgium', { pol: '101' }),
    BG: eu('Bulgaria'), HR: eu('Croatia'), CY: eu('Cyprus'),
    CZ: eu('Czechia', { amb: '155', pol: '158', fire: '150' }),
    DK: eu('Denmark'), EE: eu('Estonia'), FI: eu('Finland'),
    FR: eu('France', { amb: '15', pol: '17', fire: '18', mh: '3114' }),
    DE: eu('Germany', { pol: '110' }),
    GR: eu('Greece', { amb: '166', pol: '100', fire: '199' }),
    HU: eu('Hungary', { amb: '104', pol: '107', fire: '105' }),
    IE: eu('Ireland', { alt: '999', mh: '116 123' }),
    IT: eu('Italy', { amb: '118', pol: '113', fire: '115' }),
    LV: eu('Latvia'), LT: eu('Lithuania'), LU: eu('Luxembourg'), MT: eu('Malta'),
    NL: eu('Netherlands', { mh: '0800-0113' }),
    PL: eu('Poland', { amb: '999', pol: '997', fire: '998' }),
    PT: eu('Portugal'), RO: eu('Romania'),
    SK: eu('Slovakia', { amb: '155', pol: '158', fire: '150' }),
    SI: eu('Slovenia'),
    ES: eu('Spain', { mh: '024' }),
    SE: eu('Sweden'),
    GB: { n: 'United Kingdom', e: '999', alt: '112', mh: '116 123', gbv: '0808 2000 247', note: 'For urgent advice that is not an emergency, call NHS 111 (England, Scotland and Wales).' },
    CH: { n: 'Switzerland', e: '144', alt: '112', pol: '117', fire: '118', mh: '143' },
    NO: { n: 'Norway', e: '113', pol: '112', fire: '110' },
    IS: { n: 'Iceland', e: '112' },
    TR: { n: 'Türkiye', e: '112' },
    UA: { n: 'Ukraine', e: '103', alt: '112', pol: '102', fire: '101' },
    RU: { n: 'Russia', e: '103', alt: '112', pol: '102', fire: '101' },
    GE: { n: 'Georgia', e: '112' },
    RS: { n: 'Serbia', e: '194', pol: '192', fire: '193' },
    // Asia and the Pacific
    AU: { n: 'Australia', e: '000', alt: '112', poison: '13 11 26', mh: '13 11 14', gbv: '1800 737 732', note: MOBILE_112 },
    NZ: { n: 'New Zealand', e: '111', mh: '1737' },
    JP: { n: 'Japan', e: '119', pol: '110' },
    KR: { n: 'South Korea', e: '119', pol: '112' },
    CN: { n: 'China', e: '120', pol: '110', fire: '119' },
    TW: { n: 'Taiwan', e: '119', pol: '110' },
    HK: { n: 'Hong Kong', e: '999' },
    SG: { n: 'Singapore', e: '995', pol: '999' },
    MY: { n: 'Malaysia', e: '999', alt: '112', note: MOBILE_112 },
    ID: { n: 'Indonesia', e: '112', pol: '110' },
    PH: { n: 'Philippines', e: '911' },
    TH: { n: 'Thailand', e: '1669', pol: '191', fire: '199' },
    VN: { n: 'Vietnam', e: '115', pol: '113', fire: '114' },
    IN: { n: 'India', e: '112', amb: '108', mh: '14416', note: 'Ambulance is 108 in most states. 112 connects to police, fire and ambulance.' },
    PK: { n: 'Pakistan', e: '1122', pol: '15', note: 'Rescue 1122 works in most provinces.' },
    BD: { n: 'Bangladesh', e: '999' },
    LK: { n: 'Sri Lanka', e: '1990', pol: '119', fire: '110' },
    NP: { n: 'Nepal', e: '102', pol: '100', fire: '101' },
    // Middle East and North Africa
    SA: { n: 'Saudi Arabia', e: '997', pol: '999', fire: '998', note: 'In some regions you can also call 911.' },
    AE: { n: 'United Arab Emirates', e: '998', pol: '999', fire: '997' },
    QA: { n: 'Qatar', e: '999' },
    KW: { n: 'Kuwait', e: '112' },
    BH: { n: 'Bahrain', e: '999' },
    OM: { n: 'Oman', e: '9999' },
    JO: { n: 'Jordan', e: '911' },
    IL: { n: 'Israel', e: '101', pol: '100', fire: '102' },
    EG: { n: 'Egypt', e: '123', pol: '122', fire: '180' },
    // Sub-Saharan Africa
    ZA: { n: 'South Africa', e: '10177', alt: '112', pol: '10111', mh: '0800 567 567', gbv: '0800 428 428', note: MOBILE_112 },
    NG: { n: 'Nigeria', e: '112' },
    KE: { n: 'Kenya', e: '999', alt: '112' },
    GH: { n: 'Ghana', e: '112', amb: '193' }
  };

  /** Fields saved under health.gethelp.numbers (contract in docs/ARCHITECTURE.md). */
  var NUMBER_FIELDS = ['ambulance', 'police', 'fire', 'poison', 'mentalHealth', 'gbv', 'doctor'];

  /** Upper-case ISO 3166 alpha-2 code, or '' when not a plausible code. */
  function normCountry(c) {
    var s = String(c == null ? '' : c).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(s) ? s : '';
  }
  /**
   * Tidy a phone number typed by a person. Allows digits, spaces, dashes, dots,
   * brackets and a leading +. Needs 2-20 digits (2-digit numbers exist, e.g. France 15).
   * Returns the tidy string, or '' when it is not a usable number.
   */
  function cleanNumber(v) {
    if (v == null) return '';
    var s = String(v).trim().replace(/\s+/g, ' ');
    if (!s || s.length > 32) return '';
    if (!/^\+?[0-9(][0-9 ().\-]*$/.test(s)) return '';
    var digits = s.replace(/[^0-9]/g, '');
    if (digits.length < 2 || digits.length > 20) return '';
    return s;
  }
  /** tel: link for a number ('' when unusable). Keeps a leading + and digits only. */
  function telHref(v) {
    var s = cleanNumber(v);
    if (!s) return '';
    return 'tel:' + (s.charAt(0) === '+' ? '+' : '') + s.replace(/[^0-9]/g, '');
  }
  /** Digits separated by spaces, so speech engines read "1 1 2", not "one hundred and twelve". */
  function speakableNumber(v) {
    var s = cleanNumber(v);
    return s ? s.replace(/[^0-9+]/g, '').split('').join(' ').replace('+', 'plus') : '';
  }

  /** Region subtag of a BCP 47 tag: 'en-GB' -> 'GB', 'zh-Hant-TW' -> 'TW', 'es-419' -> ''. */
  function countryFromLocale(tag) {
    if (!tag) return '';
    var parts = String(tag).split(/[-_]/);
    for (var i = 1; i < parts.length; i++) {
      if (/^[A-Za-z]{2}$/.test(parts[i])) return parts[i].toUpperCase();
    }
    return '';
  }
  function countryFromLocales(tags) {
    var list = Array.isArray(tags) ? tags : [tags];
    for (var i = 0; i < list.length; i++) { var c = countryFromLocale(list[i]); if (c) return c; }
    return '';
  }

  /** Built-in numbers for a country, expanded per service, or null when not in the list. */
  function countryDefaults(code) {
    var c = EMERGENCY_NUMBERS[normCountry(code)];
    if (!c) return null;
    return {
      country: normCountry(code), name: c.n, emergency: c.e, alt: c.alt || '',
      ambulance: c.amb || c.e, police: c.pol || c.e, fire: c.fire || c.e,
      poison: c.poison || '', mentalHealth: c.mh || '', gbv: c.gbv || '', doctor: '',
      note: c.note || ''
    };
  }

  /**
   * Which number should a "Call" button dial? Order (docs/ARCHITECTURE.md):
   * 1. the user's saved ambulance number (health.gethelp.numbers),
   * 2. the profile's emergencyNumber (also typed by the user),
   * 3. the built-in default for the saved country, else the profile country,
   *    else the country in the phone's language setting,
   * 4. '112'.
   * Returns { number, source: 'saved'|'profile'|'country'|'default', country, confirmed }.
   */
  function emergencyInfo(saved, profile, localeCountry) {
    saved = (saved && typeof saved === 'object') ? saved : {};
    profile = (profile && typeof profile === 'object') ? profile : {};
    var country = normCountry(saved.country) || normCountry(profile.country) || normCountry(localeCountry);
    var n = cleanNumber(saved.ambulance);
    if (n) return { number: n, source: 'saved', country: country, confirmed: true };
    n = cleanNumber(profile.emergencyNumber);
    if (n) return { number: n, source: 'profile', country: country, confirmed: true };
    var c = country ? EMERGENCY_NUMBERS[country] : null;
    if (c && cleanNumber(c.e)) return { number: c.e, source: 'country', country: country, confirmed: false };
    return { number: FALLBACK_NUMBER, source: 'default', country: country, confirmed: false };
  }
  function emergencyNumber(saved, profile, localeCountry) { return emergencyInfo(saved, profile, localeCountry).number; }

  /** Clean a saved numbers object (from storage or a backup file). */
  function normalizeNumbers(o) {
    o = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    var out = { v: 1, country: normCountry(o.country) };
    NUMBER_FIELDS.forEach(function (k) { out[k] = cleanNumber(o[k]); });
    out.doctorName = typeof o.doctorName === 'string' ? o.doctorName.trim().slice(0, 80) : '';
    out.confirmedAt = typeof o.confirmedAt === 'string' ? o.confirmedAt.slice(0, 40) : '';
    return out;
  }
  function hasAnyNumber(o) { o = normalizeNumbers(o); return NUMBER_FIELDS.some(function (k) { return !!o[k]; }); }

  /* ----------------------------------------------------------------------
     Personal safety plan (Stanley & Brown 2012, six steps + reasons for living)
     Stored at health.gethelp.safetyplan as { v:1, updatedAt, warningSigns:[str],
     coping:[str], distractions:[{name,phone}], people:[{name,phone}],
     professionals:[{name,phone}], safeEnvironment:[str], reasons:[str] }
     ---------------------------------------------------------------------- */
  var PLAN_TEXT_KEYS = ['warningSigns', 'coping', 'safeEnvironment', 'reasons'];
  var PLAN_CONTACT_KEYS = ['distractions', 'people', 'professionals'];
  var PLAN_MAX_ITEMS = 30;
  function strList(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    a.forEach(function (x) { if (typeof x === 'string' && x.trim() && out.length < PLAN_MAX_ITEMS) out.push(x.trim().slice(0, 300)); });
    return out;
  }
  function contactList(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    a.forEach(function (x) {
      if (out.length >= PLAN_MAX_ITEMS) return;
      if (typeof x === 'string') x = { name: x };
      if (!x || typeof x !== 'object') return;
      var name = typeof x.name === 'string' ? x.name.trim().slice(0, 120) : '';
      var phone = cleanNumber(x.phone);
      if (name || phone) out.push({ name: name, phone: phone });
    });
    return out;
  }
  function normalizeSafetyPlan(o) {
    var out = { v: 1, updatedAt: '' };
    o = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    PLAN_TEXT_KEYS.forEach(function (k) { out[k] = strList(o[k]); });
    PLAN_CONTACT_KEYS.forEach(function (k) { out[k] = contactList(o[k]); });
    out.updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt.slice(0, 40) : '';
    return out;
  }
  function planIsEmpty(o) {
    o = normalizeSafetyPlan(o);
    return PLAN_TEXT_KEYS.concat(PLAN_CONTACT_KEYS).every(function (k) { return !o[k].length; });
  }

  /* ----------------------------------------------------------------------
     Location sharing (nothing is sent automatically; the UI only builds text)
     ---------------------------------------------------------------------- */
  function validLatLon(lat, lon) {
    return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }
  /** 5 decimals is about 1 metre: precise enough, no false precision. */
  function formatCoords(lat, lon) { return validLatLon(lat, lon) ? lat.toFixed(5) + ', ' + lon.toFixed(5) : ''; }
  function osmUrl(lat, lon) {
    if (!validLatLon(lat, lon)) return '';
    var a = lat.toFixed(5), b = lon.toFixed(5);
    return 'https://www.openstreetmap.org/?mlat=' + a + '&mlon=' + b + '#map=17/' + a + '/' + b;
  }
  function geoUri(lat, lon) { return validLatLon(lat, lon) ? 'geo:' + lat.toFixed(5) + ',' + lon.toFixed(5) : ''; }

  /* ----------------------------------------------------------------------
     CPR metronome constants. AHA 2025 / ERC 2025: 100-120 compressions per
     minute; we use 110 (middle of the range). 30 compressions : 2 breaths.
     ---------------------------------------------------------------------- */
  var CPR = { bpm: 110, minRate: 100, maxRate: 120, compressionsPerCycle: 30, breathsPerCycle: 2, breathPauseMs: 5000, swapEveryMs: 120000 };
  function beatIntervalMs(bpm) { return 60000 / (bpm || CPR.bpm); }

  return {
    LEVELS: LEVELS,
    FALLBACK_NUMBER: FALLBACK_NUMBER,
    SOURCES: SOURCES,
    GROUPS: GROUPS,
    GROUP_INDEX: GROUP_INDEX,
    SIGN_INDEX: SIGN_INDEX,
    assess: assess,
    groupSigns: groupSigns,
    MAX_RATE: MAX_RATE,
    BREATH_BANDS: BREATH_BANDS,
    BAND_INDEX: BAND_INDEX,
    bandForAgeMonths: bandForAgeMonths,
    validRate: validRate,
    classifyBreathing: classifyBreathing,
    EMERGENCY_NUMBERS: EMERGENCY_NUMBERS,
    NUMBER_FIELDS: NUMBER_FIELDS,
    normCountry: normCountry,
    cleanNumber: cleanNumber,
    telHref: telHref,
    speakableNumber: speakableNumber,
    countryFromLocale: countryFromLocale,
    countryFromLocales: countryFromLocales,
    countryDefaults: countryDefaults,
    emergencyInfo: emergencyInfo,
    emergencyNumber: emergencyNumber,
    normalizeNumbers: normalizeNumbers,
    hasAnyNumber: hasAnyNumber,
    PLAN_TEXT_KEYS: PLAN_TEXT_KEYS,
    PLAN_CONTACT_KEYS: PLAN_CONTACT_KEYS,
    normalizeSafetyPlan: normalizeSafetyPlan,
    planIsEmpty: planIsEmpty,
    validLatLon: validLatLon,
    formatCoords: formatCoords,
    osmUrl: osmUrl,
    geoUri: geoUri,
    CPR: CPR,
    beatIntervalMs: beatIntervalMs
  };
});

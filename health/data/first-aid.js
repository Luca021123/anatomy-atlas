/* ==========================================================================
   Salus · H2 "Get help now" — first-aid library (MTData.firstAid)

   Step-by-step lay first-aid cards, shown at #/first-aid/<id>. All strings are
   ENGLISH SOURCE strings (reading grade ~6, one action per step). The UI
   passes every string through MT.t() at render time; "{number}" is replaced
   by the person's emergency number (MT.help.emergencyNumber()).

   Card shape:
   { id, icon, group: 'life'|'other', call: 'always'|'if', title, summary,
     keywords:[], callText?, sections:[{ title, kind?: 'variant'|'note',
     widget?: 'metronome', steps:[[emoji, text]] }], dont:[], callWhen:[],
     careWhen?:[], notes?:[], sources:[{label, url?}], related:[ids] }

   Evidence: docs/research/emergency-prevention-fsrs.md (topics 1-5), which
   marks what was VERIFIED in the research session. Key facts:
   - CPR 100-120/min, adult depth 5-6 cm, infant ~4 cm with two thumbs encircling
     or the heel of one hand (AHA 2025, VERIFIED). Hands-only CPR for untrained
     rescuers (long-standing AHA/ERC advice). Child depth ~5 cm / one third of the
     chest (long-standing AHA; UNVERIFIED this session).
   - Choking: alternate 5 back blows and 5 abdominal thrusts (adult/child); infant
     5 back blows and 5 chest thrusts, no abdominal thrusts (AHA 2025, VERIFIED).
   - Anaphylaxis: auto-injector into the outer thigh; second dose after 5 minutes if
     no better (ERC 2025 Special Circumstances, VERIFIED).
   - Heart attack: chew aspirin 300 mg (ERC 2025 First Aid; European First Aid
     Guidelines 150-300 mg; AHA/Red Cross 162-325 mg) only if not allergic, no
     bleeding problem, not told to avoid it (VERIFIED doses).
   - Burns: cool running water 20 minutes (at least 10) (ILCOR 2025 active cooling,
     VERIFIED; duration from UK/Australian practice, UNVERIFIED this session).
   - Home ORS 1 L water + 6 level tsp sugar + 1/2 level tsp salt; zinc 10 mg (<6 m)
     or 20 mg (>=6 m) for 10-14 days (WHO/UNICEF; 10-14 days VERIFIED, doses and
     recipe UNVERIFIED this session but long-standing).
   - Snakebite (WHO SEARO 2016): keep still, immobilise, remove rings, hospital; no
     cutting, sucking, tourniquet, ice or electricity (UNVERIFIED this session).
   Everything else is long-standing mainstream guidance kept conservative.
   A clinician must review this file before public release.
   ========================================================================== */
(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else (root.MTData = root.MTData || {}).firstAid = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var S = {
    aha2025: { label: 'American Heart Association. 2025 Guidelines for Cardiopulmonary Resuscitation and Emergency Cardiovascular Care. Circulation. 2025.', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001372' },
    aha2025peds: { label: 'American Heart Association. 2025 Guidelines, Part 6: Pediatric Basic Life Support (including choking).', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001370' },
    ercBls: { label: 'European Resuscitation Council Guidelines 2025: Basic Life Support.' },
    ercFirstAid: { label: 'European Resuscitation Council Guidelines 2025: First Aid.', url: 'https://www.resuscitationjournal.com/article/S0300-9572(25)00264-3/fulltext' },
    ercSpecial: { label: 'European Resuscitation Council Guidelines 2025: Special Circumstances.', url: 'https://www.resuscitationjournal.com/article/S0300-9572(25)00265-5/fulltext' },
    ilcor: { label: 'ILCOR 2025 International Consensus on First Aid Science with Treatment Recommendations.', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001358' },
    ahaRedCross: { label: 'American Heart Association and American Red Cross. 2024 Guidelines for First Aid. Circulation. 2024.', url: 'https://www.ahajournals.org/doi/10.1161/CIR.0000000000001281' },
    rcuk: { label: 'Resuscitation Council UK. 2025 First Aid Guidelines.', url: 'https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines' },
    rcukAnaphylaxis: { label: 'Resuscitation Council UK. Emergency treatment of anaphylaxis: guidelines for healthcare providers. 2021.' },
    efag: { label: 'European First Aid Guidelines 2025.', url: 'https://www.firstaidjoin.org/wp-content/uploads/2025/05/FirstAidGuidelines_2025.pdf' },
    stroke: { label: 'Stroke Association (UK) FAST campaign; American Stroke Association BE FAST.' },
    epilepsy: { label: 'Epilepsy Foundation and Epilepsy Action. Seizure first aid.' },
    diabetes: { label: 'American Diabetes Association and Diabetes UK. Treating low blood sugar (hypoglycaemia).' },
    whoOpioid: { label: 'WHO. Community management of opioid overdose. Geneva: WHO; 2014.' },
    whoSnake: { label: 'WHO Regional Office for South-East Asia. Guidelines for the management of snakebites, 2nd edition. 2016.' },
    whoDrowning: { label: 'WHO. Preventing drowning: an implementation guide. Geneva: WHO; 2017.' },
    whoDiarrhoea: { label: 'WHO and UNICEF. Joint statement: clinical management of acute diarrhoea. 2004.' },
    imci: { label: 'WHO. Integrated Management of Childhood Illness (IMCI) chart booklet. Geneva: WHO; 2014.' },
    rehydrate: { label: 'Rehydration Project. Homemade oral rehydration solution.', url: 'https://rehydrate.org/solutions/homemade.htm' },
    nice232: { label: 'NICE guideline NG232. Head injury: assessment and early management. 2023.', url: 'https://www.nice.org.uk/guidance/ng232' },
    nhsBurns: { label: 'NHS. Burns and scalds.', url: 'https://www.nhs.uk/conditions/burns-and-scalds/' },
    nhsHeat: { label: 'NHS. Heat exhaustion and heatstroke.', url: 'https://www.nhs.uk/conditions/heat-exhaustion-heatstroke/' },
    nhsHead: { label: 'NHS. Head injury and concussion.', url: 'https://www.nhs.uk/conditions/head-injury-and-concussion/' },
    nhsNose: { label: 'NHS. Nosebleed.', url: 'https://www.nhs.uk/conditions/nosebleed/' }
  };

  var cards = [
    /* ------------------------------------------------------------------ CPR */
    {
      id: 'cpr', icon: '❤️', group: 'life', call: 'always',
      title: 'CPR: not breathing',
      summary: 'The person does not respond and is not breathing normally.',
      keywords: ['cpr', 'cardiac arrest', 'collapsed', 'collapse', 'not breathing', 'no pulse', 'heart stopped', 'resuscitation', 'chest compressions', 'aed', 'defibrillator', 'gasping', 'unconscious', 'metronome'],
      callText: 'Call {number} now. Put the phone on speaker. The call taker will help you.',
      sections: [
        { title: 'Check', steps: [
          ['⚠️', 'Make sure it is safe for you to go near.'],
          ['🗣️', 'Tap their shoulders and shout: "Are you OK?"'],
          ['👀', 'Look at the chest for up to 10 seconds. Is the breathing normal?'],
          ['❗', 'Gasping, or very slow breaths, is NOT normal breathing. Start CPR.'],
          ['📞', 'Call {number}. Put the phone on speaker. Ask someone to bring an AED (defibrillator) if there is one.']
        ] },
        { title: 'Push hard and fast (adult)', widget: 'metronome', steps: [
          ['🛏️', 'Lay them on their back on the floor or another firm surface.'],
          ['✋', 'Put the heel of one hand in the centre of the chest. Put your other hand on top.'],
          ['💪', 'Keep your arms straight. Push straight down, 5 to 6 cm (about 2 inches) deep.'],
          ['↕️', 'Let the chest come all the way back up after each push.'],
          ['⏱️', 'Push fast: 100 to 120 times a minute. Follow the beat below.'],
          ['🔁', 'Do not stop. Keep going until help takes over, or the person wakes up and breathes normally.'],
          ['🤝', 'If someone else can help, swap every 2 minutes. Swap quickly.']
        ] },
        { title: 'Rescue breaths', kind: 'note', steps: [
          ['🙌', 'Not trained? Just keep pushing hard and fast. This is hands-only CPR, and it saves lives.'],
          ['💨', 'If you are trained and willing, give 2 rescue breaths after every 30 pushes.']
        ] },
        { title: 'Child (1 year to puberty)', kind: 'variant', steps: [
          ['✋', 'Push in the centre of the chest with one or two hands, about 5 cm (2 inches) deep. That is about one third of the depth of the chest.'],
          ['💨', 'Children need breaths. If you can, give 2 breaths after every 30 pushes.'],
          ['🔁', 'If you cannot give breaths, keep pushing. Do not stop.']
        ] },
        { title: 'Baby (under 1 year)', kind: 'variant', steps: [
          ['🛏️', 'Lay the baby on a firm, flat surface.'],
          ['👍', 'Put both thumbs on the centre of the chest, just below the nipple line, with your hands around the chest. Or use the heel of one hand.'],
          ['⬇️', 'Push about 4 cm (1.5 inches) deep, 100 to 120 times a minute.'],
          ['💨', "If you can, cover the baby's mouth and nose with your mouth. Give 2 small puffs after every 30 pushes."]
        ] },
        { title: 'If there is an AED (defibrillator)', steps: [
          ['🔌', 'Turn the AED on. Do what it says.'],
          ['👕', 'Take clothes off the chest. Wipe the chest dry if it is wet.'],
          ['📍', 'Stick the pads on the bare chest, as the pictures on the pads show.'],
          ['🙅', 'When the AED says so, make sure nobody is touching the person.'],
          ['⚡', 'If it tells you to give a shock, check that no one is touching, then press the shock button.'],
          ['🔁', 'Start pushing again straight away when the AED tells you to.'],
          ['🧒', 'For a child under 8, use child pads or child mode if there is one. If not, use adult pads. On a small child, put one pad on the front of the chest and one on the back.']
        ] }
      ],
      dont: [
        'Do not stop to check for a pulse.',
        'Do not be afraid of hurting them. You need to push hard. Doing something is much better than doing nothing.',
        'Do not give them anything to eat or drink.',
        'Do not leave them alone, unless you must go to call for help or to get an AED.'
      ],
      callWhen: [
        'Call {number} straight away for anyone who does not respond and is not breathing normally.',
        'If you are alone and have a phone, put it on speaker and start CPR while you talk.'
      ],
      notes: ['This guide is not a substitute for training. Take a CPR course if you can.'],
      sources: [S.aha2025, S.aha2025peds, S.ercBls, S.ilcor],
      related: ['recovery-position', 'choking', 'drowning', 'overdose']
    },

    /* -------------------------------------------------------------- Choking */
    {
      id: 'choking', icon: '😮', group: 'life', call: 'always',
      title: 'Choking',
      summary: 'Something is stuck in the throat. The person cannot breathe, cough or speak.',
      keywords: ['choking', 'choke', 'airway', 'food stuck', 'cannot breathe', 'back blows', 'abdominal thrusts', 'heimlich', 'baby choking', 'infant choking', 'swallowed object'],
      callText: 'If they cannot breathe, cough or speak, ask someone to call {number} now while you help.',
      sections: [
        { title: 'Adult or child over 1 year', steps: [
          ['🗣️', 'Ask: "Are you choking?"'],
          ['😮', 'If they can cough, tell them to keep coughing hard.'],
          ['📞', 'If they cannot cough, speak or breathe, act now. Ask someone to call {number}.'],
          ['✋', 'Lean them forward. Hit them firmly between the shoulder blades with the heel of your hand, 5 times.'],
          ['👊', 'Stand behind them. Put your fist just above their belly button. Hold your fist with your other hand.'],
          ['⬆️', 'Pull hard inwards and upwards, 5 times.'],
          ['🔁', 'Keep doing 5 back blows, then 5 belly thrusts, until the object comes out.'],
          ['❤️', 'If they stop responding, lower them to the ground, call {number} and start CPR.']
        ] },
        { title: 'Pregnant or very large person', kind: 'variant', steps: [
          ['🤰', 'Give back blows as above.'],
          ['👊', 'Instead of belly thrusts: stand behind them, put your fist on the middle of the breastbone, and pull straight back sharply, 5 times.']
        ] },
        { title: 'Baby (under 1 year)', kind: 'variant', steps: [
          ['👶', 'Lay the baby face down along your forearm or thigh. Hold the jaw to support the head. Keep the head lower than the body.'],
          ['✋', 'Give up to 5 firm back blows between the shoulder blades with the heel of your hand.'],
          ['🔄', 'Turn the baby face up. Support the head.'],
          ['👇', 'Put the heel of one hand on the middle of the chest, just below the nipple line. Give up to 5 quick, firm chest pushes.'],
          ['🔁', 'Keep doing 5 back blows and 5 chest pushes until the object comes out.'],
          ['❤️', 'If the baby stops responding, call {number} and start baby CPR.']
        ] }
      ],
      dont: [
        'Do not put your fingers in the mouth to search for the object. Only take it out if you can clearly see it and reach it easily.',
        'Do not give belly thrusts to a baby under 1 year.',
        'Do not hold a baby upside down by the legs, and do not shake a baby.',
        'Do not give water or food while they are choking.'
      ],
      callWhen: [
        'They cannot breathe, cough or speak.',
        'They stop responding. Start CPR.'
      ],
      careWhen: [
        'After back blows, belly thrusts or chest pushes, a health worker should check them, even if they seem well now.',
        'They still cough a lot, or have trouble breathing or swallowing, after the object comes out.'
      ],
      sources: [S.aha2025, S.aha2025peds, S.ercFirstAid, S.rcuk],
      related: ['cpr', 'recovery-position']
    },

    /* ------------------------------------------------------- Severe bleeding */
    {
      id: 'bleeding', icon: '🩸', group: 'life', call: 'if',
      title: 'Severe bleeding',
      summary: 'Blood is spurting, pouring, or will not stop.',
      keywords: ['bleeding', 'blood', 'cut', 'wound', 'haemorrhage', 'hemorrhage', 'tourniquet', 'stab', 'knife', 'injury', 'gunshot', 'amputation'],
      callText: 'Heavy bleeding? Call {number} now.',
      sections: [
        { title: 'Stop the bleeding', steps: [
          ['📞', 'If the bleeding is heavy, call {number}, or ask someone to call.'],
          ['🧤', 'If you can, wear gloves or put a plastic bag over your hand.'],
          ['✋', 'Press hard on the wound with a clean cloth or pad. Use your bare hand if there is nothing else.'],
          ['⏱️', 'Keep pressing hard. Do not lift your hand to look.'],
          ['➕', 'If blood soaks through, put more cloth on top and keep pressing. Do not take the first cloth off.'],
          ['🛌', 'Help them lie down. Keep them warm with a coat or blanket.']
        ] },
        { title: 'Tourniquet (only if you are trained)', kind: 'note', steps: [
          ['⚠️', 'If an arm or leg is bleeding so badly that it could kill, and pressing does not stop it, use a tourniquet if you have one and know how.'],
          ['⬆️', 'Put it on the arm or leg above the wound, not on a joint. Tighten it until the bleeding stops.'],
          ['🕒', 'Write down the time you put it on. Tell the medical team.'],
          ['🚫', 'Never loosen or remove a tourniquet. Leave that to medical staff.']
        ] }
      ],
      dont: [
        'Do not pull out anything stuck in the wound. Press around it instead.',
        'Do not lift the cloth to check the wound. This can start the bleeding again.',
        'Do not put a tourniquet on the neck, chest or belly.',
        'Do not give food or drink. They may need an operation.'
      ],
      callWhen: [
        'The bleeding is heavy or spurting, or keeps going after 10 minutes of firm pressure.',
        'They are pale, cold, sweaty, confused or very sleepy. These are signs of shock.',
        'The wound is deep or large, or something is stuck in it.',
        'The wound is on the head, neck, chest or belly.'
      ],
      careWhen: [
        'A cut is deep or gaping and may need stitches.',
        'The wound came from a bite, or a dirty or rusty object. You may need a tetanus vaccine.',
        'The wound becomes red, hot, swollen or more painful over the next days.'
      ],
      sources: [S.ilcor, S.ahaRedCross, S.ercFirstAid],
      related: ['nosebleed', 'fractures', 'cpr']
    },

    /* ---------------------------------------------------------- Heart attack */
    {
      id: 'heart-attack', icon: '💔', group: 'life', call: 'always',
      title: 'Heart attack',
      summary: 'Chest pain or pressure that does not go away.',
      keywords: ['heart attack', 'chest pain', 'angina', 'myocardial infarction', 'aspirin', 'chest pressure', 'chest tightness', 'arm pain', 'jaw pain', 'cardiac'],
      callText: 'Chest pain that lasts more than a few minutes: call {number} now.',
      sections: [
        { title: 'Signs', kind: 'note', steps: [
          ['💔', 'Pain, pressure, squeezing or tightness in the chest that lasts more than a few minutes, or comes back.'],
          ['💪', 'The pain may spread to the arms, jaw, neck, back or stomach.'],
          ['😓', 'They may also be sweaty, feel sick, be short of breath, or feel faint.'],
          ['👵', 'Women, older people and people with diabetes may have no chest pain. They may only be short of breath, feel sick, feel very tired, or have back or jaw pain.']
        ] },
        { title: 'What to do', steps: [
          ['📞', 'Call {number} now. Say you think it is a heart attack.'],
          ['🛋️', 'Help them sit down and rest. Sitting on the floor, leaning against a wall with knees bent, is good.'],
          ['👔', 'Loosen tight clothes.'],
          ['💊', 'Aspirin: if they are an adult, are not allergic to aspirin, do not have a bleeding problem, and no doctor has told them not to take it, give one 300 mg aspirin to chew slowly.'],
          ['👅', 'If they have their own heart medicine (a spray or a tablet under the tongue), help them take it.'],
          ['🤝', 'Stay with them. Keep them calm.'],
          ['❤️', 'If they stop responding and are not breathing normally, start CPR.']
        ] }
      ],
      dont: [
        'Do not let them walk around, or drive themselves to hospital.',
        'Do not give aspirin to a child, or to anyone who is allergic to it or has a bleeding problem.',
        'Do not wait to see if the pain goes away.'
      ],
      callWhen: [
        'Chest pain, pressure or tightness that lasts more than a few minutes.',
        'Chest pain with sweating, feeling sick, breathlessness or fainting.',
        'Sudden, severe breathlessness, even without pain.'
      ],
      notes: ['If you only have low-dose aspirin (75 to 81 mg), give 4 tablets to chew instead of one 300 mg tablet.'],
      sources: [S.ercFirstAid, S.efag, S.ahaRedCross, S.aha2025],
      related: ['cpr', 'recovery-position', 'stroke']
    },

    /* ---------------------------------------------------------------- Stroke */
    {
      id: 'stroke', icon: '🧠', group: 'life', call: 'always',
      title: 'Stroke (FAST)',
      summary: 'Sudden face drooping, arm weakness, or speech problems.',
      keywords: ['stroke', 'fast', 'be fast', 'face drooping', 'arm weakness', 'slurred speech', 'brain attack', 'paralysis', 'tia', 'mini stroke'],
      callText: 'Any one sign of a stroke: call {number} now. Every minute counts.',
      sections: [
        { title: 'Think FAST', steps: [
          ['😐', 'Face: ask them to smile. Does one side of the face droop?'],
          ['💪', 'Arms: ask them to lift both arms. Does one arm drift down, or feel weak or numb?'],
          ['🗣️', 'Speech: is their speech slurred or strange? Can they understand you?'],
          ['⏰', 'Time: if you see any one of these signs, call {number} now.']
        ] },
        { title: 'Also call if they suddenly have', kind: 'note', steps: [
          ['🚶', 'Loss of balance, or trouble walking.'],
          ['👁️', 'Loss of sight in one or both eyes, or double vision.']
        ] },
        { title: 'While you wait', steps: [
          ['🕒', 'Note the time the signs started, or when they were last seen well. Tell the medical team.'],
          ['🛋️', 'Help them sit or lie in a comfortable position.'],
          ['🛌', 'If they become drowsy or vomit, roll them onto their side (recovery position).'],
          ['🤝', 'Stay with them. Talk calmly.']
        ] }
      ],
      dont: [
        'Do not give food, drink or medicine, not even aspirin. They may not be able to swallow safely.',
        'Do not wait to see if the signs go away. Call even if they get better.',
        'Do not let them drive.'
      ],
      callWhen: [
        'Any one of the FAST signs, or sudden loss of balance or sight.',
        'The signs come and go. This can be a warning of a bigger stroke.'
      ],
      sources: [S.ercFirstAid, S.ilcor, S.stroke],
      related: ['recovery-position', 'cpr', 'heart-attack']
    },

    /* ----------------------------------------------------------- Anaphylaxis */
    {
      id: 'anaphylaxis', icon: '💉', group: 'life', call: 'always',
      title: 'Severe allergic reaction (anaphylaxis)',
      summary: 'Swelling, trouble breathing, or collapse after a food, sting or medicine.',
      keywords: ['anaphylaxis', 'allergy', 'allergic reaction', 'epipen', 'adrenaline', 'epinephrine', 'auto-injector', 'bee sting', 'peanut', 'nut allergy', 'swelling', 'hives'],
      callText: 'Use their adrenaline auto-injector now, then call {number}.',
      sections: [
        { title: 'Signs', kind: 'note', steps: [
          ['👄', 'Swelling of the lips, tongue or throat.'],
          ['😮', 'Trouble breathing, wheezing, a hoarse voice, or trouble swallowing.'],
          ['😵', 'Feeling faint, pale and floppy, or collapsing.'],
          ['🔴', 'An itchy rash may also be there, but not always.']
        ] },
        { title: 'What to do', steps: [
          ['💉', 'Use their adrenaline (epinephrine) auto-injector now, if they have one. Do not wait.'],
          ['🦵', 'Push it firmly into the outer side of the thigh. It can go through clothes. Hold it in place for as long as the pen says.'],
          ['📞', 'Call {number}. Say "anaphylaxis".'],
          ['🛌', 'Lay them down and raise their legs.'],
          ['💺', 'If breathing is hard, let them sit up instead.'],
          ['⏱️', 'If they are not better after 5 minutes, give a second auto-injector if there is one. Use the other thigh.'],
          ['❤️', 'If they stop responding and are not breathing normally, start CPR.']
        ] }
      ],
      dont: [
        'Do not let them stand up or walk, even if they feel better.',
        'Do not wait for a rash. Trouble breathing or swelling is enough to act.',
        'Do not give anything to eat or drink if they have trouble swallowing.'
      ],
      callWhen: [
        'Always call {number} for anaphylaxis, even if they get better after the auto-injector.',
        'The reaction can come back hours later, so they must be checked in hospital.'
      ],
      notes: ['If she is pregnant, lay her on her left side.'],
      sources: [S.ercSpecial, S.rcukAnaphylaxis, S.ercFirstAid, S.ahaRedCross],
      related: ['cpr', 'recovery-position']
    },

    /* -------------------------------------------------------------- Overdose */
    {
      id: 'overdose', icon: '💊', group: 'life', call: 'always',
      title: 'Overdose (drugs or medicines)',
      summary: 'Very sleepy, will not wake up, or slow or no breathing after drugs or medicine.',
      keywords: ['overdose', 'opioid', 'heroin', 'fentanyl', 'morphine', 'tramadol', 'naloxone', 'narcan', 'drugs', 'too many pills', 'not breathing'],
      callText: 'Call {number} now. Say they are not breathing or will not wake up.',
      sections: [
        { title: 'Signs', kind: 'note', steps: [
          ['😴', 'Will not wake up, or is very hard to wake.'],
          ['💨', 'Slow, weak or no breathing. Snoring or gurgling sounds.'],
          ['🔵', 'Blue or grey lips or fingertips.'],
          ['⚫', 'Very small (pinpoint) pupils.']
        ] },
        { title: 'What to do', steps: [
          ['🗣️', 'Shout their name. Rub hard on the middle of their chest with your knuckles. Do they respond?'],
          ['📞', 'Call {number}.'],
          ['👃', 'If you have naloxone, give it now. For the nose spray: spray it into one nostril.'],
          ['❤️', 'If they are not breathing normally, start CPR. If you are trained, give rescue breaths too.'],
          ['🛌', 'If they are breathing, roll them onto their side (recovery position).'],
          ['⏱️', 'If there is no change after 2 to 3 minutes, give another naloxone dose (in the other nostril) if you have one.'],
          ['🤝', 'Stay with them until help arrives. Naloxone can wear off, and they can stop breathing again.']
        ] }
      ],
      dont: [
        'Do not leave them alone.',
        'Do not put them in a cold bath or try to make them vomit.',
        'Do not give more drugs, alcohol or coffee to "wake them up".'
      ],
      callWhen: [
        'Always call {number} if someone will not wake up or is breathing slowly after drugs, alcohol or medicine.',
        'A child may have swallowed someone else\'s medicine.'
      ],
      sources: [S.aha2025, S.whoOpioid, S.ercSpecial],
      related: ['cpr', 'recovery-position', 'poisoning']
    },

    /* -------------------------------------------------------------- Drowning */
    {
      id: 'drowning', icon: '🌊', group: 'life', call: 'always',
      title: 'Drowning',
      summary: 'Someone is in trouble in water, or was pulled out of water.',
      keywords: ['drowning', 'drown', 'water', 'swimming', 'river', 'pool', 'sea', 'lake', 'flood', 'rescue breaths'],
      callText: 'Call {number} now. Do not put yourself in danger.',
      sections: [
        { title: 'Get them out safely', steps: [
          ['📢', 'Shout for help. Call {number}.'],
          ['🎣', 'Do not go into the water unless you are trained. Reach out with a stick or pole, or throw a rope or something that floats.'],
          ['🏊', 'Once they are out of the water, check: are they responding and breathing normally?']
        ] },
        { title: 'If they are not breathing normally', steps: [
          ['💨', 'If you know how, give 5 rescue breaths first.'],
          ['❤️', 'Then start CPR: 30 pushes, then 2 breaths. Keep going.'],
          ['🙌', 'If you cannot give breaths, do hands-only CPR. Do not wait.']
        ] },
        { title: 'If they are breathing', steps: [
          ['🛌', 'Roll them onto their side (recovery position).'],
          ['🧥', 'Take off wet clothes if you can. Keep them warm.'],
          ['👀', 'Keep checking their breathing until help arrives.']
        ] }
      ],
      dont: [
        'Do not jump into the water to rescue someone unless you are trained.',
        'Do not try to push water out of the stomach or lungs.',
        'Do not stop CPR to drain water.'
      ],
      callWhen: [
        'Always call {number} after a drowning, even if they seem well. Breathing problems can start hours later.',
        'Everyone who was pulled out of the water should be checked at a hospital.'
      ],
      sources: [S.ercSpecial, S.aha2025, S.whoDrowning],
      related: ['cpr', 'recovery-position']
    },

    /* ---------------------------------------------------------- Heat stroke */
    {
      id: 'heat-stroke', icon: '☀️', group: 'life', call: 'always',
      title: 'Heat stroke',
      summary: 'Very hot skin, confusion or collapse in hot weather or after hard work.',
      keywords: ['heat stroke', 'heatstroke', 'heat exhaustion', 'hot weather', 'heat wave', 'heatwave', 'sunstroke', 'overheating', 'hyperthermia'],
      callText: 'Heat stroke can kill. Call {number} now and start cooling at once.',
      sections: [
        { title: 'Signs', kind: 'note', steps: [
          ['🔥', 'Very hot skin. It may be dry or sweaty.'],
          ['😵', 'Confusion, slurred speech, strange behaviour, fainting or fits.'],
          ['🌡️', 'Body temperature 40 °C or more, if you can check it.']
        ] },
        { title: 'Cool them fast', steps: [
          ['📞', 'Call {number}.'],
          ['🌳', 'Move them to a cool, shady place.'],
          ['👕', 'Take off extra clothes.'],
          ['🛁', 'Best: put their body in cold water up to the neck (a bath, tub or tank). Hold their head above the water and stay with them.'],
          ['💦', 'If you cannot do that: pour or spray cold water all over them, and fan them hard.'],
          ['🧊', 'Put cold packs, ice in a cloth, or cold wet cloths on the neck, armpits and groin.'],
          ['⏱️', 'Keep cooling until they are more alert or help arrives. Stop if they start to shiver.'],
          ['🥤', 'If they are fully awake and can swallow, give sips of cool water.']
        ] },
        { title: 'Heat exhaustion (milder)', kind: 'variant', steps: [
          ['😓', 'Headache, dizziness, heavy sweating, cramps or feeling sick.'],
          ['🌳', 'Rest in a cool place. Drink water. Cool the skin with water and a fan.'],
          ['⏱️', 'If they are not better within 30 minutes, treat it as heat stroke and call {number}.']
        ] }
      ],
      dont: [
        'Do not wait for help before cooling. Cool them while you wait.',
        'Do not give drinks if they are confused or very drowsy.',
        'Do not give paracetamol or aspirin. They do not help heat stroke.'
      ],
      callWhen: [
        'Confusion, fainting, fits or very hot skin in the heat.',
        'Heat exhaustion that is not better within 30 minutes.'
      ],
      notes: ['If they stop responding, roll them onto their side. If they are not breathing normally, start CPR.'],
      sources: [S.ilcor, S.ercFirstAid, S.ahaRedCross, S.nhsHeat],
      related: ['dehydration', 'recovery-position', 'cpr']
    },

    /* ----------------------------------------------------- Recovery position */
    {
      id: 'recovery-position', icon: '🛌', group: 'other', call: 'always',
      title: 'Recovery position',
      summary: 'The person is breathing normally but is not awake.',
      keywords: ['recovery position', 'unconscious', 'fainted', 'passed out', 'not waking', 'breathing but not awake', 'side', 'drunk', 'vomiting', 'airway'],
      callText: 'Call {number} for anyone who does not wake up.',
      sections: [
        { title: 'Check first', steps: [
          ['👀', 'Check they are breathing normally. If not, start CPR.'],
          ['📞', 'Call {number}, or ask someone else to call.']
        ] },
        { title: 'Roll them onto their side', steps: [
          ['🧎', 'Kneel beside them. Take off their glasses and remove bulky things from their pockets.'],
          ['💪', 'Put the arm nearest you out to the side, at a right angle to the body.'],
          ['🤚', 'Bring the other arm across the chest. Hold the back of that hand against their cheek nearest you.'],
          ['🦵', 'With your other hand, pull up the far knee so the foot is flat on the ground.'],
          ['🔄', 'Keep their hand against their cheek. Pull on the bent knee to roll them towards you, onto their side.'],
          ['😮', 'Tilt the head back a little and lift the chin, so the airway stays open. The mouth should point down so vomit can drain out.'],
          ['👀', 'Keep checking their breathing. If it stops or is not normal, roll them onto their back and start CPR.']
        ] }
      ],
      dont: [
        'Do not leave them alone.',
        'Do not give them anything to eat or drink.',
        'Do not move someone you think has hurt their neck or back, unless you must keep the airway clear (for example, if they vomit).'
      ],
      callWhen: [
        'Anyone who does not wake up.',
        'Their breathing changes, or stops. Start CPR.'
      ],
      notes: [
        'If she is pregnant, roll her onto her left side.',
        'If they stay in this position for more than 30 minutes, roll them onto the other side.'
      ],
      sources: [S.ercFirstAid, S.rcuk],
      related: ['cpr', 'seizure', 'head-injury']
    },

    /* --------------------------------------------------------------- Seizure */
    {
      id: 'seizure', icon: '⚡', group: 'other', call: 'if',
      title: 'Seizure (fit)',
      summary: 'Sudden shaking, stiffness, or collapse.',
      keywords: ['seizure', 'fit', 'fits', 'convulsion', 'epilepsy', 'shaking', 'febrile seizure', 'jerking', 'epileptic'],
      sections: [
        { title: 'During the fit', steps: [
          ['🕒', 'Note the time the fit started.'],
          ['🛡️', 'Move hard or sharp things away from them.'],
          ['👐', 'Put something soft under their head. Loosen anything tight around the neck.'],
          ['👀', 'Stay with them and watch. Keep other people back.']
        ] },
        { title: 'After the shaking stops', steps: [
          ['🛌', 'Roll them onto their side (recovery position).'],
          ['💨', 'Check that they are breathing normally.'],
          ['🗣️', 'Stay with them until they are fully awake. Talk calmly. Tell them what happened.']
        ] }
      ],
      dont: [
        'Do not put anything in their mouth, not even your fingers.',
        'Do not hold them down or try to stop the shaking.',
        'Do not move them unless they are in danger, for example near a road, fire or water.',
        'Do not give food or drink until they are fully awake.'
      ],
      callWhen: [
        'The fit lasts more than 5 minutes, or one fit follows another.',
        'It is their first fit, or you do not know if they have epilepsy.',
        'They are hurt, or the fit happened in water.',
        'They do not wake up properly, or are not breathing normally afterwards.',
        'They are pregnant or have diabetes.',
        'A baby or young child has a fit, with or without a fever. Get them seen straight away.'
      ],
      sources: [S.epilepsy, S.imci, S.ercFirstAid],
      related: ['recovery-position', 'cpr', 'head-injury']
    },

    /* ----------------------------------------------------------------- Burns */
    {
      id: 'burns', icon: '🔥', group: 'other', call: 'if',
      title: 'Burns and scalds',
      summary: 'Skin burnt by fire, a hot object, hot liquid, steam or a chemical.',
      keywords: ['burn', 'burns', 'scald', 'scalds', 'hot water', 'fire', 'steam', 'blister', 'chemical burn', 'cooking', 'hot oil', 'paraffin'],
      sections: [
        { title: 'Cool the burn', steps: [
          ['🛑', 'Stop the burning. Move away from the heat. If clothes are on fire: stop, drop to the ground and roll.'],
          ['🚿', 'Cool the burn under cool running water for 20 minutes.'],
          ['⏱️', 'If you cannot do 20 minutes, cool it for at least 10 minutes. Start as soon as you can.'],
          ['💍', 'Take off rings, watches and tight clothes near the burn, before it swells.'],
          ['🧥', 'Keep the rest of the person warm. Cool the burn, not the whole person.'],
          ['🛡️', 'Cover the burn loosely with cling film (plastic food wrap) or a clean plastic bag. Lay it on top. Do not wrap it tightly.'],
          ['💊', 'For pain, paracetamol or ibuprofen can help. Follow the packet.']
        ] },
        { title: 'Chemical burn', kind: 'variant', steps: [
          ['🧤', 'Protect yourself with gloves if you can.'],
          ['🧹', 'Brush off any dry powder first.'],
          ['🚿', 'Rinse with lots of running water for at least 20 minutes.'],
          ['👕', 'Take off clothes with the chemical on them while you rinse.']
        ] }
      ],
      dont: [
        'Do not use ice or iced water.',
        'Do not put butter, oil, toothpaste, egg, flour or creams on the burn.',
        'Do not burst blisters.',
        'Do not pull off clothes that are stuck to the burn.',
        'Do not put fluffy cloth or cotton wool on the burn.'
      ],
      callWhen: [
        "The burn is large (bigger than the person's hand) or deep.",
        'They breathed in smoke or hot air, have trouble breathing, or have a hoarse voice.',
        'It is an electrical burn.',
        'They are very sleepy or confused, or pale, cold and sweaty (shock).'
      ],
      careWhen: [
        'The burn is on the face, hands, feet, genitals, or over a joint.',
        'A baby, young child, pregnant woman or older person is burnt.',
        'The skin is white, brown or black, or the burn does not hurt. It may be deep.',
        'It is a chemical burn (after rinsing).',
        'There are blisters bigger than a coin, or the burn looks infected later.'
      ],
      sources: [S.ilcor, S.ahaRedCross, S.nhsBurns],
      related: ['electric-shock', 'eye-chemical']
    },

    /* ------------------------------------------------------------- Poisoning */
    {
      id: 'poisoning', icon: '☠️', group: 'other', call: 'always',
      title: 'Poisoning',
      summary: 'Someone swallowed, breathed in, or touched something harmful.',
      keywords: ['poison', 'poisoning', 'swallowed', 'chemical', 'bleach', 'paraffin', 'kerosene', 'pesticide', 'rat poison', 'carbon monoxide', 'fumes', 'gas', 'button battery', 'child swallowed'],
      callText: 'Call {number} or a poison centre now, even if they seem well.',
      sections: [
        { title: 'First', steps: [
          ['⚠️', 'Make sure it is safe. Do not go into smoke, gas or fumes yourself.'],
          ['📞', 'If they are not responding or have trouble breathing, call {number} now.'],
          ['☎️', 'Otherwise, call a poison centre or {number} for advice.'],
          ['🧴', 'Find out what it was, how much, and when. Keep the bottle or packet to show the medical team.']
        ] },
        { title: 'Swallowed', kind: 'variant', steps: [
          ['💧', 'If the mouth burns, rinse the mouth with water and spit it out.'],
          ['🛌', 'If they are sleepy but breathing, roll them onto their side (recovery position).']
        ] },
        { title: 'On the skin', kind: 'variant', steps: [
          ['🧤', 'Wear gloves if you can.'],
          ['👕', 'Take off clothes with the poison on them.'],
          ['🚿', 'Wash the skin with lots of running water for 20 minutes.']
        ] },
        { title: 'Breathed in (smoke, gas or fumes)', kind: 'variant', steps: [
          ['🌬️', 'Get them into fresh air, if you can do it safely.'],
          ['🚪', 'Open doors and windows.']
        ] },
        { title: 'Pesticides (farm chemicals)', kind: 'variant', steps: [
          ['👕', 'Take off clothes with the chemical on them, and wash the skin.'],
          ['🏥', 'Go to hospital quickly. Take the container with you.']
        ] }
      ],
      dont: [
        'Do not make them vomit.',
        'Do not give salt water, milk, oil or anything else, unless a poison centre or health worker tells you to.',
        'Do not give mouth-to-mouth breaths if there is poison on their lips. Do hands-only CPR instead.',
        'Do not leave them alone.'
      ],
      callWhen: [
        'They are very sleepy, not responding, having a fit, or have trouble breathing.',
        'A child may have swallowed medicine, a chemical, paraffin or a button battery.',
        'Pesticide, rat poison or strong cleaning products were swallowed.'
      ],
      notes: ['For chemicals in the eye, see "Chemical in the eye".'],
      sources: [S.ahaRedCross, S.ercFirstAid, S.ilcor],
      related: ['eye-chemical', 'overdose', 'recovery-position', 'cpr']
    },

    /* ------------------------------------------------------------- Snakebite */
    {
      id: 'snakebite', icon: '🐍', group: 'other', call: 'always',
      title: 'Snakebite',
      summary: 'Someone was bitten by a snake.',
      keywords: ['snake', 'snakebite', 'snake bite', 'venom', 'cobra', 'viper', 'mamba', 'adder', 'bite', 'antivenom'],
      callText: 'Go to a hospital as fast as possible. Call {number} if you can.',
      sections: [
        { title: 'What to do', steps: [
          ['🐍', 'Move away from the snake. Do not try to catch or kill it. A photo from a safe distance can help.'],
          ['🧘', 'Keep the person calm and still. Moving spreads the venom faster.'],
          ['💍', 'Take off rings, watches, bracelets, shoes and tight clothes near the bite. The limb may swell.'],
          ['📏', 'Keep the bitten arm or leg still with a splint or sling, as you would for a broken bone.'],
          ['🏥', 'Get to a hospital or health centre quickly. Carry them if you can (on a stretcher, bicycle, motorbike or car). Do not let them walk.'],
          ['🛌', 'If they vomit, lay them on their side.'],
          ['🕒', 'Note the time of the bite, and any changes: swelling, bleeding, drooping eyelids, or trouble breathing.'],
          ['❤️', 'If they stop breathing normally, start CPR with rescue breaths if you can.']
        ] },
        { title: 'Venom in the eyes (spitting snake)', kind: 'variant', steps: [
          ['💧', 'Rinse the eyes at once with lots of clean water.']
        ] }
      ],
      dont: [
        'Do not cut the bite.',
        'Do not suck out the venom.',
        'Do not use a tight tourniquet, rope or string.',
        'Do not put ice, heat, electric shocks, herbs or traditional medicines on the bite.',
        'Do not give alcohol, aspirin or ibuprofen.',
        'If a tight band is already on, do not take it off until you reach the hospital. Taking it off suddenly can make them worse.'
      ],
      callWhen: [
        'Every snakebite needs a hospital check, even if there is no pain or swelling yet.',
        'Go at once if there is swelling, bleeding, drooping eyelids, trouble swallowing or breathing, or weakness.'
      ],
      notes: ['In some places, such as Australia, health workers teach a firm bandage for some snakes. Use it only if you are trained and it is advised where you live.'],
      sources: [S.whoSnake, S.ilcor, S.ercFirstAid],
      related: ['cpr', 'recovery-position', 'fractures']
    },

    /* --------------------------------------------------------- Hypoglycaemia */
    {
      id: 'hypoglycaemia', icon: '🍬', group: 'other', call: 'if',
      title: 'Low blood sugar (hypoglycaemia)',
      summary: 'A person with diabetes is shaky, sweaty, confused or acting strangely.',
      keywords: ['hypoglycaemia', 'hypoglycemia', 'hypo', 'low blood sugar', 'low sugar', 'diabetes', 'insulin', 'sugar', 'glucose', 'shaky', 'sweaty', 'glucagon'],
      sections: [
        { title: 'If they are awake and can swallow', steps: [
          ['🍬', 'Give fast sugar now, 15 to 20 grams. For example: glucose tablets, a small glass (150 to 200 mL) of fruit juice or regular soft drink (not diet), or 4 teaspoons of sugar in water.'],
          ['🛋️', 'Help them sit down and rest.'],
          ['⏱️', 'Wait 15 minutes. If they still feel unwell, or a blood sugar test is still low, give fast sugar again.'],
          ['🍞', 'When they feel better, give a snack or a meal, like bread, biscuits or rice.']
        ] },
        { title: 'If they are very sleepy or cannot swallow', kind: 'variant', steps: [
          ['🚫', 'Do not give anything by mouth. They could choke.'],
          ['🛌', 'If they are breathing, roll them onto their side (recovery position).'],
          ['📞', 'Call {number} now.'],
          ['💉', 'If they have a glucagon kit and you know how to use it, use it.'],
          ['❤️', 'If they stop breathing normally, start CPR.']
        ] }
      ],
      dont: [
        'Do not give food or drink to someone who is very drowsy or cannot swallow.',
        'Do not use diet or sugar-free drinks. They do not help.',
        'Do not leave them alone until they are fully better.'
      ],
      callWhen: [
        'They are very sleepy or confused, have a fit, or cannot swallow.',
        'They are not better after 2 doses of fast sugar.'
      ],
      sources: [S.ercFirstAid, S.ahaRedCross, S.diabetes],
      related: ['recovery-position', 'seizure']
    },

    /* ----------------------------------------------------------- Head injury */
    {
      id: 'head-injury', icon: '🤕', group: 'other', call: 'if',
      title: 'Head injury',
      summary: 'A knock, blow or fall onto the head.',
      keywords: ['head injury', 'head', 'concussion', 'knocked out', 'fall', 'bump on head', 'hit head', 'skull', 'brain injury'],
      sections: [
        { title: 'What to do', steps: [
          ['📞', 'If they are not responding, call {number}. If they are not breathing normally, start CPR.'],
          ['🧍', 'If you think the neck is hurt, keep the head and neck still. Do not move them unless they are in danger.'],
          ['🧊', 'If they are awake, help them sit down. Hold a cold pack wrapped in a cloth on the bump for up to 20 minutes.'],
          ['🩸', 'If the scalp is bleeding, press on it with a clean cloth.'],
          ['👀', 'Someone should stay with them for the next 24 hours and watch for danger signs.']
        ] }
      ],
      dont: [
        'Do not leave them alone for the first 24 hours.',
        'Do not give alcohol or sleeping pills.',
        'Do not let them play sport again until a health worker says it is safe.'
      ],
      callWhen: [
        'They were knocked out, even for a moment.',
        'They are very sleepy, hard to wake, or confused.',
        'They vomit more than once.',
        'They have a fit.',
        'A headache that gets worse, or does not go away.',
        'Blood or clear fluid comes from the ears or nose.',
        'Weakness, numbness, or trouble speaking, seeing or walking.',
        'One pupil (the black centre of the eye) is bigger than the other.',
        'They take blood-thinning medicine or have a bleeding problem.',
        'It was a high-energy accident: a car crash, being hit by a car, or a fall from a height.',
        'A baby or young child has a large bump or swelling, or is acting differently.'
      ],
      careWhen: [
        'They are over 65, or had been drinking alcohol or taking drugs.',
        'You are worried about them. Trust that feeling.'
      ],
      sources: [S.nice232, S.nhsHead, S.ercFirstAid],
      related: ['recovery-position', 'seizure', 'cpr']
    },

    /* ----------------------------------------------------------- Dehydration */
    {
      id: 'dehydration', icon: '💧', group: 'other', call: 'if',
      title: 'Diarrhoea and dehydration (ORS)',
      summary: 'Diarrhoea or vomiting. How to make and give ORS (oral rehydration solution).',
      keywords: ['dehydration', 'diarrhoea', 'diarrhea', 'vomiting', 'ors', 'oral rehydration', 'rehydration', 'zinc', 'cholera', 'loose stool', 'gastro', 'sugar salt solution'],
      sections: [
        { title: 'Give more fluid', steps: [
          ['🥤', 'Give more drinks than usual, starting now.'],
          ['📦', 'Best: ORS from a packet. Mix it with exactly the amount of clean water written on the packet.'],
          ['🥄', 'No packet? Make ORS at home: 1 litre of clean water (boiled and cooled), 6 level teaspoons of sugar and half a level teaspoon of salt. Stir until it dissolves.'],
          ['🍼', 'Give small sips often, from a cup or spoon. If the child vomits, wait 10 minutes, then give more slowly.'],
          ['📏', 'After each loose stool, give: under 2 years, 50 to 100 mL (a quarter to half a cup); 2 to 10 years, 100 to 200 mL (half to one cup); older children and adults, as much as they want.'],
          ['🤱', 'Keep breastfeeding. Keep giving food.'],
          ['💊', 'Zinc for children: give zinc every day for 10 to 14 days. Under 6 months: 10 mg a day. 6 months and older: 20 mg a day. Ask a health worker or pharmacy.'],
          ['🗑️', 'Make fresh ORS each day. Throw away what is left after 24 hours.'],
          ['🧼', 'Wash hands with soap after the toilet and before handling food.']
        ] }
      ],
      dont: [
        'Do not add extra sugar or salt. Too much salt is dangerous.',
        'Do not use sweet fizzy drinks or packet fruit juice to treat dehydration. They can make diarrhoea worse.',
        'Do not stop breastfeeding or feeding.',
        'Do not give medicines to stop diarrhoea to a child, unless a health worker says so.'
      ],
      callWhen: [
        'Very sleepy, floppy or hard to wake.',
        'Not able to drink or breastfeed, or vomits everything.',
        'Sunken eyes, and skin goes back very slowly when pinched.',
        'Fits, or a baby under 2 months with diarrhoea and fever.'
      ],
      careWhen: [
        'Blood in the poo.',
        'Drinking poorly, or vomiting again and again.',
        'Passing very little urine.',
        'Diarrhoea for more than 3 days, or getting worse.',
        'A baby under 6 months has diarrhoea.'
      ],
      notes: ['Safe drinks while you get ORS: soup, rice water, yoghurt drinks, clean water, and breast milk.'],
      sources: [S.whoDiarrhoea, S.imci, S.rehydrate],
      related: ['heat-stroke']
    },

    /* --------------------------------------------------- Chemical in the eye */
    {
      id: 'eye-chemical', icon: '👁️', group: 'other', call: 'if',
      title: 'Chemical in the eye',
      summary: 'A chemical, cleaning product or other liquid splashed into the eye.',
      keywords: ['eye', 'chemical in eye', 'eye splash', 'bleach in eye', 'eye injury', 'acid', 'alkali', 'cement', 'lime', 'rinse eye'],
      sections: [
        { title: 'Rinse straight away', steps: [
          ['🚿', 'Rinse the eye straight away with lots of clean running water, for 15 to 20 minutes.'],
          ['👁️', 'Hold the eye open while you rinse.'],
          ['↘️', 'Tilt the head so the water runs away from the other eye.'],
          ['👓', 'Take out contact lenses if it is easy, but keep rinsing.'],
          ['🧤', 'Protect yourself with gloves if you can.'],
          ['🏥', 'After rinsing, go to a hospital or eye clinic. Take the chemical bottle with you.']
        ] }
      ],
      dont: [
        'Do not rub the eye.',
        'Do not put anything else in the eye, such as milk, oil or eye drops. Only clean water.',
        'Do not try to neutralise the chemical with another chemical.'
      ],
      callWhen: [
        'A strong chemical: bleach, drain cleaner, cement, lime, battery acid or an industrial chemical.',
        'The eye is very painful, very red, or they cannot see well, even after rinsing.'
      ],
      careWhen: ['Any chemical splash to the eye should be checked by a health worker after rinsing.'],
      sources: [S.ercFirstAid, S.ahaRedCross, S.ilcor],
      related: ['burns', 'poisoning']
    },

    /* --------------------------------------------------------- Electric shock */
    {
      id: 'electric-shock', icon: '🔌', group: 'other', call: 'always',
      title: 'Electric shock',
      summary: 'Someone touched electricity or was struck by lightning.',
      keywords: ['electric shock', 'electrocution', 'electricity', 'power line', 'lightning', 'shock', 'cable', 'wire'],
      callText: 'Do not touch them until the power is off. Then call {number}.',
      sections: [
        { title: 'Make it safe first', steps: [
          ['🚫', 'Do not touch the person while they are still touching the electricity.'],
          ['🔌', 'Turn off the power at the switch, the plug, or the fuse box.'],
          ['⚠️', 'High-voltage power lines: stay far away, at least 18 metres (about 20 big steps). Call {number} and the power company.'],
          ['📞', 'Call {number}.']
        ] },
        { title: 'When it is safe', steps: [
          ['👀', 'Check their breathing. If they are not breathing normally, start CPR. Use an AED if there is one.'],
          ['🛌', 'If they are breathing but not awake, roll them onto their side (recovery position).'],
          ['🚿', 'Cool any burns under cool running water for 20 minutes.'],
          ['🏥', 'Everyone who had a strong electric shock should be checked at a hospital, even if they seem well. It can affect the heart.']
        ] },
        { title: 'Lightning', kind: 'note', steps: [
          ['⚡', 'A person struck by lightning does not carry electricity. It is safe to touch them. Start CPR if needed.']
        ] }
      ],
      dont: [
        'Do not touch the person with bare hands while the power is still on.',
        'Do not use anything wet or metal to move the electricity source.',
        'Do not go near fallen power lines.'
      ],
      callWhen: [
        'Any shock from high voltage or power lines, or lightning.',
        'They were knocked out, have burns, a strange heartbeat, trouble breathing, or confusion.'
      ],
      sources: [S.ercSpecial, S.ahaRedCross, S.ercFirstAid],
      related: ['cpr', 'burns', 'recovery-position']
    },

    /* ------------------------------------------------- Fractures and sprains */
    {
      id: 'fractures', icon: '🦴', group: 'other', call: 'if',
      title: 'Broken bones and sprains',
      summary: 'A possible broken bone, sprain or twisted joint.',
      keywords: ['fracture', 'broken bone', 'broken arm', 'broken leg', 'sprain', 'twisted ankle', 'dislocation', 'splint', 'sling', 'injury'],
      sections: [
        { title: 'What to do', steps: [
          ['✋', 'Keep the injured part still. Support it in the position you found it.'],
          ['📏', 'If they must be moved, use a splint (a board, stick or rolled newspaper) or a sling to stop it moving.'],
          ['🧣', 'Pad around it with soft cloth.'],
          ['🧊', 'Hold a cold pack or ice wrapped in a cloth on it for up to 20 minutes, to reduce swelling.'],
          ['🩸', 'If a bone is through the skin, cover the wound with a clean cloth. Press around the wound, not on the bone.']
        ] },
        { title: 'Sprain (twisted joint)', kind: 'variant', steps: [
          ['🛋️', 'Rest it.'],
          ['⬆️', 'Raise it on a pillow.'],
          ['🧊', 'Use a cold pack wrapped in a cloth for up to 20 minutes, a few times a day.']
        ] }
      ],
      dont: [
        'Do not try to push a bone back in, or to straighten the arm or leg.',
        'Do not move someone with a possible neck or back injury, unless they are in danger.',
        'Do not put ice straight onto the skin.',
        'Do not give food or drink if the injury is serious. They may need an operation.'
      ],
      callWhen: [
        'A bone is sticking out, or the arm or leg is bent the wrong way.',
        'The hand or foot below the injury is cold, blue, pale or numb.',
        'You think the neck, back, hip or thigh bone may be broken.',
        'There is heavy bleeding, or they are pale, cold and sweaty.'
      ],
      careWhen: [
        'They cannot put weight on it or use it.',
        'There is a lot of swelling or pain.',
        'It is not starting to feel better after 2 days.'
      ],
      sources: [S.ercFirstAid, S.ahaRedCross, S.ilcor],
      related: ['bleeding', 'head-injury']
    },

    /* ------------------------------------------------------------- Nosebleed */
    {
      id: 'nosebleed', icon: '👃', group: 'other', call: 'if',
      title: 'Nosebleed',
      summary: 'Bleeding from the nose.',
      keywords: ['nosebleed', 'nose bleed', 'bleeding nose', 'epistaxis', 'nose'],
      sections: [
        { title: 'What to do', steps: [
          ['🧍', 'Sit up and lean forward.'],
          ['🤏', 'Pinch the soft part of the nose, just below the bony part.'],
          ['⏱️', 'Keep pinching for 10 to 15 minutes without letting go. Breathe through your mouth.'],
          ['💦', 'Spit out any blood. Try not to swallow it.'],
          ['🔁', 'If it is still bleeding, pinch again for another 10 to 15 minutes.']
        ] }
      ],
      dont: [
        'Do not tip the head back.',
        'Do not lie down.',
        'Do not push tissue or cotton deep into the nose.',
        'Do not blow or pick the nose for a day afterwards.'
      ],
      callWhen: [
        'The bleeding does not stop after 20 to 30 minutes of firm pinching.',
        'There is a lot of blood, or they feel faint, look pale, or have trouble breathing.',
        'It started after a hit to the head.'
      ],
      careWhen: [
        'They take blood-thinning medicine or have a bleeding problem.',
        'Nosebleeds keep coming back.'
      ],
      sources: [S.ercFirstAid, S.nhsNose],
      related: ['bleeding', 'head-injury']
    }
  ];

  var index = {};
  cards.forEach(function (c) { index[c.id] = c; });

  return {
    v: 1,
    updated: '2026-11-03',
    reviewNote: 'Clinical sign-off required before public release (see docs/research/emergency-prevention-fsrs.md).',
    sources: S,
    cards: cards,
    index: index,
    groups: [
      { id: 'life', title: 'Life-threatening: act now' },
      { id: 'other', title: 'Other emergencies and injuries' }
    ]
  };
});

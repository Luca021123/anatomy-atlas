/* Clinician Toolkit — boot configuration */
(function () {
  'use strict';
  var msg = document.getElementById('boot-msg'); if (msg) msg.remove();
  MT.app.start({
    suite: 'clinician',
    title: 'Clinician Toolkit',
    subtitle: 'Practise',
    logo: '🩺',
    root: '../',
    categories: [
      { id: 'calculators', title: 'Scores & calculators' },
      { id: 'acute', title: 'Acute care & resuscitation' },
      { id: 'labs', title: 'Labs, fluids & drugs' },
      { id: 'workflow', title: 'Documentation & workflow' },
      { id: 'obstetrics', title: 'Obstetrics' }
    ],
    hero: {
      title: 'Clinician Toolkit',
      lead: 'Bedside decision support that works without signal: validated scores with references, a stepwise acid–base interpreter, weight-based emergency dosing, a resuscitation timer, triage and handover templates. Check every result against clinical judgement and local protocols.'
    }
  });
})();

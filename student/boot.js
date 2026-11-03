/* Medical Student Studio — boot configuration */
(function () {
  'use strict';
  var msg = document.getElementById('boot-msg'); if (msg) msg.remove();
  MT.app.start({
    suite: 'student',
    title: 'Medical Student Studio',
    subtitle: 'Learn',
    logo: '🎓',
    root: '../',
    categories: [
      { id: 'memory', title: 'Remember' },
      { id: 'anatomy', title: 'Anatomy' },
      { id: 'physiology', title: 'Physiology' },
      { id: 'ecg', title: 'ECG' },
      { id: 'clinical', title: 'Clinical skills & reasoning' },
      { id: 'ebm', title: 'Evidence & statistics' }
    ],
    hero: {
      title: 'Medical Student Studio',
      lead: 'Learn by doing: spaced repetition that schedules itself, interactive anatomy, physiology you can manipulate, ECGs generated from first principles, OSCE practice and evidence-based-medicine maths. Free, offline, and private.'
    }
  });
})();

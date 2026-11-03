/* Salus — boot configuration */
(function () {
  'use strict';
  var msg = document.getElementById('boot-msg'); if (msg) msg.remove();
  MT.app.start({
    suite: 'health',
    title: 'Salus',
    subtitle: 'Your health companion',
    logo: '♥',
    root: '../',
    i18n: true,
    quickExit: true,
    categories: [
      { id: 'help', title: 'Get help' },
      { id: 'me', title: 'My health' },
      { id: 'daily', title: 'Daily habits & tracking' },
      { id: 'mind', title: 'Mind & sleep' },
      { id: 'prevent', title: 'Stay protected' }
    ],
    hero: {
      title: 'Salus',
      lead: 'Free, private health help for everyone, everywhere. Know when to get care, learn first aid, check your health, and build habits that add healthy years. Works offline. Nothing you enter leaves your phone.'
    },
    footer: 'Salus is free and open. It works offline, needs no account, and keeps everything on this device. It gives general health information and cannot diagnose you. If you are very unwell, contact a health worker or emergency services.'
  });
})();

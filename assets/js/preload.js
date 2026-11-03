/* Applies saved theme/text size before first paint (avoids a flash). Kept tiny on purpose. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('mt:settings') || '{}');
    var r = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') r.setAttribute('data-theme', s.theme);
    if (s.textSize && s.textSize !== 'normal') r.setAttribute('data-textsize', s.textSize);
  } catch (e) { /* storage blocked: defaults apply */ }
})();

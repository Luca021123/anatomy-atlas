/* Clinician Toolkit — calculator browser.
 * Lists every calculator definition pushed into self.MTCalcs by clinician/lib/calcs-*.js,
 * with search, category filters, favourites and recents. Routes:
 *   #/calculators            -> browser
 *   #/calculators/<calcId>   -> one calculator (rendered by MT.calc.render)
 */
(function () {
  'use strict';
  var h = MT.h;
  var FAV_KEY = 'clinician.calc.favs', RECENT_KEY = 'clinician.calc.recent';

  function all() { return (self.MTCalcs || []).filter(function (d) { return d && d.id && d.name; }); }
  function byId(id) { return all().filter(function (d) { return d.id === id; })[0]; }
  function favs() { return MT.store.get(FAV_KEY, []); }
  function isFav(id) { return favs().indexOf(id) >= 0; }
  function toggleFav(id) { MT.store.update(FAV_KEY, [], function (f) { return f.indexOf(id) >= 0 ? f.filter(function (x) { return x !== id; }) : f.concat([id]); }); }
  function pushRecent(id) { MT.store.update(RECENT_KEY, [], function (r) { return [id].concat(r.filter(function (x) { return x !== id; })).slice(0, 8); }); }
  function matches(d, q) {
    if (!q) return true;
    var hay = [d.name, d.summary || '', d.category || '', (d.keywords || []).join(' ')].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  MT.registerSearch(function (q) {
    return all().filter(function (d) { return matches(d, q); }).slice(0, 12).map(function (d) {
      return { title: d.name, description: (d.category ? d.category + ' · ' : '') + (d.summary || ''), href: '#/calculators/' + d.id, icon: '🧮' };
    });
  });

  MT.css('calc-browser', [
    '.calc-list { display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }',
    '.calc-item { display:flex; gap:.6rem; align-items:flex-start; }',
    '.calc-item .calc-name { font-weight:700; color:var(--text); }',
    '.calc-item .calc-sum { color:var(--muted); font-size:.86rem; line-height:1.35; margin-top:2px; }',
    '.calc-item .calc-cat { font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; color:var(--accent-text); font-weight:700; }',
    '.star-btn { border:0; background:none; font-size:1.25rem; cursor:pointer; color:var(--muted); padding:2px 6px; border-radius:8px; }',
    '.star-btn[aria-pressed="true"] { color:#d97706; }',
    '.calc-filters { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 16px; }'
  ].join('\n'));

  function renderList(container, ctx) {
    var q = '', cat = MT.store.get('clinician.calc.cat', 'all');
    var defs = all();
    var cats = [];
    defs.forEach(function (d) { if (d.category && cats.indexOf(d.category) < 0) cats.push(d.category); });
    cats.sort();
    var search = h('input.input', { type: 'search', placeholder: 'Search ' + defs.length + ' calculators (name, condition, keyword)…', 'aria-label': 'Search calculators' });
    var filters = h('div.calc-filters', { role: 'group', 'aria-label': 'Filter by category' });
    var listHost = h('div');
    function chip(id, label) {
      var b = h('button.chip', { type: 'button', 'aria-pressed': String(cat === id), onclick: function () { cat = id; MT.store.set('clinician.calc.cat', id); MT.$$('.chip', filters).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); draw(); } }, label);
      return b;
    }
    filters.appendChild(chip('all', 'All'));
    filters.appendChild(chip('favs', '★ Favourites'));
    cats.forEach(function (c) { filters.appendChild(chip(c, c)); });
    function item(d) {
      var star = h('button.star-btn', { type: 'button', 'aria-pressed': String(isFav(d.id)), 'aria-label': 'Favourite ' + d.name, onclick: function (e) { e.preventDefault(); e.stopPropagation(); toggleFav(d.id); star.setAttribute('aria-pressed', String(isFav(d.id))); star.textContent = isFav(d.id) ? '★' : '☆'; if (cat === 'favs') draw(); } }, isFav(d.id) ? '★' : '☆');
      return h('a.card.calc-item', { href: '#/calculators/' + d.id },
        h('div.grow', h('div.calc-cat', d.category || ''), h('div.calc-name', d.name), d.summary ? h('div.calc-sum', d.summary) : null), star);
    }
    function draw() {
      MT.clear(listHost);
      var list = defs.filter(function (d) { return matches(d, q) && (cat === 'all' || (cat === 'favs' ? isFav(d.id) : d.category === cat)); });
      list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var recents = MT.store.get(RECENT_KEY, []).map(byId).filter(Boolean);
      if (!q && cat === 'all' && recents.length) {
        listHost.appendChild(h('h2.section-title', 'Recently used'));
        listHost.appendChild(h('div.pill-list', { style: 'margin-bottom:8px' }, recents.map(function (d) { return h('a.chip', { href: '#/calculators/' + d.id }, d.name); })));
      }
      if (!defs.length) { listHost.appendChild(MT.ui.empty('🧮', 'No calculators loaded', 'The calculator library files did not load.')); return; }
      if (!list.length) { listHost.appendChild(MT.ui.empty('🔍', cat === 'favs' ? 'No favourites yet' : 'No matches', cat === 'favs' ? 'Tap ☆ on any calculator to pin it here.' : 'Try a different word.')); return; }
      listHost.appendChild(h('h2.section-title', list.length + ' calculator' + (list.length === 1 ? '' : 's')));
      listHost.appendChild(h('div.calc-list', list.map(item)));
    }
    search.addEventListener('input', MT.debounce(function () { q = search.value.trim(); draw(); }, 80));
    container.appendChild(h('div.page-head',
      h('h1', '🧮 Scores & calculators'),
      h('p.lead', 'Validated clinical scores and formulas with live results, interpretation, and references. Inputs accept SI or conventional units.')));
    container.appendChild(search);
    container.appendChild(filters);
    container.appendChild(listHost);
    draw();
    setTimeout(function () { if (window.innerWidth > 760) search.focus(); }, 50);
  }

  function renderOne(container, d) {
    pushRecent(d.id);
    var star = h('button.star-btn', { type: 'button', 'aria-pressed': String(isFav(d.id)), 'aria-label': 'Favourite', onclick: function () { toggleFav(d.id); star.setAttribute('aria-pressed', String(isFav(d.id))); star.textContent = isFav(d.id) ? '★' : '☆'; } }, isFav(d.id) ? '★' : '☆');
    container.appendChild(h('div.page-head',
      h('div.breadcrumb', h('a', { href: '#/' }, 'Home'), ' › ', h('a', { href: '#/calculators' }, 'Calculators'), d.category ? [' › ', d.category] : null),
      h('h1', d.name, star),
      d.summary ? h('p.lead', d.summary) : null));
    var host = h('div');
    container.appendChild(host);
    MT.calc.render(d, host);
    container.appendChild(h('div', { style: 'margin-top:16px' }, MT.ui.disclaimer()));
  }

  MT.registerTool({
    id: 'calculators',
    title: 'Scores & calculators',
    category: 'calculators',
    icon: '🧮',
    order: 0,
    header: false,
    description: 'Evidence-based clinical scores and formulas with interpretation and references.',
    keywords: ['score', 'risk', 'calculator', 'formula', 'mdcalc'],
    render: function (container, ctx) {
      var id = ctx.params[0];
      var d = id ? byId(id) : null;
      if (id && !d) container.appendChild(MT.ui.alert('warn', 'Calculator not found', 'Showing all calculators instead.'));
      if (d) { ctx.setTitle(d.name); renderOne(container, d); }
      else renderList(container, ctx);
    }
  });
})();

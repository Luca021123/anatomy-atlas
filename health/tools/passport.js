/* Salus H4 — Health passport: QR, wallet card, lock-screen image, IPS-shaped JSON. Also the home widget 'passport-alerts'. */
(function () {
  'use strict';
  var h = MT.h, L = (self.MTLib || {}).passport;
  var KEY = 'health.passport.data', KEY_PREFS = 'health.passport.prefs';
  if (!L || typeof qrcode === 'undefined') { console.error('Passport needs MTLib.passport and qrcode'); return; }

  MT.css('pp', [
    '.pp-grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}',
    '.pp-row{border:1px solid var(--border);border-radius:var(--radius-sm);padding:.6rem;background:var(--surface-2);display:grid;gap:.5rem}',
    '.pp-row .pp-rm{justify-self:end}',
    '.pp-qrbox{display:grid;gap:1rem;grid-template-columns:minmax(0,300px) minmax(0,1fr);align-items:start}',
    '@media(max-width:700px){.pp-qrbox{grid-template-columns:1fr}}',
    '.pp-qr{background:#fff;border-radius:var(--radius-sm);padding:6px;border:1px solid var(--border);line-height:0;max-width:320px}',
    '.pp-qr svg{width:100%;height:auto;display:block}',
    '.pp-meter{height:10px;border-radius:99px;background:var(--surface-3);overflow:hidden}.pp-meter>i{display:block;height:100%;background:var(--accent)}',
    '.pp-meter.warn>i{background:var(--warn)}',
    '.pp-text{font-family:var(--mono);font-size:.8rem;white-space:pre-wrap;word-break:break-word;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.6rem;max-height:260px;overflow:auto;margin:0}',
    '.pp-wallet{display:flex;flex-wrap:wrap;gap:0;max-width:720px}',
    '.pp-panel{--w:340px;width:var(--w);aspect-ratio:85.6/54;box-sizing:border-box;border:1.5px dashed var(--border-strong);background:#fff;color:#111;font-size:11px;line-height:1.25;padding:8px 9px;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:3px;border-radius:6px}',
    '.pp-panel .pp-top{background:#b91c1c;color:#fff;margin:-8px -9px 3px;padding:3px 9px;font-weight:800;letter-spacing:.04em;font-size:10px;display:flex;justify-content:space-between}',
    '.pp-panel b{font-weight:800}.pp-panel .pp-name{font-size:15px;font-weight:800}',
    '.pp-panel .pp-warn{border:1.5px solid #b91c1c;color:#7f1d1d;padding:2px 4px;border-radius:3px;background:#fef2f2}',
    '.pp-panel .pp-cardqr{position:absolute;right:7px;bottom:7px;width:30%;background:#fff;line-height:0}',
    '.pp-panel .pp-cardqr svg{width:100%;height:auto}',
    '.pp-panel.pp-back .pp-body{width:68%}',
    '.pp-foldnote{font-size:.8rem;color:var(--muted)}',
    '.pp-page{background:#fff;color:#111;padding:20px;border:1px solid var(--border);border-radius:var(--radius-sm);max-width:760px}',
    '.pp-page h2{margin:.2rem 0 .6rem;font-size:1.3rem;color:#111}.pp-page h3{margin:.9rem 0 .2rem;font-size:1rem;color:#111;border-bottom:1px solid #ccc}',
    '.pp-page ul{margin:.2rem 0 .2rem 1.2rem;padding:0}.pp-page .pp-pgqr{width:170px;float:right;margin:0 0 8px 12px;line-height:0}',
    '.pp-page .pp-pgqr svg{width:100%;height:auto}',
    '.pp-lockwrap{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:1rem;align-items:start}',
    '@media(max-width:700px){.pp-lockwrap{grid-template-columns:1fr}}',
    '.pp-lockwrap canvas{width:100%;max-width:260px;height:auto;border-radius:18px;border:1px solid var(--border-strong);background:#000}',
    '.pp-printroot{display:none}',
    '.pp-wsub{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem}',
    '@media print{.pp-printroot.print-target{display:block!important}',
    '.pp-printroot .pp-panel{--w:85.6mm;width:85.6mm;height:54mm;aspect-ratio:auto;font-size:7.4pt;border:.3mm dashed #666;border-radius:0;padding:2.4mm 2.8mm;page-break-inside:avoid}',
    '.pp-printroot .pp-panel .pp-top{margin:-2.4mm -2.8mm 1.2mm;padding:.8mm 2.8mm;font-size:6.5pt}.pp-printroot .pp-panel .pp-name{font-size:10pt}',
    '.pp-printroot .pp-wallet{max-width:none;width:171.2mm}.pp-printroot .pp-foldnote{display:block!important;color:#444}',
    '.pp-printroot .pp-page{border:0;padding:0;max-width:none}.pp-printroot{color:#000;background:#fff}',
    '.pp-printroot .pp-panel *,.pp-printroot .pp-page *{color:inherit}.pp-printroot .pp-panel .pp-top{color:#fff!important}.pp-printroot .pp-warn{color:#7f1d1d!important}}'
  ].join('\n'));

  /* ------------------------------------------------------------ data */
  function blank() { return L.emptyPassport(); }
  function load() {
    var s = MT.store.get(KEY, null), d = blank();
    if (!s || typeof s !== 'object') return d;
    d.updatedAt = s.updatedAt || null;
    d.id = Object.assign(d.id, s.id || {});
    d.pregnancy = Object.assign(d.pregnancy, s.pregnancy || {});
    ['allergies', 'conditions', 'meds', 'vaccines', 'devices', 'contacts'].forEach(function (k) { if (Array.isArray(s[k])) d[k] = s[k].filter(function (x) { return x && typeof x === 'object'; }); });
    ['donor', 'directive', 'unwell'].forEach(function (k) { if (typeof s[k] === 'string') d[k] = s[k]; });
    return d;
  }
  function loadPrefs() {
    var p = MT.store.get(KEY_PREFS, {}) || {};
    p.sections = p.sections || {}; p.budget = L.BUDGETS[p.budget] ? p.budget : 'standard';
    p.lock = Object.assign({ name: true, dob: true, blood: true, allergies: true, conditions: true, meds: true, unwell: true, contacts: true }, p.lock || {});
    return p;
  }
  function save(d) { d.updatedAt = new Date().toISOString(); MT.store.set(KEY, d); }
  function isEmpty(d) { return !(d.id.name || d.id.dob || d.allergies.length || d.conditions.length || d.meds.length || d.contacts.length || d.unwell); }
  function today() { return MT.today(); }

  /* ------------------------------------------------------------ QR drawing */
  function qrMatrix(text) {
    var bytes = L.utf8Length(text), lvl = L.qrLevelFor(bytes);
    if (!lvl) throw new Error('too long');
    var q = qrcode(0, lvl); q.addData(text); q.make();
    var n = q.getModuleCount();
    return { n: n, level: lvl, dark: function (r, c) { return q.isDark(r, c); } };
  }
  function qrSvg(m, label) {
    var quiet = 4, size = m.n + quiet * 2, svg = MT.s('svg', { viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': label || MT.t('QR code'), 'shape-rendering': 'crispEdges' });
    svg.appendChild(MT.s('rect', { x: 0, y: 0, width: size, height: size, fill: '#fff' }));
    for (var r = 0; r < m.n; r++) {
      var c = 0;
      while (c < m.n) {
        if (m.dark(r, c)) { var s = c; while (c < m.n && m.dark(r, c)) c++; svg.appendChild(MT.s('rect', { x: s + quiet, y: r + quiet, width: c - s, height: 1, fill: '#000' })); } else c++;
      }
    }
    return svg;
  }
  function qrCanvas(m, px) {
    var quiet = 4, size = m.n + quiet * 2, cell = Math.max(2, Math.floor(px / size)), cv = document.createElement('canvas');
    cv.width = cv.height = cell * size; var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
    for (var r = 0; r < m.n; r++) for (var c = 0; c < m.n; c++) if (m.dark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return cv;
  }
  function summaryFor(d, prefs, budgetKey) {
    return L.buildSummary(d, { sections: prefs.sections, maxBytes: L.BUDGETS[budgetKey || prefs.budget], today: today() });
  }
  function safeQr(sum) { try { return qrMatrix(sum.text); } catch (e) { return null; } }

  /* ------------------------------------------------------------ small UI helpers */
  var uid = 0;
  function field(label, control, hint) { var id = 'ppf' + (++uid); control.id = id; return h('div.field', h('label', { for: id }, label), control, hint ? h('div.hint', hint) : null); }
  function textInput(obj, key, opts) {
    opts = opts || {};
    var i = h('input', { type: opts.type || 'text', value: obj[key] || '', placeholder: opts.placeholder || '', autocomplete: 'off', maxlength: opts.max || 120, inputmode: opts.inputmode || null });
    i.addEventListener('input', function () { obj[key] = i.value; opts.onChange && opts.onChange(); });
    return i;
  }
  function selectInput(obj, key, options, onChange) {
    var s = h('select', options.map(function (o) { return h('option', { value: o.value, selected: (obj[key] || '') === o.value }, o.label); }));
    s.addEventListener('change', function () { obj[key] = s.value; onChange && onChange(); });
    return s;
  }

  /* ------------------------------------------------------------ editor */
  function listEditor(d, key, cfg, persist, afterAdd) {
    var wrap = h('div.stack', { style: '--gap:.5rem' }), list = h('div.stack', { style: '--gap:.5rem' });
    function draw(focusLast) {
      MT.clear(list);
      if (!d[key].length) list.appendChild(h('p.muted.small', { style: 'margin:0' }, cfg.empty));
      d[key].forEach(function (it, idx) {
        var row = h('div.pp-row', h('div.pp-grid', cfg.fields.map(function (f) {
          var ctl = f.options ? selectInput(it, f.k, f.options, persist) : textInput(it, f.k, { type: f.type, placeholder: f.ph && MT.t(f.ph), onChange: persist, max: f.max, inputmode: f.inputmode });
          return field(MT.t(f.label), ctl);
        })), h('button.btn.btn-sm.btn-ghost.pp-rm', { type: 'button', 'aria-label': MT.t('Remove {item}', { item: it[cfg.fields[0].k] || MT.t(cfg.singular) }), onclick: function () { d[key].splice(idx, 1); persist(); draw(); } }, '✕ ' + MT.t('Remove')));
        list.appendChild(row);
      });
      if (focusLast) { var ins = MT.$$('input,select', list); var last = list.lastChild && MT.$('input', list.lastChild); if (last) last.focus(); }
    }
    draw();
    var btns = h('div.row', { style: '--gap:.5rem' }, h('button.btn.btn-sm.btn-soft', { type: 'button', onclick: function () { d[key].push({ id: MT.uid('p') }); persist(); draw(true); } }, '+ ' + MT.t(cfg.add)));
    (cfg.extra || []).forEach(function (b) { btns.appendChild(b(function () { draw(); })); });
    wrap.appendChild(list); wrap.appendChild(btns);
    return h('section.card', h('h3', { style: 'margin-top:0' }, MT.t(cfg.title)), cfg.hint ? h('p.muted.small', MT.t(cfg.hint)) : null, wrap);
  }

  function renderEdit(box, d, persist) {
    var profile = MT.profile.get();
    box.appendChild(MT.ui.alert('info', MT.t('You choose what goes in'), MT.t('Everything stays on this phone. Fill in only what you are happy for a stranger to read in an emergency. You can leave any part empty.')));
    var fill = h('button.btn.btn-sm.btn-soft', { type: 'button', onclick: function () {
      var changed = 0;
      if (!d.id.name && profile.name) { d.id.name = profile.name; changed++; }
      if (!d.id.sex && profile.sex) { d.id.sex = profile.sex; changed++; }
      if (profile.pregnant && !d.pregnancy.pregnant) { d.pregnancy.pregnant = true; changed++; }
      persist(); MT.toast(changed ? MT.t('Filled in from your profile') : MT.t('Nothing new in your profile'), changed ? 'ok' : 'warn'); if (changed) MT.app.route();
    } }, MT.t('Fill from my profile'));
    var idBox = h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('About me')),
      h('div.pp-grid',
        field(MT.t('Name or initials'), textInput(d.id, 'name', { onChange: persist, max: 80, placeholder: MT.t('For example A. Khan') })),
        field(MT.t('Date of birth'), textInput(d.id, 'dob', { type: 'date', onChange: persist })),
        field(MT.t('Sex'), selectInput(d.id, 'sex', [{ value: '', label: MT.t('Not stated') }, { value: 'female', label: MT.t('Female') }, { value: 'male', label: MT.t('Male') }, { value: 'other', label: MT.t('Other') }], persist)),
        field(MT.t('Blood group'), selectInput(d.id, 'blood', [{ value: '', label: MT.t('Not known') }].concat(L.BLOOD.map(function (b) { return { value: b, label: b }; })), persist)),
        field(MT.t('Language I speak'), textInput(d.id, 'lang', { onChange: persist, max: 40, placeholder: MT.t('For example Swahili') }))),
      h('div.row', { style: 'margin-top:.5rem' }, fill));
    box.appendChild(idBox);
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('If I am found unwell…')),
      h('p.muted.small', MT.t('One or two short sentences for a helper. For example: "I have epilepsy." or "I have diabetes. Give sugar if I am confused."')),
      field(MT.t('My instruction'), (function () { var t = h('textarea', { rows: 3, maxlength: 240 }); t.value = d.unwell || ''; t.addEventListener('input', function () { d.unwell = t.value; persist(); }); return t; })())));
    var sevOpts = [{ value: '', label: MT.t('Not stated') }, { value: 'mild', label: MT.t('Mild') }, { value: 'moderate', label: MT.t('Moderate') }, { value: 'severe', label: MT.t('Severe') }];
    box.appendChild(listEditor(d, 'allergies', { title: 'Allergies', singular: 'allergy', add: 'Add an allergy', empty: 'No allergies added. If you have none, leave this empty.', hint: 'Medicines, foods, insect stings, latex.', fields: [{ k: 'substance', label: 'Allergic to', ph: 'Penicillin' }, { k: 'reaction', label: 'What happens', ph: 'Rash, swelling, trouble breathing' }, { k: 'severity', label: 'How bad', options: sevOpts }] }, persist));
    box.appendChild(listEditor(d, 'conditions', { title: 'Health conditions', singular: 'condition', add: 'Add a condition', empty: 'No conditions added.', fields: [{ k: 'name', label: 'Condition', ph: 'Diabetes, epilepsy, asthma…' }] }, persist));
    box.appendChild(listEditor(d, 'meds', {
      title: 'Medicines', singular: 'medicine', add: 'Add a medicine', empty: 'No medicines added.', hint: 'You can copy these from your medicine list in the Daily coach.',
      fields: [{ k: 'name', label: 'Medicine', ph: 'Metformin' }, { k: 'dose', label: 'Dose and how often', ph: '500 mg, twice a day' }],
      extra: [function (redraw) {
        return h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () {
          var store = MT.store.get('health.coach.meds', null), items = (store && Array.isArray(store.items) ? store.items : []).filter(function (m) { return m && m.name && m.active !== false; });
          if (!items.length) { MT.toast(MT.t('No medicines found in your medicine list'), 'warn'); return; }
          var have = {}; d.meds.forEach(function (m) { have[String(m.name || '').toLowerCase()] = 1; }); var n = 0;
          items.forEach(function (m) { if (!have[String(m.name).toLowerCase()]) { d.meds.push({ id: MT.uid('p'), name: String(m.name).slice(0, 100), dose: String(m.dose || '').slice(0, 100) }); n++; } });
          persist(); redraw(); MT.toast(n ? MT.t('Added {n} from your medicine list', { n: n }) : MT.t('Already up to date'), n ? 'ok' : 'warn');
        } }, '⬇ ' + MT.t('Import from my medicine list'));
      }]
    }, persist));
    box.appendChild(listEditor(d, 'devices', { title: 'Implants and devices', singular: 'device', add: 'Add a device', empty: 'None added.', hint: 'Pacemaker, stent, insulin pump, joint replacement, hearing aid…', fields: [{ k: 'name', label: 'Device', ph: 'Pacemaker' }] }, persist));
    box.appendChild(listEditor(d, 'vaccines', { title: 'Vaccinations', singular: 'vaccine', add: 'Add a vaccine', empty: 'No vaccines added.', hint: 'Copy from a vaccine card if you have one.', fields: [{ k: 'name', label: 'Vaccine', ph: 'Tetanus' }, { k: 'date', label: 'Date given', type: 'date' }] }, persist));
    var preg = h('input', { type: 'checkbox', checked: !!d.pregnancy.pregnant });
    var due = textInput(d.pregnancy, 'due', { type: 'date', onChange: persist });
    preg.addEventListener('change', function () { d.pregnancy.pregnant = preg.checked; persist(); });
    if (d.id.sex !== 'male') box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Pregnancy')), h('label.check', preg, h('span.grow', MT.t('I am pregnant'))), field(MT.t('Due date (optional)'), due)));
    box.appendChild(listEditor(d, 'contacts', { title: 'Emergency contacts', singular: 'contact', add: 'Add a contact', empty: 'No contacts added.', hint: 'Someone who can be called if you cannot speak. Include the country code.', fields: [{ k: 'name', label: 'Name', ph: 'Sara' }, { k: 'relation', label: 'Who they are', ph: 'Sister' }, { k: 'phone', label: 'Phone', type: 'tel', inputmode: 'tel', ph: '+254 700 000000' }] }, persist));
    var donor = selectInput(d, 'donor', [{ value: '', label: MT.t('Not stated') }, { value: 'yes', label: MT.t('Yes, I am an organ donor') }, { value: 'no', label: MT.t('No') }], persist);
    var dir = h('textarea', { rows: 3, maxlength: 300 }); dir.value = d.directive || ''; dir.addEventListener('input', function () { d.directive = dir.value; persist(); });
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('My wishes')), h('div.stack', field(MT.t('Organ donation'), donor), field(MT.t('Advance directive or treatment wishes'), dir, MT.t('For example: "I do not want CPR if I am very ill." Say where the full paper is kept.')))));
    box.appendChild(h('div.row', { style: 'margin-top:.5rem' }, h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.app.navigate('#/passport/qr'); } }, MT.t('Next: make my QR and card'))));
  }

  /* ------------------------------------------------------------ printing */
  function printNode(node) {
    var host = MT.$('.content') || document.body, wrap = h('div.pp-printroot', node.cloneNode(true));
    host.appendChild(wrap);
    var done = function () { wrap.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(done, 20000);
    MT.print(wrap);
  }

  /* ------------------------------------------------------------ cards */
  function cardLines(d) {
    var id = d.id, age = L.ageYears(id.dob, today());
    return {
      name: id.name || MT.t('Name not given'),
      born: id.dob ? MT.t('Born {date}', { date: id.dob }) + (age != null ? ' (' + MT.t('{n} years', { n: age }) + ')' : '') : '',
      blood: id.blood ? MT.t('Blood group {b}', { b: id.blood }) : '',
      allergies: d.allergies.filter(function (a) { return a.substance; }).map(function (a) { return a.substance + (a.severity === 'severe' ? ' (' + MT.t('severe') + ')' : ''); }),
      conditions: d.conditions.map(function (c) { return c.name; }).filter(Boolean),
      meds: d.meds.filter(function (m) { return m.name; }).map(function (m) { return m.name + (m.dose ? ' ' + m.dose : ''); }),
      devices: d.devices.map(function (c) { return c.name; }).filter(Boolean),
      contacts: d.contacts.filter(function (c) { return c.name || c.phone; }).map(function (c) { return (c.name || '') + (c.relation ? ' (' + c.relation + ')' : '') + (c.phone ? ' ' + c.phone : ''); })
    };
  }
  function walletCard(d, prefs) {
    var c = cardLines(d), sum = summaryFor(d, prefs, 'small'), m = safeQr(sum);
    var front = h('div.pp-panel.pp-front', h('div.pp-top', h('span', MT.t('EMERGENCY HEALTH INFO')), h('span', 'Salus')),
      h('div.pp-name', c.name), h('div', [c.born, c.blood].filter(Boolean).join(' · ')),
      c.allergies.length ? h('div.pp-warn', h('b', MT.t('Allergies') + ': '), c.allergies.join(', ')) : h('div', h('b', MT.t('Allergies') + ': '), MT.t('none recorded')),
      c.conditions.length ? h('div', h('b', MT.t('Conditions') + ': '), c.conditions.join(', ')) : null,
      c.devices.length ? h('div', h('b', MT.t('Implants') + ': '), c.devices.join(', ')) : null,
      d.unwell ? h('div', h('b', MT.t('If I am unwell') + ': '), d.unwell) : null);
    var back = h('div.pp-panel.pp-back', h('div.pp-top', h('span', MT.t('MEDICINES AND CONTACTS')), h('span', MT.t('Updated {date}', { date: (d.updatedAt || today()).slice(0, 10) }))),
      h('div.pp-body', c.meds.length ? h('div', h('b', MT.t('Medicines') + ': '), c.meds.join('; ')) : null,
        c.contacts.length ? h('div', h('b', MT.t('Call') + ': '), c.contacts.join('; ')) : null,
        d.pregnancy.pregnant ? h('div', h('b', MT.t('Pregnant')), d.pregnancy.due ? ' · ' + MT.t('due {date}', { date: d.pregnancy.due }) : '') : null,
        d.donor === 'yes' ? h('div', MT.t('Organ donor')) : null),
      m ? h('div.pp-cardqr', qrSvg(m, MT.t('Health passport QR code'))) : null);
    return h('div.pp-wallet', front, back);
  }
  function fullPage(d, prefs) {
    var c = cardLines(d), sum = summaryFor(d, prefs), m = safeQr(sum);
    function sec(t, arr) { return arr && arr.length ? [h('h3', t), h('ul', arr.map(function (x) { return h('li', x); }))] : []; }
    return h('div.pp-page', m ? h('div.pp-pgqr', qrSvg(m, MT.t('Health passport QR code'))) : null,
      h('h2', MT.t('My health passport')), h('p', h('b', c.name), c.born ? ' · ' + c.born : '', c.blood ? ' · ' + c.blood : '', d.id.sex ? ' · ' + (d.id.sex === 'female' ? MT.t('Female') : d.id.sex === 'male' ? MT.t('Male') : MT.t('Other')) : '', d.id.lang ? ' · ' + MT.t('Speaks {lang}', { lang: d.id.lang }) : ''),
      d.unwell ? h('p', h('b', MT.t('If I am found unwell') + ': '), d.unwell) : null,
      sec(MT.t('Allergies'), d.allergies.filter(function (a) { return a.substance; }).map(function (a) { return a.substance + (a.reaction ? ' – ' + a.reaction : '') + (a.severity ? ' (' + MT.t(a.severity) + ')' : ''); })),
      sec(MT.t('Health conditions'), c.conditions), sec(MT.t('Medicines'), c.meds), sec(MT.t('Implants and devices'), c.devices),
      d.pregnancy.pregnant ? [h('h3', MT.t('Pregnancy')), h('p', MT.t('Pregnant') + (d.pregnancy.due ? ', ' + MT.t('due {date}', { date: d.pregnancy.due }) : ''))] : null,
      sec(MT.t('Emergency contacts'), c.contacts),
      sec(MT.t('Vaccinations'), d.vaccines.filter(function (v) { return v.name; }).map(function (v) { return v.name + (v.date ? ' – ' + v.date : ''); })),
      (d.donor || d.directive) ? [h('h3', MT.t('My wishes')), d.donor ? h('p', MT.t('Organ donor') + ': ' + (d.donor === 'yes' ? MT.t('yes') : MT.t('no'))) : null, d.directive ? h('p', d.directive) : null] : null,
      h('p', { style: 'clear:both;font-size:.85em;color:#444;margin-top:1rem' }, MT.t('Written by the person themselves on {date}. It is not a medical record and has not been checked by a doctor.', { date: (d.updatedAt || today()).slice(0, 10) })));
  }

  /* ------------------------------------------------------------ share tab */
  function renderShare(box, d, prefs) {
    if (isEmpty(d)) { box.appendChild(MT.ui.empty('🪪', MT.t('Your passport is empty'), MT.t('Add your name, allergies or medicines first.'))); box.appendChild(h('p', h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.app.navigate('#/passport'); } }, MT.t('Fill in my passport')))); return; }
    var savePrefs = function () { MT.store.set(KEY_PREFS, prefs); };
    var out = h('div.stack');
    var secBox = h('div.choice-list');
    L.SECTIONS.forEach(function (s) {
      var cb = h('input', { type: 'checkbox', checked: prefs.sections[s.id] !== false });
      cb.addEventListener('change', function () { prefs.sections[s.id] = cb.checked; savePrefs(); refresh(); });
      secBox.appendChild(h('label.check', cb, h('span.grow', MT.t(s.label))));
    });
    var sizes = [{ value: 'small', label: MT.t('Small (easiest to scan)') }, { value: 'standard', label: MT.t('Standard') }, { value: 'large', label: MT.t('Large (most details)') }];
    var seg = MT.ui.segmented(sizes, prefs.budget, function (v) { prefs.budget = v; savePrefs(); refresh(); });
    var cardHost = h('div'), pageHost = h('div');
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('What goes in the QR code')), h('p.muted.small', MT.t('Tick what a helper may see.')), secBox,
      h('div.field', { style: 'margin-top:.75rem' }, h('div.field-label', MT.t('How much text')), seg, h('div.hint', MT.t('A small QR scans best from a lock screen or a printed card. A large one holds more but needs a steady hand.')))));
    box.appendChild(out);
    var cardSec = h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Wallet card')), h('p.muted.small', MT.t('Print it, cut along the outer line and fold in the middle. The front has the key facts. The back has medicines, contacts and a small QR code.')), cardHost,
      h('p.pp-foldnote', MT.t('The card is the size of a bank card (85 by 54 mm). The card QR code is always the small size.')), h('div.pp-wsub', h('button.btn.btn-primary', { type: 'button', onclick: function () { printNode(cardHost.firstChild); } }, '🖨 ' + MT.t('Print wallet card'))));
    var pageSec = h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Full-page summary')), h('p.muted.small', MT.t('A printable page with everything you chose. Good to keep with your documents or give to a clinic.')), h('div.pp-wsub', h('button.btn.btn-primary', { type: 'button', onclick: function () { printNode(pageHost.firstChild); } }, '🖨 ' + MT.t('Print full page'))), h('details.disclosure', { style: 'margin-top:.75rem' }, h('summary', MT.t('Preview')), h('div.disclosure-body', pageHost)));
    box.appendChild(cardSec); box.appendChild(pageSec);

    function refresh() {
      MT.clear(out);
      var budgetKey = prefs.budget, sum = summaryFor(d, prefs, budgetKey), m = safeQr(sum), max = L.BUDGETS[budgetKey];
      var pct = Math.min(100, Math.round(sum.bytes / max * 100));
      var warn = [];
      if (sum.truncated) {
        var names = sum.dropped.concat(sum.shortened).map(function (id) { return MT.t((L.SECTIONS.filter(function (s) { return s.id === id; })[0] || { label: id }).label); });
        warn.push(MT.ui.alert('warn', MT.t('Some details did not fit'), MT.t('Left out or shortened: {list}. Pick "Large", or untick sections you do not need.', { list: names.join(', ') })));
      }
      if (!m) warn.push(MT.ui.alert('danger', MT.t('Could not make the QR code'), MT.t('The text is too long. Untick some sections.')));
      var qrHost = h('div.pp-qr', m ? qrSvg(m, MT.t('Health passport QR code')) : null);
      var explain = h('details.disclosure', { open: true }, h('summary', MT.t('What does a person see when they scan it?')),
        h('div.disclosure-body.stack', h('p', MT.t('Any phone camera can read this QR code. No app, internet or password is needed. They see the plain text below, nothing more.')),
          h('p', MT.t('That also means anyone who can see the QR code can read it. Only include what you are happy for a stranger to know.')),
          h('pre.pp-text', { tabindex: 0, 'aria-label': MT.t('Text a scanner will see') }, sum.text)));
      out.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('My QR code')), warn,
        h('div.pp-qrbox', h('div', qrHost, h('div.small.muted', { style: 'margin-top:.4rem' }, MT.t('{n} of {max} bytes used', { n: sum.bytes, max: max })), h('div.pp-meter' + (pct > 92 ? '.warn' : ''), { role: 'img', 'aria-label': pct + '%' }, h('i', { style: 'width:' + pct + '%' }))),
          h('div.stack', explain, h('div.row', { style: '--gap:.5rem' },
            h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.copy(sum.text); } }, '📋 ' + MT.t('Copy text')),
            m ? h('button.btn.btn-sm', { type: 'button', onclick: function () { qrCanvas(m, 1024).toBlob(function (b) { if (b) MT.download('salus-passport-qr.png', b, 'image/png'); }); } }, '⬇ ' + MT.t('Save QR picture')) : null,
            MT.speech.button ? MT.speech.button(function () { return sum.text.replace(/\n/g, '. '); }) : null)))));
      MT.clear(cardHost); cardHost.appendChild(walletCard(d, prefs));
      MT.clear(pageHost); pageHost.appendChild(fullPage(d, prefs));
    }
    refresh();
  }

  /* ------------------------------------------------------------ lock screen image */
  function wrapText(g, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  /** Draws the lock-screen image (1080x2340, 9:19.5). Content sits below the clock area and above the bottom buttons. */
  function drawLock(cv, d, prefs) {
    var W = 1080, H = 2340, g = cv.getContext('2d'); cv.width = W; cv.height = H;
    var o = prefs.lock, c = cardLines(d);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    var blocks = [];
    if (o.name) blocks.push({ t: c.name, size: 74, weight: 800, color: '#fff' });
    var meta = []; if (o.dob && c.born) meta.push(c.born); if (o.blood && c.blood) meta.push(c.blood);
    if (meta.length) blocks.push({ t: meta.join('  ·  '), size: 46, weight: 600, color: '#fde68a' });
    if (o.unwell && d.unwell) blocks.push({ label: MT.t('IF I AM UNWELL'), t: d.unwell, size: 50, weight: 700, color: '#fff', box: '#7f1d1d' });
    if (o.allergies) blocks.push({ label: MT.t('ALLERGIES'), t: c.allergies.length ? c.allergies.join(', ') : MT.t('None recorded'), size: 52, weight: 800, color: '#fecaca' });
    if (o.conditions && c.conditions.length) blocks.push({ label: MT.t('CONDITIONS'), t: c.conditions.concat(c.devices).join(', '), size: 46, weight: 600, color: '#fff' });
    if (o.meds && c.meds.length) blocks.push({ label: MT.t('MEDICINES'), t: c.meds.join('; '), size: 40, weight: 500, color: '#e5e7eb' });
    if (o.contacts && c.contacts.length) blocks.push({ label: MT.t('CALL'), t: c.contacts.slice(0, 3).join('\n'), size: 46, weight: 700, color: '#bbf7d0' });
    var zoneTop = 520, zoneBot = 2090, qrSize = 560, m = safeQr(summaryFor(d, prefs, 'small'));
    var textBottom = m ? zoneBot - qrSize - 40 : zoneBot;
    var scale = 1, ops, total;
    function layout(sc) {
      ops = []; var y = zoneTop + 40;
      ops.push({ kind: 'header', y: zoneTop - 90 });
      blocks.forEach(function (b) {
        g.font = b.weight + ' ' + Math.round(b.size * sc) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        var lines = []; String(b.t).split('\n').forEach(function (seg) { wrapText(g, seg, W - 160).forEach(function (l) { lines.push(l); }); });
        var lh = Math.round(b.size * sc * 1.22), labelH = b.label ? Math.round(34 * sc) : 0;
        ops.push({ kind: 'block', b: b, lines: lines, y: y, lh: lh, labelH: labelH, sc: sc });
        y += labelH + lines.length * lh + Math.round(26 * sc);
      });
      return y;
    }
    for (scale = 1; scale > 0.45; scale -= 0.05) { total = layout(scale); if (total <= textBottom) break; }
    ops.forEach(function (op) {
      if (op.kind === 'header') {
        g.fillStyle = '#b91c1c'; g.fillRect(0, op.y, W, 88); g.fillStyle = '#fff'; g.font = '800 44px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
        g.fillText(MT.t('EMERGENCY HEALTH INFO'), W / 2, op.y + 46); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; return;
      }
      var b = op.b, y = op.y, x = 80;
      if (b.label) { g.fillStyle = '#9ca3af'; g.font = '700 ' + Math.round(30 * op.sc) + 'px system-ui, sans-serif'; g.fillText(b.label, x, y + Math.round(26 * op.sc)); y += op.labelH; }
      g.fillStyle = b.color; g.font = b.weight + ' ' + Math.round(b.size * op.sc) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      op.lines.forEach(function (ln, i) { g.fillText(ln, x, y + Math.round(b.size * op.sc) + i * op.lh - 6); });
    });
    if (m) {
      var qc = qrCanvas(m, qrSize), s = qrSize + 24, x0 = Math.round((W - s) / 2), y0 = zoneBot - s;
      g.fillStyle = '#fff'; g.fillRect(x0, y0, s, s); g.drawImage(qc, x0 + 12, y0 + 12, qrSize, qrSize);
      g.fillStyle = '#9ca3af'; g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(MT.t('Scan with any phone camera'), W / 2, zoneBot + 56); g.textAlign = 'left';
    }
    return { scale: scale, overflow: total > textBottom };
  }
  function renderLock(box, d, prefs) {
    if (isEmpty(d)) { box.appendChild(MT.ui.empty('📱', MT.t('Your passport is empty'), MT.t('Add your details first.'))); box.appendChild(h('p', h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.app.navigate('#/passport'); } }, MT.t('Fill in my passport')))); return; }
    var cv = h('canvas', { role: 'img', 'aria-label': MT.t('Preview of your lock-screen image') }), note = h('div');
    var opts = [['name', 'Name'], ['dob', 'Birth date'], ['blood', 'Blood group'], ['unwell', 'If I am unwell'], ['allergies', 'Allergies'], ['conditions', 'Conditions and devices'], ['meds', 'Medicines'], ['contacts', 'Emergency contacts']];
    var list = h('div.choice-list');
    function redraw() { var r = drawLock(cv, d, prefs); MT.clear(note); if (r.overflow) note.appendChild(MT.ui.alert('warn', null, MT.t('Too much text to fit. Untick something so it stays readable.'))); }
    opts.forEach(function (o) { var cb = h('input', { type: 'checkbox', checked: prefs.lock[o[0]] !== false }); cb.addEventListener('change', function () { prefs.lock[o[0]] = cb.checked; MT.store.set(KEY_PREFS, prefs); redraw(); }); list.appendChild(h('label.check', cb, h('span.grow', MT.t(o[1])))); });
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Lock-screen picture')),
      h('p', MT.t('Make a picture of your emergency information and the QR code. Set it as your lock-screen wallpaper so a helper can see it without unlocking your phone.')),
      h('div.pp-lockwrap', cv, h('div.stack', h('div.field-label', MT.t('Show on the picture')), list, note,
        h('div.row', { style: '--gap:.5rem' }, h('button.btn.btn-primary', { type: 'button', onclick: function () { cv.toBlob(function (b) { if (b) MT.download('salus-lock-screen.png', b, 'image/png'); else MT.toast(MT.t('Could not make the picture'), 'danger'); }, 'image/png'); } }, '⬇ ' + MT.t('Save picture (PNG)')))))));
    box.appendChild(MT.ui.alert('warn', MT.t('Think about privacy'), MT.t('Anyone who picks up your phone can read this picture. Leave out anything you want to keep private.')));
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('How to set it as your wallpaper')),
      h('ol', h('li', MT.t('Save the picture. It goes to your downloads or photos.')), h('li', MT.t('On an iPhone: open Settings, then Wallpaper, then Add New Wallpaper, then Photos.')), h('li', MT.t('On an Android phone: press and hold the home screen, choose Wallpaper, then pick the picture and choose "Lock screen".')), h('li', MT.t('Also turn on your phone\'s own Medical ID or Emergency information if it has one.'))),
      h('p.muted.small', MT.t('The clock and notifications show over the top of the picture, so the key facts are placed lower down.'))));
    redraw();
  }

  /* ------------------------------------------------------------ file tab */
  function renderFile(box, d, prefs) {
    var preview = h('pre.pp-text', { tabindex: 0 });
    function exportJson() { return JSON.stringify(L.buildIps(d), null, 2); }
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Save a file')),
      h('p', MT.t('Save your passport as a file you can keep, email to yourself, or give to a clinic. It follows the International Patient Summary shape (HL7 FHIR R4).')),
      MT.ui.alert('info', MT.t('IPS-shaped, not formally validated'), MT.t('The file is built to match the standard layout, but it has not been checked with an official validator. A clinic system may not accept it.')),
      h('div.row', { style: 'margin-top:.5rem;--gap:.5rem' },
        h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.download('salus-health-passport-' + today() + '.json', exportJson(), 'application/json'); } }, '⬇ ' + MT.t('Save passport file')),
        h('button.btn', { type: 'button', onclick: function () { preview.textContent = exportJson().slice(0, 6000) + (exportJson().length > 6000 ? '\n…' : ''); } }, MT.t('Show the file contents'))), preview));
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Load a file')),
      h('p', MT.t('Choose a passport file you saved before. You can add it to what you have, or replace what you have.')),
      h('button.btn', { type: 'button', onclick: function () {
        MT.readFile('.json,application/json').then(function (f) {
          if (f.text.length > 2e6) { MT.toast(MT.t('That file is too big to be a passport'), 'danger'); return; }
          var obj; try { obj = JSON.parse(f.text); } catch (e) { MT.toast(MT.t('That file is not a valid passport file'), 'danger'); return; }
          var v = L.validateIps(obj);
          if (!v.ok) { MT.modal({ title: MT.t('Cannot load this file'), body: h('ul', v.errors.map(function (e) { return h('li', MT.t(e)); })), actions: [{ label: MT.t('OK'), variant: 'primary' }] }); return; }
          var parsed = L.parseIps(obj), inc = parsed.data;
          var body = h('div.stack', h('p', MT.t('Found {a} allergies, {c} conditions, {m} medicines, {v} vaccines and {k} contacts for {name}.', { a: inc.allergies.length, c: inc.conditions.length, m: inc.meds.length, v: inc.vaccines.length, k: inc.contacts.length, name: inc.id.name || MT.t('an unnamed person') })),
            v.warnings.length ? h('ul.small', v.warnings.map(function (w) { return h('li', MT.t(w)); })) : null,
            isEmpty(d) ? null : MT.ui.alert('warn', null, MT.t('Replace will delete what is in your passport now. Add keeps yours and adds new rows.')));
          var apply = function (next) { save(next); MT.toast(MT.t('Passport loaded'), 'ok'); MT.app.navigate('#/passport'); MT.app.route(); };
          MT.modal({ title: MT.t('Load this passport?'), body: body, actions: [{ label: MT.t('Cancel'), variant: 'ghost' }].concat(isEmpty(d) ? [] : [{ label: MT.t('Add to mine'), onClick: function () { apply(L.mergePassport(d, inc)); } }]).concat([{ label: MT.t('Replace mine'), variant: 'primary', onClick: function () { apply(inc); } }]) });
        }).catch(function (e) { if (e && e.message !== 'No file') MT.toast(MT.t('Could not read the file'), 'danger'); });
      } }, '⬆ ' + MT.t('Load passport file'))));
    box.appendChild(h('p.small.muted', MT.t('Your passport is also included in the Back up button in Settings.')));
  }

  /* ------------------------------------------------------------ tool */
  MT.registerTool({
    id: 'passport', title: 'Health passport', category: 'me', icon: '🪪', order: 5,
    description: 'Keep your allergies, medicines and contacts in one place. Make a QR code, a wallet card and a lock-screen picture for emergencies.',
    keywords: ['passport', 'qr', 'medical id', 'allergies', 'emergency card', 'lock screen', 'ips', 'fhir', 'wallet card', 'records'],
    render: function (container, ctx) {
      var d = load(), prefs = loadPrefs();
      var tab = { qr: 'qr', lock: 'lock', file: 'file' }[ctx.params[0]] || 'edit';
      var body = h('div.stack');
      var persist = function () { save(d); };
      container.appendChild(MT.ui.alert('info', MT.t('Private by design'), MT.t('Your passport lives only on this phone. There is no account and no cloud. You decide who sees it.')));
      var tabs = MT.ui.tabs([{ id: 'edit', label: MT.t('My details') }, { id: 'qr', label: MT.t('QR and card') }, { id: 'lock', label: MT.t('Lock screen') }, { id: 'file', label: MT.t('File') }], tab, function (id) {
        MT.app.navigate('#/passport' + (id === 'edit' ? '' : '/' + id));
      });
      container.appendChild(tabs); container.appendChild(body);
      if (tab === 'edit') renderEdit(body, d, persist); else if (tab === 'qr') renderShare(body, d, prefs); else if (tab === 'lock') renderLock(body, d, prefs); else renderFile(body, d, prefs);
      container.appendChild(MT.ui.disclaimer(MT.t('This passport is written by you. It is not a medical record and a health worker will still check the facts. Never delay calling for help to look at it.')));
    }
  });

  /* ------------------------------------------------------------ home widget */
  MT.registerWidget({
    id: 'passport-alerts', order: 30,
    render: function (box) {
      var parts = [], t = today(), profile = MT.profile.get();
      var d = load();
      box.appendChild(h('div.card', h('div.row', { style: 'justify-content:space-between;align-items:center;--gap:.5rem' },
        h('div', h('strong', '🪪 ' + MT.t('My health passport')), h('div.small.muted', isEmpty(d) ? MT.t('Not set up yet. It takes two minutes.') : MT.t('Last updated {date}', { date: (d.updatedAt || t).slice(0, 10) }))),
        h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.app.navigate(isEmpty(d) ? '#/passport' : '#/passport/qr'); } }, isEmpty(d) ? MT.t('Set up my passport') : MT.t('Show my health passport QR'))), (function () {
        var alerts = h('div.stack', { style: 'margin-top:.75rem;--gap:.5rem' });
        try {
          var results = MT.store.get('health.checkup.results', null), over = MT.store.get('health.prevention.person', {}) || {};
          var person = L.personFrom(profile, results, over, t);
          if (person.age != null) {
            var done = Object.assign({}, MT.store.get('health.prevention.done', {}) || {}), auto = L.autoRecords(MT.store.get('health.coach.bp', null), results);
            Object.keys(auto).forEach(function (k) { if (!done[k] || done[k].date < auto[k].date) done[k] = auto[k]; });
            var items = L.evaluate(person, t).items.map(function (it) { return L.withStatus(it, done[it.id], t); });
            var over1 = items.filter(function (i) { return i.status === 'overdue'; }), soon = items.filter(function (i) { return i.status === 'soon'; });
            var hot = over1.concat(soon);
            if (hot.length) alerts.appendChild(MT.ui.alert(over1.length ? 'warn' : 'info', over1.length ? MT.t('{n} health checks are overdue', { n: over1.length }) : MT.t('{n} health checks are due soon', { n: soon.length }), h('span', hot.slice(0, 3).map(function (i) { return MT.t(i.title); }).join(', ') + ' ', h('a', { href: '#/prevention' }, MT.t('See my checklist')))));
          }
          var cache = MT.store.get('health.environment.cache', null), vul = L.vulnerabilityFrom(profile, MT.store.get('health.coach.meds', null), t).length > 0;
          var risk = L.heatFromCache(cache, vul, Date.now(), 6);
          if (risk && risk.level >= 2) alerts.appendChild(MT.ui.alert(risk.level >= 3 ? 'danger' : 'warn', MT.t('Heat alert: {level}', { level: MT.t(risk.label) }), h('span', MT.t('It feels like {t} °C where you are.', { t: Math.round(risk.feelsC) }) + ' ', h('a', { href: '#/environment' }, MT.t('See heat advice')))));
        } catch (e) { console.warn('passport widget', e); }
        return alerts;
      })()));
    }
  });
})();

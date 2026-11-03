/* Salus H4 — Vaccines and screening checklist (adults, pregnancy) and a child vaccine schedule checker. */
(function () {
  'use strict';
  var h = MT.h, L = (self.MTLib || {}).passport;
  if (!L) { console.error('Prevention needs MTLib.passport'); return; }
  var K_PERSON = 'health.prevention.person', K_DONE = 'health.prevention.done', K_CHILD = 'health.prevention.children';

  MT.css('pv', [
    '.pv-item{display:grid;gap:.5rem}',
    '.pv-head{display:flex;gap:.6rem;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}',
    '.pv-title{font-weight:700;font-size:1.02rem;margin:0}',
    '.pv-meta{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}',
    '.pv-done{display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end}',
    '.pv-done .field{margin:0;min-width:140px}',
    '.pv-bar{display:flex;gap:.5rem;flex-wrap:wrap}',
    '.pv-stat{flex:1 1 90px;text-align:center;padding:.6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface-2)}',
    '.pv-stat b{display:block;font-size:1.5rem;line-height:1.1}',
    '.pv-src{font-size:.8rem;color:var(--muted)}',
    '.pv-dose td,.pv-dose th{vertical-align:middle}',
    '@media print{.pv-noprint{display:none!important}}'
  ].join('\n'));

  function today() { return MT.today(); }
  function getDone() { var d = MT.store.get(K_DONE, {}); return d && typeof d === 'object' ? d : {}; }
  function field(label, ctl, hint) { var id = MT.uid('pvf'); ctl.id = id; return h('div.field', h('label', { for: id }, label), ctl, hint ? h('div.hint', hint) : null); }
  var STATUS = {
    overdue: { label: 'Overdue', type: 'danger' }, check: { label: 'Check if you are due', type: 'warn' }, soon: { label: 'Due soon', type: 'warn' }, ok: { label: 'Up to date', type: 'ok' },
    consider: { label: 'Ask your clinic', type: 'info' }, discuss: { label: 'Talk it over first', type: 'info' }
  };
  function badge(st) { var s = STATUS[st] || STATUS.check; return MT.ui.badge((st === 'ok' ? '✓ ' : st === 'overdue' ? '! ' : '') + MT.t(s.label), s.type); }

  function reminderDate(it) {
    var t = L.parseDate(today()), n = it.nextDate ? L.parseDate(it.nextDate) : null;
    var d = n && n >= t ? n : L.addDays(t, it.status === 'overdue' || !n ? 7 : 0);
    d.setHours(9, 0, 0, 0); return d;
  }
  function icsEvent(it) {
    return { uid: 'prev-' + it.id + '-' + today(), title: MT.t('Salus reminder: {name}', { name: MT.t(it.title) }), description: MT.t('Time to check this: {name}. Your country\'s schedule may differ, so check with your clinic.', { name: MT.t(it.title) }), start: reminderDate(it), durationMin: 30, alarmMin: 1440 };
  }

  /* ------------------------------------------------------------ adult */
  function renderAdult(box) {
    var profile = MT.profile.get(), results = MT.store.get('health.checkup.results', null), over = MT.store.get(K_PERSON, {}) || {};
    var t = today();
    var person = L.personFrom(profile, results, over, t), res = L.evaluate(person, t);
    var done = getDone(), auto = L.autoRecords(MT.store.get('health.coach.bp', null), results);
    Object.keys(auto).forEach(function (k) { if (!done[k] || done[k].date < auto[k].date) done[k] = auto[k]; });
    var items = res.items.map(function (it) { return L.withStatus(it, done[it.id], t); });
    var list = h('div.stack'), summary = h('div');

    box.appendChild(MT.ui.alert('warn', MT.t('Your country\'s schedule may differ'), MT.t('This list follows WHO and well-known guidelines. Your country may start earlier or later, use other vaccines, or offer other tests. Check with your clinic. This is not a substitute for advice about your own health.')));

    /* about-you form */
    var form = h('details.disclosure', { open: res.missing.length > 0 || undefined }, h('summary', MT.t('About you (used to build your list)')), h('div.disclosure-body.stack'));
    var fb = MT.$('.disclosure-body', form);
    function setOver(k, v) { over[k] = v; MT.store.set(K_PERSON, over); redraw(); }
    var dob = h('input', { type: 'date', value: over.dob || '' }); dob.addEventListener('change', function () { setOver('dob', dob.value); });
    var sex = h('select', [['', 'Not stated'], ['female', 'Female'], ['male', 'Male']].map(function (o) { return h('option', { value: o[0], selected: (over.sex || profile.sex || '') === o[0] }, MT.t(o[1])); })); sex.addEventListener('change', function () { setOver('sex', sex.value); });
    fb.appendChild(h('p.muted.small', MT.t('We use your profile and health check where we can. Change anything here. Nothing leaves your phone.')));
    fb.appendChild(h('div.form-grid', field(MT.t('Date of birth'), dob, person.age != null ? MT.t('Age {n}', { n: person.age }) : MT.t('Needed for your list')), field(MT.t('Sex'), sex, MT.t('Some tests depend on it'))));
    var checks = h('div.choice-list');
    [['pregnant', 'I am pregnant'], ['diabetes', 'I have diabetes'], ['heart', 'I have heart disease or had a stroke'], ['lung', 'I have lung disease (asthma, COPD)'], ['kidney', 'I have kidney disease'], ['liver', 'I have liver disease'], ['hiv', 'I live with HIV'], ['immuno', 'My immune system is weak (cancer treatment, steroids, transplant)'], ['healthWorker', 'I work in health care'], ['tbRisk', 'I have a cough for 2+ weeks, night sweats, or I live with someone who has TB']].forEach(function (c) {
      var cb = h('input', { type: 'checkbox', checked: !!person[c[0]] }); cb.addEventListener('change', function () { setOver(c[0], cb.checked); });
      checks.appendChild(h('label.check', cb, h('span.grow', MT.t(c[1]))));
    });
    fb.appendChild(checks);
    var sm = h('select', [['', 'Not stated'], ['never', 'Never smoked'], ['former', 'I used to smoke'], ['current', 'I smoke now']].map(function (o) { return h('option', { value: o[0], selected: (person.smoking || '') === o[0] }, MT.t(o[1])); })); sm.addEventListener('change', function () { setOver('smoking', sm.value); });
    var py = h('input', { type: 'text', inputmode: 'decimal', value: person.packYears != null ? String(person.packYears) : '' }); py.addEventListener('change', function () { var n = MT.num(py.value); setOver('packYears', n == null || n < 0 || n > 200 ? undefined : n); });
    var qy = h('input', { type: 'text', inputmode: 'decimal', value: person.quitYearsAgo != null ? String(person.quitYearsAgo) : '' }); qy.addEventListener('change', function () { var n = MT.num(qy.value); setOver('quitYearsAgo', n == null || n < 0 || n > 80 ? undefined : n); });
    fb.appendChild(h('div.form-grid', field(MT.t('Smoking'), sm),
      field(MT.t('Pack-years'), py, MT.t('Packs a day times years smoked. 1 pack = 20 cigarettes. Used for lung screening.')),
      person.smoking === 'former' ? field(MT.t('Years since you quit'), qy) : h('div')));
    box.appendChild(form);
    if (res.missing.length) box.appendChild(MT.ui.alert('info', MT.t('We need a little more'), MT.t('Add your date of birth (or fill in your profile) to see your list. Add your sex to see sex-specific tests.')));
    box.appendChild(summary); box.appendChild(list);

    var filter = 'all';
    var chips = h('div.pv-bar.pv-noprint');
    [['all', 'Everything'], ['attention', 'Needs attention'], ['vaccine', 'Vaccines'], ['screening', 'Tests and checks']].forEach(function (f) {
      var b = h('button.btn.btn-sm' + (f[0] === filter ? '.btn-soft' : '.btn-ghost'), { type: 'button', 'aria-pressed': String(f[0] === filter), onclick: function () { filter = f[0]; MT.$$('button', chips).forEach(function (x) { x.className = 'btn btn-sm btn-ghost'; x.setAttribute('aria-pressed', 'false'); }); b.className = 'btn btn-sm btn-soft'; b.setAttribute('aria-pressed', 'true'); draw(); } }, MT.t(f[1]));
      chips.appendChild(b);
    });

    function redraw() { MT.app.route(); }
    function save(id, date, years) { var dn = getDone(); if (date) dn[id] = { date: date, years: years || undefined }; else delete dn[id]; MT.store.set(K_DONE, dn); MT.emit('prevention:change'); }

    function card(it) {
      var dateIn = h('input', { type: 'date', value: it.lastDate && !(done[it.id] && done[it.id].auto) ? it.lastDate : '', max: t });
      var yrsSel = it.intervals ? h('select', it.intervals.map(function (iv) { return h('option', { value: String(iv.years), selected: (done[it.id] && done[it.id].years ? done[it.id].years : it.interval) === iv.years }, MT.t(iv.label)); })) : null;
      var saveBtn = h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: function () { if (!dateIn.value || !L.isDate(dateIn.value) || dateIn.value > t) { MT.toast(MT.t('Pick a date that is today or earlier'), 'warn'); return; } save(it.id, dateIn.value, yrsSel ? Number(yrsSel.value) : undefined); MT.toast(MT.t('Saved'), 'ok'); redraw(); } }, MT.t('Save'));
      var info = it.lastDate ? h('div.small', MT.t('Last done: {d}', { d: MT.formatDate(it.lastDate) }), done[it.id] && done[it.id].auto ? ' (' + MT.t('from your other Salus records') + ')' : '', it.nextDate ? ' · ' + MT.t('Next due: {d}', { d: MT.formatDate(it.nextDate) }) : (it.once ? ' · ' + MT.t('One-time, no repeat needed') : '')) : null;
      var meta = h('div.pv-meta', badge(it.status), it.interval && !it.once ? MT.ui.badge(it.interval === 1 ? MT.t('Every year') : MT.t('Every {n} years', { n: it.interval }), '') : (it.once ? MT.ui.badge(MT.t('Once'), '') : null), it.level === 'consider' ? MT.ui.badge(MT.t('Optional or depends on country'), '') : null);
      return h('article.card.pv-item', { 'data-id': it.id },
        h('div.pv-head', h('div', h('h3.pv-title', it.icon + ' ' + MT.t(it.title)), meta), it.link ? h('a.btn.btn-sm.pv-noprint', { href: it.link }, MT.t('Open')) : null),
        it.urgent ? MT.ui.alert('warn', null, MT.t('Do not wait for a routine visit. See a health worker soon if you have a long cough, fever, night sweats or weight loss.')) : null,
        h('p', { style: 'margin:0' }, MT.t(it.who)), info,
        h('details.disclosure', h('summary', MT.t('What it involves and why')), h('div.disclosure-body.stack', h('p', h('strong', MT.t('What it involves') + ': '), MT.t(it.what)), h('p', h('strong', MT.t('Why it matters') + ': '), MT.t(it.why)), it.note ? h('p', MT.t(it.note)) : null, h('p.pv-src', MT.t('Source') + ': ' + MT.t(it.source)))),
        h('div.pv-done.pv-noprint', field(MT.t('Done on'), dateIn), yrsSel ? field(MT.t('How'), yrsSel) : null, saveBtn,
          h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.ics.download('salus-' + it.id + '.ics', { name: 'Salus', events: [icsEvent(it)] }); } }, '📅 ' + MT.t('Add reminder')),
          done[it.id] && !done[it.id].auto ? h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { save(it.id, null); redraw(); } }, MT.t('Clear')) : null));
    }

    function draw() {
      MT.clear(list); MT.clear(summary);
      if (!items.length) return;
      var c = L.summarise(items);
      summary.appendChild(h('div.pv-bar', { 'aria-live': 'polite' },
        h('div.pv-stat', h('b', String(c.overdue)), MT.t('Overdue')), h('div.pv-stat', h('b', String(c.soon)), MT.t('Due soon')), h('div.pv-stat', h('b', String(c.check)), MT.t('To check')), h('div.pv-stat', h('b', String(c.ok)), MT.t('Up to date'))));
      summary.appendChild(h('div.row.pv-noprint', { style: 'margin:.75rem 0;--gap:.5rem' }, chips,
        h('button.btn.btn-sm', { type: 'button', onclick: function () { var ev = items.filter(function (i) { return i.status === 'overdue' || i.status === 'soon' || i.status === 'check'; }); if (!ev.length) { MT.toast(MT.t('Nothing to remind'), 'warn'); return; } MT.ics.download('salus-prevention.ics', { name: 'Salus', events: ev.map(icsEvent) }); } }, '📅 ' + MT.t('Add all to my calendar')),
        h('button.btn.btn-sm', { type: 'button', onclick: function () { window.print(); } }, '🖨 ' + MT.t('Print'))));
      var show = items.filter(function (i) { return filter === 'all' ? true : filter === 'attention' ? (i.status === 'overdue' || i.status === 'soon' || (i.status === 'check' && i.level === 'recommended')) : i.kind === filter; });
      var groups = [
        ['Needs attention', function (i) { return i.status === 'overdue' || i.status === 'soon' || (i.status === 'check' && i.level === 'recommended'); }],
        ['Talk to your clinic', function (i) { return (i.status === 'consider' || i.status === 'discuss' || (i.status === 'check' && i.level !== 'recommended')); }],
        ['Up to date', function (i) { return i.status === 'ok'; }]
      ];
      var order = { overdue: 0, soon: 1, check: 2 };
      groups.forEach(function (g) {
        var sub = show.filter(g[1]).sort(function (a, b) { return (order[a.status] != null ? order[a.status] : 3) - (order[b.status] != null ? order[b.status] : 3) || (a.kind === b.kind ? 0 : a.kind === 'vaccine' ? -1 : 1); });
        if (!sub.length) return;
        list.appendChild(h('h2.section-title', MT.t(g[0]) + ' (' + sub.length + ')')); sub.forEach(function (it) { list.appendChild(card(it)); });
      });
      if (!show.length) list.appendChild(MT.ui.empty('✅', MT.t('Nothing in this list')));
    }
    draw();
    box.appendChild(MT.ui.alert('info', MT.t('Not on this list?'), MT.t('Travel, work, health problems and local outbreaks can add vaccines or tests. Ask your clinic. If you are pregnant, avoid live vaccines such as MMR and chickenpox unless a clinician advises it.')));
  }

  /* ------------------------------------------------------------ child */
  var CHILD_STATUS = { given: ['Given', 'ok'], overdue: ['Overdue', 'danger'], due: ['Due now', 'warn'], soon: ['Due very soon', 'warn'], upcoming: ['Later', ''] };
  function getChildren() { var c = MT.store.get(K_CHILD, []); return Array.isArray(c) ? c.filter(function (x) { return x && typeof x === 'object' && x.id; }) : []; }
  function renderChild(box) {
    var kids = getChildren(), t = today();
    box.appendChild(MT.ui.alert('warn', MT.t('Your country\'s schedule may differ'), MT.t('This is a typical WHO routine schedule. Countries differ in timing, in which vaccines they give, and in how many doses. Always follow the child health card and the advice of your clinic.')));
    box.appendChild(MT.ui.alert('info', MT.t('Missed a dose?'), MT.t('You almost never need to start again. Go to the clinic and ask for the next dose. Do not wait for a "better" day.')));
    var name = h('input', { type: 'text', maxlength: 40, placeholder: MT.t('Name (optional)'), autocomplete: 'off' }), dob = h('input', { type: 'date', max: t });
    box.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Add a child')), h('div.form-grid', field(MT.t('Name or nickname'), name), field(MT.t('Date of birth'), dob)),
      h('button.btn.btn-primary', { type: 'button', style: 'margin-top:.5rem', onclick: function () {
        if (!L.isDate(dob.value) || dob.value > t) { MT.toast(MT.t('Enter a date of birth that is today or earlier'), 'warn'); return; }
        if (L.ageYears(dob.value, t) > 17) { MT.toast(MT.t('This checker is for children under 18. Use the adult list.'), 'warn'); return; }
        kids.push({ id: MT.uid('c'), name: name.value.trim().slice(0, 40), dob: dob.value, given: {} }); MT.store.set(K_CHILD, kids); MT.app.route();
      } }, MT.t('Show the schedule'))));
    if (!kids.length) box.appendChild(MT.ui.empty('👶', MT.t('No children added yet'), MT.t('Enter a date of birth to see which vaccines are due.')));
    kids.forEach(function (kid) {
      var sch = L.childSchedule(kid.dob, kid.given, t);
      if (!sch) return;
      var al = L.ageLabel(sch.ageDays), unit = { days: '{n} days old', weeks: '{n} weeks old', months: '{n} months old', years: '{n} years old' }[al.unit];
      var req = sch.rows.filter(function (r) { return !r.optional; });
      var cnt = { overdue: 0, due: 0, soon: 0 }; req.forEach(function (r) { if (cnt[r.status] != null) cnt[r.status]++; });
      var rows = sch.rows.filter(function (r) { return r.status !== 'upcoming' || r.dueDays - sch.ageDays < 400 || true; });
      var next = req.filter(function (r) { return r.status === 'upcoming' || r.status === 'soon'; })[0];
      var tbl = h('table.table.pv-dose', h('thead', h('tr', h('th', MT.t('Given')), h('th', MT.t('Vaccine')), h('th', MT.t('Due')), h('th', MT.t('Status')))));
      var tb = h('tbody');
      rows.forEach(function (r) {
        var cb = h('input', { type: 'checkbox', checked: r.status === 'given', 'aria-label': MT.t('{v} {d} given', { v: MT.t(r.vac), d: MT.t(r.dose) }) });
        cb.addEventListener('change', function () { if (cb.checked) kid.given[r.id] = t; else delete kid.given[r.id]; MT.store.set(K_CHILD, kids); MT.app.route(); });
        var st = CHILD_STATUS[r.status];
        tb.appendChild(h('tr', h('td', cb), h('td', h('strong', MT.t(r.vac)), ' ', MT.t(r.dose), r.optional ? h('div.small.muted', MT.t('Only if your country uses it.')) : null, r.note ? h('div.small.muted', MT.t(r.note)) : null),
          h('td', MT.formatDate(r.dueDate)), h('td', MT.ui.badge((r.status === 'given' ? '✓ ' : r.status === 'overdue' ? '! ' : '') + MT.t(st[0]) + (r.givenOn ? ' ' + r.givenOn : ''), st[1]))));
      });
      tbl.appendChild(tb);
      var remind = h('button.btn.btn-sm.pv-noprint', { type: 'button', onclick: function () {
        var ev = req.filter(function (r) { return r.status !== 'given' && r.status !== 'upcoming' || (r.status === 'upcoming' && r.dueDays - sch.ageDays <= 120); }).map(function (r) {
          var d = L.parseDate(r.dueDate), tt = L.parseDate(t); if (d < tt) d = L.addDays(tt, 3); d.setHours(9, 0, 0, 0);
          return { uid: 'child-' + kid.id + '-' + r.id, title: MT.t('Vaccine: {v} {d} for {n}', { v: MT.t(r.vac), d: MT.t(r.dose), n: kid.name || MT.t('your child') }), description: MT.t('Take the health card to the clinic. Your country\'s schedule may differ.'), start: d, durationMin: 60, alarmMin: 1440 };
        });
        if (!ev.length) { MT.toast(MT.t('Nothing to remind'), 'warn'); return; } MT.ics.download('salus-child-vaccines.ics', { name: 'Salus', events: ev });
      } }, '📅 ' + MT.t('Add reminders'));
      box.appendChild(h('section.card.pv-item', h('div.pv-head', h('div', h('h3.pv-title', '👶 ' + (kid.name || MT.t('My child'))), h('div.small.muted', MT.t(unit, { n: al.n }) + ' · ' + MT.t('born {d}', { d: MT.formatDate(kid.dob) }))),
        h('div.pv-noprint.row', { style: '--gap:.4rem' }, remind, h('button.btn.btn-sm', { type: 'button', onclick: function () { window.print(); } }, '🖨'), h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { MT.confirm(MT.t('Remove this child and their record from this phone?'), { danger: true, okLabel: MT.t('Remove') }).then(function (ok) { if (ok) { MT.store.set(K_CHILD, kids.filter(function (k) { return k.id !== kid.id; })); MT.app.route(); } }); } }, MT.t('Remove')))),
        sch.beyondChild ? MT.ui.alert('info', null, MT.t('This person is 18 or older. Use the adult list.')) : null,
        cnt.overdue ? MT.ui.alert('warn', MT.t('{n} doses look overdue', { n: cnt.overdue }), MT.t('Take the health card to the clinic soon. Ask for a catch-up plan.')) : (cnt.due ? MT.ui.alert('info', MT.t('{n} doses are due now', { n: cnt.due }), MT.t('Go to the clinic or vaccination day.')) : MT.ui.alert('ok', MT.t('Nothing is overdue'), next ? MT.t('Next: {v} {d} around {date}.', { v: MT.t(next.vac), d: MT.t(next.dose), date: MT.formatDate(next.dueDate) }) : null)),
        h('div.table-wrap', tbl),
        h('p.pv-src', MT.t('Source') + ': ' + MT.t('WHO Summary of position papers, recommendations for routine immunization, Table 2 (children). Typical timing; dose ages can differ by country.'))));
    });
    box.appendChild(MT.ui.alert('danger', MT.t('Sick baby?'), h('span', MT.t('A very sleepy baby, a baby who will not feed, fast breathing or fits need a health worker now.') + ' ', h('a', { href: '#/get-help' }, MT.t('Get help now')))));
  }

  /* ------------------------------------------------------------ tool */
  MT.registerTool({
    id: 'prevention', title: 'Vaccines and screening', category: 'prevent', icon: '💉', order: 1,
    description: 'See which vaccines and health checks are right for you, track when you had them, and get reminders. Includes a child vaccine schedule.',
    keywords: ['vaccine', 'vaccination', 'immunization', 'screening', 'mammogram', 'cervical', 'colonoscopy', 'smear', 'checklist', 'child', 'schedule', 'booster', 'pregnancy', 'hpv', 'flu'],
    render: function (container, ctx) {
      var tab = ctx.params[0] === 'child' ? 'child' : 'adult';
      container.appendChild(MT.ui.tabs([{ id: 'adult', label: MT.t('For me') }, { id: 'child', label: MT.t('My child') }], tab, function (id) { MT.app.navigate('#/prevention' + (id === 'child' ? '/child' : '')); }));
      var body = h('div.stack', { style: 'margin-top:.75rem' }); container.appendChild(body);
      if (tab === 'child') renderChild(body); else renderAdult(body);
      container.appendChild(MT.ui.disclaimer(MT.t('This list gives general advice and cannot replace a health worker. If you feel unwell, do not wait for a check-up date.')));
    }
  });
})();

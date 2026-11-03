/* Triage — South African Triage Scale (SATS), adult. UI over MTLib.triage (clinician/lib/triage.js).
   Sources: Gottschalk 2006 (Emerg Med J 23:149), Twomey 2012 (Int Emerg Nurs), EMSSA SATS Training Manual 2012.
   Paediatric TEWS is intentionally not implemented (tables not verified). */
(function () {
  'use strict';
  var h = MT.h, T = MTLib.triage;

  MT.css('tr', [
    '.tr-grid{display:grid;gap:16px;grid-template-columns:1fr}',
    '@media (min-width:960px){.tr-grid{grid-template-columns:minmax(0,1fr) 340px}.tr-result{grid-column:2;grid-row:1;align-self:start;position:sticky;top:calc(var(--header-h) + 12px)}}',
    '@media (max-width:959px){.tr-result{position:sticky;bottom:8px;z-index:20;box-shadow:var(--shadow-lg)}}',
    '.tr-result{border-radius:14px;border:2px solid var(--border-strong);background:var(--surface);overflow:hidden}',
    '.tr-band{padding:14px 16px;font-weight:800;font-size:1.5rem;letter-spacing:.02em;line-height:1.15}',
    '.tr-band small{display:block;font-size:.95rem;font-weight:700;letter-spacing:0;margin-top:2px}',
    '.tr-body{padding:10px 16px 14px;font-size:.9rem}',
    '.tr-body ul{margin:6px 0 0;padding-left:1.1rem}',
    '.tr-c-red .tr-band{background:#b91c1c;color:#fff}.tr-c-red{border-color:#b91c1c}',
    '.tr-c-orange .tr-band{background:#f97316;color:#1a0f00}.tr-c-orange{border-color:#f97316}',
    '.tr-c-yellow .tr-band{background:#facc15;color:#1f1700}.tr-c-yellow{border-color:#facc15}',
    '.tr-c-green .tr-band{background:#16a34a;color:#fff}.tr-c-green{border-color:#16a34a}',
    '.tr-c-blue .tr-band{background:#1d4ed8;color:#fff}.tr-c-blue{border-color:#1d4ed8}',
    '.tr-c-none .tr-band{background:var(--surface-3);color:var(--text)}',
    '.tr-opts{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}',
    '.tr-opt{min-height:52px;border:2px solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:12px;font:inherit;font-weight:700;cursor:pointer;padding:6px 8px;line-height:1.2}',
    '.tr-opt small{display:block;font-weight:500;color:var(--muted);font-size:.78rem}',
    '.tr-opt[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-text);box-shadow:inset 0 0 0 1px var(--accent)}',
    '.tr-pts{display:inline-block;min-width:2.6em;text-align:center;font-weight:800;border-radius:8px;padding:2px 8px;background:var(--surface-3);color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.tr-pts.p1{background:var(--warn-soft);color:var(--warn)}.tr-pts.p2,.tr-pts.p3{background:var(--danger-soft);color:var(--danger)}',
    '.tr-vit{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '.tr-vit .field input{min-height:52px;font-size:1.25rem;font-weight:700}',
    '.tr-sect{border:1px solid var(--border);border-radius:14px;padding:14px;background:var(--surface)}',
    '.tr-sect.em{border-color:var(--danger-border);background:var(--danger-soft)}',
    '.tr-sect h2{font-size:1.02rem;margin:0 0 10px}',
    '.tr-checks{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}',
    '.tr-checks .check{min-height:48px;align-items:center}.tr-print{display:none}@media print{.tr-screen{display:none!important}.tr-print{display:block!important}.tr-print pre{white-space:pre-wrap;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}}'
  ].join(''));

  var SCORE_NOTES = {
    mobility: 'Walking 0 · with help 1 · stretcher/immobile 2',
    rr: '<9: 2 · 9–14: 0 · 15–20: 1 · 21–29: 2 · >29: 3',
    hr: '≤40: 2 · 41–50: 1 · 51–100: 0 · 101–110: 1 · 111–129: 2 · ≥130: 3',
    sbp: '≤70: 3 · 71–80: 2 · 81–100: 1 · 101–199: 0 · ≥200: 2',
    temp: '<35: 2 · 35–38.4: 0 · >38.4: 2',
    avpu: 'Alert 0 · Voice 1 · Pain 2 · Unresponsive 3',
    trauma: 'No 0 · Yes 1'
  };
  var ITEM_LABEL = { mobility: 'Mobility', rr: 'Resp. rate', hr: 'Heart rate', sbp: 'Systolic BP', temp: 'Temperature', avpu: 'AVPU', trauma: 'Trauma' };

  MT.registerTool({
    id: 'triage', title: 'Triage (SATS, adult)', category: 'acute', icon: '🚑', order: 2,
    description: 'South African Triage Scale for adults: TEWS, emergency and discriminator signs, priority colour and target time to be seen.',
    keywords: ['sats', 'tews', 'triage', 'emergency department', 'priority', 'early warning', 'south african triage scale', 'red orange yellow green'],
    render: function (container) {
      var st = { age: '', height: '', adultConfirm: false, mobility: null, rr: '', hr: '', sbp: '', temp: '', avpu: null, trauma: null, em: {}, vu: {}, ug: {}, ovColour: '', ovReason: '', dead: false };
      var resultHost = h('div.tr-result', { 'aria-live': 'polite' });
      var formHost = h('div.stack');
      var printBlock = h('pre');

      function ids(map) { return Object.keys(map).filter(function (k) { return map[k]; }); }
      function compute() {
        var tw = T.tews({ mobility: st.mobility, rr: MT.num(st.rr), hr: MT.num(st.hr), sbp: MT.num(st.sbp), temp: MT.num(st.temp), avpu: st.avpu, trauma: st.trauma });
        var p = T.priority({ emergency: ids(st.em), veryUrgent: ids(st.vu), urgent: ids(st.ug), tews: tw, dead: st.dead, override: st.ovColour ? { colour: st.ovColour, reason: st.ovReason } : null });
        return { tw: tw, p: p };
      }
      function anyInput(r) { return r.tw.missing.length < T.ITEMS.length || ids(st.em).length || ids(st.vu).length || ids(st.ug).length || st.dead; }

      function summaryText(r) {
        var p = r.p, tw = r.tw;
        var lines = ['SATS (adult) triage — ' + MT.formatDate(new Date(), { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + MT.formatTime(new Date()),
          'Priority: ' + p.label + ' — ' + p.targetText];
        if (tw.missing.length < T.ITEMS.length) lines.push('TEWS: ' + tw.total + (tw.complete ? '' : ' (incomplete: missing ' + tw.missing.map(function (k) { return ITEM_LABEL[k]; }).join(', ') + ')') + ' — ' + T.ITEMS.filter(function (k) { return tw.parts[k] != null; }).map(function (k) { return ITEM_LABEL[k] + ' ' + tw.parts[k]; }).join(', '));
        p.basis.forEach(function (b) { lines.push('- ' + b); });
        lines.push('Source: SATS (EMSSA 2012; Gottschalk 2006). Decision support only.');
        return lines.join('\n');
      }

      function isChild() { return T.ageGroup(MT.num(st.age), MT.num(st.height)) === 'child' && !st.adultConfirm; }
      function renderResult() {
        MT.clear(resultHost);
        if (isChild()) { resultHost.className = 'tr-result tr-c-none'; resultHost.appendChild(h('div.tr-band', 'Paediatric', h('small', 'Not supported — use the paediatric chart'))); return; }
        var r = compute(), p = r.p;
        var colour = anyInput(r) ? p.colour : 'none';
        resultHost.className = 'tr-result tr-c-' + colour;
        if (colour === 'none') {
          resultHost.appendChild(h('div.tr-band', 'Priority', h('small', 'Enter findings to see the colour')));
          return;
        }
        resultHost.appendChild(h('div.tr-band', p.label, h('small', 'See: ' + p.targetText)));
        var body = h('div.tr-body');
        if (r.tw.missing.length < T.ITEMS.length) {
          body.appendChild(h('div', h('strong', 'TEWS ' + r.tw.total), r.tw.complete ? '' : h('span.muted', ' (incomplete: still needs ' + r.tw.missing.map(function (k) { return ITEM_LABEL[k].toLowerCase(); }).join(', ') + ')')));
        }
        if (p.incomplete && !st.dead) body.appendChild(h('div.small', { style: 'color:var(--warn);font-weight:600' }, 'Complete all TEWS items; an incomplete score can under-triage.'));
        if (p.basis.length) body.appendChild(h('ul', p.basis.map(function (b) { return h('li', b); })));
        body.appendChild(h('div.row.no-print', { style: 'margin-top:10px' },
          h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.copy(summaryText(r)); } }, 'Copy'),
          h('button.btn.btn-sm', { type: 'button', onclick: function () { printBlock.textContent = summaryText(r); MT.print(container); } }, 'Print'),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: reset }, 'New patient')));
        resultHost.appendChild(body);
      }
      var pts = {};   // item → element showing points
      function updatePts(tw) {
        T.ITEMS.forEach(function (k) {
          var el = pts[k]; if (!el) return;
          var v = tw.parts[k];
          el.textContent = v == null ? '–' : '+' + v;
          el.className = 'tr-pts' + (v ? ' p' + v : '');
        });
      }
      function update() { var r = compute(); updatePts(r.tw); renderResult(); }

      function optRow(key, options, label) {
        var wrap = h('div.tr-opts', { role: 'group', 'aria-label': label });
        options.forEach(function (o) {
          var b = h('button.tr-opt', { type: 'button', 'aria-pressed': String(st[key] === o.v), onclick: function () {
            st[key] = (st[key] === o.v) ? null : o.v;
            MT.$$('button', wrap).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
            if (st[key] === o.v) b.setAttribute('aria-pressed', 'true');
            update();
          } }, o.t, o.s ? h('small', o.s) : null);
          wrap.appendChild(b);
        });
        return wrap;
      }
      function item(key, label, control) {
        var span = h('span.tr-pts', '–'); pts[key] = span;
        return h('div.field', h('div.row.row-between', h('div.field-label', label), span), control, h('div.hint', SCORE_NOTES[key]));
      }
      function numField(key, label, attrs) {
        var id = MT.uid('tr');
        var inp = h('input', Object.assign({ id: id, type: 'number', inputmode: 'decimal', value: st[key], oninput: function () { st[key] = inp.value; update(); } }, attrs));
        var span = h('span.tr-pts', '–'); pts[key] = span;
        return h('div.field', h('div.row.row-between', { style: 'flex-wrap:nowrap;gap:6px' }, h('label', { for: id }, label), span), inp, h('div.hint', SCORE_NOTES[key]));
      }
      function checkList(map, list) {
        return h('div.tr-checks', list.map(function (d) {
          var id = MT.uid('tr');
          var cb = h('input', { type: 'checkbox', id: id, checked: !!map[d.id], onchange: function () { map[d.id] = cb.checked; update(); if (map === st.em || map === st.vu || map === st.ug) updateCounts(); } });
          return h('label.check', { for: id }, cb, h('span', d.label));
        }));
      }
      var counts = {};
      function updateCounts() {
        if (counts.vu) counts.vu.textContent = ids(st.vu).length ? ids(st.vu).length + ' selected' : '';
        if (counts.ug) counts.ug.textContent = ids(st.ug).length ? ids(st.ug).length + ' selected' : '';
      }

      function buildForm() {
        MT.clear(formHost);
        Object.keys(pts).forEach(function (k) { delete pts[k]; });

        // Patient group
        var agId = MT.uid('tr'), htId = MT.uid('tr');
        var ageInp = h('input', { id: agId, type: 'number', inputmode: 'numeric', min: 0, max: 120, value: st.age, oninput: function () { st.age = ageInp.value; st.adultConfirm = false; ageChanged(); } });
        var htInp = h('input', { id: htId, type: 'number', inputmode: 'numeric', min: 30, max: 250, value: st.height, oninput: function () { st.height = htInp.value; st.adultConfirm = false; ageChanged(); } });
        function ageChanged() { applyChild(); renderResult(); }
        formHost.appendChild(h('div.tr-sect',
          h('h2', 'Patient'),
          h('div.form-grid', { style: 'grid-template-columns:repeat(auto-fit,minmax(150px,1fr))' },
            h('div.field', h('label', { for: agId }, 'Age (years, optional)'), ageInp),
            h('div.field', h('label', { for: htId }, 'Height (cm, optional)'), htInp)),
          h('div.hint', 'The adult SATS applies to people older than 12 years or taller than 150 cm. Nothing here is saved or sent anywhere.')));

        var alertHost = h('div'), body = h('div.stack');
        formHost.appendChild(alertHost); formHost.appendChild(body);
        function applyChild() {
          var child = isChild();
          MT.clear(alertHost);
          body.hidden = child;
          if (child) alertHost.appendChild(MT.ui.alert('danger', 'Paediatric patient: use the paediatric SATS chart',
            h('div', h('p', 'This tool implements only the ADULT TEWS. The paediatric TEWS tables (older child 3–12 years / over 95 cm; younger child under 3 years / under 95 cm) could not be verified exactly, so they are deliberately not included. Use the printed paediatric SATS chart, or a locally approved paediatric early-warning tool.'),
              h('p', 'Any child who is not breathing, has an obstructed airway, is fitting, unresponsive or in shock needs resuscitation immediately — do not wait for a score.'),
              h('button.btn.btn-sm', { type: 'button', onclick: function () { st.adultConfirm = true; applyChild(); renderResult(); } }, 'Patient is actually an adult — continue'))));
        }

        // Emergency signs
        body.appendChild(h('div.tr-sect.em', h('h2', '1 · Emergency signs → RED, treat now'), checkList(st.em, T.EMERGENCY),
          h('div.hint', { style: 'margin-top:8px' }, 'Any one sign = RED. No score needed — move to resuscitation.')));

        // TEWS
        var avpuOpts = [{ v: 'A', t: 'Alert' }, { v: 'V', t: 'Voice', s: 'responds to voice' }, { v: 'P', t: 'Pain', s: 'responds to pain' }, { v: 'U', t: 'Unresponsive' }];
        body.appendChild(h('div.tr-sect',
          h('h2', '2 · Triage Early Warning Score (adult)'),
          h('div.stack',
            item('mobility', 'Mobility', optRow('mobility', [{ v: 'walking', t: 'Walking' }, { v: 'help', t: 'With help' }, { v: 'stretcher', t: 'Stretcher / immobile' }], 'Mobility')),
            h('div.tr-vit',
              numField('rr', 'Respiratory rate (/min)', { min: 0, max: 80 }),
              numField('hr', 'Heart rate (/min)', { min: 0, max: 300 }),
              numField('sbp', 'Systolic BP (mmHg)', { min: 0, max: 300 }),
              numField('temp', 'Temperature (°C)', { min: 25, max: 45, step: '0.1' })),
            item('avpu', 'Consciousness (AVPU)', optRow('avpu', avpuOpts, 'AVPU')),
            item('trauma', 'Trauma / injury presentation', optRow('trauma', [{ v: false, t: 'No' }, { v: true, t: 'Yes' }], 'Trauma')))));

        // Discriminators
        counts.vu = h('span.badge.badge-warn'); counts.ug = h('span.badge.badge-info');
        body.appendChild(h('details.disclosure', { open: ids(st.vu).length > 0 },
          h('summary', '3 · Very urgent signs → at least ORANGE (< 10 min) ', counts.vu),
          h('div.disclosure-body', checkList(st.vu, T.VERY_URGENT))));
        body.appendChild(h('details.disclosure', { open: ids(st.ug).length > 0 },
          h('summary', '4 · Urgent signs → at least YELLOW (< 60 min) ', counts.ug),
          h('div.disclosure-body', checkList(st.ug, T.URGENT))));
        updateCounts();

        // Override
        var ovId = MT.uid('tr'), rsId = MT.uid('tr');
        var ovSel = h('select', { id: ovId, onchange: function () { st.ovColour = ovSel.value; update(); } },
          [['', 'No override'], ['red', 'Red'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['green', 'Green']].map(function (o) { return h('option', { value: o[0], selected: st.ovColour === o[0] }, o[1]); }));
        var rsInp = h('input', { id: rsId, type: 'text', maxlength: 160, placeholder: 'Reason (required for the override to apply)', value: st.ovReason, oninput: function () { st.ovReason = rsInp.value; update(); } });
        var deadId = MT.uid('tr');
        var deadCb = h('input', { type: 'checkbox', id: deadId, checked: st.dead, onchange: function () { st.dead = deadCb.checked; update(); } });
        body.appendChild(h('details.disclosure', { open: !!st.ovColour },
          h('summary', '5 · Senior health professional override'),
          h('div.disclosure-body.stack-sm',
            h('p.small.muted', 'A senior health professional may change the colour on clinical judgement (for example a patient who looks unwell but scores low). Document who decided and why.'),
            h('div.form-grid', h('div.field', h('label', { for: ovId }, 'Final colour'), ovSel), h('div.field', h('label', { for: rsId }, 'Reason'), rsInp)),
            h('label.check', { for: deadId }, deadCb, h('span', 'Patient dead on arrival (BLUE)')))));

        // About
        body.appendChild(h('details.disclosure',
          h('summary', 'About this tool, sources and limits'),
          h('div.disclosure-body',
            h('ul', [
              h('li', 'Colour from TEWS: 0–2 green, 3–4 yellow, 5–6 orange, ≥7 red. Target time to be seen: red immediately, orange < 10 min, yellow < 60 min, green < 240 min.'),
              h('li', 'The final colour is the highest of: emergency signs, discriminators and the TEWS colour; a documented senior override replaces it.'),
              h('li', 'ADULT only (> 12 years or > 150 cm). The paediatric TEWS is not implemented because the age-specific tables could not be verified exactly.'),
              h('li', 'The lists of signs are compiled from the published SATS adult chart as reported in secondary sources and may not match every item on your facility’s current chart. Use the override for anything not listed and follow the chart in force locally.'),
              h('li', 'Sources: Gottschalk SB et al., Emerg Med J 2006;23:149–153 (Cape Triage Score); Twomey M et al., Int Emerg Nurs 2012;20:142–150; EMSSA. South African Triage Scale Training Manual, 2012.')]))));
        body.appendChild(MT.ui.disclaimer('Triage decision support. Re-triage if the patient changes. Does not replace clinical judgement or the SATS chart in use at your facility.'));
              applyChild();
      }

      function reset() {
        st.age = ''; st.height = ''; st.adultConfirm = false; st.mobility = null; st.rr = ''; st.hr = ''; st.sbp = ''; st.temp = ''; st.avpu = null; st.trauma = null; st.em = {}; st.vu = {}; st.ug = {}; st.ovColour = ''; st.ovReason = ''; st.dead = false;
        buildForm(); update(); window.scrollTo(0, 0);
      }

      container.appendChild(h('div.tr-print', printBlock));
      container.appendChild(h('div.tr-grid.tr-screen', formHost, resultHost));
      buildForm(); update();
    }
  });
})();

/* ==========================================================================
   Clinical notes — structured documentation templates. Package C3.

   Halves: pure template + formatting logic (module.exports in Node,
   MTLib.notes in the browser) and the UI (registered when MT exists).

   Templates and sources
   - SOAP progress note (Weed LL, 1968, problem-oriented medical record).
   - ISBAR handover: Identify, Situation, Background, Assessment, Recommendation
     (Australian Commission on Safety and Quality in Health Care; WHO Patient Safety
     Curriculum Guide; derived from SBAR, Leonard M et al., Qual Saf Health Care 2004).
   - Admission clerking: standard history and examination structure (Calgary-Cambridge /
     Bates-style system review).
   - Discharge summary: content headings follow the Academy of Medical Royal Colleges /
     PRSB "Standards for the clinical structure and content of patient records" (2013) and
     Joint Commission discharge-summary elements.
   - Procedure note: Royal College of Surgeons of England, Good Surgical Practice /
     WHO Surgical Safety Checklist elements; Joint Commission operative-note elements.
   - Ward-round checklist: prompts adapted from "Ward rounds in medicine: principles for
     best practice", RCP/RCN 2012. These are generic prompts: adapt to local policy.
   Privacy: drafts are held only in this browser, expire automatically (default 7 days)
   and can be cleared with one button. Encourage initials/IDs, not full names.
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else {
    (root.MTLib = root.MTLib || {}).notes = lib;
    if (typeof root.MT !== 'undefined' && root.MT.registerTool && root.document) lib.registerUI(root.MT);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function T(id, label, ph) { return { id: id, label: label, type: 'text', ph: ph || '' }; }
  function A(id, label, ph, rows) { return { id: id, label: label, type: 'area', ph: ph || '', rows: rows || 3 }; }
  function S(id, label, options) { return { id: id, label: label, type: 'select', options: options }; }
  function C(id, label) { return { id: id, label: label, type: 'check' }; }

  var HEADER = {
    title: 'Patient',
    fields: [T('pid', 'Patient (initials + age/sex, or ID)', 'e.g. JK, 54 M'), T('loc', 'Ward / location'), T('when', 'Date and time'), T('author', 'Author (role)', 'e.g. FY1, ward 4')]
  };
  var VITALS = [T('v_temp', 'Temp (°C)'), T('v_hr', 'HR (/min)'), T('v_bp', 'BP (mmHg)'), T('v_rr', 'RR (/min)'), T('v_spo2', 'SpO₂ (% and O₂)'), T('v_gcs', 'GCS / AVPU'), T('v_bm', 'Glucose'), T('v_ews', 'Early-warning score')];

  var TEMPLATES = [
    { id: 'soap', title: 'SOAP progress note', icon: '📝', desc: 'Daily review: subjective, objective, assessment, plan.', sections: [
      HEADER,
      { title: 'S — Subjective', bare: true, fields: [A('s', 'Symptoms, overnight events, patient concerns', 'Feeling…, pain score…, appetite, bowels, sleep…', 4)] },
      { title: 'O — Objective', fields: VITALS.concat([A('o_fluid', 'Fluid balance / intake and output'), A('o_exam', 'Examination', 'General, CVS, RS, abdomen, other…', 4), A('o_res', 'Results (bloods, imaging, micro)', 'New results since last review…', 3)]) },
      { title: 'A — Assessment', bare: true, fields: [A('a', 'Problem list and impression', '1. …\n2. …', 4)] },
      { title: 'P — Plan', bare: true, fields: [A('p', 'Plan, tasks and owners', '1. …\n2. …', 4), T('esc', 'Escalation / review triggers', 'Call if…')] }
    ] },
    { id: 'isbar', title: 'ISBAR handover', icon: '📞', desc: 'Identify, Situation, Background, Assessment, Recommendation.', sections: [
      { title: 'I — Identify', fields: [T('i_me', 'Who I am (name, role)'), T('i_to', 'Who I am speaking to'), T('pid', 'Patient (initials + age/sex, or ID)'), T('loc', 'Location'), T('when', 'Date and time')] },
      { title: 'S — Situation', fields: [A('s', 'Why I am calling / what is happening now', 'I am calling about… The problem is…', 3), T('s_urg', 'Urgency', 'e.g. needs review within 30 min')] },
      { title: 'B — Background', fields: [T('b_adm', 'Admitted on / with'), A('b_hx', 'Relevant history, comorbidities, allergies, code status', '', 3), A('b_tx', 'Treatment so far, key medications, lines')] },
      { title: 'A — Assessment', fields: VITALS.concat([A('a', 'Clinical findings and my impression', 'A, B, C, D, E…', 3)]) },
      { title: 'R — Recommendation / request', fields: [A('r', 'What I need / suggest and by when', 'Please review…, repeat obs every…, consider…', 3), T('r_read', 'Read-back / agreed plan confirmed', 'Name, time')] }
    ] },
    { id: 'clerking', title: 'Admission clerking', icon: '📋', desc: 'Full history and examination structure.', sections: [
      HEADER,
      { title: 'Referral', fields: [T('src', 'Source of referral'), T('hist_src', 'History from (patient / relative / notes)')] },
      { title: 'Presenting complaint', bare: true, fields: [A('pc', 'Presenting complaint(s) and duration', '', 2)] },
      { title: 'History of presenting complaint', bare: true, fields: [A('hpc', 'Onset, character, severity, timing, aggravating/relieving factors, associated symptoms, previous episodes', '', 5)] },
      { title: 'Past history', fields: [A('pmh', 'Past medical history'), A('psh', 'Past surgical history / anaesthetic problems')] },
      { title: 'Medications and allergies', fields: [A('dh', 'Regular medications (dose, route, frequency); recent changes; adherence', '', 3), A('allergy', 'Allergies / adverse reactions and what happened', '', 2)] },
      { title: 'Family and social history', fields: [A('fh', 'Family history'), A('sh', 'Occupation, living situation, support, mobility/function, smoking, alcohol, drugs, travel', '', 3)] },
      { title: 'Systems review', fields: [T('r_cvs', 'Cardiovascular'), T('r_resp', 'Respiratory'), T('r_gi', 'Gastrointestinal'), T('r_gu', 'Genitourinary'), T('r_neuro', 'Neurological'), T('r_msk', 'Musculoskeletal'), T('r_endo', 'Endocrine'), T('r_psy', 'Psychiatric'), T('r_skin', 'Skin / ENT / eyes / constitutional')] },
      { title: 'Examination', fields: VITALS.concat([A('e_gen', 'General appearance, hydration, lymph nodes, hands/face'), A('e_cvs', 'Cardiovascular (pulse, JVP, heart sounds, oedema)'), A('e_resp', 'Respiratory'), A('e_abd', 'Abdomen (incl. hernial orifices, PR if indicated)'), A('e_neuro', 'Neurological'), A('e_msk', 'Musculoskeletal / skin / other')]) },
      { title: 'Investigations', bare: true, fields: [A('inv', 'Bedside tests, bloods, ECG, imaging', '', 3)] },
      { title: 'Impression', fields: [A('imp', 'Summary statement and problem list / differential diagnosis', '', 4)] },
      { title: 'Plan', fields: [A('plan', 'Investigations, treatment, monitoring, referrals', '', 4), T('vte', 'VTE risk and prophylaxis'), T('code', 'Escalation / resuscitation status, capacity'), T('nok', 'Next of kin informed / contact')] }
    ] },
    { id: 'discharge', title: 'Discharge summary', icon: '🏠', desc: 'Handover to the next clinician and the patient.', sections: [
      HEADER,
      { title: 'Admission', fields: [T('d_adm', 'Admitted'), T('d_dis', 'Discharged'), T('d_team', 'Responsible clinician / team'), T('d_dest', 'Discharged to (home, facility…)')] },
      { title: 'Diagnoses', fields: [T('dx1', 'Principal diagnosis'), A('dx2', 'Other diagnoses / comorbidities', '', 2)] },
      { title: 'Summary of admission', bare: true, fields: [A('course', 'Presentation, key findings, treatment and progress', '', 5)] },
      { title: 'Procedures and key results', fields: [A('procs', 'Procedures'), A('res', 'Important results (incl. incidental findings needing follow-up)')] },
      { title: 'Condition at discharge', fields: [T('cond', 'Clinical state, function, mobility'), T('capac', 'Capacity / understanding')] },
      { title: 'Medicines on discharge', fields: [A('m_new', 'NEW medicines (dose, route, frequency, duration, reason)', '', 3), A('m_chg', 'CHANGED medicines (and why)', '', 2), A('m_stop', 'STOPPED medicines (and why)', '', 2), A('m_cont', 'Continued unchanged'), T('allergy', 'Allergies / adverse reactions')] },
      { title: 'Follow-up', fields: [A('f_app', 'Appointments and clinics', '', 2), A('f_gp', 'Actions for the GP / next clinician', '', 3), A('f_pend', 'Results pending at discharge (who will act)', '', 2)] },
      { title: 'Advice given to patient', fields: [A('adv', 'Advice, activity, diet, driving/work, wound care', '', 2), A('safety', 'Return / seek urgent help if…', 'Specific warning symptoms', 2)] }
    ] },
    { id: 'procedure', title: 'Procedure note', icon: '🩹', desc: 'Contemporaneous record of a bedside or theatre procedure.', sections: [
      HEADER,
      { title: 'Procedure', fields: [T('proc', 'Procedure performed'), T('site', 'Site / side (marked and confirmed)'), A('ind', 'Indication', '', 2)] },
      { title: 'Team', fields: [T('op', 'Operator (grade)'), T('assist', 'Assistant(s)'), T('super', 'Supervisor')] },
      { title: 'Consent and checks', fields: [T('cons', 'Consent (verbal / written / best interests) and risks discussed'), T('timeout', 'Time-out / safety checklist completed (who, when)'), T('coag', 'Coagulation / anticoagulants, allergies checked')] },
      { title: 'Anaesthesia and preparation', fields: [T('anaes', 'Local / sedation / general (agent, dose)'), T('asep', 'Asepsis (skin prep, sterile field, gloves)'), T('pos', 'Position')] },
      { title: 'Technique and findings', fields: [A('tech', 'Technique (step by step: device, size, depth, attempts)', '', 4), A('find', 'Findings (fluid returned, appearance, measurements)', '', 3)] },
      { title: 'Outcome', fields: [T('spec', 'Specimens sent'), T('ebl', 'Blood loss / fluid volumes'), T('comp', 'Complications (or "none")'), T('dev', 'Device / implant (type, size, lot)'), T('count', 'Swab / needle / instrument counts correct')] },
      { title: 'After the procedure', bare: true, fields: [A('post', 'Post-procedure monitoring, imaging to confirm, instructions, plan', '', 3)] }
    ] },
    { id: 'wardround', title: 'Ward-round checklist', icon: '✅', desc: 'Prompts for each patient on the round.', sections: [
      { title: 'Patient', fields: [T('pid', 'Patient (initials + age/sex, or ID)'), T('loc', 'Bed / location'), T('when', 'Date and time')] },
      { title: 'Clinical review', fields: [C('c1', 'Overnight events and symptoms reviewed'), C('c2', 'Observations and early-warning score trend reviewed'), C('c3', 'Patient examined; fluid balance and weight checked'), C('c4', 'Problem list updated')] },
      { title: 'Medicines', fields: [C('m1', 'Drug chart reviewed: indication, dose, allergies'), C('m2', 'Antibiotics: indication, cultures, IV-to-oral switch, stop/review date'), C('m3', 'VTE assessment and prophylaxis'), C('m4', 'Analgesia, laxatives, antiemetics adequate'), C('m5', 'Regular home medicines continued or deliberately omitted')] },
      { title: 'Investigations', fields: [C('i1', 'New results reviewed and acted on'), C('i2', 'Needed tests ordered; unnecessary tests stopped'), C('i3', 'Electrolytes, renal function, glucose checked where relevant')] },
      { title: 'Lines, tubes and nutrition', fields: [C('l1', 'Each cannula/central line still needed? Dated and site clean'), C('l2', 'Urinary catheter still needed? Removal date set'), C('l3', 'Drains/tubes reviewed'), C('l4', 'IV fluids reviewed; diet and swallow appropriate; nutrition risk')] },
      { title: 'Safety and function', fields: [C('s1', 'Mobility, falls risk and pressure areas'), C('s2', 'Delirium / cognition and mood screened'), C('s3', 'Infection control or isolation needs')] },
      { title: 'Plan and communication', fields: [C('p1', 'Escalation and resuscitation status documented'), C('p2', 'Estimated discharge date and barriers recorded'), C('p3', 'Patient / family updated'), C('p4', 'Tasks written down with owner and time'), C('p5', 'Note written in the record')] },
      { title: 'Plan', bare: true, fields: [A('plan', 'Key decisions and tasks for this patient', '1. …', 4)] }
    ] }
  ];

  function tplById(id) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i]; return null; }
  function clean(v) { return String(v == null ? '' : v).replace(/\r/g, '').replace(/[ \t]+$/gm, '').trim(); }

  /** Plain-text note. data = { fieldId: string|true }. nowText is appended as footer when given. */
  function format(tpl, data, footer) {
    data = data || {};
    var out = [tpl.title.toUpperCase()];
    var any = false;
    tpl.sections.forEach(function (sec) {
      var lines = [];
      sec.fields.forEach(function (f) {
        if (f.type === 'check') { lines.push((data[f.id] ? '[x] ' : '[ ] ') + f.label); return; }
        var v = clean(data[f.id]);
        if (!v) return;
        any = true;
        if (sec.bare) { lines.push(v); return; }
        if (v.indexOf('\n') >= 0) lines.push(f.label + ':\n' + v.split('\n').map(function (l) { return '  ' + l; }).join('\n'));
        else lines.push(f.label + ': ' + v);
      });
      if (lines.length) { out.push(''); out.push(sec.title.toUpperCase()); out.push(lines.join('\n')); }
    });
    if (!any && !tpl.sections.some(function (s) { return s.fields.some(function (f) { return f.type === 'check' && data[f.id]; }); })) return tpl.title.toUpperCase() + '\n\n(nothing entered yet)';
    if (footer) { out.push(''); out.push(footer); }
    return out.join('\n');
  }

  /** Crude check for a full personal name in the patient field: two or more words of 3+ letters. */
  function looksLikeFullName(v) {
    var words = String(v || '').trim().split(/\s+/).filter(function (w) { return /^[A-Za-zÀ-ÿ'’-]{3,}$/.test(w); });
    return words.length >= 2;
  }

  /** Drop expired drafts. store = {v:1, expiryDays, items:{id:{data,saved}}}. Returns the pruned store. */
  function pruneDrafts(store, now) {
    var days = store && store.expiryDays > 0 ? store.expiryDays : 7;
    var items = {}, src = (store && store.items) || {};
    Object.keys(src).forEach(function (k) { if (src[k] && now - src[k].saved < days * 864e5) items[k] = src[k]; });
    return { v: 1, expiryDays: days, items: items };
  }

  var logic = { TEMPLATES: TEMPLATES, tplById: tplById, format: format, looksLikeFullName: looksLikeFullName, pruneDrafts: pruneDrafts };

  /* ================================== UI ================================== */
  logic.registerUI = function (MT) {
    var h = MT.h;
    var DKEY = 'clinician.notes.drafts';
    MT.css('nt', [
      '.nt-layout{display:grid;gap:16px;grid-template-columns:1fr}',
      '@media (min-width:1000px){.nt-layout{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.nt-prev{position:sticky;top:calc(var(--header-h) + 12px);align-self:start}}',
      '.nt-pick{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}',
      '.nt-pick button{flex:none;min-height:48px;border-radius:12px;border:2px solid var(--border-strong);background:var(--surface);color:var(--text);font:inherit;font-weight:650;padding:6px 14px;cursor:pointer}',
      '.nt-pick button[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-text)}',
      '.nt-sec{border:1px solid var(--border);border-radius:14px;padding:14px;background:var(--surface)}',
      '.nt-sec h3{margin:0 0 10px;font-size:1rem}',
      '.nt-form{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}',
      '.nt-form .wide{grid-column:1/-1}',
      '.nt-form textarea{min-height:0}',
      '.nt-pre{white-space:pre-wrap;word-break:break-word;font:.9rem/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:0;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;max-height:70vh;overflow:auto}',
      '.nt-print{display:none}',
      '@media print{.nt-screen{display:none!important}.nt-print{display:block!important}.nt-print pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace}}'
    ].join(''));

    function loadDrafts() {
      var raw = MT.store.get(DKEY, null);
      return logic.pruneDrafts(raw && raw.v === 1 ? raw : { v: 1, expiryDays: 7, items: {} }, Date.now());
    }

    MT.registerTool({
      id: 'notes', title: 'Clinical notes', category: 'workflow', icon: '📝', order: 1,
      description: 'Structured SOAP, ISBAR, admission, discharge and procedure notes plus a ward-round checklist, with a live text preview, copy, print and download. Drafts stay on this device and expire.',
      keywords: ['soap', 'isbar', 'sbar', 'handover', 'clerking', 'admission', 'discharge summary', 'procedure note', 'ward round', 'documentation', 'template'],
      render: function (container, ctx) {
        var drafts = loadDrafts();
        MT.store.set(DKEY, drafts);
        var tplId = (ctx.params && ctx.params[0] && tplById(ctx.params[0])) ? ctx.params[0] : MT.store.get('clinician.notes.last', 'soap');
        if (!tplById(tplId)) tplId = 'soap';
        var tpl = tplById(tplId);
        var data = {};
        var previewEl = h('pre.nt-pre', { tabindex: 0, 'aria-label': 'Formatted note preview' });
        var printPre = h('pre');
        var statusEl = h('span.small.muted');
        var formHost = h('div.stack');
        var warnEls = {};

        function stamp() { var d = new Date(); return MT.today(d) + ' ' + MT.formatTime(d); }
        function load(id) {
          tpl = tplById(id); tplId = id;
          var d = drafts.items[id];
          data = d ? JSON.parse(JSON.stringify(d.data)) : {};
          if (!d) { tpl.sections.forEach(function (s) { s.fields.forEach(function (f) { if (f.id === 'when') data.when = stamp(); }); }); }
          MT.store.set('clinician.notes.last', id);
        }
        function persist() {
          var hasContent = Object.keys(data).some(function (k) { return k !== 'when' && data[k] && String(data[k]).trim() !== ''; });
          if (hasContent) drafts.items[tplId] = { data: data, saved: Date.now() }; else delete drafts.items[tplId];
          MT.store.set(DKEY, drafts);
          showStatus();
        }
        var persistSoon = MT.debounce(persist, 400);
        function showStatus() {
          var d = drafts.items[tplId];
          statusEl.textContent = d ? 'Draft saved on this device · expires ' + MT.formatDate(new Date(d.saved + drafts.expiryDays * 864e5)) : 'Nothing saved yet';
        }
        function footer() { return 'Documented ' + stamp() + ' · structured with Open Medical Toolkit templates (' + tpl.title + ')'; }
        function updatePreview() {
          var t = logic.format(tpl, data, footer());
          previewEl.textContent = t; printPre.textContent = t;
          persistSoon();
        }

        function buildForm() {
          MT.clear(formHost);
          tpl.sections.forEach(function (sec) {
            var grid = h('div.nt-form');
            sec.fields.forEach(function (f) {
              var id = MT.uid('nt');
              if (f.type === 'check') {
                var cb = h('input', { type: 'checkbox', id: id, checked: !!data[f.id], onchange: function () { data[f.id] = cb.checked; updatePreview(); } });
                grid.appendChild(h('label.check.wide', { for: id, style: 'min-height:48px;align-items:center' }, cb, h('span', f.label)));
                return;
              }
              var el;
              if (f.type === 'area') {
                el = h('textarea', { id: id, rows: f.rows || 3, placeholder: f.ph, value: data[f.id] || '', style: 'min-height:' + ((f.rows || 3) * 1.5 + 1.4) + 'rem', oninput: function () { data[f.id] = el.value; updatePreview(); } });
              } else {
                el = h('input', { id: id, type: 'text', placeholder: f.ph, value: data[f.id] || '', autocomplete: 'off', oninput: function () { data[f.id] = el.value; if (f.id === 'pid') checkName(); updatePreview(); } });
              }
              var extra = null;
              if (f.id === 'pid') { extra = h('div.small', { style: 'color:var(--warn);font-weight:600', hidden: true }, 'This looks like a full name. Use initials or a hospital number instead.'); warnEls.pid = extra; }
              grid.appendChild(h('div.field' + (f.type === 'area' || f.id === 'when' ? '.wide' : ''), h('label', { for: id }, f.label), el, extra));
            });
            formHost.appendChild(h('section.nt-sec', h('h3', sec.title), grid));
          });
          checkName();
        }
        function checkName() { if (warnEls.pid) warnEls.pid.hidden = !logic.looksLikeFullName(data.pid); }

        var pickHost = h('div.nt-pick', { role: 'group', 'aria-label': 'Note type' });
        function buildPick() {
          MT.clear(pickHost);
          TEMPLATES.forEach(function (t) {
            pickHost.appendChild(h('button', { type: 'button', 'aria-pressed': String(t.id === tplId), onclick: function () { persist(); load(t.id); buildPick(); buildForm(); updatePreview(); showStatus(); ctx.setTitle && ctx.setTitle(t.title); } }, t.icon + ' ' + t.title));
          });
        }

        function clearThis() {
          MT.confirm('Clear everything entered in this ' + tpl.title.toLowerCase() + '?', { danger: true, okLabel: 'Clear note' }).then(function (ok) {
            if (!ok) return; delete drafts.items[tplId]; MT.store.set(DKEY, drafts); load(tplId); buildForm(); updatePreview(); showStatus();
          });
        }
        function clearAll() {
          MT.confirm('Delete ALL saved clinical notes, the resuscitation log and any other patient data from this tool on this device? This cannot be undone.', { danger: true, okLabel: 'Clear all patient data' }).then(function (ok) {
            if (!ok) return;
            MT.store.keys('clinician.notes.').forEach(function (k) { MT.store.remove(k); });
            MT.store.remove('clinician.resus.session');
            MT.store.remove('clinician.obstetrics.state');
            drafts = { v: 1, expiryDays: drafts.expiryDays, items: {} }; MT.store.set(DKEY, drafts);
            load(tplId); buildForm(); updatePreview(); showStatus(); MT.toast('All patient data cleared', 'ok');
          });
        }

        var expSel = h('select', { 'aria-label': 'Delete drafts automatically after', style: 'min-height:40px', onchange: function () { drafts.expiryDays = +expSel.value; MT.store.set(DKEY, drafts); showStatus(); } },
          [[1, '1 day'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']].map(function (o) { return h('option', { value: o[0], selected: drafts.expiryDays === o[0] }, o[1]); }));

        load(tplId);
        container.appendChild(h('div.nt-print', printPre));
        container.appendChild(h('div.stack.nt-screen',
          MT.ui.alert('info', 'Protect patient privacy', 'Use initials, age/sex or a hospital number instead of full names. Drafts are saved only in this browser, never sent anywhere, and are deleted automatically after the period you choose.'),
          pickHost,
          h('div.nt-layout',
            formHost,
            h('div.nt-prev.stack-sm',
              h('div.card.stack-sm',
                h('div.row.row-between', h('h2', { style: 'margin:0;font-size:1.05rem' }, 'Preview'), statusEl),
                previewEl,
                h('div.row',
                  h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.copy(previewEl.textContent); } }, 'Copy'),
                  h('button.btn', { type: 'button', onclick: function () { MT.print(container); } }, '🖨 Print'),
                  h('button.btn', { type: 'button', onclick: function () { MT.download(tplId + '-' + MT.today() + '.txt', previewEl.textContent); } }, 'Download .txt')),
                h('div.row', h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: clearThis }, 'Clear this note'),
                  h('label.small.muted', 'Auto-delete drafts after ', expSel))),
              h('div.card-soft.stack-sm', { style: 'padding:12px;border-radius:12px' },
                h('div.small.muted', 'Removes saved notes, the resuscitation log and saved dating from this device.'),
                h('button.btn.btn-danger.btn-sm', { type: 'button', onclick: clearAll }, 'Clear all patient data')))),
          MT.ui.disclaimer('Templates are prompts, not a legal standard. Follow your institution’s documentation policy; sign, date and time every entry. Headings follow SOAP (Weed 1968), ISBAR (ACSQHC / WHO), and PRSB / Academy of Medical Royal Colleges record standards.')));
        buildPick(); buildForm(); updatePreview(); showStatus();
        return function () { persist(); };
      }
    });
  };

  return logic;
});

# Architecture & contributor contract

Open Medical Toolkit is three static web apps that share one design system and one runtime:

| Suite | Path | Audience | Accent |
|---|---|---|---|
| Medical Student Studio | `student/` | medical students | violet |
| Clinician Toolkit | `clinician/` | health-care practitioners | teal |
| Salus | `health/` | anyone, anywhere (public health) | green |

## Hard constraints

- **No build step, no dependencies, no CDNs, no frameworks.** Plain HTML, CSS, and classic `<script>` files (not ES modules), so every page also works when opened from disk (`file://`) after being shared by USB, Bluetooth, or a messaging app.
- **Offline-first and private.** No network calls, analytics, fonts, or remote assets. The only exception is the opt-in weather/air-quality feature in `health/tools/environment.js` (Open-Meteo, no key). All user data stays in `localStorage` via `MT.store`.
- **Runs on low-end phones.** Mobile-first layouts (test at 390 px wide), no horizontal page scroll, tap targets ≥ 40 px, and no heavy work at load. Keep each file lean; data files may be larger.
- **Light and dark themes.** Use only the CSS variables from `assets/css/core.css` (e.g. `var(--surface)`, `var(--text)`, `var(--accent)`, `var(--danger)`) and never hard-code light-only colours.

## How a page boots

`<suite>/index.html` loads, in order, `assets/js/core.js`, each package's `lib/`, `data/` and `tools/` files, and finally `<suite>/boot.js`, which calls `MT.app.start(...)`. Tools register themselves with `MT.registerTool(...)`, and the shell builds the navigation, home grid, search, settings, and hash router (`#/<toolId>/<param>/...`).

## File ownership (parallel development)

Each package owns only the files listed for it and must not create, edit, or delete anything else. In particular it must not touch `assets/`, `*/index.html`, `*/boot.js`, `sw.js`, `package.json`, `docs/` (except where stated), or another package's files. If you need a core change, write the request in your final report. Never run `git`.

| Package | Owns |
|---|---|
| S1 Recall Lab | `student/lib/fsrs.js`, `student/data/decks.js`, `student/tools/recall.js`, `tests/unit/student-fsrs*.test.js` |
| S2 Physiology Lab | `student/lib/physiology.js`, `student/tools/physiology.js`, `tests/unit/student-physiology*.test.js` |
| S3 Anatomy Atlas | `student/data/anatomy.js`, `student/tools/anatomy.js`, `tests/unit/student-anatomy*.test.js` |
| S4 ECG Lab | `student/lib/ecg.js`, `student/tools/ecg.js`, `tests/unit/student-ecg*.test.js` |
| S5 Clinical skills & EBM | `student/lib/ebm.js`, `student/data/clinical-skills.js`, `student/tools/clinical-skills.js`, `student/tools/ebm.js`, `tests/unit/student-ebm*.test.js` |
| C1a Calculators: cardio/renal/hepatic/anthropometric | `clinician/lib/calcs-cardio-renal.js`, `tests/unit/clinician-calcs-cardio*.test.js` |
| C1b Calculators: acute care/neuro/resp/ID/obs/psych/geri | `clinician/lib/calcs-acute-care.js`, `tests/unit/clinician-calcs-acute*.test.js` |
| C2 Acid–base, fluids & drugs | `clinician/lib/acidbase.js`, `clinician/lib/fluids-drugs.js`, `clinician/tools/acidbase.js`, `clinician/tools/fluids-drugs.js`, `tests/unit/clinician-acidbase*.test.js`, `tests/unit/clinician-fluids*.test.js` |
| C3 Emergency workflow & documentation | `clinician/lib/triage.js`, `clinician/tools/resus.js`, `clinician/tools/triage.js`, `clinician/tools/notes.js`, `clinician/tools/obstetrics.js`, `tests/unit/clinician-triage*.test.js`, `tests/unit/clinician-obstetrics*.test.js` |
| H1 Health check & action plan | `health/lib/health-engine.js`, `health/tools/checkup.js`, `tests/unit/health-engine*.test.js` |
| H2 Get help now | `health/data/first-aid.js`, `health/lib/triage-lay.js`, `health/tools/get-help.js`, `tests/unit/health-triage*.test.js` |
| H3 Daily coach & trackers | `health/lib/trackers.js`, `health/tools/coach.js`, `tests/unit/health-trackers*.test.js` |
| H4 Passport, prevention & environment | `health/lib/passport.js`, `health/tools/passport.js`, `health/tools/prevention.js`, `health/tools/environment.js`, `tests/unit/health-passport*.test.js` (uses the vendored `health/vendor/qrcode.js`) |

## File patterns

**Pure logic (`lib/*.js`), testable in Node and loaded in the browser:**

```js
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;      // Node tests
  else (root.MTLib = root.MTLib || {}).fsrs = lib;                              // browser: MTLib.fsrs
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function nextInterval(stability, retention) { /* ... */ }
  return { nextInterval: nextInterval };
});
```

Logic files must not touch the DOM or `MT`. They are pure functions plus constants, with references to sources in comments.

**Data (`data/*.js`)** follows the same wrapper but exports data (`(root.MTData = root.MTData || {}).anatomy = data`).

**Calculator definitions (`clinician/lib/calcs-*.js`)** export an array of definitions and, in the browser, append to `self.MTCalcs`:

```js
(function (root, factory) {
  var defs = factory();
  if (typeof module === 'object' && module.exports) module.exports = defs;
  else root.MTCalcs = (root.MTCalcs || []).concat(defs);
})(typeof self !== 'undefined' ? self : this, function () { 'use strict'; return [ /* defs */ ]; });
```

The calculator browser (`clinician/tools/calculators.js`) lists them automatically at `#/calculators/<id>`. The definition schema is documented in `assets/js/core.js` section 9. A `compute(values)` must be pure and must not reference `MT`; numbers arrive in the base unit, which is the first entry of `units`. Return `null` when the inputs cannot produce a meaningful result.

**UI (`tools/*.js`)**, an IIFE that registers one or more tools:

```js
(function () {
  'use strict';
  var h = MT.h;
  MT.css('rl', '.rl-card { ... }');             // prefix every class with your package prefix
  MT.registerTool({
    id: 'recall', title: 'Recall Lab', category: 'memory', icon: '🧠', order: 1,
    description: 'One sentence on what it does.', keywords: ['anki', 'flashcards'],
    render: function (container, ctx) {          // ctx.params = sub-route parts after #/recall/
      container.appendChild(h('div.card', h('h2', 'Hello')));
      return function cleanup() { /* stop timers, audio, listeners */ };
    }
  });
})();
```

Category ids per suite are defined in `<suite>/boot.js`. Student: `memory`, `anatomy`, `physiology`, `ecg`, `clinical`, `ebm`. Clinician: `calculators`, `acute`, `labs`, `workflow`, `obstetrics`. Health: `help`, `me`, `daily`, `mind`, `prevent`.

The health suite can also put cards on its home screen with `MT.registerWidget({ id, order, render(container) })`. Lower `order` comes first; H2's emergency widget uses order 0.

## Core runtime API (`assets/js/core.js`, global `MT`)

| Area | API |
|---|---|
| DOM | `MT.h(tag, attrs, ...children)` hyperscript (`'div.card#id'`; attrs `class`, `style` string/object, `onclick`/`on:{}`, `dataset`, `text`, `html` (escaped content only!)). `MT.s(...)` builds SVG. `MT.$`, `MT.$$`, `MT.clear(el)`, `MT.esc(str)` |
| Numbers | `MT.num(str)` parses (accepts `36,5`) → number or `undefined`; `MT.fmt(x, dp, {trim, sign})`; `MT.round`; `MT.clamp`; `MT.pct` |
| Dates | `MT.today()` gives `YYYY-MM-DD` local; also `MT.parseDate`, `MT.daysBetween(a,b)`, `MT.addDays`, `MT.formatDate`, `MT.formatTime` |
| Storage | `MT.store.get(key, fallback)`, `.set(key, value)`, `.update(key, fallback, fn)`, `.remove`, `.keys(prefix)`, `.exportAll(prefix)`, `.importAll(obj)`, `.clear(prefix)`. **Key format: `<suite>.<package>.<name>`**, e.g. `student.recall.cards` and `health.coach.bp`. The settings Back up and Erase buttons operate on the suite prefix |
| Settings | `MT.settings.get('theme'|'textSize'|'units'|'lang'|'speechRate')`; `MT.on('settings:change', fn)` |
| Events | `MT.on(evt, fn)` (returns unsubscribe), `MT.emit(evt, data)`. Events: `profile:change`, `settings:change`, `store:<key>` |
| UI | `MT.toast(msg, 'ok'|'warn'|'danger')`, `MT.modal({title, body, actions:[{label, variant, onClick}]})` returns close, `MT.confirm(msg, {danger})` → Promise<bool>, `MT.copy(text)`, `MT.download(name, content, mime)`, `MT.readFile(accept)` → `{name, text}`, `MT.print(el)`, `MT.css(id, cssText)` |
| UI blocks | `MT.ui.alert(type, title, body)`, `MT.ui.badge(text, type)`, `MT.ui.segmented(options, value, onChange)`, `MT.ui.tabs(tabs, active, onChange)`, `MT.ui.empty(icon, title, body)`, `MT.ui.disclaimer(text)` |
| Charts | `MT.chart.line({width, height, x:{min,max,label,time,format}, y:{...}, series:[{name, points:[[x,y]], color, dash, markers, area}], bands, xBands, hlines, vlines, points})` returns an element (SVG + legend) |
| Calculators | `MT.calc.render(def, container)` renders a live form, result, copy-summary, formula, pearls and references; `MT.calc.sumPoints(def, values)` |
| Speech | `MT.speech.supported`, `MT.speech.speak(text, {lang})`, `MT.speech.stop()`, `MT.speech.button(() => text)` returns a Read aloud toggle button (or null) |
| i18n | `MT.t('English source text {n}', {n: 3})`. Health suite only; translations are added later per language |
| Calendar | `MT.ics.build({name, events:[{uid, title, description, start: Date, durationMin, rrule:'FREQ=DAILY', alarmMin}]})`, `MT.ics.download(filename, cal)` |
| Profile (health) | `MT.profile.get()`, `MT.profile.set(patch)` (emits `profile:change`), `MT.profile.age()`, `MT.profile.bmi()`. Schema: `{ name, birthYear, sex:'female'|'male', heightCm, weightKg, waistCm, country (ISO-2), pregnant, breastfeeding, conditions:[ids], smoking, emergencyNumber, ancestry }` |
| App | `MT.registerTool`, `MT.registerWidget`, `MT.registerSearch(fn(q) → [{title, description, href, icon}])`, `MT.app.navigate('#/tool/x')` |

CSS building blocks from `core.css`: `.card`, `.card-soft`, `.card-accent`, `.btn` (`.btn-primary`, `.btn-danger`, `.btn-ghost`, `.btn-soft`, `.btn-sm`, `.btn-lg`, `.btn-block`), `.row`, `.stack`, `.grid` (`--min`), `.grid-2`, `.grid-3`, `.split`, `.field`, `.form-grid`, `.input-group`, `.check`, `.choice-list`, `.segmented`, `.tabs`, `.result.band-ok|warn|danger|info` (`.result-label`, `.result-value`, `.result-title`), `.alert-*`, `.badge-*`, `.chip`, `.kv`, `.stat`, `.progress`, `.ring` (`--p` 0–100), `.table-wrap` with `table.table`, `details.disclosure` with `.disclosure-body`, `.empty-state`, `.callout-emergency`, `.disclaimer`, `.muted`, `.small`, `.mono`, `.sr-only`.

## Quality bar

1. **Correctness first.** Every formula, threshold, and dose must come from a named source (guideline or original paper) cited in a code comment and in the UI (`references`). Unit-test every formula against worked examples from the source or well-known reference values.
2. **Clinical safety.** Use conservative defaults. Show units everywhere and validate plausible ranges. Never present a result without its interpretation and limitations. In the public-health suite, never falsely reassure: always add safety-netting ("get help if…"), and put the emergency route first.
3. **Accessibility.** Every input needs a `<label>`, every action must be a real `<button>`, and the tool must work by keyboard. Use `aria-live` for changing results, and never let colour be the only signal. Respect `prefers-reduced-motion` for animation.
4. **Security.** Never inject user, imported, or URL-derived text through `html:` or `innerHTML`; use text nodes (`MT.h` children). Validate imported files (JSON shape, sizes).
5. **Persistence.** Save user work under your namespaced keys; versioned shapes (`{v:1, ...}`) are recommended. Handle empty or corrupt storage gracefully.
6. **Polish.** Use clear empty states and helpful microcopy, test on mobile and desktop, and keep dark mode correct.

## Self-test workflow (required before reporting)

```bash
node --test tests/unit/<your-test-file>.test.js
node tests/e2e/check.cjs <suite> <route> --ignore-missing --shot=<scratchpad>/<name>.png
node tests/e2e/check.cjs <suite> <route> --ignore-missing --mobile --shot=<scratchpad>/<name>-m.png
```

`check.cjs` loads the page in headless Chromium, reports console errors, exceptions and failed requests, and saves a screenshot. Open the PNG with the Read tool to inspect it visually. Use `--script=/abs/path.cjs`, a module exporting `async (page, {log}) => {}`, to click through flows, and `--full` for full-page shots. `--ignore-missing` hides 404s from packages that other agents are still building. Your own files must load, so check that your tool ids appear in the `tools` array of the output. Put scratch files in your scratchpad, never in the repository.

## Salus (health suite) cross-package contracts

The four health packages link to each other and read each other's saved data. Each package writes only its own keys, but may *read* the keys below defensively (they may be missing or empty).

**Routes (for cross-links):**
- H2: `#/get-help` (emergency numbers, "Do I need help now?" checker, share location, breath counter), `#/first-aid` and `#/first-aid/<id>`, `#/crisis` (mental-health crisis & safety plan). First-aid ids include `cpr`, `choking`, `bleeding`, `burns`, `stroke`, `heart-attack`, `anaphylaxis`, `seizure`, `hypoglycaemia`, `poisoning`, `snakebite`, `drowning`, `heat-stroke`, `dehydration`, `head-injury`, `overdose`, `recovery-position`.
- H1: `#/checkup` (health check hub), `#/checkup/<module>`, `#/plan` (action plan), `#/profile` (about me).
- H3: `#/bp`, `#/sleep`, `#/mood`, `#/breathe`, `#/move`, `#/meds`, `#/habits`.
- H4: `#/passport`, `#/prevention`, `#/environment`.

**Shared storage shapes:**
- `health.profile` (core `MT.profile`). H1 owns the editing UI.
- `health.coach.bp` (H3): `{ v:1, readings:[{ id, t: ISO datetime, sys, dia, pulse, arm:'left'|'right', session:'am'|'pm'|'other', note }] }`
- `health.coach.meds` (H3): `{ v:1, items:[{ id, name, dose, times:['08:00'], purpose, notes, active:true, startDate, pillsLeft, pillsPerDay }] }`
- `health.coach.habits` (H3): `{ v:1, items:[{ id, title, cue, plan, tiny, source, createdAt, log:{ 'YYYY-MM-DD': true } }] }`
- `health.checkup.results` (H1): `{ v:1, updatedAt, le8:{ score, metrics:{ diet, activity, nicotine, sleep, bmi, lipids, glucose, bp } }, findrisc:{ score, band }, phq9:{ score, item9 }, gad7:{ score }, auditc:{ score, positive }, stopbang:{ score, band }, tb:{ positive }, falls:{ positive } }`. Missing parts mean "not done".
- `health.gethelp.numbers` (H2): `{ country, ambulance, police, fire, poison, mentalHealth, gbv, doctor }` (user-confirmed numbers).

**Runtime hand-offs (set at script load, not inside render):**
- H3 exposes `MT.coach = { addHabit({ title, cue, plan, tiny, source }) -> id }` so H1's action plan can turn an action into a tracked habit. Callers must check that `MT.coach` exists.
- H2 exposes `MT.help = { emergencyNumber() -> string }` (user-saved, else the country default, else `'112'`) so every package can show a correct "Call" button. Callers must check that it exists.

**Home widgets (order):** H2 emergency banner `0`, H1 health snapshot `10`, H3 today's check-ins `20`, H4 passport and alerts `30`.

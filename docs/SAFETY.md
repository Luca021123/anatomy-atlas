# Safety, intended use and limitations

Open Medical Toolkit is free, open educational and decision-support software. It is not a medical device: it has not been assessed, cleared or certified by any regulator (for example the FDA, the EU MDR notified bodies, MHRA or SAHPRA). It must not be the only basis for a clinical decision. This page explains what each suite is for, how its content is checked, what it deliberately does not do, and how to report a problem.

## Intended use by suite

**Medical Student Studio** is a learning tool. Its simulators simplify physiology so that cause and effect are visible. The physiology and ECG generators produce textbook-style signals, which are not recordings of real patients. Use it to build understanding, then confirm facts against your curriculum and current texts.

**Clinician Toolkit** supports qualified health professionals. It covers validated scores, formulas, interpretation aids, timers and documentation templates. Every calculator shows its formula, its limitations and its primary references, and every dose-related output is labelled for checking against local protocols. Results are only as good as the inputs and the evidence behind each score. Clinical judgement, local guidelines, formularies and senior advice always take precedence.

**Salus** gives general health information and self-care support to anyone. It cannot examine you, diagnose you or replace a health worker. Its design rules are deliberately conservative:

- The emergency route comes first on every screen where it might matter. "Call your emergency number" is never more than one tap away.
- The danger-sign checker can tell you to get help now or today. It never tells you that you are fine. When no danger sign is selected, it says that this does not mean you are well, and explains what to watch for and when to get care.
- First-aid guidance follows mainstream resuscitation and first-aid guidelines (2025 cycle where available) and WHO guidance. It prefers advice that is safe for untrained bystanders.
- Medicine advice is limited to widely agreed lay first aid: oral rehydration solution and zinc for children with diarrhoea, chewing aspirin for a suspected heart attack only when not allergic and without a bleeding disorder, sugar for low blood sugar, and helping someone use their own adrenaline auto-injector. Salus never adjusts prescribed medicines and gives no prescription dosing.
- Advice that could harm some people is safety-gated. One example is potassium-enriched salt substitutes, which are not suitable for people with kidney disease, people taking medicines that raise potassium, pregnant women or children.
- Risk scores are explained with what they do and do not mean. Unknown laboratory values become "get tested" actions, not guesses.

## How content is checked

1. **Named sources.** Every formula, threshold, dose and recommendation is traced to a guideline or original publication. The source is cited in the code and shown in the app. Calculator references are compiled in [REFERENCES.md](REFERENCES.md).
2. **Unit tests.** Scores and formulas are tested against worked examples and boundary values (`npm test`).
3. **Browser tests.** Every tool is loaded in a headless browser on desktop and phone sizes (`npm run smoke`, `npm run smoke:mobile`).
4. **Independent review.** After each package was built, a separate reviewer audited it for clinical accuracy and, for Salus, for safety and plain language.
5. **Transparency about uncertainty.** Where a primary source could not be confirmed during development, the item is either left out or labelled in the code and the interface. The research briefs in [research/](research/) mark items as verified or unverified. Known open items are listed below.

## Known open items that need clinical confirmation

The research for this project had limited access to some primary guideline websites. The following items are labelled in the app and need confirmation by a qualified reviewer before anyone relies on them:

- **SATS (South African Triage Scale).** Some adult TEWS (Triage Early Warning Score) cells and the full discriminator lists need checking against the official chart. Paediatric TEWS is intentionally not implemented, and the tool sends children to the paper chart.
- **Emergency phone numbers.** Built-in numbers are limited to well-known ones and are labelled "check locally". Users can save their own.
- **Antenatal contact weeks and some screening intervals.** These follow WHO and USPSTF guidance as best confirmed. Countries vary, and the app says so.
- **Diet quality.** The diet part of the Life's Essential 8 health check uses a transparent approximation, because the official screener text could not be verified. The app labels it as an approximation.

## Privacy model

There are no accounts, analytics, advertising or servers. Everything you type is stored only in your browser's local storage on your device. Backups are files you create and control. Salus has an opt-in heat, UV and air-quality feature. Before anything is sent, it tells you that it will send rounded coordinates (about 1 km precision) or a city name to Open-Meteo's free public API. Nothing else leaves the device. A Content Security Policy blocks injected scripts. Salus has an Exit button that clears the screen instantly, for privacy on shared phones.

## Reporting a problem

If you find an error, especially a clinical one, please open an issue on the repository with the tool name, what you entered, what you expected, and your source. Clinical-accuracy issues are treated as the highest priority.

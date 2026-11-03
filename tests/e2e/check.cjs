// Load one suite page (optionally one tool route) in headless Chromium, report errors, take a screenshot.
// Usage:
//   node tests/e2e/check.cjs <suite> [route] [--mobile] [--full] [--shot=/abs/path.png] [--script=/abs/actions.cjs] [--wait=ms] [--ignore-missing]
//   --ignore-missing: ignore 404s for files not yet created by other packages (parallel development)
//   suite: student | clinician | health | hub        route: e.g. "recall" or "calculators/cha2ds2va"
// --script module: module.exports = async (page, { log }) => { ...interactions... }
// Prints a JSON summary; exit code 1 if any console error, page error, failed request, or script failure.
const { chromium } = require('playwright');
const path = require('node:path');
const { start } = require('../../tools/serve.cjs');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
const [suite = 'hub', route = ''] = args.filter(a => !a.startsWith('--'));
(async () => {
  const { server, url } = await start(0);
  const browser = await chromium.launch();
  const context = await browser.newContext(flags.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const out = { suite, route, consoleErrors: [], pageErrors: [], badRequests: [], logs: [] };
  page.on('console', m => { if (m.type() === 'error') out.consoleErrors.push(m.text()); else if (m.type() === 'warning') out.logs.push('warn: ' + m.text()); });
  page.on('pageerror', e => out.pageErrors.push(String(e && e.stack || e)));
  page.on('requestfailed', r => { if (!r.url().startsWith('data:')) out.badRequests.push(r.url() + ' ' + (r.failure() && r.failure().errorText)); });
  page.on('response', r => { if (r.status() >= 400) out.badRequests.push(r.status() + ' ' + r.url()); });
  const target = suite === 'hub' ? `${url}/index.html` : `${url}/${suite}/index.html${route ? '#/' + route : ''}`;
  out.url = target;
  try {
    await page.goto(target, { waitUntil: 'load' });
    await page.waitForTimeout(Number(flags.wait || 600));
    if (suite !== 'hub') out.tools = await page.evaluate(() => (window.MT && MT.tools || []).map(t => t.id));
    if (suite === 'clinician') out.calculators = await page.evaluate(() => (self.MTCalcs || []).length);
    if (flags.script) {
      const fn = require(path.resolve(flags.script));
      await fn(page, { log: (...a) => out.logs.push(a.join(' ')), url });
      await page.waitForTimeout(300);
    }
    out.title = await page.title();
    out.h1 = await page.evaluate(() => { const h = document.querySelector('h1'); return h ? h.textContent.trim() : null; });
    if (flags.shot) { await page.screenshot({ path: flags.shot, fullPage: !!flags.full }); out.screenshot = flags.shot; }
  } catch (e) {
    out.scriptError = String(e && e.stack || e);
  }
  await browser.close(); server.close();
  if (flags['ignore-missing']) { // other packages may not exist yet while agents build in parallel
    out.ignored = out.badRequests.filter(r => /ERR_ABORTED|^404 /.test(r)).length;
    out.badRequests = out.badRequests.filter(r => !/ERR_ABORTED|^404 /.test(r));
    out.consoleErrors = out.consoleErrors.filter(m => !/^Failed to load resource/.test(m));
  }
  out.ok = !out.consoleErrors.length && !out.pageErrors.length && !out.badRequests.length && !out.scriptError;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
})();

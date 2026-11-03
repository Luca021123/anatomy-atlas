// Smoke test: open every suite, visit every registered tool (and every clinician calculator),
// and fail on any console error, uncaught exception, failed request, or tool render error box.
// Usage: node tests/e2e/smoke.cjs [--mobile]
const { chromium } = require('playwright');
const { start } = require('../../tools/serve.cjs');
const mobile = process.argv.includes('--mobile');
(async () => {
  const { server, url } = await start(0);
  const browser = await chromium.launch();
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  const problems = [];
  let visited = 0;
  async function visit(page, label, target) {
    const errs = [];
    const onConsole = m => { if (m.type() === 'error') errs.push('console: ' + m.text()); };
    const onPageErr = e => errs.push('pageerror: ' + String(e && e.message || e));
    const onResp = r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); };
    page.on('console', onConsole); page.on('pageerror', onPageErr); page.on('response', onResp);
    await page.goto(target, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    const errorBox = await page.$('.error-box');
    if (errorBox) errs.push('render error: ' + (await errorBox.textContent()).slice(0, 300));
    page.off('console', onConsole); page.off('pageerror', onPageErr); page.off('response', onResp);
    visited++;
    if (errs.length) problems.push({ label, errs });
  }
  const page = await context.newPage();
  await visit(page, 'hub', `${url}/index.html`);
  for (const suite of ['student', 'clinician', 'health']) {
    await visit(page, suite + ' home', `${url}/${suite}/index.html`);
    const ids = await page.evaluate(() => (window.MT && MT.tools || []).map(t => t.id));
    for (const id of ids) { await page.goto('about:blank'); await visit(page, `${suite}/#/${id}`, `${url}/${suite}/index.html#/${id}`); }
    if (suite === 'clinician') {
      const calcs = await page.evaluate(() => (self.MTCalcs || []).map(c => c.id));
      for (const id of calcs) { await page.goto('about:blank'); await visit(page, `calculators/${id}`, `${url}/clinician/index.html#/calculators/${id}`); }
    }
  }
  await browser.close(); server.close();
  console.log(`Visited ${visited} pages${mobile ? ' (mobile)' : ''}; ${problems.length} with problems.`);
  problems.forEach(p => console.log('✗ ' + p.label + '\n   ' + p.errs.join('\n   ')));
  process.exit(problems.length ? 1 : 0);
})();

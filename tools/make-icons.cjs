// Renders PNG app icons (192/512) from assets/icons/*-full.svg using the pre-installed Playwright Chromium.
// Usage: node tools/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const name of ['hub', 'student', 'clinician', 'health']) {
    const svg = fs.readFileSync(path.join(root, 'assets/icons', `${name}-full.svg`), 'utf8');
    for (const size of [192, 512]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
      await page.screenshot({ path: path.join(root, 'assets/icons', `${name}-${size}.png`) });
    }
  }
  await browser.close();
  console.log('icons rendered');
})();

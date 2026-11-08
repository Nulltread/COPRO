const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'mockups');
const { chromium } = require('/tmp/node_modules/playwright-core');

async function main() {
  const pages = fs.readdirSync(OUT).filter(f => f.endsWith('.html'));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  for (const f of pages.sort()) {
    await page.goto('file://' + path.join(OUT, f));
    await page.waitForTimeout(150);
    const png = f.replace(/\.html$/, '.png');
    await page.screenshot({ path: path.join(OUT, png), fullPage: true });
    console.log('capture:', png);
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });

const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = require('path').join(__dirname, '..', 'screenshots');
const TEST_USER = { username: 'design_review_user', password: 'design123456' };

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/#/login`);
    await page.waitForSelector('.login-card');
    await page.fill('.login-form input[type="text"]', TEST_USER.username);
    await page.fill('.login-form input[type="password"]', TEST_USER.password);
    await page.click('.submit-btn');
    await page.waitForURL(/.*#\/gallery/);
    await sleep(800);

    const card = await page.$('.image-card');
    if (card) {
      await card.click();
      await page.waitForSelector('.el-dialog__body', { timeout: 10000 });
      await sleep(800);
      await page.screenshot({
        path: require('path').join(SCREENSHOT_DIR, `preview-modal-${viewport.name}.png`),
        fullPage: false,
      });
      console.log(`Captured preview-modal-${viewport.name}.png`);
    }

    await context.close();
  }

  await browser.close();
}

run().catch(console.error);

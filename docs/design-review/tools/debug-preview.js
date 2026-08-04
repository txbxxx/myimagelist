const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';
const TEST_USER = { username: 'design_review_user', password: 'design123456' };

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/#/login`);
  await page.waitForSelector('.login-card');
  await page.fill('.login-form input[type="text"]', TEST_USER.username);
  await page.fill('.login-form input[type="password"]', TEST_USER.password);
  await page.click('.submit-btn');
  await page.waitForURL(/.*#\/gallery/);
  await page.waitForTimeout(800);

  const cards = await page.$$('.image-card');
  console.log('Cards found:', cards.length);

  if (cards.length > 0) {
    await cards[0].click();
    await page.waitForTimeout(2000);

    const dialogBody = await page.$('.el-dialog__body');
    const dialog = await page.$('.el-dialog');
    const overlay = await page.$('.el-overlay');
    const previewDialog = await page.$('.preview-dialog');
    console.log('dialogBody:', !!dialogBody, 'dialog:', !!dialog, 'overlay:', !!overlay, 'previewDialog:', !!previewDialog);

    const html = await page.content();
    console.log('Contains preview-dialog:', html.includes('preview-dialog'));
    console.log('Contains el-dialog:', html.includes('el-dialog'));

    await page.screenshot({ path: 'debug-gallery.png' });
  }

  await browser.close();
}

run().catch(console.error);

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000/api';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const ASSET_DIR = path.join(__dirname, '..', 'assets');

const TEST_USER = { username: 'design_review_user', password: 'design123456' };

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiCall(method, endpoint, body = null, headers = {}) {
  const url = `${API_URL}${endpoint}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { status: res.status, data: text ? JSON.parse(text) : null };
  } catch {
    return { status: res.status, data: text };
  }
}

async function ensureTestUser() {
  let res = await apiCall('POST', '/auth/register', TEST_USER);
  if (!res.data?.ok && res.data?.error?.includes('已存在')) {
    res = await apiCall('POST', '/auth/login', TEST_USER);
  }
  if (!res.data?.ok) {
    throw new Error(`Auth failed: ${res.data?.error || res.data}`);
  }
  return res.data.token;
}

async function seedImages(token) {
  const categoriesRes = await apiCall('GET', '/categories', null, { Authorization: `Bearer ${token}` });
  const categories = categoriesRes.data || [];
  const imagesRes = await apiCall('GET', '/images', null, { Authorization: `Bearer ${token}` });
  const images = imagesRes.data || [];

  if (images.length >= 8) {
    console.log(`Gallery already has ${images.length} images, skipping seed.`);
    return;
  }

  // Create sample categories if only default exists
  let targetCats = categories.filter((c) => !c.id.startsWith('cat_default'));
  if (targetCats.length === 0) {
    const newCats = [
      { name: '旅行', color: '#A0C4FF' },
      { name: '美食', color: '#FFD6A5' },
      { name: '截图', color: '#CAFFBF' },
    ];
    for (const c of newCats) {
      const r = await apiCall('POST', '/categories', c, { Authorization: `Bearer ${token}` });
      if (r.data?.ok) targetCats.push(r.data.category);
    }
  }

  const sampleFiles = [
    'sample-blue.jpg',
    'sample-pink.jpg',
    'sample-mint.jpg',
    'sample-yellow.jpg',
    'sample-purple.jpg',
    'sample-peach.jpg',
    'sample-animation.gif',
    'sample-transparent.png',
  ];

  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
  };

  for (let i = 0; i < sampleFiles.length; i++) {
    const filePath = path.join(ASSET_DIR, sampleFiles[i]);
    if (!fs.existsSync(filePath)) continue;
    const ext = path.extname(filePath).toLowerCase();
    const categoryId = targetCats[i % targetCats.length]?.id || 'cat_default';
    const form = new FormData();
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer], { type: mimeTypes[ext] || 'application/octet-stream' });
    form.append('files', blob, sampleFiles[i]);
    form.append('originalName', sampleFiles[i]);
    form.append('categoryId', categoryId);

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json();
    console.log(`Uploaded ${sampleFiles[i]}:`, json.ok ? 'ok' : json.error);
  }
}

async function capture(page, name, viewport) {
  const fileName = `${name}-${viewport.name}.png`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log('Captured', filePath);
}

async function captureFull(page, name, viewport) {
  const fileName = `${name}-${viewport.name}-full.png`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log('Captured', filePath);
}

async function loginPage(page) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.waitForSelector('.login-card', { timeout: 10000 });
  await sleep(500);
}

async function doLogin(page) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.waitForSelector('.login-card', { timeout: 10000 });
  await page.fill('.login-form input[type="text"]', TEST_USER.username);
  await page.fill('.login-form input[type="password"]', TEST_USER.password);
  await page.click('.submit-btn');
  await page.waitForURL(/.*#\/gallery/, { timeout: 10000 });
  await sleep(800);
}

async function galleryPage(page) {
  await page.goto(`${BASE_URL}/#/gallery`);
  await page.waitForSelector('.image-grid, .empty-state, .loading-state', { timeout: 10000 });
  await sleep(600);
}

async function uploadPage(page) {
  await page.goto(`${BASE_URL}/#/upload`);
  await page.waitForSelector('.drop-zone', { timeout: 10000 });
  await sleep(400);
}

async function categoriesPage(page) {
  await page.goto(`${BASE_URL}/#/categories`);
  await page.waitForSelector('.cat-list, .empty-state', { timeout: 10000 });
  await sleep(400);
}

async function openPreview(page) {
  await galleryPage(page);
  const card = await page.$('.image-card');
  if (card) {
    await card.click();
    await page.waitForSelector('.el-dialog__body', { timeout: 10000 });
    await sleep(800);
  }
}

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const token = await ensureTestUser();
  await seedImages(token);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    // Login page
    await loginPage(page);
    await capture(page, 'login-empty', viewport);
    await captureFull(page, 'login-empty', viewport);

    // Filled login
    await page.fill('.login-form input[type="text"]', TEST_USER.username);
    await page.fill('.login-form input[type="password"]', TEST_USER.password);
    await capture(page, 'login-filled', viewport);

    // Logged in gallery
    await doLogin(page);
    await capture(page, 'gallery-populated', viewport);
    await captureFull(page, 'gallery-populated', viewport);

    // Category filter active
    const filterTags = await page.$$('.filter-tag');
    if (filterTags.length > 1) {
      await filterTags[1].click();
      await sleep(600);
      await capture(page, 'gallery-filtered', viewport);
    }

    // Preview modal
    await openPreview(page);
    if (await page.$('.el-dialog__body')) {
      await capture(page, 'preview-modal', viewport);
      await page.keyboard.press('Escape');
      await sleep(300);
    }

    // Upload page
    await uploadPage(page);
    await capture(page, 'upload-empty', viewport);
    await captureFull(page, 'upload-empty', viewport);

    // Categories page
    await categoriesPage(page);
    await capture(page, 'categories-list', viewport);
    await captureFull(page, 'categories-list', viewport);

    await context.close();
  }

  await browser.close();
  console.log('All screenshots captured.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

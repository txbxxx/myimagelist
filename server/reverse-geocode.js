/**
 * 离线 reverse geocoding：经纬度 → 最近城市
 * --------------------------------
 * 数据：server/data/cities.json（build-cities-data.js 生成，3.4 万城市）
 *      格式 [ [lat, lng, zh|null, asciiname, countryCode], ... ]
 * 算法：暴力遍历，分数 = 距离² / √人口。大城市吸引力强，避免命中大都市的卫星城/区
 *      （如东京的中野区、巴黎的区）。9 千多次比较 <3ms，无需 kd-tree
 *
 * 调用方：上传抽完 EXIF GPS 后，reverseGeocode(lat,lng) → { city, country }
 * 自检：node reverse-geocode.js
 */
const fs = require('fs');
const path = require('path');

let CITIES = null;
function load() {
  if (CITIES) return CITIES;
  const file = path.join(__dirname, 'data', 'cities.json');
  if (!fs.existsSync(file)) {
    throw new Error('找不到 data/cities.json，先跑：node scripts/build-cities-data.js');
  }
  CITIES = JSON.parse(fs.readFileSync(file, 'utf8'));
  return CITIES;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {{city: string, country: string} | null}  city 优先中文，无则罗马名
 */
function reverseGeocode(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const cities = load();
  const cosLat = Math.cos(lat * Math.PI / 180);
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    const dLat = c[0] - lat;
    const dLng = (c[1] - lng) * cosLat;
    const distSq = dLat * dLat + dLng * dLng;       // 度² 近似距离（比较用，省 sqrt）
    const pop = c[5] || 1;
    // 加权：距离² / √人口。让大城市主条目压过同都市圈的卫星城/区
    const score = distSq / Math.sqrt(pop);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) return null;
  const c = cities[best];
  return { city: c[2] || c[3], country: c[4] };  // 中文优先，无则罗马名
}

module.exports = { reverseGeocode, load };

// ===== 自检：几个已知坐标应命中对应城市 =====
if (require.main === module) {
  const cases = [
    [31.2304, 121.4737, '上海'],
    [39.9042, 116.4074, '北京'],
    [35.6762, 139.6503, '东京'],
    [48.8566, 2.3522, '巴黎'],
    [30.2741, 120.1551, '杭州'],
  ];
  let failed = 0;
  for (const [lat, lng, expect] of cases) {
    const r = reverseGeocode(lat, lng);
    const ok = r && r.city === expect;
    if (!ok) failed++;
    console.log(`${ok ? '✅' : '❌'} (${lat}, ${lng}) → ${r ? r.city + ' (' + r.country + ')' : 'null'}（期望 ${expect}）`);
  }
  console.log(`\n${failed === 0 ? '全部通过 🎉' : failed + ' 项失败'}`);
  process.exit(failed === 0 ? 0 : 1);
}

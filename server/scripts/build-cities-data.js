/**
 * 一次性预处理：GeoNames cities15000.txt → 精简 cities.json
 * 跑法：先确保 server/data/cities15000.txt 存在（解压自 cities15000.zip）
 *       再 node server/scripts/build-cities-data.js
 *
 * cities15000.txt 字段（tab 分隔，GeoNames 标准）：
 *   0 geonameid | 1 name | 2 asciiname | 3 alternatenames | 4 lat | 5 lng
 *   6 fclass | 7 fcode | 8 country code | ... | 15 population ...
 *
 * 中文策略：alternatenames（逗号分隔的所有语言别名）里找第一个含 CJK 字符的项
 *           作中文名；无则留空（运行时回退 asciiname 罗马名）。
 *           —— 这样只需 cities15000.txt 一个文件，不下载 200MB 的 alternateNames.txt。
 *
 * 输出格式（数组形式省空间，3.4 万项 ~1MB）：
 *   [ [lat, lng, zh|null, asciiname, countryCode], ... ]
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'cities15000.txt');
const OUT = path.join(__dirname, '..', 'data', 'cities.json');

const CJK = /[一-鿿]/;

if (!fs.existsSync(SRC)) {
  console.error('❌ 找不到 ' + SRC);
  console.error('   先下载：curl -L http://download.geonames.org/export/dump/cities15000.zip -o server/data/cities15000.zip');
  console.error('   再解压：cd server/data && unzip cities15000.zip');
  process.exit(1);
}

const lines = fs.readFileSync(SRC, 'utf8').split('\n').filter(Boolean);
const cities = [];
for (const line of lines) {
  const f = line.split('\t');
  const asciiname = (f[2] || '').trim();
  const alts = (f[3] || '').split(',');
  let zh = '';
  for (const a of alts) {
    const t = a.trim();
    if (t && CJK.test(t)) { zh = t; break; }   // 取第一个含 CJK 的别名
  }
  const lat = parseFloat(f[4]);
  const lng = parseFloat(f[5]);
  const fcode = (f[7] || '').trim();
  const cc = (f[8] || '').trim();
  const pop = parseInt(f[14], 10) || 0;
  if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
  // 只留"主城市"：省会(PPLA)/地级市(PPLA2)/首都(PPLC)，外加 PPL 里人口≥100万的大城市(如纽约)
  // 排除普通聚居地/市辖区(PPL 小人口，如黄浦区/Paris 04)、乡镇(PPLA4)、城市分区(PPLX) 等
  // 否则最近匹配会命中大城市的某个区，而不是主城市本身
  const keep = fcode === 'PPLA' || fcode === 'PPLA2' || fcode === 'PPLC'
            || (fcode === 'PPL' && pop >= 1000000);
  if (!keep) continue;
  cities.push([lat, lng, zh || null, asciiname, cc, pop]);
}

fs.writeFileSync(OUT, JSON.stringify(cities));
console.log(`✅ 生成 ${cities.length} 个城市 → ${path.relative(process.cwd(), OUT)}`);
console.log(`   文件大小：${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
console.log(`   有中文名的：${cities.filter(c => c[2]).length} 个`);

// 抽样验证（几个常见城市应该命中中文）
const sample = ['上海', '北京', '东京', '巴黎', '纽约', '广州'];
console.log('   抽样：');
for (const s of sample) {
  const found = cities.find(c => c[2] === s);
  console.log(`     ${found ? '✅' : '❌'} ${s} ${found ? `→ ${found[3]}, ${found[4]}` : '(未命中)'}`);
}

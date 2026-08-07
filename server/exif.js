/**
 * 从图片 buffer 抽 EXIF：拍摄时间(DateTimeOriginal) + GPS 经纬度
 * --------------------------------
 * - 视频、截图、网图等无 EXIF 的 → 返回 null，调用方回退 uploadedAt / 留空
 * - EXIF 时间通常无时区，按服务器本地时区解析（个人图库部署在同地区，OK）
 * - GPS 是 d/m/s + 方向参考(N/S/E/W)，转十进制
 *
 * 调用方：上传后异步 parseExif(buffer) → { takenAt, lat, lng } | null
 * 自检：node exif.js
 */
const ExifReader = require('exifreader');

function rationalToNum(pair) {
  if (Array.isArray(pair)) return pair[0] / (pair[1] || 1);
  return Number(pair) || 0;
}

// EXIF GPS 是 [[d,d],[m,m],[s,s]] 三组分数 → 十进制
function dmsToDecimal(tag) {
  const v = tag.value;
  if (Array.isArray(v) && Array.isArray(v[0])) {
    return rationalToNum(v[0]) + rationalToNum(v[1]) / 60 + rationalToNum(v[2]) / 3600;
  }
  const dec = parseFloat(tag.description);
  return Number.isNaN(dec) ? null : dec;
}

function refIs(tag, letters) {
  if (!tag) return false;
  const s = String(tag.value || tag.description || '');
  return new RegExp(`[${letters}]`, 'i').test(s);
}

// 把 exifreader 解析出的 tags 对象 → { takenAt, lat, lng } | null
// 单独导出便于自检（mock tags 喂进来），绕开 exifreader 导出对象 frozen 无法改 load 的问题
function parseTags(tags) {
  // 拍摄时间：EXIF 格式 "2024:08:03 14:30:00"
  let takenAt = null;
  const dto = tags['DateTimeOriginal'] || tags['DateTime'];
  if (dto) {
    const m = String(dto.description || '').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
      if (!Number.isNaN(dt.getTime())) takenAt = dt.getTime();
    }
  }

  // GPS
  let lat = null, lng = null;
  const latTag = tags['GPSLatitude'];
  const lngTag = tags['GPSLongitude'];
  if (latTag && lngTag) {
    lat = dmsToDecimal(latTag);
    lng = dmsToDecimal(lngTag);
    if (lat !== null && refIs(tags['GPSLatitudeRef'], 'S')) lat = -lat;
    if (lng !== null && refIs(tags['GPSLongitudeRef'], 'W')) lng = -lng;
    if (lat === 0 && lng === 0) { lat = null; lng = null; }  // 0,0 是"未设置"哨兵值
  }

  if (takenAt === null && lat === null) return null;  // 啥都没抽到
  return { takenAt, lat, lng };
}

function parseExif(buffer) {
  let tags;
  try {
    tags = ExifReader.load(buffer);
  } catch (e) {
    return null;  // 不是图片 / 无 EXIF / 解析失败
  }
  if (!tags || Object.keys(tags).length === 0) return null;
  return parseTags(tags);
}

module.exports = { parseExif, parseTags };

// 自检
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  let pass = true;

  // ① uploads 真实图（截图/网图，预期 null，验证不崩）
  console.log('① uploads 真实图（预期 null）:');
  const dir = path.join(__dirname, 'uploads');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).slice(0, 3) : [];
  for (const f of files) {
    const r = parseExif(fs.readFileSync(path.join(dir, f)));
    console.log(`   ${f} → ${r ? JSON.stringify(r) : 'null ✓'}`);
  }

  // ② mock EXIF tags（上海坐标 d/m/s + 拍摄时间）→ 验证解析逻辑 + reverse-geocode 全链路
  console.log('\n② mock EXIF（上海 31°13\'49.44"N 121°28\'25.20"E + 2024-08-03 14:30:00）:');
  const r = parseTags({
    'DateTimeOriginal': { description: '2024:08:03 14:30:00' },
    'GPSLatitude':  { value: [[31, 1], [13, 1], [4944, 100]] },   // 31°13'49.44"
    'GPSLatitudeRef':  { value: 'N' },
    'GPSLongitude': { value: [[121, 1], [28, 1], [2520, 100]] },  // 121°28'25.20"
    'GPSLongitudeRef': { value: 'E' },
  });

  const expectTime = new Date('2024-08-03T14:30:00').getTime();
  if (r.takenAt !== expectTime) { console.log(`   ❌ 时间: ${r.takenAt} (期望 ${expectTime})`); pass = false; }
  else console.log('   ✅ 时间 → 2024-08-03 14:30:00');
  if (Math.abs(r.lat - 31.2304) > 0.001 || Math.abs(r.lng - 121.4737) > 0.001) {
    console.log(`   ❌ GPS: ${r.lat}, ${r.lng} (期望 ~31.2304, 121.4737)`); pass = false;
  } else console.log(`   ✅ GPS → ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`);

  const { reverseGeocode } = require('./reverse-geocode');
  const geo = reverseGeocode(r.lat, r.lng);
  if (!geo || geo.city !== '上海') { console.log(`   ❌ 反查: ${geo && geo.city} (期望 上海)`); pass = false; }
  else console.log(`   ✅ 反查 → ${geo.city}, ${geo.country}`);

  console.log(`\n${pass ? '全部通过 🎉' : '有失败'}`);
  process.exit(pass ? 0 : 1);
}

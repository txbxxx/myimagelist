/**
 * 认证 / 签名 URL 算法自检（不连数据库、不起服务器）
 * 跑法：node _auth_selftest.js
 * 复用与 index.js 相同的 HMAC 算法，验证：签发-验签一致 / 过期拒绝 / 篡改拒绝 / COS URL 不签 / 子目录 key
 */
const crypto = require('crypto');

const SECRET = 'test-secret-for-selftest-only';
const TTL = 3600;

function extractKey(s) { return decodeURIComponent(String(s).replace(/^\/uploads\//, '')); }
function sign(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  const key = extractKey(url);
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const sig = crypto.createHmac('sha256', SECRET).update(`${key}|${exp}`).digest('hex');
  return { key, exp, sig };
}
function verify(key, exp, sig, secret = SECRET) {
  if (!key || !exp || !sig) return false;
  if (Math.floor(Date.now() / 1000) > exp) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${key}|${exp}`).digest('hex');
  const sigBuf = Buffer.from(String(sig));
  if (sigBuf.length !== expected.length) return false;
  return crypto.timingSafeEqual(sigBuf, Buffer.from(expected));
}

let failed = 0;
function check(name, cond) { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) failed++; }

// ① 正常签发-验签
const s1 = sign('/uploads/abc.png');
check('① 正常签名验签通过', verify(s1.key, s1.exp, s1.sig));

// ② 过期拒绝
const expired = sign('/uploads/x.jpg');
expired.exp = Math.floor(Date.now() / 1000) - 10;
check('② 过期签名被拒', !verify(expired.key, expired.exp, expired.sig));

// ③ 篡改 sig / 错误密钥 拒绝
const s3 = sign('/uploads/y.mp4');
check('③ 篡改 sig 被拒', !verify(s3.key, s3.exp, s3.sig + 'x'));
const forged = crypto.createHmac('sha256', 'wrong-secret').update(`${s3.key}|${s3.exp}`).digest('hex');
check('③b 错误密钥签的 sig 被拒', !verify(s3.key, s3.exp, forged));

// ④ COS 公网 URL 不签（signUrlIfNeeded 应原样返回，不走 HMAC）
const cos = 'https://bucket-1250.cos.ap-guangzhou.myqcloud.com/gallery/a.png';
check('④ COS 公网 URL 不签名（原样返回）', sign(cos) === cos);

// ⑤ 子目录 key（thumbs/）
const s5 = sign('/uploads/thumbs/abc.jpg');
check('⑤ 子目录 key(thumbs/...) 提取+验签正确', s5.key === 'thumbs/abc.jpg' && verify(s5.key, s5.exp, s5.sig));

// ⑥ query 缺失拒绝
check('⑥ 缺少 sig 被拒', !verify(s1.key, s1.exp, ''));
check('⑥b 缺少 exp 被拒', !verify(s1.key, 0, s1.sig));

console.log(`\n${failed === 0 ? '全部通过 🎉' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);

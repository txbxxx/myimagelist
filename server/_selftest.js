/**
 * 修复回归自检（内存库，不碰真实 db.sqlite）
 * 跑法：node _selftest.js
 * 覆盖：①图片 user_id 链路（修复前 addImages 漏存 user_id 导致查不到）
 *      ②分类接口越权防护（userB 不能改/删 userA 的分类）
 */
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, created_at INTEGER);
  CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, color TEXT, user_id TEXT, created_at INTEGER);
  CREATE TABLE images (id TEXT PRIMARY KEY, filename TEXT, original_name TEXT, url TEXT,
                       size INTEGER, category_id TEXT, user_id TEXT, uploaded_at INTEGER);
`);

const uidA = 'u_A', uidB = 'u_B';
db.prepare("INSERT INTO users (id,username,password_hash,created_at) VALUES (?,?,?,1)").run(uidA, 'A', 'h');
db.prepare("INSERT INTO users (id,username,password_hash,created_at) VALUES (?,?,?,1)").run(uidB, 'B', 'h');
db.prepare("INSERT INTO categories (id,name,color,user_id,created_at) VALUES ('cat_A','A的分类','#FFF',?,1)").run(uidA);

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failed++;
}

// ① user_id 链路：修复后 INSERT 含 user_id，getImages 才查得到
const ins = db.prepare(
  'INSERT INTO images (id,filename,original_name,url,size,category_id,user_id,uploaded_at) VALUES (?,?,?,?,?,?,?,?)'
);
ins.run('img1', 'f1.png', '名1', '/uploads/f1.png', 100, 'cat_A', uidA, 1);
ins.run('img2', 'f2.png', '名2', '/uploads/f2.png', 100, 'cat_A', uidA, 2);
const listA = db.prepare('SELECT * FROM images WHERE user_id = ? ORDER BY uploaded_at DESC').all(uidA);
const listB = db.prepare('SELECT * FROM images WHERE user_id = ?').all(uidB);
check('userA 能查到自己的 2 张图（user_id 链路已修复）', listA.length === 2);
check('userB 查不到 userA 的图（用户隔离）', listB.length === 0);

// ② 越权防护：带 user_id 的 UPDATE/DELETE，跨用户 changes=0
const upd = db.prepare('UPDATE categories SET name=?, color=? WHERE id=? AND user_id=?');
check('userB 改 userA 分类被拒（changes=0）', upd.run('被改了', '#000', 'cat_A', uidB).changes === 0);
check('userA 改自己分类成功（changes=1）', upd.run('自己改', '#0F0', 'cat_A', uidA).changes === 1);
const del = db.prepare('DELETE FROM categories WHERE id=? AND user_id=?');
check('userB 删 userA 分类被拒（changes=0）', del.run('cat_A', uidB).changes === 0);

console.log(`\n${failed === 0 ? '全部通过 🎉' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * 关闭公开注册（REG_OPEN=false）后，用这个 CLI 建号：
 *   node _create-user.js <用户名> <密码>
 * 用户名 2-20 位字母/数字/下划线/中文；密码至少 6 位。
 */
const bcrypt = require('bcryptjs');
const db = require('./db');

async function main() {
  const [,, username, password] = process.argv;
  if (!username || !password) {
    console.error('用法: node _create-user.js <用户名> <密码>');
    console.error('  用户名：2-20 位字母/数字/下划线/中文');
    console.error('  密码：至少 6 位');
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_\\u4e00-\\u9fa5]{2,20}$/.test(username)) {
    console.error('❌ 用户名格式不合法（2-20 位字母/数字/下划线/中文）');
    process.exit(1);
  }
  if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
    console.error('❌ 密码至少 8 位，需含字母和数字');
    process.exit(1);
  }

  db.init();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = db.createUser({ username, passwordHash });
    db.ensureDefaultCategory(user.id);   // 给新用户补默认分类
    console.log(`✅ 创建成功：${user.username} (id: ${user.id})`);
  } catch (e) {
    if (e.code === 'DUPLICATE') console.error('❌ 用户名已存在');
    else console.error('❌', e.message);
    process.exit(1);
  }
}

main();

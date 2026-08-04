const {DatabaseSync} = require('node:sqlite');
const db = new DatabaseSync('db.sqlite');
console.log('tables:');
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
console.log('---users:');
console.log(db.prepare('SELECT * FROM users').all());
console.log('---categories:');
console.log(db.prepare('SELECT * FROM categories').all());

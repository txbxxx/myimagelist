const {DatabaseSync} = require('node:sqlite');
const db = new DatabaseSync('db.sqlite');
const cats = db.prepare('SELECT * FROM categories').all();
console.log('categories count:', cats.length);
cats.forEach(c => console.log(' -', c.id, c.name, 'user=', c.user_id));

const bcrypt = require('bcryptjs');
const hash = '$2b$10$KlzHH731fr0FF4Z95TwBqOYyXtyrqsJbPfmtRgDaMO1kK9e57BUVO';
console.log('test password "123456":', bcrypt.compareSync('123456', hash));
console.log('test password "12345":', bcrypt.compareSync('12345', hash));

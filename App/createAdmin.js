const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function createAdmin() {
  const name = 'Admin';
  const email = 'admin@ridesharing.com';
  const phone = '03001234567';
  const password = 'admin123';
  const role = 'admin';

  try {
    const [existing] = await db.query('SELECT UserID FROM USERS WHERE Email = ?', [email]);
    if (existing.length > 0) {
      console.log('Admin user already exists.');
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO USERS (Name, Email, Phone, Password, Role, CreatedAT) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, email, phone, hashed, role]
    );

    console.log(`Admin user created successfully. UserID: ${result.insertId}`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } catch (err) {
    console.error('Error creating admin user:', err.message);
  } finally {
    await db.end();
  }
}

createAdmin();

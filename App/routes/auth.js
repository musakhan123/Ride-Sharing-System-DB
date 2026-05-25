const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  if (!name || !email || !phone || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!['driver', 'passenger'].includes(role)) {
    return res.status(400).json({ error: 'Role must be driver or passenger' });
  }

  try {
    const [existing] = await db.query('SELECT UserID FROM USERS WHERE Email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO USERS (Name, Email, Phone, Password, Role, CreatedAT) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, email, phone, hashed, role]
    );

    res.status(201).json({ message: 'Registered successfully', userId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await db.query('SELECT * FROM USERS WHERE Email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.Password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = {
      UserID: user.UserID,
      Name: user.Name,
      Email: user.Email,
      Role: user.Role
    };

    res.json({ message: 'Logged in successfully', user: req.session.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ message: 'Logged out successfully' });
  });
});

module.exports = router;

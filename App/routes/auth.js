const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// GET /auth/register
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null });
});

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  const success = req.query.registered ? 'Account created successfully! Please login.' : null;
  res.render('login', { error: null, success });
});

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
    if (existing.length > 0) {
      return res.render('register', { error: 'An account with this email already exists.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO USERS (Name, Email, Phone, Password, Role, CreatedAT) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, email, phone, hashed, role]
    );

    res.redirect('/auth/login?registered=1');
  } catch (err) {
    res.render('register', { error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { error: 'Email and password are required.', success: null });
  }

  try {
    const [rows] = await db.query('SELECT * FROM USERS WHERE Email = ?', [email]);
    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid email or password.', success: null });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.Password);
    if (!match) {
      return res.render('login', { error: 'Invalid email or password.', success: null });
    }

    req.session.user = {
      UserID: user.UserID,
      Name: user.Name,
      Email: user.Email,
      Role: user.Role
    };

    res.redirect(user.Role === 'driver' ? '/driver/dashboard' : '/passenger/dashboard');
  } catch (err) {
    res.render('login', { error: 'Something went wrong. Please try again.', success: null });
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

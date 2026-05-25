const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { handleUpload } = require('../config/upload');

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

    if (user.Role === 'admin') return res.redirect('/admin/dashboard');
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

// GET /auth/verify-identity
router.get('/verify-identity', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const userId = req.session.user.UserID;
  try {
    const [rows] = await db.query(
      'SELECT * FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [userId]
    );
    res.render('verify-identity', {
      user: req.session.user,
      existing: rows[0] || null,
      error: null,
      success: null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /auth/verify-identity
router.post('/verify-identity', handleUpload('documentFile'), async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const { documentType, documentNumber } = req.body;
  const userId = req.session.user.UserID;
  const documentFile = req.file ? req.file.filename : null;

  const rerender = (error, success, existing) =>
    res.render('verify-identity', { user: req.session.user, existing: existing || null, error, success });

  if (req.uploadError) return rerender(req.uploadError, null, null);
  if (!documentType || !documentNumber) return rerender('Document type and number are required.', null, null);
  if (!documentFile) return rerender('Please upload a document file (JPG, PNG, or PDF).', null, null);
  if (!['CNIC', 'student_card', 'passport'].includes(documentType)) return rerender('Invalid document type.', null, null);

  try {
    const [existing] = await db.query(
      'SELECT * FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [userId]
    );
    if (existing.length > 0) {
      return rerender('You have already submitted a verification request.', null, existing[0]);
    }

    await db.query(
      `INSERT INTO IDENTITY_VERIFICATION (UserID, DocumentType, DocumentNumber, Status, SubmittedAt)
       VALUES (?, ?, ?, 'pending', NOW())`,
      [userId, documentType, documentNumber]
    );
    const [newRow] = await db.query(
      'SELECT * FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [userId]
    );
    return rerender(null, 'Verification submitted. Your documents are pending review.', newRow[0]);
  } catch (err) {
    console.error('[verify-identity] DB error:', err.message, '| code:', err.code);
    if (err.code === 'ER_DUP_ENTRY') {
      return rerender('This document number is already registered with another account.', null, null);
    }
    return rerender(`Something went wrong: ${err.message}`, null, null);
  }
});

module.exports = router;

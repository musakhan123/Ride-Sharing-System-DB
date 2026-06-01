const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const db       = require('../config/db');
const { requireLogin }                         = require('../config/middleware');
const { updateChecklist, getOrCreateChecklist } = require('../config/checklist');

// GET /profile
router.get('/', requireLogin, async (req, res) => {
  const userId = req.session.user.UserID;
  try {
    const [rows] = await db.query(
      'SELECT UserID, Name, Email, Phone, Role, CreatedAt FROM USERS WHERE UserID = ?',
      [userId]
    );
    if (rows.length === 0) return res.redirect('/auth/login');

    const checklist = await getOrCreateChecklist(userId);

    res.render('profile', {
      user:      req.session.user,
      profile:   rows[0],
      checklist,
      success:   req.query.success || null,
      error:     req.query.error   || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /profile/checklist — JSON
router.get('/checklist', requireLogin, async (req, res) => {
  try {
    const checklist = await getOrCreateChecklist(req.session.user.UserID);
    res.json(checklist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /profile/update — update Name and Phone
router.post('/update', requireLogin, async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.redirect('/profile?error=fields_required');

  const userId = req.session.user.UserID;
  try {
    await db.query(
      'UPDATE USERS SET Name = ?, Phone = ? WHERE UserID = ?',
      [name.trim(), phone.trim(), userId]
    );
    req.session.user.Name = name.trim();
    updateChecklist(userId).catch(e => console.error('[checklist]', e.message));
    res.redirect('/profile?success=profile_updated');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /profile/change-password
router.post('/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.redirect('/profile?error=fields_required');
  }
  if (newPassword !== confirmPassword) {
    return res.redirect('/profile?error=passwords_mismatch');
  }
  if (newPassword.length < 6) {
    return res.redirect('/profile?error=password_too_short');
  }

  try {
    const [rows] = await db.query(
      'SELECT Password FROM USERS WHERE UserID = ?',
      [req.session.user.UserID]
    );
    if (rows.length === 0) return res.redirect('/auth/login');

    const valid = await bcrypt.compare(currentPassword, rows[0].Password);
    if (!valid) return res.redirect('/profile?error=wrong_password');

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE USERS SET Password = ? WHERE UserID = ?',
      [hashed, req.session.user.UserID]
    );
    res.redirect('/profile?success=password_changed');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;

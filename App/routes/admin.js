const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireAdmin } = require('../config/middleware');

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session.user && req.session.user.Role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: null });
});

// POST /admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('admin/login', { error: 'Email and password are required.' });
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM USERS WHERE Email = ? AND Role = 'admin'",
      [email]
    );
    if (rows.length === 0) {
      return res.render('admin/login', { error: 'Invalid credentials.' });
    }

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.Password);
    if (!match) {
      return res.render('admin/login', { error: 'Invalid credentials.' });
    }

    req.session.user = {
      UserID: admin.UserID,
      Name: admin.Name,
      Email: admin.Email,
      Role: admin.Role
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    res.render('admin/login', { error: 'Something went wrong. Please try again.' });
  }
});

// GET /admin/dashboard
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [identityVerifications] = await db.query(
      `SELECT iv.*, u.Name AS UserName, u.Email
       FROM IDENTITY_VERIFICATION iv
       JOIN USERS u ON iv.UserID = u.UserID
       ORDER BY FIELD(iv.Status,'pending','verified','rejected'), iv.SubmittedAt DESC`
    );

    const [vehicleRegistrations] = await db.query(
      `SELECT vr.*, v.Make, v.Model, v.PlateNumber, v.Color,
              u.Name AS DriverName, u.Email AS DriverEmail
       FROM VEHICLE_REGISTRATION vr
       JOIN VEHICLES v ON vr.VehicleID = v.VehicleID
       JOIN USERS u ON v.DriverID = u.UserID
       ORDER BY FIELD(vr.Status,'pending','active','expired','suspended'), vr.RegistrationID DESC`
    );

    const [[{ totalUsers }]] = await db.query(
      "SELECT COUNT(*) AS totalUsers FROM USERS WHERE Role != 'admin'"
    );

    res.render('admin/dashboard', {
      user: req.session.user,
      identityVerifications,
      vehicleRegistrations,
      totalUsers
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /admin/verify/:id — approve or reject identity verification
router.post('/verify/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.redirect('/admin/dashboard');

  const status = action === 'approve' ? 'verified' : 'rejected';
  const rejectionReason = action === 'reject'
    ? (reason && reason.trim() ? reason.trim() : 'Documents did not meet requirements.')
    : null;

  try {
    await db.query(
      'UPDATE IDENTITY_VERIFICATION SET Status = ?, RejectionReason = ? WHERE VerificationID = ?',
      [status, rejectionReason, id]
    );
    res.redirect('/admin/dashboard#verifications');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /admin/vehicle/:id — approve or reject vehicle registration
router.post('/vehicle/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.redirect('/admin/dashboard');

  const status = action === 'approve' ? 'active' : 'suspended';
  try {
    await db.query(
      'UPDATE VEHICLE_REGISTRATION SET Status = ? WHERE RegistrationID = ?',
      [status, id]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;

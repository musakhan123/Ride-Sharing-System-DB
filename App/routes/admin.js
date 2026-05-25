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
    if (rows.length === 0) return res.render('admin/login', { error: 'Invalid credentials.' });
    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.Password);
    if (!match) return res.render('admin/login', { error: 'Invalid credentials.' });
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

// GET /admin/dashboard — show ALL records so admin can manage every status
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [identityVerifications] = await db.query(
      `SELECT iv.*, u.Name AS UserName, u.Email
       FROM IDENTITY_VERIFICATION iv
       JOIN USERS u ON iv.UserID = u.UserID
       ORDER BY
         CASE iv.Status
           WHEN 'pending'   THEN 1
           WHEN 'verified'  THEN 2
           WHEN 'suspended' THEN 3
           WHEN 'rejected'  THEN 4
           ELSE 5
         END,
         iv.SubmittedAt DESC`
    );

    const [vehicleRegistrations] = await db.query(
      `SELECT vr.RegistrationID, vr.VehicleID, vr.RegistrationNumber,
              vr.ExpiryDate, vr.DocumentFile, vr.Status,
              v.Make, v.Model, v.PlateNumber, v.Color,
              u.Name AS DriverName, u.Email AS DriverEmail
       FROM VEHICLE_REGISTRATION vr
       JOIN VEHICLES v ON vr.VehicleID = v.VehicleID
       JOIN USERS u    ON v.DriverID   = u.UserID
       ORDER BY
         CASE vr.Status
           WHEN 'pending'   THEN 1
           WHEN 'active'    THEN 2
           WHEN 'suspended' THEN 3
           WHEN 'rejected'  THEN 4
           WHEN 'expired'   THEN 5
           ELSE 6
         END,
         vr.RegistrationID DESC`
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

// POST /admin/verify/:id — approve | reject | suspend identity verification
router.post('/verify/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;

  const validActions = ['approve', 'reject', 'suspend'];
  if (!validActions.includes(action)) return res.redirect('/admin/dashboard');

  let status, rejectionReason;
  if (action === 'approve') {
    status = 'verified';
    rejectionReason = null;
  } else if (action === 'reject') {
    status = 'rejected';
    rejectionReason = (reason && reason.trim()) ? reason.trim() : 'Documents did not meet requirements.';
  } else {
    status = 'suspended';
    rejectionReason = null;
  }

  try {
    await db.query(
      'UPDATE IDENTITY_VERIFICATION SET Status = ?, RejectionReason = ? WHERE VerificationID = ?',
      [status, rejectionReason, id]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /admin/unsuspend-identity/:id — restore suspended identity to verified
router.post('/unsuspend-identity/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE IDENTITY_VERIFICATION SET Status = ?, RejectionReason = NULL WHERE VerificationID = ?',
      ['verified', id]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /admin/vehicle/:id — approve | reject | suspend vehicle registration
router.post('/vehicle/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  const validActions = ['approve', 'reject', 'suspend'];
  if (!validActions.includes(action)) return res.redirect('/admin/dashboard');

  const statusMap = { approve: 'active', reject: 'rejected', suspend: 'suspended' };
  const status = statusMap[action];

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

// POST /admin/unsuspend-vehicle/:id — restore suspended vehicle registration to active
router.post('/unsuspend-vehicle/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE VEHICLE_REGISTRATION SET Status = ? WHERE RegistrationID = ?',
      ['active', id]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin } = require('../config/middleware');

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

    res.render('admin-dashboard', {
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
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.redirect('/admin/dashboard');

  const status = action === 'approve' ? 'verified' : 'rejected';
  try {
    await db.query(
      'UPDATE IDENTITY_VERIFICATION SET Status = ? WHERE VerificationID = ?',
      [status, id]
    );
    res.redirect('/admin/dashboard');
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

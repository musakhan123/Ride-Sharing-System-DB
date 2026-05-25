const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../config/middleware');
const { handleUpload } = require('../config/upload');

// GET /driver/dashboard
router.get('/dashboard', requireRole('driver'), async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [rides] = await db.query(
      `SELECT r.RideID, r.DepartureTime, r.AvailableSeats, r.TotalSeats, r.Status,
              o.LocationName AS Origin, d.LocationName AS Destination
       FROM RIDES r
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       WHERE r.DriverID = ? ORDER BY r.DepartureTime DESC LIMIT 10`,
      [driverId]
    );
    const [vehicles] = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
    const [locations] = await db.query('SELECT * FROM LOCATIONS ORDER BY City, LocationName');

    const [identityRows] = await db.query(
      'SELECT * FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [driverId]
    );
    const identityVerification = identityRows[0] || null;

    const [vehicleRegs] = await db.query(
      `SELECT vr.* FROM VEHICLE_REGISTRATION vr
       JOIN VEHICLES v ON vr.VehicleID = v.VehicleID
       WHERE v.DriverID = ?`,
      [driverId]
    );

    const added      = req.query.added        === '1';
    const registered = req.query.registered   === '1';
    const ridePosted = req.query.ride_posted  === '1';
    const rideError  = req.query.ride_error   || null;

    res.render('driver-dashboard', {
      user: req.session.user,
      rides,
      vehicles,
      locations,
      identityVerification,
      vehicleRegs,
      added,
      registered,
      ridePosted,
      rideError
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /driver/add-vehicle
router.get('/add-vehicle', requireRole('driver'), (req, res) => {
  res.render('driver-add-vehicle', { user: req.session.user, error: null });
});

// POST /driver/add-vehicle
router.post('/add-vehicle', requireRole('driver'), async (req, res) => {
  const { make, model, color, plateNumber, seatingCapacity } = req.body;
  const driverId = req.session.user.UserID;

  if (!make || !model || !color || !plateNumber || !seatingCapacity) {
    return res.render('driver-add-vehicle', {
      user: req.session.user,
      error: 'All fields are required.'
    });
  }

  try {
    await db.query(
      'INSERT INTO VEHICLES (DriverID, Make, Model, Color, PlateNumber, SeatingCapacity) VALUES (?, ?, ?, ?, ?, ?)',
      [driverId, make, model, color, plateNumber, parseInt(seatingCapacity)]
    );
    res.redirect('/driver/dashboard?added=1');
  } catch (err) {
    const error = err.code === 'ER_DUP_ENTRY'
      ? 'A vehicle with that plate number already exists.'
      : `Something went wrong: ${err.message}`;
    res.render('driver-add-vehicle', { user: req.session.user, error });
  }
});

// GET /driver/register-vehicle/:vehicleID
router.get('/register-vehicle/:vehicleID', requireRole('driver'), async (req, res) => {
  const driverId  = req.session.user.UserID;
  const vehicleId = parseInt(req.params.vehicleID);

  try {
    const [vehicleRows] = await db.query(
      'SELECT * FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?',
      [vehicleId, driverId]
    );
    if (vehicleRows.length === 0) return res.redirect('/driver/dashboard');

    const [regRows] = await db.query(
      'SELECT * FROM VEHICLE_REGISTRATION WHERE VehicleID = ?',
      [vehicleId]
    );

    res.render('driver-register-vehicle', {
      user: req.session.user,
      vehicle: vehicleRows[0],
      existingReg: regRows[0] || null,
      error: null,
      success: null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /driver/register-vehicle/:vehicleID
router.post('/register-vehicle/:vehicleID', requireRole('driver'), handleUpload('registrationDoc'), async (req, res) => {
  const driverId  = req.session.user.UserID;
  const vehicleId = parseInt(req.params.vehicleID);
  const { registrationNumber, expiryDate } = req.body;
  const documentFile = req.file ? req.file.filename : null;

  const rerender = async (error, success) => {
    const [vehicleRows] = await db.query(
      'SELECT * FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?', [vehicleId, driverId]
    );
    const [regRows] = await db.query(
      'SELECT * FROM VEHICLE_REGISTRATION WHERE VehicleID = ?', [vehicleId]
    );
    res.render('driver-register-vehicle', {
      user: req.session.user,
      vehicle: vehicleRows[0] || null,
      existingReg: regRows[0] || null,
      error,
      success
    });
  };

  if (req.uploadError) return rerender(req.uploadError, null);
  if (!registrationNumber || !expiryDate) return rerender('Registration number and expiry date are required.', null);

  try {
    const [vehicleCheck] = await db.query(
      'SELECT VehicleID FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?',
      [vehicleId, driverId]
    );
    if (vehicleCheck.length === 0) return res.redirect('/driver/dashboard');

    const [existingReg] = await db.query(
      'SELECT RegistrationID, Status FROM VEHICLE_REGISTRATION WHERE VehicleID = ?',
      [vehicleId]
    );

    if (existingReg.length > 0 && !['suspended', 'rejected'].includes(existingReg[0].Status)) {
      return rerender('This vehicle already has a registration on file.', null);
    }

    if (existingReg.length > 0) {
      // Resubmit suspended or rejected registration
      await db.query(
        `UPDATE VEHICLE_REGISTRATION
         SET RegistrationNumber = ?, ExpiryDate = ?, DocumentFile = ?, Status = 'pending'
         WHERE RegistrationID = ?`,
        [registrationNumber, expiryDate, documentFile, existingReg[0].RegistrationID]
      );
    } else {
      await db.query(
        `INSERT INTO VEHICLE_REGISTRATION (VehicleID, RegistrationNumber, ExpiryDate, DocumentFile, Status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [vehicleId, registrationNumber, expiryDate, documentFile]
      );
    }

    res.redirect('/driver/dashboard?registered=1');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return rerender('That registration number is already in use.', null);
    }
    console.error('[register-vehicle] DB error:', err.message);
    return rerender(`Something went wrong: ${err.message}`, null);
  }
});

// POST /driver/rides — add a ride
router.post('/rides', requireRole('driver'), async (req, res) => {
  const { vehicleId, originId, destinationId, departureTime, totalSeats } = req.body;
  const driverId = req.session.user.UserID;

  if (!vehicleId || !originId || !destinationId || !departureTime || !totalSeats) {
    return res.redirect('/driver/dashboard?ride_error=missing_fields');
  }

  try {
    // Check identity verification status
    const [idRows] = await db.query(
      'SELECT Status FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [driverId]
    );
    if (idRows.length > 0 && idRows[0].Status === 'suspended') {
      return res.redirect('/driver/dashboard?ride_error=identity_suspended');
    }

    // Check vehicle ownership
    const [vehicle] = await db.query(
      'SELECT VehicleID FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?',
      [vehicleId, driverId]
    );
    if (vehicle.length === 0) return res.redirect('/driver/dashboard?ride_error=vehicle_not_found');

    // Check vehicle registration status
    const [regRows] = await db.query(
      'SELECT Status FROM VEHICLE_REGISTRATION WHERE VehicleID = ?',
      [vehicleId]
    );
    if (regRows.length > 0 && regRows[0].Status === 'suspended') {
      return res.redirect('/driver/dashboard?ride_error=vehicle_suspended');
    }
    if (regRows.length === 0 || regRows[0].Status !== 'active') {
      return res.redirect('/driver/dashboard?ride_error=vehicle_not_active');
    }

    await db.query(
      `INSERT INTO RIDES (DriverID, VehicleID, OriginID, DestinationID, DepartureTime, TotalSeats, AvailableSeats, Status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [driverId, vehicleId, originId, destinationId, departureTime, totalSeats, totalSeats]
    );
    res.redirect('/driver/dashboard?ride_posted=1');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /driver/rides — API: list my rides
router.get('/rides', requireRole('driver'), async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [rows] = await db.query(
      `SELECT r.RideID, r.DepartureTime, r.TotalSeats, r.AvailableSeats, r.Status,
              o.LocationName AS Origin, d.LocationName AS Destination,
              v.Make, v.Model, v.PlateNumber
       FROM RIDES r
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       WHERE r.DriverID = ? ORDER BY r.DepartureTime DESC`,
      [driverId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /driver/vehicles — API: list my vehicles
router.get('/vehicles', requireRole('driver'), async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [rows] = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

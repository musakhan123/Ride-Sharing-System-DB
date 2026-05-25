const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../config/middleware');

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

    res.render('driver-dashboard', {
      user: req.session.user,
      rides,
      vehicles,
      locations,
      identityVerification,
      vehicleRegs
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /driver/vehicle — add a vehicle
router.post('/vehicle', requireRole('driver'), async (req, res) => {
  const { make, model, color, plateNumber, seatingCapacity } = req.body;
  const driverId = req.session.user.UserID;

  if (!make || !model || !color || !plateNumber || !seatingCapacity) {
    return res.status(400).json({ error: 'All vehicle fields are required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO VEHICLES (DriverID, Make, Model, Color, PlateNumber, SeatingCapacity) VALUES (?, ?, ?, ?, ?, ?)',
      [driverId, make, model, color, plateNumber, seatingCapacity]
    );
    res.status(201).json({ message: 'Vehicle added', vehicleId: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Plate number already registered' });
    res.status(500).json({ error: err.message });
  }
});

// GET /driver/vehicles — list my vehicles
router.get('/vehicles', requireRole('driver'), async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [rows] = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /driver/rides — add a ride
router.post('/rides', requireRole('driver'), async (req, res) => {
  const { vehicleId, originId, destinationId, departureTime, totalSeats } = req.body;
  const driverId = req.session.user.UserID;

  if (!vehicleId || !originId || !destinationId || !departureTime || !totalSeats) {
    return res.status(400).json({ error: 'All ride fields are required' });
  }

  try {
    // Verify the vehicle belongs to this driver
    const [vehicle] = await db.query(
      'SELECT VehicleID FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?',
      [vehicleId, driverId]
    );
    if (vehicle.length === 0) return res.status(403).json({ error: 'Vehicle not found or not yours' });

    const [result] = await db.query(
      `INSERT INTO RIDES (DriverID, VehicleID, OriginID, DestinationID, DepartureTime, TotalSeats, AvailableSeats, Status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [driverId, vehicleId, originId, destinationId, departureTime, totalSeats, totalSeats]
    );
    res.status(201).json({ message: 'Ride created', rideId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /driver/register-vehicle
router.get('/register-vehicle', requireRole('driver'), async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [vehicles] = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
    const [regRows] = await db.query(
      `SELECT vr.VehicleID FROM VEHICLE_REGISTRATION vr
       JOIN VEHICLES v ON vr.VehicleID = v.VehicleID
       WHERE v.DriverID = ?`,
      [driverId]
    );
    const registeredIds = regRows.map(r => r.VehicleID);
    res.render('driver-register-vehicle', {
      user: req.session.user,
      vehicles,
      registeredIds,
      error: null,
      success: null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /driver/register-vehicle
router.post('/register-vehicle', requireRole('driver'), async (req, res) => {
  const { vehicleId, registrationNumber, expiryDate } = req.body;
  const driverId = req.session.user.UserID;

  const loadFormData = async () => {
    const [vehicles] = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
    const [regRows] = await db.query(
      `SELECT vr.VehicleID FROM VEHICLE_REGISTRATION vr
       JOIN VEHICLES v ON vr.VehicleID = v.VehicleID
       WHERE v.DriverID = ?`,
      [driverId]
    );
    return { vehicles, registeredIds: regRows.map(r => r.VehicleID) };
  };

  const rerender = async (error, success) => {
    const { vehicles, registeredIds } = await loadFormData();
    res.render('driver-register-vehicle', { user: req.session.user, vehicles, registeredIds, error, success });
  };

  try {
    if (!vehicleId || !registrationNumber || !expiryDate) {
      return rerender('All fields are required.', null);
    }

    const [vehicleCheck] = await db.query(
      'SELECT VehicleID FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?',
      [vehicleId, driverId]
    );
    if (vehicleCheck.length === 0) {
      return rerender('Vehicle not found or does not belong to you.', null);
    }

    const [existingReg] = await db.query(
      'SELECT RegistrationID FROM VEHICLE_REGISTRATION WHERE VehicleID = ?',
      [vehicleId]
    );
    if (existingReg.length > 0) {
      return rerender('This vehicle already has a registration on file.', null);
    }

    await db.query(
      `INSERT INTO VEHICLE_REGISTRATION (VehicleID, RegistrationNumber, ExpiryDate, Status)
       VALUES (?, ?, ?, 'pending')`,
      [vehicleId, registrationNumber, expiryDate]
    );
    return rerender(null, 'Registration submitted. Pending admin approval.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return rerender('That registration number is already in use.', null);
    }
    res.status(500).send(err.message);
  }
});

// GET /driver/rides — view my rides
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
       WHERE r.DriverID = ?
       ORDER BY r.DepartureTime DESC`,
      [driverId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

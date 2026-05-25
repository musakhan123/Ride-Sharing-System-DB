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
    res.render('driver-dashboard', { user: req.session.user, rides, vehicles, locations });
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

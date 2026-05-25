const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../config/middleware');

// GET /passenger/rides/search?originId=&destinationId=
router.get('/rides/search', requireRole('passenger'), async (req, res) => {
  const { originId, destinationId } = req.query;

  if (!originId || !destinationId) {
    return res.status(400).json({ error: 'originId and destinationId are required' });
  }

  try {
    const [rows] = await db.query(
      `SELECT r.RideID, r.DepartureTime, r.AvailableSeats, r.Status,
              o.LocationName AS Origin, d.LocationName AS Destination,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.Color, v.PlateNumber
       FROM RIDES r
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       WHERE r.OriginID = ? AND r.DestinationID = ?
         AND r.Status = 'active' AND r.AvailableSeats > 0
       ORDER BY r.DepartureTime ASC`,
      [originId, destinationId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /passenger/rides/:id/book — book a ride
router.post('/rides/:id/book', requireRole('passenger'), async (req, res) => {
  const rideId = req.params.id;
  const passengerId = req.session.user.UserID;

  try {
    const [rides] = await db.query(
      "SELECT * FROM RIDES WHERE RideID = ? AND Status = 'active' AND AvailableSeats > 0",
      [rideId]
    );
    if (rides.length === 0) {
      return res.status(404).json({ error: 'Ride not available' });
    }

    // Prevent double-booking the same ride
    const [existing] = await db.query(
      "SELECT BookingID FROM BOOKINGS WHERE RideID = ? AND PassengerID = ? AND Status = 'confirmed'",
      [rideId, passengerId]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'Already booked this ride' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [booking] = await conn.query(
        "INSERT INTO BOOKINGS (RideID, PassengerID, BookingTime, Status) VALUES (?, ?, NOW(), 'confirmed')",
        [rideId, passengerId]
      );
      await conn.query(
        'UPDATE RIDES SET AvailableSeats = AvailableSeats - 1 WHERE RideID = ?',
        [rideId]
      );

      await conn.commit();
      res.status(201).json({ message: 'Ride booked successfully', bookingId: booking.insertId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /passenger/bookings — view my bookings
router.get('/bookings', requireRole('passenger'), async (req, res) => {
  const passengerId = req.session.user.UserID;
  try {
    const [rows] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.Status AS BookingStatus,
              r.DepartureTime, r.Status AS RideStatus,
              o.LocationName AS Origin, d.LocationName AS Destination,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.PlateNumber
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       WHERE b.PassengerID = ?
       ORDER BY b.BookingTime DESC`,
      [passengerId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /passenger/bookings/:id/cancel — cancel a booking
router.post('/bookings/:id/cancel', requireRole('passenger'), async (req, res) => {
  const bookingId = req.params.id;
  const passengerId = req.session.user.UserID;

  try {
    const [bookings] = await db.query(
      "SELECT * FROM BOOKINGS WHERE BookingID = ? AND PassengerID = ? AND Status = 'confirmed'",
      [bookingId, passengerId]
    );
    if (bookings.length === 0) return res.status(404).json({ error: 'Active booking not found' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE BOOKINGS SET Status = 'cancelled' WHERE BookingID = ?", [bookingId]);
      await conn.query(
        'UPDATE RIDES SET AvailableSeats = AvailableSeats + 1 WHERE RideID = ?',
        [bookings[0].RideID]
      );
      await conn.commit();
      res.json({ message: 'Booking cancelled' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

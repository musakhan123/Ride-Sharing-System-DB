const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireLogin, requireRole } = require('../config/middleware');

// GET /reviews — render reviews page
router.get('/', requireLogin, async (req, res) => {
  try {
    const [reviews] = await db.query(
      `SELECT rv.ReviewID, rv.Rating, rv.Comment, rv.ReviewDate,
              u.Name AS PassengerName, d.Name AS DriverName,
              o.LocationName AS Origin, dest.LocationName AS Destination
       FROM REVIEWS rv
       JOIN USERS u ON rv.PassengerID = u.UserID
       JOIN USERS d ON rv.DriverID = d.UserID
       JOIN RIDES r ON rv.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS dest ON r.DestinationID = dest.LocationID
       ORDER BY rv.ReviewDate DESC`
    );
    res.render('reviews', { user: req.session.user, reviews });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /reviews — add a review (passenger only)
router.post('/', requireRole('passenger'), async (req, res) => {
  const { rideId, rating, comment } = req.body;
  const passengerId = req.session.user.UserID;

  if (!rideId || !rating) return res.status(400).json({ error: 'rideId and rating are required' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  try {
    // Verify passenger completed this ride
    const [bookings] = await db.query(
      "SELECT b.BookingID, r.DriverID FROM BOOKINGS b JOIN RIDES r ON b.RideID = r.RideID WHERE b.RideID = ? AND b.PassengerID = ? AND b.Status = 'confirmed'",
      [rideId, passengerId]
    );
    if (bookings.length === 0) {
      return res.status(403).json({ error: 'You can only review rides you have booked' });
    }

    // Prevent duplicate reviews
    const [existing] = await db.query(
      'SELECT ReviewID FROM REVIEWS WHERE RideID = ? AND PassengerID = ?',
      [rideId, passengerId]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'You already reviewed this ride' });

    const driverId = bookings[0].DriverID;
    const [result] = await db.query(
      'INSERT INTO REVIEWS (RideID, PassengerID, DriverID, Rating, Comment, ReviewDate) VALUES (?, ?, ?, ?, ?, NOW())',
      [rideId, passengerId, driverId, rating, comment || null]
    );

    res.status(201).json({ message: 'Review submitted', reviewId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reviews/driver/:driverId — view all reviews for a driver
router.get('/driver/:driverId', requireLogin, async (req, res) => {
  const { driverId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT rv.ReviewID, rv.Rating, rv.Comment, rv.ReviewDate,
              u.Name AS PassengerName,
              r.DepartureTime,
              o.LocationName AS Origin, d.LocationName AS Destination
       FROM REVIEWS rv
       JOIN USERS u ON rv.PassengerID = u.UserID
       JOIN RIDES r ON rv.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       WHERE rv.DriverID = ?
       ORDER BY rv.ReviewDate DESC`,
      [driverId]
    );

    const [avg] = await db.query(
      'SELECT ROUND(AVG(Rating), 2) AS AverageRating, COUNT(*) AS TotalReviews FROM REVIEWS WHERE DriverID = ?',
      [driverId]
    );

    res.json({ stats: avg[0], reviews: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reviews/ride/:rideId — view reviews for a specific ride
router.get('/ride/:rideId', requireLogin, async (req, res) => {
  const { rideId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT rv.ReviewID, rv.Rating, rv.Comment, rv.ReviewDate,
              u.Name AS PassengerName
       FROM REVIEWS rv
       JOIN USERS u ON rv.PassengerID = u.UserID
       WHERE rv.RideID = ?
       ORDER BY rv.ReviewDate DESC`,
      [rideId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

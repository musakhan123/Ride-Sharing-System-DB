const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isPassenger } = require('../config/middleware');
const { emitToUser }     = require('../config/socket');
const { updateChecklist } = require('../config/checklist');

// ── GET /passenger/dashboard ──────────────────────────────────────────────
router.get('/dashboard', isPassenger, async (req, res) => {
  const passengerId = req.session.user.UserID;
  try {
    const [bookings] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.Status AS BookingStatus, b.FareStatus,
              r.DepartureTime, r.Status AS RideStatus,
              o.LocationName AS Origin, d.LocationName AS Destination,
              u.Name AS DriverName
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       WHERE b.PassengerID = ? ORDER BY b.BookingTime DESC LIMIT 5`,
      [passengerId]
    );

    const [pendingFares] = await db.query(
      `SELECT b.BookingID, b.ProposedFare, b.DriverFare, b.FareStatus, b.BookingTime,
              r.DepartureTime,
              o.LocationName AS Origin, d.LocationName AS Destination,
              u.Name AS DriverName
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       WHERE b.PassengerID = ? AND b.Status = 'pending'
       ORDER BY b.BookingTime DESC`,
      [passengerId]
    );

    const [locations] = await db.query('SELECT * FROM LOCATIONS ORDER BY City, LocationName');

    res.render('passenger-dashboard', {
      user:          req.session.user,
      bookings,
      pendingFares,
      locations,
      bookingError:  req.query.error        || null,
      fareProposed:  req.query.fare_proposed === '1',
      fareRejected:  req.query.fare_rejected === '1'
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/search-rides — primary AJAX search endpoint ────────────
router.get('/search-rides', isPassenger, async (req, res) => {
  const { originID, destinationID } = req.query;
  if (!originID || !destinationID) {
    return res.json({ rides: [] });
  }
  try {
    const [rides] = await db.query(
      `SELECT R.RideID, R.AvailableSeats, R.TotalSeats, R.DepartureTime, R.Status,
              L1.LocationName AS OriginName, L2.LocationName AS DestinationName,
              U.Name AS DriverName, U.UserID AS DriverID,
              V.Make, V.Model, V.Color, V.PlateNumber
       FROM RIDES R
       JOIN LOCATIONS L1 ON R.OriginID  = L1.LocationID
       JOIN LOCATIONS L2 ON R.DestinationID = L2.LocationID
       JOIN USERS U ON R.DriverID = U.UserID
       JOIN VEHICLES V ON R.VehicleID = V.VehicleID
       WHERE R.OriginID = ? AND R.DestinationID = ?
         AND R.Status = 'active' AND R.AvailableSeats > 0
       ORDER BY R.DepartureTime ASC`,
      [originID, destinationID]
    );
    return res.json({ rides });
  } catch (err) {
    console.error('Search rides error:', err);
    return res.status(500).json({ error: 'Database error', rides: [] });
  }
});

// ── POST /passenger/book-ride/:rideID ────────────────────────────────────
router.post('/book-ride/:rideID', isPassenger, async (req, res) => {
  const rideId      = parseInt(req.params.rideID);
  const passengerId = req.session.user.UserID;
  const proposedFare = parseFloat(req.body.proposedFare);

  if (isNaN(proposedFare) || proposedFare <= 0) {
    return res.redirect('/passenger/dashboard?error=invalid_fare');
  }

  try {
    const [rides] = await db.query(
      `SELECT R.*, L1.LocationName AS Origin, L2.LocationName AS Destination
       FROM RIDES R
       JOIN LOCATIONS L1 ON R.OriginID = L1.LocationID
       JOIN LOCATIONS L2 ON R.DestinationID = L2.LocationID
       WHERE R.RideID = ? AND R.Status = 'active' AND R.AvailableSeats > 0`,
      [rideId]
    );
    if (rides.length === 0) return res.redirect('/passenger/dashboard?error=ride_unavailable');

    const [existing] = await db.query(
      "SELECT BookingID FROM BOOKINGS WHERE RideID = ? AND PassengerID = ? AND Status IN ('pending','confirmed')",
      [rideId, passengerId]
    );
    if (existing.length > 0) return res.redirect('/passenger/dashboard?error=already_booked');

    const [result] = await db.query(
      "INSERT INTO BOOKINGS (RideID, PassengerID, BookingTime, Status, ProposedFare, FareStatus) VALUES (?, ?, NOW(), 'pending', ?, 'proposed')",
      [rideId, passengerId, proposedFare]
    );
    const bookingId = result.insertId;

    emitToUser(rides[0].DriverID, 'new-fare-request', {
      bookingId,
      passengerName: req.session.user.Name,
      proposedFare,
      origin:        rides[0].Origin,
      destination:   rides[0].Destination,
      departureTime: rides[0].DepartureTime
    });

    res.redirect('/passenger/dashboard?fare_proposed=1');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/fare-response/:bookingID ───────────────────────────────
router.get('/fare-response/:bookingID', isPassenger, async (req, res) => {
  const bookingId   = parseInt(req.params.bookingID);
  const passengerId = req.session.user.UserID;

  try {
    const [rows] = await db.query(
      `SELECT b.BookingID, b.ProposedFare, b.DriverFare, b.FareStatus, b.Status AS BookingStatus, b.BookingTime,
              r.RideID, r.DepartureTime,
              o.LocationName AS Origin, o.City AS OriginCity,
              d.LocationName AS Destination, d.City AS DestinationCity,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.PlateNumber
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       WHERE b.BookingID = ? AND b.PassengerID = ?`,
      [bookingId, passengerId]
    );
    if (rows.length === 0) return res.redirect('/passenger/dashboard');

    res.render('fare-response', { user: req.session.user, booking: rows[0] });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── POST /passenger/fare-accept/:bookingID ────────────────────────────────
router.post('/fare-accept/:bookingID', isPassenger, async (req, res) => {
  const bookingId   = parseInt(req.params.bookingID);
  const passengerId = req.session.user.UserID;
  const { action }  = req.body;

  console.log('[fare-accept] Role:', req.session.user.Role);
  console.log('[fare-accept] UserID:', req.session.user.UserID);
  console.log('[fare-accept] action:', action);
  console.log('[fare-accept] bookingId:', bookingId);

  try {
    const [rows] = await db.query(
      `SELECT b.*, r.RideID, r.AvailableSeats, r.DriverID FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       WHERE b.BookingID = ? AND b.PassengerID = ? AND b.FareStatus = 'countered' AND b.Status = 'pending'`,
      [bookingId, passengerId]
    );
    if (rows.length === 0) {
      console.log('[fare-accept] booking not found → redirect /passenger/my-bookings');
      return res.redirect('/passenger/my-bookings');
    }

    const booking = rows[0];

    if (action === 'accept') {
      if (booking.AvailableSeats <= 0) {
        console.log('[fare-accept] no seats → redirect /passenger/my-bookings?error=ride_full');
        return res.redirect('/passenger/my-bookings?error=ride_full');
      }
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "UPDATE BOOKINGS SET Status='confirmed', FareStatus='approved', ProposedFare=DriverFare WHERE BookingID=?",
          [bookingId]
        );
        await conn.query('UPDATE RIDES SET AvailableSeats = AvailableSeats - 1 WHERE RideID = ?', [booking.RideID]);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      emitToUser(booking.DriverID, 'fare-accepted', {
        bookingId,
        driverFare:    booking.DriverFare,
        passengerName: req.session.user.Name
      });
      console.log(`[fare-accept] accept OK → redirect /passenger/payment/${bookingId}`);
      return res.redirect(`/passenger/payment/${bookingId}`);

    } else if (action === 'reject') {
      await db.query(
        "UPDATE BOOKINGS SET Status='cancelled', FareStatus='rejected' WHERE BookingID=?",
        [bookingId]
      );
      emitToUser(booking.DriverID, 'fare-rejected', { bookingId });
      console.log('[fare-accept] reject OK → redirect /passenger/dashboard?fare_rejected=1');
      return res.redirect('/passenger/dashboard?fare_rejected=1');
    }

    console.log('[fare-accept] unknown action → redirect /passenger/my-bookings');
    res.redirect('/passenger/my-bookings');
  } catch (err) {
    console.error('[fare-accept] ERROR:', err.message);
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/payment/:bookingID ────────────────────────────────────
router.get('/payment/:bookingID', isPassenger, async (req, res) => {
  const bookingId   = parseInt(req.params.bookingID);
  const passengerId = req.session.user.UserID;

  try {
    const [rows] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.Status AS BookingStatus, b.ProposedFare,
              r.RideID, r.DepartureTime,
              o.LocationName AS Origin, o.City AS OriginCity,
              d.LocationName AS Destination, d.City AS DestinationCity,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.Color, v.PlateNumber
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       WHERE b.BookingID = ? AND b.PassengerID = ?`,
      [bookingId, passengerId]
    );
    if (rows.length === 0) return res.redirect('/passenger/dashboard');

    const [payments] = await db.query(
      "SELECT * FROM PAYMENTS WHERE BookingID = ? AND Status = 'completed'",
      [bookingId]
    );
    if (payments.length > 0) return res.redirect(`/passenger/confirmation/${bookingId}`);

    res.render('payment', {
      user:    req.session.user,
      booking: rows[0],
      error:   req.query.error || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── POST /passenger/payment/:bookingID ───────────────────────────────────
router.post('/payment/:bookingID', isPassenger, async (req, res) => {
  const bookingId   = parseInt(req.params.bookingID);
  const passengerId = req.session.user.UserID;
  const { amount, method } = req.body;

  const parsedAmount = parseFloat(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0 || !['cash', 'online'].includes(method)) {
    return res.redirect(`/passenger/payment/${bookingId}?error=invalid_input`);
  }

  try {
    const [bookingRows] = await db.query(
      "SELECT BookingID, ProposedFare FROM BOOKINGS WHERE BookingID = ? AND PassengerID = ? AND Status = 'confirmed'",
      [bookingId, passengerId]
    );
    if (bookingRows.length === 0) return res.redirect('/passenger/dashboard');

    const agreedFare = parseFloat(bookingRows[0].ProposedFare);
    if (!isNaN(agreedFare) && Math.abs(parsedAmount - agreedFare) > 0.01) {
      return res.redirect(`/passenger/payment/${bookingId}?error=amount_mismatch`);
    }

    const [existingPayment] = await db.query(
      "SELECT PaymentID FROM PAYMENTS WHERE BookingID = ? AND Status = 'completed'",
      [bookingId]
    );
    if (existingPayment.length > 0) return res.redirect(`/passenger/confirmation/${bookingId}`);

    await db.query(
      "INSERT INTO PAYMENTS (BookingID, Amount, Method, Status, PaymentDate) VALUES (?, ?, ?, 'completed', NOW())",
      [bookingId, parsedAmount, method]
    );
    updateChecklist(passengerId).catch(e => console.error('[checklist]', e.message));
    res.redirect(`/passenger/confirmation/${bookingId}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/confirmation/:bookingID ────────────────────────────────
router.get('/confirmation/:bookingID', isPassenger, async (req, res) => {
  const bookingId   = parseInt(req.params.bookingID);
  const passengerId = req.session.user.UserID;

  try {
    const [rows] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.Status AS BookingStatus,
              r.RideID, r.DepartureTime,
              o.LocationName AS Origin, o.City AS OriginCity,
              d.LocationName AS Destination, d.City AS DestinationCity,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.Color, v.PlateNumber,
              p.PaymentID, p.Amount, p.Method, p.Status AS PaymentStatus, p.PaymentDate
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       LEFT JOIN PAYMENTS p ON b.BookingID = p.BookingID
       WHERE b.BookingID = ? AND b.PassengerID = ?`,
      [bookingId, passengerId]
    );
    if (rows.length === 0) return res.redirect('/passenger/dashboard');

    res.render('confirmation', { user: req.session.user, booking: rows[0] });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/my-bookings ────────────────────────────────────────────
router.get('/my-bookings', isPassenger, async (req, res) => {
  const passengerId = req.session.user.UserID;
  try {
    const [bookings] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.Status AS BookingStatus,
              b.ProposedFare, b.DriverFare, b.FareStatus,
              r.RideID, r.DepartureTime, r.Status AS RideStatus,
              o.LocationName AS Origin, o.City AS OriginCity,
              d.LocationName AS Destination, d.City AS DestinationCity,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.PlateNumber,
              p.PaymentID, p.Amount, p.Method, p.Status AS PaymentStatus, p.PaymentDate
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       JOIN VEHICLES v ON r.VehicleID = v.VehicleID
       LEFT JOIN PAYMENTS p ON b.BookingID = p.BookingID
       WHERE b.PassengerID = ?
       ORDER BY b.BookingTime DESC`,
      [passengerId]
    );
    res.render('my-bookings', {
      user:      req.session.user,
      bookings,
      cancelled: req.query.cancelled === '1',
      error:     req.query.error || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── POST /passenger/cancel-booking/:bookingID ─────────────────────────────
router.post('/cancel-booking/:bookingID', isPassenger, async (req, res) => {
  const bookingId   = parseInt(req.params.bookingID);
  const passengerId = req.session.user.UserID;

  try {
    const [bookings] = await db.query(
      "SELECT * FROM BOOKINGS WHERE BookingID = ? AND PassengerID = ? AND Status IN ('pending','confirmed')",
      [bookingId, passengerId]
    );
    if (bookings.length === 0) return res.redirect('/passenger/my-bookings?error=not_found');

    const booking = bookings[0];
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE BOOKINGS SET Status = 'cancelled' WHERE BookingID = ?", [bookingId]);
      if (booking.Status === 'confirmed') {
        await conn.query('UPDATE RIDES SET AvailableSeats = AvailableSeats + 1 WHERE RideID = ?', [booking.RideID]);
      }
      await conn.query(
        "UPDATE PAYMENTS SET Status = 'failed' WHERE BookingID = ? AND Status = 'completed'",
        [bookingId]
      );
      await conn.commit();
      updateChecklist(passengerId).catch(e => console.error('[checklist]', e.message));
      res.redirect('/passenger/my-bookings?cancelled=1');
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/ride-history ───────────────────────────────────────────
router.get('/ride-history', isPassenger, async (req, res) => {
  const passengerId = req.session.user.UserID;
  try {
    const [bookings] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.Status AS BookingStatus,
              b.ProposedFare, b.DriverFare, b.FareStatus,
              r.RideID, r.DepartureTime, r.Status AS RideStatus,
              o.LocationName AS Origin,      o.City AS OriginCity,
              d.LocationName AS Destination, d.City AS DestinationCity,
              u.Name AS DriverName, u.Phone AS DriverPhone,
              v.Make, v.Model, v.PlateNumber,
              p.Amount, p.Method, p.Status AS PaymentStatus, p.PaymentDate,
              (SELECT COUNT(*) FROM REVIEWS rv
               WHERE rv.RideID = r.RideID AND rv.PassengerID = b.PassengerID) AS HasReviewed
       FROM BOOKINGS b
       JOIN RIDES r     ON b.RideID      = r.RideID
       JOIN LOCATIONS o ON r.OriginID    = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u     ON r.DriverID    = u.UserID
       JOIN VEHICLES v  ON r.VehicleID   = v.VehicleID
       LEFT JOIN PAYMENTS p ON b.BookingID = p.BookingID
       WHERE b.PassengerID = ? AND b.Status IN ('completed', 'cancelled')
       ORDER BY b.BookingTime DESC`,
      [passengerId]
    );
    res.render('ride-history-passenger', { user: req.session.user, bookings });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── GET /passenger/reviews ────────────────────────────────────────────────
router.get('/reviews', isPassenger, async (req, res) => {
  const passengerId = req.session.user.UserID;
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
    const [eligibleRides] = await db.query(
      `SELECT b.BookingID, r.RideID, r.DepartureTime,
              o.LocationName AS Origin, d.LocationName AS Destination,
              u.Name AS DriverName
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS u ON r.DriverID = u.UserID
       WHERE b.PassengerID = ? AND b.Status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM REVIEWS rv
           WHERE rv.RideID = r.RideID AND rv.PassengerID = b.PassengerID
         )
       ORDER BY r.DepartureTime DESC`,
      [passengerId]
    );
    res.render('reviews', {
      user: req.session.user,
      reviews,
      eligibleRides,
      submitted: req.query.submitted === '1',
      reviewError: req.query.error || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});


module.exports = router;

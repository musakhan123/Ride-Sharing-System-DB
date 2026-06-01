const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isDriver } = require('../config/middleware');
const { handleUpload } = require('../config/upload');
const { emitToUser }          = require('../config/socket');
const { updateChecklist, getOrCreateChecklist } = require('../config/checklist');

// GET /driver/dashboard
router.get('/dashboard', isDriver, async (req, res) => {
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
    const [vehicles]  = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
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

    const [fareCountRows] = await db.query(
      `SELECT COUNT(*) AS count FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       WHERE r.DriverID = ? AND b.FareStatus = 'proposed' AND b.Status = 'pending'`,
      [driverId]
    );
    const pendingFareCount = fareCountRows[0].count;
    await updateChecklist(driverId);
    const checklist = await getOrCreateChecklist(driverId);

    res.render('driver-dashboard', {
      user: req.session.user,
      rides,
      vehicles,
      locations,
      identityVerification,
      vehicleRegs,
      pendingFareCount,
      checklist,
      added:         req.query.added          === '1',
      registered:    req.query.registered     === '1',
      ridePosted:    req.query.ride_posted    === '1',
      idSubmitted:   req.query.id_submitted   === '1',
      rideCompleted: req.query.ride_completed === '1',
      rideError:     req.query.ride_error     || null,
      vehicleError:  req.query.vehicle_error  || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /driver/add-vehicle
router.get('/add-vehicle', isDriver, async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [idRows] = await db.query(
      'SELECT Status FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [driverId]
    );
    const idStatus = idRows[0]?.Status || null;

    if (idStatus === 'suspended') return res.redirect('/driver/dashboard?vehicle_error=identity_suspended');
    if (idStatus !== 'verified')  return res.redirect('/driver/dashboard?vehicle_error=identity_not_verified');

    res.render('driver-add-vehicle', { user: req.session.user, error: null });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /driver/add-vehicle
router.post('/add-vehicle', isDriver, async (req, res) => {
  const { make, model, color, plateNumber, seatingCapacity } = req.body;
  const driverId = req.session.user.UserID;

  if (!make || !model || !color || !plateNumber || !seatingCapacity) {
    return res.render('driver-add-vehicle', { user: req.session.user, error: 'All fields are required.' });
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
router.get('/register-vehicle/:vehicleID', isDriver, async (req, res) => {
  const driverId  = req.session.user.UserID;
  const vehicleId = parseInt(req.params.vehicleID);

  try {
    const [vehicleRows] = await db.query(
      'SELECT * FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?',
      [vehicleId, driverId]
    );
    if (vehicleRows.length === 0) return res.redirect('/driver/dashboard');

    const [regRows] = await db.query('SELECT * FROM VEHICLE_REGISTRATION WHERE VehicleID = ?', [vehicleId]);

    res.render('driver-register-vehicle', {
      user:        req.session.user,
      vehicle:     vehicleRows[0],
      existingReg: regRows[0] || null,
      error:       null,
      success:     null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /driver/register-vehicle/:vehicleID
router.post('/register-vehicle/:vehicleID', isDriver, handleUpload('registrationDoc'), async (req, res) => {
  const driverId  = req.session.user.UserID;
  const vehicleId = parseInt(req.params.vehicleID);
  const { registrationNumber, expiryDate } = req.body;
  const documentFile = req.file ? req.file.filename : null;

  const rerender = async (error, success) => {
    const [vehicleRows] = await db.query(
      'SELECT * FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?', [vehicleId, driverId]
    );
    const [regRows] = await db.query('SELECT * FROM VEHICLE_REGISTRATION WHERE VehicleID = ?', [vehicleId]);
    res.render('driver-register-vehicle', {
      user: req.session.user, vehicle: vehicleRows[0] || null,
      existingReg: regRows[0] || null, error, success
    });
  };

  if (req.uploadError) return rerender(req.uploadError, null);
  if (!registrationNumber || !expiryDate) return rerender('Registration number and expiry date are required.', null);

  try {
    const [vehicleCheck] = await db.query(
      'SELECT VehicleID FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?', [vehicleId, driverId]
    );
    if (vehicleCheck.length === 0) return res.redirect('/driver/dashboard');

    const [existingReg] = await db.query(
      'SELECT RegistrationID, Status FROM VEHICLE_REGISTRATION WHERE VehicleID = ?', [vehicleId]
    );

    if (existingReg.length > 0 && !['suspended', 'rejected'].includes(existingReg[0].Status)) {
      return rerender('This vehicle already has a registration on file.', null);
    }

    if (existingReg.length > 0) {
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
    if (err.code === 'ER_DUP_ENTRY') return rerender('That registration number is already in use.', null);
    console.error('[register-vehicle] DB error:', err.message);
    return rerender(`Something went wrong: ${err.message}`, null);
  }
});

// POST /driver/rides
router.post('/rides', isDriver, async (req, res) => {
  const { vehicleId, originId, destinationId, departureTime, totalSeats } = req.body;
  const driverId = req.session.user.UserID;

  if (!vehicleId || !originId || !destinationId || !departureTime || !totalSeats) {
    return res.redirect('/driver/dashboard?ride_error=missing_fields');
  }

  try {
    const [idRows] = await db.query(
      'SELECT Status FROM IDENTITY_VERIFICATION WHERE UserID = ? ORDER BY SubmittedAt DESC LIMIT 1',
      [driverId]
    );
    const idStatus = idRows[0]?.Status || null;
    if (idStatus === 'suspended') return res.redirect('/driver/dashboard?ride_error=identity_suspended');
    if (idStatus !== 'verified')  return res.redirect('/driver/dashboard?ride_error=identity_not_verified');

    const [vehicle] = await db.query(
      'SELECT VehicleID FROM VEHICLES WHERE VehicleID = ? AND DriverID = ?', [vehicleId, driverId]
    );
    if (vehicle.length === 0) return res.redirect('/driver/dashboard?ride_error=vehicle_not_found');

    const [regRows] = await db.query(
      'SELECT Status FROM VEHICLE_REGISTRATION WHERE VehicleID = ?', [vehicleId]
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

// GET /driver/fare-requests
router.get('/fare-requests', isDriver, async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [fareRequests] = await db.query(
      `SELECT b.BookingID, b.BookingTime, b.ProposedFare, b.FareStatus,
              r.RideID, r.DepartureTime, r.AvailableSeats,
              o.LocationName AS Origin, o.City AS OriginCity,
              d.LocationName AS Destination, d.City AS DestinationCity,
              p.Name AS PassengerName, p.Phone AS PassengerPhone
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN USERS p ON b.PassengerID = p.UserID
       WHERE r.DriverID = ? AND b.FareStatus = 'proposed' AND b.Status = 'pending'
       ORDER BY b.BookingTime ASC`,
      [driverId]
    );
    res.render('fare-requests', {
      user: req.session.user,
      fareRequests,
      success: req.query.success || null,
      error:   req.query.error   || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST /driver/fare-response/:bookingID
router.post('/fare-response/:bookingID', isDriver, async (req, res) => {
  const bookingId = parseInt(req.params.bookingID);
  const driverId  = req.session.user.UserID;
  const { action, counterFare } = req.body;

  try {
    const [rows] = await db.query(
      `SELECT b.*, r.RideID, r.AvailableSeats, r.DepartureTime,
              o.LocationName AS Origin, d.LocationName AS Destination
       FROM BOOKINGS b
       JOIN RIDES r ON b.RideID = r.RideID
       JOIN LOCATIONS o ON r.OriginID = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       WHERE b.BookingID = ? AND r.DriverID = ? AND b.FareStatus = 'proposed' AND b.Status = 'pending'`,
      [bookingId, driverId]
    );
    if (rows.length === 0) return res.redirect('/driver/fare-requests?error=not_found');

    const booking = rows[0];

    if (action === 'approve') {
      if (booking.AvailableSeats <= 0) return res.redirect('/driver/fare-requests?error=ride_full');
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "UPDATE BOOKINGS SET Status='confirmed', FareStatus='approved' WHERE BookingID=?",
          [bookingId]
        );
        await conn.query('UPDATE RIDES SET AvailableSeats = AvailableSeats - 1 WHERE RideID=?', [booking.RideID]);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      emitToUser(booking.PassengerID, 'fare-approved', {
        bookingId,
        proposedFare: booking.ProposedFare,
        driverName:   req.session.user.Name
      });
      return res.redirect('/driver/fare-requests?success=approved');

    } else if (action === 'reject') {
      await db.query(
        "UPDATE BOOKINGS SET Status='cancelled', FareStatus='rejected' WHERE BookingID=?",
        [bookingId]
      );
      emitToUser(booking.PassengerID, 'fare-rejected', { bookingId });
      return res.redirect('/driver/fare-requests?success=rejected');

    } else if (action === 'counter') {
      const fare = parseFloat(counterFare);
      if (isNaN(fare) || fare <= 0) return res.redirect('/driver/fare-requests?error=invalid_fare');
      await db.query(
        "UPDATE BOOKINGS SET FareStatus='countered', DriverFare=? WHERE BookingID=?",
        [fare, bookingId]
      );
      emitToUser(booking.PassengerID, 'fare-counter', {
        bookingId,
        driverFare:    fare,
        driverName:    req.session.user.Name,
        origin:        booking.Origin,
        destination:   booking.Destination,
        departureTime: booking.DepartureTime
      });
      return res.redirect('/driver/fare-requests?success=countered');
    }

    res.redirect('/driver/fare-requests');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /driver/rides — JSON API
router.get('/rides', isDriver, async (req, res) => {
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

// GET /driver/vehicles — JSON API
router.get('/vehicles', isDriver, async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [rows] = await db.query('SELECT * FROM VEHICLES WHERE DriverID = ?', [driverId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /driver/complete-ride/:rideID
router.post('/complete-ride/:rideID', isDriver, async (req, res) => {
  const rideId   = parseInt(req.params.rideID);
  const driverId = req.session.user.UserID;

  try {
    const [rides] = await db.query(
      "SELECT RideID FROM RIDES WHERE RideID = ? AND DriverID = ? AND Status = 'active'",
      [rideId, driverId]
    );
    if (rides.length === 0) return res.redirect('/driver/ride-history?error=not_found');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE RIDES SET Status = 'completed' WHERE RideID = ?", [rideId]);
      await conn.query(
        "UPDATE BOOKINGS SET Status = 'completed' WHERE RideID = ? AND Status = 'confirmed'",
        [rideId]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    res.redirect('/driver/ride-history?completed=1');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /driver/ride-history
router.get('/ride-history', isDriver, async (req, res) => {
  const driverId = req.session.user.UserID;
  try {
    const [rides] = await db.query(
      `SELECT r.RideID, r.DepartureTime, r.TotalSeats, r.AvailableSeats, r.Status,
              o.LocationName AS Origin, d.LocationName AS Destination,
              v.Make, v.Model, v.PlateNumber,
              COUNT(b.BookingID)                                              AS TotalBookings,
              SUM(b.Status = 'confirmed')                                     AS ConfirmedBookings,
              SUM(b.Status = 'completed')                                     AS CompletedBookings,
              SUM(b.Status = 'cancelled')                                     AS CancelledBookings
       FROM RIDES r
       JOIN LOCATIONS o ON r.OriginID      = o.LocationID
       JOIN LOCATIONS d ON r.DestinationID = d.LocationID
       JOIN VEHICLES  v ON r.VehicleID     = v.VehicleID
       LEFT JOIN BOOKINGS b ON r.RideID   = b.RideID
       WHERE r.DriverID = ?
       GROUP BY r.RideID, r.DepartureTime, r.TotalSeats, r.AvailableSeats, r.Status,
                o.LocationName, d.LocationName, v.Make, v.Model, v.PlateNumber
       ORDER BY r.DepartureTime DESC`,
      [driverId]
    );
    res.render('ride-history-driver', {
      user:      req.session.user,
      rides,
      completed: req.query.completed === '1',
      error:     req.query.error    || null
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;

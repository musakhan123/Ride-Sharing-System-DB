const db = require('./db');

async function updateChecklist(userID) {
  const [
    [[ivRow]],
    [[vrRow]],
    [[userRow]],
    [[psRow]]
  ] = await Promise.all([
    db.query(
      "SELECT COUNT(*) AS cnt FROM IDENTITY_VERIFICATION WHERE UserID = ? AND Status = 'verified'",
      [userID]
    ),
    db.query(
      `SELECT COUNT(*) AS cnt
       FROM VEHICLE_REGISTRATION vreg
       JOIN VEHICLES v ON vreg.VehicleID = v.VehicleID
       WHERE v.DriverID = ? AND vreg.Status = 'active'`,
      [userID]
    ),
    db.query(
      'SELECT Name, Email, Phone FROM USERS WHERE UserID = ?',
      [userID]
    ),
    db.query(
      `SELECT COUNT(*) AS cnt
       FROM PAYMENTS p
       JOIN BOOKINGS b ON p.BookingID = b.BookingID
       WHERE b.PassengerID = ? AND p.Status = 'completed'`,
      [userID]
    )
  ]);

  const identityVerified  = Number(ivRow.cnt)  > 0 ? 1 : 0;
  const vehicleRegistered = Number(vrRow.cnt)  > 0 ? 1 : 0;
  const profileCompleted  = (
    userRow &&
    userRow.Name  && userRow.Name.trim()  &&
    userRow.Email && userRow.Email.trim() &&
    userRow.Phone && userRow.Phone.trim()
  ) ? 1 : 0;
  const paymentSetup = Number(psRow.cnt) > 0 ? 1 : 0;

  const [existing] = await db.query(
    'SELECT CheckListID FROM VERIFICATION_CHECKLIST WHERE UserID = ?',
    [userID]
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE VERIFICATION_CHECKLIST
       SET IdentityVerified = ?, VehicleRegistered = ?, ProfileCompleted = ?, PaymentSetup = ?, UpdatedAt = NOW()
       WHERE UserID = ?`,
      [identityVerified, vehicleRegistered, profileCompleted, paymentSetup, userID]
    );
  } else {
    await db.query(
      `INSERT INTO VERIFICATION_CHECKLIST
         (UserID, IdentityVerified, VehicleRegistered, ProfileCompleted, PaymentSetup, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userID, identityVerified, vehicleRegistered, profileCompleted, paymentSetup]
    );
  }
}

async function getOrCreateChecklist(userID) {
  let [rows] = await db.query(
    'SELECT * FROM VERIFICATION_CHECKLIST WHERE UserID = ?',
    [userID]
  );
  if (rows.length === 0) {
    await db.query(
      `INSERT INTO VERIFICATION_CHECKLIST
         (UserID, IdentityVerified, VehicleRegistered, ProfileCompleted, PaymentSetup, UpdatedAt)
       VALUES (?, 0, 0, 0, 0, NOW())`,
      [userID]
    );
    [rows] = await db.query(
      'SELECT * FROM VERIFICATION_CHECKLIST WHERE UserID = ?',
      [userID]
    );
  }
  return rows[0];
}

module.exports = { updateChecklist, getOrCreateChecklist };

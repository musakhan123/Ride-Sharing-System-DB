const db = require('./db');

async function updateChecklist(userID) {
  try {
    const results = await Promise.all([
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

    const [ivRows] = results[0];
    const [vrRows] = results[1];
    const [userRows] = results[2];
    const [psRows] = results[3];

    const ivRow = ivRows && ivRows[0] ? ivRows[0] : { cnt: 0 };
    const vrRow = vrRows && vrRows[0] ? vrRows[0] : { cnt: 0 };
    const userRow = userRows && userRows[0] ? userRows[0] : null;
    const psRow = psRows && psRows[0] ? psRows[0] : { cnt: 0 };

    const identityVerified = Number(ivRow.cnt) > 0 ? 1 : 0;
    const vehicleRegistered = Number(vrRow.cnt) > 0 ? 1 : 0;
    const profileCompleted = (
      userRow &&
      userRow.Name && userRow.Name.trim() &&
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
  } catch (error) {
    console.error(`Error updating checklist for UserID ${userID}:`, error.message);
    throw error;
  }
}

async function getOrCreateChecklist(userID) {
  try {
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
      await updateChecklist(userID);
      [rows] = await db.query(
        'SELECT * FROM VERIFICATION_CHECKLIST WHERE UserID = ?',
        [userID]
      );
    }
    return rows[0];
  } catch (error) {
    console.error(`Error getting/creating checklist for UserID ${userID}:`, error.message);
    throw error;
  }
}

module.exports = { updateChecklist, getOrCreateChecklist };


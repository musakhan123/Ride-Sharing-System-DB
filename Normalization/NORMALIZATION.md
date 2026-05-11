# Normalization — Ride Sharing System
## Database: mydb | Version: 1.1 | Date: 11-05-2026

This document presents the normalization analysis for all 10 tables in the Ride Sharing System database. Each table is evaluated against First Normal Form (1NF), Second Normal Form (2NF), and Third Normal Form (3NF). Where a table already satisfies a normal form, a written justification is provided explaining why no change was needed.

---

## 1. USERS

**1NF:** The USERS table is in First Normal Form. All columns contain atomic values — each column stores a single value per row. There are no repeating groups or multi-valued attributes. UserID serves as the unique primary key.

**2NF:** The USERS table is in Second Normal Form. It has a single-column primary key (UserID), therefore partial dependency is not possible. All non-key attributes (Name, Email, Phone, Password, Role, CreatedAT) are fully dependent on UserID.

**3NF:** The USERS table is in Third Normal Form. No non-key column depends on another non-key column. Every attribute (Name, Email, Phone, Password, Role, CreatedAT) depends directly and only on UserID. No transitive dependencies exist.

**Changes Made:** None. The table already satisfies 1NF, 2NF, and 3NF.

---

## 2. VEHICLES

**1NF:** All columns are atomic with single values per row. VehicleID is the unique primary key. No repeating groups exist.

**2NF:** Single-column primary key (VehicleID), so partial dependency is not possible. All attributes fully depend on VehicleID.

**3NF:** No transitive dependencies. Make, Model, Color, PlateNumber, and SeatingCapacity all depend directly on VehicleID, not on each other.

**Changes Made:** None.

---

## 3. LOCATIONS

**1NF:** All columns (LocationName, Area, City) are atomic. LocationID is the unique primary key.

**2NF:** Single-column primary key (LocationID), partial dependency not applicable.

**3NF:** Area and City could be argued as dependent on each other in the real world, but in this system they are treated as independent attributes of a location, both depending directly on LocationID. No transitive dependency exists within the defined schema.

**Changes Made:** None.

---

## 4. RIDES

**1NF:** All columns are atomic. RideID is the unique primary key. No multi-valued attributes exist.

**2NF:** Single-column primary key (RideID), partial dependency not applicable. All attributes including DriverID, VehicleID, OriginID, DestinationID, DepartureTime, TotalSeats, AvailableSeats, and Status fully depend on RideID.

**3NF:** No non-key column depends on another non-key column. AvailableSeats could theoretically be derived from TotalSeats minus booked seats, but it is stored explicitly for performance purposes and depends on RideID directly. No transitive dependencies exist.

**Changes Made:** None.

---

## 5. BOOKINGS

**1NF:** All columns are atomic. BookingID is the unique primary key. No repeating groups exist.

**2NF:** Single-column primary key (BookingID), partial dependency not applicable. RideID, PassengerID, BookingTime, and Status all fully depend on BookingID.

**3NF:** No transitive dependencies. Status depends on the booking itself (BookingID), not on RideID or PassengerID.

**Changes Made:** None.

---

## 6. REVIEWS

**1NF:** All columns are atomic. ReviewID is the unique primary key. Rating, Comment, and ReviewDate are single-valued per row.

**2NF:** Single-column primary key (ReviewID), partial dependency not applicable. All attributes fully depend on ReviewID.

**3NF:** No non-key column depends on another non-key column. DriverID and PassengerID both reference USERS but depend on ReviewID, not on each other.

**Changes Made:** None.

---

## 7. PAYMENTS

**1NF:** All columns are atomic. PaymentID is the unique primary key. No repeating groups exist.

**2NF:** Single-column primary key (PaymentID), partial dependency not applicable. All attributes fully depend on PaymentID.

**3NF:** No transitive dependencies. Amount, Method, Status, and PaymentDate all depend directly on PaymentID, not on BookingID or each other.

**Changes Made:** None.

---

## 8. IDENTITY_VERIFICATION

**1NF:** All columns are atomic. VerificationID is the unique primary key. DocumentType and DocumentNumber are single-valued per row.

**2NF:** Single-column primary key (VerificationID), partial dependency not applicable.

**3NF:** No transitive dependencies. DocumentNumber does not determine any other column — all attributes depend directly on VerificationID.

**Changes Made:** None.

---

## 9. VEHICLE_REGISTRATION

**1NF:** All columns are atomic. RegistrationID is the unique primary key. No multi-valued attributes exist.

**2NF:** Single-column primary key (RegistrationID), partial dependency not applicable.

**3NF:** No transitive dependencies. ExpiryDate and Status depend on the registration record itself (RegistrationID), not on VehicleID or RegistrationNumber.

**Changes Made:** None.

---

## 10. VERIFICATION_CHECKLIST

**1NF:** All columns are atomic. CheckListID is the unique primary key. Each checklist item (IdentityVerified, VehicleRegistered, ProfileCompleted, PaymentSetup) is stored as a separate column with a single value.

**2NF:** Single-column primary key (CheckListID), partial dependency not applicable.

**3NF:** No transitive dependencies. All checklist columns depend directly on CheckListID and not on each other or on UserID.

**Changes Made:** None.

---

*End of Normalization Document — Ride Sharing System*

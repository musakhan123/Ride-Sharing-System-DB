-- ============================================================
-- Ride Sharing System — incremental migrations
-- Run once against the live ridesharing database
-- ============================================================
USE `ridesharing`;

-- 1. Add 'admin' to the USERS Role enum
ALTER TABLE `USERS`
  MODIFY COLUMN `Role` ENUM('driver', 'passenger', 'admin') NOT NULL;

-- 2. Add document file path column to IDENTITY_VERIFICATION
ALTER TABLE `IDENTITY_VERIFICATION`
  ADD COLUMN `DocumentFile` VARCHAR(255) NULL AFTER `DocumentNumber`;

-- 3. Add rejection reason column to IDENTITY_VERIFICATION
ALTER TABLE `IDENTITY_VERIFICATION`
  ADD COLUMN `RejectionReason` VARCHAR(500) NULL AFTER `DocumentFile`;

-- 5. Add 'pending' as the new default status for VEHICLE_REGISTRATION
--    and add document file path column
ALTER TABLE `VEHICLE_REGISTRATION`
  MODIFY COLUMN `Status` ENUM('pending', 'active', 'expired', 'suspended') NOT NULL DEFAULT 'pending';
ALTER TABLE `VEHICLE_REGISTRATION`
  ADD COLUMN `DocumentFile` VARCHAR(255) NULL AFTER `ExpiryDate`;

-- 6. Add 'suspended' to IDENTITY_VERIFICATION Status enum
ALTER TABLE `IDENTITY_VERIFICATION`
  MODIFY COLUMN `Status` ENUM('pending', 'verified', 'rejected', 'suspended') NOT NULL DEFAULT 'pending';

-- 7. Add 'rejected' to VEHICLE_REGISTRATION Status enum
ALTER TABLE `VEHICLE_REGISTRATION`
  MODIFY COLUMN `Status` ENUM('pending', 'active', 'expired', 'suspended', 'rejected') NOT NULL DEFAULT 'pending';

-- 8. Create an admin account
--    Generate a bcrypt hash first:
--      node -e "require('bcryptjs').hash('admin123', 10).then(h => console.log(h))"
--    Then replace <HASH> below and uncomment:
-- INSERT INTO USERS (Name, Email, Phone, Password, Role, CreatedAT)
-- VALUES ('Administrator', 'admin@ridesharing.com', '0300-0000000', '<HASH>', 'admin', NOW());

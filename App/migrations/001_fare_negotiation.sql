-- Run this against your ridesharing database before starting the app
USE `ridesharing`;

ALTER TABLE `BOOKINGS`
  MODIFY COLUMN `Status` ENUM('pending', 'confirmed', 'cancelled') NULL DEFAULT 'pending',
  ADD COLUMN `ProposedFare` DECIMAL(10,2) NULL AFTER `Status`,
  ADD COLUMN `DriverFare`   DECIMAL(10,2) NULL AFTER `ProposedFare`,
  ADD COLUMN `FareStatus`   ENUM('proposed', 'approved', 'rejected', 'countered') NULL AFTER `DriverFare`;

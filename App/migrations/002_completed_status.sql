-- Run against ridesharingdb before starting the app
USE `ridesharing`;

-- Add 'completed' to BOOKINGS status enum
ALTER TABLE `BOOKINGS`
  MODIFY COLUMN `Status` ENUM('pending', 'confirmed', 'cancelled', 'completed') NULL DEFAULT 'pending';

-- Add CreatedAt to USERS if missing (safe to run even if column exists)
ALTER TABLE `USERS`
  ADD COLUMN IF NOT EXISTS `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

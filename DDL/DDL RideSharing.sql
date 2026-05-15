DROP DATABASE IF EXISTS `ridesharing`;
CREATE DATABASE IF NOT EXISTS `ridesharing`;
USE `ridesharing`;

-- -----------------------------------------------------
-- Table `ridesharing`.`USERS`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`USERS` (
  `UserID` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(100) NOT NULL,
  `Email` VARCHAR(100) NOT NULL,
  `Phone` VARCHAR(15) NOT NULL,
  `Password` VARCHAR(255) NOT NULL,
  `Role` ENUM('driver', 'passenger') NOT NULL,
  `CreatedAT` DATETIME NULL,
  PRIMARY KEY (`UserID`),
  UNIQUE INDEX `Email_UNIQUE` (`Email` ASC) VISIBLE
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`VEHICLES`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`VEHICLES` (
  `VehicleID` INT NOT NULL AUTO_INCREMENT,
  `DriverID` INT NOT NULL,
  `Make` VARCHAR(100) NOT NULL,
  `Model` VARCHAR(100) NOT NULL,
  `Color` VARCHAR(50) NOT NULL,
  `PlateNumber` VARCHAR(20) NOT NULL,
  `SeatingCapacity` INT NOT NULL,
  PRIMARY KEY (`VehicleID`),
  UNIQUE INDEX `PlateNumber_UNIQUE` (`PlateNumber` ASC) VISIBLE,
  INDEX `VEHICLES_DriverID_idx` (`DriverID` ASC) VISIBLE,
  CONSTRAINT `VEHICLES_DriverID`
    FOREIGN KEY (`DriverID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`LOCATIONS`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`LOCATIONS` (
  `LocationID` INT NOT NULL AUTO_INCREMENT,
  `LocationName` VARCHAR(150) NOT NULL,
  `Area` VARCHAR(100) NOT NULL,
  `City` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`LocationID`)
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`RIDES`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`RIDES` (
  `RideID` INT NOT NULL AUTO_INCREMENT,
  `DriverID` INT NOT NULL,
  `VehicleID` INT NOT NULL,
  `OriginID` INT NOT NULL,
  `DestinationID` INT NOT NULL,
  `DepartureTime` DATETIME NOT NULL,
  `TotalSeats` INT NOT NULL,
  `AvailableSeats` INT NOT NULL,
  `Status` ENUM('active', 'completed', 'cancelled') NULL,
  PRIMARY KEY (`RideID`),
  INDEX `RIDES_DriverID_idx` (`DriverID` ASC) VISIBLE,
  INDEX `RIDES_VehicleID_idx` (`VehicleID` ASC) VISIBLE,
  INDEX `RIDES_OriginID_idx` (`OriginID` ASC) VISIBLE,
  INDEX `RIDES_DestinationID_idx` (`DestinationID` ASC) VISIBLE,
  CONSTRAINT `RIDES_DriverID`
    FOREIGN KEY (`DriverID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `RIDES_VehicleID`
    FOREIGN KEY (`VehicleID`)
    REFERENCES `ridesharing`.`VEHICLES` (`VehicleID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `RIDES_OriginID`
    FOREIGN KEY (`OriginID`)
    REFERENCES `ridesharing`.`LOCATIONS` (`LocationID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `RIDES_DestinationID`
    FOREIGN KEY (`DestinationID`)
    REFERENCES `ridesharing`.`LOCATIONS` (`LocationID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`BOOKINGS`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`BOOKINGS` (
  `BookingID` INT NOT NULL AUTO_INCREMENT,
  `RideID` INT NOT NULL,
  `PassengerID` INT NOT NULL,
  `BookingTime` DATETIME NULL,
  `Status` ENUM('confirmed', 'cancelled') NULL,
  PRIMARY KEY (`BookingID`),
  INDEX `BOOKINGS_RideID_idx` (`RideID` ASC) VISIBLE,
  INDEX `BOOKINGS_PassengerID_idx` (`PassengerID` ASC) VISIBLE,
  CONSTRAINT `BOOKINGS_RideID`
    FOREIGN KEY (`RideID`)
    REFERENCES `ridesharing`.`RIDES` (`RideID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `BOOKINGS_PassengerID`
    FOREIGN KEY (`PassengerID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`REVIEWS`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`REVIEWS` (
  `ReviewID` INT NOT NULL AUTO_INCREMENT,
  `RideID` INT NOT NULL,
  `PassengerID` INT NOT NULL,
  `DriverID` INT NOT NULL,
  `Rating` INT NOT NULL,
  `Comment` TEXT NULL,
  `ReviewDate` DATETIME NULL,
  PRIMARY KEY (`ReviewID`),
  INDEX `REVIEWS_RideID_idx` (`RideID` ASC) VISIBLE,
  INDEX `REVIEWS_PassengerID_idx` (`PassengerID` ASC) VISIBLE,
  INDEX `REVIEWS_DriverID_idx` (`DriverID` ASC) VISIBLE,
  CONSTRAINT `REVIEWS_RideID`
    FOREIGN KEY (`RideID`)
    REFERENCES `ridesharing`.`RIDES` (`RideID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `REVIEWS_PassengerID`
    FOREIGN KEY (`PassengerID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `REVIEWS_DriverID`
    FOREIGN KEY (`DriverID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`PAYMENTS`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`PAYMENTS` (
  `PaymentID` INT NOT NULL AUTO_INCREMENT,
  `BookingID` INT NOT NULL,
  `Amount` DECIMAL(10,2) NOT NULL,
  `Method` ENUM('cash', 'online') NOT NULL,
  `Status` ENUM('pending', 'completed', 'failed') NULL DEFAULT 'pending',
  `PaymentDate` DATETIME NULL DEFAULT NOW(),
  PRIMARY KEY (`PaymentID`),
  INDEX `PAYMENTS_BookingID_idx` (`BookingID` ASC) VISIBLE,
  CONSTRAINT `PAYMENTS_BookingID`
    FOREIGN KEY (`BookingID`)
    REFERENCES `ridesharing`.`BOOKINGS` (`BookingID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`IDENTITY_VERIFICATION`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`IDENTITY_VERIFICATION` (
  `VerificationID` INT NOT NULL AUTO_INCREMENT,
  `UserID` INT NOT NULL,
  `DocumentType` ENUM('CNIC', 'student_card', 'passport') NOT NULL,
  `DocumentNumber` VARCHAR(50) NOT NULL,
  `Status` ENUM('pending', 'verified', 'rejected') NULL DEFAULT 'pending',
  `SubmittedAt` DATETIME NULL DEFAULT NOW(),
  PRIMARY KEY (`VerificationID`),
  UNIQUE INDEX `DocumentNumber_UNIQUE` (`DocumentNumber` ASC) VISIBLE,
  INDEX `IDVERIFY_UserID_idx` (`UserID` ASC) VISIBLE,
  CONSTRAINT `IDVERIFY_UserID`
    FOREIGN KEY (`UserID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`VEHICLE_REGISTRATION`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`VEHICLE_REGISTRATION` (
  `RegistrationID` INT NOT NULL AUTO_INCREMENT,
  `VehicleID` INT NOT NULL,
  `RegistrationNumber` VARCHAR(50) NOT NULL,
  `ExpiryDate` DATE NOT NULL,
  `Status` ENUM('active', 'expired', 'suspended') NULL DEFAULT 'active',
  PRIMARY KEY (`RegistrationID`),
  UNIQUE INDEX `RegistrationNumber_UNIQUE` (`RegistrationNumber` ASC) VISIBLE,
  INDEX `VEHREG_VehicleID_idx` (`VehicleID` ASC) VISIBLE,
  CONSTRAINT `VEHREG_VehicleID`
    FOREIGN KEY (`VehicleID`)
    REFERENCES `ridesharing`.`VEHICLES` (`VehicleID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `ridesharing`.`VERIFICATION_CHECKLIST`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ridesharing`.`VERIFICATION_CHECKLIST` (
  `CheckListID` INT NOT NULL AUTO_INCREMENT,
  `UserID` INT NOT NULL,
  `IdentityVerified` TINYINT NULL DEFAULT 0,
  `VehicleRegistered` TINYINT NULL DEFAULT 0,
  `ProfileCompleted` TINYINT NULL DEFAULT 0,
  `PaymentSetup` TINYINT NULL DEFAULT 0,
  `UpdatedAt` DATETIME NULL DEFAULT NOW(),
  PRIMARY KEY (`CheckListID`),
  INDEX `CHECKLIST_UserID_idx` (`UserID` ASC) VISIBLE,
  CONSTRAINT `CHECKLIST_UserID`
    FOREIGN KEY (`UserID`)
    REFERENCES `ridesharing`.`USERS` (`UserID`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE = InnoDB;
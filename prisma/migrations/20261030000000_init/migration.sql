-- CreateTable
CREATE TABLE `Apartment` (
    `apartment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `block` VARCHAR(10) NOT NULL,
    `floor_no` INTEGER NOT NULL,
    `flat_no` VARCHAR(10) NOT NULL,
    `bhk` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Apartment_block_flat_no_key`(`block`, `flat_no`),
    PRIMARY KEY (`apartment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Resident` (
    `resident_id` INTEGER NOT NULL AUTO_INCREMENT,
    `apartment_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(15) NULL,
    `email` VARCHAR(100) NULL,
    `resident_type` ENUM('OWNER', 'TENANT') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Resident_phone_key`(`phone`),
    UNIQUE INDEX `Resident_email_key`(`email`),
    INDEX `Resident_apartment_id_idx`(`apartment_id`),
    PRIMARY KEY (`resident_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Staff` (
    `staff_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `phone` VARCHAR(15) NULL,
    `salary` DECIMAL(10, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Staff_phone_key`(`phone`),
    INDEX `Staff_role_idx`(`role`),
    PRIMARY KEY (`staff_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParkingSpace` (
    `parking_id` INTEGER NOT NULL AUTO_INCREMENT,
    `apartment_id` INTEGER NULL,
    `slot_number` VARCHAR(10) NOT NULL,
    `vehicle_type` ENUM('CAR', 'BIKE') NOT NULL,
    `status` ENUM('ALLOCATED', 'AVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ParkingSpace_slot_number_key`(`slot_number`),
    INDEX `ParkingSpace_apartment_id_idx`(`apartment_id`),
    INDEX `ParkingSpace_status_idx`(`status`),
    PRIMARY KEY (`parking_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vehicle` (
    `vehicle_id` INTEGER NOT NULL AUTO_INCREMENT,
    `resident_id` INTEGER NOT NULL,
    `parking_id` INTEGER NULL,
    `vehicle_number` VARCHAR(20) NOT NULL,
    `vehicle_type` ENUM('CAR', 'BIKE') NOT NULL,
    `brand` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vehicle_parking_id_key`(`parking_id`),
    UNIQUE INDEX `Vehicle_vehicle_number_key`(`vehicle_number`),
    INDEX `Vehicle_resident_id_idx`(`resident_id`),
    PRIMARY KEY (`vehicle_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaintenancePayment` (
    `payment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `apartment_id` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `payment_month` VARCHAR(20) NOT NULL,
    `payment_date` DATE NULL,
    `status` ENUM('PAID', 'PENDING') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `MaintenancePayment_status_idx`(`status`),
    UNIQUE INDEX `MaintenancePayment_apartment_id_payment_month_key`(`apartment_id`, `payment_month`),
    PRIMARY KEY (`payment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `complaint_id` INTEGER NOT NULL AUTO_INCREMENT,
    `resident_id` INTEGER NOT NULL,
    `staff_id` INTEGER NULL,
    `category` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    `complaint_date` DATE NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Complaint_resident_id_idx`(`resident_id`),
    INDEX `Complaint_staff_id_idx`(`staff_id`),
    INDEX `Complaint_status_idx`(`status`),
    PRIMARY KEY (`complaint_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAccount` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,
    `role` ENUM('ADMIN', 'RESIDENT', 'MAINTENANCE', 'SECURITY') NOT NULL,
    `resident_id` INTEGER NULL,
    `staff_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAccount_username_key`(`username`),
    UNIQUE INDEX `UserAccount_email_key`(`email`),
    UNIQUE INDEX `UserAccount_resident_id_key`(`resident_id`),
    UNIQUE INDEX `UserAccount_staff_id_key`(`staff_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Resident` ADD CONSTRAINT `Resident_apartment_id_fkey` FOREIGN KEY (`apartment_id`) REFERENCES `Apartment`(`apartment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParkingSpace` ADD CONSTRAINT `ParkingSpace_apartment_id_fkey` FOREIGN KEY (`apartment_id`) REFERENCES `Apartment`(`apartment_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_resident_id_fkey` FOREIGN KEY (`resident_id`) REFERENCES `Resident`(`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_parking_id_fkey` FOREIGN KEY (`parking_id`) REFERENCES `ParkingSpace`(`parking_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenancePayment` ADD CONSTRAINT `MaintenancePayment_apartment_id_fkey` FOREIGN KEY (`apartment_id`) REFERENCES `Apartment`(`apartment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_resident_id_fkey` FOREIGN KEY (`resident_id`) REFERENCES `Resident`(`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `Staff`(`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAccount` ADD CONSTRAINT `UserAccount_resident_id_fkey` FOREIGN KEY (`resident_id`) REFERENCES `Resident`(`resident_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAccount` ADD CONSTRAINT `UserAccount_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `Staff`(`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE;


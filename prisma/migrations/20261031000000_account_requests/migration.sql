-- CreateTable
CREATE TABLE `AccountRequest` (
    `request_id` INTEGER NOT NULL AUTO_INCREMENT,
    `full_name` VARCHAR(100) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,
    `requested_role` ENUM('ADMIN', 'RESIDENT', 'MAINTENANCE', 'SECURITY') NOT NULL,
    `phone` VARCHAR(15) NULL,
    `flat_info` VARCHAR(50) NULL,
    `message` VARCHAR(300) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by_user_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_note` VARCHAR(300) NULL,
    `created_account_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AccountRequest_created_account_id_key`(`created_account_id`),
    INDEX `AccountRequest_status_created_at_idx`(`status`, `created_at`),
    INDEX `AccountRequest_username_idx`(`username`),
    INDEX `AccountRequest_email_idx`(`email`),
    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AccountRequest` ADD CONSTRAINT `AccountRequest_created_account_id_fkey` FOREIGN KEY (`created_account_id`) REFERENCES `UserAccount`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;


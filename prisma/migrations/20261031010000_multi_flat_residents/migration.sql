-- A person can own or rent several flats: the link moves from UserAccount.resident_id (one flat)
-- to Resident.account_id (many residencies per account). Existing links are copied, not lost.

-- 1. New link column on Resident.
ALTER TABLE `Resident` ADD COLUMN `account_id` INTEGER NULL;

-- 2. Copy every existing account -> resident link across.
UPDATE `Resident` r
JOIN `UserAccount` u ON u.`resident_id` = r.`resident_id`
SET r.`account_id` = u.`user_id`;

-- 3. Drop the old one-flat link.
ALTER TABLE `UserAccount` DROP FOREIGN KEY `UserAccount_resident_id_fkey`;
DROP INDEX `UserAccount_resident_id_key` ON `UserAccount`;
ALTER TABLE `UserAccount` DROP COLUMN `resident_id`;

-- 4. The same person appears once per flat, so contact details can repeat across rows.
DROP INDEX `Resident_email_key` ON `Resident`;
DROP INDEX `Resident_phone_key` ON `Resident`;
CREATE INDEX `Resident_phone_idx` ON `Resident`(`phone`);
CREATE INDEX `Resident_email_idx` ON `Resident`(`email`);

-- 5. At most one residency per account per flat; NULLs (residents without a login) are unrestricted.
CREATE UNIQUE INDEX `Resident_account_id_apartment_id_key` ON `Resident`(`account_id`, `apartment_id`);
ALTER TABLE `Resident` ADD CONSTRAINT `Resident_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `UserAccount`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

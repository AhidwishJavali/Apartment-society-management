-- Sessions issued before this moment are rejected (set on logout).
ALTER TABLE `UserAccount` ADD COLUMN `sessions_valid_after` DATETIME(3) NULL;

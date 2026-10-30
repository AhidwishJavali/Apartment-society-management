-- Shared (database-backed) sign-in throttle, replacing the per-process in-memory map.
CREATE TABLE `LoginAttempt` (
    `identifier` VARCHAR(100) NOT NULL,
    `failures` INTEGER NOT NULL DEFAULT 0,
    `reset_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`identifier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

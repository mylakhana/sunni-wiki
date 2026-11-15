ALTER TABLE `volumes` ADD COLUMN `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active';
ALTER TABLE `chapters` ADD COLUMN `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active';

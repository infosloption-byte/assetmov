-- AssetMov platform control plane. Additive; no tenant changes.
CREATE TABLE `PlatformSetting` (
  `id` VARCHAR(32) NOT NULL,
  `companyRegistrationOpen` BOOLEAN NOT NULL DEFAULT TRUE,
  `supportEmail` VARCHAR(191) NULL,
  `announcement` VARCHAR(500) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `PlatformSetting` (`id`, `companyRegistrationOpen`, `updatedAt`)
VALUES ('global', TRUE, CURRENT_TIMESTAMP(3));

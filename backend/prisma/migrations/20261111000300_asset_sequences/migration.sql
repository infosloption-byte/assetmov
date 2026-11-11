-- Tenant-scoped inventory numbering, preserving all existing manual numbers.
CREATE TABLE `AssetNumberSequence` (
  `tenantId` VARCHAR(36) NOT NULL,
  `prefix` VARCHAR(16) NOT NULL DEFAULT 'AM',
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (`tenantId`),
  CONSTRAINT `AssetNumberSequence_tenantId_fkey` FOREIGN KEY (`tenantId`)
    REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `AssetNumberSequence` (`tenantId`,`prefix`,`nextValue`)
SELECT `id`, 'AM', 1 FROM `Tenant`;

-- Asset attachments used to enforce tenant storage allowances.
-- Keep table/model case consistent with the existing Prisma migrations.
CREATE TABLE `TenantStorageObject` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(36) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `content` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TenantStorageObject_tenantId_assetId_createdAt_idx`(`tenantId`, `assetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TenantStorageObject`
  ADD CONSTRAINT `TenantStorageObject_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TenantStorageObject`
  ADD CONSTRAINT `TenantStorageObject_tenantId_assetId_fkey`
  FOREIGN KEY (`tenantId`, `assetId`) REFERENCES `Asset`(`tenantId`, `id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Additive, append-only employee location movement audit.
CREATE TABLE `EmployeeLocationHistory` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `employeeId` VARCHAR(36) NOT NULL,
  `previousLocationId` VARCHAR(36) NULL,
  `newLocationId` VARCHAR(36) NULL,
  `actorUserId` VARCHAR(36) NOT NULL,
  `reason` VARCHAR(300) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `EmployeeLocationHistory_tenantId_employeeId_createdAt_idx`
    (`tenantId`,`employeeId`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeeLocationHistory_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

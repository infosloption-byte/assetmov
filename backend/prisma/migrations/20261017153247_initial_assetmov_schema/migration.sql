-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'TRIAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `isPlatformAdmin` BOOLEAN NOT NULL DEFAULT false,
    `disabledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `csrfToken` CHAR(43) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Membership` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `roleId` VARCHAR(36) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allLocationsAccess` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Membership_userId_isActive_idx`(`userId`, `isActive`),
    INDEX `Membership_tenantId_roleId_isActive_idx`(`tenantId`, `roleId`, `isActive`),
    UNIQUE INDEX `Membership_tenantId_userId_key`(`tenantId`, `userId`),
    UNIQUE INDEX `Membership_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MembershipLocation` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `membershipId` VARCHAR(36) NOT NULL,
    `locationId` VARCHAR(36) NOT NULL,
    `canManage` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MembershipLocation_tenantId_locationId_idx`(`tenantId`, `locationId`),
    UNIQUE INDEX `MembershipLocation_tenantId_membershipId_locationId_key`(`tenantId`, `membershipId`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Role_tenantId_name_idx`(`tenantId`, `name`),
    UNIQUE INDEX `Role_tenantId_key_key`(`tenantId`, `key`),
    UNIQUE INDEX `Role_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `Permission_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(36) NOT NULL,
    `permissionId` VARCHAR(36) NOT NULL,

    INDEX `RolePermission_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `parentId` VARCHAR(36) NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `type` VARCHAR(60) NOT NULL DEFAULT 'BRANCH',
    `address` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Location_tenantId_parentId_idx`(`tenantId`, `parentId`),
    INDEX `Location_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `Location_tenantId_code_key`(`tenantId`, `code`),
    UNIQUE INDEX `Location_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `employeeCode` VARCHAR(100) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(50) NULL,
    `homeLocationId` VARCHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Employee_tenantId_lastName_firstName_idx`(`tenantId`, `lastName`, `firstName`),
    INDEX `Employee_tenantId_homeLocationId_idx`(`tenantId`, `homeLocationId`),
    UNIQUE INDEX `Employee_tenantId_employeeCode_key`(`tenantId`, `employeeCode`),
    UNIQUE INDEX `Employee_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetCategory` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetCategory_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `AssetCategory_tenantId_name_key`(`tenantId`, `name`),
    UNIQUE INDEX `AssetCategory_tenantId_code_key`(`tenantId`, `code`),
    UNIQUE INDEX `AssetCategory_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetModel` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `categoryId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NULL,
    `fieldSchema` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetModel_tenantId_categoryId_isActive_idx`(`tenantId`, `categoryId`, `isActive`),
    UNIQUE INDEX `AssetModel_tenantId_name_key`(`tenantId`, `name`),
    UNIQUE INDEX `AssetModel_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(60) NULL,
    `address` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Supplier_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `Supplier_tenantId_name_key`(`tenantId`, `name`),
    UNIQUE INDEX `Supplier_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Manufacturer` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Manufacturer_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `Manufacturer_tenantId_name_key`(`tenantId`, `name`),
    UNIQUE INDEX `Manufacturer_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `inventoryNumber` VARCHAR(191) NOT NULL,
    `assetNumber` VARCHAR(191) NULL,
    `serialNumber` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `modelId` VARCHAR(36) NULL,
    `manufacturerId` VARCHAR(36) NULL,
    `supplierId` VARCHAR(36) NULL,
    `currentLocationId` VARCHAR(36) NULL,
    `assignedEmployeeId` VARCHAR(36) NULL,
    `purchaseOrderNumber` VARCHAR(191) NULL,
    `accountCode` VARCHAR(100) NULL,
    `purchasedAt` DATETIME(3) NULL,
    `purchaseCost` DECIMAL(12, 2) NULL,
    `salvageValue` DECIMAL(12, 2) NULL,
    `warrantyStart` DATETIME(3) NULL,
    `warrantyEnd` DATETIME(3) NULL,
    `expectedLifeMonths` INTEGER NULL,
    `depreciationMethod` VARCHAR(60) NULL,
    `status` ENUM('DRAFT', 'AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'IN_SERVICE', 'DAMAGED', 'DISPOSED', 'RETIRED') NOT NULL DEFAULT 'AVAILABLE',
    `customFields` JSON NULL,
    `notes` TEXT NULL,
    `disposedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Asset_tenantId_status_currentLocationId_idx`(`tenantId`, `status`, `currentLocationId`),
    INDEX `Asset_tenantId_assignedEmployeeId_idx`(`tenantId`, `assignedEmployeeId`),
    INDEX `Asset_tenantId_serialNumber_idx`(`tenantId`, `serialNumber`),
    INDEX `Asset_tenantId_modelId_idx`(`tenantId`, `modelId`),
    UNIQUE INDEX `Asset_tenantId_inventoryNumber_key`(`tenantId`, `inventoryNumber`),
    UNIQUE INDEX `Asset_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetTransaction` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(36) NOT NULL,
    `eventType` ENUM('REGISTERED', 'ASSIGNED', 'UNASSIGNED', 'TRANSFER_DISPATCHED', 'TRANSFER_RECEIVED', 'TRANSFER_REJECTED', 'CHECKED_IN', 'CHECKED_OUT', 'MARKED_DAMAGED', 'MARKED_AVAILABLE', 'DISPOSED', 'RETIRED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'UPGRADED', 'CORRECTED') NOT NULL,
    `fromLocationId` VARCHAR(36) NULL,
    `toLocationId` VARCHAR(36) NULL,
    `fromEmployeeId` VARCHAR(36) NULL,
    `toEmployeeId` VARCHAR(36) NULL,
    `actorUserId` VARCHAR(36) NULL,
    `notes` TEXT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssetTransaction_tenantId_assetId_occurredAt_idx`(`tenantId`, `assetId`, `occurredAt`),
    INDEX `AssetTransaction_tenantId_eventType_occurredAt_idx`(`tenantId`, `eventType`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetRequest` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `requestedById` VARCHAR(36) NOT NULL,
    `requestType` ENUM('ASSET', 'SOFTWARE', 'SERVICE') NOT NULL,
    `status` ENUM('PENDING', 'CHANGES_REQUESTED', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'FULFILLMENT_IN_PROGRESS', 'FULFILLED') NOT NULL DEFAULT 'PENDING',
    `businessReason` TEXT NULL,
    `decidedById` VARCHAR(36) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetRequest_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `AssetRequest_tenantId_requestedById_createdAt_idx`(`tenantId`, `requestedById`, `createdAt`),
    UNIQUE INDEX `AssetRequest_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetTransfer` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `transferNumber` VARCHAR(64) NOT NULL,
    `originLocationId` VARCHAR(36) NOT NULL,
    `destinationLocationId` VARCHAR(36) NOT NULL,
    `status` ENUM('IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'IN_TRANSIT',
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(36) NOT NULL,
    `dispatchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetTransfer_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `AssetTransfer_tenantId_originLocationId_status_idx`(`tenantId`, `originLocationId`, `status`),
    INDEX `AssetTransfer_tenantId_destinationLocationId_status_idx`(`tenantId`, `destinationLocationId`, `status`),
    UNIQUE INDEX `AssetTransfer_tenantId_transferNumber_key`(`tenantId`, `transferNumber`),
    UNIQUE INDEX `AssetTransfer_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetTransferLine` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `transferId` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(36) NOT NULL,
    `status` ENUM('IN_TRANSIT', 'RECEIVED', 'REJECTED') NOT NULL DEFAULT 'IN_TRANSIT',
    `decisionReason` TEXT NULL,
    `resolvedByUserId` VARCHAR(36) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetTransferLine_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `AssetTransferLine_tenantId_transferId_status_idx`(`tenantId`, `transferId`, `status`),
    INDEX `AssetTransferLine_tenantId_assetId_status_idx`(`tenantId`, `assetId`, `status`),
    UNIQUE INDEX `AssetTransferLine_tenantId_transferId_assetId_key`(`tenantId`, `transferId`, `assetId`),
    UNIQUE INDEX `AssetTransferLine_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceRecord` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(36) NOT NULL,
    `serviceNumber` VARCHAR(100) NOT NULL,
    `serviceType` VARCHAR(100) NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_FOR_VENDOR', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `provider` VARCHAR(191) NULL,
    `cost` DECIMAL(12, 2) NULL,
    `serviceInAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `outcome` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceRecord_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `ServiceRecord_tenantId_assetId_createdAt_idx`(`tenantId`, `assetId`, `createdAt`),
    UNIQUE INDEX `ServiceRecord_tenantId_serviceNumber_key`(`tenantId`, `serviceNumber`),
    UNIQUE INDEX `ServiceRecord_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SoftwareLicense` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `licenseStart` DATETIME(3) NULL,
    `licenseEnd` DATETIME(3) NULL,
    `seatCount` INTEGER NOT NULL DEFAULT 1,
    `supplierId` VARCHAR(36) NULL,
    `manufacturerId` VARCHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SoftwareLicense_tenantId_licenseEnd_isActive_idx`(`tenantId`, `licenseEnd`, `isActive`),
    UNIQUE INDEX `SoftwareLicense_tenantId_name_key`(`tenantId`, `name`),
    UNIQUE INDEX `SoftwareLicense_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetRequestItem` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `requestId` VARCHAR(36) NOT NULL,
    `itemType` ENUM('ASSET', 'SOFTWARE', 'SERVICE') NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `approvedQuantity` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `softwareLicenseId` VARCHAR(36) NULL,

    INDEX `AssetRequestItem_tenantId_requestId_idx`(`tenantId`, `requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LicenseAssignment` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `softwareLicenseId` VARCHAR(36) NOT NULL,
    `assignedToEmployeeId` VARCHAR(36) NULL,
    `deviceIdentifier` VARCHAR(191) NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unassignedAt` DATETIME(3) NULL,

    INDEX `LicenseAssignment_tenantId_softwareLicenseId_unassignedAt_idx`(`tenantId`, `softwareLicenseId`, `unassignedAt`),
    INDEX `LicenseAssignment_tenantId_assignedToEmployeeId_unassignedAt_idx`(`tenantId`, `assignedToEmployeeId`, `unassignedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetTag` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `tagType` VARCHAR(30) NOT NULL DEFAULT 'QR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssetTag_tenantId_assetId_idx`(`tenantId`, `assetId`),
    UNIQUE INDEX `AssetTag_tenantId_code_key`(`tenantId`, `code`),
    UNIQUE INDEX `AssetTag_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(100) NOT NULL,
    `entityId` VARCHAR(100) NULL,
    `oldData` JSON NULL,
    `newData` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `requestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AuditLog_tenantId_entityType_entityId_idx`(`tenantId`, `entityType`, `entityId`),
    INDEX `AuditLog_tenantId_actorUserId_createdAt_idx`(`tenantId`, `actorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPlan` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `maxAssets` INTEGER NULL,
    `maxActiveUsers` INTEGER NULL,
    `storageLimitBytes` BIGINT NULL,
    `trialDurationDays` INTEGER NOT NULL DEFAULT 14,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPlan_key_key`(`key`),
    INDEX `SubscriptionPlan_isActive_name_idx`(`isActive`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantSubscription` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `planId` VARCHAR(36) NOT NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCEL_AT_PERIOD_END', 'EXPIRED', 'SUSPENDED') NOT NULL DEFAULT 'TRIALING',
    `trialStartedAt` DATETIME(3) NULL,
    `trialEndsAt` DATETIME(3) NULL,
    `currentPeriodStartsAt` DATETIME(3) NULL,
    `currentPeriodEndsAt` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantSubscription_tenantId_key`(`tenantId`),
    INDEX `TenantSubscription_planId_status_idx`(`planId`, `status`),
    INDEX `TenantSubscription_status_trialEndsAt_idx`(`status`, `trialEndsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformAuditLog` (
    `id` VARCHAR(36) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(100) NOT NULL,
    `entityId` VARCHAR(100) NULL,
    `reason` TEXT NOT NULL,
    `oldData` JSON NULL,
    `newData` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlatformAuditLog_createdAt_idx`(`createdAt`),
    INDEX `PlatformAuditLog_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    INDEX `PlatformAuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_tenantId_roleId_fkey` FOREIGN KEY (`tenantId`, `roleId`) REFERENCES `Role`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipLocation` ADD CONSTRAINT `MembershipLocation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipLocation` ADD CONSTRAINT `MembershipLocation_tenantId_membershipId_fkey` FOREIGN KEY (`tenantId`, `membershipId`) REFERENCES `Membership`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipLocation` ADD CONSTRAINT `MembershipLocation_tenantId_locationId_fkey` FOREIGN KEY (`tenantId`, `locationId`) REFERENCES `Location`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Role` ADD CONSTRAINT `Role_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_homeLocationId_fkey` FOREIGN KEY (`homeLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetCategory` ADD CONSTRAINT `AssetCategory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetModel` ADD CONSTRAINT `AssetModel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetModel` ADD CONSTRAINT `AssetModel_tenantId_categoryId_fkey` FOREIGN KEY (`tenantId`, `categoryId`) REFERENCES `AssetCategory`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Supplier` ADD CONSTRAINT `Supplier_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Manufacturer` ADD CONSTRAINT `Manufacturer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `AssetModel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `Manufacturer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_currentLocationId_fkey` FOREIGN KEY (`currentLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_assignedEmployeeId_fkey` FOREIGN KEY (`assignedEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_tenantId_assetId_fkey` FOREIGN KEY (`tenantId`, `assetId`) REFERENCES `Asset`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_fromLocationId_fkey` FOREIGN KEY (`fromLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_toLocationId_fkey` FOREIGN KEY (`toLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_fromEmployeeId_fkey` FOREIGN KEY (`fromEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransaction` ADD CONSTRAINT `AssetTransaction_toEmployeeId_fkey` FOREIGN KEY (`toEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRequest` ADD CONSTRAINT `AssetRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRequest` ADD CONSTRAINT `AssetRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRequest` ADD CONSTRAINT `AssetRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransfer` ADD CONSTRAINT `AssetTransfer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransfer` ADD CONSTRAINT `AssetTransfer_tenantId_originLocationId_fkey` FOREIGN KEY (`tenantId`, `originLocationId`) REFERENCES `Location`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransfer` ADD CONSTRAINT `AssetTransfer_tenantId_destinationLocationId_fkey` FOREIGN KEY (`tenantId`, `destinationLocationId`) REFERENCES `Location`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransfer` ADD CONSTRAINT `AssetTransfer_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransferLine` ADD CONSTRAINT `AssetTransferLine_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransferLine` ADD CONSTRAINT `AssetTransferLine_tenantId_transferId_fkey` FOREIGN KEY (`tenantId`, `transferId`) REFERENCES `AssetTransfer`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransferLine` ADD CONSTRAINT `AssetTransferLine_tenantId_assetId_fkey` FOREIGN KEY (`tenantId`, `assetId`) REFERENCES `Asset`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTransferLine` ADD CONSTRAINT `AssetTransferLine_resolvedByUserId_fkey` FOREIGN KEY (`resolvedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRecord` ADD CONSTRAINT `ServiceRecord_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRecord` ADD CONSTRAINT `ServiceRecord_tenantId_assetId_fkey` FOREIGN KEY (`tenantId`, `assetId`) REFERENCES `Asset`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SoftwareLicense` ADD CONSTRAINT `SoftwareLicense_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SoftwareLicense` ADD CONSTRAINT `SoftwareLicense_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SoftwareLicense` ADD CONSTRAINT `SoftwareLicense_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `Manufacturer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRequestItem` ADD CONSTRAINT `AssetRequestItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRequestItem` ADD CONSTRAINT `AssetRequestItem_tenantId_requestId_fkey` FOREIGN KEY (`tenantId`, `requestId`) REFERENCES `AssetRequest`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetRequestItem` ADD CONSTRAINT `AssetRequestItem_softwareLicenseId_fkey` FOREIGN KEY (`softwareLicenseId`) REFERENCES `SoftwareLicense`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LicenseAssignment` ADD CONSTRAINT `LicenseAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LicenseAssignment` ADD CONSTRAINT `LicenseAssignment_tenantId_softwareLicenseId_fkey` FOREIGN KEY (`tenantId`, `softwareLicenseId`) REFERENCES `SoftwareLicense`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LicenseAssignment` ADD CONSTRAINT `LicenseAssignment_assignedToEmployeeId_fkey` FOREIGN KEY (`assignedToEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTag` ADD CONSTRAINT `AssetTag_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetTag` ADD CONSTRAINT `AssetTag_tenantId_assetId_fkey` FOREIGN KEY (`tenantId`, `assetId`) REFERENCES `Asset`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantSubscription` ADD CONSTRAINT `TenantSubscription_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantSubscription` ADD CONSTRAINT `TenantSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformAuditLog` ADD CONSTRAINT `PlatformAuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

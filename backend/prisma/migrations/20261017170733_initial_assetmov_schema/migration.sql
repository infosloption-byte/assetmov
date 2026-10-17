-- DropIndex
DROP INDEX `Asset_assignedEmployeeId_fkey` ON `asset`;

-- DropIndex
DROP INDEX `Asset_currentLocationId_fkey` ON `asset`;

-- DropIndex
DROP INDEX `Asset_manufacturerId_fkey` ON `asset`;

-- DropIndex
DROP INDEX `Asset_modelId_fkey` ON `asset`;

-- DropIndex
DROP INDEX `Asset_supplierId_fkey` ON `asset`;

-- DropIndex
DROP INDEX `AssetRequest_decidedById_fkey` ON `assetrequest`;

-- DropIndex
DROP INDEX `AssetRequest_requestedById_fkey` ON `assetrequest`;

-- DropIndex
DROP INDEX `AssetRequestItem_softwareLicenseId_fkey` ON `assetrequestitem`;

-- DropIndex
DROP INDEX `AssetTransaction_actorUserId_fkey` ON `assettransaction`;

-- DropIndex
DROP INDEX `AssetTransaction_fromEmployeeId_fkey` ON `assettransaction`;

-- DropIndex
DROP INDEX `AssetTransaction_fromLocationId_fkey` ON `assettransaction`;

-- DropIndex
DROP INDEX `AssetTransaction_toEmployeeId_fkey` ON `assettransaction`;

-- DropIndex
DROP INDEX `AssetTransaction_toLocationId_fkey` ON `assettransaction`;

-- DropIndex
DROP INDEX `AssetTransfer_createdByUserId_fkey` ON `assettransfer`;

-- DropIndex
DROP INDEX `AssetTransferLine_resolvedByUserId_fkey` ON `assettransferline`;

-- DropIndex
DROP INDEX `AuditLog_actorUserId_fkey` ON `auditlog`;

-- DropIndex
DROP INDEX `Employee_homeLocationId_fkey` ON `employee`;

-- DropIndex
DROP INDEX `LicenseAssignment_assignedToEmployeeId_fkey` ON `licenseassignment`;

-- DropIndex
DROP INDEX `Location_parentId_fkey` ON `location`;

-- DropIndex
DROP INDEX `SoftwareLicense_manufacturerId_fkey` ON `softwarelicense`;

-- DropIndex
DROP INDEX `SoftwareLicense_supplierId_fkey` ON `softwarelicense`;

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

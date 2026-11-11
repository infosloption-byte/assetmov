-- P0 company preferences, additive to existing tenant records.
-- Defaults preserve existing tenant access and do not alter company IDs.
ALTER TABLE `Tenant`
  ADD COLUMN `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
  ADD COLUMN `locale` VARCHAR(24) NOT NULL DEFAULT 'en-US',
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN `dateFormat` VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
  ADD COLUMN `fiscalYearStartMonth` INTEGER NOT NULL DEFAULT 1;

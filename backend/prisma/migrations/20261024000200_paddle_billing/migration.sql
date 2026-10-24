-- Provider-isolated Paddle Billing integration. Do not alter historical tenant data.
ALTER TABLE `SubscriptionPlan`
  ADD COLUMN `paddleSandboxMonthlyPriceId` VARCHAR(80) NULL,
  ADD COLUMN `paddleSandboxYearlyPriceId` VARCHAR(80) NULL,
  ADD COLUMN `paddleLiveMonthlyPriceId` VARCHAR(80) NULL,
  ADD COLUMN `paddleLiveYearlyPriceId` VARCHAR(80) NULL;

ALTER TABLE `TenantSubscription`
  ADD COLUMN `billingSource` VARCHAR(20) NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN `paddleSubscriptionId` VARCHAR(80) NULL,
  ADD COLUMN `paddleCustomerId` VARCHAR(80) NULL,
  ADD COLUMN `paddlePriceId` VARCHAR(80) NULL,
  ADD COLUMN `paddleEnvironment` VARCHAR(16) NULL,
  ADD COLUMN `paddleInterval` VARCHAR(10) NULL,
  ADD COLUMN `paddleLastEventAt` DATETIME(3) NULL,
  ADD COLUMN `paddlePendingPriceId` VARCHAR(80) NULL,
  ADD UNIQUE INDEX `TenantSubscription_paddleSubscriptionId_key` (`paddleSubscriptionId`);

CREATE TABLE `PaddleBillingCustomer` (
  `id` VARCHAR(36) NOT NULL, `tenantId` VARCHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL,
  `paddleCustomerId` VARCHAR(80) NULL, `environment` VARCHAR(16) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaddleBillingCustomer_tenantId_key` (`tenantId`),
  UNIQUE INDEX `PaddleBillingCustomer_paddleCustomerId_key` (`paddleCustomerId`),
  INDEX `PaddleBillingCustomer_environment_email_idx` (`environment`, `email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaddleCheckoutAttempt` (
  `id` VARCHAR(36) NOT NULL, `tenantId` VARCHAR(36) NOT NULL,
  `planId` VARCHAR(36) NOT NULL, `customerId` VARCHAR(36) NOT NULL,
  `environment` VARCHAR(16) NOT NULL, `interval` VARCHAR(10) NOT NULL,
  `priceId` VARCHAR(80) NOT NULL, `transactionId` VARCHAR(80) NULL,
  `checkoutUrl` VARCHAR(1500) NULL, `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `lastError` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaddleCheckoutAttempt_transactionId_key` (`transactionId`),
  INDEX `PaddleCheckoutAttempt_tenantId_environment_status_createdAt_idx` (`tenantId`, `environment`, `status`, `createdAt`),
  INDEX `PaddleCheckoutAttempt_tenantId_transactionId_idx` (`tenantId`, `transactionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaddlePayment` (
  `id` VARCHAR(36) NOT NULL, `tenantId` VARCHAR(36) NOT NULL,
  `transactionId` VARCHAR(80) NOT NULL, `subscriptionId` VARCHAR(80) NULL,
  `status` VARCHAR(30) NOT NULL, `amountMinor` INTEGER NOT NULL,
  `currency` VARCHAR(3) NOT NULL, `invoiceNumber` VARCHAR(80) NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaddlePayment_transactionId_key` (`transactionId`),
  INDEX `PaddlePayment_tenantId_occurredAt_idx` (`tenantId`, `occurredAt`),
  INDEX `PaddlePayment_tenantId_status_idx` (`tenantId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaddleWebhookEvent` (
  `id` VARCHAR(36) NOT NULL, `eventId` VARCHAR(100) NOT NULL,
  `tenantId` VARCHAR(36) NULL, `environment` VARCHAR(16) NOT NULL,
  `eventType` VARCHAR(100) NOT NULL, `occurredAt` DATETIME(3) NOT NULL,
  `status` VARCHAR(25) NOT NULL DEFAULT 'RECEIVED', `lastError` VARCHAR(500) NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  UNIQUE INDEX `PaddleWebhookEvent_eventId_key` (`eventId`),
  INDEX `PaddleWebhookEvent_status_receivedAt_idx` (`status`, `receivedAt`),
  INDEX `PaddleWebhookEvent_tenantId_receivedAt_idx` (`tenantId`, `receivedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PaddleBillingCustomer` ADD CONSTRAINT `PaddleBillingCustomer_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaddleCheckoutAttempt` ADD CONSTRAINT `PaddleCheckoutAttempt_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaddleCheckoutAttempt` ADD CONSTRAINT `PaddleCheckoutAttempt_planId_fkey`
  FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PaddleCheckoutAttempt` ADD CONSTRAINT `PaddleCheckoutAttempt_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `PaddleBillingCustomer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PaddlePayment` ADD CONSTRAINT `PaddlePayment_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaddleWebhookEvent` ADD CONSTRAINT `PaddleWebhookEvent_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

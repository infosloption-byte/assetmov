-- One-time identity tokens: only SHA-256 token hashes, never raw links.
CREATE TABLE `AccountToken` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AccountToken_tokenHash_key` (`tokenHash`),
  INDEX `AccountToken_userId_kind_expiresAt_idx` (`userId`,`kind`,`expiresAt`),
  INDEX `AccountToken_expiresAt_usedAt_idx` (`expiresAt`,`usedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AccountToken_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

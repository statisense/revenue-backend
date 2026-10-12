-- Idempotent tax-type schema upgrade (safe if runtime patches already applied)

CREATE TABLE IF NOT EXISTS `TaxType` (
    `id` VARCHAR(191) NOT NULL,
    `agencyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `ratePercent` DECIMAL(7, 4) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaxType_agencyId_isActive_idx`(`agencyId`, `isActive`),
    UNIQUE INDEX `TaxType_agencyId_code_key`(`agencyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS `revenue_add_col_if_missing`;
CREATE PROCEDURE `revenue_add_col_if_missing`(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;

CALL `revenue_add_col_if_missing`('AssessmentLine', 'taxTypeId', 'VARCHAR(191) NULL');
CALL `revenue_add_col_if_missing`('AssessmentLine', 'taxRatePercent', 'DECIMAL(7,4) NOT NULL DEFAULT 0');
CALL `revenue_add_col_if_missing`('AssessmentLine', 'taxMinor', 'INTEGER NOT NULL DEFAULT 0');
CALL `revenue_add_col_if_missing`('InvoiceLine', 'taxTypeId', 'VARCHAR(191) NULL');
CALL `revenue_add_col_if_missing`('InvoiceLine', 'taxRatePercent', 'DECIMAL(7,4) NOT NULL DEFAULT 0');
CALL `revenue_add_col_if_missing`('InvoiceLine', 'taxMinor', 'INTEGER NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS `revenue_add_col_if_missing`;

-- Indexes (ignore if already present)
SET @idx := (
  SELECT COUNT(1) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AssessmentLine' AND INDEX_NAME = 'AssessmentLine_taxTypeId_idx'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX `AssessmentLine_taxTypeId_idx` ON `AssessmentLine`(`taxTypeId`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(1) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'InvoiceLine' AND INDEX_NAME = 'InvoiceLine_taxTypeId_idx'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX `InvoiceLine_taxTypeId_idx` ON `InvoiceLine`(`taxTypeId`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys (ignore failures if already present)
SET @fk := (
  SELECT COUNT(1) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TaxType' AND CONSTRAINT_NAME = 'TaxType_agencyId_fkey'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE `TaxType` ADD CONSTRAINT `TaxType_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(1) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AssessmentLine' AND CONSTRAINT_NAME = 'AssessmentLine_taxTypeId_fkey'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE `AssessmentLine` ADD CONSTRAINT `AssessmentLine_taxTypeId_fkey` FOREIGN KEY (`taxTypeId`) REFERENCES `TaxType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(1) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'InvoiceLine' AND CONSTRAINT_NAME = 'InvoiceLine_taxTypeId_fkey'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE `InvoiceLine` ADD CONSTRAINT `InvoiceLine_taxTypeId_fkey` FOREIGN KEY (`taxTypeId`) REFERENCES `TaxType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

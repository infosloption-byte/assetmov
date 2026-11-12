-- Optional workforce classifications, preserving current employees and custody.
ALTER TABLE `Employee`
  ADD COLUMN `designation` VARCHAR(100) NULL,
  ADD COLUMN `employeeType` VARCHAR(100) NULL;

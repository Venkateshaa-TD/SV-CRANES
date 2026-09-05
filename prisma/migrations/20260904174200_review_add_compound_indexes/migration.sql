-- DropIndex
DROP INDEX "AuditLog_actorId_idx";

-- DropIndex
DROP INDEX "DailyLog_logDate_idx";

-- DropIndex
DROP INDEX "DailyLog_operatorId_idx";

-- DropIndex
DROP INDEX "DailyLog_vehicleId_idx";

-- DropIndex
DROP INDEX "Expense_status_idx";

-- DropIndex
DROP INDEX "Expense_vehicleId_idx";

-- DropIndex
DROP INDEX "FuelEntry_entryDate_idx";

-- DropIndex
DROP INDEX "FuelEntry_vehicleId_idx";

-- DropIndex
DROP INDEX "Vehicle_companyId_idx";

-- DropIndex
DROP INDEX "Vehicle_status_idx";

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyLog_vehicleId_logDate_idx" ON "DailyLog"("vehicleId", "logDate");

-- CreateIndex
CREATE INDEX "DailyLog_operatorId_logDate_idx" ON "DailyLog"("operatorId", "logDate");

-- CreateIndex
CREATE INDEX "Expense_vehicleId_expenseDate_idx" ON "Expense"("vehicleId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_status_expenseDate_idx" ON "Expense"("status", "expenseDate");

-- CreateIndex
CREATE INDEX "FuelEntry_vehicleId_entryDate_idx" ON "FuelEntry"("vehicleId", "entryDate");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_archivedAt_status_idx" ON "Vehicle"("companyId", "archivedAt", "status");


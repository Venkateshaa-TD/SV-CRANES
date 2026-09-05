-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VehicleCategory" ADD VALUE 'CRANE';
ALTER TYPE "VehicleCategory" ADD VALUE 'PICKUP';

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "breakdownNotes" TEXT,
ADD COLUMN     "distance" DECIMAL(12,2),
ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meterPhotoFileId" TEXT,
ADD COLUMN     "sitePhotoFileId" TEXT,
ADD COLUMN     "workDescription" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "receiptFileId" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "vendorName" TEXT;

-- AlterTable
ALTER TABLE "FuelEntry" ADD COLUMN     "receiptFileId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "assignedOperatorId" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "fuelType" "FuelType",
ADD COLUMN     "imageFileId" TEXT,
ADD COLUMN     "make" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "purchaseAmount" DECIMAL(12,2),
ADD COLUMN     "year" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_employeeCode_key" ON "User"("companyId", "employeeCode");

-- CreateIndex
CREATE INDEX "Vehicle_assignedOperatorId_idx" ON "Vehicle"("assignedOperatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_companyId_code_key" ON "Vehicle"("companyId", "code");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_meterPhotoFileId_fkey" FOREIGN KEY ("meterPhotoFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_sitePhotoFileId_fkey" FOREIGN KEY ("sitePhotoFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;


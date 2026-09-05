-- CreateEnum
CREATE TYPE "ClosingPeriodStatus" AS ENUM ('OPEN', 'REVIEW', 'CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "ClosingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ClosingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "overrideReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClosingPeriod_companyId_status_idx" ON "ClosingPeriod"("companyId", "status");

-- CreateIndex
CREATE INDEX "ClosingPeriod_companyId_startDate_endDate_idx" ON "ClosingPeriod"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClosingPeriod_companyId_year_month_key" ON "ClosingPeriod"("companyId", "year", "month");

-- AddForeignKey
ALTER TABLE "ClosingPeriod" ADD CONSTRAINT "ClosingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingPeriod" ADD CONSTRAINT "ClosingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingPeriod" ADD CONSTRAINT "ClosingPeriod_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY', 'FIXED');

-- CreateEnum
CREATE TYPE "BillingDraftStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'INVOICED');

-- CreateEnum
CREATE TYPE "LedgerAdjustmentType" AS ENUM ('DEBIT', 'CREDIT');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customerCode" TEXT,
ADD COLUMN     "defaultDueDays" INTEGER DEFAULT 30,
ADD COLUMN     "paymentTerms" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "billingDraftId" TEXT,
ADD COLUMN     "billingPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "billingPeriodStart" TIMESTAMP(3),
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateTable
CREATE TABLE "BillingConfiguration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billingType" "BillingType" NOT NULL,
    "baseRate" DECIMAL(12,2) NOT NULL,
    "minimumGuaranteedHours" DECIMAL(6,2),
    "overtimeThresholdHours" DECIMAL(6,2),
    "overtimeRate" DECIMAL(12,2),
    "mobilisationCharge" DECIMAL(12,2),
    "demobilisationCharge" DECIMAL(12,2),
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "billingNotes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "billingType" "BillingType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BillingDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "quantity" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "additionalChargesAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "calculationDetail" JSONB,
    "notes" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDraftCharge" (
    "id" TEXT NOT NULL,
    "billingDraftId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingDraftCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDraftSourceLog" (
    "id" TEXT NOT NULL,
    "billingDraftId" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "hoursCounted" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingDraftSourceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAdjustment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingConfiguration_projectId_key" ON "BillingConfiguration"("projectId");

-- CreateIndex
CREATE INDEX "BillingDraft_companyId_idx" ON "BillingDraft"("companyId");

-- CreateIndex
CREATE INDEX "BillingDraft_projectId_idx" ON "BillingDraft"("projectId");

-- CreateIndex
CREATE INDEX "BillingDraft_customerId_idx" ON "BillingDraft"("customerId");

-- CreateIndex
CREATE INDEX "BillingDraft_status_idx" ON "BillingDraft"("status");

-- CreateIndex
CREATE INDEX "BillingDraftCharge_billingDraftId_idx" ON "BillingDraftCharge"("billingDraftId");

-- CreateIndex
CREATE INDEX "BillingDraftSourceLog_dailyLogId_idx" ON "BillingDraftSourceLog"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDraftSourceLog_billingDraftId_dailyLogId_key" ON "BillingDraftSourceLog"("billingDraftId", "dailyLogId");

-- CreateIndex
CREATE INDEX "LedgerAdjustment_companyId_idx" ON "LedgerAdjustment"("companyId");

-- CreateIndex
CREATE INDEX "LedgerAdjustment_customerId_idx" ON "LedgerAdjustment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_customerCode_key" ON "Customer"("companyId", "customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_billingDraftId_key" ON "Invoice"("billingDraftId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_dueDate_idx" ON "Invoice"("companyId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingDraftId_fkey" FOREIGN KEY ("billingDraftId") REFERENCES "BillingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingConfiguration" ADD CONSTRAINT "BillingConfiguration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraft" ADD CONSTRAINT "BillingDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraft" ADD CONSTRAINT "BillingDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraft" ADD CONSTRAINT "BillingDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraft" ADD CONSTRAINT "BillingDraft_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraftCharge" ADD CONSTRAINT "BillingDraftCharge_billingDraftId_fkey" FOREIGN KEY ("billingDraftId") REFERENCES "BillingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraftSourceLog" ADD CONSTRAINT "BillingDraftSourceLog_billingDraftId_fkey" FOREIGN KEY ("billingDraftId") REFERENCES "BillingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraftSourceLog" ADD CONSTRAINT "BillingDraftSourceLog_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAdjustment" ADD CONSTRAINT "LedgerAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAdjustment" ADD CONSTRAINT "LedgerAdjustment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAdjustment" ADD CONSTRAINT "LedgerAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


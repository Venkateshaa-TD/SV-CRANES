import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { businessDateKey } from "@/lib/business/business-time";
import { buildCustomerLedger, type LedgerSourceEntry } from "@/lib/business/ledger";
import { computeInvoiceOutstanding, daysOverdue, isOverdue } from "@/lib/business/payment";

/**
 * Server-side financial query/aggregate functions, kept independent of
 * any React component so future reporting (Phase 3+) can call the same
 * functions the Phase 2 UI uses — none of this logic lives inline in a
 * page or client component. Every function here is company-scoped by a
 * required `companyId` parameter; none accept a bare record id without
 * it.
 */

// ---------------------------------------------------------------------
// Billing-engine source data
// ---------------------------------------------------------------------

/** HOURLY billing source: every APPROVED, non-archived DailyLog for the
 * project (already company-scoped through the project relation) inside
 * [periodStart, periodEnd] with recorded working hours. */
export async function findEligibleHourlyLogs(companyId: string, projectId: string, periodStart: Date, periodEnd: Date) {
  return prisma.dailyLog.findMany({
    where: {
      projectId,
      project: { companyId },
      archivedAt: null,
      status: "APPROVED",
      logDate: { gte: periodStart, lte: periodEnd },
      workingHours: { not: null },
    },
    select: { id: true, logDate: true, workingHours: true },
    orderBy: { logDate: "asc" },
  });
}

export interface EligibleBillingDay {
  dailyLogId: string;
  logDate: Date;
}

/**
 * DAILY billing rule: a calendar day (business-local) is "eligible" when
 * the project has at least one APPROVED, non-archived DailyLog on that
 * date with positive working hours. Multiple logs on the same day count
 * once; the first log encountered for the day is kept as the drill-down
 * reference.
 */
export async function findEligibleBillingDays(companyId: string, projectId: string, periodStart: Date, periodEnd: Date): Promise<EligibleBillingDay[]> {
  const logs = await prisma.dailyLog.findMany({
    where: {
      projectId,
      project: { companyId },
      archivedAt: null,
      status: "APPROVED",
      logDate: { gte: periodStart, lte: periodEnd },
      workingHours: { gt: 0 },
    },
    select: { id: true, logDate: true },
    orderBy: { logDate: "asc" },
  });

  const seenDays = new Set<string>();
  const eligibleDays: EligibleBillingDay[] = [];
  for (const log of logs) {
    const key = businessDateKey(log.logDate);
    if (seenDays.has(key)) continue;
    seenDays.add(key);
    eligibleDays.push({ dailyLogId: log.id, logDate: log.logDate });
  }
  return eligibleDays;
}

// ---------------------------------------------------------------------
// Customer financial summary / dashboard
// ---------------------------------------------------------------------

export interface CustomerFinancialSummary {
  totalBilled: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  overdue: Prisma.Decimal;
}

/**
 * Real, derived aggregates for the customer dashboard — never a stored
 * balance column. totalBilled/totalPaid exclude DRAFT invoices (not yet
 * approved/issued — not a real bill to the customer yet, and its amount
 * can still change) and CANCELLED invoices; outstanding = totalBilled -
 * totalPaid (+/- ledger adjustments); overdue is the outstanding balance
 * across invoices whose due date has passed.
 */
export async function getCustomerFinancialSummary(companyId: string, customerId: string): Promise<CustomerFinancialSummary> {
  const [invoices, adjustments] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, customerId, archivedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { totalAmount: true, amountPaid: true, dueDate: true },
    }),
    prisma.ledgerAdjustment.findMany({
      where: { companyId, customerId },
      select: { type: true, amount: true },
    }),
  ]);

  let totalBilled = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  let overdue = new Prisma.Decimal(0);

  for (const invoice of invoices) {
    totalBilled = totalBilled.plus(invoice.totalAmount);
    totalPaid = totalPaid.plus(invoice.amountPaid);
    const outstanding = computeInvoiceOutstanding(invoice.totalAmount, [invoice.amountPaid]);
    if (isOverdue({ dueDate: invoice.dueDate, outstanding })) {
      overdue = overdue.plus(outstanding);
    }
  }

  let adjustmentNet = new Prisma.Decimal(0);
  for (const adjustment of adjustments) {
    adjustmentNet = adjustment.type === "DEBIT" ? adjustmentNet.plus(adjustment.amount) : adjustmentNet.minus(adjustment.amount);
  }

  return {
    totalBilled: totalBilled.toDecimalPlaces(2),
    totalPaid: totalPaid.toDecimalPlaces(2),
    outstanding: totalBilled.minus(totalPaid).plus(adjustmentNet).toDecimalPlaces(2),
    overdue: overdue.toDecimalPlaces(2),
  };
}

// ---------------------------------------------------------------------
// Customer ledger
// ---------------------------------------------------------------------

/** DRAFT invoices are excluded — an unapproved invoice isn't a real
 * financial event yet and its amount can still change, so it must never
 * appear as a ledger debit. */
export async function getCustomerLedgerEntries(companyId: string, customerId: string, range?: { from?: Date; to?: Date }) {
  const dateFilter = range?.from || range?.to ? { gte: range?.from, lte: range?.to } : undefined;

  const [invoices, payments, adjustments] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, customerId, archivedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] }, ...(dateFilter ? { issueDate: dateFilter } : {}) },
      select: { id: true, invoiceNumber: true, issueDate: true, totalAmount: true, project: { select: { name: true } } },
      orderBy: { issueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: { companyId, customerId, archivedAt: null, cancelledAt: null, ...(dateFilter ? { paymentDate: dateFilter } : {}) },
      select: { id: true, paymentDate: true, amount: true, method: true, referenceNumber: true },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.ledgerAdjustment.findMany({
      where: { companyId, customerId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      select: { id: true, createdAt: true, type: true, amount: true, reason: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const entries: LedgerSourceEntry[] = [
    ...invoices.map((inv) => ({
      type: "INVOICE" as const,
      id: inv.id,
      date: inv.issueDate,
      reference: inv.invoiceNumber,
      description: inv.project?.name ? `Invoice — ${inv.project.name}` : "Invoice",
      amount: inv.totalAmount,
    })),
    ...payments.map((p) => ({
      type: "PAYMENT" as const,
      id: p.id,
      date: p.paymentDate,
      reference: p.referenceNumber ?? p.method,
      description: `Payment (${p.method.replace("_", " ").toLowerCase()})`,
      amount: p.amount,
    })),
    ...adjustments.map((a) => ({
      type: "ADJUSTMENT" as const,
      id: a.id,
      date: a.createdAt,
      reference: "Adjustment",
      description: a.reason,
      adjustmentType: a.type,
      amount: a.amount,
    })),
  ];

  return buildCustomerLedger(entries);
}

/** One query, grouped in memory — the customer list page needs every
 * customer's outstanding figure at once and must not run one query per
 * row (N+1). Excludes DRAFT (unissued) and CANCELLED invoices. */
export async function getOutstandingAmountsByCustomer(companyId: string): Promise<Map<string, Prisma.Decimal>> {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, archivedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { customerId: true, totalAmount: true, amountPaid: true },
  });
  const byCustomer = new Map<string, Prisma.Decimal>();
  for (const invoice of invoices) {
    const outstanding = computeInvoiceOutstanding(invoice.totalAmount, [invoice.amountPaid]);
    byCustomer.set(invoice.customerId, (byCustomer.get(invoice.customerId) ?? new Prisma.Decimal(0)).plus(outstanding));
  }
  return byCustomer;
}

// ---------------------------------------------------------------------
// Outstanding / receivables
// ---------------------------------------------------------------------

export interface OutstandingFilters {
  customerId?: string;
  projectId?: string;
  overdueOnly?: boolean;
  from?: Date;
  to?: Date;
}

export async function listOutstandingInvoices(companyId: string, filters: OutstandingFilters = {}) {
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      archivedAt: null,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      customerId: filters.customerId,
      projectId: filters.projectId,
      ...(filters.from || filters.to ? { issueDate: { gte: filters.from, lte: filters.to } } : {}),
    },
    include: { customer: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const rows = invoices
    .map((invoice) => {
      const outstanding = computeInvoiceOutstanding(invoice.totalAmount, [invoice.amountPaid]);
      return {
        invoice,
        outstanding,
        overdue: isOverdue({ dueDate: invoice.dueDate, outstanding, now }),
        daysOverdue: daysOverdue(invoice.dueDate, now),
      };
    })
    .filter((row) => row.outstanding.greaterThan(0))
    .filter((row) => (filters.overdueOnly ? row.overdue : true));

  return rows;
}

export interface OutstandingSummary {
  totalReceivables: Prisma.Decimal;
  currentOutstanding: Prisma.Decimal;
  overdueOutstanding: Prisma.Decimal;
}

export async function getOutstandingSummary(companyId: string, filters: OutstandingFilters = {}): Promise<OutstandingSummary> {
  const rows = await listOutstandingInvoices(companyId, { ...filters, overdueOnly: false });
  let total = new Prisma.Decimal(0);
  let overdueTotal = new Prisma.Decimal(0);
  for (const row of rows) {
    total = total.plus(row.outstanding);
    if (row.overdue) overdueTotal = overdueTotal.plus(row.outstanding);
  }
  return {
    totalReceivables: total.toDecimalPlaces(2),
    currentOutstanding: total.minus(overdueTotal).toDecimalPlaces(2),
    overdueOutstanding: overdueTotal.toDecimalPlaces(2),
  };
}

// ---------------------------------------------------------------------
// Project billing summary (for the project detail page / later reports)
// ---------------------------------------------------------------------

export async function getProjectBillingSummary(companyId: string, projectId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, projectId, archivedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { totalAmount: true, amountPaid: true },
  });
  const totalInvoiced = invoices.reduce((sum, inv) => sum.plus(inv.totalAmount), new Prisma.Decimal(0));
  const totalCollected = invoices.reduce((sum, inv) => sum.plus(inv.amountPaid), new Prisma.Decimal(0));
  return {
    totalInvoiced: totalInvoiced.toDecimalPlaces(2),
    totalCollected: totalCollected.toDecimalPlaces(2),
    outstanding: totalInvoiced.minus(totalCollected).toDecimalPlaces(2),
  };
}

// ---------------------------------------------------------------------
// Collections (payments received) — for reporting
// ---------------------------------------------------------------------

export async function getCollectionsSummary(companyId: string, range: { from: Date; to: Date }) {
  const agg = await prisma.payment.aggregate({
    where: { companyId, archivedAt: null, cancelledAt: null, paymentDate: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { totalCollected: new Prisma.Decimal(agg._sum.amount ?? 0).toDecimalPlaces(2), paymentCount: agg._count._all };
}

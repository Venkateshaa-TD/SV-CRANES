import "server-only";

import type { Prisma } from "@prisma/client";
import { businessLocalDateParts } from "@/lib/business/business-time";
import { fiscalYearFor, formatInvoiceNumber } from "@/lib/business/invoice";

/**
 * Issues the next invoice number for a company/fiscal-year, atomically.
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` is a single
 * round-trip, race-free statement — two concurrent invoice creations for
 * the same company can never receive the same number, and no
 * client-supplied number is ever trusted. Must be called inside the same
 * transaction as the Invoice row it numbers, so a failed invoice
 * creation rolls the sequence increment back too.
 *
 * Deliberately NOT exported from a "use server" action file — Next.js
 * requires every export of such a file to be an async Server Action,
 * and this is an internal helper shared by two different action
 * modules (invoices.ts, billing-drafts.ts), not a callable action.
 */
export async function issueInvoiceNumber(tx: Prisma.TransactionClient, companyId: string, issueDate: Date): Promise<string> {
  const fiscalYear = fiscalYearFor(businessLocalDateParts(issueDate));
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "InvoiceSequence" ("companyId", "fiscalYear", "lastNumber")
    VALUES (${companyId}, ${fiscalYear}, 1)
    ON CONFLICT ("companyId", "fiscalYear")
    DO UPDATE SET "lastNumber" = "InvoiceSequence"."lastNumber" + 1
    RETURNING "lastNumber"`;
  return formatInvoiceNumber(fiscalYear, rows[0].lastNumber);
}

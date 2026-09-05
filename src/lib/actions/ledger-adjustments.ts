"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { createLedgerAdjustmentSchema } from "@/lib/validation/ledger-adjustment";
import { validateLedgerAdjustment } from "@/lib/business/ledger";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

/**
 * The only sanctioned way to correct a customer's derived balance —
 * never a generic "edit balance" field. Requires CUSTOMER_FINANCIAL_EDIT,
 * a signed DEBIT/CREDIT type, and a reason; fully audited. See
 * src/lib/business/ledger.ts for how this folds into the ledger.
 */
export async function createLedgerAdjustment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
    const data = createLedgerAdjustmentSchema.parse(input);

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: actor.companyId, archivedAt: null } });
    if (!customer) throw new ActionInputError("Selected customer was not found.");

    validateLedgerAdjustment({ amount: data.amount, reason: data.reason });

    const adjustment = await prisma.ledgerAdjustment.create({
      data: {
        companyId: actor.companyId,
        customerId: customer.id,
        type: data.type,
        amount: new Prisma.Decimal(data.amount),
        reason: data.reason,
        createdById: actor.id,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "ledgerAdjustment.created",
      entityType: "LedgerAdjustment",
      entityId: adjustment.id,
      reason: data.reason,
      afterValue: { customerId: customer.id, type: adjustment.type, amount: adjustment.amount.toString() },
    });

    revalidatePath(`/customers/${customer.id}`);
    revalidatePath("/finance/ledger");
    revalidatePath("/finance/outstanding");
    return ok("Ledger adjustment recorded.", { id: adjustment.id });
  } catch (error) {
    return toActionError(error);
  }
}

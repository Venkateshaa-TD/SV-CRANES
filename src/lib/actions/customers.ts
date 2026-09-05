"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission, type CurrentUser } from "@/lib/auth/current-user";
import { can, AuthorizationError } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { customerCombinedFormSchema } from "@/lib/validation/customer";
import { ok, toActionError, type ActionResult } from "./action-result";

/**
 * Customer records are created/edited under CUSTOMER_MANAGE, but the
 * financial-terms fields (paymentTerms, defaultDueDays) additionally
 * require CUSTOMER_FINANCIAL_EDIT — the codebase's existing "~3 trusted
 * users" override permission (see src/lib/auth/permissions.ts). A
 * CUSTOMER_MANAGE-only submission simply omits those fields (the form
 * hides them via progressive disclosure); a forged request that
 * includes them without the override is rejected here, server-side.
 */
async function assertFinancialFieldAuthorization(
  actor: CurrentUser,
  submittedPaymentTerms: string | undefined,
  submittedDefaultDueDays: number | undefined,
  before: { paymentTerms: string | null; defaultDueDays: number | null },
): Promise<void> {
  // A field absent from the submission (undefined) means "not editing
  // this" — the update call below leaves it untouched regardless of
  // permission. Only a field that IS present and actually differs from
  // the stored value counts as an attempted financial-terms change.
  const touchesFinancials =
    (submittedPaymentTerms !== undefined && submittedPaymentTerms !== (before.paymentTerms ?? undefined)) ||
    (submittedDefaultDueDays !== undefined && submittedDefaultDueDays !== before.defaultDueDays);
  if (!touchesFinancials) return;
  const allowed = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
  if (!allowed) {
    throw new AuthorizationError("You do not have permission to set customer financial terms.");
  }
}

export async function createCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CUSTOMER_MANAGE);
    const data = customerCombinedFormSchema.parse(input);
    const hasFinancialEdit = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
    if (!hasFinancialEdit && (data.paymentTerms !== undefined || data.defaultDueDays !== undefined)) {
      throw new AuthorizationError("You do not have permission to set customer financial terms.");
    }

    if (data.customerCode) {
      const duplicateCode = await prisma.customer.findFirst({ where: { companyId: actor.companyId, customerCode: data.customerCode } });
      if (duplicateCode) return { success: false, fieldErrors: { customerCode: "This customer code is already in use." } };
    }
    const duplicateName = await prisma.customer.findFirst({
      where: { companyId: actor.companyId, archivedAt: null, name: { equals: data.name, mode: "insensitive" } },
    });
    if (duplicateName) return { success: false, fieldErrors: { name: "An active customer with this name already exists." } };

    const customer = await prisma.customer.create({
      data: {
        companyId: actor.companyId,
        name: data.name,
        customerCode: data.customerCode ?? null,
        contactPerson: data.contactPerson ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        gstNumber: data.gstNumber ?? null,
        notes: data.notes ?? null,
        paymentTerms: hasFinancialEdit ? (data.paymentTerms ?? null) : null,
        defaultDueDays: hasFinancialEdit ? (data.defaultDueDays ?? 30) : 30,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "customer.created",
      entityType: "Customer",
      entityId: customer.id,
      afterValue: { name: customer.name, customerCode: customer.customerCode },
    });

    revalidatePath("/customers");
    return ok("Customer created.", { id: customer.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCustomer(customerId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CUSTOMER_MANAGE);
    const data = customerCombinedFormSchema.parse(input);

    // Company-scoped: an id alone must never be enough to reach another
    // company's record.
    const before = await prisma.customer.findFirst({ where: { id: customerId, companyId: actor.companyId } });
    if (!before) return { success: false, message: "Customer not found." };

    await assertFinancialFieldAuthorization(actor, data.paymentTerms, data.defaultDueDays, {
      paymentTerms: before.paymentTerms,
      defaultDueDays: before.defaultDueDays,
    });
    const hasFinancialEdit = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);

    if (data.customerCode) {
      const duplicateCode = await prisma.customer.findFirst({
        where: { companyId: actor.companyId, customerCode: data.customerCode, NOT: { id: customerId } },
      });
      if (duplicateCode) return { success: false, fieldErrors: { customerCode: "This customer code is already in use." } };
    }
    const duplicateName = await prisma.customer.findFirst({
      where: { companyId: actor.companyId, archivedAt: null, name: { equals: data.name, mode: "insensitive" }, NOT: { id: customerId } },
    });
    if (duplicateName) return { success: false, fieldErrors: { name: "An active customer with this name already exists." } };

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        name: data.name,
        customerCode: data.customerCode ?? null,
        contactPerson: data.contactPerson ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        gstNumber: data.gstNumber ?? null,
        notes: data.notes ?? null,
        ...(hasFinancialEdit
          ? { paymentTerms: data.paymentTerms ?? null, defaultDueDays: data.defaultDueDays ?? before.defaultDueDays ?? 30 }
          : {}),
        updatedById: actor.id,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "customer.updated",
      entityType: "Customer",
      entityId: customer.id,
      beforeValue: { name: before.name, customerCode: before.customerCode, phone: before.phone, email: before.email },
      afterValue: { name: customer.name, customerCode: customer.customerCode, phone: customer.phone, email: customer.email },
    });

    if (hasFinancialEdit && (before.paymentTerms !== customer.paymentTerms || before.defaultDueDays !== customer.defaultDueDays)) {
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "customer.financial_terms_updated",
        entityType: "Customer",
        entityId: customer.id,
        beforeValue: { paymentTerms: before.paymentTerms, defaultDueDays: before.defaultDueDays },
        afterValue: { paymentTerms: customer.paymentTerms, defaultDueDays: customer.defaultDueDays },
      });
    }

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    return ok("Customer updated.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function archiveCustomer(customerId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CUSTOMER_MANAGE);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: actor.companyId } });
    if (!customer) return { success: false, message: "Customer not found." };

    await prisma.customer.update({ where: { id: customerId }, data: { archivedAt: new Date(), isActive: false, updatedById: actor.id } });

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "customer.archived", entityType: "Customer", entityId: customerId });

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    return ok("Customer archived.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreCustomer(customerId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CUSTOMER_MANAGE);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: actor.companyId } });
    if (!customer) return { success: false, message: "Customer not found." };

    await prisma.customer.update({ where: { id: customerId }, data: { archivedAt: null, isActive: true, updatedById: actor.id } });

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "customer.restored", entityType: "Customer", entityId: customerId });

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    return ok("Customer restored.");
  } catch (error) {
    return toActionError(error);
  }
}

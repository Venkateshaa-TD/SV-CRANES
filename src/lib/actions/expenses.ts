"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUser, requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { expenseFormSchema, expenseReviewSchema } from "@/lib/validation/expense";
import { validateExpenseAmount, validateRejectionReason } from "@/lib/business/expense";
import { assertPeriodNotLocked } from "@/lib/data/period-lock";
import { ok, toActionError, type ActionResult } from "./action-result";

export async function submitExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.EXPENSE_CREATE);
    const data = expenseFormSchema.parse(input);

    const category = await prisma.expenseCategory.findFirst({
      where: { id: data.categoryId, companyId: actor.companyId, isActive: true },
    });
    if (!category) return { success: false, fieldErrors: { categoryId: "Selected category was not found." } };

    if (data.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, companyId: actor.companyId } });
      if (!vehicle) return { success: false, message: "Selected vehicle was not found." };
    }
    if (data.projectId) {
      const project = await prisma.project.findFirst({ where: { id: data.projectId, companyId: actor.companyId } });
      if (!project) return { success: false, message: "Selected project was not found." };
    }

    const amount = new Prisma.Decimal(data.amount);
    validateExpenseAmount(amount);

    const expenseDate = new Date(data.expenseDate);
    if (Number.isNaN(expenseDate.getTime())) {
      return { success: false, fieldErrors: { expenseDate: "Enter a valid date." } };
    }
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: expenseDate, entityType: "Expense", action: "expense.submit" });

    const expense = await prisma.expense.create({
      data: {
        vehicleId: data.vehicleId ?? null,
        projectId: data.projectId ?? null,
        categoryId: category.id,
        amount,
        expenseDate,
        description: data.description ?? null,
        vendorName: data.vendorName ?? null,
        receiptFileId: data.receiptFileId ?? null,
        status: "PENDING",
        // Trusted server-side — never the client-supplied submitter.
        submittedById: actor.id,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "expense.submitted",
      entityType: "Expense",
      entityId: expense.id,
      afterValue: { amount: expense.amount.toString(), categoryId: expense.categoryId, status: expense.status },
    });

    revalidatePath("/expenses");
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
    return ok("Expense submitted for approval.", { id: expense.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function reviewExpense(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.EXPENSE_APPROVE);
    const data = expenseReviewSchema.parse(input);

    // Company-scoped: an id alone must never be enough to reach another
    // company's record.
    const expense = await prisma.expense.findFirst({
      where: { id: data.expenseId, submittedBy: { companyId: actor.companyId } },
    });
    if (!expense) return { success: false, message: "Expense not found." };

    if (expense.status !== "PENDING") {
      return { success: false, message: `This expense is already ${expense.status.toLowerCase()}.` };
    }

    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: expense.expenseDate, entityType: "Expense", entityId: expense.id, action: "expense.review" });

    if (data.decision === "REJECTED") {
      validateRejectionReason(data.reviewNote);
    }

    // Atomic guard against double-approval: the WHERE clause re-asserts
    // status: "PENDING" as part of the same UPDATE statement, so if two
    // reviewers submit a decision on the same expense nearly
    // simultaneously, only the first UPDATE (whichever the database
    // serializes first) actually changes any rows — the second sees 0
    // rows affected rather than silently overwriting the first decision.
    // The findFirst check above is for a fast, friendly error message
    // only; this is the real safety net.
    const result = await prisma.expense.updateMany({
      where: { id: data.expenseId, status: "PENDING" },
      data: {
        status: data.decision,
        approvedById: actor.id,
        approvedAt: new Date(),
        reviewNote: data.reviewNote ?? null,
        updatedById: actor.id,
      },
    });
    if (result.count === 0) {
      return { success: false, message: "This expense was already reviewed by someone else." };
    }

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: data.decision === "APPROVED" ? "expense.approved" : "expense.rejected",
      entityType: "Expense",
      entityId: expense.id,
      reason: data.reviewNote ?? null,
      afterValue: { status: data.decision },
    });

    revalidatePath("/expenses");
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
    return ok(data.decision === "APPROVED" ? "Expense approved." : "Expense rejected.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Editing an expense after it has already been approved is restricted to
 * the same permission that governs approval — an ordinary submitter can
 * no longer freely change it once reviewed. Pending/rejected expenses may
 * still be edited by their own submitter. */
export async function updateExpense(expenseId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUser();
    const before = await prisma.expense.findFirst({
      where: { id: expenseId, submittedBy: { companyId: actor.companyId } },
    });
    if (!before) return { success: false, message: "Expense not found." };

    if (before.status === "APPROVED") {
      const allowed = await can(actor, PERMISSIONS.EXPENSE_APPROVE);
      if (!allowed) {
        return { success: false, message: "This expense has already been approved and can no longer be edited." };
      }
    } else if (before.submittedById !== actor.id) {
      const allowed = await can(actor, PERMISSIONS.EXPENSE_APPROVE);
      if (!allowed) return { success: false, message: "You can only edit your own expenses." };
    }

    const data = expenseFormSchema.parse(input);
    const amount = new Prisma.Decimal(data.amount);
    validateExpenseAmount(amount);

    const category = await prisma.expenseCategory.findFirst({
      where: { id: data.categoryId, companyId: actor.companyId, isActive: true },
    });
    if (!category) return { success: false, fieldErrors: { categoryId: "Selected category was not found." } };

    const expenseDate = new Date(data.expenseDate);
    if (Number.isNaN(expenseDate.getTime())) {
      return { success: false, fieldErrors: { expenseDate: "Enter a valid date." } };
    }
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: before.expenseDate, entityType: "Expense", entityId: expenseId, action: "expense.update" });
    if (expenseDate.getTime() !== before.expenseDate.getTime()) {
      await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: expenseDate, entityType: "Expense", entityId: expenseId, action: "expense.update" });
    }

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        vehicleId: data.vehicleId ?? null,
        projectId: data.projectId ?? null,
        categoryId: category.id,
        amount,
        expenseDate,
        description: data.description ?? null,
        vendorName: data.vendorName ?? null,
        receiptFileId: data.receiptFileId ?? null,
        updatedById: actor.id,
      },
    });

    if (before.status === "APPROVED") {
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "expense.approved_expense_edited",
        entityType: "Expense",
        entityId: expenseId,
        beforeValue: { amount: before.amount.toString(), categoryId: before.categoryId },
        afterValue: { amount: updated.amount.toString(), categoryId: updated.categoryId },
      });
    }

    revalidatePath("/expenses");
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
    return ok("Expense updated.");
  } catch (error) {
    return toActionError(error);
  }
}

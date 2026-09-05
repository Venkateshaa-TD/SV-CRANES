"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { createEmployeeSchema, employeeFormSchema, resetPasswordSchema } from "@/lib/validation/employee";
import { ok, toActionError, type ActionResult } from "./action-result";

const PASSWORD_HASH_COST = 12;

export async function createEmployee(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const data = createEmployeeSchema.parse(input);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return { success: false, fieldErrors: { email: "An account with this email already exists." } };
    }

    const passwordHash = await hash(data.password, PASSWORD_HASH_COST);

    const employee = await prisma.user.create({
      data: {
        companyId: actor.companyId,
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        employeeCode: data.employeeCode ?? null,
        role: data.role,
        notes: data.notes ?? null,
        passwordHash,
        isActive: true,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "employee.created",
      entityType: "User",
      entityId: employee.id,
      afterValue: { name: employee.name, email: employee.email, role: employee.role },
    });

    revalidatePath("/admin/users");
    revalidatePath("/employees");
    return ok("Employee created.", { id: employee.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateEmployee(employeeId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const data = employeeFormSchema.parse(input);

    const before = await prisma.user.findFirst({ where: { id: employeeId, companyId: actor.companyId } });
    if (!before) return { success: false, message: "Employee not found." };

    const duplicateEmail = await prisma.user.findFirst({ where: { email: data.email, NOT: { id: employeeId } } });
    if (duplicateEmail) {
      return { success: false, fieldErrors: { email: "An account with this email already exists." } };
    }

    if (before.role === "SUPER_ADMIN" && data.role !== "SUPER_ADMIN" && before.id === actor.id) {
      return { success: false, message: "You cannot demote your own account." };
    }

    const employee = await prisma.user.update({
      where: { id: employeeId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        employeeCode: data.employeeCode ?? null,
        role: data.role,
        notes: data.notes ?? null,
      },
    });

    if (before.role !== employee.role) {
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "employee.role_changed",
        entityType: "User",
        entityId: employee.id,
        beforeValue: { role: before.role },
        afterValue: { role: employee.role },
      });
    }
    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "employee.updated",
      entityType: "User",
      entityId: employee.id,
      beforeValue: { name: before.name, email: before.email, phone: before.phone },
      afterValue: { name: employee.name, email: employee.email, phone: employee.phone },
    });

    revalidatePath("/admin/users");
    revalidatePath("/employees");
    return ok("Employee updated.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function setEmployeeActive(employeeId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.ADMIN_USERS_MANAGE);

    if (employeeId === actor.id && !isActive) {
      return { success: false, message: "You cannot deactivate your own account." };
    }

    const employee = await prisma.user.findFirst({ where: { id: employeeId, companyId: actor.companyId } });
    if (!employee) return { success: false, message: "Employee not found." };

    await prisma.user.update({ where: { id: employeeId }, data: { isActive } });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: isActive ? "employee.activated" : "employee.deactivated",
      entityType: "User",
      entityId: employeeId,
    });

    revalidatePath("/admin/users");
    revalidatePath("/employees");
    return ok(isActive ? "Employee activated." : "Employee deactivated.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetEmployeePassword(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const data = resetPasswordSchema.parse(input);

    const employee = await prisma.user.findFirst({ where: { id: data.userId, companyId: actor.companyId } });
    if (!employee) return { success: false, message: "Employee not found." };

    const passwordHash = await hash(data.password, PASSWORD_HASH_COST);
    await prisma.user.update({ where: { id: data.userId }, data: { passwordHash } });

    // Never include the password itself in the audit record.
    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "employee.password_reset",
      entityType: "User",
      entityId: data.userId,
    });

    return ok("Password reset.");
  } catch (error) {
    return toActionError(error);
  }
}

import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./permissions";

describe("ROLE_PERMISSIONS", () => {
  it("grants SUPER_ADMIN every permission in the catalogue", () => {
    const allPermissions = Object.values(PERMISSIONS);
    for (const permission of allPermissions) {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(permission);
    }
  });

  it("does not grant OPERATOR admin or financial-management permissions", () => {
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.ADMIN_USERS_MANAGE);
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.ADMIN_AUDIT_VIEW);
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.INVOICE_MANAGE);
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
  });

  it("does not grant any role CUSTOMER_FINANCIAL_EDIT by default", () => {
    // This permission is meant to be handed out to a small number of
    // individuals via UserPermission overrides, not baked into a role.
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === "SUPER_ADMIN") continue;
      expect(permissions).not.toContain(PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
    }
  });

  it("gives every non-admin role at least dashboard visibility", () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(permissions).toContain(PERMISSIONS.DASHBOARD_VIEW);
    }
  });
});

describe("Phase 1 operational authorization", () => {
  it("does not let OPERATOR manage vehicles", () => {
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.VEHICLE_MANAGE);
  });

  it("does not let OPERATOR approve daily logs or expenses (only create their own)", () => {
    expect(ROLE_PERMISSIONS.OPERATOR).toContain(PERMISSIONS.DAILY_LOG_CREATE);
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.DAILY_LOG_APPROVE);
    expect(ROLE_PERMISSIONS.OPERATOR).toContain(PERMISSIONS.EXPENSE_CREATE);
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.EXPENSE_APPROVE);
  });

  it("does not let OPERATOR manage employees", () => {
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.EMPLOYEE_MANAGE);
    expect(ROLE_PERMISSIONS.OPERATOR).not.toContain(PERMISSIONS.ADMIN_USERS_MANAGE);
  });

  it("does not let ACCOUNTANT touch meter data — no daily log or vehicle management access", () => {
    expect(ROLE_PERMISSIONS.ACCOUNTANT).not.toContain(PERMISSIONS.DAILY_LOG_CREATE);
    expect(ROLE_PERMISSIONS.ACCOUNTANT).not.toContain(PERMISSIONS.DAILY_LOG_APPROVE);
    expect(ROLE_PERMISSIONS.ACCOUNTANT).not.toContain(PERMISSIONS.VEHICLE_MANAGE);
  });

  it("lets MANAGER perform the permitted admin/manager actions", () => {
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.VEHICLE_MANAGE);
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.DAILY_LOG_APPROVE);
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.EXPENSE_APPROVE);
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.EMPLOYEE_MANAGE);
  });

  it("only grants ADMIN_USERS_MANAGE (employee create/role-change/password-reset) to SUPER_ADMIN", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === "SUPER_ADMIN") continue;
      expect(permissions).not.toContain(PERMISSIONS.ADMIN_USERS_MANAGE);
    }
  });
});

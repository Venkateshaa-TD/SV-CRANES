import type { UserRole } from "@prisma/client";

/**
 * Central permission catalogue. Every server-side authorization check goes
 * through one of these keys — never `if (role === "SUPER_ADMIN")` scattered
 * through UI/business code. Add new keys here as modules are implemented.
 *
 * Namespacing convention: "<module>:<action>" (and "<module>:<action>:scope"
 * for a narrower carve-out, e.g. customer financial editing).
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard:view",

  VEHICLE_VIEW: "vehicle:view",
  VEHICLE_MANAGE: "vehicle:manage",

  DAILY_LOG_VIEW: "dailyLog:view",
  DAILY_LOG_CREATE: "dailyLog:create",
  DAILY_LOG_APPROVE: "dailyLog:approve",

  FUEL_VIEW: "fuel:view",
  FUEL_CREATE: "fuel:create",

  EXPENSE_VIEW: "expense:view",
  EXPENSE_CREATE: "expense:create",
  EXPENSE_APPROVE: "expense:approve",

  CUSTOMER_VIEW: "customer:view",
  CUSTOMER_MANAGE: "customer:manage",
  /** Narrow override: editing a customer's financial data (balances,
   *  ledger adjustments). Distinct from CUSTOMER_MANAGE so it can be
   *  granted to specific individuals via UserPermission regardless of
   *  role. */
  CUSTOMER_FINANCIAL_EDIT: "customer:financial:edit",

  PROJECT_VIEW: "project:view",
  PROJECT_MANAGE: "project:manage",

  EMPLOYEE_VIEW: "employee:view",
  EMPLOYEE_MANAGE: "employee:manage",

  BILLING_VIEW: "billing:view",
  BILLING_MANAGE: "billing:manage",

  INVOICE_VIEW: "invoice:view",
  INVOICE_MANAGE: "invoice:manage",

  PAYMENT_VIEW: "payment:view",
  PAYMENT_MANAGE: "payment:manage",

  FINANCE_OUTSTANDING_VIEW: "finance:outstanding:view",
  FINANCE_LEDGER_VIEW: "finance:ledger:view",

  MAINTENANCE_VIEW: "maintenance:view",
  MAINTENANCE_MANAGE: "maintenance:manage",

  REPORT_VIEW: "report:view",

  APPROVALS_VIEW: "approvals:view",

  NOTIFICATION_VIEW: "notification:view",

  ADMIN_USERS_MANAGE: "admin:users:manage",
  ADMIN_AUDIT_VIEW: "admin:audit:view",
  ADMIN_SETTINGS_MANAGE: "admin:settings:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/**
 * Default permission set granted to each role. SUPER_ADMIN always receives
 * every permission (enforced in `hasPermission`, not just listed here) so
 * new permission keys are automatically available to the owner without
 * needing this map updated.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.VEHICLE_MANAGE,
    PERMISSIONS.DAILY_LOG_VIEW,
    PERMISSIONS.DAILY_LOG_CREATE,
    PERMISSIONS.DAILY_LOG_APPROVE,
    PERMISSIONS.FUEL_VIEW,
    PERMISSIONS.FUEL_CREATE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_CREATE,
    PERMISSIONS.EXPENSE_APPROVE,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_MANAGE,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.PROJECT_MANAGE,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.INVOICE_VIEW,
    PERMISSIONS.INVOICE_MANAGE,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.PAYMENT_MANAGE,
    PERMISSIONS.FINANCE_OUTSTANDING_VIEW,
    PERMISSIONS.FINANCE_LEDGER_VIEW,
    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.MAINTENANCE_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.APPROVALS_VIEW,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],

  ACCOUNTANT: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.FUEL_VIEW,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_APPROVE,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.INVOICE_VIEW,
    PERMISSIONS.INVOICE_MANAGE,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.PAYMENT_MANAGE,
    PERMISSIONS.FINANCE_OUTSTANDING_VIEW,
    PERMISSIONS.FINANCE_LEDGER_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],

  SUPERVISOR: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.DAILY_LOG_VIEW,
    PERMISSIONS.DAILY_LOG_CREATE,
    PERMISSIONS.DAILY_LOG_APPROVE,
    PERMISSIONS.FUEL_VIEW,
    PERMISSIONS.FUEL_CREATE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_CREATE,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.APPROVALS_VIEW,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],

  OPERATOR: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.DAILY_LOG_VIEW,
    PERMISSIONS.DAILY_LOG_CREATE,
    PERMISSIONS.FUEL_VIEW,
    PERMISSIONS.FUEL_CREATE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_CREATE,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],
};

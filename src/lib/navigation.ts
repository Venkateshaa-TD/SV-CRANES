import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

/**
 * Navigation icons are referenced by key, never by component reference.
 * This file is evaluated on the server (AppShell computes permitted nav
 * server-side) and its output crosses into Client Components (BottomNav,
 * NavLink) as props — React Server Component props must be plain
 * serializable data, and a Lucide icon is a function, which is not
 * serializable. Client components resolve the actual icon component from
 * this key locally via `NAV_ICONS` in `src/components/layout/nav-icons.tsx`.
 */
export type NavIconKey =
  | "dashboard"
  | "clipboard-list"
  | "truck"
  | "fuel"
  | "receipt"
  | "users"
  | "briefcase"
  | "user-cog"
  | "wallet"
  | "file-text"
  | "credit-card"
  | "landmark"
  | "book-open"
  | "wrench"
  | "bar-chart"
  | "check-square"
  | "bell"
  | "shield-check"
  | "history"
  | "settings"
  | "more";

export interface NavItem {
  label: string;
  href: string;
  iconKey: NavIconKey;
  permission: Permission;
  /** Shown in the mobile bottom bar (max 4, "More" is added as the 5th). */
  primary?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Single source of truth for the app's navigation. The mobile bottom nav,
 * the "More" sheet, and the desktop sidebar all render from this list and
 * filter by the current user's permissions — no navigation entry point
 * should be hand-duplicated elsewhere.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        iconKey: "dashboard",
        permission: PERMISSIONS.DASHBOARD_VIEW,
        primary: true,
      },
    ],
  },
  {
    label: "Fleet",
    items: [
      {
        label: "Daily Log",
        href: "/daily-logs",
        iconKey: "clipboard-list",
        permission: PERMISSIONS.DAILY_LOG_VIEW,
        primary: true,
      },
      {
        label: "Fleet",
        href: "/vehicles",
        iconKey: "truck",
        permission: PERMISSIONS.VEHICLE_VIEW,
        primary: true,
      },
      {
        label: "Fuel",
        href: "/fuel",
        iconKey: "fuel",
        permission: PERMISSIONS.FUEL_VIEW,
      },
      {
        label: "Expenses",
        href: "/expenses",
        iconKey: "receipt",
        permission: PERMISSIONS.EXPENSE_VIEW,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Customers",
        href: "/customers",
        iconKey: "users",
        permission: PERMISSIONS.CUSTOMER_VIEW,
      },
      {
        label: "Projects / Jobs",
        href: "/projects",
        iconKey: "briefcase",
        permission: PERMISSIONS.PROJECT_VIEW,
      },
      {
        label: "Employees",
        href: "/employees",
        iconKey: "user-cog",
        permission: PERMISSIONS.EMPLOYEE_VIEW,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Billing",
        href: "/finance/billing",
        iconKey: "wallet",
        permission: PERMISSIONS.BILLING_VIEW,
      },
      {
        label: "Invoices",
        href: "/finance/invoices",
        iconKey: "file-text",
        permission: PERMISSIONS.INVOICE_VIEW,
      },
      {
        label: "Payments",
        href: "/finance/payments",
        iconKey: "credit-card",
        permission: PERMISSIONS.PAYMENT_VIEW,
      },
      {
        label: "Outstanding",
        href: "/finance/outstanding",
        iconKey: "landmark",
        permission: PERMISSIONS.FINANCE_OUTSTANDING_VIEW,
      },
      {
        label: "Customer Ledger",
        href: "/finance/ledger",
        iconKey: "book-open",
        permission: PERMISSIONS.FINANCE_LEDGER_VIEW,
      },
    ],
  },
  {
    label: "Operations & Insights",
    items: [
      {
        label: "Maintenance",
        href: "/maintenance",
        iconKey: "wrench",
        permission: PERMISSIONS.MAINTENANCE_VIEW,
      },
      {
        label: "Reports",
        href: "/reports",
        iconKey: "bar-chart",
        permission: PERMISSIONS.REPORT_VIEW,
      },
      {
        label: "Approvals",
        href: "/approvals",
        iconKey: "check-square",
        permission: PERMISSIONS.APPROVALS_VIEW,
      },
      {
        label: "Notifications",
        href: "/notifications",
        iconKey: "bell",
        permission: PERMISSIONS.NOTIFICATION_VIEW,
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Users & Roles",
        href: "/admin/users",
        iconKey: "shield-check",
        permission: PERMISSIONS.ADMIN_USERS_MANAGE,
      },
      {
        label: "Audit Logs",
        href: "/admin/audit-logs",
        iconKey: "history",
        permission: PERMISSIONS.ADMIN_AUDIT_VIEW,
      },
      {
        label: "Settings",
        href: "/admin/settings",
        iconKey: "settings",
        permission: PERMISSIONS.ADMIN_SETTINGS_MANAGE,
      },
    ],
  },
];

export function getAllNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap((group) => group.items);
}

export function getPrimaryNavItems(): NavItem[] {
  return getAllNavItems().filter((item) => item.primary);
}

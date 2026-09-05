import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, AlertTriangle } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MonthSelector } from "@/components/finance/month-selector";
import { ClosingWorkflowActions } from "@/components/finance/closing-workflow-actions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { businessLocalDateParts } from "@/lib/business/business-time";
import { buildClosingChecklist, type ChecklistGroup } from "@/lib/business/closing-period";
import { getClosingChecklistCounts, getClosingPeriodById } from "@/lib/data/closing-queries";
import { getOrCreateClosingPeriod } from "@/lib/actions/closing-periods";
import { formatDate, formatDateTime, formatMonthYear } from "@/lib/format";

export const metadata: Metadata = { title: "Month Closing" };

interface ClosingPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default function ClosingPage(props: ClosingPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.CLOSING_VIEW}>
      <ClosingPageContent {...props} />
    </PermissionGate>
  );
}

const GROUP_LABELS: Record<ChecklistGroup, string> = {
  OPERATIONS: "Operations",
  EXPENSES: "Expenses",
  BILLING: "Billing",
  INVOICES: "Invoices",
};

/** Where "View" sends the user for each checklist item, scoped to the
 * period's own date range where the underlying list page supports a
 * from/to filter. Some items (missing logs, missing billing config) have
 * no dedicated record to jump to, so they link to the closest relevant
 * list instead. */
const ITEM_LINKS: Record<string, (range: { from: string; to: string }) => string> = {
  flaggedDailyLogs: (r) => `/daily-logs?from=${r.from}&to=${r.to}`,
  missingDailyLogs: () => `/vehicles?status=WORKING`,
  pendingExpenses: () => `/expenses?status=PENDING`,
  missingExpenseReceipts: () => `/expenses`,
  fuelAnomalies: (r) => `/fuel?from=${r.from}&to=${r.to}`,
  missingFuelReceipts: (r) => `/fuel?from=${r.from}&to=${r.to}`,
  projectsMissingBillingConfig: () => `/projects?status=ACTIVE`,
  unfinalizedBillingDrafts: () => `/finance/billing`,
  draftInvoices: (r) => `/finance/invoices?status=DRAFT&from=${r.from}&to=${r.to}`,
};

const GROUPS: ChecklistGroup[] = ["OPERATIONS", "EXPENSES", "BILLING", "INVOICES"];

async function ClosingPageContent({ searchParams }: ClosingPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const businessToday = businessLocalDateParts(new Date());
  const requestedYear = params.year ? Number(params.year) : NaN;
  const requestedMonth = params.month ? Number(params.month) : NaN;
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : businessToday.year;
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : businessToday.month;

  const created = await getOrCreateClosingPeriod({ year, month });
  if (!created.success || !created.data) {
    return (
      <div>
        <PageHeader title="Month Closing" />
        <p className="text-sm text-destructive">{created.message ?? "Could not load this month."}</p>
      </div>
    );
  }

  const [period, canManage, canReopen] = await Promise.all([
    getClosingPeriodById(actor.companyId, created.data.id),
    can(actor, PERMISSIONS.CLOSING_MANAGE),
    can(actor, PERMISSIONS.CLOSING_REOPEN),
  ]);

  if (!period) {
    return (
      <div>
        <PageHeader title="Month Closing" />
        <p className="text-sm text-destructive">Closing period not found.</p>
      </div>
    );
  }

  const counts = await getClosingChecklistCounts(actor.companyId, { startDate: period.startDate, endDate: period.endDate });
  const checklist = buildClosingChecklist(counts);
  const range = { from: period.startDate.toISOString().slice(0, 10), to: period.endDate.toISOString().slice(0, 10) };

  return (
    <div>
      <PageHeader title="Month Closing" description="Validate, review, and lock a month's operational and financial records." />

      <div className="mb-4">
        <MonthSelector year={year} month={month} />
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-foreground">{formatMonthYear(period.year, period.month)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(period.startDate)} – {formatDate(period.endDate)}
              </p>
            </div>
            <StatusBadge status={period.status} />
          </div>
          {period.status === "CLOSED" ? (
            <p className="text-xs text-muted-foreground">
              Closed {formatDateTime(period.closedAt)} by {period.closedBy?.name ?? "—"}
              {period.overrideReason ? ` — closed over warnings: "${period.overrideReason}"` : ""}
            </p>
          ) : null}
          {period.status === "REOPENED" ? (
            <p className="text-xs text-muted-foreground">
              Reopened {formatDateTime(period.reopenedAt)} by {period.reopenedBy?.name ?? "—"} — &ldquo;{period.reopenReason}&rdquo;
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Blockers"
          value={String(checklist.blockerCount)}
          icon={ShieldAlert}
          tone={checklist.blockerCount > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="Warnings"
          value={String(checklist.warningCount)}
          icon={AlertTriangle}
          tone={checklist.warningCount > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mb-4 space-y-4">
        {GROUPS.map((group) => {
          const items = checklist.items.filter((item) => item.group === group);
          return (
            <Card key={group}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{GROUP_LABELS[group]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {items.map((item) => {
                  const href = item.count > 0 ? ITEM_LINKS[item.key]?.(range) : undefined;
                  return (
                    <div key={item.key} className="flex items-center justify-between gap-2 border-t border-border/60 py-2 first:border-t-0 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.severity === "BLOCKER" ? "Blocker" : "Warning"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            item.count === 0 ? "text-muted-foreground" : item.severity === "BLOCKER" ? "text-destructive" : "text-warning-foreground"
                          }`}
                        >
                          {item.count}
                        </span>
                        {href ? (
                          <Link href={href} className="text-xs font-medium text-primary hover:underline">
                            View
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ClosingWorkflowActions
        periodId={period.id}
        status={period.status}
        blockerCount={checklist.blockerCount}
        warningCount={checklist.warningCount}
        canManage={canManage}
        canReopen={canReopen}
      />
    </div>
  );
}

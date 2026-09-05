import type { Metadata } from "next";
import Link from "next/link";
import {
  Truck,
  Activity,
  PauseCircle,
  Wrench,
  Clock,
  Fuel,
  Receipt,
  ClipboardList,
  Plus,
  AlertTriangle,
  CheckSquare,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getDashboardStats,
  getPeriodRange,
  getPendingExpenseCount,
  getRecentDailyLogs,
  getRecentFuelEntries,
  getWorkingVehiclesMissingTodaysLog,
  type DashboardPeriod,
} from "./queries";

export const metadata: Metadata = { title: "Dashboard" };

const numberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

interface DashboardPageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const period: DashboardPeriod = params.period === "today" || params.period === "week" ? params.period : "month";

  const user = await requireCurrentUser();
  const [stats, recentLogs, recentFuel, pendingExpenseCount, missingLogVehicles, permissions] = await Promise.all([
    getDashboardStats(user.companyId, period),
    getRecentDailyLogs(user.companyId),
    getRecentFuelEntries(user.companyId),
    getPendingExpenseCount(user.companyId),
    getWorkingVehiclesMissingTodaysLog(user.companyId),
    Promise.all([
      can(user, PERMISSIONS.DAILY_LOG_CREATE),
      can(user, PERMISSIONS.FUEL_CREATE),
      can(user, PERMISSIONS.EXPENSE_CREATE),
      can(user, PERMISSIONS.VEHICLE_MANAGE),
      can(user, PERMISSIONS.APPROVALS_VIEW),
    ]).then(([canLog, canFuel, canExpense, canVehicle, canApprovals]) => ({ canLog, canFuel, canExpense, canVehicle, canApprovals })),
  ]);

  const { label: periodLabel } = getPeriodRange(period);
  const isOperator = user.role === "OPERATOR";

  return (
    <div>
      <PageHeader title="Dashboard" description="Fleet status and operations at a glance." />

      <div className="mb-5 flex gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "month" ? "/dashboard" : `/dashboard?period=${p.key}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              p.key === period ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Quick actions — operators see "Add Daily Log" as the strongest action.
          min-w-0 on every grid item + whitespace-normal on the button label
          is required here: a nowrap button label is wider than its 2-column
          grid track at 320-375px and would otherwise force page-level
          horizontal overflow. */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {permissions.canLog ? (
          <div className={cn("min-w-0", isOperator && "col-span-2 sm:col-span-1")}>
            <Button asChild size="lg" className="h-auto w-full whitespace-normal py-3 text-center">
              <Link href="/daily-logs/new">
                <Plus className="shrink-0" /> Add Daily Log
              </Link>
            </Button>
          </div>
        ) : null}
        {permissions.canFuel ? (
          <div className="min-w-0">
            <Button asChild variant="outline" size="lg" className="h-auto w-full whitespace-normal py-3 text-center">
              <Link href="/fuel/new">
                <Plus className="shrink-0" /> Add Fuel
              </Link>
            </Button>
          </div>
        ) : null}
        {permissions.canExpense ? (
          <div className="min-w-0">
            <Button asChild variant="outline" size="lg" className="h-auto w-full whitespace-normal py-3 text-center">
              <Link href="/expenses/new">
                <Plus className="shrink-0" /> Submit Expense
              </Link>
            </Button>
          </div>
        ) : null}
        {permissions.canVehicle ? (
          <div className="min-w-0">
            <Button asChild variant="outline" size="lg" className="h-auto w-full whitespace-normal py-3 text-center">
              <Link href="/vehicles/new">
                <Plus className="shrink-0" /> Add Vehicle
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total Vehicles" value={String(stats.totalVehicles)} icon={Truck} />
        <StatCard label="Working" value={String(stats.working)} icon={Activity} tone="success" />
        <StatCard label="Idle" value={String(stats.idle)} icon={PauseCircle} tone="warning" />
        <StatCard label="Maintenance" value={String(stats.maintenance)} icon={Wrench} tone="destructive" />

        <StatCard label={`Working Hours (${periodLabel})`} value={numberFormatter.format(stats.workingHours)} icon={Clock} />
        <StatCard label={`Fuel Consumed (${periodLabel})`} value={`${numberFormatter.format(stats.fuelLiters)} L`} icon={Fuel} />
        <StatCard label={`Fuel Cost (${periodLabel})`} value={currencyFormatter.format(stats.fuelCost)} icon={Fuel} />
        <StatCard label={`Approved Expenses (${periodLabel})`} value={currencyFormatter.format(stats.approvedOtherExpenses)} icon={Receipt} />
      </div>

      {missingLogVehicles.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="size-4 text-warning-foreground" /> Working vehicles with no log today
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {missingLogVehicles.map((v) => (
                <Link key={v.id} href={`/vehicles/${v.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-accent/40">
                  <span className="min-w-0 truncate font-medium text-foreground">{v.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{v.registrationNumber}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {permissions.canApprovals && pendingExpenseCount > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Pending Approvals</h2>
          <Link href="/approvals">
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <CheckSquare className="size-4 text-warning-foreground" />
                  <span className="text-sm font-medium text-foreground">{pendingExpenseCount} expense(s) awaiting review</span>
                </div>
                <span className="text-sm text-primary">Review →</span>
              </CardContent>
            </Card>
          </Link>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recent Daily Logs</h2>
        {recentLogs.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No daily logs yet" />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{log.vehicle.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.operator.name} · {dateTimeFormatter.format(log.logDate)}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{log.workingHours?.toString() ?? "—"} hrs</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recent Fuel Entries</h2>
        {recentFuel.length === 0 ? (
          <EmptyState icon={Fuel} title="No fuel entries yet" />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recentFuel.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{entry.vehicle.name}</p>
                    <p className="text-xs text-muted-foreground">{dateTimeFormatter.format(entry.entryDate)}</p>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{currencyFormatter.format(Number(entry.totalCost))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

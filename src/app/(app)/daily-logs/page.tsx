import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ClipboardList, AlertTriangle } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { DateRangeFilter } from "@/components/data/date-range-filter";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { AttachmentLink } from "@/components/shared/attachment-link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveVehicleOptions, listActiveEmployeeOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Daily Log" };

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

type LogRow = Awaited<ReturnType<typeof loadLogs>>[number];

async function loadLogs(companyId: string, params: { vehicleId?: string; operatorId?: string; from?: string; to?: string }) {
  return prisma.dailyLog.findMany({
    where: {
      archivedAt: null,
      vehicle: { companyId },
      vehicleId: params.vehicleId && params.vehicleId !== "all" ? params.vehicleId : undefined,
      operatorId: params.operatorId && params.operatorId !== "all" ? params.operatorId : undefined,
      logDate: {
        gte: params.from ? new Date(params.from) : undefined,
        lte: params.to ? new Date(params.to) : undefined,
      },
    },
    include: {
      vehicle: { select: { name: true, registrationNumber: true } },
      operator: { select: { name: true } },
      meterPhoto: { select: { storageKey: true } },
      sitePhoto: { select: { storageKey: true } },
    },
    orderBy: { logDate: "desc" },
    take: 100,
  });
}

interface DailyLogsPageProps {
  searchParams: Promise<{ vehicleId?: string; operatorId?: string; from?: string; to?: string }>;
}

export default function DailyLogsPage(props: DailyLogsPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.DAILY_LOG_VIEW}>
      <DailyLogsPageContent {...props} />
    </PermissionGate>
  );
}

async function DailyLogsPageContent({ searchParams }: DailyLogsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;

  const [logs, vehicles, employees, canCreate] = await Promise.all([
    loadLogs(user.companyId, params),
    listActiveVehicleOptions(user.companyId),
    listActiveEmployeeOptions(user.companyId),
    can(user, PERMISSIONS.DAILY_LOG_CREATE),
  ]);

  const columns: DataColumn<LogRow>[] = [
    {
      header: "Date",
      cell: (l) => (
        <Link href={`/daily-logs/${l.id}/edit`} className="font-medium hover:underline">
          {dateFormatter.format(l.logDate)}
        </Link>
      ),
    },
    { header: "Vehicle", cell: (l) => l.vehicle.name },
    { header: "Operator", cell: (l) => l.operator.name },
    { header: "Working Hrs", cell: (l) => l.workingHours?.toString() ?? "—", align: "right" },
    { header: "Flag", cell: (l) => (l.flaggedForReview ? <AlertTriangle className="size-4 text-warning-foreground" /> : "—") },
    {
      header: "Photos",
      cell: (l) =>
        l.meterPhoto || l.sitePhoto ? (
          <div className="flex flex-col gap-0.5">
            {l.meterPhoto ? <AttachmentLink label="Meter" storageKey={l.meterPhoto.storageKey} /> : null}
            {l.sitePhoto ? <AttachmentLink label="Site" storageKey={l.sitePhoto.storageKey} /> : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Daily Log"
        description="Operator hour-meter and odometer entries per vehicle, per day."
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/daily-logs/new">
                <Plus /> Add Daily Log
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ListFilterBar
          hideSearch
          filters={[
            { paramKey: "vehicleId", label: "Vehicle", options: vehicles.map((v) => ({ value: v.id, label: v.name })) },
            { paramKey: "operatorId", label: "Operator", options: employees.map((e) => ({ value: e.id, label: e.name })) },
          ]}
        />
        <DateRangeFilter />
      </div>

      <ResponsiveDataView
        data={logs}
        keyField={(l) => l.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No daily logs yet"
            description="Logs your team submits will show up here."
            action={
              canCreate ? (
                <Button asChild size="sm">
                  <Link href="/daily-logs/new">
                    <Plus /> Add Daily Log
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(l) => (
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <Link href={`/daily-logs/${l.id}/edit`} className="block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{dateFormatter.format(l.logDate)}</p>
                  {l.flaggedForReview ? <AlertTriangle className="size-4 shrink-0 text-warning-foreground" aria-label="Flagged for review" /> : null}
                </div>
                <p className="text-sm text-foreground">{l.vehicle.name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.operator.name} · {l.workingHours?.toString() ?? "—"} hrs
                </p>
              </Link>
              {l.meterPhoto || l.sitePhoto ? (
                <div className="flex gap-3 pt-1">
                  {l.meterPhoto ? <AttachmentLink label="Meter photo" storageKey={l.meterPhoto.storageKey} /> : null}
                  {l.sitePhoto ? <AttachmentLink label="Site photo" storageKey={l.sitePhoto.storageKey} /> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}

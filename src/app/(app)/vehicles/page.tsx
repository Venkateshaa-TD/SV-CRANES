import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck, Archive } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Fleet" };

const VEHICLE_STATUS_OPTIONS = [
  { value: "WORKING", label: "Working" },
  { value: "IDLE", label: "Idle" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "OUT_OF_SERVICE", label: "Out of Service" },
];

const VEHICLE_CATEGORY_OPTIONS = [
  { value: "CRANE", label: "Crane" },
  { value: "TRUCK", label: "Truck" },
  { value: "TRAILER", label: "Trailer" },
  { value: "PICKUP", label: "Pickup" },
  { value: "OTHER", label: "Other" },
];

type VehicleRow = Awaited<ReturnType<typeof loadVehicles>>[number];

async function loadVehicles(companyId: string, params: { q?: string; status?: string; category?: string; archived?: string }) {
  const showArchived = params.archived === "1";
  return prisma.vehicle.findMany({
    where: {
      companyId,
      archivedAt: showArchived ? { not: null } : null,
      status: params.status && params.status !== "all" ? (params.status as never) : undefined,
      category: params.category && params.category !== "all" ? (params.category as never) : undefined,
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { registrationNumber: { contains: params.q, mode: "insensitive" } },
              { code: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { assignedOperator: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 100,
  });
}

function formatMeter(vehicle: VehicleRow): string {
  const parts: string[] = [];
  if (vehicle.currentHourMeter != null) parts.push(`${vehicle.currentHourMeter.toString()} hrs`);
  if (vehicle.currentOdometer != null) parts.push(`${vehicle.currentOdometer.toString()} km`);
  return parts.length > 0 ? parts.join(" · ") : "No readings yet";
}

interface VehiclesPageProps {
  searchParams: Promise<{ q?: string; status?: string; category?: string; archived?: string }>;
}

export default async function VehiclesPage({ searchParams }: VehiclesPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.VEHICLE_VIEW}>
      <VehiclesPageContent searchParams={searchParams} />
    </PermissionGate>
  );
}

async function VehiclesPageContent({ searchParams }: VehiclesPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [vehicles, canManage] = await Promise.all([
    loadVehicles(user.companyId, params),
    can(user, PERMISSIONS.VEHICLE_MANAGE),
  ]);
  const showArchived = params.archived === "1";

  const columns: DataColumn<VehicleRow>[] = [
    {
      header: "Vehicle",
      cell: (v) => (
        <Link href={`/vehicles/${v.id}`} className="block min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{v.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {v.registrationNumber}
            {v.code ? ` · ${v.code}` : ""}
          </p>
        </Link>
      ),
    },
    { header: "Type", cell: (v) => v.category.charAt(0) + v.category.slice(1).toLowerCase() },
    { header: "Status", cell: (v) => <StatusBadge status={v.status} /> },
    { header: "Operator", cell: (v) => v.assignedOperator?.name ?? "—" },
    { header: "Readings", cell: (v) => formatMeter(v), align: "right" },
  ];

  return (
    <div>
      <PageHeader
        title="Fleet"
        description={showArchived ? "Archived vehicles." : "Vehicles and cranes in active service."}
        action={
          canManage ? (
            <Button asChild>
              <Link href="/vehicles/new">
                <Plus /> Add Vehicle
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListFilterBar
          searchPlaceholder="Search name, registration, code…"
          filters={[
            { paramKey: "status", label: "Status", options: VEHICLE_STATUS_OPTIONS },
            { paramKey: "category", label: "Type", options: VEHICLE_CATEGORY_OPTIONS },
          ]}
        />
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href={showArchived ? "/vehicles" : "/vehicles?archived=1"}>
            <Archive /> {showArchived ? "View active" : "View archived"}
          </Link>
        </Button>
      </div>

      <ResponsiveDataView
        data={vehicles}
        keyField={(v) => v.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={showArchived ? Archive : Truck}
            title={showArchived ? "No archived vehicles" : "No vehicles yet"}
            description={
              showArchived
                ? "Archived vehicles will show up here."
                : canManage
                  ? "Add your first vehicle to start tracking daily logs, fuel, and expenses."
                  : "No vehicles match your filters yet."
            }
            action={
              !showArchived && canManage ? (
                <Button asChild size="sm">
                  <Link href="/vehicles/new">
                    <Plus /> Add Vehicle
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(v) => (
          <Link href={`/vehicles/${v.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{v.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.registrationNumber}
                      {v.code ? ` · ${v.code}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={v.status} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{v.category.charAt(0) + v.category.slice(1).toLowerCase()}</span>
                  <span>{v.assignedOperator?.name ?? "Unassigned"}</span>
                  <span className="tabular-nums">{formatMeter(v)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}

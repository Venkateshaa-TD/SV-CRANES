import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Clock, Gauge, Fuel as FuelIcon, Receipt, ClipboardList, Plus } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { UrlTabs } from "@/components/shared/url-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { AttachmentLink } from "@/components/shared/attachment-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { computeFuelEfficiency } from "@/lib/business/fuel";

interface VehicleDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export async function generateMetadata({ params }: VehicleDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { name: true } });
  return { title: vehicle?.name ?? "Vehicle" };
}

export default function VehicleDetailPage(props: VehicleDetailPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.VEHICLE_VIEW}>
      <VehicleDetailContent {...props} />
    </PermissionGate>
  );
}

async function VehicleDetailContent({ params, searchParams }: VehicleDetailPageProps) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const user = await requireCurrentUser();

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, companyId: user.companyId },
    include: { assignedOperator: { select: { name: true } }, image: { select: { storageKey: true } } },
  });
  if (!vehicle) notFound();

  const canManage = await can(user, PERMISSIONS.VEHICLE_MANAGE);
  const canLogWork = await can(user, PERMISSIONS.DAILY_LOG_CREATE);
  const canAddFuel = await can(user, PERMISSIONS.FUEL_CREATE);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [monthLogsAgg, monthFuelAgg, monthExpenseAgg] = await Promise.all([
    prisma.dailyLog.aggregate({
      where: { vehicleId: id, logDate: { gte: monthStart }, archivedAt: null },
      _sum: { workingHours: true, distance: true },
    }),
    prisma.fuelEntry.aggregate({
      where: { vehicleId: id, entryDate: { gte: monthStart }, archivedAt: null },
      _sum: { quantityLiters: true, totalCost: true },
    }),
    prisma.expense.aggregate({
      where: { vehicleId: id, expenseDate: { gte: monthStart }, archivedAt: null, status: "APPROVED" },
      _sum: { amount: true },
    }),
  ]);

  const workingHours = Number(monthLogsAgg._sum.workingHours ?? 0);
  const distance = Number(monthLogsAgg._sum.distance ?? 0);
  const fuelLiters = Number(monthFuelAgg._sum.quantityLiters ?? 0);
  const approvedExpenses = Number(monthExpenseAgg._sum.amount ?? 0);
  const efficiency = computeFuelEfficiency({
    category: vehicle.category,
    totalLiters: fuelLiters,
    totalWorkingHours: workingHours,
    totalDistanceKm: distance,
  });

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-tight text-foreground">{vehicle.name}</h1>
            <StatusBadge status={vehicle.status} className="shrink-0" />
          </div>
          <p className="text-sm text-muted-foreground">
            {vehicle.registrationNumber}
            {vehicle.code ? ` · ${vehicle.code}` : ""} · {vehicle.assignedOperator?.name ?? "Unassigned"}
          </p>
        </div>
        {canManage ? (
          <Button asChild variant="outline" size="sm" className="w-fit shrink-0">
            <Link href={`/vehicles/${id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Hour Meter" value={vehicle.currentHourMeter?.toString() ?? "—"} icon={Clock} />
        <StatCard label="Odometer" value={vehicle.currentOdometer ? `${vehicle.currentOdometer.toString()} km` : "—"} icon={Gauge} />
        <StatCard label="Working Hrs (MTD)" value={workingHours.toFixed(1)} icon={Clock} />
        <StatCard label="Fuel (MTD)" value={`${fuelLiters.toFixed(0)} L`} icon={FuelIcon} />
        <StatCard label="Approved Exp. (MTD)" value={currencyFormatter.format(approvedExpenses)} icon={Receipt} />
      </div>

      <UrlTabs
        basePath={`/vehicles/${id}`}
        activeKey={tab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "logs", label: "Daily Logs" },
          { key: "fuel", label: "Fuel" },
          { key: "expenses", label: "Expenses" },
        ]}
      />

      {tab === "logs" ? (
        <VehicleLogsTab vehicleId={id} canLogWork={canLogWork} />
      ) : tab === "fuel" ? (
        <VehicleFuelTab vehicleId={id} canAddFuel={canAddFuel} efficiency={efficiency} />
      ) : tab === "expenses" ? (
        <VehicleExpensesTab vehicleId={id} />
      ) : (
        <VehicleOverviewTab vehicle={vehicle} />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function VehicleOverviewTab({
  vehicle,
}: {
  vehicle: NonNullable<Awaited<ReturnType<typeof prisma.vehicle.findFirst>>> & {
    assignedOperator: { name: string } | null;
    image: { storageKey: string } | null;
  };
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-4 border-b border-border pb-3">
          <span className="text-sm text-muted-foreground">Vehicle photo</span>
          <AttachmentLink label="View photo" storageKey={vehicle.image?.storageKey} />
        </div>
        <DetailRow label="Type" value={vehicle.category.charAt(0) + vehicle.category.slice(1).toLowerCase()} />
        <DetailRow label="Make / Model" value={[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"} />
        <DetailRow label="Year" value={vehicle.year ?? "—"} />
        <DetailRow label="Capacity" value={vehicle.capacityTons ? `${vehicle.capacityTons.toString()} t` : "—"} />
        <DetailRow label="Fuel Type" value={vehicle.fuelType ?? "—"} />
        <DetailRow label="Assigned Operator" value={vehicle.assignedOperator?.name ?? "Unassigned"} />
        <DetailRow
          label="Purchase Date"
          value={vehicle.purchaseDate ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(vehicle.purchaseDate) : "—"}
        />
        <DetailRow label="Purchase Amount" value={vehicle.purchaseAmount ? currencyFormatter.format(Number(vehicle.purchaseAmount)) : "—"} />
        {vehicle.notes ? (
          <div className="pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{vehicle.notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function VehicleLogsTab({ vehicleId, canLogWork }: { vehicleId: string; canLogWork: boolean }) {
  const logs = await prisma.dailyLog.findMany({
    where: { vehicleId, archivedAt: null },
    include: {
      operator: { select: { name: true } },
      meterPhoto: { select: { storageKey: true } },
      sitePhoto: { select: { storageKey: true } },
    },
    orderBy: { logDate: "desc" },
    take: 30,
  });

  const columns: DataColumn<(typeof logs)[number]>[] = [
    {
      header: "Date",
      cell: (l) => (
        <Link href={`/daily-logs/${l.id}/edit`} className="font-medium hover:underline">
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(l.logDate)}
        </Link>
      ),
    },
    { header: "Operator", cell: (l) => l.operator.name },
    { header: "Working Hrs", cell: (l) => l.workingHours?.toString() ?? "—", align: "right" },
    { header: "Distance", cell: (l) => (l.distance ? `${l.distance.toString()} km` : "—"), align: "right" },
    { header: "Flag", cell: (l) => (l.flaggedForReview ? <span className="text-warning-foreground">Review</span> : "—") },
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
    <div className="space-y-3">
      {canLogWork ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/daily-logs/new?vehicleId=${vehicleId}`}>
              <Plus /> Add Daily Log
            </Link>
          </Button>
        </div>
      ) : null}
      <ResponsiveDataView
        data={logs}
        keyField={(l) => l.id}
        columns={columns}
        emptyState={<EmptyState icon={ClipboardList} title="No daily logs yet" description="Logs for this vehicle will appear here." />}
        renderCard={(l) => (
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <Link href={`/daily-logs/${l.id}/edit`} className="block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(l.logDate)}</p>
                  {l.flaggedForReview ? <span className="text-xs font-medium text-warning-foreground">Flagged</span> : null}
                </div>
                <p className="text-xs text-muted-foreground">{l.operator.name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.workingHours?.toString() ?? "—"} hrs · {l.distance ? `${l.distance.toString()} km` : "—"}
                </p>
              </Link>
              {/* Outside the Link above — an <a> cannot nest inside
                  another <a>, so these attachment links are siblings, not
                  children, of the card's navigation link. */}
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

async function VehicleFuelTab({
  vehicleId,
  canAddFuel,
  efficiency,
}: {
  vehicleId: string;
  canAddFuel: boolean;
  efficiency: ReturnType<typeof computeFuelEfficiency>;
}) {
  const entries = await prisma.fuelEntry.findMany({
    where: { vehicleId, archivedAt: null },
    include: { receipt: { select: { storageKey: true } } },
    orderBy: { entryDate: "desc" },
    take: 30,
  });

  const columns: DataColumn<(typeof entries)[number]>[] = [
    {
      header: "Date",
      cell: (e) => (
        <Link href={`/fuel/${e.id}/edit`} className="font-medium hover:underline">
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(e.entryDate)}
        </Link>
      ),
    },
    { header: "Litres", cell: (e) => e.quantityLiters.toString(), align: "right" },
    { header: "Total", cell: (e) => currencyFormatter.format(Number(e.totalCost)), align: "right" },
    { header: "Vendor", cell: (e) => e.vendorName ?? "—" },
    { header: "Receipt", cell: (e) => <AttachmentLink label="View" storageKey={e.receipt?.storageKey} /> },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-center justify-between p-4 text-sm">
          <span className="text-muted-foreground">This month&apos;s efficiency</span>
          <span className="font-medium text-foreground">
            {efficiency.available ? `${efficiency.value.toString()} ${efficiency.unit}` : efficiency.reason}
          </span>
        </CardContent>
      </Card>
      {canAddFuel ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/fuel/new?vehicleId=${vehicleId}`}>
              <Plus /> Add Fuel Entry
            </Link>
          </Button>
        </div>
      ) : null}
      <ResponsiveDataView
        data={entries}
        keyField={(e) => e.id}
        columns={columns}
        emptyState={<EmptyState icon={FuelIcon} title="No fuel entries yet" description="Fuel fill-ups for this vehicle will appear here." />}
        renderCard={(e) => (
          <Card>
            <CardContent className="space-y-1 p-4">
              <Link href={`/fuel/${e.id}/edit`} className="block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(e.entryDate)}</p>
                  <p className="font-medium tabular-nums text-foreground">{currencyFormatter.format(Number(e.totalCost))}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {e.quantityLiters.toString()} L · {e.vendorName ?? "No vendor recorded"}
                </p>
              </Link>
              {e.receipt ? (
                <div className="pt-1">
                  <AttachmentLink label="View receipt" storageKey={e.receipt.storageKey} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}

async function VehicleExpensesTab({ vehicleId }: { vehicleId: string }) {
  const expenses = await prisma.expense.findMany({
    where: { vehicleId, archivedAt: null },
    include: { category: { select: { name: true } }, receipt: { select: { storageKey: true } } },
    orderBy: { expenseDate: "desc" },
    take: 30,
  });

  const columns: DataColumn<(typeof expenses)[number]>[] = [
    {
      header: "Date",
      cell: (e) => (
        <Link href={`/expenses/${e.id}/edit`} className="font-medium hover:underline">
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(e.expenseDate)}
        </Link>
      ),
    },
    { header: "Category", cell: (e) => e.category.name },
    { header: "Amount", cell: (e) => currencyFormatter.format(Number(e.amount)), align: "right" },
    { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
    { header: "Receipt", cell: (e) => <AttachmentLink label="View" storageKey={e.receipt?.storageKey} /> },
  ];

  return (
    <ResponsiveDataView
      data={expenses}
      keyField={(e) => e.id}
      columns={columns}
      emptyState={<EmptyState icon={Receipt} title="No expenses yet" description="Expenses for this vehicle will appear here." />}
      renderCard={(e) => (
        <Card>
          <CardContent className="space-y-1 p-4">
            <Link href={`/expenses/${e.id}/edit`} className="block space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-foreground">{e.category.name}</p>
                <StatusBadge status={e.status} className="shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(e.expenseDate)} ·{" "}
                {currencyFormatter.format(Number(e.amount))}
              </p>
            </Link>
            {e.receipt ? (
              <div className="pt-1">
                <AttachmentLink label="View receipt" storageKey={e.receipt.storageKey} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    />
  );
}

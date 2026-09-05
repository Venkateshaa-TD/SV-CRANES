import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Fuel as FuelIcon } from "lucide-react";

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
import { listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Fuel" };

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type FuelRow = Awaited<ReturnType<typeof loadEntries>>[number];

async function loadEntries(companyId: string, params: { vehicleId?: string; from?: string; to?: string }) {
  return prisma.fuelEntry.findMany({
    where: {
      archivedAt: null,
      vehicle: { companyId },
      vehicleId: params.vehicleId && params.vehicleId !== "all" ? params.vehicleId : undefined,
      entryDate: {
        gte: params.from ? new Date(params.from) : undefined,
        lte: params.to ? new Date(params.to) : undefined,
      },
    },
    include: { vehicle: { select: { name: true } }, receipt: { select: { storageKey: true } } },
    orderBy: { entryDate: "desc" },
    take: 100,
  });
}

interface FuelPageProps {
  searchParams: Promise<{ vehicleId?: string; from?: string; to?: string }>;
}

export default function FuelPage(props: FuelPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.FUEL_VIEW}>
      <FuelPageContent {...props} />
    </PermissionGate>
  );
}

async function FuelPageContent({ searchParams }: FuelPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [entries, vehicles, canCreate] = await Promise.all([
    loadEntries(user.companyId, params),
    listActiveVehicleOptions(user.companyId),
    can(user, PERMISSIONS.FUEL_CREATE),
  ]);

  const totals = entries.reduce(
    (acc, e) => ({ liters: acc.liters + Number(e.quantityLiters), cost: acc.cost + Number(e.totalCost) }),
    { liters: 0, cost: 0 },
  );

  const columns: DataColumn<FuelRow>[] = [
    {
      header: "Date",
      cell: (e) => (
        <Link href={`/fuel/${e.id}/edit`} className="font-medium hover:underline">
          {dateFormatter.format(e.entryDate)}
        </Link>
      ),
    },
    { header: "Vehicle", cell: (e) => e.vehicle.name },
    { header: "Litres", cell: (e) => e.quantityLiters.toString(), align: "right" },
    { header: "Total", cell: (e) => currencyFormatter.format(Number(e.totalCost)), align: "right" },
    { header: "Vendor", cell: (e) => e.vendorName ?? "—" },
    { header: "Receipt", cell: (e) => <AttachmentLink label="View" storageKey={e.receipt?.storageKey} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Fuel"
        description="Fuel fill-ups, quantity, cost, and consumption per vehicle."
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/fuel/new">
                <Plus /> Add Fuel Entry
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ListFilterBar hideSearch filters={[{ paramKey: "vehicleId", label: "Vehicle", options: vehicles.map((v) => ({ value: v.id, label: v.name })) }]} />
        <DateRangeFilter />
      </div>

      {entries.length > 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing {entries.length} entries · {totals.liters.toFixed(1)} L · {currencyFormatter.format(totals.cost)}
        </p>
      ) : null}

      <ResponsiveDataView
        data={entries}
        keyField={(e) => e.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={FuelIcon}
            title="No fuel entries yet"
            description="Fuel fill-ups your team logs will appear here."
            action={
              canCreate ? (
                <Button asChild size="sm">
                  <Link href="/fuel/new">
                    <Plus /> Add Fuel Entry
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(e) => (
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <Link href={`/fuel/${e.id}/edit`} className="block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{dateFormatter.format(e.entryDate)}</p>
                  <p className="font-medium tabular-nums text-foreground">{currencyFormatter.format(Number(e.totalCost))}</p>
                </div>
                <p className="text-sm text-foreground">{e.vehicle.name}</p>
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

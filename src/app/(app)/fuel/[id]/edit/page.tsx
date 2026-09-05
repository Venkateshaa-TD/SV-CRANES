import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { FuelForm } from "@/components/fuel/fuel-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Edit Fuel Entry" };

interface EditFuelPageProps {
  params: Promise<{ id: string }>;
}

export default function EditFuelPage(props: EditFuelPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.FUEL_CREATE}>
      <EditFuelPageContent {...props} />
    </PermissionGate>
  );
}

async function EditFuelPageContent({ params }: EditFuelPageProps) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const [entry, vehicles, projects] = await Promise.all([
    prisma.fuelEntry.findFirst({ where: { id, vehicle: { companyId: user.companyId } } }),
    listActiveVehicleOptions(user.companyId),
    listActiveProjectOptions(user.companyId),
  ]);
  if (!entry) notFound();

  return (
    <div>
      <PageHeader title="Edit Fuel Entry" />
      <FuelForm
        mode="edit"
        entryId={entry.id}
        vehicleOptions={vehicles.map((v) => ({ id: v.id, label: `${v.name} (${v.registrationNumber})` }))}
        projectOptions={projects.map((p) => ({ id: p.id, label: p.name }))}
        defaultValues={{
          vehicleId: entry.vehicleId,
          entryDate: entry.entryDate.toISOString().slice(0, 10),
          entryTime: entry.entryDate.toISOString().slice(11, 16),
          fuelType: entry.fuelType,
          quantityLiters: entry.quantityLiters.toString(),
          ratePerLiter: entry.ratePerLiter.toString(),
          vendorName: entry.vendorName ?? undefined,
          odometerAtFill: entry.odometerAtFill?.toString(),
          hourMeterAtFill: entry.hourMeterAtFill?.toString(),
          projectId: entry.projectId ?? undefined,
          notes: entry.notes ?? undefined,
          receiptFileId: entry.receiptFileId ?? undefined,
        }}
      />
    </div>
  );
}

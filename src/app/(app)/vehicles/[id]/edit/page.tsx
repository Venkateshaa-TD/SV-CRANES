import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { VehicleArchiveControl } from "@/components/vehicles/vehicle-archive-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveEmployeeOptions } from "@/lib/data/reference-data";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Edit Vehicle" };

interface EditVehiclePageProps {
  params: Promise<{ id: string }>;
}

export default function EditVehiclePage(props: EditVehiclePageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.VEHICLE_MANAGE}>
      <EditVehiclePageContent {...props} />
    </PermissionGate>
  );
}

async function EditVehiclePageContent({ params }: EditVehiclePageProps) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const [vehicle, operators] = await Promise.all([
    prisma.vehicle.findFirst({ where: { id, companyId: user.companyId } }),
    listActiveEmployeeOptions(user.companyId),
  ]);
  if (!vehicle) notFound();

  return (
    <div>
      <PageHeader title="Edit Vehicle" description={vehicle.name} />
      <VehicleForm
        mode="edit"
        vehicleId={vehicle.id}
        operatorOptions={operators}
        defaultValues={{
          name: vehicle.name,
          registrationNumber: vehicle.registrationNumber,
          code: vehicle.code ?? undefined,
          category: vehicle.category,
          status: vehicle.status,
          capacityTons: vehicle.capacityTons?.toString(),
          make: vehicle.make ?? undefined,
          model: vehicle.model ?? undefined,
          year: vehicle.year ?? undefined,
          fuelType: vehicle.fuelType ?? undefined,
          currentHourMeter: vehicle.currentHourMeter?.toString(),
          currentOdometer: vehicle.currentOdometer?.toString(),
          assignedOperatorId: vehicle.assignedOperatorId ?? undefined,
          purchaseDate: vehicle.purchaseDate ? vehicle.purchaseDate.toISOString().slice(0, 10) : undefined,
          purchaseAmount: vehicle.purchaseAmount?.toString(),
          notes: vehicle.notes ?? undefined,
          imageFileId: vehicle.imageFileId ?? undefined,
        }}
      />
      <div className="mt-8 border-t border-border pt-6">
        <VehicleArchiveControl vehicleId={vehicle.id} isArchived={!!vehicle.archivedAt} />
      </div>
    </div>
  );
}

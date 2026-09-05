import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { FuelForm } from "@/components/fuel/fuel-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Add Fuel Entry" };

interface NewFuelPageProps {
  searchParams: Promise<{ vehicleId?: string }>;
}

export default function NewFuelPage(props: NewFuelPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.FUEL_CREATE}>
      <NewFuelPageContent {...props} />
    </PermissionGate>
  );
}

async function NewFuelPageContent({ searchParams }: NewFuelPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [vehicles, projects] = await Promise.all([
    listActiveVehicleOptions(user.companyId),
    listActiveProjectOptions(user.companyId),
  ]);

  return (
    <div>
      <PageHeader title="Add Fuel Entry" description="Record a fuel fill-up for a vehicle." />
      <FuelForm
        vehicleOptions={vehicles.map((v) => ({ id: v.id, label: `${v.name} (${v.registrationNumber})` }))}
        projectOptions={projects.map((p) => ({ id: p.id, label: p.name }))}
        defaultVehicleId={params.vehicleId}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveEmployeeOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Add Vehicle" };

export default function NewVehiclePage() {
  return (
    <PermissionGate permission={PERMISSIONS.VEHICLE_MANAGE}>
      <NewVehiclePageContent />
    </PermissionGate>
  );
}

async function NewVehiclePageContent() {
  const user = await requireCurrentUser();
  const operators = await listActiveEmployeeOptions(user.companyId);

  return (
    <div>
      <PageHeader title="Add Vehicle" description="Register a new vehicle or crane in the fleet." />
      <VehicleForm mode="create" operatorOptions={operators} />
    </div>
  );
}

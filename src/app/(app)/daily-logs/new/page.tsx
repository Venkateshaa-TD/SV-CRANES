import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { DailyLogForm } from "@/components/daily-logs/daily-log-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveEmployeeOptions, listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Add Daily Log" };

interface NewDailyLogPageProps {
  searchParams: Promise<{ vehicleId?: string }>;
}

export default function NewDailyLogPage(props: NewDailyLogPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.DAILY_LOG_CREATE}>
      <NewDailyLogPageContent {...props} />
    </PermissionGate>
  );
}

async function NewDailyLogPageContent({ searchParams }: NewDailyLogPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;

  const [vehicles, projects, canActForOthers, ownAssignedVehicle] = await Promise.all([
    listActiveVehicleOptions(user.companyId),
    listActiveProjectOptions(user.companyId),
    can(user, PERMISSIONS.DAILY_LOG_APPROVE),
    prisma.vehicle.findFirst({ where: { assignedOperatorId: user.id, archivedAt: null }, select: { id: true } }),
  ]);

  const operators = canActForOthers ? await listActiveEmployeeOptions(user.companyId) : undefined;
  const defaultVehicleId = params.vehicleId ?? ownAssignedVehicle?.id;

  return (
    <div>
      <PageHeader title="Add Daily Log" description="Record today's work, meter readings, and any issues." />
      <DailyLogForm
        mode="create"
        currentUserName={user.name}
        vehicleOptions={vehicles.map((v) => ({ id: v.id, label: `${v.name} (${v.registrationNumber})` }))}
        projectOptions={projects.map((p) => ({ id: p.id, label: p.name }))}
        operatorOptions={operators?.map((o) => ({ id: o.id, label: o.name }))}
        defaultValues={defaultVehicleId ? { vehicleId: defaultVehicleId } : undefined}
      />
    </div>
  );
}

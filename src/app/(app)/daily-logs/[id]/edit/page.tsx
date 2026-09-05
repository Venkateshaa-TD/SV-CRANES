import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ForbiddenState } from "@/components/shared/forbidden-state";
import { DailyLogForm } from "@/components/daily-logs/daily-log-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveEmployeeOptions, listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Edit Daily Log" };

interface EditDailyLogPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDailyLogPage({ params }: EditDailyLogPageProps) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const log = await prisma.dailyLog.findFirst({ where: { id, vehicle: { companyId: user.companyId } } });
  if (!log) notFound();

  const isOwner = log.operatorId === user.id || log.createdById === user.id;
  const canActForOthers = await can(user, PERMISSIONS.DAILY_LOG_APPROVE);
  if (!isOwner && !canActForOthers) {
    return <ForbiddenState />;
  }

  const [vehicles, projects, operators] = await Promise.all([
    listActiveVehicleOptions(user.companyId),
    listActiveProjectOptions(user.companyId),
    canActForOthers ? listActiveEmployeeOptions(user.companyId) : Promise.resolve(undefined),
  ]);

  return (
    <div>
      <PageHeader title="Edit Daily Log" />
      <DailyLogForm
        mode="edit"
        logId={log.id}
        currentUserName={user.name}
        vehicleOptions={vehicles.map((v) => ({ id: v.id, label: `${v.name} (${v.registrationNumber})` }))}
        projectOptions={projects.map((p) => ({ id: p.id, label: p.name }))}
        operatorOptions={operators?.map((o) => ({ id: o.id, label: o.name }))}
        defaultValues={{
          logDate: log.logDate.toISOString().slice(0, 10),
          vehicleId: log.vehicleId,
          operatorId: log.operatorId,
          projectId: log.projectId ?? undefined,
          startHourMeter: log.startHourMeter?.toString() ?? "",
          endHourMeter: log.endHourMeter?.toString() ?? "",
          startOdometer: log.startOdometer?.toString() ?? "",
          endOdometer: log.endOdometer?.toString() ?? "",
          workDescription: log.workDescription ?? undefined,
          breakdownNotes: log.breakdownNotes ?? undefined,
          remarks: log.remarks ?? undefined,
          meterPhotoFileId: log.meterPhotoFileId ?? undefined,
          sitePhotoFileId: log.sitePhotoFileId ?? undefined,
        }}
      />
    </div>
  );
}

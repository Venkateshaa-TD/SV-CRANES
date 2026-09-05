import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { History } from "lucide-react";

export const metadata: Metadata = { title: "Audit Logs" };

type AuditRow = Awaited<ReturnType<typeof loadAuditLogs>>[number];

async function loadAuditLogs() {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true, email: true } } },
  });
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

const columns: DataColumn<AuditRow>[] = [
  { header: "When", cell: (row) => formatDateTime(row.createdAt) },
  { header: "Actor", cell: (row) => row.actor?.name ?? "System" },
  { header: "Action", cell: (row) => <Badge variant="outline">{row.action}</Badge> },
  { header: "Entity", cell: (row) => `${row.entityType}${row.entityId ? ` #${row.entityId.slice(-6)}` : ""}` },
];

export default async function AuditLogsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.ADMIN_AUDIT_VIEW}>
      <PageHeader title="Audit Logs" description="Recent sensitive actions recorded across the system." />
      <AuditLogList />
    </PermissionGate>
  );
}

async function AuditLogList() {
  const logs = await loadAuditLogs();

  return (
    <ResponsiveDataView
      data={logs}
      keyField={(row) => row.id}
      columns={columns}
      emptyState={
        <EmptyState
          icon={History}
          title="No audit activity yet"
          description="Sensitive actions taken across the app will appear here as they happen."
        />
      }
      renderCard={(row) => (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <Badge variant="outline">{row.action}</Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
            </div>
            <p className="text-sm text-foreground">
              {row.actor?.name ?? "System"} · {row.entityType}
              {row.entityId ? ` #${row.entityId.slice(-6)}` : ""}
            </p>
          </CardContent>
        </Card>
      )}
    />
  );
}

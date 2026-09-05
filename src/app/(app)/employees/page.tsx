import type { Metadata } from "next";
import Link from "next/link";
import { Users, ShieldCheck } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { ROLE_OPTIONS } from "@/lib/validation/employee";

export const metadata: Metadata = { title: "Employees" };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};

type EmployeeRow = Awaited<ReturnType<typeof loadEmployees>>[number];

async function loadEmployees(companyId: string, params: { q?: string; role?: string }) {
  return prisma.user.findMany({
    where: {
      companyId,
      archivedAt: null,
      isActive: true,
      role: params.role && params.role !== "all" ? (params.role as never) : undefined,
      ...(params.q ? { OR: [{ name: { contains: params.q, mode: "insensitive" } }] } : {}),
    },
    include: { assignedVehicles: { select: { name: true }, take: 1 } },
    orderBy: { name: "asc" },
    take: 200,
  });
}

interface EmployeesPageProps {
  searchParams: Promise<{ q?: string; role?: string }>;
}

export default function EmployeesPage(props: EmployeesPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.EMPLOYEE_VIEW}>
      <EmployeesPageContent {...props} />
    </PermissionGate>
  );
}

async function EmployeesPageContent({ searchParams }: EmployeesPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const [employees, canManage] = await Promise.all([
    loadEmployees(actor.companyId, params),
    can(actor, PERMISSIONS.ADMIN_USERS_MANAGE),
  ]);

  const columns: DataColumn<EmployeeRow>[] = [
    {
      header: "Name",
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{e.name}</p>
          {e.employeeCode ? <p className="truncate text-xs text-muted-foreground">{e.employeeCode}</p> : null}
        </div>
      ),
    },
    { header: "Role", cell: (e) => ROLE_LABELS[e.role] },
    { header: "Assigned Vehicle", cell: (e) => e.assignedVehicles[0]?.name ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Team roster."
        action={
          canManage ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/users">
                <ShieldCheck /> Manage in Admin
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <ListFilterBar
          searchPlaceholder="Search name…"
          filters={[{ paramKey: "role", label: "Role", options: ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] })) }]}
        />
      </div>

      <ResponsiveDataView
        data={employees}
        keyField={(e) => e.id}
        columns={columns}
        emptyState={<EmptyState icon={Users} title="No employees found" />}
        renderCard={(e) => (
          <Card>
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center gap-2">
                <p className="min-w-0 truncate font-medium text-foreground">{e.name}</p>
                <Badge variant="secondary" className="shrink-0">
                  {ROLE_LABELS[e.role]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.employeeCode ?? "No code"}
                {e.assignedVehicles[0] ? ` · ${e.assignedVehicles[0].name}` : ""}
              </p>
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}

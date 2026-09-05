import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeRowActions } from "@/components/employees/employee-row-actions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { ROLE_OPTIONS } from "@/lib/validation/employee";

export const metadata: Metadata = { title: "Users & Roles" };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};

type EmployeeRow = Awaited<ReturnType<typeof loadEmployees>>[number];

async function loadEmployees(companyId: string, params: { q?: string; role?: string; status?: string }) {
  return prisma.user.findMany({
    where: {
      companyId,
      archivedAt: null,
      role: params.role && params.role !== "all" ? (params.role as never) : undefined,
      isActive: params.status === "inactive" ? false : params.status === "active" ? true : undefined,
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { email: { contains: params.q, mode: "insensitive" } },
              { employeeCode: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { assignedVehicles: { select: { name: true }, take: 1 } },
    orderBy: { name: "asc" },
    take: 200,
  });
}

interface AdminUsersPageProps {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}

export default function AdminUsersPage(props: AdminUsersPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.ADMIN_USERS_MANAGE}>
      <AdminUsersPageContent {...props} />
    </PermissionGate>
  );
}

async function AdminUsersPageContent({ searchParams }: AdminUsersPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const employees = await loadEmployees(actor.companyId, params);

  const columns: DataColumn<EmployeeRow>[] = [
    {
      header: "Employee",
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{e.name}</p>
          <p className="truncate text-xs text-muted-foreground">{e.email}</p>
        </div>
      ),
    },
    { header: "Role", cell: (e) => ROLE_LABELS[e.role] },
    { header: "Status", cell: (e) => <Badge variant={e.isActive ? "success" : "secondary"}>{e.isActive ? "Active" : "Inactive"}</Badge> },
    { header: "Assigned Vehicle", cell: (e) => e.assignedVehicles[0]?.name ?? "—" },
    { header: "", cell: (e) => <EmployeeRowActions employeeId={e.id} isActive={e.isActive} isSelf={e.id === actor.id} />, align: "right" },
  ];

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        description="Manage employee accounts, roles, and access."
        action={
          <Button asChild>
            <Link href="/admin/users/new">
              <Plus /> Add Employee
            </Link>
          </Button>
        }
      />

      <div className="mb-4">
        <ListFilterBar
          searchPlaceholder="Search name, email, code…"
          filters={[
            { paramKey: "role", label: "Role", options: ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
            {
              paramKey: "status",
              label: "Status",
              options: [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
          ]}
        />
      </div>

      <ResponsiveDataView
        data={employees}
        keyField={(e) => e.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={Users}
            title="No employees found"
            description="Add your first employee to get started."
            action={
              <Button asChild size="sm">
                <Link href="/admin/users/new">
                  <Plus /> Add Employee
                </Link>
              </Button>
            }
          />
        }
        renderCard={(e) => (
          <Card>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate font-medium text-foreground">{e.name}</p>
                  <Badge variant={e.isActive ? "success" : "secondary"} className="shrink-0">
                    {e.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_LABELS[e.role]}
                  {e.assignedVehicles[0] ? ` · ${e.assignedVehicles[0].name}` : ""}
                </p>
              </div>
              <EmployeeRowActions employeeId={e.id} isActive={e.isActive} isSelf={e.id === actor.id} />
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}

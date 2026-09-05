import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Briefcase } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { PROJECT_STATUS_OPTIONS } from "@/lib/validation/project";

export const metadata: Metadata = { title: "Projects" };

const STATUS_LABELS: Record<string, string> = { UPCOMING: "Upcoming", ACTIVE: "Active", COMPLETED: "Completed", CANCELLED: "Cancelled" };

type ProjectRow = Awaited<ReturnType<typeof loadProjects>>[number];

async function loadProjects(companyId: string, params: { q?: string; status?: string }) {
  return prisma.project.findMany({
    where: {
      companyId,
      archivedAt: null,
      status: params.status && params.status !== "all" ? (params.status as never) : undefined,
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { code: { contains: params.q, mode: "insensitive" } },
              { siteLocation: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
}

interface ProjectsPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default function ProjectsPage(props: ProjectsPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.PROJECT_VIEW}>
      <ProjectsPageContent {...props} />
    </PermissionGate>
  );
}

async function ProjectsPageContent({ searchParams }: ProjectsPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const [projects, canManage] = await Promise.all([loadProjects(actor.companyId, params), can(actor, PERMISSIONS.PROJECT_MANAGE)]);

  const columns: DataColumn<ProjectRow>[] = [
    {
      header: "Project",
      cell: (p) => (
        <Link href={`/projects/${p.id}`} className="block min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">{p.code ?? "No job number"}</p>
        </Link>
      ),
    },
    { header: "Customer", cell: (p) => p.customer.name },
    { header: "Site", cell: (p) => p.siteLocation ?? "—" },
    { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Projects / Jobs"
        description="Customer jobs and the vehicles assigned to them over time."
        action={
          canManage ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> New Project
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <ListFilterBar
          searchPlaceholder="Search name, job number, site…"
          filters={[{ paramKey: "status", label: "Status", options: PROJECT_STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] })) }]}
        />
      </div>

      <ResponsiveDataView
        data={projects}
        keyField={(p) => p.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={Briefcase}
            title="No projects yet"
            description={canManage ? "Create your first project to assign vehicles and start billing." : "No projects match your filters yet."}
            action={
              canManage ? (
                <Button asChild size="sm">
                  <Link href="/projects/new">
                    <Plus /> New Project
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(p) => (
          <Link href={`/projects/${p.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.customer.name}</p>
                  </div>
                  <StatusBadge status={p.status} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{p.code ?? "No job number"}</span>
                  {p.siteLocation ? <span className="truncate">{p.siteLocation}</span> : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}

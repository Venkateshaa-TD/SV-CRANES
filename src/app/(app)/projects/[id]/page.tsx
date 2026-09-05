import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Truck, Wallet, FileText, ClipboardList } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { UrlTabs } from "@/components/shared/url-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { AssignVehicleDrawer } from "@/components/projects/assign-vehicle-drawer";
import { EndAssignmentControl } from "@/components/projects/end-assignment-control";
import { BillingConfigurationForm } from "@/components/projects/billing-configuration-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser, getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listAssignableVehicleOptions } from "@/lib/data/reference-data";
import { getProjectBillingSummary } from "@/lib/data/finance-queries";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/** Company-scoped: an id alone must never be enough to leak even a
 * project's name across tenants via the page <title>. */
export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Project" };
  const project = await prisma.project.findFirst({ where: { id, companyId: user.companyId }, select: { name: true } });
  return { title: project?.name ?? "Project" };
}

export default function ProjectDetailPage(props: ProjectDetailPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.PROJECT_VIEW}>
      <ProjectDetailContent {...props} />
    </PermissionGate>
  );
}

async function ProjectDetailContent({ params, searchParams }: ProjectDetailPageProps) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const actor = await requireCurrentUser();

  const project = await prisma.project.findFirst({
    where: { id, companyId: actor.companyId },
    include: { customer: { select: { id: true, name: true } }, billingConfig: true },
  });
  if (!project) notFound();

  const [canManage, canManageBilling, canViewInvoices] = await Promise.all([
    can(actor, PERMISSIONS.PROJECT_MANAGE),
    can(actor, PERMISSIONS.BILLING_MANAGE),
    can(actor, PERMISSIONS.INVOICE_VIEW),
  ]);

  const billingSummary = canManageBilling || canViewInvoices ? await getProjectBillingSummary(actor.companyId, id) : null;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "vehicles", label: "Vehicles" },
    ...(canManageBilling ? [{ key: "billing", label: "Billing" }] : []),
    ...(canViewInvoices ? [{ key: "invoices", label: "Invoices" }] : []),
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "overview";

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-tight text-foreground">{project.name}</h1>
            <StatusBadge status={project.status} className="shrink-0" />
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/customers/${project.customer.id}`} className="hover:underline">
              {project.customer.name}
            </Link>
            {project.code ? ` · ${project.code}` : ""}
            {project.siteLocation ? ` · ${project.siteLocation}` : ""}
          </p>
        </div>
        {canManage ? (
          <Button asChild variant="outline" size="sm" className="w-fit shrink-0">
            <Link href={`/projects/${id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        ) : null}
      </div>

      {billingSummary ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Total Invoiced" value={formatCurrencyPrecise(billingSummary.totalInvoiced)} icon={Wallet} />
          <StatCard label="Collected" value={formatCurrencyPrecise(billingSummary.totalCollected)} icon={Wallet} tone="success" />
          <StatCard label="Outstanding" value={formatCurrencyPrecise(billingSummary.outstanding)} icon={Wallet} tone={billingSummary.outstanding.isZero() ? "default" : "warning"} />
        </div>
      ) : null}

      <UrlTabs basePath={`/projects/${id}`} activeKey={activeTab} tabs={tabs} />

      {activeTab === "vehicles" ? (
        <ProjectVehiclesTab projectId={id} companyId={actor.companyId} canManage={canManage} />
      ) : activeTab === "billing" ? (
        <ProjectBillingTab project={project} canManage={canManageBilling} />
      ) : activeTab === "invoices" ? (
        <ProjectInvoicesTab projectId={id} companyId={actor.companyId} />
      ) : (
        <ProjectOverviewTab project={project} />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function ProjectOverviewTab({ project }: { project: NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst>>> }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <DetailRow label="Site / Location" value={project.siteLocation ?? "—"} />
        <DetailRow label="Start Date" value={formatDate(project.startDate)} />
        <DetailRow label="End Date" value={formatDate(project.endDate)} />
        {project.notes ? (
          <div className="pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{project.notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function ProjectVehiclesTab({ projectId, companyId, canManage }: { projectId: string; companyId: string; canManage: boolean }) {
  const [assignments, vehicleOptions] = await Promise.all([
    prisma.projectVehicleAssignment.findMany({
      where: { projectId, project: { companyId } },
      include: { vehicle: { select: { id: true, name: true, registrationNumber: true, code: true } } },
      orderBy: { assignedFrom: "desc" },
    }),
    canManage ? listAssignableVehicleOptions(companyId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-3">
      {canManage ? (
        <div className="flex justify-end">
          <AssignVehicleDrawer projectId={projectId} vehicleOptions={vehicleOptions} />
        </div>
      ) : null}
      {assignments.length === 0 ? (
        <EmptyState icon={Truck} title="No vehicles assigned yet" description="Assign a crane or support vehicle to this project." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/vehicles/${a.vehicle.id}`} className="truncate font-medium text-foreground hover:underline">
                    {a.vehicle.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.vehicle.registrationNumber} · {formatDate(a.assignedFrom)} – {a.assignedTo ? formatDate(a.assignedTo) : "ongoing"}
                  </p>
                  {a.notes ? <p className="truncate text-xs text-muted-foreground">{a.notes}</p> : null}
                </div>
                {canManage && !a.assignedTo ? <EndAssignmentControl assignmentId={a.id} /> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectBillingTab({
  project,
  canManage,
}: {
  project: NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst>>> & { billingConfig: { billingType: string; baseRate: unknown; minimumGuaranteedHours: unknown; overtimeThresholdHours: unknown; overtimeRate: unknown; mobilisationCharge: unknown; demobilisationCharge: unknown; taxPercent: unknown; billingNotes: string | null } | null };
  canManage: boolean;
}) {
  if (!canManage) {
    return <EmptyState icon={Wallet} title="No access" description="You don't have permission to view billing configuration." />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <BillingConfigurationForm
            projectId={project.id}
            defaultValues={
              project.billingConfig
                ? {
                    billingType: project.billingConfig.billingType as "HOURLY" | "DAILY" | "MONTHLY" | "FIXED",
                    baseRate: String(project.billingConfig.baseRate),
                    minimumGuaranteedHours: project.billingConfig.minimumGuaranteedHours != null ? String(project.billingConfig.minimumGuaranteedHours) : undefined,
                    overtimeThresholdHours: project.billingConfig.overtimeThresholdHours != null ? String(project.billingConfig.overtimeThresholdHours) : undefined,
                    overtimeRate: project.billingConfig.overtimeRate != null ? String(project.billingConfig.overtimeRate) : undefined,
                    mobilisationCharge: project.billingConfig.mobilisationCharge != null ? String(project.billingConfig.mobilisationCharge) : undefined,
                    demobilisationCharge: project.billingConfig.demobilisationCharge != null ? String(project.billingConfig.demobilisationCharge) : undefined,
                    taxPercent: project.billingConfig.taxPercent != null ? String(project.billingConfig.taxPercent) : undefined,
                    billingNotes: project.billingConfig.billingNotes ?? undefined,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      {project.billingConfig ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/finance/billing/new?projectId=${project.id}`}>
              <ClipboardList /> Prepare Billing
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

async function ProjectInvoicesTab({ projectId, companyId }: { projectId: string; companyId: string }) {
  const invoices = await prisma.invoice.findMany({
    where: { projectId, companyId, archivedAt: null },
    orderBy: { issueDate: "desc" },
    take: 50,
  });

  const columns: DataColumn<(typeof invoices)[number]>[] = [
    {
      header: "Invoice",
      cell: (inv) => (
        <Link href={`/finance/invoices/${inv.id}`} className="font-medium hover:underline">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    { header: "Issue Date", cell: (inv) => formatDate(inv.issueDate) },
    { header: "Total", cell: (inv) => formatCurrencyPrecise(inv.totalAmount), align: "right" },
    { header: "Status", cell: (inv) => <StatusBadge status={inv.status} /> },
  ];

  return (
    <ResponsiveDataView
      data={invoices}
      keyField={(inv) => inv.id}
      columns={columns}
      emptyState={<EmptyState icon={FileText} title="No invoices yet" description="Invoices generated for this project will appear here." />}
      renderCard={(inv) => (
        <Link href={`/finance/invoices/${inv.id}`}>
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">{inv.invoiceNumber}</p>
                <StatusBadge status={inv.status} className="shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(inv.issueDate)}</p>
              <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrencyPrecise(inv.totalAmount)}</p>
            </CardContent>
          </Card>
        </Link>
      )}
    />
  );
}

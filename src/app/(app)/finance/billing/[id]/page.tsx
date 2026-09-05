import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { BillingDraftActions } from "@/components/billing/billing-draft-actions";
import { BillingDraftCharges } from "@/components/billing/billing-draft-charges";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

interface BillingDraftDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Billing Review" };

export default function BillingDraftDetailPage(props: BillingDraftDetailPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.BILLING_VIEW}>
      <BillingDraftDetailContent {...props} />
    </PermissionGate>
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

async function BillingDraftDetailContent({ params }: BillingDraftDetailPageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();

  const draft = await prisma.billingDraft.findFirst({
    where: { id, companyId: actor.companyId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      customer: { select: { id: true, name: true } },
      charges: true,
      sourceLogs: {
        include: { dailyLog: { select: { id: true, logDate: true, workingHours: true, operator: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!draft) notFound();

  const [canManageBilling, canManageInvoice] = await Promise.all([
    can(actor, PERMISSIONS.BILLING_MANAGE),
    can(actor, PERMISSIONS.INVOICE_MANAGE),
  ]);
  const editable = draft.status === "DRAFT" && canManageBilling;

  return (
    <div>
      <div className="mb-5 space-y-1">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">Billing Review — {draft.project.name}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/customers/${draft.customer.id}`} className="hover:underline">
            {draft.customer.name}
          </Link>
          <StatusBadge status={draft.status} />
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <DetailRow label="Customer" value={draft.customer.name} />
            <DetailRow
              label="Project"
              value={
                <Link href={`/projects/${draft.project.id}`} className="hover:underline">
                  {draft.project.name}
                </Link>
              }
            />
            <DetailRow label="Billing Period" value={`${formatDate(draft.periodStart)} – ${formatDate(draft.periodEnd)}`} />
            <DetailRow label="Billing Type" value={draft.billingType} />
            <DetailRow label="Quantity" value={draft.quantity.toString()} />
            <DetailRow label="Rate" value={formatCurrencyPrecise(draft.rate)} />
            <DetailRow label="Base Amount" value={formatCurrencyPrecise(draft.baseAmount)} />
            <DetailRow label="Additional Charges" value={formatCurrencyPrecise(draft.additionalChargesAmount)} />
            <DetailRow label="Tax" value={`${formatCurrencyPrecise(draft.taxAmount)} (${draft.taxPercent.toString()}%)`} />
            <div className="flex items-center justify-between gap-4 pt-2 text-base">
              <span className="font-semibold text-foreground">Proposed Total</span>
              <span className="font-semibold tabular-nums text-foreground">{formatCurrencyPrecise(draft.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Additional Charges</h2>
            <BillingDraftCharges
              billingDraftId={draft.id}
              editable={editable}
              charges={draft.charges.map((c) => ({ id: c.id, description: c.description, amount: c.amount.toString() }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Source Records</h2>
            {draft.sourceLogs.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={draft.billingType === "MONTHLY" || draft.billingType === "FIXED" ? "No source logs — this billing type doesn't derive from daily logs" : "No source logs found"}
              />
            ) : (
              <ul className="divide-y divide-border">
                {draft.sourceLogs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/daily-logs/${s.dailyLog.id}/edit`} className="font-medium hover:underline">
                        {formatDate(s.dailyLog.logDate)}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{s.dailyLog.operator.name}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {s.hoursCounted != null ? `${s.hoursCounted.toString()} hrs billed` : `${s.dailyLog.workingHours?.toString() ?? "—"} hrs worked`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {draft.notes || draft.reviewNote ? (
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              {draft.notes ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{draft.notes}</p>
                </div>
              ) : null}
              {draft.reviewNote ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Review Note</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{draft.reviewNote}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <BillingDraftActions billingDraftId={draft.id} status={draft.status} canManageBilling={canManageBilling} canManageInvoice={canManageInvoice} />
      </div>
    </div>
  );
}

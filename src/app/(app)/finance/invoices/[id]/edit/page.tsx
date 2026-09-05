import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EditInvoiceDraftForm } from "@/components/invoices/edit-invoice-draft-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveVehicleOptions } from "@/lib/data/reference-data";
import { isInvoiceEditable } from "@/lib/business/invoice";

export const metadata: Metadata = { title: "Edit Invoice" };

interface EditInvoicePageProps {
  params: Promise<{ id: string }>;
}

export default function EditInvoicePage(props: EditInvoicePageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.INVOICE_MANAGE}>
      <EditInvoicePageContent {...props} />
    </PermissionGate>
  );
}

async function EditInvoicePageContent({ params }: EditInvoicePageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: actor.companyId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) notFound();
  if (!isInvoiceEditable(invoice.status)) notFound();

  const vehicleOptions = await listActiveVehicleOptions(actor.companyId);

  return (
    <div>
      <PageHeader title="Edit Invoice" description={invoice.invoiceNumber} />
      <EditInvoiceDraftForm
        invoiceId={invoice.id}
        isManual={!invoice.billingDraftId}
        vehicleOptions={vehicleOptions}
        defaultValues={{
          dueDate: invoice.dueDate,
          discountAmount: invoice.discountAmount.toString(),
          notes: invoice.notes ?? "",
          lines: invoice.lines.map((l) => ({
            vehicleId: l.vehicleId,
            description: l.description,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.toString(),
            taxPercent: l.taxPercent.toString(),
          })),
        }}
      />
    </div>
  );
}

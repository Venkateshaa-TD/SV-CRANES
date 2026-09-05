import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const requiredDecimalString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0 && !Number.isNaN(Number(v)), { message: `${label} is required.` });

const optionalDecimalString = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : String(v).trim()))
  .refine((v) => v === undefined || !Number.isNaN(Number(v)), { message: "Enter a valid number." });

export const invoiceLineFormSchema = z.object({
  vehicleId: optionalTrimmed,
  description: z.string().trim().min(1, "Description is required").max(200),
  quantity: requiredDecimalString("Quantity"),
  unitPrice: requiredDecimalString("Rate"),
  taxPercent: optionalDecimalString,
});

export type InvoiceLineFormInput = z.infer<typeof invoiceLineFormSchema>;

/** A manual, ad-hoc DRAFT invoice not generated from a BillingDraft — for
 * one-off charges the billing engine doesn't cover. */
export const manualInvoiceFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  projectId: optionalTrimmed,
  issueDate: z.string().trim().min(1, "Issue date is required"),
  dueDate: optionalTrimmed,
  discountAmount: optionalDecimalString,
  notes: optionalTrimmed,
  lines: z.array(invoiceLineFormSchema).min(1, "Add at least one line item."),
});

export type ManualInvoiceFormInput = z.infer<typeof manualInvoiceFormSchema>;

/** DRAFT invoices only — amounts/lines are locked once approved. */
export const updateInvoiceDraftSchema = z.object({
  dueDate: optionalTrimmed,
  notes: optionalTrimmed,
  discountAmount: optionalDecimalString,
  lines: z.array(invoiceLineFormSchema).min(1, "Add at least one line item.").optional(),
});

export type UpdateInvoiceDraftInput = z.infer<typeof updateInvoiceDraftSchema>;

export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().min(1, "A reason is required to cancel an invoice."),
});

export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

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
    .refine((v) => v.length > 0 && !Number.isNaN(Number(v)) && Number(v) > 0, { message: `${label} must be greater than zero.` });

export const PAYMENT_METHOD_OPTIONS = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "CARD", "OTHER"] as const;

export const paymentFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  paymentDate: z.string().trim().min(1, "Payment date is required"),
  amount: requiredDecimalString("Amount"),
  method: z.enum(PAYMENT_METHOD_OPTIONS),
  referenceNumber: optionalTrimmed,
  notes: optionalTrimmed,
});

export type PaymentFormInput = z.infer<typeof paymentFormSchema>;

export const cancelPaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(1, "A reason is required to cancel a payment."),
});

export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;

const allocationLineSchema = z.object({
  invoiceId: z.string().min(1),
  amount: requiredDecimalString("Allocation amount"),
});

export const allocatePaymentSchema = z.object({
  paymentId: z.string().min(1),
  allocations: z.array(allocationLineSchema).min(1, "Enter at least one allocation."),
});

export type AllocatePaymentInput = z.infer<typeof allocatePaymentSchema>;

export const removeAllocationSchema = z.object({
  allocationId: z.string().min(1),
});

export type RemoveAllocationInput = z.infer<typeof removeAllocationSchema>;

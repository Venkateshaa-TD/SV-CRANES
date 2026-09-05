import { z } from "zod";

const requiredDecimalString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0 && !Number.isNaN(Number(v)) && Number(v) > 0, { message: `${label} must be greater than zero.` });

export const LEDGER_ADJUSTMENT_TYPE_OPTIONS = ["DEBIT", "CREDIT"] as const;

export const createLedgerAdjustmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  type: z.enum(LEDGER_ADJUSTMENT_TYPE_OPTIONS),
  amount: requiredDecimalString("Amount"),
  reason: z.string().trim().min(1, "A reason is required."),
});

export type CreateLedgerAdjustmentInput = z.infer<typeof createLedgerAdjustmentSchema>;

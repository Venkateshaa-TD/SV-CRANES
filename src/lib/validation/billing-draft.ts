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

export const chargeInputSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(160),
  amount: requiredDecimalString("Amount"),
});

export type ChargeInput = z.infer<typeof chargeInputSchema>;

export const createBillingDraftSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  periodStart: z.string().trim().min(1, "Period start is required"),
  periodEnd: z.string().trim().min(1, "Period end is required"),
  /** MONTHLY only — explicit opt-in to bill a partial calendar month at a
   * pro-rated rate. Never applied silently. */
  allowProration: z.boolean().optional().default(false),
  charges: z.array(chargeInputSchema).optional().default([]),
  notes: optionalTrimmed,
});

export type CreateBillingDraftInput = z.infer<typeof createBillingDraftSchema>;

export const billingDraftReviewSchema = z.object({
  billingDraftId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: optionalTrimmed,
});

export type BillingDraftReviewInput = z.infer<typeof billingDraftReviewSchema>;

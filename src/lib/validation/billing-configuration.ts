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

export const BILLING_TYPE_OPTIONS = ["HOURLY", "DAILY", "MONTHLY", "FIXED"] as const;

export const billingConfigurationFormSchema = z.object({
  billingType: z.enum(BILLING_TYPE_OPTIONS),
  baseRate: requiredDecimalString("Base rate"),
  minimumGuaranteedHours: optionalDecimalString,
  overtimeThresholdHours: optionalDecimalString,
  overtimeRate: optionalDecimalString,
  mobilisationCharge: optionalDecimalString,
  demobilisationCharge: optionalDecimalString,
  taxPercent: optionalDecimalString,
  billingNotes: optionalTrimmed,
});

export type BillingConfigurationFormInput = z.infer<typeof billingConfigurationFormSchema>;

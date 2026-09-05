import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/** Base fields any user with CUSTOMER_MANAGE may set. Financial fields
 * (paymentTerms, defaultDueDays) are intentionally on a separate schema —
 * see customerFinancialFormSchema — so the server can enforce
 * CUSTOMER_FINANCIAL_EDIT independently of ordinary contact-info edits. */
export const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(160),
  customerCode: optionalTrimmed,
  contactPerson: optionalTrimmed,
  phone: optionalTrimmed,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || z.email().safeParse(v).success, { message: "Enter a valid email address." }),
  address: optionalTrimmed,
  gstNumber: optionalTrimmed,
  notes: optionalTrimmed,
});

export type CustomerFormInput = z.infer<typeof customerFormSchema>;

/** Requires CUSTOMER_FINANCIAL_EDIT server-side — see
 * src/lib/actions/customers.ts. */
export const customerFinancialFormSchema = z.object({
  paymentTerms: optionalTrimmed,
  defaultDueDays: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 365), {
      message: "Default due days must be a whole number between 0 and 365.",
    }),
});

export type CustomerFinancialFormInput = z.infer<typeof customerFinancialFormSchema>;

export const customerCombinedFormSchema = customerFormSchema.extend(customerFinancialFormSchema.shape);

export type CustomerCombinedFormInput = z.infer<typeof customerCombinedFormSchema>;

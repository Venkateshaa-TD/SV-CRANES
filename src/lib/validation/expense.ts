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

export const expenseFormSchema = z.object({
  expenseDate: z.string().trim().min(1, "Date is required"),
  vehicleId: optionalTrimmed,
  projectId: optionalTrimmed,
  categoryId: z.string().min(1, "Category is required"),
  description: optionalTrimmed,
  vendorName: optionalTrimmed,
  amount: requiredDecimalString("Amount"),
  receiptFileId: optionalTrimmed,
});

export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

export const expenseReviewSchema = z.object({
  expenseId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: optionalTrimmed,
});

export type ExpenseReviewInput = z.infer<typeof expenseReviewSchema>;

import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const selectMonthSchema = z.object({
  year: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine((v) => Number.isInteger(v) && v >= 2000 && v <= 2100, { message: "Enter a valid year." }),
  month: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine((v) => Number.isInteger(v) && v >= 1 && v <= 12, { message: "Enter a valid month." }),
});

export type SelectMonthInput = z.infer<typeof selectMonthSchema>;

export const closeMonthSchema = z.object({
  periodId: z.string().min(1),
  overrideReason: optionalTrimmed,
});

export type CloseMonthInput = z.infer<typeof closeMonthSchema>;

export const reopenMonthSchema = z.object({
  periodId: z.string().min(1),
  reason: z.string().trim().min(1, "A reason is required to reopen a closed month."),
});

export type ReopenMonthInput = z.infer<typeof reopenMonthSchema>;

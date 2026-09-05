import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const ROLE_OPTIONS = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT", "SUPERVISOR", "OPERATOR"] as const;

export const employeeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().min(1, "Email is required").email("Enter a valid email address"),
  phone: optionalTrimmed,
  employeeCode: optionalTrimmed,
  role: z.enum(ROLE_OPTIONS),
  notes: optionalTrimmed,
});

export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

export const createEmployeeSchema = employeeFormSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

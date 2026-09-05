import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const setUserPermissionOverrideSchema = z.object({
  userId: z.string().min(1),
  permission: z.string().min(1),
  granted: z.boolean(),
  reason: optionalTrimmed,
});

export type SetUserPermissionOverrideInput = z.infer<typeof setUserPermissionOverrideSchema>;

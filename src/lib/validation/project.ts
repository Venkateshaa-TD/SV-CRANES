import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const PROJECT_STATUS_OPTIONS = ["UPCOMING", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export const projectFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  name: z.string().trim().min(1, "Project name is required").max(160),
  code: optionalTrimmed,
  siteLocation: optionalTrimmed,
  status: z.enum(PROJECT_STATUS_OPTIONS),
  startDate: optionalTrimmed,
  endDate: optionalTrimmed,
  notes: optionalTrimmed,
});

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

export const projectVehicleAssignmentFormSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  assignedFrom: z.string().trim().min(1, "Start date is required"),
  assignedTo: optionalTrimmed,
  notes: optionalTrimmed,
});

export type ProjectVehicleAssignmentFormInput = z.infer<typeof projectVehicleAssignmentFormSchema>;

export const endAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  assignedTo: z.string().trim().min(1, "End date is required"),
});

export type EndAssignmentInput = z.infer<typeof endAssignmentSchema>;

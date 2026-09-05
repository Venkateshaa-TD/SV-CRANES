import { z } from "zod";

const currentYear = new Date().getFullYear();

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const decimalString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length === 0 || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
      message: `${label} must be a non-negative number.`,
    });

export const vehicleFormSchema = z.object({
  name: z.string().trim().min(1, "Display name is required").max(120),
  registrationNumber: z
    .string()
    .trim()
    .min(1, "Registration number is required")
    .max(40)
    .transform((v) => v.toUpperCase()),
  code: optionalTrimmed,
  category: z.enum(["CRANE", "TRUCK", "TRAILER", "PICKUP", "OTHER"]),
  status: z.enum(["WORKING", "IDLE", "MAINTENANCE", "OUT_OF_SERVICE"]),
  capacityTons: decimalString("Capacity").optional(),
  make: optionalTrimmed,
  model: optionalTrimmed,
  year: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 1970 && v <= currentYear + 1), {
      message: "Enter a valid year.",
    }),
  fuelType: z.enum(["DIESEL", "PETROL", "OTHER"]).optional(),
  currentHourMeter: decimalString("Hour meter").optional(),
  currentOdometer: decimalString("Odometer").optional(),
  assignedOperatorId: optionalTrimmed,
  purchaseDate: optionalTrimmed,
  purchaseAmount: decimalString("Purchase amount").optional(),
  notes: optionalTrimmed,
  imageFileId: optionalTrimmed,
});

export type VehicleFormInput = z.infer<typeof vehicleFormSchema>;

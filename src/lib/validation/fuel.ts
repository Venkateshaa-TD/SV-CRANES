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

export const fuelFormSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  entryDate: z.string().trim().min(1, "Date is required"),
  entryTime: optionalTrimmed,
  fuelType: z.enum(["DIESEL", "PETROL", "OTHER"]),
  quantityLiters: requiredDecimalString("Litres"),
  ratePerLiter: requiredDecimalString("Price per litre"),
  vendorName: optionalTrimmed,
  odometerAtFill: optionalTrimmed,
  hourMeterAtFill: optionalTrimmed,
  projectId: optionalTrimmed,
  notes: optionalTrimmed,
  receiptFileId: optionalTrimmed,
});

export type FuelFormInput = z.infer<typeof fuelFormSchema>;

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

export const dailyLogFormSchema = z.object({
  logDate: z.string().trim().min(1, "Date is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  /** Only honored server-side when the actor has DAILY_LOG_APPROVE — see
   * src/lib/actions/daily-logs.ts. An operator's own id is always used
   * regardless of what's submitted here. */
  operatorId: optionalTrimmed,
  projectId: optionalTrimmed,
  startHourMeter: requiredDecimalString("Start hour meter"),
  endHourMeter: requiredDecimalString("End hour meter"),
  startOdometer: requiredDecimalString("Start odometer"),
  endOdometer: requiredDecimalString("End odometer"),
  workDescription: optionalTrimmed,
  breakdownNotes: optionalTrimmed,
  remarks: optionalTrimmed,
  meterPhotoFileId: optionalTrimmed,
  sitePhotoFileId: optionalTrimmed,
});

export type DailyLogFormInput = z.infer<typeof dailyLogFormSchema>;

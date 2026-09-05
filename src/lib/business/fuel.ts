import { Prisma } from "@prisma/client";

export class FuelValidationError extends Error {}

/** Above this, a single fill is flagged as unusually large and worth a
 * second look — not blocked, since large tanks and bulk fills exist. */
export const SUSPICIOUS_FUEL_QUANTITY_LITERS = 1000;

type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Rejects non-positive quantity/rate — a fuel entry must represent an
 * actual fill. */
export function validateFuelQuantities(params: { quantityLiters: DecimalInput; ratePerLiter: DecimalInput }): void {
  const quantity = toDecimal(params.quantityLiters);
  const rate = toDecimal(params.ratePerLiter);

  if (!quantity.isPositive() || quantity.isZero()) {
    throw new FuelValidationError("Quantity must be greater than zero.");
  }
  if (!rate.isPositive() || rate.isZero()) {
    throw new FuelValidationError("Price per litre must be greater than zero.");
  }
}

/**
 * Server-authoritative total. Never trust a client-supplied total —
 * always recompute it from quantity × rate using Decimal arithmetic (no
 * floating point) and persist this value.
 */
export function computeFuelTotal(quantityLiters: DecimalInput, ratePerLiter: DecimalInput): Prisma.Decimal {
  return toDecimal(quantityLiters).times(toDecimal(ratePerLiter)).toDecimalPlaces(2);
}

export function isSuspiciousFuelQuantity(quantityLiters: DecimalInput): boolean {
  return toDecimal(quantityLiters).greaterThan(SUSPICIOUS_FUEL_QUANTITY_LITERS);
}

export type FuelEfficiencyResult =
  | { available: true; value: Prisma.Decimal; unit: "L/hr" | "km/L" }
  | { available: false; reason: string };

/**
 * Litres per working hour — appropriate for hour-meter-driven equipment
 * (cranes). Requires a positive working-hours figure; with none, or with
 * zero, there is nothing meaningful to divide by.
 */
export function computeLitresPerHour(totalLiters: DecimalInput, totalWorkingHours: DecimalInput): FuelEfficiencyResult {
  const hours = toDecimal(totalWorkingHours);
  if (!hours.isPositive() || hours.isZero()) {
    return { available: false, reason: "Not enough data" };
  }
  return { available: true, value: toDecimal(totalLiters).dividedBy(hours).toDecimalPlaces(2), unit: "L/hr" };
}

/**
 * Kilometres per litre — appropriate for odometer-driven road vehicles.
 * Requires positive fuel quantity to divide by.
 */
export function computeKmPerLitre(totalDistanceKm: DecimalInput, totalLiters: DecimalInput): FuelEfficiencyResult {
  const liters = toDecimal(totalLiters);
  if (!liters.isPositive() || liters.isZero()) {
    return { available: false, reason: "Not enough data" };
  }
  return { available: true, value: toDecimal(totalDistanceKm).dividedBy(liters).toDecimalPlaces(2), unit: "km/L" };
}

/** Picks the appropriate efficiency metric for a vehicle category. Cranes
 * (and other hour-meter equipment) use L/hr; road vehicles use km/L. */
export function computeFuelEfficiency(params: {
  category: "CRANE" | "TRUCK" | "TRAILER" | "PICKUP" | "OTHER";
  totalLiters: DecimalInput;
  totalWorkingHours: DecimalInput;
  totalDistanceKm: DecimalInput;
}): FuelEfficiencyResult {
  if (params.category === "CRANE") {
    return computeLitresPerHour(params.totalLiters, params.totalWorkingHours);
  }
  return computeKmPerLitre(params.totalDistanceKm, params.totalLiters);
}

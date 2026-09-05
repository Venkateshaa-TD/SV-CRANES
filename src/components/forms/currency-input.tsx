import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { FieldWrapper, getFieldA11yProps } from "./field-wrapper";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<InputProps, "id" | "type"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
  /** Displayed currency symbol/code, e.g. "₹". Purely presentational — the
   * underlying value is a plain decimal string/number, never formatted
   * with separators, so it round-trips cleanly to Prisma.Decimal. */
  currencySymbol?: string;
}

/**
 * Money input. Always renders a plain decimal-string value: parse with
 * Prisma.Decimal / a Decimal.js on the server, never `parseFloat` into a
 * JS number for anything that gets persisted or summed.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ id, label, error, hint, required, wrapperClassName, currencySymbol = "₹", className, ...inputProps }, ref) => (
    <FieldWrapper id={id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground sm:text-sm"
          aria-hidden="true"
        >
          {currencySymbol}
        </span>
        <Input
          ref={ref}
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          required={required}
          className={cn("pl-8", className)}
          {...getFieldA11yProps(id, error, hint, required)}
          {...inputProps}
        />
      </div>
    </FieldWrapper>
  ),
);
CurrencyInput.displayName = "CurrencyInput";

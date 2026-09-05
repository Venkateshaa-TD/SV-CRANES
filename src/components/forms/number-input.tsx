import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { FieldWrapper, getFieldA11yProps } from "./field-wrapper";

interface NumberInputProps extends Omit<InputProps, "id" | "type"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
  /** "integer" disallows decimals (e.g. quantity); "decimal" allows them
   * (e.g. hours, liters). Controls the mobile keyboard and step. */
  mode?: "integer" | "decimal";
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ id, label, error, hint, required, wrapperClassName, mode = "decimal", ...inputProps }, ref) => (
    <FieldWrapper id={id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <Input
        ref={ref}
        type="number"
        inputMode={mode === "integer" ? "numeric" : "decimal"}
        step={mode === "integer" ? 1 : "any"}
        required={required}
        {...getFieldA11yProps(id, error, hint, required)}
        {...inputProps}
      />
    </FieldWrapper>
  ),
);
NumberInput.displayName = "NumberInput";

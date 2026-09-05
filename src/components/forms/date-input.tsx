import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { FieldWrapper, getFieldA11yProps } from "./field-wrapper";

interface DateInputProps extends Omit<InputProps, "id" | "type"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
}

/** Native date input — brings up the platform's own date picker on mobile,
 * which is far more usable than a custom calendar widget on a small
 * screen. */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ id, label, error, hint, required, wrapperClassName, ...inputProps }, ref) => (
    <FieldWrapper id={id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <Input
        ref={ref}
        type="date"
        required={required}
        {...getFieldA11yProps(id, error, hint, required)}
        {...inputProps}
      />
    </FieldWrapper>
  ),
);
DateInput.displayName = "DateInput";

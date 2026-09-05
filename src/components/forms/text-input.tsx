import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { FieldWrapper, getFieldA11yProps } from "./field-wrapper";

interface TextInputProps extends Omit<InputProps, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ id, label, error, hint, required, wrapperClassName, ...inputProps }, ref) => (
    <FieldWrapper id={id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <Input ref={ref} type="text" required={required} {...getFieldA11yProps(id, error, hint, required)} {...inputProps} />
    </FieldWrapper>
  ),
);
TextInput.displayName = "TextInput";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldWrapper, getFieldA11yProps } from "./field-wrapper";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  id: string;
  label: string;
  options: SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  wrapperClassName?: string;
}

export function SelectInput({
  id,
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
  error,
  hint,
  required,
  disabled,
  wrapperClassName,
}: SelectInputProps) {
  const a11y = getFieldA11yProps(id, error, hint, required);
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={a11y.id} aria-invalid={a11y["aria-invalid"]} aria-describedby={a11y["aria-describedby"]}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

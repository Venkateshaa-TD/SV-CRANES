import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldWrapperProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export interface FieldA11yProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
  "aria-required": boolean | undefined;
}

/** Computes the id/aria wiring a field's actual control needs. Each form
 * primitive spreads this directly onto its control (Input/Select/etc.) —
 * explicit rather than cloned, so it still works when the visible child
 * isn't the control itself (e.g. CurrencyInput's symbol-prefixed wrapper). */
export function getFieldA11yProps(id: string, error?: string, hint?: string, required?: boolean): FieldA11yProps {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return {
    id,
    "aria-invalid": !!error,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    "aria-required": required || undefined,
  };
}

/** Shared label/error/hint layout for every form field primitive. Errors
 * render right under the control and are wired via aria-describedby so
 * screen readers announce them; required fields get a visible marker
 * rather than relying on color alone. */
export function FieldWrapper({ id, label, error, hint, required, className, children }: FieldWrapperProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

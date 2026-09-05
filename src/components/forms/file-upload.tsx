"use client";

import * as React from "react";
import { Paperclip, X } from "lucide-react";
import { FieldWrapper, getFieldA11yProps } from "./field-wrapper";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
  accept?: string;
  onFileSelected?: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * Large tappable target styled as a card rather than the browser's tiny
 * default file input. `capture="environment"` lets phones offer the camera
 * directly for receipt/document photos. Actual upload validation (MIME
 * allowlist, size limit) always happens again server-side — see
 * src/lib/storage/validate.ts — this is UX only.
 */
export function FileUpload({
  id,
  label,
  error,
  hint,
  required,
  wrapperClassName,
  accept = "image/jpeg,image/png,image/webp,image/heic,application/pdf",
  onFileSelected,
  disabled,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const a11y = getFieldA11yProps(id, error, hint, required);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileName(file?.name ?? null);
    onFileSelected?.(file);
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    onFileSelected?.(null);
  }

  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <div className="flex items-center gap-2">
        <label
          htmlFor={a11y.id}
          className={cn(
            "flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Paperclip className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{fileName ?? "Tap to take a photo or choose a file"}</span>
        </label>
        {fileName ? (
          <button
            type="button"
            onClick={clearFile}
            aria-label="Remove selected file"
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
        aria-invalid={a11y["aria-invalid"]}
        aria-describedby={a11y["aria-describedby"]}
        id={a11y.id}
        required={required}
      />
    </FieldWrapper>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/action-result";

interface UseActionFormOptions<TData> {
  onSuccess?: (data: TData | undefined) => void;
  /** Path to navigate to on success. A function receives the action's
   * returned data (e.g. a newly created record's id). */
  redirectTo?: string | ((data: TData | undefined) => string);
}

/**
 * Shared glue between a form and a server action: runs the action inside
 * a transition, surfaces field errors next to inputs, shows a toast for
 * success/failure, and optionally redirects. Used by every Phase 1
 * create/edit form so each one only has to describe its own fields.
 */
export function useActionForm<TInput, TData = undefined>(
  action: (input: TInput) => Promise<ActionResult<TData>>,
  options?: UseActionFormOptions<TData>,
) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  function run(input?: TInput) {
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await action(input as TInput);

      if (!result.success) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (result.message) {
          setFormError(result.message);
          toast.error(result.message);
        } else if (!result.fieldErrors) {
          setFormError("Something went wrong. Please try again.");
        }
        return;
      }

      if (result.message) toast.success(result.message);
      options?.onSuccess?.(result.data);

      if (options?.redirectTo) {
        const destination = typeof options.redirectTo === "function" ? options.redirectTo(result.data) : options.redirectTo;
        router.push(destination);
      }
      router.refresh();
    });
  }

  return { run, pending, fieldErrors, formError };
}

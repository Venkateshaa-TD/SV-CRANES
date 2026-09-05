"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary. Never renders the raw error message/stack in
 * production — only a generic message plus the digest Next.js attaches,
 * which is safe to show and useful for correlating with server logs.
 */
export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          An unexpected error occurred. You can try again, or come back in a moment.
        </p>
        {error.digest ? <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p> : null}
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

import { ShieldAlert } from "lucide-react";

/** Rendered in place (200 response) when a signed-in user hits a page or
 * section they lack permission for. Never rely on a hidden nav link to
 * keep users out — every page must check permission and render this (or
 * throw AuthorizationError from a server action) itself. */
export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">You don&apos;t have access to this page</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          If you believe this is a mistake, contact an administrator to review your account&apos;s
          permissions.
        </p>
      </div>
    </div>
  );
}

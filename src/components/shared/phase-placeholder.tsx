import { Construction } from "lucide-react";

interface PhasePlaceholderProps {
  moduleName: string;
  description?: string;
}

/**
 * Marks a route as scaffolded-but-not-yet-implemented. Used across every
 * module page in this foundation phase so navigation architecture exists
 * without pretending the workflow is built. Replace with the real page
 * content when that module's phase is implemented.
 */
export function PhasePlaceholder({ moduleName, description }: PhasePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Construction className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{moduleName} is coming in a later phase</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {description ??
            "This route is part of the application's navigation foundation. The full workflow will be built out in an upcoming phase."}
        </p>
      </div>
    </div>
  );
}

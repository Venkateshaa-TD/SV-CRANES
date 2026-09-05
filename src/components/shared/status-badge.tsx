import { Badge } from "@/components/ui/badge";

type Status =
  | "WORKING"
  | "IDLE"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "DRAFT"
  | "SUBMITTED";

const STATUS_CONFIG: Record<Status, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "default"; dot: string }> = {
  WORKING: { label: "Working", variant: "success", dot: "bg-success" },
  IDLE: { label: "Idle", variant: "secondary", dot: "bg-muted-foreground" },
  MAINTENANCE: { label: "Maintenance", variant: "warning", dot: "bg-warning" },
  OUT_OF_SERVICE: { label: "Out of Service", variant: "destructive", dot: "bg-destructive" },
  PENDING: { label: "Pending", variant: "warning", dot: "bg-warning" },
  APPROVED: { label: "Approved", variant: "success", dot: "bg-success" },
  REJECTED: { label: "Rejected", variant: "destructive", dot: "bg-destructive" },
  DRAFT: { label: "Draft", variant: "secondary", dot: "bg-muted-foreground" },
  SUBMITTED: { label: "Submitted", variant: "default", dot: "bg-primary" },
};

/** Every status renders with both a color AND a text label + dot, so
 * meaning never depends on color alone. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} dotClassName={config.dot} className={className}>
      {config.label}
    </Badge>
  );
}

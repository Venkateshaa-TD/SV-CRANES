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
  | "SUBMITTED"
  | "REVIEW"
  | "SENT"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "INVOICED"
  | "UPCOMING"
  | "ACTIVE"
  | "COMPLETED"
  | "OPEN"
  | "CLOSED"
  | "REOPENED";

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
  REVIEW: { label: "In Review", variant: "default", dot: "bg-primary" },
  SENT: { label: "Sent", variant: "default", dot: "bg-primary" },
  PARTIALLY_PAID: { label: "Partially Paid", variant: "warning", dot: "bg-warning" },
  PAID: { label: "Paid", variant: "success", dot: "bg-success" },
  OVERDUE: { label: "Overdue", variant: "destructive", dot: "bg-destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary", dot: "bg-muted-foreground" },
  INVOICED: { label: "Invoiced", variant: "success", dot: "bg-success" },
  UPCOMING: { label: "Upcoming", variant: "secondary", dot: "bg-muted-foreground" },
  ACTIVE: { label: "Active", variant: "success", dot: "bg-success" },
  COMPLETED: { label: "Completed", variant: "secondary", dot: "bg-muted-foreground" },
  OPEN: { label: "Open", variant: "secondary", dot: "bg-muted-foreground" },
  CLOSED: { label: "Closed", variant: "success", dot: "bg-success" },
  REOPENED: { label: "Reopened", variant: "warning", dot: "bg-warning" },
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

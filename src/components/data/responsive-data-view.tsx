import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Right-align numeric/monetary columns. */
  align?: "left" | "right";
}

interface ResponsiveDataViewProps<T> {
  data: T[];
  keyField: (row: T) => string;
  columns: DataColumn<T>[];
  /** Card rendering used below the md breakpoint — the record shown as a
   * self-contained row card rather than a horizontally-scrolling table. */
  renderCard: (row: T) => ReactNode;
  emptyState: ReactNode;
  className?: string;
}

/**
 * The standard list/table pattern for this app: a real <table> on desktop,
 * stacked cards on mobile, both rendered server-side from the same data so
 * there is no client JS, no layout flash, and no `overflow-x-auto` table
 * squeezed onto a phone screen. Reach for this instead of hand-building a
 * table per module.
 */
export function ResponsiveDataView<T>({
  data,
  keyField,
  columns,
  renderCard,
  emptyState,
  className,
}: ResponsiveDataViewProps<T>) {
  if (data.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className={className}>
      <div className="space-y-3 md:hidden">
        {data.map((row) => (
          <div key={keyField(row)}>{renderCard(row)}</div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={cn("px-4 py-3 font-medium", column.align === "right" && "text-right", column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr key={keyField(row)} className="hover:bg-muted/30">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={cn("px-4 py-3 align-middle", column.align === "right" && "text-right", column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

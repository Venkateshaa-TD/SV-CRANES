"use client";

import { Controller, useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextInput } from "@/components/forms/text-input";
import { NumberInput } from "@/components/forms/number-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { SelectInput } from "@/components/forms/select-input";

export interface InvoiceLineFields {
  lines: { vehicleId: string; description: string; quantity: string; unitPrice: string; taxPercent: string }[];
}

interface VehicleOption {
  id: string;
  name: string;
}

/**
 * Mobile-first line-item editor: each line is a self-contained card
 * (label above every field, one column) rather than a spreadsheet-style
 * row of inputs — the latter cannot fit at a 320px viewport without
 * horizontal scrolling. Desktop users get the same stacked cards; the
 * list itself scrolls vertically, which is the natural pattern at any
 * width for a handful of invoice lines.
 */
/**
 * `control`/`register` are typed against InvoiceLineFields even though
 * the caller's actual form has additional sibling fields (issueDate,
 * notes, etc.) — react-hook-form's path-typing can't express "a form
 * that is a superset of this shape" for a reusable sub-component, so
 * callers pass their `control`/`register` cast to this narrower type.
 * The "lines.N.field" paths this component actually touches are
 * structurally identical either way.
 */
export function InvoiceLineEditor({
  control,
  register,
  vehicleOptions,
  lineErrors,
}: {
  control: Control<InvoiceLineFields>;
  register: UseFormRegister<InvoiceLineFields>;
  vehicleOptions: VehicleOption[];
  lineErrors?: Record<string, string>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <Card key={field.id}>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Line {index + 1}</span>
              {fields.length > 1 ? (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove line">
                  <Trash2 />
                </Button>
              ) : null}
            </div>
            <TextInput
              id={`line-description-${index}`}
              label="Description"
              required
              error={lineErrors?.[`lines.${index}.description`]}
              {...register(`lines.${index}.description`, { required: true })}
            />
            {vehicleOptions.length > 0 ? (
              <Controller
                control={control}
                name={`lines.${index}.vehicleId`}
                render={({ field: controllerField }) => (
                  <SelectInput
                    id={`line-vehicle-${index}`}
                    label="Vehicle (optional)"
                    placeholder="None"
                    value={controllerField.value}
                    onValueChange={controllerField.onChange}
                    options={vehicleOptions.map((v) => ({ value: v.id, label: v.name }))}
                  />
                )}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                id={`line-quantity-${index}`}
                label="Quantity"
                required
                error={lineErrors?.[`lines.${index}.quantity`]}
                {...register(`lines.${index}.quantity`, { required: true })}
              />
              <CurrencyInput
                id={`line-rate-${index}`}
                label="Rate"
                required
                error={lineErrors?.[`lines.${index}.unitPrice`]}
                {...register(`lines.${index}.unitPrice`, { required: true })}
              />
            </div>
            <NumberInput id={`line-tax-${index}`} label="Tax %" hint="e.g. 18 for 18% GST" {...register(`lines.${index}.taxPercent`)} />
          </CardContent>
        </Card>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ vehicleId: "", description: "", quantity: "1", unitPrice: "", taxPercent: "" })}
      >
        <Plus /> Add Line
      </Button>
    </div>
  );
}

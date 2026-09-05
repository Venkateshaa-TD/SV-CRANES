"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { MoreVertical, Pencil, KeyRound, UserX, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { TextInput } from "@/components/forms/text-input";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { setEmployeeActive, resetEmployeePassword } from "@/lib/actions/employees";

interface EmployeeRowActionsProps {
  employeeId: string;
  isActive: boolean;
  isSelf: boolean;
}

export function EmployeeRowActions({ employeeId, isActive, isSelf }: EmployeeRowActionsProps) {
  const [resetOpen, setResetOpen] = React.useState(false);
  const { run: runToggle, pending: togglePending } = useActionForm((next: boolean) =>
    setEmployeeActive(employeeId, next),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Employee actions">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/users/${employeeId}/edit`}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setResetOpen(true)}>
            <KeyRound /> Reset Password
          </DropdownMenuItem>
          {!isSelf ? (
            <DropdownMenuItem
              destructive={isActive}
              disabled={togglePending}
              onSelect={() => runToggle(!isActive)}
            >
              {isActive ? <UserX /> : <UserCheck />}
              {isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDrawer employeeId={employeeId} open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}

function ResetPasswordDrawer({
  employeeId,
  open,
  onOpenChange,
}: {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ password: string }>({
    defaultValues: { password: "" },
  });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { password: string }) => resetEmployeePassword({ userId: employeeId, password: input.password }),
    {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    },
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Reset password</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <TextInput
            id="new-password"
            label="New Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters. Share this with the employee securely."
            error={errors.password?.message ?? fieldErrors.password}
            {...register("password", { required: "Enter a new password" })}
          />
          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Resetting…" : "Reset Password"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

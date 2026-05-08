import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  triggerRef,
  title,
  description = "This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
}) {
  const [pending, setPending] = React.useState(false)

  async function handleConfirm(e) {
    e.preventDefault()
    if (!onConfirm) return
    setPending(true)
    try {
      await onConfirm()
      onOpenChange?.(false)
    } catch {
      // caller surfaces the error via toast; leave the dialog open so the user can retry or cancel
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(next) {
    if (pending) return
    onOpenChange?.(next)
    if (!next && triggerRef?.current) {
      // Defer to next tick so Radix's focus-scope cleanup runs first;
      // otherwise our focus() call gets overridden by Radix's restore-to-body.
      setTimeout(() => {
        try { triggerRef.current?.focus() } catch {}
      }, 0)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={handleConfirm}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {pending ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

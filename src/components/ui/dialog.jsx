"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// DialogContent is top-anchored (not vertically centered) so its title
// is never obscured by the suite's fixed primary header (PageHeader,
// 58px, z-200) or by any page-owned fixed chrome below it (list-page
// bar-2 / bar-3 at z-150, the provider detail page's condensed header
// also at z-150). Chrome sits above the dialog's z-50 overlay by design
// (CRM-STATE.md: "chrome bars at z-150 / z-200 sit above overlays so the
// user can still orient on what page they are on while an overlay
// is open").
//
// The anchor reads the `--ps-chrome-bottom` CSS variable that each
// page sets via the useChromeBottom hook to its total fixed-chrome
// height. Pages without page-owned chrome don't set the variable;
// the fallback covers the 58px primary header. The 1rem cushion sits
// between the chrome's bottom edge and the dialog's top edge.
//
// The primitive owns both edges of the box: the top anchors below
// chrome via `--ps-chrome-bottom` + 1rem; maxHeight clamps the
// bottom to the visible viewport via `100dvh - --ps-chrome-bottom
// - 2rem` (1rem for the top cushion already in `top`, 1rem for a
// bottom cushion). 100dvh — NOT 100vh — so mobile URL-bar collapse
// doesn't re-break the clamp.
//
// DialogContent is `flex flex-col overflow-hidden` so tall dialogs
// can lay out a scrollable body region + a pinned footer (Save bar)
// as flex siblings — the footer never lives inside the scroll
// region. Short dialogs whose content fits inside the maxHeight
// render identically to before; the flex column reads the same as
// the old `grid gap-4` for stacked children, and gap-4 still
// applies between flex children. See the long-form consumers
// (ProviderFormDialog, OpportunityFormDialog, RateStructureFormDialog,
// etc.) for the body-scrolls/footer-pinned structure.
const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      style={{
        top: 'calc(var(--ps-chrome-bottom, calc(58px + env(safe-area-inset-top))) + 1rem)',
        maxHeight: 'calc(100dvh - var(--ps-chrome-bottom, calc(58px + env(safe-area-inset-top))) - 2rem)',
      }}
      className={cn(
        "fixed left-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] gap-4 border bg-background p-6 shadow-lg overflow-hidden duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className
      )}
      {...props}>
      {children}
      <DialogPrimitive.Close
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

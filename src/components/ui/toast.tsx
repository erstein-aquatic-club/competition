import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-0 left-1/2 z-toast flex -translate-x-1/2 flex-col items-center gap-2 p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] w-full max-w-[min(420px,calc(100vw-2rem))] pointer-events-none [&>*]:pointer-events-auto",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

// ── Dot color by variant ──────────────────────────────────────

const dotColors = {
  default: "bg-emerald-500",
  destructive: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
} as const

type ToastVariant = keyof typeof dotColors

// ── Toast Root ────────────────────────────────────────────────

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & {
    variant?: ToastVariant
  }
>(({ className, variant = "default", ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    className={cn(
      // Pill shape
      "group relative flex w-fit max-w-full items-center gap-2.5",
      "rounded-full px-4 py-2.5",
      // Glass effect
      "bg-foreground/[0.85] dark:bg-background/[0.85]",
      "backdrop-blur-xl backdrop-saturate-150",
      "shadow-[0_2px_12px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)]",
      "dark:shadow-[0_2px_12px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06)]",
      // Animations
      "transition-all duration-200 ease-out",
      "data-[swipe=cancel]:translate-x-0",
      "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
      "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
      "data-[swipe=move]:transition-none",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:zoom-in-95",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=closed]:zoom-out-95",
      className
    )}
    {...props}
  >
    {/* Accent dot */}
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        "shadow-[0_0_6px_1px] shadow-current/20",
        dotColors[variant]
      )}
    />
    {props.children}
  </ToastPrimitives.Root>
))
Toast.displayName = ToastPrimitives.Root.displayName

// ── Close ─────────────────────────────────────────────────────

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "shrink-0 rounded-full p-0.5 -mr-1",
      "text-background/50 dark:text-foreground/40",
      "hover:text-background/80 dark:hover:text-foreground/70",
      "transition-colors",
      "focus:outline-none focus-visible:ring-1 focus-visible:ring-background/30",
      className
    )}
    toast-close=""
    {...props}
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="stroke-current stroke-[1.5]">
      <path d="M4 4l6 6M10 4l-6 6" />
    </svg>
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

// ── Title ─────────────────────────────────────────────────────

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn(
      "text-[13px] font-medium leading-tight",
      "text-background dark:text-foreground",
      className
    )}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

// ── Description ───────────────────────────────────────────────

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn(
      "text-[12px] leading-tight",
      "text-background/60 dark:text-foreground/50",
      className
    )}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

// ── Action ────────────────────────────────────────────────────

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "shrink-0 rounded-full px-2.5 py-1",
      "text-[11px] font-semibold",
      "text-background dark:text-foreground",
      "bg-background/15 dark:bg-foreground/10",
      "hover:bg-background/25 dark:hover:bg-foreground/20",
      "transition-colors",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}

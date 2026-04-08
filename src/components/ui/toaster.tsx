import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={2500} swipeDirection="down" swipeThreshold={30}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        // Map "destructive" variant from existing call sites
        const resolvedVariant = variant === "destructive" ? "destructive" : "default"

        return (
          <Toast key={id} variant={resolvedVariant} {...props}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0 flex items-baseline gap-1.5">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
              {action}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

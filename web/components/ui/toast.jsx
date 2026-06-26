"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "radix-ui"
import { X } from "lucide-react"
import { ToastContext } from "@/lib/toast"
import { cn } from "@/lib/utils"

function Toaster() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) return null
  const { toasts, dismiss } = ctx

  return (
    <ToastPrimitive.Provider>
      {toasts.map(({ id, title, description, variant }) => (
        <ToastPrimitive.Root
          key={id}
          open={true}
          onOpenChange={(open) => { if (!open) dismiss(id) }}
          className={cn(
            "fixed bottom-4 right-4 z-[100] flex w-full max-w-sm items-start gap-3 rounded-lg border bg-background p-4 shadow-lg transition-all",
            variant === "success" && "border-green-500 text-green-700 dark:text-green-400",
            variant === "error" && "border-red-500 text-red-700 dark:text-red-400",
          )}
        >
          <div className="flex-1 gap-1">
            {title && (
              <ToastPrimitive.Title className="text-sm font-semibold">
                {title}
              </ToastPrimitive.Title>
            )}
            {description && (
              <ToastPrimitive.Description className="text-xs text-muted-foreground">
                {description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
            onClick={() => dismiss(id)}
          >
            <X className="size-4" />
            <span className="sr-only">Fechar</span>
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-sm" />
    </ToastPrimitive.Provider>
  )
}

export { Toaster }

import * as React from "react"

import { cn } from "@/lib/utils"

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-8.5 w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-2.5 text-xs text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
        className,
      )}
      {...props}
    />
  )
}

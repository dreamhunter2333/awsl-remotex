import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn("flex h-7 items-center gap-1 rounded-md bg-[var(--background)] px-2 text-[11px] font-medium text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[placeholder]:text-[var(--muted)]", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="ml-auto size-3 text-[var(--subtle)]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn("z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 text-[var(--foreground)] shadow-[0_12px_32px_var(--shadow)]", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1", className)}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn("relative flex h-8 cursor-default select-none items-center rounded-md py-1 pl-2 pr-7 text-xs text-[var(--muted)] outline-none data-[highlighted]:bg-[var(--surface-hover)] data-[highlighted]:text-[var(--foreground)] data-[state=checked]:text-[var(--foreground)]", className)}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 grid size-3.5 place-items-center text-[var(--accent)]">
        <SelectPrimitive.ItemIndicator><Check className="size-3.5" /></SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}

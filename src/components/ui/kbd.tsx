import * as React from "react"
import { cn } from "@/lib/utils"

function Kbd({
  className,
  ...props
}: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 select-none items-center justify-center gap-0.5 rounded border border-gray-200 bg-gray-100 px-1.5 font-mono text-[10px] font-medium text-gray-500",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }

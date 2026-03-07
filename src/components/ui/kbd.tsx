import * as React from "react"
import { cn } from "@/lib/utils"

function Kbd({
  className,
  ...props
}: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 select-none items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-400",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }

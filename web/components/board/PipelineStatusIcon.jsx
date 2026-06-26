import { AlertTriangle, Check, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"

export default function PipelineStatusIcon({ state, className }) {
  if (state === "running") return <Loader2 className={cn("size-3.5 animate-spin", className)} />
  if (state === "done") return <Check className={cn("size-3.5 text-state-completed", className)} />
  if (state === "error") return <AlertTriangle className={cn("size-3.5 text-destructive", className)} />
  return <Play className={cn("size-3.5 text-muted-foreground", className)} />
}

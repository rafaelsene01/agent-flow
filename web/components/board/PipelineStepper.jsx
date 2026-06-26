"use client"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18nContext"
import PipelineStatusIcon from "@/components/board/PipelineStatusIcon.jsx"

const STAGES = [
  { key: "branch", labelKey: "pipeline.branch" },
  { key: "task", labelKey: "pipeline.task" },
  { key: "tlc", labelKey: "pipeline.tlc" },
  { key: "spec", labelKey: "pipeline.spec" },
  { key: "specEval", labelKey: "pipeline.specEval" },
  { key: "commitPush", labelKey: "pipeline.commitPush" },
  { key: "pr", labelKey: "pipeline.pr" },
]

export default function PipelineStepper({ stages }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-0.5">
      {STAGES.map((s) => {
        const st = stages?.[s.key] ?? "pending"
        return (
          <div
            key={s.key}
            className={cn(
              "flex items-center gap-2 text-xs py-0.5",
              st === "pending" && "text-muted-foreground",
              st === "current" && "text-foreground font-medium",
              st === "done" && "text-state-completed",
              st === "error" && "text-destructive",
            )}
          >
            <PipelineStatusIcon
              state={st === "pending" ? "ready" : st === "current" ? "running" : st}
              className="shrink-0"
            />
            <span>{t(s.labelKey)}</span>
          </div>
        )
      })}
    </div>
  )
}

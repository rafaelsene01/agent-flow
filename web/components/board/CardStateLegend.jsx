"use client"
import { Info } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { useI18n } from "@/lib/i18nContext"

export default function CardStateLegend() {
  const { t } = useI18n()
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("legend.title")}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 rounded-lg border bg-background p-3 shadow-md w-56 text-xs"
        >
          <p className="font-semibold mb-2 text-foreground">{t("legend.title")}</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full border-2 border-[#999] shrink-0" />
              <span className="text-muted-foreground"><strong className="text-foreground">{t("legend.silver")}</strong> — {t("legend.branch")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full border-2 border-[#c8860a] shrink-0" />
              <span className="text-muted-foreground"><strong className="text-foreground">{t("legend.gold")}</strong> — {t("legend.done")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full border-2 border-blue-400 shrink-0 animate-spin" style={{borderTopColor: 'transparent'}} />
              <span className="text-muted-foreground"><strong className="text-foreground">{t("legend.spinning")}</strong> — {t("legend.running")}</span>
            </div>
          </div>
          <PopoverPrimitive.Arrow className="fill-border" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

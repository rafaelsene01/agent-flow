"use client"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18nContext"

export function ConfirmDialog({ open, onConfirm, onCancel, title, description, targetName, destructive = false }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {(description || targetName) && (
            <DialogDescription>
              {targetName && <><strong>{targetName}</strong><br /></>}
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t("action.cancel")}</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{t("action.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useEffect } from "react"
import { I18nProvider, useI18n } from "@/lib/i18nContext"
import { ToastProvider } from "@/lib/toast"
import { Toaster } from "@/components/ui/toast"

function LangSync() {
  const { lang } = useI18n()
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang
  }, [lang])
  return null
}

export default function Providers({ children }) {
  return (
    <I18nProvider>
      <LangSync />
      <ToastProvider>
        {children}
        <Toaster />
      </ToastProvider>
    </I18nProvider>
  )
}

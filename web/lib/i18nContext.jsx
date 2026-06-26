"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { DEFAULT_LOCALE, dictionaries } from "./i18n.js"

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LOCALE)

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (c.language) setLangState(c.language) })
      .catch(() => {})
  }, [])

  const t = useCallback(
    (key) => {
      const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LOCALE]
      return dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key
    },
    [lang]
  )

  const setLang = useCallback((newLang) => {
    setLangState(newLang)
  }, [])

  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}

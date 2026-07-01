"use client";

import { Bot } from "lucide-react";
import PlaceholderView from "@/components/views/PlaceholderView.jsx";
import { useI18n } from "@/lib/i18nContext";

export default function AgentsView() {
  const { t } = useI18n();
  return (
    <PlaceholderView
      icon={Bot}
      title={t("agents.title")}
      description={t("agents.desc")}
      badge={t("agents.soon")}
    />
  );
}

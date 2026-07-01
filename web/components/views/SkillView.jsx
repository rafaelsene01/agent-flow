"use client";

import { Sparkles } from "lucide-react";
import PlaceholderView from "@/components/views/PlaceholderView.jsx";
import { useI18n } from "@/lib/i18nContext";

export default function SkillView() {
  const { t } = useI18n();
  return (
    <PlaceholderView
      icon={Sparkles}
      title={t("skill.title")}
      description={t("skill.desc")}
      badge={t("skill.soon")}
    />
  );
}

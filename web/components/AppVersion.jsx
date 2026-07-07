"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Versão instalada, exibida discreta ao lado da marca (GET /api/update,
// campo `current`). Quando há versão nova disponível, pulsa em destaque —
// a atualização em si é autorizada pelo UpdateBadge no rodapé da sidebar.
export default function AppVersion() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/update");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setInfo(data);
      } catch {}
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (!info?.current) return null;
  return (
    <span
      className={cn(
        "text-[10px] font-normal tabular-nums",
        info.updateAvailable ? "animate-pulse text-primary" : "text-muted-foreground/70"
      )}
    >
      v{info.current}
    </span>
  );
}

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/lib/utils";

export default function CopyCmd({ cmd }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={handleCopy}
      title="Copiar"
      className={cn(
        "w-full justify-between gap-2 font-mono text-[11px]",
        copied && "border-state-completed/50 text-state-completed",
      )}
    >
      <code className="truncate">{cmd}</code>
      {copied ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <Copy className="size-3 shrink-0" />
      )}
    </Button>
  );
}

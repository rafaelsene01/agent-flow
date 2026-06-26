"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/lib/utils";

export default function CopyCmd({ cmd }) {
  const [copied, setCopied] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const inputRef = useRef(null);

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cmd).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } else {
      setShowSelect(true);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }

  return (
    <div className="relative w-full">
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
      {showSelect && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-2 shadow-md">
          <p className="mb-1.5 text-xs text-muted-foreground">Selecione e copie (Ctrl+C):</p>
          <input
            ref={inputRef}
            readOnly
            value={cmd}
            autoFocus
            onFocus={(e) => e.target.select()}
            onBlur={() => setShowSelect(false)}
            className="w-full rounded border bg-background px-2 py-1 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
    </div>
  );
}

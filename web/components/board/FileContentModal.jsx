"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";

export default function FileContentModal({ worktreeId, filePath, onClose }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/file-content?file=${encodeURIComponent(filePath)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content ?? "(arquivo vazio ou deletado)");
      })
      .catch((err) => setError(err.message));
  }, [worktreeId, filePath]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-full sm:max-w-3xl max-h-[85vh] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <DialogTitle className="flex-1 truncate font-mono text-sm" title={filePath}>
            {filePath}
          </DialogTitle>
        </div>
        <div className="overflow-auto p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : content === null ? (
            <div className="flex justify-center p-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{content}</pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { FileText, Palette, ListChecks, Pencil, Eye } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const TLC_LABEL = { spec: "Spec", design: "Design", tasks: "Tasks" };

const TLC_LUCIDE = {
  spec: FileText,
  design: Palette,
  tasks: ListChecks,
};

export default function TlcFileModal({ worktreeId, type, onClose }) {
  const [content, setContent] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/tlc-file/${type}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content);
      })
      .catch((err) => setError(err.message));
  }, [worktreeId, type]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/tlc-file/${type}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const Icon = TLC_LUCIDE[type] ?? FileText;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="w-full sm:max-w-[calc(100%-2rem)] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* ── header row: title + toolbar ── */}
        <div className="flex items-center gap-2 px-5 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold flex-1 min-w-0">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {TLC_LABEL[type]}
          </DialogTitle>

          {/* toolbar: tabs + save + close */}
          <div className="flex items-center gap-2">
            <Tabs
              value={preview ? "preview" : "edit"}
              onValueChange={(v) => setPreview(v === "preview")}
            >
              <TabsList className="h-7 px-[3px] py-[2px]">
                <TabsTrigger value="edit" className="gap-1 text-xs px-2 py-0.5 h-[calc(100%-2px)]">
                  <Pencil className="size-3" />
                  Editar
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-1 text-xs px-2 py-0.5 h-[calc(100%-2px)]">
                  <Eye className="size-3" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || content === null}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </Button>
          </div>
        </div>

        {/* ── error / loading ── */}
        {error && (
          <p className="text-xs text-destructive px-5 py-2 shrink-0">
            ⚠ {error}
          </p>
        )}

        {content === null && !error && (
          <p className="text-xs text-muted-foreground px-5 py-3 shrink-0">
            Carregando…
          </p>
        )}

        {/* ── editor / preview ── */}
        {content !== null &&
          (preview ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <Textarea
              className={cn(
                "flex-1 min-h-0 resize-none rounded-none border-0 font-mono text-[13px] leading-relaxed focus-visible:ring-0 focus-visible:border-0 overflow-y-auto [field-sizing:fixed]",
              )}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

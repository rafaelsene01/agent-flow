"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { Loader2, FileText, Code } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function isMarkdownFile(filePath) {
  return /\.(md|markdown|mdx)$/i.test(filePath ?? "");
}

export default function FileContentModal({ worktreeId, filePath, onClose, fetchUrl }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [markdown, setMarkdown] = useState(isMarkdownFile(filePath));

  useEffect(() => {
    const url = fetchUrl ??
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/file-content?file=${encodeURIComponent(filePath)}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content ?? "(arquivo vazio ou deletado)");
      })
      .catch((err) => setError(err.message));
  }, [worktreeId, filePath, fetchUrl]);

  return (
    <Dialog open modal={false} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-full sm:max-w-[calc(100%-2rem)] min-h-[80vh] max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b pl-4 pr-12 py-3 shrink-0">
          <DialogTitle className="flex-1 truncate font-mono text-sm" title={filePath}>
            {filePath}
          </DialogTitle>
          <Tabs
            value={markdown ? "markdown" : "text"}
            onValueChange={(v) => setMarkdown(v === "markdown")}
          >
            <TabsList className="h-7 px-[3px] py-[2px]">
              <TabsTrigger value="markdown" className="gap-1 text-xs px-2 py-0.5 h-[calc(100%-2px)]">
                <FileText className="size-3" />
                Markdown
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-1 text-xs px-2 py-0.5 h-[calc(100%-2px)]">
                <Code className="size-3" />
                Texto
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : content === null ? (
            <div className="flex justify-center p-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeHighlight, { detect: false }]]}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{content}</pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

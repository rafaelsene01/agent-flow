"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";
import { Loader2, FileText, Code, AlertCircle, Pencil, Eye, Save } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fileIcon } from "@/lib/fileVisuals";

function isMarkdownFile(filePath) {
  return /\.(md|markdown|mdx)$/i.test(filePath ?? "");
}

function fileExt(filePath) {
  const name = (filePath ?? "").split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// Quebra "a/b/file.ext" em { dir: "a/b/", name: "file.ext" }
function splitPath(filePath) {
  const p = filePath ?? "";
  const idx = p.lastIndexOf("/");
  return idx === -1
    ? { dir: "", name: p }
    : { dir: p.slice(0, idx + 1), name: p.slice(idx + 1) };
}

function CodeView({ content, filePath }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    delete el.dataset.highlighted;
    const ext = fileExt(filePath);
    // language-<ext> quando hljs conhece; senão deixa auto-detectar
    el.className = hljs.getLanguage(ext) ? `language-${ext}` : "";
    el.textContent = content;
    hljs.highlightElement(el);
  }, [content, filePath]);

  return (
    <pre className="flex flex-col flex-1 min-h-0 whitespace-pre-wrap font-mono text-xs leading-relaxed">
      <code ref={ref} style={{ display: "block", flex: 1 }} />
    </pre>
  );
}

export default function FileContentModal({ worktreeId, filePath, onClose, fetchUrl }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const isMarkdown = isMarkdownFile(filePath);
  const [markdown, setMarkdown] = useState(isMarkdown);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const url = fetchUrl ??
    `/api/config/worktrees/${encodeURIComponent(worktreeId)}/file-content?file=${encodeURIComponent(filePath)}`;

  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content ?? "(arquivo vazio ou deletado)");
      })
      .catch((err) => setError(err.message));
  }, [url]);

  function enterEdit() {
    setEditContent(content);
    setEditMode(true);
    setSaveError(null);
  }

  function exitEdit() {
    setEditMode(false);
    setSaveError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setContent(editContent);
      setEditMode(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const Icon = fileIcon(filePath);
  const { dir, name } = splitPath(filePath);
  const dirty = editMode && editContent !== content;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-full sm:max-w-[calc(100%-2rem)] min-h-[80vh] max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b pl-4 pr-12 py-3 shrink-0">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <DialogTitle className="flex-1 truncate font-mono text-sm" title={filePath}>
            {dir && <span className="text-muted-foreground">{dir}</span>}
            <span className="font-semibold text-foreground">{name}</span>
            {dirty && (
              <span
                className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle"
                title="Alterações não salvas"
              />
            )}
          </DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            {content !== null && !editMode && (
              <Button size="sm" variant="outline" onClick={enterEdit} className="h-7 gap-1 px-2 text-xs">
                <Pencil className="size-3" />
                Editar
              </Button>
            )}
            {editMode && (
              <>
                <Button size="sm" variant="ghost" onClick={exitEdit} className="h-7 gap-1 px-2 text-xs">
                  <Eye className="size-3" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  {saving
                    ? <Loader2 className="size-3 animate-spin" />
                    : <Save className="size-3" />}
                  Salvar
                </Button>
              </>
            )}
            {isMarkdown && !editMode && (
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
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 flex flex-col">
          {saveError && (
            <p className="mb-2 shrink-0 text-xs text-destructive">⚠ {saveError}</p>
          )}
          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : content === null ? (
            <div className="flex justify-center p-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : editMode ? (
            <Textarea
              className="flex-1 min-h-0 resize-none font-mono text-[13px] leading-relaxed focus-visible:ring-1 [field-sizing:fixed]"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
            />
          ) : isMarkdown && markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeHighlight, { detect: false }]]}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <CodeView content={content} filePath={filePath} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

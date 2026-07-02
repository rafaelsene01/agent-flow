"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  Sparkles,
  Loader2,
  Send,
  Save,
  FileText,
  Code,
  User,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/toast";

// Nome vira o basename da pasta em .claude/skills/<name>; espelha a validação do
// backend (saveSkill em skill-creator.js): minúsculas, números e hífens.
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Modal de criação de skill com dois modos:
 * - "form" (padrão): o usuário informa o nome (pasta) e cola/edita o conteúdo da
 *   SKILL.md, revisando em markdown ou texto, e salva.
 * - "ai": conduz uma entrevista com o Claude (skill-creator via wrapper estruturado);
 *   ao concluir, preenche nome/conteúdo e volta ao formulário para revisar e salvar.
 * Cada abertura gera um UUID novo usado como sessão (-n) do fluxo de IA.
 */
export default function SkillCreatorModal({ onClose, onSaved }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("form"); // "form" | "ai"

  // Estado do fluxo de IA.
  const [sessionId] = useState(() => crypto.randomUUID());
  const [started, setStarted] = useState(false);
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  // thread: mistura de { role:"user", text } e { role:"assistant", question, options }
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  // Estado do formulário (revisar/nomear/salvar).
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [view, setView] = useState("text"); // "markdown" | "text"
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState(null);

  const lastQuestion = [...thread].reverse().find((m) => m.role === "assistant");
  const options = lastQuestion?.options ?? [];

  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length > 0 && !NAME_RE.test(trimmedName);
  const canSave = !saving && trimmedName.length > 0 && !nameInvalid && content.trim().length > 0;

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setError(null);
    setThread((t) => [...t, { role: "user", text }]);
    setDraft("");
    setPending(true);
    try {
      const res = await fetch("/api/skills/create/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, prompt: text, started, model, effort }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStarted(true);
      if (data.type === "complete") {
        // IA concluiu: preenche o formulário e volta para revisão/salvar.
        setName(data.name ?? "");
        setContent(data.content ?? "");
        setView("markdown");
        setMode("form");
      } else {
        setThread((t) => [
          ...t,
          { role: "assistant", question: data.question, options: data.options ?? [] },
        ]);
      }
    } catch (err) {
      // Devolve o rascunho e remove o balão do usuário para reenviar.
      setError(err.message);
      setDraft(text);
      setThread((t) => t.slice(0, -1));
    } finally {
      setPending(false);
    }
  }

  function pickOption(opt) {
    setDraft((d) => (d.trim() ? `${d.trim()} ${opt}` : opt));
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/skills/create/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, content }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: `Skill "${data.name}" criada ✓` });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="w-full sm:max-w-[1400px] h-[85vh] flex flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* ── Header ── */}
        <DialogHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            {mode === "ai" ? (
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                onClick={() => { setMode("form"); setError(null); }}
                aria-label="Voltar"
                title="Voltar ao formulário"
              >
                <ArrowLeft className="size-4" />
              </Button>
            ) : (
              <Sparkles className="size-4 text-muted-foreground shrink-0" />
            )}
            <DialogTitle className="text-sm font-semibold leading-none">
              {mode === "ai" ? "Gerar skill com IA" : "Criar skill"}
            </DialogTitle>
          </div>
          <Button variant="ghost" size="icon-xs" type="button" onClick={onClose} aria-label="Fechar">
            ✕
          </Button>
        </DialogHeader>

        {mode === "form" ? (
          /* ── Formulário: nomear, colar/editar e salvar ── */
          <>
            <div className="flex flex-col gap-3 border-b px-5 py-3.5 shrink-0">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Nome da skill
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="minha-skill"
                  autoComplete="off"
                  spellCheck="false"
                  aria-invalid={nameInvalid || undefined}
                  className="font-mono text-xs aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/20"
                />
                {nameInvalid ? (
                  <p className="text-xs text-destructive">
                    Use apenas letras minúsculas, números e hífens (começando por letra ou número).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Vira a pasta <code className="text-[11px]">.claude/skills/{trimmedName || "minha-skill"}/SKILL.md</code>
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Tabs value={view} onValueChange={setView}>
                  <TabsList className="h-7 px-[3px] py-[2px]">
                    <TabsTrigger value="text" className="gap-1 text-xs px-2 py-0.5 h-[calc(100%-2px)]">
                      <Code className="size-3" />
                      Texto
                    </TabsTrigger>
                    <TabsTrigger value="markdown" className="gap-1 text-xs px-2 py-0.5 h-[calc(100%-2px)]">
                      <FileText className="size-3" />
                      Markdown
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => { setMode("ai"); setError(null); }}
                    className="h-7 gap-1 px-2.5 text-xs"
                  >
                    <Sparkles className="size-3" />
                    Gerar com IA
                  </Button>
                  <Button
                    size="sm"
                    onClick={save}
                    disabled={!canSave}
                    className="h-7 gap-1 px-2.5 text-xs"
                  >
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                    Criar
                  </Button>
                </div>
              </div>
              {error && <p className="text-xs text-destructive">⚠ {error}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {view === "text" ? (
                <Textarea
                  className="h-full min-h-0 resize-none font-mono text-[13px] leading-relaxed focus-visible:ring-1 [field-sizing:fixed]"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"Cole aqui o conteúdo da SKILL.md…\n\n---\nname: minha-skill\ndescription: quando usar esta skill\n---\n\n# Minha Skill\n..."}
                  spellCheck={false}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {content.trim() ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                    >
                      {content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nada para pré-visualizar ainda.</p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Fluxo de IA: entrevista ── */
          <>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 flex flex-col gap-4">
              {thread.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Descreva a skill que você quer criar. Vou fazer algumas perguntas e,
                  ao final, gerar a <code className="text-xs">SKILL.md</code> para você
                  revisar e salvar.
                </p>
              )}
              {thread.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex items-start gap-2 self-end max-w-[85%]">
                    <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.text}
                    </div>
                    <User className="size-4 mt-2 shrink-0 text-muted-foreground" />
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2 max-w-[85%]">
                    <Sparkles className="size-4 mt-2 shrink-0 text-muted-foreground" />
                    <div className="rounded-lg bg-muted/50 border px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.question}
                    </div>
                  </div>
                )
              )}
              {pending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Claude está pensando…
                </div>
              )}
              {error && <p className="text-xs text-destructive">⚠ {error}</p>}
            </div>

            {/* ── Área de input ── */}
            <div className="border-t px-5 py-3.5 shrink-0 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Select value={model} onValueChange={setModel} disabled={pending}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={effort} onValueChange={setEffort} disabled={pending}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="xhigh">xhigh</SelectItem>
                    <SelectItem value="max">max</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickOption(opt)}
                      disabled={pending}
                      className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={pending}
                  placeholder={started ? "Sua resposta… (Enter envia, Shift+Enter quebra linha)" : "Descreva a skill que você quer criar…"}
                  className="min-h-[44px] max-h-40 resize-none text-sm"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  onClick={send}
                  disabled={pending || !draft.trim()}
                  className="gap-1.5 shrink-0"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {started ? "Enviar" : "Iniciar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

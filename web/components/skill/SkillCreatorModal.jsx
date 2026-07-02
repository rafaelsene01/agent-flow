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

/**
 * Modal de criação de skill: conduz uma entrevista com o Claude (skill-creator via
 * wrapper estruturado). Cada abertura gera um UUID novo usado como sessão (-n). Cada
 * turno volta como pergunta (com opções sugeridas) ou como a SKILL.md pronta, que o
 * usuário revisa (markdown/texto), nomeia e salva.
 */
export default function SkillCreatorModal({ onClose, onSaved }) {
  const { toast } = useToast();
  const [sessionId] = useState(() => crypto.randomUUID());
  const [started, setStarted] = useState(false);
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  // thread: mistura de { role:"user", text } e { role:"assistant", question, options }
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // Estado final (skill pronta para revisar/salvar).
  const [final, setFinal] = useState(null); // marca que estamos na etapa de salvar
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [view, setView] = useState("markdown"); // "markdown" | "text"
  const [saving, setSaving] = useState(false);

  const lastQuestion = [...thread].reverse().find((m) => m.role === "assistant");
  const options = lastQuestion?.options ?? [];

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
        setName(data.name ?? "");
        setContent(data.content ?? "");
        setView("markdown");
        setFinal(true);
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
    if (!name.trim() || !content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/skills/create/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content }),
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
            <Sparkles className="size-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-semibold leading-none">
              Criar skill
            </DialogTitle>
          </div>
          <Button variant="ghost" size="icon-xs" type="button" onClick={onClose} aria-label="Fechar">
            ✕
          </Button>
        </DialogHeader>

        {final ? (
          /* ── Etapa final: revisar, nomear e salvar ── */
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
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <Tabs value={view} onValueChange={setView}>
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
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving || !name.trim() || !content.trim()}
                  className="h-7 gap-1 px-2.5 text-xs"
                >
                  {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                  Salvar
                </Button>
              </div>
              {error && <p className="text-xs text-destructive">⚠ {error}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {view === "text" ? (
                <Textarea
                  className="h-full min-h-0 resize-none font-mono text-[13px] leading-relaxed focus-visible:ring-1 [field-sizing:fixed]"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Etapa de conversa ── */
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

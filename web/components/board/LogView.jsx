"use client";

import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
import { cn } from "@/lib/utils";

// Cabeçalho de seção: "┌─[TIPO] resto"  (ex.: ┌─[TOOL] Edit, ┌─[RESULTADO] OK | ...)
const HEADER_RE = /^┌─\[([^\]]+)\]\s*(.*)$/;
// Rodapé separador: "└" seguido só de "─"
const FOOTER_RE = /^└─+$/;

// Estilo por tipo de seção (cor do cabeçalho + barra lateral)
const TYPE_META = {
  SESSION: { color: "text-zinc-400", bar: "border-zinc-600" },
  THINKING: { color: "text-violet-400", bar: "border-violet-500/60" },
  TEXT: { color: "text-sky-400", bar: "border-sky-500/60" },
  TOOL: { color: "text-amber-400", bar: "border-amber-500/60" },
  "TOOL RESULT": { color: "text-teal-400", bar: "border-teal-500/60" },
  RESULTADO: { color: "text-emerald-400", bar: "border-emerald-500/60" },
};

const DEFAULT_META = { color: "text-zinc-300", bar: "border-zinc-700" };

// Linguagem forçada por tipo (input de ferramenta é sempre JSON)
function forcedLang(type) {
  return type === "TOOL" ? "json" : null;
}

// Aplica highlight.js. Linguagem forçada → highlight direto.
// Caso contrário, auto-detecta e só destaca quando a confiança é alta;
// senão devolve texto puro (logs de "pensamento"/"texto" não são código).
function highlightContent(content, type) {
  const lang = forcedLang(type);
  if (lang && hljs.getLanguage(lang)) {
    try {
      return { html: hljs.highlight(content, { language: lang }).value };
    } catch {
      return { text: content };
    }
  }
  try {
    const auto = hljs.highlightAuto(content);
    if (auto.language && auto.relevance >= 6) {
      return { html: auto.value };
    }
  } catch {
    /* ignora — cai no texto puro */
  }
  return { text: content };
}

function parseBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(HEADER_RE);

    if (m) {
      const type = m[1].trim(); // ex.: "TOOL RESULT"
      const title = m[2].trim(); // ex.: nome da tool / id da sessão / "OK | 3 turns"
      const content = [];
      i++;
      while (
        i < lines.length &&
        !FOOTER_RE.test(lines[i]) &&
        !HEADER_RE.test(lines[i])
      ) {
        content.push(lines[i]);
        i++;
      }
      if (i < lines.length && FOOTER_RE.test(lines[i])) i++; // consome rodapé
      blocks.push({
        kind: "section",
        type,
        title,
        content: content.join("\n").replace(/^\n+|\n+$/g, ""),
      });
    } else {
      if (line.trim()) blocks.push({ kind: "line", text: line });
      i++;
    }
  }

  return blocks;
}

function SectionContent({ content, type }) {
  const rendered = useMemo(() => highlightContent(content, type), [content, type]);
  if (rendered.html) {
    return (
      <code
        className="hljs block whitespace-pre-wrap break-words !bg-transparent !p-0"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    );
  }
  return (
    <span className="block whitespace-pre-wrap break-words text-zinc-200">
      {rendered.text}
    </span>
  );
}

export default function LogView({ text }) {
  const blocks = useMemo(() => parseBlocks(text ?? ""), [text]);

  return (
    <div className="space-y-2 font-mono text-[11px] leading-relaxed">
      {blocks.map((b, idx) => {
        if (b.kind === "line") {
          // Linhas avulsas (ex.: eventos colapsados "[tool/x]  ×3")
          return (
            <div key={idx} className="px-2 text-zinc-500 whitespace-pre-wrap break-all">
              {b.text}
            </div>
          );
        }

        const meta = TYPE_META[b.type] ?? DEFAULT_META;
        return (
          <div
            key={idx}
            className={cn("border-l-2 pl-3 pr-1 py-0.5", meta.bar)}
          >
            <div className={cn("font-bold uppercase tracking-wide", meta.color)}>
              [{b.type}]
              {b.title && (
                <span className="ml-1.5 font-normal text-zinc-400 normal-case">
                  {b.title}
                </span>
              )}
            </div>
            {b.content && (
              <pre className="mt-1 whitespace-pre-wrap break-words">
                <SectionContent content={b.content} type={b.type} />
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

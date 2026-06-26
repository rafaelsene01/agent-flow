import {
  File,
  FileCode,
  FileText,
  FileJson,
  FileImage,
  FileType,
  FileCog,
  FileArchive,
} from "lucide-react";

// ── git status → cor + rótulo ──────────────────────────────
// Usa a 1ª letra do status (status pode ter 2 chars, ex: "R ", "??").
const STATUS_META = {
  A: { color: "text-emerald-500 dark:text-emerald-400", label: "Adicionado" },
  M: { color: "text-amber-500 dark:text-amber-400", label: "Modificado" },
  D: { color: "text-rose-500 dark:text-rose-400", label: "Deletado" },
  R: { color: "text-sky-500 dark:text-sky-400", label: "Renomeado" },
  C: { color: "text-sky-500 dark:text-sky-400", label: "Copiado" },
  U: { color: "text-orange-500 dark:text-orange-400", label: "Conflito" },
  "?": { color: "text-violet-500 dark:text-violet-400", label: "Não rastreado" },
};

const STATUS_FALLBACK = {
  color: "text-muted-foreground",
  label: "Desconhecido",
};

function statusKey(status) {
  const ch = (status ?? "").trim()[0];
  return ch === undefined ? "?" : ch.toUpperCase();
}

export function statusColor(status) {
  return (STATUS_META[statusKey(status)] ?? STATUS_FALLBACK).color;
}

export function statusLabel(status) {
  return (STATUS_META[statusKey(status)] ?? STATUS_FALLBACK).label;
}

// ── extensão → ícone lucide ────────────────────────────────
const EXT_ICON = {
  // código
  js: FileCode, jsx: FileCode, ts: FileCode, tsx: FileCode, mjs: FileCode,
  cjs: FileCode, py: FileCode, rb: FileCode, go: FileCode, rs: FileCode,
  java: FileCode, c: FileCode, h: FileCode, cpp: FileCode, cs: FileCode,
  php: FileCode, swift: FileCode, kt: FileCode, sh: FileCode, bash: FileCode,
  html: FileCode, css: FileCode, scss: FileCode, sql: FileCode, vue: FileCode,
  // dados / config
  json: FileJson, jsonc: FileJson,
  yml: FileCog, yaml: FileCog, toml: FileCog, ini: FileCog, env: FileCog,
  // markdown / texto
  md: FileType, markdown: FileType, mdx: FileType,
  txt: FileText, log: FileText, csv: FileText,
  // imagem
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
  svg: FileImage, webp: FileImage, ico: FileImage, avif: FileImage,
  // arquivos
  zip: FileArchive, tar: FileArchive, gz: FileArchive, rar: FileArchive,
};

export function fileIcon(path) {
  const name = (path ?? "").split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return EXT_ICON[ext] ?? File;
}

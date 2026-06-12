# UI Tailwind + shadcn/ui Migration — Specification

**Feature dir**: `.specs/features/ui-tailwind-shadcn/`
**Status**: Draft (aguardando aprovação)

## Problem Statement

A UI web (`web/`) usa CSS artesanal: `globals.css` com 2.273 linhas, ~140 classes acopladas a 7 componentes JSX. Manutenção cara, sem design system, visual aquém de ferramentas modernas. Usuário decidiu migrar para Tailwind CSS v4 + shadcn/ui para elevar qualidade visual e padronizar componentes.

## Goals

- [ ] 100% da UI migrada para Tailwind v4 + shadcn/ui, com paridade funcional total
- [ ] CSS legado eliminado: `globals.css` reduzido a tokens + base (~200 linhas vs 2.273)
- [ ] Tipografia otimizada via `next/font` (Inter + JetBrains Mono)
- [ ] Dark/light theme preservado (default dark, persistência em localStorage, sem FOUC)
- [ ] Pipeline de build/publicação npm intacto (`dist/web` com export estático)

## Out of Scope

| Item | Razão |
| --- | --- |
| Migração para TypeScript | Ortogonal à mudança visual; shadcn suporta JS (`tsx: false`) |
| Novas features / mudanças de fluxo UX | Migração visual apenas; layout kanban permanece |
| Mudanças em API/backend (`api/`, `bin/`) | UI-only |
| Framework de testes | Repo não tem infra de teste; adicionar é outra feature |
| Audit formal de acessibilidade | Radix melhora a11y de graça; audit dedicado fica para depois |
| Tema dinâmico do highlight.js | `github-dark.css` fixo mantido |

---

## User Stories

### P1: Fundação Tailwind + shadcn ⭐ MVP

**User Story**: Como dev do projeto, quero Tailwind v4 + shadcn configurados e funcionando para que todo componente novo/migrado use o design system.

**Why P1**: Bloqueia todo o resto. Sem fundação, nada migra.

**Acceptance Criteria**:

1. WHEN `npm run dev` roda THEN sistema SHALL servir a UI com Tailwind ativo e CSS legado coexistindo sem quebra visual
2. WHEN `npx shadcn add <comp>` roda THEN sistema SHALL gerar componente `.jsx` (não `.tsx`) em `components/ui/`
3. WHEN tema alterna THEN sistema SHALL aplicar classe `.dark` no `<html>`, persistir em localStorage e renderizar tokens corretos nos dois temas
4. WHEN página carrega THEN sistema SHALL aplicar tema antes da primeira pintura (sem FOUC) e fontes via `next/font` sem layout shift

**Independent Test**: Rodar dev, adicionar um `<Button>` shadcn numa página, alternar tema, conferir fonte Inter aplicada.

---

### P1: Board do dia a dia restilizado ⭐ MVP

**User Story**: Como usuário do kanban, quero header, colunas, cards e modal de card com o novo design para que a superfície principal de uso fique moderna.

**Why P1**: É onde o usuário passa 90% do tempo.

**Acceptance Criteria**:

1. WHEN board renderiza THEN colunas, contadores, cards, chips de label e badges de prioridade SHALL usar componentes shadcn/Tailwind com acentos de cor semânticos preservados
2. WHEN coluna carrega itens THEN sistema SHALL exibir skeleton loaders no lugar dos dots animados
3. WHEN card é clicado THEN modal SHALL abrir como `Dialog` (Radix): foco gerenciado, Esc fecha, scroll do body travado
4. WHEN markdown da issue renderiza THEN sistema SHALL estilizar via plugin typography (`prose`), incluindo code highlight existente
5. WHEN modais aninhados abertos (CardModal → TlcFileModal/CreateBranch) e Esc pressionado THEN sistema SHALL fechar apenas o modal do topo
6. WHEN label do GitHub tem cor dinâmica (hex da API) THEN chip SHALL renderizar a cor via inline style, legível em dark e light

**Independent Test**: Abrir board real, navegar colunas, abrir card com markdown + labels, abrir TlcFileModal por cima, fechar com Esc em cadeia.

---

### P2: Modais de configuração restilizados

**User Story**: Como usuário, quero Settings, Init Board, Edit Board e Create Branch com o novo design para consistência total.

**Why P2**: Superfícies de uso esporádico; não bloqueiam o valor principal.

**Acceptance Criteria**:

1. WHEN qualquer modal de config abre THEN sistema SHALL usar `Dialog` + `Input`/`Select`/`Checkbox`/`Label`/`Button` shadcn
2. WHEN integração tem status ok/erro/aviso THEN cards de integração SHALL exibir badges semânticos nos dois temas
3. WHEN colunas são reordenadas no Edit Board THEN drag-and-drop nativo existente SHALL continuar funcionando
4. WHEN comandos são copiados (scope error, git cmds) THEN feedback de cópia SHALL funcionar como hoje

**Independent Test**: Abrir cada modal, preencher formulários, salvar, conferir estados de erro/sucesso.

---

### P3: Polish visual

**User Story**: Como usuário, quero ícones consistentes e microinterações refinadas para acabamento profissional.

**Why P3**: Acabamento; valor incremental.

**Acceptance Criteria**:

1. WHEN UI renderiza THEN ícones funcionais (tema, settings, fechar, copiar, refresh, branch...) SHALL ser `lucide-react` em vez de caracteres unicode/emoji (logo 🌸 permanece)
2. WHEN elementos com `title` relevante recebem hover THEN tooltips shadcn SHALL aparecer nos casos de maior valor (botões de ícone)

---

## Edge Cases

- WHEN primeira pintura ocorre THEN tema salvo SHALL já estar aplicado (script inline no `<head>` antes da hidratação)
- WHEN build de produção roda (`output: "export"`, `distDir: "out"`) THEN CSS Tailwind SHALL ser gerado em build-time, sem dependência de runtime
- WHEN `npm run build` (raiz) roda THEN `dist/web/index.html` SHALL existir (gate do `scripts/build.mjs`)
- WHEN CSS legado e Tailwind preflight coexistem (durante migração) THEN superfícies ainda não migradas SHALL permanecer utilizáveis
- WHEN label GH vem com qualquer hex THEN chip SHALL manter contraste (bg com alpha `22`, border `55` — padrão atual)
- WHEN coluna está vazia ou com erro THEN estados vazios/erro SHALL ser estilizados no novo padrão

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| UI-01 | P1: Fundação — Tailwind v4 instalado, dev+build ok | Tasks | In Tasks |
| UI-02 | P1: Fundação — shadcn init modo JS + primitives | Tasks | In Tasks |
| UI-03 | P1: Fundação — tokens base shadcn + tokens semânticos (estado/prioridade) dark+light | Tasks | In Tasks |
| UI-04 | P1: Fundação — fontes via next/font | Tasks | In Tasks |
| UI-05 | P1: Fundação — toggle de tema com classe `.dark`, sem FOUC | Tasks | In Tasks |
| UI-06 | P1: Board — Header + tabs + shell migrados | Tasks | In Tasks |
| UI-07 | P1: Board — colunas + cards + skeleton | Tasks | In Tasks |
| UI-08 | P1: Board — CardModal + TlcFileModal (Dialog + prose) | Tasks | In Tasks |
| UI-09 | P2: Modais config (Settings/Init/Edit/CreateBranch) | Tasks | In Tasks |
| UI-10 | P1: CSS legado removido, globals.css só tokens+base | Tasks | In Tasks |
| UI-11 | P1: Pipeline build/pack intacto (root build → dist/web) | Tasks | In Tasks |
| UI-12 | P1: Comportamento funcional inalterado (fetch, polling, Esc, copy, drag) | Tasks | In Tasks |

**Coverage:** 12 total, 12 mapeados em tasks, 0 não mapeados

---

## Success Criteria

- [ ] `npm run build --prefix web` e `npm run build` (raiz) verdes
- [ ] Zero classes CSS legadas referenciadas nos `.jsx` (verificável por grep)
- [ ] `globals.css` ≤ ~200 linhas (tokens, base, exceções documentadas)
- [ ] Checklist funcional manual passa: tabs, fetch de colunas, scroll infinito, modais, triggers TLC, copy, drag de colunas, toggle de tema
- [ ] Aprovação visual do usuário nos dois temas

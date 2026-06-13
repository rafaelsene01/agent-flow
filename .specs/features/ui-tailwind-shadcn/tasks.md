# UI Tailwind + shadcn/ui Migration — Tasks

**Design**: `.specs/features/ui-tailwind-shadcn/design.md`
**Status**: Done — T1–T16 executadas e commitadas (16 commits atômicos em `feat/ui-tailwind-shadcn`); gates quick+full verdes; T17 QA visual pendente de aprovação do usuário

> **Assunção de testes (confirmar)**: repo sem infra de teste (sem script `test`, sem framework) e sem `.specs/codebase/TESTING.md`. Logo: `Tests: none` em todas as tasks; gate automatizado = build. **Gate quick** = `npm run build --prefix web` · **Gate full** = `npm run build` (raiz, gera `dist/`). Verificação visual = manual no `npm run dev`.

> **Regra de paralelismo**: tasks de superfície (T6–T15) NÃO editam `globals.css` nem arquivos fora do seu escopo. Classes legadas ficam mortas até T16. Isso garante zero conflito entre sub-agents paralelos.

---

## Execution Plan

### Phase 1: Foundation (sequencial; T5 independente)

```
T1 ──→ T2 ──→ T3
         └──→ T4
T5 (sem deps — pode rodar junto)
```

### Phase 2: Superfícies (paralelo após T3+T4; board/* também exige T5)

```
            ┌→ T6  [P] Header
            ├→ T7  [P] Shell page.jsx
T3+T4 ──────┼→ T12 [P] SettingsModal
            ├→ T13 [P] InitBoardModal
            ├→ T14 [P] EditBoardModal
            └→ T15 [P] CreateBranchModal
            ┌→ T8  [P] Board+Column
T3+T4+T5 ───┼→ T9  [P] Card
            ├→ T10 [P] CardModal
            └→ T11 [P] TlcFileModal
```

### Phase 3: Cleanup (sequencial)

```
T6..T15 ──→ T16 ──→ T17
```

---

## Task Breakdown

### T1: Instalar Tailwind v4 (PostCSS)

**What**: Tailwind v4 ativo no build do Next, coexistindo com CSS legado.
**Where**: `web/package.json`, `web/postcss.config.mjs` (novo), `web/app/globals.css` (só linha de import no topo)
**Depends on**: None
**Reuses**: build Next existente (dev + `output: "export"`)
**Requirement**: UI-01

**Tools**: MCP: NONE · Skill: NONE · CLI: `npm i -D tailwindcss @tailwindcss/postcss postcss` (em `web/`)

**Done when**:

- [ ] `postcss.config.mjs` com plugin `@tailwindcss/postcss`
- [ ] `@import "tailwindcss";` na primeira linha de `globals.css`, legado intacto abaixo
- [ ] Classe utilitária de teste renderiza no dev (ex.: `text-red-500` temporário)
- [ ] App existente continua visualmente íntegro (QA rápido: board, um modal)
- [ ] Gate quick passa: `npm run build --prefix web`

**Tests**: none · **Gate**: quick
**Commit**: `chore(web): add tailwind v4 via postcss`

---

### T2: shadcn init (modo JS) + tokens semânticos

**What**: `components.json` (tsx:false, new-york, neutral, cssVariables), `lib/utils.js`, tokens shadcn em `globals.css` + tokens custom de estado/prioridade + plugin typography.
**Where**: `web/components.json`, `web/lib/utils.js`, `web/app/globals.css`
**Depends on**: T1
**Reuses**: alias `@/*` (`web/jsconfig.json`)
**Requirement**: UI-02, UI-03

**Tools**: MCP: NONE · Skill: NONE · CLI: `npx shadcn@latest init` (em `web/`)

**Done when**:

- [ ] `components.json`: `tsx: false`, `style: "new-york"`, `baseColor: "neutral"`, `cssVariables: true`, `tailwind.config: ""`, `tailwind.css: "app/globals.css"`
- [ ] `lib/utils.js` com `cn()` em `.js`/`.jsx` (não `.ts`)
- [ ] `globals.css`: `@custom-variant dark`, blocos `:root`/`.dark`, `@theme inline` com mapeamento shadcn + `--color-state-*` (6) + `--color-priority-*` (4), dois temas
- [ ] `@plugin "@tailwindcss/typography"` validado (fallback documentado no design se falhar)
- [ ] CSS legado preservado abaixo dos tokens; app íntegro no dev
- [ ] Gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `chore(web): shadcn init (js, new-york, neutral) + semantic tokens`

---

### T3: Layout — next/font + dark mode por classe

**What**: Inter + JetBrains Mono via `next/font/google` expostas como CSS vars; script FOUC seta classe `.dark` (em vez de `data-theme`); toggle em `page.jsx` adaptado.
**Where**: `web/app/layout.jsx`, `web/app/page.jsx` (só função `toggleTheme`/estado)
**Depends on**: T2
**Reuses**: script inline FOUC, `suppressHydrationWarning`, estado `theme` + localStorage em `page.jsx`
**Requirement**: UI-04, UI-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Fontes com `variable: "--font-inter"` / `"--font-jetbrains-mono"` aplicadas no `<html>`; `@theme` consome (`--font-sans`/`--font-mono`)
- [ ] Default dark: sem valor salvo → `.dark` aplicado pelo script antes da pintura
- [ ] Toggle alterna `classList` + persiste `localStorage.theme`; sem FOUC em reload nos dois temas
- [ ] `font-family` legado do `:root` segue funcionando até purge (não remover ainda)
- [ ] Gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): next/font + class-based dark mode`

---

### T4: Adicionar primitives shadcn

**What**: gerar componentes ui base usados por todas as superfícies.
**Where**: `web/components/ui/*.jsx`
**Depends on**: T2
**Reuses**: components.json de T2
**Requirement**: UI-02

**Tools**: MCP: NONE · Skill: NONE · CLI: `npx shadcn@latest add alert badge button card checkbox dialog input label select separator skeleton tabs textarea tooltip`

**Done when**:

- [ ] 14 componentes gerados como `.jsx` (zero `.tsx` no projeto)
- [ ] Deps Radix/cva/lucide instaladas pelo CLI sem conflito (React 19)
- [ ] Imports `@/lib/utils` resolvem
- [ ] Gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `chore(web): add shadcn ui primitives`

---

### T5: Split do Board.jsx (refactor puro)

**What**: dividir `Board.jsx` em arquivos por componente — SEM mudança visual/funcional.
**Where**: `web/components/board/{Board,Column,Card,CardModal,TlcFileModal,CopyCmd}.jsx`; atualizar import em `page.jsx`
**Depends on**: None
**Reuses**: código existente (mover, não reescrever); `GH_COLORS` exportado de `Column.jsx` ou módulo próprio
**Requirement**: UI-12 (pré-condição estrutural)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] 6 arquivos novos; `components/Board.jsx` antigo removido; imports ajustados
- [ ] Zero mudança de markup/classe/comportamento (diff = só movimentação)
- [ ] Board funciona no dev: colunas, scroll infinito, card modal, TLC modal
- [ ] Gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `refactor(web): split Board.jsx into board/ components`

---

### T6: Migrar Header [P]

**What**: topbar restilizado: logo+título, board tabs custom (com fechar por aba), botões `+`/tema/settings como Button icon + lucide; tooltips.
**Where**: `web/components/Header.jsx`
**Depends on**: T3, T4
**Reuses**: `ui/button`, `ui/tooltip`, `ui/separator`, lucide (`Sun`, `Moon`, `Settings`, `Plus`, `X`)
**Requirement**: UI-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas no arquivo (`topbar*`, `board-tab*`, `btn-theme`, `btn-settings`, `btn-init-board`, `logo`)
- [ ] Tabs: estado ativo com indicador, hover revela botão fechar (paridade com hoje)
- [ ] Callbacks intactos (`onSelectBoard`, `onRemoveBoard` com stopPropagation, `onToggleTheme`, `onSettings`, `onInitBoard`)
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate header to tailwind+shadcn`

---

### T7: Migrar shell do app (page.jsx) [P]

**What**: init screen, board-view header (nome/repo + editar/excluir), empty state restilizados.
**Where**: `web/app/page.jsx`
**Depends on**: T3, T4
**Reuses**: `ui/button`, `ui/skeleton`, lucide (`Pencil`, `Trash2`)
**Requirement**: UI-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`app`, `init-screen`, `board-view*`, `empty-board*`, `btn-edit-board`, `btn-delete-board-data`, `loader*`)
- [ ] `confirm()` flows e callbacks intactos
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate app shell`

---

### T8: Migrar Board container + Column [P]

**What**: layout de colunas, header de coluna (acento `GH_COLORS`, count Badge, refresh Button), skeleton loading, estados vazio/erro, scroll infinito intacto.
**Where**: `web/components/board/Board.jsx`, `web/components/board/Column.jsx`
**Depends on**: T3, T4, T5
**Reuses**: `ui/badge`, `ui/button`, `ui/skeleton`, `ui/alert`, `GH_COLORS` (inline style p/ acento), lucide (`RefreshCw`)
**Requirement**: UI-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`board`, `column*`, `col-*`)
- [ ] Skeleton: 3 cards fantasma substituem dots (UI-07/spec P1.2)
- [ ] `onScroll` paginação + polling de worktrees intactos
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate board+column`

---

### T9: Migrar Card [P]

**What**: card kanban: borda esquerda por prioridade (tokens `priority-*`), id mono, badge PR, chips de label (inline style GH), running dot animado, hover com elevação.
**Where**: `web/components/board/Card.jsx`
**Depends on**: T3, T4, T5
**Reuses**: `ui/badge`, tokens `--color-priority-*`, keyframe `card-pulse` (via `--animate-*`)
**Requirement**: UI-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`card*`, `label-chip`, `assignee`, `due`, `priority-badge`)
- [ ] Labels GH: inline style preservado (`#hex22` bg / `#hex55` border / `#hex` texto)
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate card`

---

### T10: Migrar CardModal [P]

**What**: modal principal como Dialog (layout 2 colunas main+sidebar), triggers/ações com Button+estados (done/error/running), git cmds copiáveis, markdown via `prose`, remoção de handlers manuais de Esc/overflow.
**Where**: `web/components/board/CardModal.jsx` (+ `CopyCmd.jsx`)
**Depends on**: T3, T4, T5
**Reuses**: `ui/dialog`, `ui/button`, `ui/badge`, `ui/separator`, typography `prose`, lucide (`GitBranch`, `Play`, `Zap`, `RotateCcw`, `Copy`, `Check`, `Brush`, `X`)
**Requirement**: UI-08, UI-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`card-modal*`, `sidebar-*`, `trigger-*`, `tlc-outputs*`, `git-cmd*`, `worktree-info*`, `modal-*` usados aqui)
- [ ] Radix cuida de Esc/foco/scroll-lock; `useEffect` manuais removidos; Esc com TlcFileModal/CreateBranch aberto fecha só o do topo
- [ ] Markdown com `prose prose-sm dark:prose-invert` + highlight.js funcionando
- [ ] Toda lógica de triggers/polling/copy intacta
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate card modal`

---

### T11: Migrar TlcFileModal [P]

**What**: Dialog com Tabs (Editar/Preview), Textarea mono, preview `prose`, botão salvar.
**Where**: `web/components/board/TlcFileModal.jsx`
**Depends on**: T3, T4, T5
**Reuses**: `ui/dialog`, `ui/tabs`, `ui/textarea`, `ui/button`, typography
**Requirement**: UI-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`tlc-file-*`, `tlc-tab*`)
- [ ] Fetch/save/erro/loading intactos; Esc fecha só ele (nested sobre CardModal)
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate tlc file modal`

---

### T12: Migrar SettingsModal [P]

**What**: Dialog com formulário (Input/Select/Label), cards de integração (Card + Badge status + lucide), seções, footer com ações.
**Where**: `web/components/SettingsModal.jsx`
**Depends on**: T3, T4
**Reuses**: `ui/dialog`, `ui/input`, `ui/select`, `ui/label`, `ui/card`, `ui/badge`, `ui/button`, `ui/separator`
**Requirement**: UI-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`settings-*`, `sf-*`, `intg-*`, `cmd-*`, `path-*`)
- [ ] Validações/status checks/cópia de comandos intactos
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate settings modal`

---

### T13: Migrar InitBoardModal [P]

**What**: Dialog com lista de boards selecionável, info de repo, bloco de scope error (Alert + comando copiável).
**Where**: `web/components/InitBoardModal.jsx`
**Depends on**: T3, T4
**Reuses**: `ui/dialog`, `ui/button`, `ui/alert`, `ui/input`, padrão de lista selecionável (compartilhar estilo com T15 via utilities)
**Requirement**: UI-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`init-board-modal`, `board-select-*`, `board-repo-*`, `scope-*`)
- [ ] Fluxo de seleção/salvar e estados de erro intactos
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate init board modal`

---

### T14: Migrar EditBoardModal [P]

**What**: Dialog de colunas: lista com drag nativo (handle, estado drag-over), remover/adicionar coluna, Checkbox onde aplicável.
**Where**: `web/components/EditBoardModal.jsx`
**Depends on**: T3, T4
**Reuses**: `ui/dialog`, `ui/button`, `ui/checkbox`, `ui/label`; handlers de drag existentes (NÃO introduzir lib de DnD)
**Requirement**: UI-09, UI-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`edit-col-*`, `col-drag-handle`, `btn-col-remove`)
- [ ] Drag-and-drop reordenação funciona como hoje
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate edit board modal`

---

### T15: Migrar CreateBranchModal [P]

**What**: Dialog: chip do repo, filtro de branches, lista selecionável, input com erro, feedback de criação/worktree.
**Where**: `web/components/CreateBranchModal.jsx`
**Depends on**: T3, T4
**Reuses**: `ui/dialog`, `ui/input`, `ui/button`, lucide (`GitBranch`), padrão de lista de T13
**Requirement**: UI-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Zero classes legadas (`create-branch-modal`, `cb-*`)
- [ ] Fluxo criar branch/worktree + estados de erro intactos; Esc nested OK (abre sobre CardModal)
- [ ] OK visual nos dois temas; gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `feat(web): migrate create branch modal`

---

### T16: Purge do CSS legado

**What**: remover todo CSS legado de `globals.css`; manter apenas: imports/tokens/`@theme`/base, scrollbar custom, keyframes custom, exceções documentadas.
**Where**: `web/app/globals.css`
**Depends on**: T6, T7, T8, T9, T10, T11, T12, T13, T14, T15
**Reuses**: —
**Requirement**: UI-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Grep nos `.jsx` por classes legadas = zero ocorrências (lista do design como referência)
- [ ] `globals.css` ≤ ~200 linhas; sem `[data-theme]` remanescente; sem `font-family` legado (next/font assume)
- [ ] App íntegro nos dois temas (passada visual completa)
- [ ] Gate quick passa

**Tests**: none · **Gate**: quick
**Commit**: `chore(web): purge legacy css`

---

### T17: QA final + gates de build

**What**: passada funcional/visual completa + builds de produção.
**Where**: — (verificação; ajustes pontuais onde QA falhar)
**Depends on**: T16
**Reuses**: checklist do spec (Success Criteria)
**Requirement**: UI-11, UI-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Checklist funcional: tabs/navegação, fetch+scroll infinito, todos os modais, Esc aninhado, triggers TLC (estados), copy, drag de colunas, toggle tema, reload sem FOUC
- [ ] Gate quick passa: `npm run build --prefix web`
- [ ] Gate full passa: `npm run build` (raiz) e `dist/web/index.html` existe
- [ ] Screenshots dark+light para aprovação do usuário

**Tests**: none · **Gate**: full
**Commit**: `chore(web): final qa adjustments` (se houver ajustes)

---

## Parallel Execution Map

```
Phase 1:  T1 → T2 → { T3, T4 }        T5 (independente, pode rodar desde o início)

Phase 2 (todos [P], sub-agent por task, arquivos disjuntos, globals.css intocado):
  após T3+T4:      T6, T7, T12, T13, T14, T15
  após T3+T4+T5:   T8, T9, T10, T11

Phase 3:  T16 → T17
```

**Constraint check [P]**: sem testes → paralelismo limitado só por deps de código; cada task toca arquivo(s) exclusivo(s); regra "não editar globals.css" elimina estado mutável compartilhado. ✅

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1–T4 | 1 preocupação de config cada | ✅ Granular |
| T5 | 1 refactor mecânico (mover código) | ✅ Granular |
| T6–T9, T11–T15 | 1 arquivo/componente cada | ✅ Granular |
| T10 CardModal | 1 componente grande (arquivo único coeso + CopyCmd) | ⚠️ OK — coeso, não dividir |
| T16, T17 | 1 purge / 1 verificação | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | início | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T2 | T2→T4 | ✅ Match |
| T5 | None | isolado | ✅ Match |
| T6 | T3, T4 | T3+T4→T6 | ✅ Match |
| T7 | T3, T4 | T3+T4→T7 | ✅ Match |
| T8 | T3, T4, T5 | T3+T4+T5→T8 | ✅ Match |
| T9 | T3, T4, T5 | T3+T4+T5→T9 | ✅ Match |
| T10 | T3, T4, T5 | T3+T4+T5→T10 | ✅ Match |
| T11 | T3, T4, T5 | T3+T4+T5→T11 | ✅ Match |
| T12 | T3, T4 | T3+T4→T12 | ✅ Match |
| T13 | T3, T4 | T3+T4→T13 | ✅ Match |
| T14 | T3, T4 | T3+T4→T14 | ✅ Match |
| T15 | T3, T4 | T3+T4→T15 | ✅ Match |
| T16 | T6–T15 | fan-in→T16 | ✅ Match |
| T17 | T16 | T16→T17 | ✅ Match |

Nenhuma task `[P]` depende de outra `[P]` da mesma fase. ✅

---

## Test Co-location Validation

`.specs/codebase/TESTING.md` não existe; repo sem camadas com requisito de teste. Matriz efetiva: todas as camadas = "none".

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1–T17 | UI/config (sem matriz de testes no repo) | none | none | ✅ OK |

Gate automatizado por task: build Next (quick) · build raiz com export+pack (full, T17). Sem deferral de testes — não há testes a deferir. ⚠️ Assunção pendente de confirmação do usuário (ver nota no topo).

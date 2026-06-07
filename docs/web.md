# Frontend — Padrões Next.js

Stack: **Next.js 15 (App Router) · React 19 · JSX · CSS global**

---

## Estrutura de pastas

```
web/
├── app/
│   ├── layout.jsx        ← root layout (server component)
│   ├── page.jsx          ← home (client component)
│   └── globals.css       ← único arquivo CSS global
│
├── components/           ← componentes reutilizáveis
│   └── <Nome>.jsx
│
├── hooks/                ← custom hooks (criar conforme necessário)
│   └── use<Nome>.js
│
├── lib/                  ← utilitários, fetch wrappers (criar conforme necessário)
│   └── <nome>.js
│
├── jsconfig.json         ← path alias @/
└── next.config.mjs
```

---

## Path alias

Usar sempre `@/` nos imports — nunca caminhos relativos com `../`.

```js
// correto
import Header from "@/components/Header.jsx";
import { fetchStatus } from "@/lib/api.js";

// errado
import Header from "../../components/Header.jsx";
```

O alias está configurado em `web/jsconfig.json` com `baseUrl: "."` e `@/* → ./*`.

---

## Server vs Client components

O App Router renderiza componentes no servidor por padrão. Adicionar `"use client"` **só quando necessário**.

| Precisa de `"use client"` | Não precisa |
|---|---|
| `useState`, `useEffect`, outros hooks | Componente só renderiza HTML |
| Event handlers (`onClick`, etc.) | Layout, wrappers estáticos |
| APIs de browser (`window`, `navigator`) | Componentes de texto/ícone |

**Regra:** empurrar o `"use client"` o mais para a folha da árvore possível. `layout.jsx` nunca deve ser client component.

---

## Componentes

- Um componente por arquivo, nome em PascalCase: `SettingsModal.jsx`
- Exportação default
- Sem barrel files (`index.js`) — importar diretamente do arquivo

```js
// correto
import SettingsModal from "@/components/SettingsModal.jsx";

// evitar
import { SettingsModal } from "@/components";
```

---

## CSS

Apenas `globals.css` — sem CSS Modules, sem Tailwind.

- Classes em kebab-case: `.btn-settings`, `.intg-card`
- Tokens via variáveis CSS em `:root` (cores, raios, etc.)
- Adicionar novas classes sempre no final do arquivo, com comentário de seção

```css
/* ── nome da seção ──────────────────────────────────────── */
.nova-classe { ... }
```

---

## Nomenclatura de arquivos

| Tipo | Convenção | Exemplo |
|---|---|---|
| Página (App Router) | `page.jsx` | `app/page.jsx` |
| Layout | `layout.jsx` | `app/layout.jsx` |
| Componente | PascalCase | `components/Header.jsx` |
| Hook | camelCase com prefixo `use` | `hooks/useStatus.js` |
| Utilitário | camelCase | `lib/api.js` |

---

## Dev workflow

```bash
npm run dev     # API (porta 5522) + Next.js dev (porta 3001) com hot reload
npm start       # build da web + serve tudo via Express (produção)
```

No dev, chamadas `/api/*` são proxiadas automaticamente para `localhost:5522` via `next.config.mjs`.

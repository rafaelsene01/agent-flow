# Frontend — Next.js

Stack: **Next.js 15 (App Router) · React 19 · JSX · CSS global**

---

## Estrutura

```
web/
├── app/
│   ├── layout.jsx        ← root layout (server component)
│   ├── page.jsx          ← home (client component)
│   └── globals.css       ← único CSS global
├── components/           ← componentes reutilizáveis (PascalCase.jsx)
├── hooks/                ← custom hooks (useNome.js)
├── lib/                  ← utilitários, fetch wrappers
├── jsconfig.json         ← path alias @/
└── next.config.mjs
```

---

## Regras

**Path alias:** sempre `@/` — nunca `../`.

```js
import Header from "@/components/Header.jsx";
```

**`"use client"`:** só quando necessário (hooks, event handlers, APIs de browser). `layout.jsx` nunca client.

**CSS:** só `globals.css`. Classes em kebab-case, tokens em variáveis CSS em `:root`. Novas classes sempre no final do arquivo.

**Componentes:** um por arquivo, export default, sem barrel files.

---

## Dev

```bash
npm run dev     # API (5522) + Next.js (3001), hot reload, proxy /api/* → 5522
npm start       # build + serve via Express (produção)
```

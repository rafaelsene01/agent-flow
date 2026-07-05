# Frontend — Next.js

Stack: **Next.js 15 (App Router) · React 19 · JSX · CSS global**

Build estático (`next export` → `web/out/`), servido pelo Express em produção.

---

## Estrutura

```
web/
├── app/
│   ├── layout.jsx        ← root layout (server component)
│   ├── page.jsx          ← home (client component)
│   ├── board/[slug]/     ← board (slug resolvido no cliente; servidor serve board/_.html)
│   ├── agent/            ← gestão de agents
│   ├── running/          ← runs em andamento
│   ├── skill/            ← gestão de skills
│   ├── usage/            ← estatísticas de execução
│   ├── integrations/     ← integrações (Telegram)
│   └── globals.css       ← único CSS global
├── components/           ← componentes reutilizáveis (PascalCase.jsx; subpastas por área: board/, running/, sidebar/, skill/, views/, ui/)
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

SSE em dev conecta direto na 5522 (evita buffering do proxy do next dev).

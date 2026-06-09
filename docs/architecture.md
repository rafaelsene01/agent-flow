# Arquitetura — Modular

Cada domínio é isolado em `api/modules/<modulo>/`. Rotas ficam em `api/routes/`.

---

## Estrutura

```
api/
├── modules/
│   ├── github/
│   │   ├── github.client.js   ← HTTP client bruto
│   │   ├── github.service.js  ← detecção de auth
│   │   ├── github.repos.js    ← lista repos
│   │   ├── github.boards.js   ← lista boards/views/colunas
│   │   └── github.items.js    ← itens do projeto
│   ├── claude/
│   │   └── claude.service.js
│   └── config/
│       └── config.service.js
├── routes/
│   ├── status.js
│   ├── config.js
│   └── github.js
└── server.js
```

---

## Regras

- Módulo não importa de outro módulo — dependências cruzadas passam por `server.js`.
- `routes/` só orquestra request/response — sem lógica de negócio.
- `service` contém toda lógica — sem dependência de `req`/`res`.
- `client` faz chamadas HTTP externas — sem lógica de negócio.
- Novo domínio = nova pasta em `modules/` + arquivo em `routes/`. Nunca arquivos soltos em `api/`.

---

## Adicionar módulo novo

```
api/modules/novo/
├── novo.service.js
└── novo.client.js    ← se tiver HTTP externo

api/routes/novo.js    ← handlers Express
```

Registrar em `server.js`:
```js
import novoRoutes from "./routes/novo.js";
novoRoutes(app);
```

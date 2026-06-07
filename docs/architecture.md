# Arquitetura — Modular

Este projeto segue **arquitetura modular** (feature-based). Cada domínio é isolado em seu próprio módulo com rotas, serviço e cliente HTTP internos. Código compartilhado vai em `shared/`.

---

## Estrutura de pastas

```
api/
├── modules/
│   ├── <modulo>/
│   │   ├── <modulo>.routes.js      ← handlers Express (entrada HTTP)
│   │   ├── <modulo>.service.js     ← lógica de negócio
│   │   └── <modulo>.client.js      ← HTTP client externo (se houver)
│   │
│   ├── github/
│   │   ├── github.routes.js
│   │   ├── github.service.js
│   │   └── github.client.js
│   │
│   └── claude/
│       ├── claude.routes.js
│       └── claude.service.js
│
├── shared/
│   ├── middlewares/    ← middlewares globais
│   └── utils/         ← helpers sem domínio
│
└── server.js           ← monta app, registra módulos
```

---

## Regras

- **Módulo não importa de outro módulo.** Dependência entre domínios passa por `shared/` ou pelo `server.js`.
- **routes** só orquestra request/response — sem lógica de negócio.
- **service** contém toda lógica — sem dependência de `req`/`res`.
- **client** faz chamadas HTTP externas — sem lógica de negócio.
- Novo domínio = nova pasta em `modules/`. Nunca adicionar arquivos soltos em `api/`.

---

## Estado atual

Projeto em fase inicial. Módulos existentes:

| Módulo | Caminho | Descrição |
|--------|---------|-----------|
| `status` | `api/routes/status.js` | Verificação GitHub + Claude |
| `github` | `api/clients/github.js` | Cliente HTTP GitHub REST API |

> Estes arquivos ainda não seguem a estrutura modular completa. Ao expandir qualquer módulo, migrar para `api/modules/<modulo>/`.

---

## Exemplo — adicionar módulo `repos`

```
api/modules/repos/
├── repos.routes.js    ← GET /api/repos
├── repos.service.js   ← filtra, ordena, formata
└── repos.client.js    ← chama github.client.js ou reutiliza
```

Registrar em `server.js`:
```js
import reposRoutes from "./modules/repos/repos.routes.js";
reposRoutes(app);
```

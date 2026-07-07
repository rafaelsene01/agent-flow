# Rotas — /api/update

Fonte: `api/routes/update.js`

Atualização do próprio Agent Flow, sempre autorizada pelo usuário na UI (badge na sidebar). Lógica em [modules/update.md](../modules/update.md).

---

## GET /api/update

Compara a `version` do `package.json` local com a do upstream (`git fetch`, cacheado por 10 min).

```json
{
  "current": "1.42.0",
  "latest": "1.43.0",
  "updateAvailable": true,
  "activeRuns": 2,
  "updateRequested": false
}
```

- `activeRuns` — runs do Claude ativos no momento (serão mortos pela atualização).
- `updateRequested` — flag de update já gravada, aguardando o daemon aplicar.
- Instalação sem clone git ou sem rede: responde `updateAvailable: false`.

## POST /api/update

Autoriza a atualização: grava a flag `~/.agent-flow/update-requested`, que o supervisor do daemon (`scripts/daemon/daemon.*`) observa — ele faz `git pull` + build, mata o servidor (e claudes derivados) e reinicia na versão nova. A confirmação do usuário (incluindo o aviso de runs ativos) acontece na UI antes do POST.

Responde o mesmo shape do GET com `updateRequested: true`. Erros: `409` se não há atualização disponível.

Após o aceite, a UI (`web/components/UpdateBadge.jsx`) sonda `GET /api/update` a cada 3s e recarrega a página quando a API voltar respondendo com `current` diferente da versão aceita. Fora desse fluxo, queda da API nunca recarrega a página.

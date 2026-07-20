// Cache stale-while-revalidate simples em localStorage. Entrega na hora o último
// valor salvo (de uma sessão anterior) enquanto a tela revalida em segundo plano.
// Usado pelo status de providers (Fontes/Repos) no criar-board e em Conexões.

// Chaves compartilhadas: abrir uma tela aquece o snapshot que a outra reusa.
export const CACHE_KEYS = {
  sources: "providers:sources",
  hosts:   "providers:hosts",
};

/** Lê o snapshot salvo, ou null se ausente/ilegível ou fora do browser (SSR). */
export function readCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Persiste o snapshot. Silencioso em erro (quota/privado) — cache é best-effort. */
export function writeCache(key, data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignora */
  }
}

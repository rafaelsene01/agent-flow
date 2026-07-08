// Auth de acesso ao site. O backend guarda o hash da senha e o devolve como token
// no login; guardamos esse token num cookie por 10h e o reenviamos no header
// `x-agent-flow-auth` em toda chamada /api. Um wrapper em window.fetch injeta o
// header e detecta 401 para disparar o modal de senha.

export const AUTH_HEADER = "x-agent-flow-auth";
export const AUTH_QS     = "_auth";
const COOKIE  = "af_auth";
const MAX_AGE = 10 * 60 * 60; // 10h em segundos

export function getToken() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)af_auth=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setToken(token) {
  document.cookie = `${COOKIE}=${encodeURIComponent(token)};path=/;max-age=${MAX_AGE};samesite=lax`;
}

export function clearToken() {
  document.cookie = `${COOKIE}=;path=/;max-age=0;samesite=lax`;
}

// EventSource não manda header custom — passa o token no query param.
export function withAuthQs(url) {
  const token = getToken();
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${AUTH_QS}=${encodeURIComponent(token)}`;
}

function apiPath(url) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return "";
  }
}

let installed = false;
let listener  = null;
let pending   = false;

function trigger() {
  if (listener) listener();
  else pending = true; // 401 antes do AuthGate montar — dispara ao registrar
}

// AuthGate registra aqui o callback que abre o modal. Se um 401 já ocorreu (ex.:
// nas chamadas de boot, antes deste efeito), dispara na hora.
export function onUnauthorized(cb) {
  listener = cb;
  if (pending) { pending = false; cb(); }
  return () => { if (listener === cb) listener = null; };
}

// Monkey-patch em window.fetch: cobre todas as chamadas espalhadas pelo app sem
// tocar cada uma. Injeta o header de auth e detecta 401 em /api (exceto as rotas
// de auth, que o próprio modal trata). Instalado no import — antes de qualquer
// efeito React — para não perder os 401 das chamadas de boot.
function installFetchAuth() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url  = typeof input === "string" ? input : input?.url ?? "";
    const path = apiPath(url);
    const isApi = path.startsWith("/api/");
    if (isApi) {
      const token = getToken();
      if (token) {
        const headers = new Headers(
          init.headers ?? (typeof input !== "string" ? input.headers : undefined),
        );
        headers.set(AUTH_HEADER, token);
        init = { ...init, headers };
      }
    }
    const res = await orig(input, init);
    if (isApi && res.status === 401 && !path.startsWith("/api/auth/")) {
      trigger();
    }
    return res;
  };
}

installFetchAuth();

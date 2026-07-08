// Copia texto com fallback para contextos não seguros (ex.: acesso via HTTP
// na rede, onde navigator.clipboard não existe). Retorna true se copiou.
// O textarea do fallback é inserido ao lado do elemento focado (o botão que
// disparou a cópia): dentro de dialogs com focus trap, um textarea no body
// perde a seleção antes do execCommand e a cópia falha silenciosamente.
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // cai no fallback
    }
  }
  const active = document.activeElement;
  const host = active && active !== document.body ? active.parentNode : document.body;
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0";
  host.appendChild(el);
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  host.removeChild(el);
  return ok;
}

import crypto from "crypto";
import { getConfig, setConfig } from "../config/config.service.js";

// Senha de acesso ao site. Guardamos só o hash (sha256 hex) em config.authHash —
// o texto puro nunca é persistido. O próprio hash funciona como bearer token: o
// front guarda em cookie e reenvia no header; o guard compara com o hash salvo.

export function hashPassword(plain) {
  return crypto.createHash("sha256").update(String(plain), "utf-8").digest("hex");
}

export function getAuthHash() {
  const hash = getConfig().authHash;
  return typeof hash === "string" && hash.length ? hash : null;
}

export function isAuthRequired() {
  return getAuthHash() !== null;
}

export function setPassword(plain) {
  return setConfig({ authHash: hashPassword(plain) });
}

export function clearPassword() {
  return setConfig({ authHash: null });
}

export function verifyPassword(plain) {
  return verifyToken(hashPassword(plain));
}

// Comparação em tempo constante — evita timing attack no token/hash.
export function verifyToken(token) {
  const hash = getAuthHash();
  if (!hash || typeof token !== "string" || token.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(hash));
}

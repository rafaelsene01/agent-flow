"use client";

import { useEffect, useState } from "react";
import { onUnauthorized } from "@/lib/auth";
import PasswordModal from "@/components/PasswordModal";

// O wrapper de fetch é instalado no import de lib/auth. Aqui só registramos o
// callback que mostra o modal de senha quando alguma chamada /api volta 401.
export default function AuthGate({ children }) {
  const [prompt, setPrompt] = useState(false);

  useEffect(() => onUnauthorized(() => setPrompt(true)), []);

  return (
    <>
      {children}
      {prompt && <PasswordModal />}
    </>
  );
}

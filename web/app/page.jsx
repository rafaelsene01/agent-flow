"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        if (!s.github?.connected || !s.claude?.connected) setShowSettings(true);
      })
      .catch(() => setShowSettings(true))
      .finally(() => setInitializing(false));
  }, []);

  if (initializing) {
    return (
      <div className="init-screen">
        <span className="init-logo">🌸</span>
        <p className="init-msg">Verificando integrações…</p>
        <div className="loader">
          <span className="loader-dot" />
          <span className="loader-dot" />
          <span className="loader-dot" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header onSettings={() => setShowSettings(true)} />

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

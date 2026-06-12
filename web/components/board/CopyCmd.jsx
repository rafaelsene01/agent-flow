"use client";

import { useState } from "react";

export default function CopyCmd({ cmd }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      className={`git-cmd${copied ? " git-cmd--copied" : ""}`}
      type="button"
      onClick={handleCopy}
      title="Copiar"
    >
      <code className="git-cmd-text">{cmd}</code>
    </button>
  );
}

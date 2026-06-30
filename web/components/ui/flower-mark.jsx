// Marca da Agent Flow — flor de cerejeira (sakura) em SVG.
// Substitui o emoji 🌸: vetor escala sem perda, cor consistente em light/dark
// e tematizável via design tokens. Cores fixas preservam a identidade da marca.
export function FlowerMark({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="Agent Flow"
    >
      {[0, 72, 144, 216, 288].map((deg) => (
        <path
          key={deg}
          d="M12 2.6c1.7 0 3 1.7 3 3.8 0 1.6-1.3 3.1-3 4.7-1.7-1.6-3-3.1-3-4.7 0-2.1 1.3-3.8 3-3.8Z"
          fill="#f472b6"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="2.1" fill="#fcd34d" />
    </svg>
  );
}

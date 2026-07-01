"use client";

/**
 * Empty-state genérico para telas ainda não implementadas (Agents, Skill).
 * Apenas UI — sem chamadas de backend. Segue o padrão do empty-state de boards
 * (ícone + título + descrição centralizados).
 */
export default function PlaceholderView({ icon: Icon, title, description, badge }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border bg-card shadow-card">
          <Icon className="size-7 text-primary" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            {badge && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";

const POLL_MS = 30_000;

function formatDueDate(dateString) {
  if (!dateString) return "—";
  const dt = new Date(dateString.includes("T") ? dateString : `${dateString}T00:00:00Z`);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdue(dateString) {
  if (!dateString) return false;
  const dt = new Date(dateString.includes("T") ? dateString : `${dateString}T00:00:00Z`);
  return dt < new Date();
}

export default function App() {
  const [data, setData] = useState({ columns: [], cardsByColumn: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCard, setSelectedCard] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const totalCards = useMemo(
    () => Object.values(data.cardsByColumn || {}).reduce((acc, cards) => acc + cards.length, 0),
    [data]
  );

  async function refreshBoard() {
    try {
      const response = await fetch("/api/board");
      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const body = await response.text();
        const preview = body.slice(0, 120).replace(/\s+/g, " ").trim();
        throw new Error(
          `Resposta inválida da API (esperado JSON). Prévia: ${preview || "(vazio)"}`
        );
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao carregar board.");
      }
      setData(payload);
      setError("");
      setLastSync(new Date());
    } catch (fetchError) {
      setError(fetchError.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshBoard();
    const timer = setInterval(refreshBoard, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Hana Board</h1>
          <p>
            {data.columns.length} colunas · {totalCards} issues
          </p>
        </div>
        <div className="actions">
          <button onClick={refreshBoard} type="button">
            Atualizar
          </button>
          <span>Sync: {lastSync ? lastSync.toLocaleTimeString("pt-BR") : "—"}</span>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {loading ? (
        <div className="loading">Carregando board...</div>
      ) : (
        <main className="board">
          {data.columns.map((column) => {
            const cards = data.cardsByColumn[column.id] || [];
            return (
              <section key={column.id} className="column">
                <header className="columnHeader">
                  <h2>{column.name}</h2>
                  <span>{cards.length}</span>
                </header>
                <div className="cards">
                  {cards.length === 0 ? (
                    <p className="empty">(vazio)</p>
                  ) : (
                    cards.map((card) => (
                      <button
                        key={card.id}
                        className="card"
                        type="button"
                        onClick={() => setSelectedCard({ ...card, stateName: column.name })}
                      >
                        <strong>{card.title}</strong>
                        <small>{card.identifier}</small>
                        {card.assigneeDisplay ? <small>@{card.assigneeDisplay}</small> : null}
                        {card.dueDate ? (
                          <small className={isOverdue(card.dueDate) ? "overdue" : "ok"}>
                            Vence: {formatDueDate(card.dueDate)}
                          </small>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </main>
      )}

      {selectedCard ? (
        <div className="modalBackdrop" onClick={() => setSelectedCard(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <h3>
                {selectedCard.identifier} · {selectedCard.title}
              </h3>
              <button type="button" onClick={() => setSelectedCard(null)}>
                Fechar
              </button>
            </div>
            <p>
              <strong>Estado:</strong> {selectedCard.stateName}
            </p>
            <p>
              <strong>Prioridade:</strong> {selectedCard.priority ?? "—"}
            </p>
            <p>
              <strong>Assignee:</strong> {selectedCard.assigneeDisplay || "não atribuído"}
            </p>
            <p>
              <strong>Vencimento:</strong> {formatDueDate(selectedCard.dueDate)}
            </p>
            <p>
              <strong>URL:</strong>{" "}
              <a href={selectedCard.url} target="_blank" rel="noreferrer">
                abrir issue
              </a>
            </p>
            <div className="description">
              <strong>Descrição</strong>
              <p>{selectedCard.description?.trim() || "(sem descrição)"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

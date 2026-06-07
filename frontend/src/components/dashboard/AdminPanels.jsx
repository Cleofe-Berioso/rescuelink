function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ActivityLogSection({ statusHistory, title = "System Activity Log", limit }) {
  const items = limit ? statusHistory.slice(0, limit) : statusHistory;

  return (
    <section className="card activity-log-card">
      <div className="card__header">
        <span className="card__eyebrow">Audit Trail</span>
        <h2>{title}</h2>
        <p className="card__desc">Status changes and response actions recorded by authorized personnel.</p>
      </div>
      {items.length ? (
        <ul className="activity-log">
          {items.map((entry) => (
            <li key={entry.id} className="activity-log__item">
              <div className="activity-log__meta">
                <strong>Report #{entry.emergency_report}</strong>
                <span>{entry.status.replace(/_/g, " ")}</span>
                <time>{formatDate(entry.created_at)}</time>
              </div>
              <p className="activity-log__remarks">
                {entry.remarks || "No remarks"}
                {entry.updated_by?.username ? ` · ${entry.updated_by.username}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card__desc">No activity logged yet.</p>
      )}
    </section>
  );
}

export function AdminStatsGrid({ reports }) {
  const counts = {
    total: reports.length,
    pending: reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED").length,
    accepted: reports.filter((r) => r.status === "ACCEPTED").length,
    dispatched: reports.filter((r) => r.status === "DISPATCHED").length,
    inProgress: reports.filter((r) => r.status === "IN_PROGRESS").length,
    resolved: reports.filter((r) => r.status === "RESOLVED").length,
    cancelled: reports.filter((r) => r.status === "CANCELLED").length,
  };

  const cards = [
    { label: "Total Reports", value: counts.total, tone: "info" },
    { label: "Pending", value: counts.pending, tone: "warning" },
    { label: "Accepted", value: counts.accepted, tone: "info" },
    { label: "Dispatched", value: counts.dispatched, tone: "info" },
    { label: "In Progress", value: counts.inProgress, tone: "info" },
    { label: "Resolved", value: counts.resolved, tone: "success" },
    { label: "Cancelled", value: counts.cancelled, tone: "neutral" },
  ];

  return (
    <section className="summary-cards summary-cards--admin" aria-label="Admin incident summary">
      {cards.map((card) => (
        <article key={card.label} className={`summary-card summary-card--${card.tone}`}>
          <p className="summary-card__label">{card.label}</p>
          <p className="summary-card__value">{card.value}</p>
        </article>
      ))}
    </section>
  );
}

export function PlaceholderPanel({ title, message }) {
  return (
    <section className="card placeholder-panel">
      <div className="card__header">
        <h2>{title}</h2>
        <p className="card__desc">{message}</p>
      </div>
    </section>
  );
}

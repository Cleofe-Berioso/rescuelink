function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function SummaryCards({ reports }) {
  const pending = reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED").length;
  const accepted = reports.filter((r) => r.status === "ACCEPTED").length;
  const dispatched = reports.filter(
    (r) => r.status === "DISPATCHED" || r.status === "IN_PROGRESS"
  ).length;
  const resolvedToday = reports.filter((r) => r.status === "RESOLVED" && isToday(r.updated_at)).length;

  const cards = [
    {
      label: "Pending Incidents",
      value: pending,
      tone: "warning",
      hint: "Awaiting response",
    },
    {
      label: "Accepted",
      value: accepted,
      tone: "info",
      hint: "Units acknowledging",
    },
    {
      label: "Dispatched",
      value: dispatched,
      tone: "info",
      hint: "Active deployment",
    },
    {
      label: "Resolved Today",
      value: resolvedToday,
      tone: "success",
      hint: "Closed incidents",
    },
  ];

  return (
    <section className="summary-cards" aria-label="Incident summary">
      {cards.map((card) => (
        <article key={card.label} className={`summary-card summary-card--${card.tone}`}>
          <p className="summary-card__label">{card.label}</p>
          <p className="summary-card__value">{card.value}</p>
          <p className="summary-card__hint">{card.hint}</p>
        </article>
      ))}
    </section>
  );
}

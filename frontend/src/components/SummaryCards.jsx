function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

function SummaryIcon({ name }) {
  const icons = {
    pending: (
      <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    accepted: (
      <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 20c0-3.3 2.7-6 6-6M16 8a3 3 0 100-6M21 20c0-3-2.2-5.5-5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    dispatched: (
      <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
        <path d="M4 16h12M4 16l2-4h8l2 4M6 16v3M14 16v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7" cy="19" r="1.5" fill="currentColor" />
        <circle cx="13" cy="19" r="1.5" fill="currentColor" />
      </svg>
    ),
    resolved: (
      <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  };
  return <span className="summary-card__icon">{icons[name]}</span>;
}

export default function SummaryCards({ reports, onViewFilter }) {
  const pending = reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED").length;
  const accepted = reports.filter((r) => r.status === "ACCEPTED").length;
  const dispatched = reports.filter((r) => r.status === "DISPATCHED").length;
  const inProgress = reports.filter((r) => r.status === "IN_PROGRESS").length;
  const resolvedToday = reports.filter(
    (r) => r.status === "RESOLVED" && isToday(r.updated_at)
  ).length;

  const cards = [
    {
      key: "pending",
      label: "Pending Incidents",
      value: pending,
      tone: "warning",
      hint: "Awaiting response",
      filter: "NEEDS_RESPONSE",
      icon: "pending",
    },
    {
      key: "accepted",
      label: "Accepted Incidents",
      value: accepted,
      tone: "info",
      hint: "Units acknowledging",
      filter: "ACCEPTED",
      icon: "accepted",
    },
    {
      key: "dispatched",
      label: "Dispatched Incidents",
      value: dispatched,
      tone: "purple",
      hint:
        inProgress > 0
          ? `${inProgress} in progress · ${dispatched} dispatched`
          : "Active deployment",
      filter: "DISPATCHED",
      icon: "dispatched",
    },
    {
      key: "resolved",
      label: "Resolved Today",
      value: resolvedToday,
      tone: "success",
      hint: "Closed incidents",
      filter: "RESOLVED",
      icon: "resolved",
    },
  ];

  return (
    <section className="summary-cards summary-cards--command" aria-label="Incident summary">
      {cards.map((card) => (
        <article key={card.key} className={`summary-card summary-card--${card.tone}`}>
          <div className="summary-card__top">
            <p className="summary-card__label">{card.label}</p>
            <SummaryIcon name={card.icon} />
          </div>
          <p className="summary-card__value">{card.value}</p>
          <p className="summary-card__hint">{card.hint}</p>
          {onViewFilter ? (
            <button
              type="button"
              className="summary-card__link"
              onClick={() => onViewFilter(card.filter)}
            >
              View all
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}

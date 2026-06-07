export default function StatusFilterBar({ active, onChange, counts }) {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filter reports by status">
      {FILTER_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`filter-bar__chip ${active === key ? "filter-bar__chip--active" : ""}`}
          onClick={() => onChange(key)}
        >
          {label}
          {counts[key] != null ? <span className="filter-bar__count">{counts[key]}</span> : null}
        </button>
      ))}
    </div>
  );
}

const FILTER_OPTIONS = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CANCELLED", label: "Cancelled" },
];

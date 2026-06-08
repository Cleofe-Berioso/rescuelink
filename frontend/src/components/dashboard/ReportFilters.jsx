const STAFF_FILTER_OPTIONS = [
  { key: "ALL", label: "All Reports" },
  { key: "NEEDS_RESPONSE", label: "Needs Response" },
  { key: "PRIORITY", label: "Priority" },
  { key: "PENDING", label: "Pending" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CANCELLED", label: "Cancelled" },
];

const ADMIN_FILTER_OPTIONS = STAFF_FILTER_OPTIONS.filter(
  (item) => item.key !== "NEEDS_RESPONSE" && item.key !== "PRIORITY"
);

export default function ReportFilters({ active, onChange, counts = {}, staffFilters = true }) {
  const options = staffFilters ? STAFF_FILTER_OPTIONS : ADMIN_FILTER_OPTIONS;
  return (
    <div className="report-filter-tabs" role="tablist" aria-label="Filter emergency reports">
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`report-filter-tabs__tab ${active === key ? "report-filter-tabs__tab--active" : ""}`}
          onClick={() => onChange(key)}
        >
          <span className="report-filter-tabs__label">{label}</span>
          {counts[key] != null ? (
            <span className="report-filter-tabs__count">{counts[key]}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

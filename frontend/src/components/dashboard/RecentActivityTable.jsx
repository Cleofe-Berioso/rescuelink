import StatusBadge from "../StatusBadge";

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { timeStyle: "short", dateStyle: "short" });
  } catch {
    return iso;
  }
}

function truncate(text, max = 48) {
  if (!text) return "Emergency report";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function statusMarkerColor(status) {
  const key = (status || "").toUpperCase();
  if (key === "IN_PROGRESS") return "#dc2626";
  if (key === "DISPATCHED") return "#7c3aed";
  if (key === "ACCEPTED") return "#2563eb";
  if (key === "RESOLVED") return "#16a34a";
  if (key === "CANCELLED") return "#64748b";
  return "#d97706";
}

function dedupeLatestActivity(statusHistory, limit = 5) {
  const byReport = new Map();
  for (const entry of statusHistory) {
    const reportId = entry.emergency_report;
    const existing = byReport.get(reportId);
    if (!existing || new Date(entry.created_at) > new Date(existing.created_at)) {
      byReport.set(reportId, entry);
    }
  }
  return [...byReport.values()]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export default function RecentActivityTable({
  statusHistory,
  reportsById = {},
  limit = 5,
  onViewFull,
}) {
  const items = dedupeLatestActivity(statusHistory, limit);

  return (
    <section className="card recent-activity-card">
      <div className="recent-activity-card__header card__header">
        <div>
          <span className="card__eyebrow">Audit Trail</span>
          <h2>Recent Activity</h2>
          <p className="card__desc">Latest status changes and response actions across all units.</p>
        </div>
        {onViewFull ? (
          <button type="button" className="priority-watch__link" onClick={onViewFull}>
            View Full Activity Log
          </button>
        ) : null}
      </div>

      {items.length ? (
        <div className="recent-activity-table-wrap">
          <table className="recent-activity-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Status</th>
                <th>Activity</th>
                <th>Unit / User</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const report = reportsById[entry.emergency_report];
                return (
                  <tr key={entry.id}>
                    <td>
                      <div className="recent-activity__report">
                        <span
                          className="recent-activity__marker"
                          style={{ background: statusMarkerColor(entry.status) }}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="recent-activity__report-id">
                            Report #{entry.emergency_report}
                          </div>
                          <p className="recent-activity__report-desc">
                            {truncate(report?.emergency_description)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={entry.status} />
                    </td>
                    <td>
                      <p className="recent-activity__message">
                        {entry.remarks || "Status updated."}
                      </p>
                    </td>
                    <td>
                      <span className="recent-activity__actor">
                        {entry.updated_by?.username || "System"}
                      </span>
                    </td>
                    <td>
                      <time className="recent-activity__time" dateTime={entry.created_at}>
                        {formatTime(entry.created_at)}
                      </time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="card__desc">No activity logged yet.</p>
      )}
    </section>
  );
}

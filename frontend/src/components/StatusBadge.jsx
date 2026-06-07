const STATUS_CLASS = {
  pending: "status-badge--warning",
  viewed: "status-badge--warning",
  accepted: "status-badge--info",
  dispatched: "status-badge--info",
  in_progress: "status-badge--info",
  resolved: "status-badge--success",
  cancelled: "status-badge--critical",
};

export default function StatusBadge({ status }) {
  const key = (status || "").toLowerCase();
  const variant = STATUS_CLASS[key] || "status-badge--neutral";
  const label = (status || "UNKNOWN").replace(/_/g, " ");

  return <span className={`status-badge ${variant}`}>{label}</span>;
}

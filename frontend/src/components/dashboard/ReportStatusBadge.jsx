import StatusBadge from "../StatusBadge";

export default function ReportStatusBadge({ status, size = "default" }) {
  return (
    <span className={`report-status-badge${size === "lg" ? " report-status-badge--lg" : ""}`}>
      <StatusBadge status={status} />
    </span>
  );
}

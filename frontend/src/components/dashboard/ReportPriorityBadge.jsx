import { formatPriorityLevel } from "../../utils/reportPriority";

export default function ReportPriorityBadge({ level, isPriority = false, compact = false }) {
  if (!isPriority && !level) return null;
  const normalized = (level || "LOW").toUpperCase();
  const tone =
    normalized === "CRITICAL"
      ? "critical"
      : normalized === "HIGH"
        ? "high"
        : normalized === "MEDIUM"
          ? "medium"
          : "low";

  return (
    <span className={`report-priority-badge report-priority-badge--${tone}${compact ? " report-priority-badge--compact" : ""}`}>
      {compact ? formatPriorityLevel(level) : `Priority · ${formatPriorityLevel(level)}`}
    </span>
  );
}

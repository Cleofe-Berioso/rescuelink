const FLAG_LABELS = {
  SPAM: "Possible Spam",
  POSSIBLE_SPAM: "Possible Spam",
  DUPLICATE_REPORT: "Duplicate Pic",
  DUPLICATE_PIC: "Duplicate Pic",
  REVIEW: "Needs Verification",
};

function formatFlagLabel(raw) {
  if (!raw) return "";
  const normalized = String(raw).toUpperCase();
  if (FLAG_LABELS[normalized]) return FLAG_LABELS[normalized];
  if (FLAG_LABELS[raw]) return FLAG_LABELS[raw];
  return String(raw)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

export function getReportFlagLabel(report) {
  if (!report?.is_flagged && !report?.needs_verification) return "";
  if (report.flag_type) {
    const label = formatFlagLabel(report.flag_type);
    if (label) return label;
  }
  if (report.needs_verification) return "Needs Verification";
  return "Flagged";
}

export function hasReportFlag(report) {
  return Boolean(report?.is_flagged || report?.needs_verification);
}

export default function ReportFlagBadge({ report, compact = false }) {
  const label = getReportFlagLabel(report);
  if (!label) return null;

  const typeClass = (report.flag_type || "review").toLowerCase().replace("_", "-");

  return (
    <span
      className={`report-flag-badge report-flag-badge--${typeClass}${
        compact ? " report-flag-badge--compact" : ""
      }`}
    >
      {label}
    </span>
  );
}

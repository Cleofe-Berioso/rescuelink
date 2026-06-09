const FLAG_LABELS = {
  SPAM: "Possible Spam",
  DUPLICATE_REPORT: "Duplicate Pic",
  REVIEW: "Needs Verification",
};

export function getReportFlagLabel(report) {
  if (!report?.is_flagged && !report?.needs_verification) return "";
  if (report.flag_type && FLAG_LABELS[report.flag_type]) {
    return FLAG_LABELS[report.flag_type];
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

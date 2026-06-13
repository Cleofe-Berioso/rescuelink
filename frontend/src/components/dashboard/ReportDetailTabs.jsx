import ReportFlagBadge, { hasReportFlag } from "./ReportFlagBadge";
import { formatPriorityLevel } from "../../utils/reportPriority";

const TABS = [
  { key: "details", label: "Details" },
  { key: "responses", label: "Responses" },
  { key: "updates", label: "Updates" },
];

export default function ReportDetailTabs({ activeTab, onChange, responseCount, updateCount }) {
  return (
    <div className="report-detail-tabs" role="tablist" aria-label="Report detail sections">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={activeTab === key}
          className={`report-detail-tabs__tab${activeTab === key ? " report-detail-tabs__tab--active" : ""}`}
          onClick={() => onChange(key)}
        >
          {label}
          {key === "responses" && responseCount ? ` (${responseCount})` : ""}
          {key === "updates" && updateCount ? ` (${updateCount})` : ""}
        </button>
      ))}
    </div>
  );
}

export function ReportDetailHeaderBadges({ report }) {
  const riskLevel = (report.risk_level || report.priority_level || "LOW").toUpperCase();

  return (
    <div className="report-detail-panel__badges">
      {riskLevel !== "LOW" ? (
        <span className={`report-detail-panel__critical-tag report-detail-panel__critical-tag--${riskLevel.toLowerCase()}`}>
          {formatPriorityLevel(riskLevel)}
        </span>
      ) : null}
      {report.is_priority ? (
        <span className="report-detail-panel__priority-tag">Priority</span>
      ) : null}
      {report.risk_source === "MANUAL_RESPONDER" ? (
        <span className="report-detail-panel__manual-tag">Manually reviewed</span>
      ) : null}
      {hasReportFlag(report) ? <ReportFlagBadge report={report} /> : null}
    </div>
  );
}

export { TABS };

import IncidentPhoto from "./IncidentPhoto";
import ReportPriorityBadge from "./ReportPriorityBadge";
import ReportFlagBadge, { hasReportFlag } from "./ReportFlagBadge";
import ReportStatusBadge from "./ReportStatusBadge";
import {
  RESPONDER_UNITS,
  formatPriorityLevel,
  getUnitResponse,
  hasAiAnalysis,
  formatResponseStatus,
} from "../../utils/reportPriority";
import {
  formatRelativeTime,
  getReportLocation,
  getReportTitle,
} from "../../utils/reportListUtils";

function UnitSummaryTable({ responses }) {
  return (
    <table className="compact-report-card__unit-table">
      <tbody>
        {RESPONDER_UNITS.map((unit) => {
          const item = getUnitResponse(responses, unit);
          const label = item ? formatResponseStatus(item.response_status) : "—";
          const responded = Boolean(item);
          return (
            <tr key={unit}>
              <th scope="row">{unit}</th>
              <td className={responded ? "compact-report-card__unit-accepted" : "compact-report-card__unit-muted"}>
                {responded ? label : "Not responded"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function CompactReportCard({
  report,
  token,
  unitResponses = [],
  onViewDetails,
  isActive = false,
}) {
  const showAi = hasAiAnalysis(report);
  const criticalLevel = (report.critical_level || "LOW").toUpperCase();
  const title = getReportTitle(report);
  const location = getReportLocation(report);

  return (
    <article
      className={`compact-report-card${isActive ? " compact-report-card--selected" : ""}${
        report.is_priority ? " compact-report-card--priority" : ""
      }${criticalLevel === "CRITICAL" ? " compact-report-card--critical" : ""}`}
      aria-label={`Report ${report.id}, ${title}`}
    >
      <div className="compact-report-card__left">
        <div className="compact-report-card__id-row">
          <span className="compact-report-card__id">#{report.id}</span>
          <div className="compact-report-card__badges">
            {showAi && criticalLevel !== "LOW" ? (
              <span className={`report-priority-badge report-priority-badge--${criticalLevel.toLowerCase()} report-priority-badge--compact`}>
                {formatPriorityLevel(report.critical_level)}
              </span>
            ) : null}
            {report.is_priority ? (
              <ReportPriorityBadge level={report.priority_level} isPriority compact />
            ) : null}
            {hasReportFlag(report) ? <ReportFlagBadge report={report} compact /> : null}
          </div>
        </div>

        <h3 className="compact-report-card__title">{title}</h3>

        <p className="compact-report-card__location">
          <span className="compact-report-card__icon" aria-hidden="true">
            📍
          </span>
          {location}
        </p>

        <p className="compact-report-card__reporter-line">
          <span>{report.reporter?.username || "Unknown reporter"}</span>
          <span className="compact-report-card__dot">·</span>
          <span>{report.contact_number || "No contact"}</span>
          <span className="compact-report-card__dot">·</span>
          <time dateTime={report.created_at}>{formatRelativeTime(report.created_at)}</time>
        </p>
      </div>

      <div className="compact-report-card__middle">
        <ReportStatusBadge status={report.status} />
        <UnitSummaryTable responses={unitResponses} />
        <button
          type="button"
          className="btn btn--primary btn--sm compact-report-card__view-btn"
          onClick={() => onViewDetails(report)}
        >
          View Details
        </button>
      </div>

      <div className="compact-report-card__right">
        <IncidentPhoto
          token={token}
          src={report.image_url}
          alt={`Report ${report.id} thumbnail`}
          variant="thumb"
        />
      </div>
    </article>
  );
}

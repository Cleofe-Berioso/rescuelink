import StatusBadge from "./StatusBadge";
import IncidentPhoto from "./dashboard/IncidentPhoto";
import { UnitResponseBadges } from "./dashboard/UnitResponses";
import {
  formatPriorityLevel,
  getCriticalLevelClass,
  getReportSuggestedUnits,
  hasAiAnalysis,
} from "../utils/reportPriority";

function formatReportDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function ReportCard({
  report,
  token,
  actions,
  showAiPriority = true,
  unitResponses = [],
}) {
  const suggestedUnits = getReportSuggestedUnits(report);
  const isMultiAgency = suggestedUnits.length >= 2;
  const isCritical = (report.critical_level || "").toUpperCase() === "CRITICAL";
  const showAi = showAiPriority && hasAiAnalysis(report);
  const aiSuggestedUnits =
    Array.isArray(report.suggested_units) && report.suggested_units.length
      ? report.suggested_units
      : [];

  return (
    <article
      className={`report-card${
        report.is_priority || isCritical || isMultiAgency ? " report-card--priority" : ""
      }${isCritical ? " report-card--critical" : ""}`}
    >
      <header className="report-card__header">
        <div className="report-card__title-row">
          <div className="report-card__id">
            <span className="report-card__hash">#</span>
            {report.id}
          </div>
          <span className="report-card__time">{formatReportDate(report.created_at)}</span>
        </div>
        <div className="report-card__badges">
          {showAi && (report.critical_level || "").toUpperCase() !== "LOW" ? (
            <span className={getCriticalLevelClass(report.critical_level)} title="Severity level">
              {formatPriorityLevel(report.critical_level)}
            </span>
          ) : null}
          {report.is_priority ? <span className="priority-badge">Priority</span> : null}
          {report.detected_incident_type ? (
            <span className="incident-type-badge">{report.detected_incident_type}</span>
          ) : null}
          {aiSuggestedUnits.length ? (
            <span
              className="suggested-units-badge"
              title="Suggested units — manual response required"
            >
              Suggested units: {aiSuggestedUnits.join(", ")}
            </span>
          ) : suggestedUnits.length ? (
            <span
              className="suggested-units-badge suggested-units-badge--legacy"
              title="Keyword-based suggestion only — manual response required"
            >
              Suggested: {suggestedUnits.join(", ")}
            </span>
          ) : null}
          {isMultiAgency ? <span className="multi-agency-badge">Multi-agency</span> : null}
          <UnitResponseBadges responses={unitResponses} />
          <StatusBadge status={report.status} />
        </div>
      </header>

      <p className="report-card__description">{report.emergency_description}</p>

      {showAi && report.ai_priority_reason ? (
        <div className="report-card__ai-reason">
          <p className="report-card__ai-reason-label">Priority reason</p>
          <p>{report.ai_priority_reason}</p>
          {typeof report.ai_confidence === "number" ? (
            <p className="report-card__ai-confidence">Review score: {report.ai_confidence}%</p>
          ) : null}
        </div>
      ) : null}

      <dl className="report-card__meta">
        <div>
          <dt>Contact</dt>
          <dd>{report.contact_number || "—"}</dd>
        </div>
        <div>
          <dt>Reporter</dt>
          <dd>{report.reporter?.username || "—"}</dd>
        </div>
        {report.address_text ? (
          <div className="report-card__meta-wide">
            <dt>Address</dt>
            <dd>{report.address_text}</dd>
          </div>
        ) : null}
        <div className="report-card__meta-wide">
          <dt>Coordinates</dt>
          <dd>
            {report.latitude}, {report.longitude}
          </dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatReportDate(report.created_at)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatReportDate(report.updated_at)}</dd>
        </div>
      </dl>

      <div className="report-card__photo">
        <span className="report-card__photo-label">Incident photo</span>
        <IncidentPhoto
          token={token}
          src={report.image_url}
          alt={`Report ${report.id} incident photo`}
        />
      </div>

      {actions ? <div className="report-card__actions">{actions}</div> : null}
    </article>
  );
}

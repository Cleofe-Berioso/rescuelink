import StatusBadge from "./StatusBadge";
import IncidentPhoto from "./dashboard/IncidentPhoto";
import { UnitResponseBadges } from "./dashboard/UnitResponses";
import {
  formatPriorityLevel,
  getCriticalLevelClass,
  getReportSuggestedUnits,
  hasRiskAssessment,
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
  showPriorityInfo = true,
  unitResponses = [],
}) {
  const suggestedUnits = getReportSuggestedUnits(report);
  const isMultiAgency = suggestedUnits.length >= 2;
  const riskLevel = (report.risk_level || report.critical_level || report.priority_level || "LOW").toUpperCase();
  const isCritical = riskLevel === "CRITICAL";
  const showRisk = showPriorityInfo && hasRiskAssessment(report);

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
          {showRisk && riskLevel !== "LOW" ? (
            <span className={getCriticalLevelClass(riskLevel)} title="Severity level">
              {formatPriorityLevel(riskLevel)}
            </span>
          ) : null}
          {report.is_priority ? <span className="priority-badge">Priority</span> : null}
          {suggestedUnits.length ? (
            <span
              className="suggested-units-badge"
              title="Keyword-based suggestion — manual response required"
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

      {showRisk && report.risk_reason ? (
        <div className="report-card__ai-reason">
          <p className="report-card__ai-reason-label">Priority reason</p>
          <p>{report.risk_reason}</p>
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

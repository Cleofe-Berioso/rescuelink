import AuthenticatedImage from "./AuthenticatedImage";
import StatusBadge from "./StatusBadge";
import { UnitResponseBadges } from "./dashboard/UnitResponses";

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
  priorityLabel,
  suggestedUnits = [],
  unitResponses = [],
}) {
  const isMultiAgency = suggestedUnits.length >= 2;

  return (
    <article
      className={`report-card${priorityLabel || isMultiAgency ? " report-card--priority" : ""}`}
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
          {priorityLabel ? <span className="priority-badge">{priorityLabel}</span> : null}
          {suggestedUnits.length ? (
            <span className="suggested-units-badge" title="Keyword-based suggestion only — manual response required">
              Suggested: {suggestedUnits.join(", ")}
            </span>
          ) : null}
          {isMultiAgency ? <span className="multi-agency-badge">Multi-agency</span> : null}
          <UnitResponseBadges responses={unitResponses} />
          <StatusBadge status={report.status} />
        </div>
      </header>

      <p className="report-card__description">{report.emergency_description}</p>

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

      {report.image_url ? (
        <div className="report-card__photo">
          <span className="report-card__photo-label">Incident photo</span>
          <AuthenticatedImage token={token} src={report.image_url} alt={`Report ${report.id} photo`} />
        </div>
      ) : null}

      {actions ? <div className="report-card__actions">{actions}</div> : null}
    </article>
  );
}

import { useEffect, useMemo, useState } from "react";
import IncidentPhoto from "./IncidentPhoto";
import ReportActions from "./ReportActions";
import ReportStatusBadge from "./ReportStatusBadge";
import UnitResponsesPanel from "./UnitResponses";
import ReportDetailTabs, { ReportDetailHeaderBadges } from "./ReportDetailTabs";
import ReportFlagBadge, { hasReportFlag } from "./ReportFlagBadge";
import { formatPriorityLevel } from "../../utils/reportPriority";
import { formatRelativeTime, getReportLocation, getReportTitle } from "../../utils/reportListUtils";
import IncidentLocationMap from "./IncidentLocationMap";
import ChangeRiskLevelForm from "./ChangeRiskLevelForm";

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

function AbuseReviewCard({ report }) {
  if (!hasReportFlag(report) && !report.flag_reason && report.risk_score == null) {
    return null;
  }

  return (
    <section className="report-detail-abuse">
      <h3 className="report-detail-section__title">Risk review</h3>
      <div className="report-detail-panel__badges">
        {hasReportFlag(report) ? <ReportFlagBadge report={report} /> : null}
      </div>
      <dl className="report-detail-ai__grid">
        {typeof report.risk_score === "number" ? (
          <div>
            <dt>Risk Score</dt>
            <dd>{report.risk_score}</dd>
          </div>
        ) : null}
        {report.flag_reason ? (
          <div className="report-detail-ai__wide">
            <dt>System / Rule Reason</dt>
            <dd>{report.flag_reason}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function formatRiskSource(source) {
  if (!source) return "—";
  if (source === "RULE_BASED") return "Rule-based triage";
  if (source === "MANUAL_RESPONDER") return "Manual responder";
  return source.replace(/_/g, " ");
}

function RiskTriageCard({ report, config, token, onChanged }) {
  const riskLevel = report.risk_level || report.priority_level || "LOW";
  const logs = Array.isArray(report.risk_logs) ? report.risk_logs : [];

  return (
    <section className="report-detail-risk">
      <h3 className="report-detail-section__title">Risk level</h3>
      <div className="report-detail-panel__badges">
        <span className={`report-detail-panel__critical-tag report-detail-panel__critical-tag--${riskLevel.toLowerCase()}`}>
          {formatPriorityLevel(riskLevel)}
        </span>
      </div>
      <dl className="report-detail-ai__grid">
        <div>
          <dt>Source</dt>
          <dd>{formatRiskSource(report.risk_source)}</dd>
        </div>
        {report.risk_reason ? (
          <div className="report-detail-ai__wide">
            <dt>Reason</dt>
            <dd>{report.risk_reason}</dd>
          </div>
        ) : null}
      </dl>

      {logs.length ? (
        <div className="report-detail-risk__logs">
          <h4 className="report-detail-risk__logs-title">Risk change history</h4>
          <ul className="report-detail-updates">
            {logs.map((entry) => (
              <li key={entry.id} className="report-detail-updates__item">
                <div className="report-detail-updates__meta">
                  <strong>
                    {entry.old_risk_level} → {entry.new_risk_level}
                  </strong>
                  <time>{formatReportDate(entry.created_at)}</time>
                </div>
                <p className="report-detail-updates__remarks">
                  {entry.reason || "No reason recorded"}
                  {entry.changed_by?.username ? ` · ${entry.changed_by.username}` : ""}
                  {entry.changed_by_role ? ` (${entry.changed_by_role})` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {config.canRespond ? (
        <div className="report-detail-risk__form">
          <h4 className="report-detail-risk__logs-title">Change risk level</h4>
          <ChangeRiskLevelForm token={token} report={report} onChanged={onChanged} />
        </div>
      ) : null}
    </section>
  );
}

function UpdatesTab({ entries }) {
  if (!entries.length) {
    return (
      <p className="report-detail-empty" role="status">
        No updates recorded yet.
      </p>
    );
  }

  return (
    <ul className="report-detail-updates">
      {entries.map((entry) => (
        <li key={entry.id} className="report-detail-updates__item">
          <div className="report-detail-updates__meta">
            <strong>{(entry.status || "").replace(/_/g, " ")}</strong>
            <time>{formatReportDate(entry.created_at)}</time>
          </div>
          <p className="report-detail-updates__remarks">
            {entry.remarks || "No remarks"}
            {entry.updated_by?.username ? ` · ${entry.updated_by.username}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function ReportDetailsContent({
  report,
  token,
  config,
  unitResponses = [],
  statusHistory = [],
  onClose,
  onChanged,
  actionsMode = "full",
}) {
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    setActiveTab("details");
  }, [report?.id]);

  const reportHistory = useMemo(
    () =>
      report
        ? statusHistory
            .filter((entry) => entry.emergency_report === report.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        : [],
    [statusHistory, report]
  );

  const dispatchEntry = reportHistory.find((entry) => entry.status === "DISPATCHED");

  if (!report) return null;

  const responseCount = unitResponses.length;

  return (
    <article className="report-detail-panel report-detail-panel--modal">
      <div className="report-detail-panel__chrome">
        <header className="report-detail-panel__header">
          <div className="report-detail-panel__title-row">
            <div>
              <h2 className="report-detail-panel__title" id="report-details-title">
                Report #{report.id}
              </h2>
              <p className="report-detail-panel__incident-title">{getReportTitle(report)}</p>
            </div>
            {onClose ? (
              <button type="button" className="report-detail-panel__close" onClick={onClose} aria-label="Close">
                ×
              </button>
            ) : null}
          </div>
          <ReportDetailHeaderBadges report={report} />
          <div className="report-detail-panel__status-row">
            <span className="report-detail-panel__status-label">Status:</span>
            <ReportStatusBadge status={report.status} size="lg" />
          </div>
          <p className="report-detail-panel__submitted">
            Submitted: {formatReportDate(report.created_at)} ({formatRelativeTime(report.created_at)})
          </p>
          {dispatchEntry ? (
            <p className="report-detail-panel__dispatch">
              Dispatched
              {dispatchEntry.updated_by?.username ? ` by ${dispatchEntry.updated_by.username}` : ""}
              {dispatchEntry.created_at ? ` · ${formatReportDate(dispatchEntry.created_at)}` : ""}
            </p>
          ) : null}
        </header>

        <ReportDetailTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          responseCount={responseCount}
          updateCount={reportHistory.length}
        />
      </div>

      <div className="report-detail-panel__body">
        {activeTab === "details" ? (
          <div className="report-detail-panel__section">
            <section className="report-detail-section">
              <h3 className="report-detail-section__title">Description</h3>
              <p className="report-detail-section__text">{report.emergency_description}</p>
            </section>

            <section className="report-detail-info-card">
              <h3 className="report-detail-section__title">Address</h3>
              <p className="report-detail-section__text">{getReportLocation(report)}</p>
            </section>

            <section className="report-detail-info-card report-detail-info-card--map">
              <h3 className="report-detail-section__title">Incident Location</h3>
              <IncidentLocationMap report={report} />
            </section>

            <section className="report-detail-info-card">
              <h3 className="report-detail-section__title">Reporter</h3>
              <dl className="report-detail-info-card__grid">
                <div>
                  <dt>Name</dt>
                  <dd>{report.reporter?.username || "—"}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{report.contact_number || "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="report-detail-section report-detail-section--photo">
              <h3 className="report-detail-section__title">Photo / Video</h3>
              <IncidentPhoto
                token={token}
                src={report.image_url}
                alt={`Report ${report.id} incident photo`}
                variant="drawer"
              />
            </section>

            <RiskTriageCard report={report} config={config} token={token} onChanged={onChanged} />
            <AbuseReviewCard report={report} />

            {config.canRespond ? (
              <section className="report-detail-section report-detail-section--actions">
                <h3 className="report-detail-section__title">Manual Response</h3>
                <ReportActions
                  token={token}
                  report={report}
                  defaultUnit={config.defaultUnit}
                  roleLabel={config.headerSubtitle}
                  existingResponses={unitResponses}
                  onChanged={onChanged}
                  mode={actionsMode}
                  showUnitPanel={false}
                />
              </section>
            ) : null}
          </div>
        ) : null}

        {activeTab === "responses" ? (
          <UnitResponsesPanel
            responses={unitResponses}
            currentUnit={config.defaultUnit}
            report={report}
          />
        ) : null}

        {activeTab === "updates" ? <UpdatesTab entries={reportHistory} /> : null}
      </div>
    </article>
  );
}

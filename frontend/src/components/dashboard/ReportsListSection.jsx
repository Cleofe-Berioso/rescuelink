import EmptyState from "../EmptyState";
import ErrorMessage from "../ErrorMessage";
import LoadingState from "../LoadingState";
import ReportCard from "../ReportCard";
import StatusFilterBar from "../StatusFilterBar";
import { buildFilterCounts, filterReportsByStatus } from "../../utils/reportFilters";
import { getPriorityMatch, getSuggestedUnits } from "../../utils/reportPriority";
import ReportActions from "./ReportActions";

export default function ReportsListSection({
  title,
  subtitle,
  reports,
  allReports,
  token,
  busy,
  error,
  onReload,
  statusFilter,
  onFilterChange,
  config,
  responsesByReport,
  showFilters = true,
  showPriorityBadge = false,
  role,
  emptyTitle,
  emptyMessage,
}) {
  const source = allReports ?? reports;
  const filterCounts = buildFilterCounts(source);
  const filteredReports = filterReportsByStatus(reports, statusFilter);

  return (
    <section className="card reports-panel">
      <div className="card__header card__header--row">
        <div>
          <span className="card__eyebrow">Live Feed</span>
          <h2>{title}</h2>
          <p className="card__desc">
            {subtitle ||
              `${filteredReports.length} shown · ${source.length} total · auto-refresh every 10s`}
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReload} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {showFilters ? (
        <StatusFilterBar active={statusFilter} onChange={onFilterChange} counts={filterCounts} />
      ) : null}

      <ErrorMessage message={error} />
      {busy && !reports.length ? <LoadingState message="Loading reports…" /> : null}

      <div className="report-list">
        {filteredReports.map((report) => {
          const suggestedUnits = getSuggestedUnits(report);
          return (
          <ReportCard
            key={report.id}
            report={report}
            token={token}
            suggestedUnits={suggestedUnits}
            unitResponses={responsesByReport[report.id] || []}
            priorityLabel={
              showPriorityBadge && role && getPriorityMatch(report, role) ? `${role} priority` : null
            }
            actions={
              config.canRespond ? (
                <ReportActions
                  key={`${report.id}-${report.status}-${(responsesByReport[report.id] || []).length}`}
                  token={token}
                  report={report}
                  defaultUnit={config.defaultUnit}
                  roleLabel={config.headerSubtitle}
                  existingResponses={responsesByReport[report.id] || []}
                  onChanged={onReload}
                />
              ) : null
            }
          />
        );
        })}
        {!filteredReports.length && !busy ? (
          <EmptyState
            icon="🛡️"
            title={emptyTitle || (statusFilter === "ALL" ? "No reports yet" : "No reports in this filter")}
            message={
              emptyMessage ||
              (statusFilter === "ALL"
                ? "New emergency reports from citizens will appear here for manual review."
                : "Try another status filter or wait for new incidents.")
            }
          />
        ) : null}
      </div>
    </section>
  );
}

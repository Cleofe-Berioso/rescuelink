import { useEffect, useMemo, useState } from "react";
import EmptyState from "../EmptyState";
import ErrorMessage from "../ErrorMessage";
import LoadingState from "../LoadingState";
import ReportCard from "../ReportCard";
import CompactReportCard from "./CompactReportCard";
import ReportDetailsModal from "./ReportDetailsModal";
import ReportSearchSortBar from "./ReportSearchSortBar";
import ReportPagination from "./ReportPagination";
import {
  buildFilterCounts,
  filterReportsByStatus,
  getFilterSubtitle,
} from "../../utils/reportFilters";
import {
  paginateReports,
  searchReports,
  sortReports,
} from "../../utils/reportListUtils";
import ReportActions from "./ReportActions";
import ReportFilters from "./ReportFilters";

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
  statusHistory = [],
  showFilters = true,
  role,
  emptyTitle,
  emptyMessage,
  limit,
  compact = false,
  queueLayout = false,
  actionsMode = "full",
  emptyActionLabel,
  onEmptyAction,
}) {
  const source = allReports ?? reports;
  const filterCounts = buildFilterCounts(source, role);
  const filteredReports = filterReportsByStatus(reports, statusFilter, role);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [modalReportId, setModalReportId] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, sort]);

  const processedReports = useMemo(() => {
    const searched = searchReports(filteredReports, search);
    return sortReports(searched, sort, role);
  }, [filteredReports, search, sort, role]);

  const pagination = useMemo(
    () => paginateReports(processedReports, page),
    [processedReports, page]
  );

  const visibleReports = queueLayout
    ? pagination.items
    : limit
      ? filteredReports.slice(0, limit)
      : filteredReports;

  const filterSubtitle = getFilterSubtitle(statusFilter, filterCounts, role);
  const resolvedSubtitle =
    subtitle ||
    filterSubtitle ||
    (queueLayout
      ? "Monitor and respond to incoming emergency incidents"
      : `${visibleReports.length} shown · ${source.length} total · auto-refresh every 10s`);

  const priorityEmpty =
    statusFilter === "PRIORITY" && filterCounts.PRIORITY === 0 && source.length > 0;

  const listReports = priorityEmpty ? source : visibleReports;

  const modalReport = useMemo(() => {
    if (!modalReportId) return null;
    return reports.find((item) => item.id === modalReportId) || null;
  }, [reports, modalReportId]);

  const modalUnitResponses = modalReportId ? responsesByReport[modalReportId] || [] : [];

  function handleOpenDetails(report) {
    setModalReportId(report.id);
  }

  function handleCloseDetails() {
    setModalReportId(null);
  }

  if (queueLayout) {
    return (
      <div className="reports-workspace reports-workspace--fixed reports-workspace--full">
        <section className="reports-list-pane">
          <div className="reports-list-header">
            <header className="reports-workspace__header">
              <div>
                <h2 className="reports-workspace__title">{title}</h2>
                <p className="reports-workspace__subtitle">{resolvedSubtitle}</p>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onReload} disabled={busy}>
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            </header>

            {showFilters ? (
              <ReportFilters
                active={statusFilter}
                onChange={onFilterChange}
                counts={filterCounts}
                staffFilters={Boolean(config.canRespond)}
              />
            ) : null}

            <ReportSearchSortBar
              search={search}
              onSearchChange={setSearch}
              sort={sort}
              onSortChange={setSort}
            />

            {priorityEmpty ? (
              <p className="reports-panel__priority-note" role="status">
                0 priority reports · showing all reports
              </p>
            ) : null}

            <ErrorMessage message={error} />
          </div>

          <div className="reports-list-scroll">
            {busy && !reports.length ? <LoadingState message="Loading reports…" /> : null}

            <div className="report-queue">
              {listReports.map((report) => (
                <CompactReportCard
                  key={report.id}
                  report={report}
                  token={token}
                  unitResponses={responsesByReport[report.id] || []}
                  onViewDetails={handleOpenDetails}
                  isActive={modalReportId === report.id}
                />
              ))}

              {!listReports.length && !priorityEmpty && !busy ? (
                <div className="reports-workspace__empty">
                  <EmptyState
                    icon="🛡️"
                    title={emptyTitle || "No reports found"}
                    message={
                      emptyMessage ||
                      (search
                        ? "Try changing the filter or search term."
                        : "Try another filter or wait for new incidents.")
                    }
                    actionLabel={emptyActionLabel}
                    onAction={onEmptyAction}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="reports-pagination-wrap">
            <ReportPagination pagination={pagination} onPageChange={setPage} />
          </div>
        </section>

        {modalReport ? (
          <ReportDetailsModal
            report={modalReport}
            token={token}
            config={config}
            unitResponses={modalUnitResponses}
            statusHistory={statusHistory}
            onClose={handleCloseDetails}
            onChanged={onReload}
            actionsMode={actionsMode}
          />
        ) : null}
      </div>
    );
  }

  return (
    <section className={`card reports-panel${compact ? " reports-panel--compact" : ""}`}>
      <div className="card__header card__header--row">
        <div>
          <span className="card__eyebrow">Live Feed</span>
          <h2>{title}</h2>
          <p className="card__desc">{resolvedSubtitle}</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReload} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {showFilters ? (
        <ReportFilters
          active={statusFilter}
          onChange={onFilterChange}
          counts={filterCounts}
          staffFilters={Boolean(config.canRespond)}
        />
      ) : null}

      {priorityEmpty ? (
        <p className="reports-panel__priority-note" role="status">
          0 priority reports · showing all reports
        </p>
      ) : null}

      <ErrorMessage message={error} />
      {busy && !reports.length ? <LoadingState message="Loading reports…" /> : null}

      <div className="report-list">
        {listReports.map((report) => {
          const unitResponses = responsesByReport[report.id] || [];
          return (
            <ReportCard
              key={report.id}
              report={report}
              token={token}
              unitResponses={unitResponses}
              showAiPriority
              actions={
                config.canRespond ? (
                  <ReportActions
                    token={token}
                    report={report}
                    defaultUnit={config.defaultUnit}
                    roleLabel={config.headerSubtitle}
                    existingResponses={unitResponses}
                    onChanged={onReload}
                    mode={actionsMode}
                  />
                ) : null
              }
            />
          );
        })}
        {!listReports.length && !priorityEmpty && !busy ? (
          <EmptyState
            icon="🛡️"
            title={emptyTitle || (statusFilter === "ALL" ? "No reports yet" : "No reports in this filter")}
            message={
              emptyMessage ||
              (statusFilter === "ALL"
                ? "New emergency reports from citizens will appear here for manual review."
                : statusFilter === "PRIORITY"
                  ? "No priority reports right now. All reports remain available under All."
                  : "Try another filter or wait for new incidents.")
            }
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
          />
        ) : null}
      </div>
    </section>
  );
}

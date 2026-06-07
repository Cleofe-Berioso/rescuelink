import { useMemo, useState } from "react";
import DashboardLayout from "./DashboardLayout";
import ReportsListSection from "./ReportsListSection";
import IncidentMapPanel from "./IncidentMapPanel";
import ActivityLogSection from "./AdminPanels";
import SummaryCards from "../SummaryCards";
import ManualIncidentForm from "./ManualIncidentForm";
import { useDashboardData } from "../../hooks/useDashboardData";
import {
  filterActiveReports,
  filterHistoryReports,
  filterPriorityReports,
  sortReportsWithPriority,
} from "../../utils/reportPriority";

export default function ResponderDashboard({ auth, onSignOut }) {
  const config = auth.config;
  const [activeView, setActiveView] = useState(config.homeView);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const { reports, statusHistory, responsesByReport, busy, error, reload } = useDashboardData(
    auth.access,
    refreshNonce
  );

  const sortedReports = useMemo(
    () => sortReportsWithPriority(reports, config.role),
    [reports, config.role]
  );
  const priorityReports = useMemo(
    () => filterPriorityReports(reports, config.role),
    [reports, config.role]
  );
  const activeReports = useMemo(() => filterActiveReports(reports), [reports]);
  const historyReports = useMemo(() => filterHistoryReports(reports), [reports]);

  const unitResponses = useMemo(() => {
    return reports.filter((report) =>
      (responsesByReport[report.id] || []).some((r) => r.response_unit === config.defaultUnit)
    );
  }, [reports, responsesByReport, config.defaultUnit]);

  function handleReload() {
    setRefreshNonce((n) => n + 1);
    return reload();
  }

  const homeViews = ["command-center", "fire-response", "police-response"];
  const isHome = homeViews.includes(activeView);

  let content = null;

  if (isHome) {
    content = (
      <>
        <div className="dash-notice">
          All incoming reports are visible to DRRM, BFP, and Police. Review details and manually select the
          correct responding unit. No automatic dispatch.
        </div>
        <SummaryCards reports={reports} />
        <div className="dashboard-grid">
          <ReportsListSection
            title={config.incomingTitle}
            subtitle={`${reports.length} total · ${priorityReports.length} suggested ${config.role} priority`}
            reports={sortedReports.slice(0, 6)}
            allReports={reports}
            token={auth.access}
            busy={busy}
            error={error}
            onReload={handleReload}
            statusFilter="PENDING"
            onFilterChange={() => {}}
            config={config}
            responsesByReport={responsesByReport}
            showFilters={false}
            showPriorityBadge
            role={config.role}
          />
          <IncidentMapPanel reports={reports} />
        </div>
        {config.priorityTitle ? (
          <ReportsListSection
            title={config.priorityTitle}
            subtitle="Suggested priority based on description keywords — all reports remain visible in Incoming Reports"
            reports={priorityReports}
            token={auth.access}
            busy={busy}
            error=""
            onReload={handleReload}
            statusFilter="ALL"
            onFilterChange={() => {}}
            config={config}
            responsesByReport={responsesByReport}
            showFilters={false}
            showPriorityBadge
            role={config.role}
            emptyTitle="No suggested priority incidents"
            emptyMessage="All incidents are still listed under Incoming Reports for manual review."
          />
        ) : null}
        <ActivityLogSection statusHistory={statusHistory} limit={8} title="Recent Activity" />
        {config.showManualEntry ? (
          <section className="manual-entry-section">
            {!showManualEntry ? (
              <button type="button" className="btn btn--outline" onClick={() => setShowManualEntry(true)}>
                + Add Manual Incident
              </button>
            ) : (
              <ManualIncidentForm
                token={auth.access}
                onCreated={handleReload}
                onClose={() => setShowManualEntry(false)}
              />
            )}
          </section>
        ) : null}
      </>
    );
  } else if (activeView === "incoming") {
    content = (
      <ReportsListSection
        title={config.incomingTitle}
        subtitle="All emergency reports · every response unit can view and manually respond"
        reports={sortedReports}
        allReports={reports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        config={config}
        responsesByReport={responsesByReport}
        showPriorityBadge
        role={config.role}
      />
    );
  } else if (activeView === "priority") {
    content = (
      <ReportsListSection
        title={config.priorityTitle}
        subtitle={`${priorityReports.length} suggested matches · does not hide other reports`}
        reports={priorityReports.length ? priorityReports : sortedReports}
        allReports={reports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        config={config}
        responsesByReport={responsesByReport}
        showPriorityBadge
        role={config.role}
        emptyTitle="No keyword matches yet"
        emptyMessage="All incidents remain available under Incoming Reports."
      />
    );
  } else if (activeView === "map") {
    content = <IncidentMapPanel reports={reports} />;
  } else if (activeView === "active") {
    content = (
      <ReportsListSection
        title={config.activeTitle}
        subtitle={`${activeReports.length} active · ${unitResponses.length} with ${config.defaultUnit} response logged`}
        reports={activeReports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter="ALL"
        onFilterChange={() => {}}
        config={config}
        responsesByReport={responsesByReport}
        showFilters={false}
        showPriorityBadge
        role={config.role}
        emptyTitle="No active responses"
        emptyMessage="Accepted, dispatched, and in-progress incidents appear here."
      />
    );
  } else if (activeView === "history") {
    content = (
      <>
        <ReportsListSection
          title={`${config.role} Response History`}
          reports={historyReports}
          token={auth.access}
          busy={busy}
          error={error}
          onReload={handleReload}
          statusFilter="ALL"
          onFilterChange={() => {}}
          config={config}
          responsesByReport={responsesByReport}
          showFilters={false}
          emptyTitle="No closed incidents yet"
          emptyMessage="Resolved and cancelled reports appear here."
        />
        <ActivityLogSection statusHistory={statusHistory} title="Status History" />
      </>
    );
  }

  return (
    <DashboardLayout
      config={config}
      username={auth.username}
      role={auth.role}
      activeView={activeView}
      onViewChange={setActiveView}
      onSignOut={onSignOut}
    >
      {content}
    </DashboardLayout>
  );
}

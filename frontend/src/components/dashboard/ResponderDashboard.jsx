import { useMemo, useState } from "react";
import DashboardLayout from "./DashboardLayout";
import CommandCenter from "./CommandCenter";
import ReportsListSection from "./ReportsListSection";
import IncidentMapPanel from "./IncidentMapPanel";
import ActivityLogSection from "./AdminPanels";
import ManualIncidentForm from "./ManualIncidentForm";
import { useDashboardData } from "../../hooks/useDashboardData";
import {
  filterHistoryReports,
  filterPriorityReports,
  filterUnitActiveReports,
  sortReportsWithPriority,
  displayUnitName,
} from "../../utils/reportPriority";

const LEGACY_HOME_VIEWS = ["fire-response", "police-response"];

function resolveStaffView(viewId, setReportFilter) {
  if (LEGACY_HOME_VIEWS.includes(viewId)) {
    return "command-center";
  }
  if (viewId === "priority") {
    setReportFilter("PRIORITY");
    return "reports";
  }
  if (viewId === "incoming") {
    setReportFilter("ALL");
    return "reports";
  }
  return viewId;
}

export default function ResponderDashboard({ auth, onSignOut }) {
  const config = auth.config;
  const [activeView, setActiveView] = useState(() =>
    resolveStaffView(config.homeView, () => {})
  );
  const [reportFilter, setReportFilter] = useState("ALL");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showManualForm, setShowManualForm] = useState(false);

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
  const unitActiveReports = useMemo(
    () => filterUnitActiveReports(reports, responsesByReport, config.defaultUnit),
    [reports, responsesByReport, config.defaultUnit]
  );
  const historyReports = useMemo(() => filterHistoryReports(reports), [reports]);

  function handleReload() {
    setRefreshNonce((n) => n + 1);
    return reload();
  }

  function handleViewChange(viewId) {
    setActiveView(resolveStaffView(viewId, setReportFilter));
  }

  function openReports(filter = "ALL") {
    setReportFilter(filter);
    setActiveView("reports");
  }

  const isHome = activeView === "command-center";

  let content = null;

  if (isHome) {
    content = (
      <CommandCenter
        config={config}
        reports={reports}
        statusHistory={statusHistory}
        priorityCount={priorityReports.length}
        unitActiveCount={unitActiveReports.length}
        historyCount={historyReports.length}
        onOpenReports={openReports}
        onOpenMap={() => handleViewChange("map")}
        onOpenActive={() => handleViewChange("active")}
        onOpenHistory={() => handleViewChange("history")}
      />
    );
  } else if (activeView === "reports") {
    content = (
      <ReportsListSection
        title={config.reportsTitle || "Emergency Reports"}
        subtitle="Monitor and respond to incoming emergency incidents"
        reports={sortedReports}
        allReports={reports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter={reportFilter}
        onFilterChange={setReportFilter}
        config={config}
        responsesByReport={responsesByReport}
        statusHistory={statusHistory}
        role={config.role}
        queueLayout
      />
    );
  } else if (activeView === "map") {
    content = <IncidentMapPanel reports={reports} title="Incident Map" />;
  } else if (activeView === "active") {
    content = (
      <ReportsListSection
        title={config.activeTitle}
        subtitle={`${unitActiveReports.length} incident${unitActiveReports.length === 1 ? "" : "s"} currently handled by ${displayUnitName(config.defaultUnit)}`}
        reports={unitActiveReports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter="ALL"
        onFilterChange={() => {}}
        config={config}
        responsesByReport={responsesByReport}
        showFilters={false}
        showPriorityBadge={false}
        role={config.role}
        actionsMode="monitor"
        emptyTitle="No active responses for your unit yet."
        emptyMessage="Reports accepted or handled by your unit will appear here."
        emptyActionLabel="Go to Emergency Reports"
        onEmptyAction={() => openReports("ALL")}
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

  const headerActions =
    isHome && config.showManualEntry ? (
      <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowManualForm(true)}>
        + Add Manual Incident
      </button>
    ) : null;

  return (
    <DashboardLayout
      config={config}
      username={auth.username}
      role={auth.role}
      activeView={activeView}
      onViewChange={handleViewChange}
      onSignOut={onSignOut}
      pageTitle={isHome ? config.commandCenterTitle : undefined}
      pageTagline={isHome ? config.commandCenterTagline : undefined}
      headerActions={headerActions}
    >
      {content}
      {isHome && config.showManualEntry && showManualForm ? (
        <ManualIncidentForm
          token={auth.access}
          onCreated={() => {
            handleReload();
            setShowManualForm(false);
          }}
          onClose={() => setShowManualForm(false)}
        />
      ) : null}
    </DashboardLayout>
  );
}

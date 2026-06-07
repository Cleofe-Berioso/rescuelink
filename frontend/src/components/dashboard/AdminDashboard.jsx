import { useState } from "react";
import DashboardLayout from "./DashboardLayout";
import ReportsListSection from "./ReportsListSection";
import IncidentMapPanel from "./IncidentMapPanel";
import ActivityLogSection, { AdminStatsGrid, PlaceholderPanel } from "./AdminPanels";
import AdminUsersPanel from "./AdminUsersPanel";
import AdminSettingsPanel from "./AdminSettingsPanel";
import { useDashboardData } from "../../hooks/useDashboardData";
import { filterActiveReports } from "../../utils/reportPriority";

export default function AdminDashboard({ auth, onSignOut }) {
  const config = auth.config;
  const [activeView, setActiveView] = useState(config.homeView);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { reports, statusHistory, responsesByReport, busy, error, reload } = useDashboardData(
    auth.access,
    refreshNonce
  );

  function handleReload() {
    setRefreshNonce((n) => n + 1);
    return reload();
  }

  let content = null;

  if (activeView === "dashboard") {
    content = (
      <>
        <AdminStatsGrid reports={reports} />
        <div className="dashboard-grid">
          <ReportsListSection
            title="Recent Incident Records"
            subtitle={`Monitoring ${reports.length} total records · read-only`}
            reports={reports.slice(0, 8)}
            allReports={reports}
            token={auth.access}
            busy={busy}
            error={error}
            onReload={handleReload}
            statusFilter="ALL"
            onFilterChange={() => {}}
            config={config}
            responsesByReport={responsesByReport}
            showFilters={false}
          />
          <IncidentMapPanel reports={reports} title="System Incident Map" />
        </div>
        <ActivityLogSection statusHistory={statusHistory} limit={12} />
      </>
    );
  } else if (activeView === "users") {
    content = <AdminUsersPanel token={auth.access} />;
  } else if (activeView === "incidents") {
    content = (
      <ReportsListSection
        title="All Incident Records"
        reports={reports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        config={config}
        responsesByReport={responsesByReport}
      />
    );
  } else if (activeView === "reports") {
    content = (
      <>
        <AdminStatsGrid reports={reports} />
        <PlaceholderPanel
          title="Reports & Analytics"
          message="Summary statistics are generated from live incident records. Export and advanced analytics can be added when reporting endpoints are available."
        />
        <div className="analytics-grid">
          <article className="card">
            <h3>Response Units Active</h3>
            <p className="card__desc">
              {Object.keys(responsesByReport).length} incident(s) have at least one unit response logged.
            </p>
          </article>
          <article className="card">
            <h3>Open Incidents</h3>
            <p className="card__desc">
              {filterActiveReports(reports).length} incident(s) currently accepted, dispatched, or in progress.
            </p>
          </article>
        </div>
      </>
    );
  } else if (activeView === "activity") {
    content = <ActivityLogSection statusHistory={statusHistory} />;
  } else if (activeView === "settings") {
    content = <AdminSettingsPanel token={auth.access} />;
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

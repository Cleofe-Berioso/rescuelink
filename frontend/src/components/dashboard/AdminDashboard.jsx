import { useState } from "react";
import DashboardLayout from "./DashboardLayout";
import ReportsListSection from "./ReportsListSection";
import IncidentMapPanel from "./IncidentMapPanel";
import ActivityLogSection, { AdminStatsGrid } from "./AdminPanels";
import AdminUsersPanel from "./AdminUsersPanel";
import AdminSettingsPanel from "./AdminSettingsPanel";
import { useDashboardData } from "../../hooks/useDashboardData";

function resolveAdminView(viewId) {
  if (viewId === "reports") {
    return "dashboard";
  }
  return viewId;
}

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

  function handleViewChange(viewId) {
    setActiveView(resolveAdminView(viewId));
  }

  let content = null;

  if (activeView === "dashboard") {
    content = (
      <>
        <AdminStatsGrid reports={reports} />
        <section className="card home-quick-links">
          <span className="card__eyebrow">Quick navigation</span>
          <h2>Administration</h2>
          <p className="card__desc">
            Monitor system-wide incidents, manage staff accounts, and review audit activity.
          </p>
          <div className="home-quick-links__grid">
            <button type="button" className="btn btn--primary" onClick={() => handleViewChange("incidents")}>
              Emergency Reports ({reports.length})
            </button>
            <button type="button" className="btn btn--outline" onClick={() => handleViewChange("users")}>
              Users
            </button>
            <button type="button" className="btn btn--outline" onClick={() => handleViewChange("map")}>
              Map
            </button>
            <button type="button" className="btn btn--outline" onClick={() => handleViewChange("activity")}>
              Activity Log
            </button>
          </div>
        </section>
        <IncidentMapPanel reports={reports} title="System incident map preview" compact />
        <ActivityLogSection statusHistory={statusHistory} limit={12} title="Recent Activity" />
      </>
    );
  } else if (activeView === "users") {
    content = <AdminUsersPanel token={auth.access} />;
  } else if (activeView === "incidents") {
    content = (
      <ReportsListSection
        title={config.reportsTitle || "Emergency Reports"}
        subtitle="Monitor and respond to incoming emergency incidents"
        reports={reports}
        token={auth.access}
        busy={busy}
        error={error}
        onReload={handleReload}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        config={config}
        responsesByReport={responsesByReport}
        statusHistory={statusHistory}
        role="ADMIN"
        queueLayout
      />
    );
  } else if (activeView === "map") {
    content = <IncidentMapPanel reports={reports} title="System Incident Map" />;
  } else if (activeView === "activity") {
    content = <ActivityLogSection statusHistory={statusHistory} title="Activity Log" />;
  } else if (activeView === "settings") {
    content = <AdminSettingsPanel token={auth.access} />;
  }

  return (
    <DashboardLayout
      config={config}
      username={auth.username}
      role={auth.role}
      activeView={activeView}
      onViewChange={handleViewChange}
      onSignOut={onSignOut}
    >
      {content}
    </DashboardLayout>
  );
}

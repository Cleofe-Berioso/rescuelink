import { useMemo } from "react";
import SummaryCards from "../SummaryCards";
import IncidentMapPanel from "./IncidentMapPanel";
import RecentActivityTable from "./RecentActivityTable";
import { displayUnitName } from "../../utils/reportPriority";
import "./CommandCenter.css";

export default function CommandCenter({
  config,
  reports,
  statusHistory,
  priorityCount,
  unitActiveCount,
  historyCount,
  onOpenReports,
  onOpenMap,
  onOpenActive,
  onOpenHistory,
}) {
  const reportsById = useMemo(() => {
    const map = {};
    for (const report of reports) {
      map[report.id] = report;
    }
    return map;
  }, [reports]);

  return (
    <div className="command-center">
      <SummaryCards reports={reports} onViewFilter={onOpenReports} />

      <div className="command-center__grid">
        <div className="command-center__left">
          <section
            className={`card priority-watch${priorityCount ? "" : " priority-watch--empty"}`}
          >
            <div className="priority-watch__header-row">
              <div>
                <span className="card__eyebrow card__eyebrow--alert">Priority Watch</span>
                <h2>Priority Watch</h2>
              </div>
              <button
                type="button"
                className="priority-watch__link"
                onClick={() => onOpenReports("PRIORITY")}
              >
                Open Priority Filter
              </button>
            </div>
            <div className="priority-watch__body">
              <div>
                {priorityCount > 0 ? (
                  <>
                    <p className="priority-watch__count">{priorityCount}</p>
                    <p className="card__desc">
                      Priority report{priorityCount === 1 ? "" : "s"} requiring manual review
                    </p>
                  </>
                ) : (
                  <p className="card__desc">No priority reports at the moment.</p>
                )}
              </div>
              {priorityCount > 0 ? (
                <span className="priority-watch__alert" aria-hidden="true">
                  ⚠
                </span>
              ) : null}
            </div>
          </section>

          <section className="card quick-actions">
            <span className="card__eyebrow">Quick Actions</span>
            <h2>Quick Actions</h2>
            <p className="card__desc">
              Shortcuts for {displayUnitName(config.defaultUnit)} response workflow
            </p>
            <div className="quick-actions__grid">
              <button
                type="button"
                className="quick-actions__btn quick-actions__btn--primary"
                onClick={() => onOpenReports("ALL")}
              >
                View Emergency Reports
              </button>
              <button
                type="button"
                className="quick-actions__btn"
                onClick={() => onOpenReports("PRIORITY")}
              >
                Priority Filter
              </button>
              <button type="button" className="quick-actions__btn" onClick={onOpenActive}>
                Active Responses ({unitActiveCount})
              </button>
              <button type="button" className="quick-actions__btn" onClick={onOpenHistory}>
                View History ({historyCount})
              </button>
            </div>
          </section>
        </div>

        <div className="command-center__right">
          <IncidentMapPanel
            reports={reports}
            title="Incident Map Preview"
            preview
            showLegend
            onOpenFullMap={onOpenMap}
          />
        </div>
      </div>

      <RecentActivityTable
        statusHistory={statusHistory}
        reportsById={reportsById}
        limit={5}
        onViewFull={onOpenHistory}
      />
    </div>
  );
}

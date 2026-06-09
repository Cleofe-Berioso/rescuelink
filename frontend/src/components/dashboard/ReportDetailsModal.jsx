import { useEffect } from "react";
import ReportDetailsContent from "./ReportDetailsPanel";

export default function ReportDetailsModal({
  report,
  onClose,
  token,
  config,
  unitResponses = [],
  statusHistory = [],
  onChanged,
  actionsMode = "full",
}) {
  useEffect(() => {
    if (!report || !onClose) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [report, onClose]);

  if (!report) return null;

  return (
    <div className="report-details-modal" role="presentation">
      <button
        type="button"
        className="report-details-modal__backdrop"
        aria-label="Close report details"
        onClick={onClose}
      />
      <div
        className="report-details-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-details-title"
      >
        <ReportDetailsContent
          report={report}
          token={token}
          config={config}
          unitResponses={unitResponses}
          statusHistory={statusHistory}
          onClose={onClose}
          onChanged={onChanged}
          actionsMode={actionsMode}
        />
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import ErrorMessage from "../ErrorMessage";
import { respondToReport, updateReportStatus } from "../../api";
import {
  getAllowedStatusOptions,
  getDispatchTeamState,
  isRespondBlocked,
  TERMINAL_STATUSES,
  validateStatusTransition,
  canDispatchTeam,
  displayUnitName,
  hasUnitResponded,
} from "../../utils/reportPriority";
import UnitResponsesPanel from "./UnitResponses";

const STATUS_LABELS = {
  PENDING: "Pending",
  VIEWED: "Viewed",
  ACCEPTED: "Accepted",
  DISPATCHED: "Dispatched",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export default function ReportActions({
  token,
  report,
  defaultUnit,
  roleLabel,
  existingResponses = [],
  onChanged,
  mode = "full",
  showUnitPanel = true,
}) {
  const unit = defaultUnit;
  const isMonitorMode = mode === "monitor";
  const [status, setStatus] = useState(report.status);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const respondBlocked = isRespondBlocked(report.status);
  const dispatchState = getDispatchTeamState(report.status);
  const unitAlreadyResponded = hasUnitResponded(existingResponses, unit);
  const allowedStatusOptions = useMemo(
    () => getAllowedStatusOptions(report.status),
    [report.status]
  );

  useEffect(() => {
    setStatus(report.status);
  }, [report.status]);

  useEffect(() => {
    if (!allowedStatusOptions.includes(status)) {
      setStatus(report.status);
    }
  }, [allowedStatusOptions, report.status, status]);

  async function doAccept() {
    if (respondBlocked || unitAlreadyResponded) {
      if (unitAlreadyResponded) {
        setErr(
          `Your unit (${displayUnitName(unit)}) has already accepted this incident. You can update status or add follow-up notes below.`
        );
      }
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const noteText = notes.trim() || `Accepted by ${unit} from ${roleLabel}`;
      await respondToReport(token, report.id, unit, noteText);
      onChanged();
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function doDispatch() {
    const currentStatus = report.status;
    if (respondBlocked) return;

    if (!canDispatchTeam(currentStatus)) {
      const message =
        dispatchState.notice ||
        `Cannot dispatch team while report status is ${STATUS_LABELS[currentStatus] || currentStatus}.`;
      setErr(message);
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const noteText = notes.trim() || `${unit} team dispatched from ${roleLabel}`;
      await updateReportStatus(token, report.id, "DISPATCHED", noteText, currentStatus);
      setStatus("DISPATCHED");
      onChanged();
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function doStatusUpdate() {
    const currentStatus = report.status;
    const { valid, message } = validateStatusTransition(currentStatus, status);
    if (!valid) {
      setErr(message);
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const noteText = notes.trim() || `Status set to ${status} from ${roleLabel}`;
      await updateReportStatus(token, report.id, status, noteText, currentStatus);
      onChanged();
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  const acceptLabel = busy
    ? "Working…"
    : unitAlreadyResponded
      ? `Already responded (${displayUnitName(unit)})`
      : "Accept / Respond";

  return (
    <div className="report-actions">
      {showUnitPanel ? (
        <UnitResponsesPanel responses={existingResponses} currentUnit={unit} report={report} />
      ) : null}

      {!isMonitorMode ? (
      <div className="report-actions__section">
        <p className="report-actions__hint">
          
        </p>
        {respondBlocked ? (
          <p className="report-actions__blocked" role="status">
            Accept/Respond and Dispatch are disabled because this report is{" "}
            {report.status === "RESOLVED" ? "resolved" : "cancelled"}.
          </p>
        ) : null}
        {!respondBlocked && unitAlreadyResponded ? (
          <p className="report-actions__notice" role="status">
            Accepted by your unit ({displayUnitName(unit)}). You can update status or add follow-up notes
            below.
          </p>
        ) : null}
        {!respondBlocked && !unitAlreadyResponded && dispatchState.notice ? (
          <p className="report-actions__notice" role="status">
            {dispatchState.notice}
          </p>
        ) : null}
        <label className="field field--full">
          <span className="field__label">Responding unit</span>
          <select value={unit} disabled aria-readonly="true">
            <option value={unit}>{displayUnitName(unit)}</option>
          </select>
        </label>
        <label className="field field--full">
          <span className="field__label">Response notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this response or dispatch…"
            rows={2}
            disabled={busy}
          />
        </label>
        <div className="report-actions__quick">
          <button
            type="button"
            className="btn btn--emergency btn--sm"
            onClick={doAccept}
            disabled={busy || respondBlocked || unitAlreadyResponded}
          >
            {acceptLabel}
          </button>
          {dispatchState.showButton ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={doDispatch}
              disabled={busy || respondBlocked || !dispatchState.enabled}
            >
              {busy ? "Working…" : dispatchState.label}
            </button>
          ) : null}
        </div>
      </div>
      ) : (
        <p className="report-actions__hint">
          Monitoring incident handled by {displayUnitName(unit)}. Use status update below to progress or
          close this report. To accept new incidents, go to Emergency Reports.
        </p>
      )}

      <div className="report-actions__section">
        <p className="report-actions__heading">Status update</p>
        {TERMINAL_STATUSES.includes(report.status) ? (
          <p className="report-actions__hint">
            {report.status === "RESOLVED" ? "Incident Resolved" : "Incident Cancelled"}. Status cannot
            be changed.
          </p>
        ) : report.status === "IN_PROGRESS" ? (
          <p className="report-actions__hint">
            {isMonitorMode ? "Incident Status: In Progress" : "Response In Progress"}. You may mark this
            incident as Resolved or Cancelled.
          </p>
        ) : isMonitorMode ? (
          <p className="report-actions__hint">
            Incident Status: {STATUS_LABELS[report.status] || report.status}
          </p>
        ) : null}
        <div className="report-actions__group">
          <label className="field field--inline">
            <span className="field__label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
              {allowedStatusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={doStatusUpdate}
            disabled={busy || TERMINAL_STATUSES.includes(report.status)}
          >
            Update Status
          </button>
        </div>
      </div>

      <ErrorMessage message={err} />
    </div>
  );
}

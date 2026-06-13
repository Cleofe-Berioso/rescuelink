import { useEffect, useState } from "react";
import ErrorMessage from "../ErrorMessage";
import { setReportRiskLevel } from "../../api";

const RISK_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function ChangeRiskLevelForm({ token, report, onChanged }) {
  const [riskLevel, setRiskLevel] = useState(report.risk_level || report.priority_level || "LOW");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRiskLevel(report.risk_level || report.priority_level || "LOW");
    setReason("");
    setError("");
  }, [report?.id, report?.risk_level, report?.priority_level]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setReportRiskLevel(token, report.id, riskLevel, reason);
      setReason("");
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="risk-level-form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Risk level</span>
        <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
          {RISK_OPTIONS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--full">
        <span className="field__label">Reason for change</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Required for HIGH or CRITICAL"
        />
      </label>
      <ErrorMessage message={error} />
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
        {busy ? "Saving…" : "Save Risk Level"}
      </button>
    </form>
  );
}

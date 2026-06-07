import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchReports, fetchResponses, fetchStatusHistory } from "../api";

export function useDashboardData(token, refreshNonce = 0) {
  const [reports, setReports] = useState([]);
  const [responses, setResponses] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [reportData, responseData, historyData] = await Promise.all([
        fetchReports(token),
        fetchResponses(token),
        fetchStatusHistory(token),
      ]);
      setReports(reportData);
      setResponses(responseData);
      setStatusHistory(historyData);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, [load, refreshNonce]);

  const responsesByReport = useMemo(() => {
    const map = {};
    for (const item of responses) {
      const reportId = item.emergency_report;
      if (!map[reportId]) map[reportId] = [];
      map[reportId].push(item);
    }
    return map;
  }, [responses]);

  return {
    reports,
    responses,
    statusHistory,
    responsesByReport,
    busy,
    error,
    reload: load,
  };
}

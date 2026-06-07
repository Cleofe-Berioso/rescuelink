export function filterReportsByStatus(reports, filterKey) {
  if (filterKey === "ALL") return reports;
  if (filterKey === "PENDING") {
    return reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED");
  }
  return reports.filter((r) => r.status === filterKey);
}

export function buildFilterCounts(reports) {
  return {
    ALL: reports.length,
    PENDING: reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED").length,
    ACCEPTED: reports.filter((r) => r.status === "ACCEPTED").length,
    DISPATCHED: reports.filter((r) => r.status === "DISPATCHED").length,
    IN_PROGRESS: reports.filter((r) => r.status === "IN_PROGRESS").length,
    RESOLVED: reports.filter((r) => r.status === "RESOLVED").length,
    CANCELLED: reports.filter((r) => r.status === "CANCELLED").length,
  };
}

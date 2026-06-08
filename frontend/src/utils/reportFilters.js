import { filterPriorityReports } from "./reportPriority";

export function filterReportsByStatus(reports, filterKey, role = null) {
  if (filterKey === "ALL") return reports;
  if (filterKey === "NEEDS_RESPONSE") {
    return reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED");
  }
  if (filterKey === "PRIORITY") {
    return filterPriorityReports(reports);
  }
  if (filterKey === "PENDING") {
    return reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED");
  }
  return reports.filter((r) => r.status === filterKey);
}

export function buildFilterCounts(reports, _role = null) {
  const priorityCount = filterPriorityReports(reports).length;
  return {
    ALL: reports.length,
    NEEDS_RESPONSE: reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED").length,
    PRIORITY: priorityCount,
    PENDING: reports.filter((r) => r.status === "PENDING" || r.status === "VIEWED").length,
    ACCEPTED: reports.filter((r) => r.status === "ACCEPTED").length,
    DISPATCHED: reports.filter((r) => r.status === "DISPATCHED").length,
    IN_PROGRESS: reports.filter((r) => r.status === "IN_PROGRESS").length,
    RESOLVED: reports.filter((r) => r.status === "RESOLVED").length,
    CANCELLED: reports.filter((r) => r.status === "CANCELLED").length,
  };
}

export function getFilterSubtitle(filterKey, counts, role) {
  if (filterKey === "PRIORITY") {
    const matchCount = counts.PRIORITY ?? 0;
    if (matchCount === 0) {
      return "0 AI-priority reports · showing all reports";
    }
    return `${matchCount} AI-priority report${matchCount === 1 ? "" : "s"}`;
  }
  if (filterKey === "NEEDS_RESPONSE") {
    const count = counts.NEEDS_RESPONSE ?? 0;
    return `${count} report${count === 1 ? "" : "s"} awaiting review or response`;
  }
  return null;
}

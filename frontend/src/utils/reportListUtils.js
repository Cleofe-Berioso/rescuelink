import { LEVEL_RANK, STATUS_ORDER } from "./reportPriority";

export const REPORT_PAGE_SIZE = 10;

export const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "priority", label: "Priority First" },
  { key: "critical", label: "Critical First" },
  { key: "status", label: "Status" },
];

function reportSearchText(report) {
  return [
    report?.id,
    report?.emergency_description,
    report?.address_text,
    report?.contact_number,
    report?.reporter?.username,
    report?.detected_incident_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function searchReports(reports, query) {
  const term = (query || "").trim().toLowerCase();
  if (!term) return reports;
  return reports.filter((report) => reportSearchText(report).includes(term));
}

export function sortReports(reports, sortKey, _role = null) {
  const list = [...reports];
  if (sortKey === "oldest") {
    return list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  if (sortKey === "priority") {
    return list.sort((a, b) => {
      const aP = a.is_priority ? 1 : 0;
      const bP = b.is_priority ? 1 : 0;
      if (bP !== aP) return bP - aP;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  if (sortKey === "critical") {
    return list.sort((a, b) => {
      const aC = LEVEL_RANK[(a.critical_level || "LOW").toUpperCase()] ?? 0;
      const bC = LEVEL_RANK[(b.critical_level || "LOW").toUpperCase()] ?? 0;
      if (bC !== aC) return bC - aC;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  if (sortKey === "status") {
    return list.sort((a, b) => {
      const aS = STATUS_ORDER[a.status] ?? -1;
      const bS = STATUS_ORDER[b.status] ?? -1;
      if (aS !== bS) return aS - bS;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function paginateReports(reports, page, pageSize = REPORT_PAGE_SIZE) {
  const total = reports.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return {
    items: reports.slice(start, end),
    page: safePage,
    totalPages,
    total,
    start: total ? start + 1 : 0,
    end,
  };
}

function truncateText(text, max = 120) {
  const value = (text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

export function getReportTitle(report) {
  const type = report?.detected_incident_type;
  if (type) {
    const normalized = type.charAt(0).toUpperCase() + type.slice(1);
    if (!report?.emergency_description?.toLowerCase().includes(type.toLowerCase())) {
      return normalized;
    }
  }
  return truncateText(report?.emergency_description, 80) || `Report #${report?.id}`;
}

export function getReportLocation(report) {
  if (report?.address_text) return report.address_text;
  if (report?.latitude != null && report?.longitude != null) {
    return `${report.latitude}, ${report.longitude}`;
  }
  return "Location unavailable";
}

export function formatRelativeTime(iso) {
  if (!iso) return "—";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } catch {
    return iso;
  }
}

export function getPageNumbers(current, totalPages, maxButtons = 5) {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

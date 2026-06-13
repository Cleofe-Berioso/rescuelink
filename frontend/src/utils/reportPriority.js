const UNIT_KEYWORDS = {
  DRRM: [
    "flood",
    "flooding",
    "landslide",
    "earthquake",
    "trapped",
    "evacuat",
    "disaster",
    "rescue",
    "typhoon",
    "storm surge",
    "collapse",
    "drown",
    "accident",
    "crash",
    "collision",
  ],
  BFP: [
    "fire",
    "smoke",
    "burn",
    "burning",
    "gas leak",
    "electrical",
    "flame",
    "explosion",
    "arson",
  ],
  POLICE: [
    "crime",
    "violence",
    "violent",
    "threat",
    "accident",
    "crash",
    "collision",
    "suspicious",
    "missing",
    "safety",
    "theft",
    "robbery",
    "assault",
    "stabbing",
    "shooting",
    "traffic",
    "fight",
    "crime",
  ],
};

export const RESPONDER_UNITS = ["DRRM", "BFP", "POLICE"];

export const TERMINAL_STATUSES = ["RESOLVED", "CANCELLED"];

function reportText(report) {
  return `${report?.emergency_description || ""} ${report?.address_text || ""}`.toLowerCase();
}

export function getSuggestedUnits(report) {
  const text = reportText(report);
  return RESPONDER_UNITS.filter((unit) =>
    UNIT_KEYWORDS[unit].some((keyword) => text.includes(keyword))
  );
}

export function getPriorityMatch(report, role) {
  if (!report?.emergency_description || !UNIT_KEYWORDS[role]) {
    return false;
  }
  return UNIT_KEYWORDS[role].some((keyword) => reportText(report).includes(keyword));
}

export const LEVEL_RANK = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export function getReportSuggestedUnits(report) {
  if (Array.isArray(report?.suggested_units) && report.suggested_units.length) {
    return report.suggested_units;
  }
  return getSuggestedUnits(report);
}

export function sortReportsWithPriority(reports, role) {
  return [...reports].sort((a, b) => {
    const aPriority = a.is_priority ? 1 : 0;
    const bPriority = b.is_priority ? 1 : 0;
    const aCritical = LEVEL_RANK[(a.critical_level || "LOW").toUpperCase()] ?? 0;
    const bCritical = LEVEL_RANK[(b.critical_level || "LOW").toUpperCase()] ?? 0;
    const aSuggested = getReportSuggestedUnits(a).length;
    const bSuggested = getReportSuggestedUnits(b).length;
    const aRole = getPriorityMatch(a, role) ? 1 : 0;
    const bRole = getPriorityMatch(b, role) ? 1 : 0;

    if (bPriority !== aPriority) return bPriority - aPriority;
    if (bCritical !== aCritical) return bCritical - aCritical;
    if (bRole !== aRole) return bRole - aRole;
    if (bSuggested !== aSuggested) return bSuggested - aSuggested;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

export function filterPriorityReports(reports, _role = null) {
  return reports.filter((report) => Boolean(report?.is_priority));
}

export function isPriorityReport(report) {
  return Boolean(report?.is_priority);
}

export function hasRiskAssessment(report) {
  const level = (report?.risk_level || report?.priority_level || "LOW").toUpperCase();
  return level !== "LOW" || Boolean(report?.risk_reason);
}

/** @deprecated Use hasRiskAssessment */
export function hasAiAnalysis(report) {
  return hasRiskAssessment(report);
}

/** @deprecated Use isPriorityReport */
export function isAiPriorityReport(report) {
  return isPriorityReport(report);
}

export function getCriticalLevelClass(level) {
  const normalized = (level || "LOW").toUpperCase();
  return `critical-badge critical-badge--${normalized.toLowerCase()}`;
}

export function formatPriorityLevel(level) {
  const normalized = (level || "LOW").toUpperCase();
  const labels = {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    CRITICAL: "Critical",
  };
  return labels[normalized] || normalized;
}

export function filterMultiAgencyReports(reports) {
  return reports.filter((report) => getSuggestedUnits(report).length >= 2);
}

export const ACTIVE_STATUSES = ["ACCEPTED", "DISPATCHED", "IN_PROGRESS"];
export const HISTORY_STATUSES = ["RESOLVED", "CANCELLED"];

export function filterActiveReports(reports) {
  return reports.filter((r) => ACTIVE_STATUSES.includes(r.status));
}

export const UNIT_ACTIVE_RESPONSE_STATUSES = ["ACCEPTED", "DISPATCHED", "IN_PROGRESS", "RESPONDING"];

export function normalizeUnit(unit) {
  return (unit || "").toUpperCase();
}

export function normalizeStatus(status) {
  return (status || "").toUpperCase();
}

/**
 * Reports currently handled by a specific unit — requires that unit's response record
 * and a non-terminal incident status.
 */
export function filterUnitActiveReports(reports, responsesByReport, unit) {
  const normalizedUnit = normalizeUnit(unit);
  return reports.filter((report) => {
    if (TERMINAL_STATUSES.includes(report.status)) {
      return false;
    }
    const responses = responsesByReport[report.id] || [];
    const unitResponse = responses.find(
      (item) => normalizeUnit(item.response_unit) === normalizedUnit
    );
    if (!unitResponse) {
      return false;
    }
    const responseStatus = normalizeStatus(unitResponse.response_status);
    const responseIsActive = UNIT_ACTIVE_RESPONSE_STATUSES.includes(responseStatus);
    const reportIsActive = ACTIVE_STATUSES.includes(report.status);
    return responseIsActive && reportIsActive;
  });
}

export function getUnitHandlingStatus(report, responses, unit) {
  const unitResponse = getUnitResponse(responses, unit);
  if (!unitResponse) {
    return "Not yet responded";
  }
  if (ACTIVE_STATUSES.includes(report.status)) {
    return formatResponseStatus(report.status);
  }
  return formatResponseStatus(unitResponse.response_status);
}

export function filterHistoryReports(reports) {
  return reports.filter((r) => HISTORY_STATUSES.includes(r.status));
}

export const STATUS_ORDER = {
  PENDING: 0,
  VIEWED: 1,
  ACCEPTED: 2,
  DISPATCHED: 3,
  IN_PROGRESS: 4,
  RESOLVED: 5,
  CANCELLED: 5,
};

export const DISPATCH_ALLOWED_FROM = ["PENDING", "VIEWED", "ACCEPTED"];

export const ALL_STATUSES = [
  "PENDING",
  "VIEWED",
  "ACCEPTED",
  "DISPATCHED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
];

function statusRank(status) {
  return STATUS_ORDER[status] ?? -1;
}

export function canDispatchTeam(status) {
  return DISPATCH_ALLOWED_FROM.includes(status);
}

export function getDispatchTeamState(status) {
  if (status === "RESOLVED") {
    return {
      showButton: false,
      enabled: false,
      label: "Dispatch Team",
      notice: "Incident Resolved",
    };
  }
  if (status === "CANCELLED") {
    return {
      showButton: false,
      enabled: false,
      label: "Dispatch Team",
      notice: "Incident Cancelled",
    };
  }
  if (status === "IN_PROGRESS") {
    return {
      showButton: false,
      enabled: false,
      label: "Dispatch Team",
      notice: "Response In Progress",
    };
  }
  if (status === "DISPATCHED") {
    return {
      showButton: true,
      enabled: false,
      label: "Already Dispatched",
      notice: null,
    };
  }
  if (canDispatchTeam(status)) {
    return {
      showButton: true,
      enabled: true,
      label: "Dispatch Team",
      notice: null,
    };
  }
  return {
    showButton: false,
    enabled: false,
    label: "Dispatch Team",
    notice: null,
  };
}

export function validateStatusTransition(currentStatus, newStatus) {
  if (!ALL_STATUSES.includes(newStatus)) {
    return { valid: false, message: "Invalid status." };
  }
  if (!ALL_STATUSES.includes(currentStatus)) {
    return { valid: false, message: "Report has an invalid current status." };
  }
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return {
      valid: false,
      message: `Cannot change status of a ${currentStatus.toLowerCase()} report.`,
    };
  }
  if (newStatus === currentStatus) {
    return { valid: true, message: "" };
  }
  if (TERMINAL_STATUSES.includes(newStatus)) {
    return { valid: true, message: "" };
  }
  if (statusRank(newStatus) < statusRank(currentStatus)) {
    return {
      valid: false,
      message: `Invalid status transition from ${currentStatus} to ${newStatus}. Backward status changes are not allowed.`,
    };
  }
  return { valid: true, message: "" };
}

export function getAllowedStatusOptions(currentStatus) {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return [currentStatus];
  }
  return ALL_STATUSES.filter((status) => {
    if (status === currentStatus) return true;
    return validateStatusTransition(currentStatus, status).valid;
  });
}

export function isRespondBlocked(status) {
  return TERMINAL_STATUSES.includes(status);
}

export const UNIT_THEME = {
  DRRM: { label: "DRRM", className: "unit-response--drrm" },
  BFP: { label: "BFP", className: "unit-response--bfp" },
  POLICE: { label: "Police", className: "unit-response--police" },
  ADMIN: { label: "Admin", className: "unit-response--admin" },
};

export function displayUnitName(unit) {
  return UNIT_THEME[unit]?.label || unit || "Unknown";
}

export function formatResponseStatus(status) {
  const normalized = (status || "").toUpperCase();
  const labels = {
    ACCEPTED: "Accepted",
    DISPATCHED: "Dispatched",
    RESPONDING: "Responding",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    VIEWED: "Viewed",
    PENDING: "Pending",
  };
  return labels[normalized] || status || "Accepted";
}

export function getUnitResponse(responses, unit) {
  return (responses || []).find((item) => item.response_unit === unit);
}

export function hasUnitResponded(responses, unit) {
  return Boolean(getUnitResponse(responses, unit));
}

export function sortUnitResponses(responses) {
  const order = { DRRM: 0, BFP: 1, POLICE: 2, ADMIN: 3 };
  return [...(responses || [])].sort(
    (a, b) => (order[a.response_unit] ?? 99) - (order[b.response_unit] ?? 99)
  );
}

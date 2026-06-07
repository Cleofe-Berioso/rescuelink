import { canDispatchTeam, validateStatusTransition } from "./utils/reportPriority";
import {
  clearAuth,
  getStoredAccessToken,
  loadStoredAuth,
  updateStoredTokens,
} from "./utils/authStorage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

const RATE_LIMIT_MESSAGE = "Too many requests. Please wait and try again.";

function unwrapList(data) {
  if (Array.isArray(data)) {
    return data;
  }
  return data?.results || [];
}

function formatApiError(data, status) {
  if (status === 429) {
    return RATE_LIMIT_MESSAGE;
  }
  if (!data || typeof data !== "object") {
    return "Request failed.";
  }
  if (typeof data.detail === "string") {
    return data.detail;
  }
  if (Array.isArray(data.detail)) {
    return data.detail.join("\n");
  }
  const parts = Object.entries(data).map(([key, value]) => {
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    return `${key}: ${text}`;
  });
  return parts.join("\n") || "Request failed.";
}

async function parseErrorResponse(res, fallback) {
  const body = await res.json().catch(() => ({}));
  throw new Error(formatApiError(body, res.status) || fallback);
}

export async function formatApiErrorFromResponse(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return formatApiError(body, res.status) || fallback;
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE_URL}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatApiError(body, res.status) || "Login failed.");
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

async function probeAccessToken(accessToken) {
  const res = await fetch(`${API_BASE_URL}/reports/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

export async function validateStoredSession() {
  const stored = loadStoredAuth();
  if (!stored?.access) {
    clearAuth();
    return null;
  }

  if (await probeAccessToken(stored.access)) {
    return stored;
  }

  if (stored.refresh) {
    const refreshed = await refreshAccessToken(stored.refresh);
    if (refreshed?.access && (await probeAccessToken(refreshed.access))) {
      updateStoredTokens(refreshed.access, refreshed.refresh);
      return loadStoredAuth();
    }
  }

  clearAuth();
  return null;
}

function resolveAccessToken(accessToken) {
  return accessToken || getStoredAccessToken();
}

export async function fetchReports(accessToken) {
  const token = resolveAccessToken(accessToken);
  if (!token) {
    throw new Error("Not authenticated.");
  }

  const res = await fetch(`${API_BASE_URL}/reports/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw new Error("Failed to load reports.");
  }

  const data = await res.json();
  return unwrapList(data);
}

export async function createReport(accessToken, payload) {
  const formData = new FormData();
  formData.append("emergency_description", payload.emergency_description);
  formData.append("contact_number", payload.contact_number);
  formData.append("latitude", String(payload.latitude));
  formData.append("longitude", String(payload.longitude));
  formData.append("address_text", payload.address_text || "");
  if (payload.image) {
    formData.append("image", payload.image);
  }

  const res = await fetch(`${API_BASE_URL}/reports/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatApiError(body, res.status) || "Failed to create report.");
  }

  return res.json();
}

export async function respondToReport(accessToken, reportId, response_unit, response_notes = "") {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/respond/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ response_unit, response_notes }),
  });

  if (!res.ok) {
    await parseErrorResponse(res, "Failed to respond to report.");
  }

  return res.json();
}

export async function updateReportStatus(
  accessToken,
  reportId,
  status,
  remarks = "",
  currentStatus = null
) {
  if (currentStatus) {
    if (status === "DISPATCHED" && !canDispatchTeam(currentStatus)) {
      throw new Error(
        `Cannot dispatch team while report status is ${currentStatus.replaceAll("_", " ").toLowerCase()}.`
      );
    }

    const { valid, message } = validateStatusTransition(currentStatus, status);
    if (!valid) {
      throw new Error(message);
    }
  }

  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/update_status/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, remarks }),
  });

  if (!res.ok) {
    await parseErrorResponse(res, "Failed to update status.");
  }

  return res.json();
}

export async function fetchResponses(accessToken) {
  const res = await fetch(`${API_BASE_URL}/responses/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw new Error("Failed to load response records.");
  }
  const data = await res.json();
  return unwrapList(data);
}

export async function fetchStatusHistory(accessToken) {
  const res = await fetch(`${API_BASE_URL}/status-history/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw new Error("Failed to load activity logs.");
  }
  const data = await res.json();
  return unwrapList(data);
}

export { API_BASE_URL };

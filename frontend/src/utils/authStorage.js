import { getDashboardConfig, isStaffRole } from "./roles";

export const AUTH_STORAGE_KEY = "rescuelink_auth";

function readStorage(storage) {
  const raw = storage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.access && parsed?.role && isStaffRole(parsed.role)) {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }

  return null;
}

export function loadStoredAuth() {
  return readStorage(localStorage) || readStorage(sessionStorage);
}

export function saveAuth(data, staySignedIn) {
  const payload = {
    access: data.access,
    refresh: data.refresh || "",
    username: data.username,
    role: data.role,
    user: data.user || null,
    staySignedIn: Boolean(staySignedIn),
  };

  clearAuth();
  const storage = staySignedIn ? localStorage : sessionStorage;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

export function updateStoredTokens(access, refresh) {
  const stored = loadStoredAuth();
  if (!stored) return;

  const next = {
    ...stored,
    access,
    refresh: refresh ?? stored.refresh,
  };

  const storage = stored.staySignedIn ? localStorage : sessionStorage;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function buildAuthState(stored) {
  if (!stored?.access || !stored?.role) return null;

  return {
    access: stored.access,
    refresh: stored.refresh,
    username: stored.username,
    role: stored.role,
    user: stored.user,
    config: getDashboardConfig(stored.role),
    staySignedIn: Boolean(stored.staySignedIn),
  };
}

export function getStoredAccessToken() {
  return loadStoredAuth()?.access || null;
}

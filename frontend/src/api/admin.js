import { API_BASE_URL, formatApiErrorFromResponse } from "../api";

const STAFF_ROLES = ["ADMIN", "DRRM", "BFP", "POLICE"];

async function adminRequest(accessToken, method, path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(await formatApiErrorFromResponse(res, "Admin request failed."));
  }

  if (res.status === 204) {
    return null;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchAdminUsers(accessToken, params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.is_active !== undefined && params.is_active !== "") {
    query.set("is_active", params.is_active);
  }
  const qs = query.toString();
  const path = qs ? `/admin/users/?${qs}` : "/admin/users/";
  return adminRequest(accessToken, "GET", path);
}

export async function createAdminUser(accessToken, payload) {
  return adminRequest(accessToken, "POST", "/admin/users/", payload);
}

export async function updateAdminUser(accessToken, userId, payload) {
  return adminRequest(accessToken, "PATCH", `/admin/users/${userId}/`, payload);
}

export async function deactivateAdminUser(accessToken, userId) {
  return adminRequest(accessToken, "DELETE", `/admin/users/${userId}/`);
}

export async function fetchAdminCategories(accessToken, params = {}) {
  const query = new URLSearchParams();
  if (params.is_active !== undefined && params.is_active !== "") {
    query.set("is_active", params.is_active);
  }
  const qs = query.toString();
  const path = qs ? `/admin/categories/?${qs}` : "/admin/categories/";
  return adminRequest(accessToken, "GET", path);
}

export async function createAdminCategory(accessToken, payload) {
  return adminRequest(accessToken, "POST", "/admin/categories/", payload);
}

export async function updateAdminCategory(accessToken, categoryId, payload) {
  return adminRequest(accessToken, "PATCH", `/admin/categories/${categoryId}/`, payload);
}

export async function deactivateAdminCategory(accessToken, categoryId) {
  return adminRequest(accessToken, "DELETE", `/admin/categories/${categoryId}/`);
}

export { STAFF_ROLES };

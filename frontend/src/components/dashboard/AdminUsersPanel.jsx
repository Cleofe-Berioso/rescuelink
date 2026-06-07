import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "../EmptyState";
import ErrorMessage from "../ErrorMessage";
import LoadingState from "../LoadingState";
import {
  STAFF_ROLES,
  createAdminUser,
  deactivateAdminUser,
  fetchAdminUsers,
  updateAdminUser,
} from "../../api/admin";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  password: "",
  role: "DRRM",
  is_active: true,
};

function displayName(user) {
  const full = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return full || user.username;
}

function UserFormModal({ title, form, onChange, onClose, onSubmit, busy, error, isEdit }) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="card__header card__header--row">
          <h2>{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label className="field">
            <span className="field__label">First name</span>
            <input value={form.first_name} onChange={(e) => onChange({ ...form, first_name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Last name</span>
            <input value={form.last_name} onChange={(e) => onChange({ ...form, last_name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Username</span>
            <input
              value={form.username}
              onChange={(e) => onChange({ ...form, username: e.target.value })}
              disabled={isEdit}
              required={!isEdit}
            />
          </label>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">{isEdit ? "New password (optional)" : "Password"}</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange({ ...form, password: e.target.value })}
              required={!isEdit}
              minLength={isEdit ? 0 : 8}
            />
          </label>
          <label className="field">
            <span className="field__label">Role</span>
            <select value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value })}>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => onChange({ ...form, is_active: e.target.checked })}
            />
            <span>Active account</span>
          </label>
          <ErrorMessage message={error} />
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Staff Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminUsersPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await fetchAdminUsers(token, {
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        is_active: statusFilter,
      });
      setUsers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [token, search, roleFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCount = useMemo(() => users.length, [users]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setModalError("");
    setModal("create");
  }

  function openEdit(user) {
    setForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      username: user.username,
      email: user.email || "",
      password: "",
      role: user.role,
      is_active: user.is_active,
    });
    setModalError("");
    setModal({ type: "edit", id: user.id });
  }

  async function submitForm() {
    setActionBusy(true);
    setModalError("");
    try {
      if (modal === "create") {
        await createAdminUser(token, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          is_active: form.is_active,
        });
      } else if (modal?.type === "edit") {
        const payload = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          role: form.role,
          is_active: form.is_active,
        };
        if (form.password) {
          payload.password = form.password;
        }
        await updateAdminUser(token, modal.id, payload);
      }
      setModal(null);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleActive(user) {
    if (!window.confirm(`${user.is_active ? "Deactivate" : "Activate"} ${user.username}?`)) return;
    setActionBusy(true);
    setError("");
    try {
      if (user.is_active) {
        await deactivateAdminUser(token, user.id);
      } else {
        await updateAdminUser(token, user.id, { is_active: true });
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <section className="card admin-panel">
      <div className="card__header card__header--row">
        <div>
          <span className="card__eyebrow">Administration</span>
          <h2>Staff User Management</h2>
          <p className="card__desc">
            Manage ADMIN, DRRM, BFP, and POLICE accounts. Citizen accounts are managed through mobile registration only.
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
          + Add Staff Account
        </button>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-search"
          placeholder="Search name, username, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      <ErrorMessage message={error} />
      {busy ? <LoadingState message="Loading staff users…" /> : null}

      {!busy && !users.length ? (
        <EmptyState
          icon="👥"
          title="No staff users found"
          message="Create a staff account or adjust your filters."
        />
      ) : null}

      {!busy && users.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{displayName(user)}</td>
                  <td>{user.username}</td>
                  <td>{user.email || "—"}</td>
                  <td>
                    <span className={`role-badge role-badge--${user.role?.toLowerCase()}`}>{user.role}</span>
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${user.is_active ? "active" : "inactive"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="admin-table__actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => toggleActive(user)}
                      disabled={actionBusy}
                    >
                      {user.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="card__desc">{filteredCount} staff account(s) shown</p>
        </div>
      ) : null}

      {modal ? (
        <UserFormModal
          title={modal === "create" ? "Add Staff Account" : "Edit Staff Account"}
          form={form}
          onChange={setForm}
          onClose={() => setModal(null)}
          onSubmit={submitForm}
          busy={actionBusy}
          error={modalError}
          isEdit={modal !== "create"}
        />
      ) : null}
    </section>
  );
}

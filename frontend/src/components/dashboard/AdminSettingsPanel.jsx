import { useCallback, useEffect, useState } from "react";
import EmptyState from "../EmptyState";
import ErrorMessage from "../ErrorMessage";
import LoadingState from "../LoadingState";
import {
  createAdminCategory,
  deactivateAdminCategory,
  fetchAdminCategories,
  updateAdminCategory,
} from "../../api/admin";

const UNIT_OPTIONS = ["DRRM", "BFP", "POLICE"];

const EMPTY_CATEGORY = {
  name: "",
  description: "",
  suggested_units: [],
  is_active: true,
};

function CategoryFormModal({ title, form, onChange, onClose, onSubmit, busy, error, toggleUnit }) {
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
          <label className="field field--full">
            <span className="field__label">Category name</span>
            <input
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="field field--full">
            <span className="field__label">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
            />
          </label>
          <div className="field field--full">
            <span className="field__label">Suggested units (helper only)</span>
            <div className="unit-checkboxes">
              {UNIT_OPTIONS.map((unit) => (
                <label key={unit} className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={form.suggested_units.includes(unit)}
                    onChange={() => toggleUnit(unit)}
                  />
                  <span>{unit}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => onChange({ ...form, is_active: e.target.checked })}
            />
            <span>Active category</span>
          </label>
          <ErrorMessage message={error} />
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Save Category"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminSettingsPanel({ token }) {
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_CATEGORY);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await fetchAdminCategories(token, { is_active: statusFilter });
      setCategories(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm(EMPTY_CATEGORY);
    setModalError("");
    setModal("create");
  }

  function openEdit(category) {
    setForm({
      name: category.name,
      description: category.description || "",
      suggested_units: category.suggested_units || [],
      is_active: category.is_active,
    });
    setModalError("");
    setModal({ type: "edit", id: category.id });
  }

  function toggleUnit(unit) {
    setForm((current) => {
      const exists = current.suggested_units.includes(unit);
      return {
        ...current,
        suggested_units: exists
          ? current.suggested_units.filter((u) => u !== unit)
          : [...current.suggested_units, unit],
      };
    });
  }

  async function submitForm() {
    setActionBusy(true);
    setModalError("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        suggested_units: form.suggested_units,
        is_active: form.is_active,
      };
      if (modal === "create") {
        await createAdminCategory(token, payload);
      } else if (modal?.type === "edit") {
        await updateAdminCategory(token, modal.id, payload);
      }
      setModal(null);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleActive(category) {
    const action = category.is_active ? "deactivate" : "activate";
    if (!window.confirm(`${action} category "${category.name}"?`)) return;
    setActionBusy(true);
    setError("");
    try {
      if (category.is_active) {
        await deactivateAdminCategory(token, category.id);
      } else {
        await updateAdminCategory(token, category.id, { is_active: true });
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
          <span className="card__eyebrow">System Settings</span>
          <h2>Emergency Categories</h2>
          <p className="card__desc admin-notice">
            Suggested units help personnel review reports faster, but dispatch decisions remain manual.
            All reports stay visible to DRRM, BFP, and Police.
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
          + Add Category
        </button>
      </div>

      <div className="admin-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All categories</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      <ErrorMessage message={error} />
      {busy ? <LoadingState message="Loading emergency categories…" /> : null}

      {!busy && !categories.length ? (
        <EmptyState
          icon="⚙️"
          title="No emergency categories"
          message="Add categories to guide staff review. Suggested units never auto-dispatch."
        />
      ) : null}

      {!busy && categories.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Suggested Units</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.name}</td>
                  <td>{category.description || "—"}</td>
                  <td>
                    {(category.suggested_units || []).length ? (
                      <span className="suggested-units-badge">
                        {(category.suggested_units || []).join(", ")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${category.is_active ? "active" : "inactive"}`}>
                      {category.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="admin-table__actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(category)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => toggleActive(category)}
                      disabled={actionBusy}
                    >
                      {category.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modal ? (
        <CategoryFormModal
          title={modal === "create" ? "Add Emergency Category" : "Edit Emergency Category"}
          form={form}
          onChange={setForm}
          onClose={() => setModal(null)}
          onSubmit={submitForm}
          busy={actionBusy}
          error={modalError}
          toggleUnit={toggleUnit}
        />
      ) : null}
    </section>
  );
}

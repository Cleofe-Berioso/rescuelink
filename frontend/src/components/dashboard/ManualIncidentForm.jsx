import { useEffect, useMemo, useState } from "react";
import { createReport } from "../../api";
import ErrorMessage from "../ErrorMessage";
import {
  SILAY_CITY_CENTER_COORDS,
  hasValidCoordinates,
  isSilayCityCenter,
} from "../../utils/mapLocation";

export default function ManualIncidentForm({ token, onCreated, onClose }) {
  const [form, setForm] = useState({
    emergency_description: "",
    contact_number: "",
    latitude: "",
    longitude: "",
    address_text: "",
    image: null,
  });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const [usedSilayPreset, setUsedSilayPreset] = useState(false);
  const [coordsManuallyEdited, setCoordsManuallyEdited] = useState(false);
  const [silayPresetNote, setSilayPresetNote] = useState(false);
  const [approximateSubmitNotice, setApproximateSubmitNotice] = useState(false);

  const locationAccuracy = useMemo(() => {
    const hasAddress = Boolean(form.address_text.trim());
    const hasCoords = hasValidCoordinates(form.latitude, form.longitude);
    const isSilay = hasCoords && isSilayCityCenter(form.latitude, form.longitude);

    if (coordsManuallyEdited && hasCoords && !isSilay) {
      return { key: "exact", label: "Exact GPS" };
    }
    if (hasAddress && (!hasCoords || isSilay || usedSilayPreset)) {
      return { key: "verify", label: "Needs verification" };
    }
    if (usedSilayPreset || isSilay) {
      return { key: "approximate", label: "Approximate" };
    }
    if (!hasCoords) {
      return { key: "verify", label: "Needs verification" };
    }
    return { key: "approximate", label: "Approximate" };
  }, [form.address_text, form.latitude, form.longitude, usedSilayPreset, coordsManuallyEdited]);

  const willUseSilayFallback =
    Boolean(form.address_text.trim()) && !hasValidCoordinates(form.latitude, form.longitude);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleImageChange(e) {
    const file = e.target.files?.[0] || null;
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setForm((s) => ({ ...s, image: file }));
  }

  function applySilayCityCenter() {
    setForm((s) => ({
      ...s,
      latitude: SILAY_CITY_CENTER_COORDS.latitude,
      longitude: SILAY_CITY_CENTER_COORDS.longitude,
    }));
    setUsedSilayPreset(true);
    setCoordsManuallyEdited(false);
    setSilayPresetNote(true);
    setApproximateSubmitNotice(false);
  }

  function handleCoordinateChange(field, value) {
    setCoordsManuallyEdited(true);
    setUsedSilayPreset(false);
    setSilayPresetNote(false);
    setForm((s) => ({ ...s, [field]: value }));
  }

  function resetFormState() {
    setForm({
      emergency_description: "",
      contact_number: "",
      latitude: "",
      longitude: "",
      address_text: "",
      image: null,
    });
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUsedSilayPreset(false);
    setCoordsManuallyEdited(false);
    setSilayPresetNote(false);
    setApproximateSubmitNotice(false);
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setSuccess(false);
    setApproximateSubmitNotice(false);

    let latitude = form.latitude;
    let longitude = form.longitude;

    if (!hasValidCoordinates(latitude, longitude)) {
      latitude = SILAY_CITY_CENTER_COORDS.latitude;
      longitude = SILAY_CITY_CENTER_COORDS.longitude;
      setApproximateSubmitNotice(true);
    }

    setSaving(true);
    try {
      await createReport(token, {
        ...form,
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      resetFormState();
      setSuccess(true);
      onCreated();
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card manual-entry-card">
      <div className="card__header card__header--row">
        <div>
          <span className="card__eyebrow manual-entry-card__eyebrow">Manual Incident Entry</span>
          <h2>Encode Walk-in / Hotline Emergency Report</h2>
          <p className="card__desc">
            For incidents received by phone, walk-in, radio, or hotline — not mobile self-report.
          </p>
        </div>
        {onClose ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <form className="form-section" onSubmit={submit}>
        <div className="form-grid">
          <label className="field field--full">
            <span className="field__label">Emergency description</span>
            <textarea
              value={form.emergency_description}
              onChange={(e) => setForm((s) => ({ ...s, emergency_description: e.target.value }))}
              placeholder="Describe the incident as reported by caller or walk-in…"
              required
            />
          </label>

          <label className="field field--full">
            <span className="field__label">Caller / contact number</span>
            <input
              value={form.contact_number}
              onChange={(e) => setForm((s) => ({ ...s, contact_number: e.target.value }))}
              placeholder="09XX XXX XXXX"
              required
            />
          </label>

          <div className="location-section field--full">
            <div className="location-section__header">
              <span className="field__label">Reported location</span>
              <p className="location-section__helper">
                For hotline or walk-in reports, enter the caller&apos;s stated location, landmark, or
                barangay. Coordinates can be approximate and verified before dispatch.
              </p>
            </div>

            <label className="field field--location-primary">
              <span className="field__label">Address / Landmark / Barangay</span>
              <input
                value={form.address_text}
                onChange={(e) => setForm((s) => ({ ...s, address_text: e.target.value }))}
                placeholder="Example: Barangay Mambulac, near public market, Silay City"
              />
            </label>

            <div className="location-actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={applySilayCityCenter}>
                Use Silay City Center
              </button>
            </div>

            {silayPresetNote ? (
              <p className="location-notice" role="status">
                Approximate location selected. Verify exact location before dispatch.
              </p>
            ) : null}

            {willUseSilayFallback ? (
              <p className="location-warning" role="status">
                No exact coordinates provided. This report will use Silay City Center as an approximate
                location.
              </p>
            ) : null}

            {approximateSubmitNotice ? (
              <p className="location-warning" role="status">
                Submitted with Silay City Center as approximate location. Verify before dispatch.
              </p>
            ) : null}

            <div className="location-accuracy">
              <span className="field__label">Location accuracy</span>
              <span className={`accuracy-badge accuracy-badge--${locationAccuracy.key}`}>
                {locationAccuracy.label}
              </span>
            </div>
          </div>

          <div className="field field--full">
            <span className="field__label">Photo evidence (optional)</span>
            <label className="file-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={handleImageChange}
              />
              <span className="file-upload__box">
                {form.image ? form.image.name : "Choose JPEG, PNG, or WebP image"}
              </span>
            </label>
            {preview ? (
              <div className="image-preview">
                <img src={preview} alt="Upload preview" />
              </div>
            ) : null}
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={saving}>
            {saving ? "Encoding report…" : "Save Manual Incident"}
          </button>
        </div>
      </form>

      {success ? (
        <div className="success-message" role="status">
          Manual incident encoded successfully and added to the live feed.
        </div>
      ) : null}
      <ErrorMessage message={err} />
    </section>
  );
}

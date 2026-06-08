import { useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import MapRecenter from "../MapRecenter";
import { DEFAULT_MAP_ZOOM, getMapCenterFromReports } from "../../utils/mapLocation";

const LEGEND_ITEMS = [
  { status: "IN_PROGRESS", label: "In Progress", color: "#ef4444" },
  { status: "DISPATCHED", label: "Dispatched", color: "#8b5cf6" },
  { status: "ACCEPTED", label: "Accepted", color: "#3b82f6" },
];

function markerStyleForStatus(status) {
  const key = (status || "").toUpperCase();
  if (key === "IN_PROGRESS") {
    return { color: "#dc2626", fillColor: "#ef4444", fillOpacity: 0.92, weight: 2 };
  }
  if (key === "DISPATCHED") {
    return { color: "#7c3aed", fillColor: "#8b5cf6", fillOpacity: 0.92, weight: 2 };
  }
  if (key === "ACCEPTED") {
    return { color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.92, weight: 2 };
  }
  return { color: "#d97706", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 2 };
}

export default function IncidentMapPanel({
  reports,
  title = "Incident Map",
  description,
  preview = false,
  showLegend = false,
  onOpenFullMap,
}) {
  const markers = useMemo(
    () =>
      reports
        .filter((r) => r.latitude && r.longitude)
        .map((r) => ({
          id: r.id,
          position: [Number(r.latitude), Number(r.longitude)],
          text: r.emergency_description,
          status: r.status,
        })),
    [reports]
  );

  const mapCenter = useMemo(() => getMapCenterFromReports(reports), [reports]);

  return (
    <section className={`card map-card${preview ? " map-card--preview" : ""}`}>
      <div className="map-card__header-row card__header">
        <div>
          <span className="card__eyebrow">Geospatial View</span>
          <h2>{title}</h2>
          <p className="card__desc">
            {description ||
              `${markers.length} incident${markers.length !== 1 ? "s" : ""} plotted · all units share this view`}
          </p>
        </div>
        {onOpenFullMap ? (
          <button type="button" className="priority-watch__link" onClick={onOpenFullMap}>
            Open Full Map
          </button>
        ) : null}
      </div>
      <MapContainer center={mapCenter} zoom={DEFAULT_MAP_ZOOM} className="incident-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRecenter center={mapCenter} zoom={DEFAULT_MAP_ZOOM} />
        {markers.map((m) => (
          <CircleMarker
            key={m.id}
            center={m.position}
            radius={preview ? 9 : 11}
            pathOptions={markerStyleForStatus(m.status)}
          >
            <Popup>
              <strong>Report #{m.id}</strong>
              <br />
              {m.status.replace(/_/g, " ")}
              <br />
              {m.text}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {showLegend ? (
        <div className="map-legend" aria-label="Map legend">
          {LEGEND_ITEMS.map((item) => (
            <span key={item.status} className="map-legend__item">
              <span
                className="map-legend__dot"
                style={{ background: item.color }}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

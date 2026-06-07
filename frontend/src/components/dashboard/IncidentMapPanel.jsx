import { useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import MapRecenter from "../MapRecenter";
import { DEFAULT_MAP_ZOOM, getMapCenterFromReports } from "../../utils/mapLocation";

export default function IncidentMapPanel({ reports, title = "Incident Map", description }) {
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
    <section className="card map-card">
      <div className="card__header">
        <span className="card__eyebrow">Geospatial View</span>
        <h2>{title}</h2>
        <p className="card__desc">
          {description ||
            `${markers.length} incident${markers.length !== 1 ? "s" : ""} plotted · all units share this view`}
        </p>
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
            radius={11}
            pathOptions={{ color: "#dc2626", fillColor: "#ef4444", fillOpacity: 0.9, weight: 2 }}
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
    </section>
  );
}

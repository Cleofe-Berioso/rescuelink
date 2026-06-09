import { useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import MapRecenter from "../MapRecenter";
import { DEFAULT_MAP_ZOOM, hasValidCoordinates } from "../../utils/mapLocation";

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

export default function IncidentLocationMap({ report }) {
  const [selectedLayer, setSelectedLayer] = useState("hybrid");

  if (!hasValidCoordinates(report?.latitude, report?.longitude)) {
    return (
      <p className="report-detail-map__unavailable" role="status">
        Location not available.
      </p>
    );
  }

  const lat = Number(report.latitude);
  const lng = Number(report.longitude);
  const center = [lat, lng];
  const zoom = DEFAULT_MAP_ZOOM + 2;

  return (
    <div className="report-detail-map">
      <div style={{ position: "relative" }}>
        <MapContainer
          center={center}
          zoom={zoom}
          className="incident-map incident-map--modal"
          scrollWheelZoom={false}
        >
          {selectedLayer === "street" && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}

          {selectedLayer === "hybrid" && (
            <>
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
              <TileLayer
                attribution='Labels &copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              />
            </>
          )}

          {selectedLayer === "terrain" && (
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            />
          )}

          <MapRecenter center={center} zoom={zoom} />
          <CircleMarker
            center={center}
            radius={12}
            pathOptions={markerStyleForStatus(report.status)}
          >
            <Popup>
              <strong>Report #{report.id}</strong>
            </Popup>
          </CircleMarker>
        </MapContainer>

        <div className="map-layer-selector" aria-label="Select map layer">
          <button
            type="button"
            className={`map-layer-selector__btn ${selectedLayer === "street" ? "map-layer-selector__btn--active" : ""}`}
            onClick={() => setSelectedLayer("street")}
          >
            Street
          </button>
          <button
            type="button"
            className={`map-layer-selector__btn ${selectedLayer === "hybrid" ? "map-layer-selector__btn--active" : ""}`}
            onClick={() => setSelectedLayer("hybrid")}
          >
            Hybrid
          </button>
          <button
            type="button"
            className={`map-layer-selector__btn ${selectedLayer === "terrain" ? "map-layer-selector__btn--active" : ""}`}
            onClick={() => setSelectedLayer("terrain")}
          >
            Terrain
          </button>
        </div>
      </div>
      <p className="report-detail-map__coords">
        {report.latitude}, {report.longitude}
      </p>
    </div>
  );
}


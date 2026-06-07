import { useEffect } from "react";
import { useMap } from "react-leaflet";

export default function MapRecenter({ center, zoom = 13 }) {
  const map = useMap();

  useEffect(() => {
    if (Array.isArray(center) && center.length === 2) {
      map.setView(center, zoom);
    }
  }, [map, center, zoom]);

  return null;
}

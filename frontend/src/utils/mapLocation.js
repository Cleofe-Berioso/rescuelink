export const SILAY_CITY_CENTER = [10.7999, 122.974];

export const SILAY_CITY_CENTER_COORDS = {
  latitude: "10.7999",
  longitude: "122.9740",
};

export const DEFAULT_MAP_ZOOM = 13;

export function isSilayCityCenter(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  return Math.abs(lat - SILAY_CITY_CENTER[0]) < 0.0001 && Math.abs(lng - SILAY_CITY_CENTER[1]) < 0.0001;
}

export function hasValidCoordinates(latitude, longitude) {
  return (
    latitude !== "" &&
    latitude != null &&
    longitude !== "" &&
    longitude != null &&
    !Number.isNaN(Number(latitude)) &&
    !Number.isNaN(Number(longitude))
  );
}

export function getMapCenterFromReports(reports) {
  const validReportsWithLocation = reports.filter(
    (report) =>
      report.latitude &&
      report.longitude &&
      !Number.isNaN(Number(report.latitude)) &&
      !Number.isNaN(Number(report.longitude))
  );

  if (validReportsWithLocation.length === 0) {
    return SILAY_CITY_CENTER;
  }

  const latest = validReportsWithLocation[0];
  return [Number(latest.latitude), Number(latest.longitude)];
}

import { fetchPlacesForBoundingBox } from "../providers/overpass/overpassClient.js";
import { normalizeRawPlaces } from "./normalizeRawPlaces.js";
import ApiError from "../utils/ApiError.js";
import axios from "axios";

async function fetchRawPlacesForDestination(destination) {
  const geoRes = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: { q: destination, format: "json", limit: 1 },
    headers: { "User-Agent": "kairos/1.0" },
  });

  if (!geoRes.data.length) {
    throw new ApiError(400, `Unable to resolve destination: "${destination}"`);
  }

  const [south, north, west, east] = geoRes.data[0].boundingbox.map(Number);
  const lat = parseFloat(geoRes.data[0].lat);
  const lon = parseFloat(geoRes.data[0].lon);

  // Extract OSM ID for Area Querying
  const osmId = geoRes.data[0].osm_id;
  const osmType = geoRes.data[0].osm_type;

  // Calculate Overpass Area ID (Relation + 3600000000, Way + 2400000000)
  let areaId = null;
  if (osmType === 'relation') {
    areaId = 3600000000 + parseInt(osmId);
  } else if (osmType === 'way') {
    areaId = 2400000000 + parseInt(osmId);
  }

  const rawPlaces = await fetchPlacesForBoundingBox({
    south,
    west,
    north,
    east,
    areaId, // Pass the calculated Area ID
    centroid: { lat, lon }, // Pass centroid for strict distance filtering
    anchorLimit: 50,
    lifestyleLimit: 30,
    extrasLimit: 20,
  });

  return normalizeRawPlaces(rawPlaces);
}

export { fetchRawPlacesForDestination };

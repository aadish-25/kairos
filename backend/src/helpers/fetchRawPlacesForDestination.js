import { fetchPlacesForBoundingBox } from "../providers/places/overpassClient.js";
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

  const rawPlaces = await fetchPlacesForBoundingBox({
    south,
    west,
    north,
    east,
    limit: 50,
  });

  return normalizeRawPlaces(rawPlaces);
}

export { fetchRawPlacesForDestination };

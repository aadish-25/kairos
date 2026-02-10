import axios from "axios";
import { fetchPlacesForBoundingBox } from "../providers/overpass/overpassClient.js";

async function fetchRawPlacesForDestination(destination) {
  // 1. Resolve destination → bounding box
  const geoRes = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      params: {
        q: destination,
        format: "json",
        limit: 1,
      },
      headers: {
        "User-Agent": "kairos/1.0",
      },
    }
  );

  if (!geoRes.data.length) {
    throw new Error("Unable to resolve destination to coordinates");
  }

  const place = geoRes.data[0];
  const [south, north, west, east] = place.boundingbox.map(Number);

  // 2. Fetch places from Overpass
  return fetchPlacesForBoundingBox({
    south,
    west,
    north,
    east,
    limit: 50,
  });
}

export { fetchRawPlacesForDestination };

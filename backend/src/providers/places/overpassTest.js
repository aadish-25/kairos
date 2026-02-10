import { fetchPlacesForBoundingBox } from "./overpassClient.js";

const places = await fetchPlacesForBoundingBox({
  south: 15.45,
  west: 73.7,
  north: 15.6,
  east: 73.9,
  limit: 5
});

console.log("Places:", places.map(p => p.tags?.name));
process.exit(0);

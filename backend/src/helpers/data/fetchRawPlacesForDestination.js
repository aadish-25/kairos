import { fetchPlacesForBoundingBox } from "../../providers/overpass/overpassClient.js";
import { normalizeRawPlaces } from "./normalizeRawPlaces.js";
import ApiError from "../../utils/ApiError.js";
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
    // [PHASE 5 FIX] Fetch HUGE numbers to avoid "South Goa Bias" from Overpass sort order
    anchorLimit: 2000,
    lifestyleLimit: 1000,
    extrasLimit: 500,
  });

  // [PHASE 5 FIX] Smart Downsampling
  // Overpass returns items in ID/Lat order, often cutting off entire regions (e.g. North Goa).
  // We fetch ALL (3500+), then shuffle/prioritize to get a representative mix.

  const normalized = normalizeRawPlaces(rawPlaces);

  // [PHASE 8] Category Diversity Quotas
  // Without this, food-heavy cities (Manali, Pondicherry) become restaurant directories.
  // Enforce: Anchors >= 40%, Food <= 35%, Others fill remaining.
  const CAP = 200;
  const ANCHOR_MIN_PCT = 0.40; // At least 40% landmarks
  const FOOD_MAX_PCT = 0.35;   // At most 35% food

  const anchors = [];
  const food = [];
  const others = [];

  normalized.forEach(p => {
    if (['beach', 'fort', 'museum', 'viewpoint', 'waterfall', 'monument', 'peak', 'island'].includes(p.category)) {
      anchors.push(p);
    } else if (['restaurant', 'cafe', 'nightlife'].includes(p.category)) {
      food.push(p);
    } else {
      others.push(p);
    }
  });

  // Sort each bucket by quality (best first)
  const sortByQuality = (list) =>
    list.sort((a, b) => {
      if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
      return Math.random() - 0.5; // break ties randomly to avoid ID bias
    });

  sortByQuality(anchors);
  sortByQuality(food);
  sortByQuality(others);

  // Calculate slot counts
  const anchorSlots = Math.max(Math.ceil(CAP * ANCHOR_MIN_PCT), anchors.length > 0 ? 1 : 0);
  const foodSlots = Math.floor(CAP * FOOD_MAX_PCT);

  // Fill: Anchors first (up to anchorSlots or all available), then Food (capped), then Others
  const result = [];
  result.push(...anchors.slice(0, anchorSlots));
  result.push(...food.slice(0, foodSlots));

  // Fill remaining with Others + leftover anchors + leftover food
  const remaining = CAP - result.length;
  const overflow = [
    ...others,
    ...anchors.slice(anchorSlots),
    ...food.slice(foodSlots),
  ];
  sortByQuality(overflow);
  result.push(...overflow.slice(0, Math.max(0, remaining)));

  console.log(`[FetchPipeline] Diversity: ${anchors.length} anchors (used ${Math.min(anchors.length, anchorSlots)}), ${food.length} food (capped ${Math.min(food.length, foodSlots)}), ${others.length} other. Final: ${result.length}`);

  return result.slice(0, CAP);
}

export { fetchRawPlacesForDestination };

import { fetchPlacesForBoundingBox } from "../../providers/overpass/overpassClient.js";
import { fetchGeoapifySupplementary, mergeWithGeoapify } from "../../providers/geoapify/geoapifyClient.js";
import { normalizeRawPlaces } from "./normalizeRawPlaces.js";
import { getCachedFetchProfile, setCachedFetchProfile } from "../../cache/fetchProfileCache.js";
import ApiError from "../../utils/ApiError.js";
import axios from "axios";
import { writeLog } from "../../utils/logger.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:9000";

/**
 * Call Stage 0 AI to get a destination-specific FetchProfile.
 * Uses permanent Redis cache — destination identity never changes.
 */
async function getFetchProfile(destination) {
  // 1. Check cache first
  const cached = await getCachedFetchProfile(destination);
  if (cached) {
    writeLog('services', `[Stage0] Cache HIT for "${destination}": ${cached.destination_type}`);
    return cached;
  }

  // 2. Call Stage 0 AI
  writeLog('services', `[Stage0] Cache MISS for "${destination}". Calling AI...`);
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/stage0`, {
      destination,
    });
    const profile = response.data;
    writeLog('services', `[Stage0] AI returned profile: ${profile.destination_type} (${profile.anchor_tags.length} anchor types)`);

    // 3. Cache permanently
    await setCachedFetchProfile(destination, profile);
    return profile;
  } catch (err) {
    writeLog('ai_errors', `[Stage0] AI call failed: ${err.message}. Using default profile.`);
    // Fallback: generic profile that covers common Indian destinations
    return {
      destination_type: "general_tourism",
      anchor_tags: [
        { key: "natural", value: "beach", priority: "medium" },
        { key: "historic", value: "fort", priority: "medium" },
        { key: "historic", value: "monument", priority: "medium" },
        { key: "tourism", value: "attraction", priority: "medium" },
        { key: "tourism", value: "museum", priority: "medium" },
        { key: "tourism", value: "viewpoint", priority: "medium" },
        { key: "amenity", value: "place_of_worship", priority: "medium" },
      ],
      lifestyle_tags: [
        { key: "amenity", value: "restaurant", priority: "medium" },
        { key: "amenity", value: "cafe", priority: "medium" },
      ],
      extras_tags: [
        { key: "amenity", value: "bar", priority: "low" },
        { key: "leisure", value: "spa", priority: "low" },
      ],
      anchor_limit: 400,
      lifestyle_limit: 200,
      extras_limit: 80,
    };
  }
}

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

  // Stage 0: Get destination-specific fetch profile
  const fetchProfile = await getFetchProfile(destination);
  writeLog('overpass', `[FetchPipeline] Using profile "${fetchProfile.destination_type}" — limits: ${fetchProfile.anchor_limit}/${fetchProfile.lifestyle_limit}/${fetchProfile.extras_limit}`);

  // Run Overpass + Geoapify in parallel to minimize latency
  const bbox = { south, west, north, east };
  const [rawPlaces, geoapifyPlaces] = await Promise.all([
    fetchPlacesForBoundingBox({
      south, west, north, east,
      areaId,
      centroid: { lat, lon },
      anchorTags: fetchProfile.anchor_tags,
      lifestyleTags: fetchProfile.lifestyle_tags,
      extrasTags: fetchProfile.extras_tags,
      anchorLimit: fetchProfile.anchor_limit,
      lifestyleLimit: fetchProfile.lifestyle_limit,
      extrasLimit: fetchProfile.extras_limit,
    }),
    fetchGeoapifySupplementary(fetchProfile.anchor_tags, bbox),
  ]);

  // Merge: Geoapify adds famous places Overpass missed (deduped by ~120m proximity)
  const mergedPlaces = mergeWithGeoapify(rawPlaces, geoapifyPlaces);
  writeLog('overpass', `[FetchPipeline] Total after merge: ${mergedPlaces.length} (${rawPlaces.length} Overpass + ${mergedPlaces.length - rawPlaces.length} Geoapify)`);

  const normalized = normalizeRawPlaces(mergedPlaces);

  // Category Diversity Quotas
  // Without this, food-heavy cities (Manali, Pondicherry) become restaurant directories.
  // Enforce: Anchors >= 40%, Food <= 35%, Others fill remaining.
  const CAP = 200;
  const ANCHOR_MIN_PCT = 0.40; // At least 40% landmarks
  const FOOD_MAX_PCT = 0.35;   // At most 35% food

  const anchors = [];
  const food = [];
  const others = [];

  const ANCHOR_CATEGORIES = new Set([
    'beach', 'fort', 'museum', 'viewpoint', 'waterfall', 'monument',
    'peak', 'island', 'temple', 'ghat', 'cave', 'garden', 'palace',
    'ruins', 'attraction', 'zoo', 'park', 'nature_reserve', 'adventure',
  ]);

  normalized.forEach(p => {
    if (ANCHOR_CATEGORIES.has(p.category)) {
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

  writeLog('overpass', `[FetchPipeline] Diversity: ${anchors.length} anchors (used ${Math.min(anchors.length, anchorSlots)}), ${food.length} food (capped ${Math.min(food.length, foodSlots)}), ${others.length} other. Final: ${result.length}`);

  return result.slice(0, CAP);
}

export { fetchRawPlacesForDestination };

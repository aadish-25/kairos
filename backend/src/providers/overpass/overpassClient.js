import axios from "axios";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "http://overpass.openstreetmap.ru/cgi/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function logOverpassError(err) {
  console.error("Overpass request failed");

  if (err.response) {
    console.error("Status:", err.response.status);
    const data = err.response.data;
    if (typeof data === "string") {
      console.error("Data:", data.slice(0, 300));
    } else {
      console.error("Data:", JSON.stringify(data, null, 2).slice(0, 300));
    }
  } else {
    console.error("Message:", err.message);
  }
}

/**
 * Run a single Overpass query against all endpoints (with fallback).
 */
async function runOverpassQuery(query) {
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[Overpass] Querying ${endpoint}...`);
      const response = await axios.post(endpoint, query, {
        headers: { "Content-Type": "text/plain" },
        timeout: 120000,
      });
      return response.data.elements || [];
    } catch (err) {
      lastError = err;
      logOverpassError(err);
      await sleep(1500);
    }
  }

  throw new Error(
    "All Overpass endpoints failed. Last error: " +
    (lastError?.message || "unknown"),
  );
}

// Helper to calculate Haversine distance
function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch places for a bounding box using dynamically built queries.
 * Tags are provided by Stage 0 (pre-fetch AI) instead of being hardcoded.
 */
async function fetchPlacesForBoundingBox({
  south,
  west,
  north,
  east,
  centroid,
  areaId = null,
  mockResponse = null,
  // Dynamic tag arrays from Stage 0
  anchorTags = [],
  lifestyleTags = [],
  extrasTags = [],
  anchorLimit = 300,
  lifestyleLimit = 150,
  extrasLimit = 50,
}) {
  const latDiff = Math.abs(north - south);
  const lonDiff = Math.abs(east - west);
  const isLargeArea = latDiff > 0.5 || lonDiff > 0.5;
  const bbox = `${south},${west},${north},${east}`;

  console.log(`[Overpass] Fetching for ${bbox} (Size: ${latDiff.toFixed(2)}x${lonDiff.toFixed(2)})`);
  if (areaId) console.log(`[Overpass] Area Query Active: ID ${areaId}`);
  if (centroid) console.log(`[Overpass] Centroid Filter Active: ${centroid.lat}, ${centroid.lon}`);

  const timeout = isLargeArea ? 90 : 45;

  // QUERY GENERATOR
  const diffC = areaId ? `(area.searchArea)` : `(${bbox})`;

  let areaHeader = "";
  if (areaId) {
    areaHeader = `area(${areaId})->.searchArea;`;
  }

  // Tags that represent area features (ways/relations) — use 'nwr'
  // All others use 'node' to prevent timeouts on large areas
  const AREA_FEATURES = new Set(["beach", "park", "nature_reserve", "garden"]);

  function buildQueryLines(tags) {
    return tags.map(t => {
      const element = AREA_FEATURES.has(t.value) ? "nwr" : "node";
      return `        ${element}["${t.key}"="${t.value}"]${diffC};`;
    }).join("\n");
  }

  // Build queries from dynamic tags
  const anchorQuery = `
      [out:json][timeout:${timeout}];
      ${areaHeader}
      (
${buildQueryLines(anchorTags)}
      );
      out center ${anchorLimit} qt;
    `;

  const lifestyleQuery = `
      [out:json][timeout:${timeout}];
      ${areaHeader}
      (
${buildQueryLines(lifestyleTags)}
      );
      out center ${lifestyleLimit} qt;
    `;

  const extrasQuery = `
      [out:json][timeout:${timeout}];
      ${areaHeader}
      (
${buildQueryLines(extrasTags)}
      );
      out center ${extrasLimit} qt;
    `;

  console.log(`[Overpass] Dynamic queries: ${anchorTags.length} anchor types, ${lifestyleTags.length} lifestyle types, ${extrasTags.length} extras types`);


  // Run all three queries
  let anchors = [];
  let lifestyle = [];
  let extras = [];

  if (mockResponse) {
    console.log(`[Overpass] MOCK MODE: Using ${mockResponse.length} mock places.`);
    anchors = mockResponse;
  } else {
    console.log(`[Overpass] Fetching anchors (limit ${anchorLimit})...`);
    try {
      anchors = await runOverpassQuery(anchorQuery);
      console.log(`[Overpass] Got ${anchors.length} anchor places`);
    } catch (err) {
      console.error("[Overpass] Anchor query failed:", err.message);
    }

    console.log(`[Overpass] Fetching lifestyle (limit ${lifestyleLimit})...`);
    try {
      lifestyle = await runOverpassQuery(lifestyleQuery);
      console.log(`[Overpass] Got ${lifestyle.length} lifestyle places`);
    } catch (err) {
      console.error("[Overpass] Lifestyle query failed:", err.message);
    }

    console.log(`[Overpass] Fetching extras (limit ${extrasLimit})...`);
    try {
      extras = await runOverpassQuery(extrasQuery);
      console.log(`[Overpass] Got ${extras.length} extra places`);
    } catch (err) {
      console.error("[Overpass] Extras query failed:", err.message);
    }
  }

  // FILTERING: Geo Checks
  // Default strict radius for pure bbox queries
  const MAX_RADIUS_KM_STRICT = 30;
  // Very loose sanity radius when using areaId (just to catch completely wrong results)
  const MAX_RADIUS_KM_AREA_SANITY = 500;

  const allPlaces = [...anchors, ...lifestyle, ...extras].map((place) => {
    if (!place.lat && place.center) {
      place.lat = place.center.lat;
      place.lon = place.center.lon;
    }
    return place;
  });

  // If we have an areaId, we TRUST the OSM admin boundary and do NOT apply
  // the strict 30km centroid clamp. We only use a very loose sanity radius.
  if (areaId) {
    if (centroid) {
      console.log(
        `[GeoFilter] Area-based query. Using ONLY loose sanity radius ${MAX_RADIUS_KM_AREA_SANITY}km from centroid ${centroid.lat}, ${centroid.lon}`
      );
    } else {
      console.log("[GeoFilter] Area-based query with no centroid. Returning all places from area.");
      return allPlaces;
    }

    const filtered = allPlaces.filter((place) => {
      if (!place.lat || !place.lon) return true;
      const dist = getDistance(centroid.lat, centroid.lon, place.lat, place.lon);
      if (dist > MAX_RADIUS_KM_AREA_SANITY) {
        console.log(
          `[GeoFilter] Discarding ${place.tags?.name || "unknown"} - Dist: ${dist.toFixed(
            1,
          )}km (beyond sanity radius)`
        );
        return false;
      }
      return true;
    });

    console.log(
      `[Overpass] Area-based: returning ${filtered.length} places after loose sanity filtering (raw ${allPlaces.length})`,
    );
    return filtered;
  }

  // Legacy path: no areaId, use bbox + strict radius
  if (centroid) {
    console.log(
      `[GeoFilter] BBox-only query. Centroid: ${centroid.lat}, ${centroid.lon}. Max Radius: ${MAX_RADIUS_KM_STRICT}km`,
    );
  } else {
    console.warn("[GeoFilter] BBox-only query with no centroid.");
  }

  const strictCombined = allPlaces.filter((place) => {
    if (!place.lat || !place.lon) {
      return true;
    }

    const buffer = 0.005;
    const inLat = place.lat >= south - buffer && place.lat <= north + buffer;
    const inLon = place.lon >= west - buffer && place.lon <= east + buffer;
    if (!inLat || !inLon) return false;

    if (centroid && centroid.lat && centroid.lon) {
      const dist = getDistance(centroid.lat, centroid.lon, place.lat, place.lon);
      if (dist > MAX_RADIUS_KM_STRICT) {
        console.log(
          `[GeoFilter] Discarding ${place.tags?.name || "unknown"} - Dist: ${dist.toFixed(1)}km`,
        );
        return false;
      }
    }

    return true;
  });

  console.log(
    `[Overpass] BBox-only: Total after strict geo-filtering: ${strictCombined.length} places (of raw ${allPlaces.length})`,
  );

  return strictCombined;
}

export { fetchPlacesForBoundingBox };

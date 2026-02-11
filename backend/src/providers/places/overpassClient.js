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

/**
 * Fetch places for a bounding box using three balanced queries.
 * For large areas (like state-level Goa), we use lighter queries
 * to prevent timeouts — `node` instead of `nwr`, and specific
 * historic subtags instead of broad `historic`.
 */
async function fetchPlacesForBoundingBox({
  south,
  west,
  north,
  east,
  anchorLimit = 50,
  lifestyleLimit = 30,
  extrasLimit = 20,
}) {
  const latDiff = Math.abs(north - south);
  const lonDiff = Math.abs(east - west);
  const isLargeArea = latDiff > 0.5 || lonDiff > 0.5;
  const bbox = `${south},${west},${north},${east}`;

  console.log(`[Overpass] Fetching for ${bbox} (Size: ${latDiff.toFixed(2)}x${lonDiff.toFixed(2)})`);
  console.log(`[Overpass] Large Area Mode: ${isLargeArea}`);

  const timeout = isLargeArea ? 90 : 45;

  // Query A: "Anchor" places — attractions worth travelling for
  // For large areas: use node for most, nwr only for beaches (mapped as polygons)
  // Use specific historic subtags (fort, monument, castle) NOT broad "historic" which is too heavy
  const anchorQuery = isLargeArea
    ? `
      [out:json][timeout:${timeout}];
      (
        nwr["natural"="beach"](${bbox});
        node["historic"="fort"](${bbox});
        node["historic"="castle"](${bbox});
        node["historic"="monument"](${bbox});
        node["historic"="ruins"](${bbox});
        node["tourism"="attraction"](${bbox});
        node["tourism"="museum"](${bbox});
        node["tourism"="viewpoint"](${bbox});
        node["natural"="peak"](${bbox});
      );
      out tags center ${anchorLimit};
    `
    : `
      [out:json][timeout:${timeout}];
      (
        nwr["natural"="beach"](${bbox});
        nwr["historic"](${bbox});
        nwr["tourism"="attraction"](${bbox});
        nwr["tourism"="museum"](${bbox});
        nwr["tourism"="viewpoint"](${bbox});
        nwr["leisure"="park"](${bbox});
        nwr["leisure"="nature_reserve"](${bbox});
      );
      out tags center ${anchorLimit};
    `;

  // Query B: "Lifestyle" places — food & drink
  const lifestyleQuery = `
    [out:json][timeout:${timeout}];
    (
      node["amenity"="restaurant"](${bbox});
      node["amenity"="cafe"](${bbox});
      node["amenity"="ice_cream"](${bbox});
      node["shop"="bakery"](${bbox});
    );
    out tags center ${lifestyleLimit};
  `;

  // Query C: "Extras" — nightlife, shopping, relaxation
  const extrasQuery = `
    [out:json][timeout:${timeout}];
    (
      node["amenity"="bar"](${bbox});
      node["amenity"="nightclub"](${bbox});
      node["amenity"="pub"](${bbox});
      node["shop"="mall"](${bbox});
      node["leisure"="spa"](${bbox});
    );
    out tags center ${extrasLimit};
  `;

  // Run all three queries
  console.log(`[Overpass] Fetching anchors (limit ${anchorLimit})...`);
  let anchors = [];
  try {
    anchors = await runOverpassQuery(anchorQuery);
    console.log(`[Overpass] Got ${anchors.length} anchor places`);
  } catch (err) {
    console.error("[Overpass] Anchor query failed:", err.message);
  }

  console.log(`[Overpass] Fetching lifestyle (limit ${lifestyleLimit})...`);
  let lifestyle = [];
  try {
    lifestyle = await runOverpassQuery(lifestyleQuery);
    console.log(`[Overpass] Got ${lifestyle.length} lifestyle places`);
  } catch (err) {
    console.error("[Overpass] Lifestyle query failed:", err.message);
  }

  console.log(`[Overpass] Fetching extras (limit ${extrasLimit})...`);
  let extras = [];
  try {
    extras = await runOverpassQuery(extrasQuery);
    console.log(`[Overpass] Got ${extras.length} extra places`);
  } catch (err) {
    console.error("[Overpass] Extras query failed:", err.message);
  }

  const combined = [...anchors, ...lifestyle, ...extras];
  console.log(`[Overpass] Total combined: ${combined.length} places`);

  return combined;
}

export { fetchPlacesForBoundingBox };

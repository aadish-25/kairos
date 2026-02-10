import axios from "axios";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
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

async function fetchPlacesForBoundingBox({
  south,
  west,
  north,
  east,
  limit = 10,
}) {
  const query = `
[out:json][timeout:25];
(
  node["tourism"="attraction"](${south},${west},${north},${east});
  node["tourism"="museum"](${south},${west},${north},${east});
  node["historic"](${south},${west},${north},${east});
  node["natural"](${south},${west},${north},${east});
  node["leisure"](${south},${west},${north},${east});
  node["amenity"="restaurant"](${south},${west},${north},${east});
  node["amenity"="cafe"](${south},${west},${north},${east});
);
out tags center ${limit};

`;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await axios.post(endpoint, query, {
        headers: { "Content-Type": "text/plain" },
        timeout: 20000,
      });

      return response.data.elements || [];
    } catch (err) {
      lastError = err;
      logOverpassError(err);

      // Respect Overpass rate limits
      await sleep(1500);
    }
  }

  throw new Error(
    "All Overpass endpoints failed. Last error: " +
      (lastError?.message || "unknown"),
  );
}

export { fetchPlacesForBoundingBox };

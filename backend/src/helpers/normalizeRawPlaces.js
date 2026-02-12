function getCategoryFromTags(tags) {
  if (tags.natural === "beach") return "beach";
  if (tags.historic === "fort" || tags.historic === "castle") return "fort";
  if (tags.tourism === "museum") return "museum";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "bar" || tags.amenity === "pub" || tags.amenity === "nightclub") return "nightlife";
  if (tags.leisure === "park" || tags.leisure === "nature_reserve") return "park";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.waterway === "waterfall") return "waterfall";

  // Fallback to generic tag keys
  return tags.tourism || tags.historic || tags.natural || tags.leisure || tags.amenity || "unknown";
}

function normalizeRawPlaces(rawPlaces) {
  const normalized = rawPlaces
    .filter((p) => p.tags && p.tags.name)
    .map((p) => {
      const tags = p.tags || {};

      return {
        name: tags.name,
        lat: p.lat ?? p.center?.lat,
        lon: p.lon ?? p.center?.lon,
        category: getCategoryFromTags(tags),
        // Keep raw tags for LLM context if needed, but simplified
        raw_type: tags.tourism || tags.natural || tags.amenity || "other",
        tags: Object.keys(tags),
      };
    })
    .filter((p) => p.lat && p.lon);

  return dedupePlaces(normalized);
}

// Simple place deduper:
// - normalize name (case + punctuation)
// - if another place with same normalized name exists within ~300m, keep only one
function dedupePlaces(places) {
  const SEEN = new Map(); // key -> kept place
  const MAX_DIST_KM = 0.3;

  for (const place of places) {
    const key = normalizeName(place.name);
    const existing = SEEN.get(key);

    if (!existing) {
      SEEN.set(key, place);
      continue;
    }

    // If coords missing on either, just keep the first one
    if (!place.lat || !place.lon || !existing.lat || !existing.lon) {
      continue;
    }

    const dist = getDistanceKm(existing.lat, existing.lon, place.lat, place.lon);
    if (dist > MAX_DIST_KM) {
      // Far apart even with similar name – treat as distinct by appending a suffix key
      SEEN.set(`${key}:${places.indexOf(place)}`, place);
    }
    // else: same name, close by → treat as duplicate, keep existing
  }

  return Array.from(SEEN.values());
}

function normalizeName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
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

export { normalizeRawPlaces };

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
  return rawPlaces
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
}

export { normalizeRawPlaces };

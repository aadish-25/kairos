function normalizeRawPlaces(rawPlaces) {
  return rawPlaces
    .filter(p => p.tags && p.tags.name)
    .map(p => {
      const tags = p.tags || {};

      return {
        name: tags.name,
        lat: p.lat ?? p.center?.lat,
        lon: p.lon ?? p.center?.lon,
        category:
          tags.tourism ||
          tags.historic ||
          tags.natural ||
          tags.leisure ||
          tags.amenity ||
          "unknown",
        tags: Object.keys(tags),
      };
    })
    .filter(p => p.lat && p.lon);
}

export { normalizeRawPlaces };

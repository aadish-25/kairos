/**
 * Hydrates the destination context with raw Overpass data (Lat/Lon).
 * 
 * @param {Object} context - The destination context from AI (with regions and places)
 * @param {Array} rawPlaces - The raw places array from Overpass (with lat/lon)
 * @returns {Object} - The updated context with hydrated places
 */
export function hydrateDestinationContext(context, rawPlaces) {
    if (!context || !context.regions || !rawPlaces) return context;
    console.log(`[Hydration] Starting sync. Context regions: ${context.regions.length}, Raw pool: ${rawPlaces.length}`);

    // Create a fast lookup map for raw places
    // We use a normalized key: lowercase, trimmed, remove special chars
    const rawMap = new Map();

    rawPlaces.forEach(p => {
        if (p.name && p.lat && p.lon) {
            const key = normalizeName(p.name);
            rawMap.set(key, { lat: p.lat, lon: p.lon });
        }
    });

    // Iterate through regions and places to hydrate
    context.regions.forEach(region => {
        if (region.places) {
            region.places.forEach(place => {
                const key = normalizeName(place.name);

                // Exact normalized match
                if (rawMap.has(key)) {
                    const raw = rawMap.get(key);
                    place.lat = raw.lat;
                    place.lon = raw.lon;
                } else {
                    // Fallback: Try fuzzy search (contains)
                    // Since map lookups failed, we iterate (slower but resilient)
                    const fallback = rawPlaces.find(p =>
                        normalizeName(p.name).includes(key) ||
                        key.includes(normalizeName(p.name))
                    );

                    if (fallback && fallback.lat && fallback.lon) {
                        place.lat = fallback.lat;
                        place.lon = fallback.lon;
                    }
                }
            });
        }
    });

    return context;
}

function normalizeName(name) {
    return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

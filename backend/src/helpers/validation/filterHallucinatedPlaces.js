/**
 * Hallucination Filter
 * 
 * Post-Stage-2 validation that rejects any place name the LLM invented
 * that doesn't exist in the original Overpass rawPlaces pool.
 * 
 * These hallucinated places are identifiable because:
 * 1. They don't exist in rawPlaces
 * 2. Geocoders resolve them to generic city centroids (e.g. 15.33333, 74.08333)
 * 3. They degrade itinerary quality with non-existent restaurants
 */

/**
 * @param {Object} structuredContext - The LLM output with regions and places
 * @param {Array} rawPlaces - Original normalized Overpass data
 * @returns {Object} - Cleaned structuredContext with hallucinated places removed
 */
export function filterHallucinatedPlaces(structuredContext, rawPlaces) {
    // Build lookup set from raw data (lowercase + trimmed for fuzzy matching)
    const rawNameSet = new Set(
        rawPlaces.map(p => (p.name || '').toLowerCase().trim())
    );

    let totalRemoved = 0;

    for (const region of (structuredContext.regions || [])) {
        if (!region.places) continue;

        const before = region.places.length;

        region.places = region.places.filter(p => {
            const normalizedName = (p.name || '').toLowerCase().trim();
            const exists = rawNameSet.has(normalizedName);

            if (!exists) {
                console.log(`[HallucinationFilter] Removed "${p.name}" from region "${region.name}" — not in Overpass data`);
                totalRemoved++;
            }

            return exists;
        });

        if (region.places.length < before) {
            console.log(`[HallucinationFilter] Region "${region.name}": ${before} → ${region.places.length} places`);
        }
    }

    if (totalRemoved > 0) {
        console.log(`[HallucinationFilter] Total removed: ${totalRemoved} hallucinated places`);
    } else {
        console.log(`[HallucinationFilter] All places verified against Overpass data ✓`);
    }

    return structuredContext;
}

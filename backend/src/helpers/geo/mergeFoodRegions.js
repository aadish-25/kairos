import { getDistance } from './geoClustering.js';

/**
 * Merges fragmented "Food" or "Nightlife" regions into the nearest valid region
 * IF the travel profile says the destination is "compact" and the region is dominated by food.
 * 
 * @param {Array} regions - List of region objects from AI
 * @param {Array} places - List of hydrated places with lat/lon
 * @param {Object} travelProfile - The destination's travel profile (spread)
 * @returns {Object} - { regions, places } (Updated lists)
 */
function mergeFoodRegions(regions, places, travelProfile) {
    if (travelProfile?.spread !== 'compact') return { regions, places };

    const updatedRegions = [...regions];
    const regionsToRemove = new Set();
    const regionMap = new Map(regions.map(r => [r.id, r]));

    // 1. Calculate Food Density per Region
    for (const region of regions) {
        const regionPlaces = places.filter(p => p.region_id === region.id);
        if (regionPlaces.length === 0) continue;

        const foodCount = regionPlaces.filter(p => p.category === 'food' || p.category === 'nightlife').length;
        const foodRatio = foodCount / regionPlaces.length;

        // Condition: > 70% Food AND labeled as "Food"/"Nightlife" area in title/desc
        const isFoodLabel = /food|eat|dining|nightlife|party/i.test(region.name) || /food|eat|dining|nightlife|party/i.test(region.description);

        if (foodRatio > 0.7 || (foodRatio > 0.5 && isFoodLabel)) {
            console.log(`[Merger] Detected Food Region candidate: ${region.id} (${(foodRatio * 100).toFixed(0)}% Food)`);

            // 2. Find Mean Center of this region
            const validPlaces = regionPlaces.filter(p => p.lat && p.lon);
            if (validPlaces.length === 0) continue;

            const centerLat = validPlaces.reduce((sum, p) => sum + p.lat, 0) / validPlaces.length;
            const centerLon = validPlaces.reduce((sum, p) => sum + p.lon, 0) / validPlaces.length;

            // 3. Find Nearest Non-Food Neighbor
            let bestNeighbor = null;
            let minDist = Infinity;

            for (const neighbor of regions) {
                if (neighbor.id === region.id) continue;
                if (regionsToRemove.has(neighbor.id)) continue; // Don't merge into already removed

                // Quick check: Is neighbor also a food region? Prefer not to merge food->food if possible, but okay if needed.
                // Better: Merge into a "General" or "Attraction" region.

                // Get neighbor center
                const neighborPlaces = places.filter(p => p.region_id === neighbor.id && p.lat && p.lon);
                if (neighborPlaces.length === 0) continue;

                const nLat = neighborPlaces.reduce((sum, p) => sum + p.lat, 0) / neighborPlaces.length;
                const nLon = neighborPlaces.reduce((sum, p) => sum + p.lon, 0) / neighborPlaces.length;

                const dist = getDistance(centerLat, centerLon, nLat, nLon);
                if (dist < minDist) {
                    minDist = dist;
                    bestNeighbor = neighbor;
                }
            }

            // 4. Merge if close enough (< 5km for compact towns)
            if (bestNeighbor && minDist < 5) {
                console.log(`[Merger] Merging "${region.name}" -> "${bestNeighbor.name}" (Dist: ${minDist.toFixed(1)}km)`);

                // Reassign places
                places.forEach(p => {
                    if (p.region_id === region.id) {
                        p.region_id = bestNeighbor.id;
                        p.original_region_id = region.id; // Audit trail
                    }
                });

                regionsToRemove.add(region.id);
            }
        }
    }

    // Filter out removed regions
    const finalRegions = updatedRegions.filter(r => !regionsToRemove.has(r.id));
    return { regions: finalRegions, places };
}

export { mergeFoodRegions };

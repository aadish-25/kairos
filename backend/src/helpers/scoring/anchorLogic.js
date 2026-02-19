/**
 * Ensures critical "Anchor" places (Priority Main + Category Nature/Heritage) are preserved.
 * And forces a spread of these anchors to avoid daily overcrowding.
 */

// 1. Coverage Protection (Run before day allocation)
export function ensureAnchorCoverage(destinationContext) {
    // This is implicitly handled if we don't drop places randomly.
    // But if we perform clustering (K-Means), we might lose outliers.
    // This function is a placeholder to verify that all places marked "Main" + "Nature/Heritage"
    // exist in the final day buckets. If K-Means logic drops them, we'd need to force insert.
    // Since our current K-Means implementation clusters *all* passed places, this is less critical 
    // for 'dropping' but critical for 'verification'.

    // We'll trust the flow for now, but this utility could be used to audit.
    // Actual protection happens in `validateRegionCoherence` (reassign instead of discard).
    return destinationContext;
}

// 2. Anchor Spreading (Run during allocator candidate scoring)
// This is not a standalone script but a Logic Helper to be used inside `placeAllocator.js`
// We export the penalty logic here for modularity.

export function getAnchorStackingPenalty(dayPlan) {
    // Count existing anchors in this day
    let anchorCount = 0;

    if (dayPlan.places && dayPlan.places.main) {
        dayPlan.places.main.forEach(p => {
            if (isAnchor(p)) anchorCount++;
        });
    }

    // If we already have 2 anchors, strictly penalize adding a 3rd
    if (anchorCount >= 2) return -200; // Heavy blockade
    if (anchorCount === 1) return -20; // Slight resistance to encourage spread
    return 0; // No penalty (welcome first anchor)
}

function isAnchor(place) {
    return place.priority === 'main' &&
        (place.category === 'nature' || place.category === 'heritage' || place.category === 'adventure');
}

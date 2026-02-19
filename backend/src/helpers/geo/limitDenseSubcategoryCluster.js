import { getDistance } from './geoClustering.js';

/**
 * Checks if adding a candidate place violates spatial saturation rules.
 * Rule: Reject if > 2 places of the SAME subcategory exist within 500m radius in the current day.
 * 
 * @param {Object} candidate - The place to add.
 * @param {Array} currentDayPlaces - places already in the day bucket.
 * @returns {Boolean} - True if saturated (should reject/penalize), False if okay.
 */
export function isClusterSaturated(candidate, currentDayPlaces) {
    if (!candidate.lat || !candidate.lon) return false;

    // Only check against same subcategory (e.g. don't want 3 beaches in 500m)
    const sameSubcatPlaces = currentDayPlaces.filter(p =>
        p.subcategory === candidate.subcategory && p.lat && p.lon
    );

    if (sameSubcatPlaces.length < 2) return false; // Need at least 2 existing to potentially hit limit of " > 2"

    let closeCount = 0;
    for (const p of sameSubcatPlaces) {
        const dist = getDistance(candidate.lat, candidate.lon, p.lat, p.lon);
        if (dist < 0.5) { // 500m
            closeCount++;
        }
    }

    // If we already have 2 close ones, adding a 3rd is saturation
    return closeCount >= 2;
}

import { getDistance } from './geoClustering.js';

/**
 * Validates and enforces geographic coherence within regions.
 * 
 * Logic:
 * 1. Calculate centroid for each region.
 * 2. Determine Dynamic Radius based on destination spread (Travel Profile).
 * 3. Identify outliers (> Max Radius from centroid).
 * 4. Reassign outliers to the nearest VALID region.
 * 5. If no valid region found (all > max radius), move to a new "Overflow" region or keep if within absolute tolerance.
 * 
 * @param {Object} destinationContext - The full context with regions and travel profile.
 * @returns {Object} - The validated and potentially modified destinationContext.
 */
function validateRegionCoherence(destinationContext) {
    console.log(`[GeoValidation] Starting coherence check for ${destinationContext.name}...`);

    const { regions, travel_profile } = destinationContext;
    if (!regions || regions.length === 0) return destinationContext;

    // 1. Determine Max Radius based on Spread
    // 'compact' -> smaller radius (e.g. Pondicherry ~8km)
    // 'wide' -> larger radius (e.g. Goa ~35km, Rajasthan ~60km)
    let MAX_RADIUS_KM = 15; // default

    if (travel_profile?.spread === 'compact') {
        MAX_RADIUS_KM = 10;
    } else if (travel_profile?.spread === 'wide') {
        MAX_RADIUS_KM = 40;
    }

    // Adjust for specific destination overrides if needed (can be data-driven later)
    if (destinationContext.name.toLowerCase().includes('goa')) MAX_RADIUS_KM = 35;
    if (destinationContext.name.toLowerCase().includes('pondicherry')) MAX_RADIUS_KM = 8;

    console.log(`[GeoValidation] Using MAX_RADIUS_KM: ${MAX_RADIUS_KM}`);

    const outliers = [];

    // 2. Calculate Centroids & Identify Outliers
    regions.forEach(region => {
        if (!region.places || region.places.length === 0) return;

        // Compute Centroid
        let sumLat = 0, sumLon = 0, count = 0;
        const validPlaces = [];

        region.places.forEach(p => {
            if (p.lat && p.lon) {
                sumLat += p.lat;
                sumLon += p.lon;
                count++;
            }
        });

        if (count === 0) return; // No coords in this region

        const centroid = { lat: sumLat / count, lon: sumLon / count };
        region.centroid = centroid; // Store for debugging/visualization

        // Check Distances
        // We iterate backwards or use a separate list to safely remove/move
        for (let i = region.places.length - 1; i >= 0; i--) {
            const place = region.places[i];
            if (!place.lat || !place.lon) continue;

            const dist = getDistance(place.lat, place.lon, centroid.lat, centroid.lon);

            if (dist > MAX_RADIUS_KM) {
                console.warn(`[GeoValidation] Outlier detected: ${place.name} is ${dist.toFixed(1)}km from ${region.name} centroid.`);
                // Remove from current region
                region.places.splice(i, 1);
                // Add to outliers list for reassignment
                outliers.push(place);
            }
        }
    });

    // 3. Reassign Outliers
    outliers.forEach(place => {
        let bestRegion = null;
        let minDist = Infinity;

        // Find nearest region
        regions.forEach(region => {
            if (region.centroid) {
                const dist = getDistance(place.lat, place.lon, region.centroid.lat, region.centroid.lon);
                // Must be within the max radius to be a valid adoption
                // Or if it's closer than the original assignment, we might consider it even if slightly over, 
                // but strictly enforcing radius is safer for coherence.
                // Let's allow adoption if it's within 1.2x Radius to prevent aggressive discarding, 
                // but ideally we want strict clusters.
                if (dist < minDist) {
                    minDist = dist;
                    bestRegion = region;
                }
            }
        });

        if (bestRegion && minDist <= MAX_RADIUS_KM) {
            console.log(`[GeoValidation] Reassigned ${place.name} to ${bestRegion.name} (Dist: ${minDist.toFixed(1)}km)`);
            place.region_id = bestRegion.id;
            bestRegion.places.push(place);
        } else {
            // No valid existing region found. 
            // Create "Overflow" region or "Far Flung" bucket?
            // For now, let's look for an existing "Overflow" or "Outskirts" region.
            let overflowRegion = regions.find(r => r.id === 'overflow' || r.name === 'Outskirts');

            if (!overflowRegion) {
                console.log(`[GeoValidation] Creating new Overflow region for ${place.name} (Dist to nearest: ${minDist.toFixed(1)}km)`);
                overflowRegion = {
                    id: 'overflow',
                    name: 'Outskirts / Far Flung',
                    density: 'low',
                    recommended_days: 1,
                    places: []
                };
                regions.push(overflowRegion);
            }

            place.region_id = overflowRegion.id;
            overflowRegion.places.push(place);
        }
    });

    // Clean up empty regions if any (e.g. if all places moved out)
    const nonEmptyRegions = regions.filter(r => r.places && r.places.length > 0);
    destinationContext.regions = nonEmptyRegions;

    return destinationContext;
}

export { validateRegionCoherence }
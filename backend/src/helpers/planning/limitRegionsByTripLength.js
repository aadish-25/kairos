/**
 * Enforces a hard cap on the number of regions based on trip duration.
 * 
 * Rules:
 * 1-3 Days: Max 2 Regions (Focus on depth)
 * 4-5 Days: Max 3 Regions
 * 6+ Days: Max 4 Regions
 * 
 * If count > Max, drop excess regions BUT rescue their main attractions
 * into the nearest kept region by centroid distance.
 */

import { getDistance } from "../geo/geoClustering.js";

function getRegionCentroid(region) {
    const validPlaces = (region.places || []).filter(p => p.lat && p.lon);
    if (validPlaces.length === 0) return null;
    return {
        lat: validPlaces.reduce((s, p) => s + p.lat, 0) / validPlaces.length,
        lon: validPlaces.reduce((s, p) => s + p.lon, 0) / validPlaces.length,
    };
}

export function limitRegionsByTripLength(destinationContext, totalDays) {
    const { regions } = destinationContext;
    if (!regions || regions.length === 0) return destinationContext;

    let maxRegions = 4; // default

    if (totalDays <= 3) maxRegions = 2;
    else if (totalDays <= 5) maxRegions = 3;

    if (regions.length > maxRegions) {
        console.log(`[RegionCap] Trip is ${totalDays} days. Clamping regions from ${regions.length} to ${maxRegions}.`);

        const keptRegions = regions.slice(0, maxRegions);
        const droppedRegions = regions.slice(maxRegions);

        // Rescue main attractions from dropped regions
        for (const dropped of droppedRegions) {
            const mainPlaces = (dropped.places || []).filter(p => p.priority === 'main');

            if (mainPlaces.length === 0) {
                console.log(`[RegionCap] Dropped region '${dropped.name}' (0 main places, nothing to rescue).`);
                continue;
            }

            // Find nearest kept region by centroid distance
            const droppedCentroid = getRegionCentroid(dropped);
            let nearestRegion = keptRegions[0];
            let minDist = Infinity;

            if (droppedCentroid) {
                for (const kept of keptRegions) {
                    const keptCentroid = getRegionCentroid(kept);
                    if (!keptCentroid) continue;

                    const dist = getDistance(droppedCentroid.lat, droppedCentroid.lon, keptCentroid.lat, keptCentroid.lon);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestRegion = kept;
                    }
                }
            }

            // Adopt main places into nearest region
            for (const place of mainPlaces) {
                place.region_id = nearestRegion.id;
                place._rescued_from = dropped.name;
                nearestRegion.places.push(place);
            }

            console.log(`[RegionCap] Rescued ${mainPlaces.length} mains from '${dropped.name}' → '${nearestRegion.name}' (${Math.round(minDist)}km)`);
        }

        destinationContext.regions = keptRegions;
    }

    return destinationContext;
}


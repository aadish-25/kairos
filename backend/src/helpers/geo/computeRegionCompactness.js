import { getDistance } from './geoClustering.js';

/**
 * Computes the compactness of a region to detect if it's too stretched.
 * 
 * Metric: Average Distance to Centroid.
 * Threshold: 
 * - Urban: > 5km is stretched
 * - Rural/Wide: > 15-20km is stretched
 * 
 * If stretched, we tag it with 'stretched' flag.
 * In V1, this is observability only (or soft warning).
 * In V2, this could trigger a split request.
 */
export function computeRegionCompactness(destinationContext) {
    console.log(`[RegionCompactness] Analyzing regions for ${destinationContext.name}...`);

    destinationContext.regions.forEach(region => {
        if (!region.places || region.places.length < 2) {
            region.compactness = { status: 'n/a', avg_dist: 0 };
            return;
        }

        // Re-use centroid if valid, or re-compute
        let centroid = region.centroid;
        if (!centroid) {
            let sumLat = 0, sumLon = 0, count = 0;
            region.places.forEach(p => {
                if (p.lat && p.lon) { sumLat += p.lat; sumLon += p.lon; count++; }
            });
            if (count > 0) centroid = { lat: sumLat / count, lon: sumLon / count };
        }

        if (!centroid) return;

        let totalDist = 0;
        let count = 0;
        let maxDist = 0;

        region.places.forEach(p => {
            if (p.lat && p.lon) {
                const d = getDistance(p.lat, p.lon, centroid.lat, centroid.lon);
                totalDist += d;
                if (d > maxDist) maxDist = d;
                count++;
            }
        });

        const avgDist = count > 0 ? totalDist / count : 0;

        let status = 'compact';
        let threshold = 5; // default urban
        if (destinationContext.name.includes('Goa')) threshold = 12; // wide state

        if (avgDist > threshold) status = 'stretched';
        if (avgDist > threshold * 2) status = 'dispersed';

        region.compactness = {
            avg_dist: parseFloat(avgDist.toFixed(2)),
            max_dist: parseFloat(maxDist.toFixed(2)),
            status
        };

        if (status !== 'compact') {
            console.warn(`[RegionCompactness] Region '${region.name}' is ${status} (Avg Dist: ${avgDist.toFixed(1)}km)`);
        }
    });

    return destinationContext;
}

/**
 * Geographic Clustering Utilities
 * Uses K-Means to group places into coherent clusters based on Lat/Lon.
 */

/**
 * Groups places into K clusters using K-Means algorithm.
 * @param {Array} places - Array of place objects with lat/lon
 * @param {number} k - Number of clusters (usually = number of days for this region)
 * @returns {Array<Array>} - Array of K clusters, each containing an array of places
 */
export function clusterPlaces(places, k) {
    if (!places || places.length === 0) return [];
    if (k <= 1) return [places]; // If only 1 day, no clustering needed

    // Separate valid coords vs missing coords
    const validPlaces = places.filter(p => p.lat && p.lon);
    const missingPlaces = places.filter(p => !p.lat || !p.lon);

    // If we don't have enough valid places to form K clusters, 
    // just distribute everything round-robin to ensure balance.
    if (validPlaces.length < k) {
        const clusters = Array.from({ length: k }, () => []);
        places.forEach((p, i) => clusters[i % k].push(p));
        return clusters;
    }

    // 1. Initialize Centroids (Pick K random VALID places)
    let centroids = [];
    const usedIndices = new Set();
    // Safety break to prevent infinite loop if data is weird
    let attempts = 0;
    while (centroids.length < k && attempts < 100) {
        const idx = Math.floor(Math.random() * validPlaces.length);
        if (!usedIndices.has(idx)) {
            usedIndices.add(idx);
            centroids.push({ lat: validPlaces[idx].lat, lon: validPlaces[idx].lon });
        }
        attempts++;
    }

    let clusters = Array.from({ length: k }, () => []);
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    // Run K-Means only on valid places
    while (iterations < MAX_ITERATIONS) {
        clusters = Array.from({ length: k }, () => []);

        for (const place of validPlaces) {
            let minDist = Infinity;
            let closestClusterIndex = 0;

            for (let i = 0; i < k; i++) {
                const dist = getDistance(place.lat, place.lon, centroids[i].lat, centroids[i].lon);
                if (dist < minDist) {
                    minDist = dist;
                    closestClusterIndex = i;
                }
            }
            clusters[closestClusterIndex].push(place);
        }

        // Recalculate Centroids
        let converged = true;
        for (let i = 0; i < k; i++) {
            if (clusters[i].length === 0) continue;

            let sumLat = 0, sumLon = 0;
            for (const p of clusters[i]) {
                sumLat += p.lat;
                sumLon += p.lon;
            }
            const newLat = sumLat / clusters[i].length;
            const newLon = sumLon / clusters[i].length;

            if (Math.abs(newLat - centroids[i].lat) > 0.001 || Math.abs(newLon - centroids[i].lon) > 0.001) {
                converged = false;
            }
            centroids[i] = { lat: newLat, lon: newLon };
        }

        if (converged) break;
        iterations++;
    }

    // 2. Distribute missing-coordinate places Evenly (Round-Robin)
    // This prevents "Day 1" from getting all the non-geotagged places.
    missingPlaces.forEach((p, i) => {
        // Add to the smallest cluster to balance sizes? 
        // Or just round-robin. Round-robin is predictable.
        clusters[i % k].push(p);
    });

    return clusters;
}

/**
 * Calculates distance between two coordinates in Kilometers.
 */
export function getDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 9999; // Return high distance if coords missing

    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

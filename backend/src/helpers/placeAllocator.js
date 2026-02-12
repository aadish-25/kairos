import ApiError from "../utils/ApiError.js";
import { clusterPlaces, getDistance } from "./geoClustering.js";

/**
 * Smart place allocator that builds natural day flows.
 *
 * Strategy (Geo-Clustering):
 *   1. Filter places by Region.
 *   2. Use K-Means to split region's places into K clusters (where K = number of days for that region).
 *   3. Assign each day to a specific geographic cluster.
 *   4. Fill the day using places ONLY from that cluster (with nearest-neighbor fallback).
 */

export function allocatePlacesToDayBuckets(dayBuckets, destinationContext) {
    // 1. Group available places by Region ID to prepare for clustering
    const regionGroups = {};
    destinationContext.regions.forEach((region) => {
        if (region.places) {
            region.places.forEach((p) => {
                p.region_id = region.id; // Ensure ID is attached
                if (!regionGroups[region.id]) regionGroups[region.id] = [];
                regionGroups[region.id].push(p);
            });
        }
    });

    const usedPlaceNames = new Set();
    const dayPlans = [];

    // 2. Count days per region to determine K for clustering
    const regionDayCounts = {};
    dayBuckets.forEach(b => {
        regionDayCounts[b.region_id] = (regionDayCounts[b.region_id] || 0) + 1;
    });

    // 3. Pre-calculate Clusters for each region
    const regionClusters = {};
    for (const [regionId, places] of Object.entries(regionGroups)) {
        const k = regionDayCounts[regionId] || 1;
        regionClusters[regionId] = clusterPlaces(places, k);
    }

    // 4. Track which cluster index to use next for each region
    const nextClusterIndex = {};

    // 5. Build Day Plans
    for (const bucket of dayBuckets) {
        const dayPlan = {
            day: bucket.day,
            region_id: bucket.region_id,
            region_name: bucket.region_name,
            places: { main: [], optional: [] },
        };

        // Get the specific cluster for this day
        const currentClusterIdx = nextClusterIndex[bucket.region_id] || 0;
        let dayPlaces = [];

        if (regionClusters[bucket.region_id] && regionClusters[bucket.region_id][currentClusterIdx]) {
            dayPlaces = regionClusters[bucket.region_id][currentClusterIdx];
        } else {
            // Fallback: use all region places if clustering failed
            dayPlaces = regionGroups[bucket.region_id] || [];
        }

        // Increment cluster index for next day in this region
        nextClusterIndex[bucket.region_id] = currentClusterIdx + 1;

        // Filter out already used places
        let availableDayPlaces = dayPlaces.filter(p => !usedPlaceNames.has(p.name));

        // Define 5 Main Slots
        const mainSlots = [
            { type: "Morning Activity", allowedTimes: ["morning", "anytime"], priorityCategory: "nature" },
            { type: "Culture/Daytime", allowedTimes: ["morning", "afternoon", "anytime"], priorityCategory: "heritage" },
            { type: "Lunch", allowedTimes: ["lunch", "afternoon", "anytime"], priorityCategory: "food" },
            { type: "Afternoon/Sunset", allowedTimes: ["evening", "afternoon", "anytime"], priorityCategory: "nature" },
            { type: "Dinner/Nightlife", allowedTimes: ["dinner", "evening", "nightlife"], priorityCategory: "food" }
        ];

        const categoryCounts = { nature: 0, heritage: 0, food: 0, nightlife: 0, shopping: 0, other: 0 };
        let lastSubcategory = null;
        let anchorCoords = null;

        // Fill Main Slots (Nearest Neighbor Chain)
        for (const slot of mainSlots) {
            if (availableDayPlaces.length === 0) break;

            const candidate = findBestCandidate(availableDayPlaces, slot, lastSubcategory, categoryCounts, anchorCoords);

            if (candidate) {
                // Set anchor for the day (first main place)
                if (!anchorCoords && candidate.lat && candidate.lon) {
                    anchorCoords = { lat: candidate.lat, lon: candidate.lon };
                }

                dayPlan.places.main.push({ ...candidate, priority: "main" });
                usedPlaceNames.add(candidate.name);
                lastSubcategory = candidate.subcategory || "other";

                const cat = candidate.category || "other";
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

                availableDayPlaces = availableDayPlaces.filter((p) => p.name !== candidate.name);
            }
        }

        // Fill 3 Optional Slots
        for (let i = 0; i < 3; i++) {
            if (availableDayPlaces.length === 0) break;

            // For optional, stick to the anchor heavily
            const candidate = findBestCandidate(availableDayPlaces,
                { allowedTimes: ["evening", "anytime"], priorityCategory: "any", type: "Optional" },
                null, categoryCounts, anchorCoords);

            if (candidate) {
                dayPlan.places.optional.push({ ...candidate, priority: "optional" });
                usedPlaceNames.add(candidate.name);
                availableDayPlaces = availableDayPlaces.filter(p => p.name !== candidate.name);
            }
        }

        dayPlans.push(dayPlan);
    }

    return dayPlans;
}

function findBestCandidate(places, slot, lastSubcategory, categoryCounts, anchorCoords) {
    let bestScore = -Infinity;
    let bestPlace = null;

    for (const place of places) {
        let score = 0;

        // 1. Proximity to Anchor (The "Magnet") - Critical for Day Coherence
        if (anchorCoords && place.lat && place.lon) {
            const dist = getDistance(anchorCoords.lat, anchorCoords.lon, place.lat, place.lon);
            if (dist < 5) score += 80;
            else if (dist < 10) score += 40;
            else score -= 20; // Penalty for drifting too far from day's center
        }

        // 2. Time Match
        if (place.best_time && slot.allowedTimes.includes(place.best_time)) {
            if (place.best_time === slot.allowedTimes[0]) score += 50;
            else score += 20;
        } else if (place.best_time === "anytime") {
            score += 10;
        } else {
            score -= 50;
        }

        // 3. Category & Diversity
        if (place.category === slot.priorityCategory) score += 20;
        if (place.category === "heritage" && categoryCounts["heritage"] === 0) score += 40;
        if (place.category === "nightlife" && categoryCounts["nightlife"] >= 1 && slot.type !== "Dinner/Nightlife") score -= 50;

        // 4. Variety (Subcategory)
        if (place.subcategory === lastSubcategory) score -= 40;

        // 5. Priority Boost
        if (place.priority === "main") score += 10;

        if (score > bestScore) {
            bestScore = score;
            bestPlace = place;
        }
    }

    return bestPlace;
}
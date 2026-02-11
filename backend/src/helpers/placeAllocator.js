import ApiError from "../utils/ApiError.js";

/**
 * Smart place allocator that builds natural day flows.
 *
 * Strategy:
 *   1. Define a "Ideal Day Schedule" with 5 slots (Morning -> Evening).
 *   2. For each slot, find the best candidate from available places based on:
 *      - Time match (Morning place for morning slot)
 *      - Diversity (Boost Heritage if missing, Penalty for Nightlife if present)
 *      - Variety (Don't repeat subcategory immediately)
 *   3. Enforce limit of 1 Nightlife spot per day unless "party" focus.
 */
export function allocatePlacesToDayBuckets(dayBuckets, destinationContext) {
    // 1. Group available places by ID/Name to track usage across all days
    const availablePlaces = [];
    destinationContext.regions.forEach((region) => {
        if (region.places) {
            region.places.forEach((p) => {
                // Add region_id to place for tracking
                p.region_id = region.id;
                availablePlaces.push(p);
            });
        }
    });

    const usedPlaceNames = new Set();

    // Map buckets to plans directly (No mutation of original buckets)
    return dayBuckets.map((bucket) => {
        const dayPlan = {
            day: bucket.day,
            region_id: bucket.region_id,
            region_name: bucket.region_name,
            places: {
                main: [],
                optional: [],
            },
        };

        // Filter places for this region
        let regionPlaces = availablePlaces.filter(
            (p) => p.region_id === bucket.region_id && !usedPlaceNames.has(p.name)
        );

        // Define 5 Main Slots for a balanced day
        const mainSlots = [
            { type: "Morning Activity", allowedTimes: ["morning", "anytime"], priorityCategory: "nature" },
            { type: "Culture/Daytime", allowedTimes: ["morning", "afternoon", "anytime"], priorityCategory: "heritage" },
            { type: "Lunch", allowedTimes: ["lunch", "afternoon", "anytime"], priorityCategory: "food" },
            { type: "Afternoon/Sunset", allowedTimes: ["evening", "afternoon", "anytime"], priorityCategory: "nature" },
            { type: "Dinner/Nightlife", allowedTimes: ["dinner", "evening", "nightlife"], priorityCategory: "food" }
        ];

        // Track categories allocated today
        const categoryCounts = {
            nature: 0,
            heritage: 0,
            food: 0,
            nightlife: 0,
            shopping: 0,
            other: 0
        };

        let lastSubcategory = null;

        // Fill Main Slots
        for (const slot of mainSlots) {
            if (regionPlaces.length === 0) break;

            const candidate = findBestCandidate(regionPlaces, slot, lastSubcategory, categoryCounts);

            if (candidate) {
                // FORCE PRIORITY CONSISTENCY: Main array = "main" priority
                dayPlan.places.main.push({ ...candidate, priority: "main" });
                usedPlaceNames.add(candidate.name);
                lastSubcategory = candidate.subcategory || "other";

                // Update counts
                const cat = candidate.category || "other";
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

                // Remove from available pool
                regionPlaces = regionPlaces.filter((p) => p.name !== candidate.name);
            }
        }

        // Fill 3 Optional Slots (Anytime/Evening)
        for (let i = 0; i < 3; i++) {
            if (regionPlaces.length === 0) break;
            // Just pick high priority remaining
            const candidate = regionPlaces.find(p => p.priority === "main") || regionPlaces[0];
            if (candidate) {
                // FORCE PRIORITY CONSISTENCY: Optional array = "optional" priority
                dayPlan.places.optional.push({ ...candidate, priority: "optional" });
                usedPlaceNames.add(candidate.name);
                regionPlaces = regionPlaces.filter(p => p.name !== candidate.name);
            }
        }

        return dayPlan;
    });
}

function findBestCandidate(places, slot, lastSubcategory, categoryCounts) {
    let bestScore = -Infinity;
    let bestPlace = null;

    for (const place of places) {
        let score = 0;

        // 1. Time Match
        if (place.best_time && slot.allowedTimes.includes(place.best_time)) {
            if (place.best_time === slot.allowedTimes[0]) score += 50; // Perfect match
            else score += 20; // Acceptable match
        } else if (place.best_time === "anytime") {
            score += 10;
        } else {
            score -= 50; // Wrong time (e.g. Nightlife in Morning)
        }

        // 2. Category Priority for Slot
        if (place.category === slot.priorityCategory) {
            score += 20;
        }

        // 3. Diversity Logic (Heritage Boost, Nightlife Limiting)
        if (place.category === "heritage" && categoryCounts["heritage"] === 0) {
            score += 40;
        }
        if (place.category === "shopping" && categoryCounts["shopping"] === 0) {
            score += 10;
        }

        if (place.category === "nightlife") {
            if (categoryCounts["nightlife"] >= 1) score -= 50;
            if (slot.type !== "Dinner/Nightlife") score -= 30;
        }

        if (place.category === "nature" && categoryCounts["nature"] >= 2) {
            score -= 10;
        }

        // 4. Variety Check (Subcategory)
        if (place.subcategory === lastSubcategory) {
            score -= 40;
        }

        // 5. Main Priority Boost
        if (place.priority === "main") {
            score += 10;
        }

        // 6. (Removed) Lat/Lon Bonus - Strictly metadata for V1

        if (score > bestScore) {
            bestScore = score;
            bestPlace = place;
        }
    }

    return bestPlace;
}

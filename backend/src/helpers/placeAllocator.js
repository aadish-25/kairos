import ApiError from "../utils/ApiError.js";

/**
 * Smart place allocator that builds natural day flows.
 *
 * Strategy:
 *   1. Define a "Ideal Day Schedule" with 5 slots (Morning -> Evening).
 *   2. For each slot, find the best candidate from available places based on:
 *      - Time match (Morning place for morning slot)
 *      - Variety (Don't repeat subcategory immediately)
 *      - Priority (Main > Optional)
 */
function allocatePlacesToDayBuckets(dayBuckets, destinationContext) {
    if (!Array.isArray(dayBuckets)) throw new ApiError(500, "Invalid day buckets");
    if (!destinationContext || !Array.isArray(destinationContext.regions)) {
        throw new ApiError(500, "Invalid destination context");
    }

    const regionMap = new Map();
    for (const region of destinationContext.regions) {
        regionMap.set(region.id, region);
    }

    const usedPlaces = new Set();
    const dayPlans = [];

    // Define the ideal flow for a day (5 Main places)
    const dailySchedule = [
        { label: "Morning Activity", allowedTimes: ["morning", "anytime"], prohibited: ["evening", "nightlife"] },
        { label: "Mid-Day Exploration", allowedTimes: ["morning", "anytime", "afternoon"], prohibited: ["nightlife"] },
        { label: "Lunch/Afternoon", allowedTimes: ["afternoon", "anytime", "lunch"], prohibited: [] },
        { label: "Updates/Sunset", allowedTimes: ["evening", "afternoon", "anytime"], prohibited: ["morning"] },
        { label: "Dinner/Nightlife", allowedTimes: ["evening", "nightlife", "dinner"], prohibited: ["morning"] }
    ];

    for (const bucket of dayBuckets) {
        const region = regionMap.get(bucket.region_id);

        // Basic fallback if region missing
        if (!region) {
            dayPlans.push({
                day: bucket.day,
                region_id: bucket.region_id,
                region_name: bucket.region_name,
                places: { main: [], optional: [] },
            });
            continue;
        }

        // Get all unused places
        let available = (region.places || []).filter(p => !usedPlaces.has(p.name));

        // 1. Fill Main Slots based on Schedule
        const mainPicks = [];
        let lastSubcategory = null;

        for (const slot of dailySchedule) {
            const candidate = findBestCandidate(available, slot, lastSubcategory);
            if (candidate) {
                mainPicks.push(candidate);
                usedPlaces.add(candidate.name);
                lastSubcategory = candidate.subcategory || candidate.category;

                // Refresh available list
                available = available.filter(p => p.name !== candidate.name);
            }
        }

        // 2. Fill Optional Slots (3 places) - looser rules, just variety
        const optionalPicks = [];
        for (let i = 0; i < 3; i++) {
            // Try to pick something different from the last main pick
            const candidate = findBestCandidate(available, { allowedTimes: ["anytime", "morning", "afternoon", "evening"] }, lastSubcategory);
            if (candidate) {
                optionalPicks.push(candidate);
                usedPlaces.add(candidate.name);
                lastSubcategory = candidate.subcategory;
                available = available.filter(p => p.name !== candidate.name);
            }
        }

        dayPlans.push({
            day: bucket.day,
            region_id: bucket.region_id,
            region_name: bucket.region_name,
            places: {
                main: mainPicks,
                optional: optionalPicks,
            },
        });
    }

    return dayPlans;
}

/**
 * Finds the best place for a specific time slot.
 */
function findBestCandidate(pool, slot, lastSubcategory) {
    if (!pool || pool.length === 0) return null;

    // Filter by Time
    let candidates = pool.filter(p => {
        const time = (p.best_time || "anytime").toLowerCase();
        // Check prohibited
        if (slot.prohibited && slot.prohibited.includes(time)) return false;
        // Check allowed (if strict) or just prioritize
        return true;
    });

    // Score candidates
    // Higer score = better match
    candidates.sort((a, b) => {
        const scoreA = calculateScore(a, slot, lastSubcategory);
        const scoreB = calculateScore(b, slot, lastSubcategory);
        return scoreB - scoreA; // Descending
    });

    return candidates[0] || null;
}

function calculateScore(place, slot, lastSubcategory) {
    let score = 0;

    const time = (place.best_time || "anytime").toLowerCase();
    const priority = place.priority;
    const subcat = place.subcategory || place.category;

    // 1. Time Match (+50)
    if (slot.allowedTimes && slot.allowedTimes.includes(time)) {
        // Give higher points if it matches the PRIMARY intent (first in list)
        if (time === slot.allowedTimes[0]) score += 50;
        else score += 30;
    }

    // 2. Priority match (+20 for main)
    if (priority === "main") score += 20;

    // 3. Variety Check (-40 if same subcategory as previous)
    if (lastSubcategory && subcat === lastSubcategory) {
        score -= 40;
    }

    return score;
}

export { allocatePlacesToDayBuckets };

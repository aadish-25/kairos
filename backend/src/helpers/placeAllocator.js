import ApiError from "../utils/ApiError.js";

/**
 * Smart place allocator that builds natural day flows.
 *
 * Strategy:
 *   1. Group available places by best_time
 *   2. Fill each day with a natural flow: Morning → Daytime → Lunch → Afternoon → Dinner
 *   3. Enforce variety: avoid consecutive picks from the SAME SUBCATEGORY.
 *      (e.g., Beach -> Fort is fine. Beach -> Beach is not ideal unless we run out).
 *   4. Target ~5 main + ~3 optional per day.
 */
function allocatePlacesToDayBuckets(dayBuckets, destinationContext) {
    if (!Array.isArray(dayBuckets)) {
        throw new ApiError(500, "Invalid day buckets");
    }

    if (!destinationContext || !Array.isArray(destinationContext.regions)) {
        throw new ApiError(500, "Invalid destination context");
    }

    const regionMap = new Map();
    for (const region of destinationContext.regions) {
        regionMap.set(region.id, region);
    }

    const usedPlaces = new Set();
    const dayPlans = [];

    for (const bucket of dayBuckets) {
        const region = regionMap.get(bucket.region_id);
        if (!region) {
            dayPlans.push({
                day: bucket.day,
                region_id: bucket.region_id,
                region_name: bucket.region_name,
                places: { main: [], optional: [] },
            });
            continue;
        }

        // Get all unused places for this region
        const available = (region.places || []).filter(
            (p) => !usedPlaces.has(p.name)
        );

        // Separate by priority
        const mainPool = available.filter((p) => p.priority === "main");
        const optionalPool = available.filter((p) => p.priority === "optional");

        // Build the day using smart picking
        const mainPicks = smartPick(mainPool, 5, usedPlaces);

        // If we didn't get enough main picks, promote optionals
        if (mainPicks.length < 3) {
            const extraNeeded = 3 - mainPicks.length;
            const promoted = smartPick(optionalPool, extraNeeded, usedPlaces);
            mainPicks.push(...promoted);
        }

        const optionalPicks = smartPick(optionalPool, 3, usedPlaces);

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
 * Smart picking: select places while maximizing SUBCATEGORY variety.
 *
 * Algorithm:
 *   1. Group by subcategory (or category if subcategory is missing)
 *   2. Round-robin through groups
 *   3. Continue until we reach the desired count
 */
function smartPick(candidates, count, usedPlaces) {
    if (!candidates.length || count <= 0) return [];

    // Group by SUBCATEGORY for better variety (Beach vs Waterfall vs Fort)
    // Fallback to Category if subcategory isn't clear
    const byGroup = new Map();
    for (const place of candidates) {
        if (usedPlaces.has(place.name)) continue;

        // Use subcategory if present, else category, else "other"
        const group = place.subcategory || place.category || "other";

        if (!byGroup.has(group)) byGroup.set(group, []);
        byGroup.get(group).push(place);
    }

    const picks = [];
    const groupKeys = [...byGroup.keys()];
    let groupIndex = 0;

    // Round-robin through groups
    while (picks.length < count && groupKeys.length > 0) {
        const group = groupKeys[groupIndex % groupKeys.length];
        const pool = byGroup.get(group);

        if (pool && pool.length > 0) {
            const place = pool.shift();
            if (!usedPlaces.has(place.name)) {
                picks.push(place);
                usedPlaces.add(place.name);
            }
        }

        // Remove exhausted groups
        if (!pool || pool.length === 0) {
            const idx = groupKeys.indexOf(group);
            if (idx !== -1) groupKeys.splice(idx, 1);
            if (groupKeys.length === 0) break;
            // Don't increment index since array shifted
        } else {
            groupIndex++;
        }
    }

    return picks;
}

export { allocatePlacesToDayBuckets };

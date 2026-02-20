import ApiError from "../../utils/ApiError.js";

/**
 * Logic:
 * 1. Calculate a "Weight" for each region.
 *    Score = (Count of 'main' places * 2) + (Total places * 1) + (Count of unique subcategories * 1)
 * 2. Distribute total trip days proportionally to these scores.
 * 3. Ensure every valid region gets at least 1 day.
 * 4. Assign remainder days to the highest-scoring regions.
 */
function calculateRegionScores(regions) {
    const FOOD_CATS = new Set(['food', 'nightlife', 'restaurant', 'cafe', 'bar']);

    return regions.map(region => {
        let mainCount = 0;
        const subcats = new Set();

        // Only count genuine attractions (not food, not rescued from other regions)
        const validPlaces = (region.places || []).filter(p =>
            !FOOD_CATS.has(p.category) && !p._rescued_from
        );

        validPlaces.forEach(p => {
            if (p.priority === 'main') mainCount++;
            if (p.subcategory) subcats.add(p.subcategory);
        });

        const score = (mainCount * 2) + (validPlaces.length * 1) + (subcats.size * 1);
        return { ...region, score };
    });
}

export function decideItineraryShape(totalDays, destinationContext) {
    if (!totalDays || typeof totalDays !== "number" || totalDays <= 0) {
        throw new ApiError(400, "Invalid number of days");
    }

    if (!destinationContext || !destinationContext.regions) {
        throw new ApiError(500, "Invalid destination context");
    }

    const { regions, travel_profile } = destinationContext;

    // Trip Length Warning (Fix 7)
    if (travel_profile?.min_days && totalDays < travel_profile.min_days) {
        console.log(`[Shaper] ⚠️ Warning: ${totalDays} days requested but profile recommends minimum ${travel_profile.min_days}`);
    }

    // 1. Score Valid Regions
    const scoredRegions = calculateRegionScores(regions);

    // Sort by Score DESC
    scoredRegions.sort((a, b) => b.score - a.score);

    const validRegions = scoredRegions.filter(r => r.score > 0);
    const totalScore = validRegions.reduce((sum, r) => sum + r.score, 0);

    // If no scores (empty places), fallback to simple distribution or just 1st region
    if (totalScore === 0) {
        return {
            total_days: totalDays,
            stay_type: 'single',
            regions_plan: validRegions.length > 0
                ? [{ region_id: validRegions[0].id, region_name: validRegions[0].name, days: totalDays, stay_required: true }]
                : []
        };
    }

    // 2. Proportional Allocation
    // Initial allocation based on score share
    const regionsPlan = validRegions.map(r => {
        let days = Math.floor((r.score / totalScore) * totalDays);
        return {
            region_id: r.id,
            region_name: r.name,
            score: r.score,
            days,
            stay_required: false
        };
    });

    // 3. Minimum Day Floor
    // Short trips (< 3 days): Focus on single best region — no region-hopping
    // 3+ days: Allow multi-region, but cap to available days
    const MIN_DAYS_FOR_MULTI_REGION = 3;

    if (totalDays < MIN_DAYS_FOR_MULTI_REGION) {
        // Short trip: keep only the top-scored region
        regionsPlan.length = 1;
        regionsPlan[0].days = totalDays;
    } else if (totalDays < regionsPlan.length) {
        // Medium trip: keep top N regions that fit
        regionsPlan.length = totalDays;
        for (const r of regionsPlan) {
            r.days = 1;
        }
    } else {
        for (const r of regionsPlan) {
            if (r.days === 0) r.days = 1;
        }
    }

    // Cap: no single region gets more than 50% of total days (unless only 1 region)
    if (regionsPlan.length > 1) {
        const maxDays = Math.ceil(totalDays * 0.5);
        for (const r of regionsPlan) {
            if (r.days > maxDays) r.days = maxDays;
        }
    }

    // Recalculate and distribute remainder
    let currentSum = regionsPlan.reduce((sum, r) => sum + r.days, 0);

    // If we over-allocated (due to min floors), trim from lowest scorer
    while (currentSum > totalDays && regionsPlan.length > 1) {
        const lowest = regionsPlan.reduce((min, r) => r.score < min.score && r.days > 1 ? r : min, regionsPlan[0]);
        if (lowest.days > 1) { lowest.days--; currentSum--; }
        else break;
    }

    // Distribute remaining days to highest scorers round-robin
    let i = 0;
    while (currentSum < totalDays) {
        if (regionsPlan[i]) {
            regionsPlan[i].days++;
            currentSum++;
        }
        i = (i + 1) % regionsPlan.length;
    }

    // Filter out regions with 0 days (shouldn't happen now)
    const finalPlan = regionsPlan.filter(r => r.days > 0);

    // 4. Stay Type Logic
    let stay_type = 'single';
    if (travel_profile?.spread === 'wide' && totalDays > 3 && finalPlan.length > 1) {
        stay_type = 'split';
    }

    // Set stay_required
    finalPlan.forEach((r, idx) => {
        r.stay_required = (stay_type === 'split') || (stay_type === 'single' && idx === 0);
    });

    return {
        total_days: totalDays,
        stay_type,
        regions_plan: finalPlan
    };
}

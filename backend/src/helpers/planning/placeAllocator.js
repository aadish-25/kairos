import { clusterPlaces, getDistance } from "../geo/geoClustering.js";
import { pickMealFromPool } from "./foodPoolBuilder.js";
import { SLOT_ORDER } from "./assignDaySlots.js";

/**
 * Smart Place Allocator (V2 — Two-Phase + Pacing + Per-Day Priority)
 * 
 * Phase 1: Lock Attractions (non-food only, from geo-clusters)
 * Phase 2: Compute Day Centroid (frozen after this)
 * Phase 3: Fill Meals Near Centroid (from food pool, region-first)
 * Phase 4: Recalculate Main/Optional + Pacing enforcement
 */

const FOOD_CATEGORIES = new Set(["food", "nightlife", "restaurant", "cafe", "bar"]);
const HEAVY_PHYSICAL = new Set(["waterfall", "trek", "hike", "peak", "climbing", "kayaking", "rafting"]);

// ─── Caps ───
const MAX_NONFOOD_MAINS = 4;
const MAX_FOOD_MAINS = 3;
const MAX_HEAVY_PHYSICAL = 3;

export function allocatePlacesToDayBuckets(dayBuckets, destinationContext) {
    // ─── 0. Setup ───
    const regionGroups = {};
    destinationContext.regions.forEach(region => {
        if (region.places) {
            region.places.forEach(p => {
                p.region_id = region.id;
                if (!regionGroups[region.id]) regionGroups[region.id] = [];
                regionGroups[region.id].push(p);
            });
        }
    });

    const usedPlaceNames = new Set();
    const dayPlans = [];

    // Pre-calculate Geo Clusters (non-food only)
    const regionDayCounts = {};
    dayBuckets.forEach(b => {
        regionDayCounts[b.region_id] = (regionDayCounts[b.region_id] || 0) + 1;
    });

    const regionClusters = {};
    for (const [regionId, places] of Object.entries(regionGroups)) {
        // Only cluster non-food places for Phase 1
        const attractions = places.filter(p => !FOOD_CATEGORIES.has(p.category));
        const k = regionDayCounts[regionId] || 1;
        regionClusters[regionId] = clusterPlaces(attractions, k);
    }

    const nextClusterIndex = {};

    // Get food pool (built externally and attached to context)
    const foodPool = destinationContext._foodPool || { breakfast: [], lunch: [], dinner: [] };

    // Track meals from previous day to prevent adjacent-day repeats
    let previousDayMeals = new Set();

    // ─── Build Day Plans ───
    for (const bucket of dayBuckets) {
        const dayPlan = {
            day: bucket.day,
            region_id: bucket.region_id,
            region_name: bucket.region_name,
            places: { main: [], optional: [] },
        };

        // ═══════════════════════════════════════════
        // PHASE 1: Lock Attractions (non-food only)
        // ═══════════════════════════════════════════
        const currentClusterIdx = nextClusterIndex[bucket.region_id] || 0;
        let clusterPlacesForDay = [];
        if (regionClusters[bucket.region_id]?.[currentClusterIdx]) {
            clusterPlacesForDay = regionClusters[bucket.region_id][currentClusterIdx];
        } else {
            // Fallback: all remaining non-food from region
            clusterPlacesForDay = (regionGroups[bucket.region_id] || [])
                .filter(p => !FOOD_CATEGORIES.has(p.category));
        }
        nextClusterIndex[bucket.region_id] = currentClusterIdx + 1;

        // Filter to available only
        let availableAttractions = clusterPlacesForDay.filter(p => !usedPlaceNames.has(p.name));

        // Sort by quality and time-fit
        const attractionSlots = [
            { label: "Morning", times: ["morning", "anytime"] },
            { label: "Midday", times: ["morning", "afternoon", "anytime"] },
            { label: "Afternoon", times: ["afternoon", "anytime"] },
            { label: "Evening", times: ["evening", "anytime"] },
        ];

        const lockedAttractions = [];
        const subcategoryCounts = {};
        let heavyCount = 0;

        for (const slot of attractionSlots) {
            if (availableAttractions.length === 0) break;

            const candidate = pickBestAttraction(
                availableAttractions, slot.times, subcategoryCounts, heavyCount, bucket.region_id
            );

            if (candidate) {
                lockedAttractions.push(candidate);
                usedPlaceNames.add(candidate.name);
                availableAttractions = availableAttractions.filter(p => p.name !== candidate.name);

                let sub = (candidate.subcategory || candidate.category || "other").toLowerCase();
                if (sub === "other") sub = (candidate.category || "other").toLowerCase();

                subcategoryCounts[sub] = (subcategoryCounts[sub] || 0) + 1;
                if (HEAVY_PHYSICAL.has(sub)) heavyCount++;
            }
        }

        // [FAILSAFE] If 0 attractions locked, try any unused from region
        if (lockedAttractions.length === 0) {
            const rescue = (regionGroups[bucket.region_id] || [])
                .filter(p => !usedPlaceNames.has(p.name) && !FOOD_CATEGORIES.has(p.category));

            for (let i = 0; i < Math.min(2, rescue.length); i++) {
                lockedAttractions.push(rescue[i]);
                usedPlaceNames.add(rescue[i].name);
            }

            if (lockedAttractions.length === 0) {
                console.log(`[Allocator] Day ${bucket.day}: No attractions available for ${bucket.region_name}. Using empty.`);
            }
        }

        // ═══════════════════════════════════════════
        // PHASE 1b: Category Diversity Check
        // ═══════════════════════════════════════════
        // Prevent all-beach/all-nature days when non-nature options exist
        const categorySet = new Set(lockedAttractions.map(a => (a.subcategory || a.category || '').toLowerCase()));
        if (categorySet.size === 1 && lockedAttractions.length >= 3) {
            const dominantCategory = [...categorySet][0];
            const nonDominant = (regionGroups[bucket.region_id] || [])
                .filter(p => !FOOD_CATEGORIES.has(p.category)
                    && (p.subcategory || p.category || '').toLowerCase() !== dominantCategory
                    && !usedPlaceNames.has(p.name));

            if (nonDominant.length > 0) {
                // Replace the lowest-quality locked attraction with a diverse one
                const sorted = [...lockedAttractions].sort((a, b) => (a.quality_score || 0) - (b.quality_score || 0));
                const swapped = sorted[0];
                const swapIdx = lockedAttractions.indexOf(swapped);
                if (swapIdx >= 0) {
                    usedPlaceNames.delete(swapped.name);
                    lockedAttractions[swapIdx] = nonDominant[0];
                    usedPlaceNames.add(nonDominant[0].name);
                }
            }
        }

        // ═══════════════════════════════════════════
        // PHASE 2: Compute Day Centroid (Frozen)
        // ═══════════════════════════════════════════
        const geoPlaces = lockedAttractions.filter(p => p.lat && p.lon);
        let dayCentroid = null;

        if (geoPlaces.length > 0) {
            dayCentroid = {
                lat: geoPlaces.reduce((s, p) => s + p.lat, 0) / geoPlaces.length,
                lon: geoPlaces.reduce((s, p) => s + p.lon, 0) / geoPlaces.length,
            };
        }

        // ═══════════════════════════════════════════
        // PHASE 3: Fill Meals Near Centroid
        // ═══════════════════════════════════════════
        // Target: 3 meals (1B + 1L + 1D). Accept: 2. Minimum: 1.
        const mealSlots = ["breakfast", "lunch", "dinner"];
        const mealsPlaced = [];

        for (const mealType of mealSlots) {
            const dayUsedNames = new Set([
                ...dayPlan.places.main.map(p => p.name),
                ...lockedAttractions.map(p => p.name),
                ...mealsPlaced.map(p => p.name),
                ...previousDayMeals, // prevent adjacent-day repeats
            ]);

            const meal = pickMealFromPool(
                foodPool[mealType],
                dayCentroid,
                bucket.region_id,
                dayUsedNames,
                10 // 10km radius
            );

            if (meal) {
                mealsPlaced.push({ ...meal, _slot: mealType });
            }
        }

        if (mealsPlaced.length === 0) {
            console.log(`[Allocator] Day ${bucket.day}: No meals found within 10km of centroid. Day will have 0 food.`);
        }

        // ═══════════════════════════════════════════
        // PHASE 3b: Evening Activity (Optional Nightlife)
        // ═══════════════════════════════════════════
        const nightlifePlaces = (regionGroups[bucket.region_id] || [])
            .filter(p => (p.category === 'nightlife' || p.category === 'bar')
                && !usedPlaceNames.has(p.name)
                && !mealsPlaced.some(m => m.name === p.name));

        let eveningActivity = null;
        if (nightlifePlaces.length > 0) {
            eveningActivity = nightlifePlaces[0];
            usedPlaceNames.add(eveningActivity.name);
        }

        // ═══════════════════════════════════════════
        // PHASE 4: Recalculate Main/Optional + Pacing
        // ═══════════════════════════════════════════
        // All inherited priority is discarded. Re-score per day.

        const allDayPlaces = [
            ...lockedAttractions.map(p => ({ ...p, _type: "attraction" })),
            ...mealsPlaced.map(p => ({ ...p, _type: "meal" })),
            ...(eveningActivity ? [{ ...eveningActivity, _type: "evening", meal_type: "dinner", priority: "optional" }] : []),
        ];

        // Score each place for day-level importance
        allDayPlaces.forEach(p => {
            let dayScore = 0;

            // Quality contribution
            dayScore += (p.quality_score || 0) * 0.3;

            // Uniqueness: if subcategory is rare in whole trip, boost
            dayScore += 10;

            // Slot fit bonus
            if (p._type === "meal" && p._slot) dayScore += 15;
            if (p._type === "attraction") dayScore += 20;

            p._dayScore = dayScore;
        });

        // Sort by day score DESC
        allDayPlaces.sort((a, b) => b._dayScore - a._dayScore);

        // Apply split caps
        let nonFoodMainCount = 0;
        let foodMainCount = 0;
        let heavyMainCount = 0;

        for (const place of allDayPlaces) {
            // DEBUG SCORE
            if (place.name === 'Chapora Beach' || place.name.includes('Chapora') || place.name.includes('Fort')) {
                console.log(`[Allocator Debug] Place: ${place.name}, cat: ${place.category}, q_score: ${place.quality_score}, prior: ${place.priority}`);
            }

            const isFood = FOOD_CATEGORIES.has(place.category) || place._type === "meal";
            const sub = (place.subcategory || place.category || "other").toLowerCase();
            const isHeavy = HEAVY_PHYSICAL.has(sub);

            let shouldBeMain = false;

            if (isFood) {
                if (foodMainCount < MAX_FOOD_MAINS) {
                    shouldBeMain = true;
                    foodMainCount++;
                }
            } else {
                if (nonFoodMainCount < MAX_NONFOOD_MAINS) {
                    // Pacing: heavy physical cap
                    if (isHeavy && heavyMainCount >= MAX_HEAVY_PHYSICAL) {
                        shouldBeMain = false; // demote heavy excess to optional
                    } else {
                        shouldBeMain = true;
                        nonFoodMainCount++;
                        if (isHeavy) heavyMainCount++;
                    }
                }
            }

            place.priority = shouldBeMain ? "main" : "optional";

            // Clean internal fields before output
            const cleanPlace = { ...place };
            delete cleanPlace._type;
            delete cleanPlace._slot;
            delete cleanPlace._dayScore;
            delete cleanPlace._source;
            delete cleanPlace._pick_dist;
            delete cleanPlace._borrowed;
            delete cleanPlace._expanded;
            delete cleanPlace._source;
            delete cleanPlace._rescued_from;
            delete cleanPlace._dinner_clone;

            if (shouldBeMain) {
                dayPlan.places.main.push(cleanPlace);
            } else {
                dayPlan.places.optional.push(cleanPlace);
            }
        }

        // Fill remaining optional slots from leftover attractions
        const optionalTarget = Math.max(0, 8 - dayPlan.places.main.length - dayPlan.places.optional.length);
        if (optionalTarget > 0) {
            const leftover = availableAttractions.filter(p => !usedPlaceNames.has(p.name));

            let optionalCount = 0;
            for (const p of leftover) {
                if (optionalCount >= optionalTarget) break;

                let sub = (p.subcategory || p.category || "other").toLowerCase();
                if (sub === "other") sub = (p.category || "other").toLowerCase();

                // [Diversity Filter for Optionals] Prevent junkyard stuffing
                if (subcategoryCounts[sub] >= 3) {
                    continue;
                }
                // Allow a slight relaxation for museums/forts as optionals (max 2 total per day)
                if ((sub === "museum" || sub === "fort") && subcategoryCounts[sub] >= 2) continue;
                if (HEAVY_PHYSICAL.has(sub) && heavyCount >= MAX_HEAVY_PHYSICAL) continue;

                dayPlan.places.optional.push({ ...p, priority: "optional" });
                usedPlaceNames.add(p.name);

                subcategoryCounts[sub] = (subcategoryCounts[sub] || 0) + 1;
                if (HEAVY_PHYSICAL.has(sub)) heavyCount++;
                optionalCount++;
            }
        }

        dayPlans.push(dayPlan);

        // ═══════════════════════════════════════════
        // PHASE 5: Time-of-Day Ordering
        // ═══════════════════════════════════════════
        // Sort mains by day_slot: morning → midday → afternoon → evening
        dayPlan.places.main.sort((a, b) =>
            (SLOT_ORDER[a.day_slot] ?? 1.5) - (SLOT_ORDER[b.day_slot] ?? 1.5)
        );
        dayPlan.places.optional.sort((a, b) =>
            (SLOT_ORDER[a.day_slot] ?? 1.5) - (SLOT_ORDER[b.day_slot] ?? 1.5)
        );

        // Update previousDayMeals for adjacent-day dedup
        previousDayMeals = new Set(mealsPlaced.map(m => m.name));

        console.log(`[Allocator] Day ${bucket.day} (${bucket.region_name}): ${dayPlan.places.main.length} main, ${dayPlan.places.optional.length} optional, ${mealsPlaced.length} meals`);
    }

    return dayPlans;
}

// ─── Helpers ───

/**
 * Pick the best non-food attraction for a time slot.
 * Respects subcategory caps and heavy physical limits.
 */
function pickBestAttraction(places, allowedTimes, subcategoryCounts, heavyCount, regionId) {
    let bestScore = -1;
    let bestPlace = null;

    for (const place of places) {
        let sub = (place.subcategory || place.category || "other").toLowerCase();
        if (sub === "other") sub = (place.category || "other").toLowerCase();

        // Hard filters
        if (subcategoryCounts[sub] >= 3) continue;  // Allow up to 3 of same subcategory (e.g. beaches)
        if ((sub === "museum" || sub === "fort") && subcategoryCounts[sub] >= 1) continue;
        if (HEAVY_PHYSICAL.has(sub) && heavyCount >= MAX_HEAVY_PHYSICAL) continue;

        // Scoring
        let score = 50;

        // Time match
        if (place.best_time && allowedTimes.includes(place.best_time)) {
            score += 20;
        } else if (place.best_time === "anytime") {
            score += 5;
        } else if (place.best_time) {
            score -= 15;
        }

        // Quality bonus
        if (place.quality_score) {
            score += Math.min(15, place.quality_score * 0.15);
        }

        // Region bonus
        if (place.region_id === regionId) score += 5;

        // Subcategory diversity
        if (subcategoryCounts[sub] >= 1) score -= 10;

        score = Math.max(0, Math.min(100, score));

        if (score > bestScore) {
            bestScore = score;
            bestPlace = place;
        }
    }

    return bestPlace;
}

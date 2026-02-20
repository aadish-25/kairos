import { getDistance } from "../geo/geoClustering.js";
import { assignDaySlot } from "./assignDaySlots.js";

/**
 * Food Pool Builder
 * 
 * Extracts all food/nightlife from rawPlaces, infers meal_type,
 * and organizes into pools for the day allocator to consume.
 * 
 * This is a DETERMINISTIC layer — no LLM involved.
 */

const FOOD_CATEGORIES = new Set(["restaurant", "cafe", "nightlife", "bar"]);

const BREAKFAST_SIGNALS = new Set([
    "breakfast", "bakery", "pastry", "pancake", "brunch",
    "doughnut", "bagel", "coffee_shop"
]);

const DINNER_SIGNALS = new Set([
    "bar", "pub", "nightclub", "fine_dining", "cocktail"
]);

/**
 * Infer meal_type from place category, name, and available tag keys.
 * 
 * NOTE: After normalizeRawPlaces, `osm_keys` is an ARRAY of key names (e.g. ["name", "cuisine", "amenity"]),
 * NOT a key-value object. So we infer from category, name, and tag key presence.
 */
function inferMealType(place) {
    const category = (place.category || "").toLowerCase();
    const name = (place.name || "").toLowerCase();
    const tagKeys = Array.isArray(place.osm_keys) ? place.osm_keys : Object.keys(place.osm_keys || {});
    const hasKey = (key) => tagKeys.includes(key);

    // 1. Cafe/bakery category → breakfast
    if (category === "cafe") {
        return "breakfast";
    }
    if (name.includes("bakery") || name.includes("cafe") || name.includes("coffee") ||
        name.includes("brunch") || name.includes("breakfast")) {
        return "breakfast";
    }

    // 2. Nightlife category → dinner
    if (category === "nightlife" || category === "bar") {
        return "dinner";
    }
    if (name.includes("bar") || name.includes("pub") || name.includes("lounge") ||
        name.includes("club") || name.includes("cocktail")) {
        return "dinner";
    }

    // 3. Restaurant with dinner-ish name → dinner
    if (category === "restaurant" && (
        name.includes("grill") || name.includes("tandoor") || name.includes("bistro") ||
        name.includes("kitchen") || name.includes("steakhouse") || name.includes("seafood")
    )) {
        return "dinner";
    }

    // 4. Fallback: lunch (safest default for generic restaurants)
    return "lunch";
}

/**
 * Build food pools from raw place data.
 * 
 * @param {Array} rawPlaces - Full set of normalized places from fetchRawPlaces
 * @returns {{ breakfast: Array, lunch: Array, dinner: Array }} sorted by quality_score DESC
 */
export function buildFoodPool(rawPlaces) {
    const pools = { breakfast: [], lunch: [], dinner: [] };

    const foodPlaces = rawPlaces.filter(p => FOOD_CATEGORIES.has(p.category));

    for (const place of foodPlaces) {
        const mealType = inferMealType(place);

        const poolEntry = {
            name: place.name,
            lat: place.lat,
            lon: place.lon,
            category: place.category,
            raw_type: place.raw_type,
            meal_type: mealType,
            quality_score: place.quality_score || 0,
            day_slot: place.day_slot || assignDaySlot(place),
            osm_keys: place.osm_keys,
            _source: "food_pool"
        };

        pools[mealType].push(poolEntry);

        // DINNER DUPLICATION: Restaurants tagged as lunch also go into dinner pool
        // This ensures the dinner pool is never empty
        if (mealType === "lunch" && place.category === "restaurant") {
            pools.dinner.push({ ...poolEntry, meal_type: "dinner", _source: "food_pool_dinner_clone" });
        }
    }

    // Sort each pool by quality DESC
    for (const key of Object.keys(pools)) {
        pools[key].sort((a, b) => b.quality_score - a.quality_score);
    }

    console.log(`[FoodPool] Built pools: breakfast=${pools.breakfast.length}, lunch=${pools.lunch.length}, dinner=${pools.dinner.length}`);

    return pools;
}

/**
 * Find the best food place from a pool within radius of a centroid.
 * Uses region-first, then global fallback with double-gate.
 * 
 * Items are NOT removed from the pool — instead tracked by `usedNames`.
 * This allows reuse across non-adjacent days when the pool is small.
 * 
 * @param {Array} pool - Meal pool (breakfast/lunch/dinner)
 * @param {{ lat: number, lon: number }} centroid - Day's attraction centroid
 * @param {string} regionId - Current day's region
 * @param {Set} usedNames - Already-assigned place names for THIS day
 * @param {number} radiusKm - Max distance (default 10)
 * @returns {Object|null} - Best matching food place, or null
 */
export function pickMealFromPool(pool, centroid, regionId, usedNames, radiusKm = 10) {
    if (!centroid || !centroid.lat || !centroid.lon) return null;

    // Pass 1: Same-region, within radius
    for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (usedNames.has(p.name)) continue;
        if (p.region_id && p.region_id !== regionId) continue;

        const dist = getDistance(centroid.lat, centroid.lon, p.lat, p.lon);
        if (dist <= radiusKm) {
            return { ...p, _pick_dist: Math.round(dist * 10) / 10 };
        }
    }

    // Pass 2: Global pool, within radius (cross-region borrow)
    for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (usedNames.has(p.name)) continue;

        const dist = getDistance(centroid.lat, centroid.lon, p.lat, p.lon);
        if (dist <= radiusKm) {
            return { ...p, _pick_dist: Math.round(dist * 10) / 10, _borrowed: true };
        }
    }

    // Pass 3: Expanded radius (15km) — last resort before giving up
    const expandedRadius = radiusKm * 1.5;
    for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (usedNames.has(p.name)) continue;

        const dist = getDistance(centroid.lat, centroid.lon, p.lat, p.lon);
        if (dist <= expandedRadius) {
            return { ...p, _pick_dist: Math.round(dist * 10) / 10, _borrowed: true, _expanded: true };
        }
    }

    // Nothing within expanded radius — skip gracefully
    return null;
}

/**
 * Tag each food pool entry with region_id based on nearest region centroid.
 * 
 * @param {Object} pools - { breakfast, lunch, dinner }
 * @param {Array} regions - Region objects with places that have lat/lon
 */
export function tagFoodPoolWithRegions(pools, regions) {
    // Compute region centroids
    const centroids = regions.map(r => {
        const validPlaces = (r.places || []).filter(p => p.lat && p.lon);
        if (validPlaces.length === 0) return { id: r.id, lat: null, lon: null };

        const lat = validPlaces.reduce((s, p) => s + p.lat, 0) / validPlaces.length;
        const lon = validPlaces.reduce((s, p) => s + p.lon, 0) / validPlaces.length;
        return { id: r.id, lat, lon };
    }).filter(c => c.lat !== null);

    // Assign each food place to nearest region
    for (const key of Object.keys(pools)) {
        for (const place of pools[key]) {
            let minDist = Infinity;
            let bestRegion = null;

            for (const c of centroids) {
                const dist = getDistance(place.lat, place.lon, c.lat, c.lon);
                if (dist < minDist) {
                    minDist = dist;
                    bestRegion = c.id;
                }
            }

            place.region_id = bestRegion;
            place._region_dist = Math.round(minDist * 10) / 10;
        }
    }
}

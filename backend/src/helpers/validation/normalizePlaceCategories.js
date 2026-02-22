import { writeFileSync } from 'fs';

/**
 * Post-Stage-2 Category Normalizer
 *
 * Stage 2 AI assigns categories like "nature", "heritage", "food" — its own broad buckets.
 * Our internal system needs specific categories: beach, fort, temple, restaurant, cafe, etc.
 *
 * Strategy (3-tier, in order):
 * 1. Look up the place in rawPlaces by exact name → use the pre-computed `category` (most accurate)
 * 2. Map Stage 2's AI category to our internal bucket via a fixed mapping table
 * 3. Fallback to "other"
 *
 * This runs AFTER filterHallucinatedPlaces (so all names are already corrected to exact raw names).
 */

// Stage 2 category → internal fallback when rawPlaces lookup misses
const STAGE2_CATEGORY_MAP = {
    // Stage 2 broad → our internal
    "nature": "nature",       // overridden by raw lookup for beaches/peaks/etc.
    "heritage": "attraction",   // overridden by raw lookup for forts/palaces/temples
    "food": "restaurant",
    "nightlife": "nightlife",
    "relaxation": "spa",
    "shopping": "attraction",
    "adventure": "nature",
    "cultural": "attraction",
    "spiritual": "temple",
    "other": "other",
    // Our own categories passed through unchanged
    "beach": "beach",
    "fort": "fort",
    "palace": "palace",
    "temple": "temple",
    "ghat": "ghat",
    "monument": "monument",
    "ruins": "ruins",
    "cave": "cave",
    "museum": "museum",
    "viewpoint": "viewpoint",
    "peak": "peak",
    "waterfall": "waterfall",
    "island": "island",
    "lake": "lake",
    "garden": "garden",
    "zoo": "zoo",
    "park": "park",
    "attraction": "attraction",
    "restaurant": "restaurant",
    "cafe": "cafe",
    "spa": "spa",
    "camping": "camping",
};

/**
 * @param {Object} structuredContext - Post-hallucination-filter stage2 output
 * @param {Array}  rawPlaces         - Original normalized places (with correct `category` field)
 * @returns {Object}                 - Same structure, but with corrected internal categories
 */
export function normalizePlaceCategories(structuredContext, rawPlaces) {
    // Build name → raw place lookup (lowercase for matching)
    const rawByName = new Map(
        rawPlaces.map(p => [(p.name || '').toLowerCase().trim(), p])
    );

    let restored = 0;
    let mapped = 0;

    // DEBUG: Log each lookup result
    const perPlaceDebug = [];
    for (const region of (structuredContext.regions || [])) {
        for (const place of (region.places || [])) {
            const norm = (place.name || '').toLowerCase().trim();
            const raw = rawByName.get(norm);
            perPlaceDebug.push(`"${norm}" | stage2_cat=${place.category} | raw_cat=${raw?.category ?? 'NOT_FOUND'} | raw_q=${raw?.quality_score ?? 'N/A'}`);
        }
    }
    try { writeFileSync('d:/my-projects/kairos/debug_names.txt', perPlaceDebug.join('\n')); } catch (e) { }

    for (const region of (structuredContext.regions || [])) {
        for (const place of (region.places || [])) {
            const norm = (place.name || '').toLowerCase().trim();
            const raw = rawByName.get(norm);

            if (raw?.category && raw.category !== 'unknown') {
                // Tier 1: Use the pre-scored category from normalization — most accurate
                if (place.category !== raw.category) {
                    place.category = raw.category;
                    restored++;
                }
                // Also restore quality_score if it's missing or 0
                if (!place.quality_score && raw.quality_score) {
                    place.quality_score = raw.quality_score;
                }
            } else if (place.category) {
                // Tier 2: Map Stage 2's category to internal equivalent
                const mapped_cat = STAGE2_CATEGORY_MAP[place.category?.toLowerCase()];
                if (mapped_cat && mapped_cat !== place.category) {
                    place.category = mapped_cat;
                    mapped++;
                }
            } else {
                place.category = 'other';
            }
        }
    }

    console.log(`[CategoryNormalizer] Restored ${restored} from raw data, mapped ${mapped} from AI categories`);
    return structuredContext;
}

/**
 * Validates and conforms places to the strict destination schema.
 * Acts as a final data sanitization layer before itinerary generation.
 */

// Allowed Enums
const VALID_CATEGORIES = new Set([
    // Internal specific categories (primary)
    'beach', 'fort', 'palace', 'temple', 'ghat', 'monument', 'ruins', 'cave',
    'museum', 'viewpoint', 'peak', 'waterfall', 'island', 'lake', 'garden',
    'zoo', 'nature', 'park', 'attraction', 'bridge',
    'restaurant', 'cafe', 'nightlife', 'spa', 'camping',
    // Legacy broad categories (still accepted for backward compat)
    'heritage', 'food', 'relaxation', 'shopping', 'adventure', 'other'
]);

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'cafe', 'bar']);

export function validateSchema(destinationContext) {
    console.log(`[SchemaValidation] Sanatizing data for ${destinationContext.name}...`);

    destinationContext.regions.forEach(region => {
        if (!region.places) return;

        region.places.forEach(place => {
            // 1. Category Enforcement & Auto-Correction
            if (!VALID_CATEGORIES.has(place.category)) {
                console.warn(`[SchemaValidation] Invalid category '${place.category}' for ${place.name}. Attempting to use subcategory as fallback...`);

                const sub = (place.subcategory || '').toLowerCase();

                // Intelligent fallback based on subcategory
                if (sub === 'pub' || sub === 'club' || sub === 'bar' || sub === 'lounge') {
                    place.category = 'nightlife';
                } else if (sub === 'church' || sub === 'mosque' || sub === 'shrine' || sub === 'synagogue' || sub === 'buddhist_temple' || sub === 'hindu_temple') {
                    place.category = 'temple';
                } else if (VALID_CATEGORIES.has(sub)) {
                    // If the subcategory is a perfectly valid main category (e.g., 'beach'), promote it
                    place.category = sub;
                } else {
                    // Final fallback
                    place.category = 'attraction';
                }
            }

            // 2. Subcategory check
            if (!place.subcategory) {
                place.subcategory = 'other';
            }

            // 3. Meal Type Enforcement (Only for Food/Nightlife)
            const isFoodLink = place.category === 'food' || place.category === 'restaurant' || place.category === 'cafe' || place.category === 'nightlife';
            if (isFoodLink) {
                if (!place.meal_type || !VALID_MEAL_TYPES.has(place.meal_type)) {
                    // Infer default if missing
                    const sub = (place.subcategory || '').toLowerCase();
                    if (sub === 'cafe' || place.category === 'cafe') place.meal_type = 'cafe';
                    else if (sub === 'bar' || sub === 'pub' || sub === 'club' || place.category === 'nightlife') place.meal_type = 'bar';
                    else if (place.best_time === 'morning') place.meal_type = 'breakfast';
                    else if (place.best_time === 'evening' || place.best_time === 'night') place.meal_type = 'dinner';
                    else place.meal_type = 'lunch'; // default fallback

                    console.log(`[SchemaValidation] Inferred meal_type '${place.meal_type}' for ${place.name}`);
                }
            } else {
                // Ensure non-food places don't have meal_type (cleanup)
                place.meal_type = null;
            }

            // 4. Lat/Lon Type Check
            if (place.lat) place.lat = parseFloat(place.lat);
            if (place.lon) place.lon = parseFloat(place.lon);

            // 5. Specialty Array
            if (!Array.isArray(place.specialty)) {
                place.specialty = [];
            }
        });
    });

    return destinationContext;
}

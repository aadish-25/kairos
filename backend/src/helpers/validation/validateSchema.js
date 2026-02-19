/**
 * Validates and conforms places to the strict destination schema.
 * Acts as a final data sanitization layer before itinerary generation.
 */

// Allowed Enums
const VALID_CATEGORIES = new Set([
    'nature', 'heritage', 'food', 'nightlife', 'relaxation', 'shopping', 'adventure', 'attraction'
]);

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'cafe', 'bar']);

export function validateSchema(destinationContext) {
    console.log(`[SchemaValidation] Sanatizing data for ${destinationContext.name}...`);

    destinationContext.regions.forEach(region => {
        if (!region.places) return;

        region.places.forEach(place => {
            // 1. Category Enforcement & Auto-Correction
            if (!VALID_CATEGORIES.has(place.category)) {
                console.warn(`[SchemaValidation] Invalid category '${place.category}' for ${place.name}. Auto-correcting.`);

                // Correction Logic
                if (place.category === 'cafe') {
                    place.category = 'food';
                    place.subcategory = 'cafe';
                    place.meal_type = 'cafe';
                } else if (place.category === 'restaurant') {
                    place.category = 'food';
                    place.subcategory = 'restaurant';
                } else if (place.category === 'bar' || place.category === 'pub') {
                    place.category = 'nightlife';
                    place.subcategory = 'bar';
                    place.meal_type = 'bar';
                } else if (place.category === 'museum' || place.category === 'temple' || place.category === 'church') {
                    place.category = 'heritage';
                    place.subcategory = place.category; // current cat becomes subcat
                } else if (place.category === 'beach' || place.category === 'waterfall') {
                    place.category = 'nature';
                    place.subcategory = place.category;
                } else {
                    // Fallback
                    place.category = 'attraction';
                }
            }

            // 2. Subcategory check
            if (!place.subcategory) {
                place.subcategory = 'other';
            }

            // 3. Meal Type Enforcement (Only for Food/Nightlife)
            if (place.category === 'food' || place.category === 'nightlife') {
                if (!place.meal_type || !VALID_MEAL_TYPES.has(place.meal_type)) {
                    // Infer default if missing
                    if (place.subcategory === 'cafe') place.meal_type = 'cafe';
                    else if (place.subcategory === 'bar' || place.subcategory === 'club') place.meal_type = 'bar';
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

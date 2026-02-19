/**
 * Enforces strict Category matching based on Subcategory.
 * Resolves ambiguities where LLM might tag "Museum" as "Other" or "Attraction".
 */

const SUBCAT_MAPPING = {
    // Heritage
    'museum': 'heritage',
    'fort': 'heritage',
    'temple': 'heritage',
    'church': 'heritage',
    'monument': 'heritage',
    'palace': 'heritage',
    'ruins': 'heritage',

    // Nature
    'beach': 'nature',
    'waterfall': 'nature',
    'park': 'nature',
    'garden': 'nature',
    'lake': 'nature',

    // Nightlife
    'club': 'nightlife',
    'pub': 'nightlife',
    'lounge': 'nightlife',
    'bar': 'nightlife',

    // Adventure
    'trek': 'adventure',
    'hike': 'adventure',
    'watersport': 'adventure'
};

export function normalizeCategoryBySubcategory(destinationContext) {
    destinationContext.regions.forEach(region => {
        if (!region.places) return;

        region.places.forEach(place => {
            if (place.subcategory) {
                const sub = place.subcategory.toLowerCase().trim();
                const strictCat = SUBCAT_MAPPING[sub];

                if (strictCat && place.category !== strictCat) {
                    console.log(`[CategoryNorm] Correcting ${place.name}: ${place.category} -> ${strictCat} (due to subcat '${sub}')`);
                    place.category = strictCat;
                }
            }
        });
    });
    return destinationContext;
}

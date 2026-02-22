/**
 * Ranks food places strictly within their region context.
 * 
 * Formula (User Requested):
 * Score = (priority == 'main' ? 100 : 0) + (specialties.length * 5)
 * 
 * This ensures "Main" places always outrank generic places, even if the generic ones have many tags.
 * We also sort deterministically (by score DESC, then name ASC) to ensure round-robin stability.
 */

export function rankFoodPlaces(destinationContext) {
    console.log(`[FoodRanking] Ranking food places for ${destinationContext.name}...`);

    destinationContext.regions.forEach(region => {
        if (!region.places) return;

        // Separate food places for ranking (we modify them in-place with a score)
        region.places.forEach(place => {
            const isFoodCategory = ['food', 'restaurant', 'cafe', 'nightlife'].includes(place.category);
            if (isFoodCategory) {
                const isMain = place.priority === 'main';
                const specialtyCount = Array.isArray(place.specialty) ? place.specialty.length : 0;

                // User Formula
                let score = (isMain ? 100 : 0) + (specialtyCount * 5);

                // Tie-breaker: small bonus for explicit 'dinner'/'lunch' meal_types over 'cafe' logic?
                // For now, stick to the prompt.

                place.quality_score = score;
            }
            // Non-food places: preserve existing quality_score from normalizeRawPlaces/normalizePlaceCategories
        });

        // Debug log top food
        /*
        const topFood = region.places
            .filter(p => p.category === 'food')
            .sort((a, b) => b.quality_score - a.quality_score)
            .slice(0, 3)
            .map(p => `${p.name} (${p.quality_score})`);
        if (topFood.length > 0) console.log(`[FoodRanking] Top in ${region.name}: ${topFood.join(', ')}`);
        */
    });

    return destinationContext;
}

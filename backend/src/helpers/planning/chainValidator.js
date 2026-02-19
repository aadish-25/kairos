export function validateAndRepairChain(curatorOutput) {
    console.log("[ChainValidator] Validating Stage 2 Output...");
    const regions = curatorOutput.regions || [];
    let modified = false;

    regions.forEach(region => {
        // 1. ANCHOR CHECK
        // Definition: Non-food, Priority=main.
        const anchors = region.places.filter(p =>
            p.priority === 'main' &&
            !['food', 'nightlife', 'restaurant', 'cafe', 'bar'].includes(p.category)
        );

        if (anchors.length === 0) {
            console.warn(`[ChainValidator] Region '${region.name}' missing Anchor. Attempting repair...`);
            // Repair: Find best non-food candidate and promote
            const candidate = region.places.find(p =>
                !['food', 'nightlife', 'restaurant', 'cafe', 'bar'].includes(p.category)
            );

            if (candidate) {
                console.log(`[ChainValidator] Promoted '${candidate.name}' to Main Anchor.`);
                candidate.priority = 'main';
                modified = true;
            } else {
                console.error(`[ChainValidator] Region '${region.name}' has NO non-food places! This region is effectively a food court.`);
                // In a perfect world, we'd delete the region. For now, leave it but warn.
            }
        }

        // 2. FOOD CAP CHECK (40%)
        const foodPlaces = region.places.filter(p => ['food', 'nightlife', 'restaurant', 'cafe', 'bar'].includes(p.category));
        const total = region.places.length;

        if (total > 0) {
            const foodRatio = foodPlaces.length / total;
            if (foodRatio > 0.40) {
                console.warn(`[ChainValidator] Region '${region.name}' exceeds Food Cap (${(foodRatio * 100).toFixed(1)}%). Trimming...`);

                // Calculate how many to drop
                // Target: food / (non_food + food) <= 0.4
                // food <= 0.4(non_food + food)
                // food <= 0.4*non_food + 0.4*food
                // 0.6*food <= 0.4*non_food
                // food <= (0.4/0.6) * non_food = 0.66 * non_food

                const nonFoodCount = total - foodPlaces.length;
                const maxFood = Math.floor((0.4 / 0.6) * nonFoodCount);
                const toRemove = foodPlaces.length - maxFood;

                if (toRemove > 0) {
                    console.log(`[ChainValidator] Removing ${toRemove} lowest-priority food places.`);
                    // Sort by priority (optional first) then maybe random? logic says drop "optional" first.
                    // Assuming existing order implies some rank, or we trust 'priority'.

                    // Simple strategy: Remove 'optional' food first.
                    // We need to mutate the array.
                    let removedCount = 0;

                    // 1. Remove optional food
                    for (let i = region.places.length - 1; i >= 0; i--) {
                        if (removedCount >= toRemove) break;
                        const p = region.places[i];
                        if (['food', 'nightlife', 'restaurant', 'cafe', 'bar'].includes(p.category) && p.priority === 'optional') {
                            region.places.splice(i, 1);
                            removedCount++;
                        }
                    }

                    // 2. If still need to remove, remove 'main' food (rare but possible)
                    if (removedCount < toRemove) {
                        for (let i = region.places.length - 1; i >= 0; i--) {
                            if (removedCount >= toRemove) break;
                            const p = region.places[i];
                            if (['food', 'nightlife', 'restaurant', 'cafe', 'bar'].includes(p.category)) {
                                region.places.splice(i, 1);
                                removedCount++;
                            }
                        }
                    }

                    modified = true;
                }
            }
        }
    });

    if (modified) {
        console.log("[ChainValidator] Repairs applied.");
    } else {
        console.log("[ChainValidator] Validation Passed.");
    }

    return curatorOutput;
}

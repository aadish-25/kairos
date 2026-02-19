/**
 * Validates the composition of a single day plan.
 * Used during allocation (scoring penalty) or post-allocation (flagging/moving).
 * 
 * Rules:
 * 1. Max Main Places: 6 (Prevents overcrowding)
 * 2. Min Diversity: At least 1 Attraction + 1 Food/Nightlife (soft check)
 * 3. Max Same Subcategory: 3 (Hard Cap, e.g. max 3 beaches)
 */

export function validateDayComposition(dayPlan) {
    const mainPlaces = dayPlan.places.main || [];
    const report = { isValid: true, issues: [] };

    // 1. Max Main Cap
    if (mainPlaces.length > 6) {
        report.isValid = false;
        report.issues.push(`Too many main places (${mainPlaces.length} > 6)`);
        // Strategy: Move excess to Optional? Or just flag.
        // For V1 Allocator, we usually stop filling slots, so this is a safety net.
    }

    // 2. Subcategory Cap
    const subCounts = {};
    mainPlaces.forEach(p => {
        const sub = p.subcategory || 'other';
        subCounts[sub] = (subCounts[sub] || 0) + 1;
    });

    for (const [sub, count] of Object.entries(subCounts)) {
        if (count > 3) {
            report.isValid = false;
            report.issues.push(`Too many '${sub}' (${count} > 3)`);
        }
    }

    // 3. Min Diversity (Soft)
    const cats = new Set(mainPlaces.map(p => p.category));
    if (!cats.has('food') && !cats.has('nightlife')) {
        report.issues.push("No food/nightlife in main plan");
    }
    if (!cats.has('nature') && !cats.has('heritage') && !cats.has('attraction')) {
        report.issues.push("No attraction in main plan");
    }

    return report;
}

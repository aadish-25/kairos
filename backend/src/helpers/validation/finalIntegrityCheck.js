/**
 * Final global integrity pass.
 * Scans the entire destination context structure for anomalies.
 */
export function finalIntegrityCheck(destinationContext) {
    console.log(`[Integrity] Running final check for ${destinationContext.name}...`);
    const report = { passed: true, warnings: [], errors: [] };

    // 1. Check Regions
    if (!destinationContext.regions || destinationContext.regions.length === 0) {
        report.passed = false;
        report.errors.push("No regions found.");
        return report;
    }

    // 2. Check Places & Coords
    let totalPlaces = 0;
    let nullCoords = 0;
    const allPlaceNames = new Set();

    destinationContext.regions.forEach(r => {
        if (!r.places || r.places.length === 0) {
            report.warnings.push(`Empty region: ${r.name}`);
        } else {
            r.places.forEach(p => {
                totalPlaces++;
                if (!p.lat || !p.lon) nullCoords++;

                if (allPlaceNames.has(p.name)) {
                    report.warnings.push(`Duplicate place name across regions: ${p.name}`);
                }
                allPlaceNames.add(p.name);
            });
        }
    });

    if (nullCoords > 0) {
        // In Phase 4, we expect ZERO nulls for main places.
        report.warnings.push(`Found ${nullCoords} places with null coordinates.`);
    }

    // 3. Check Anchor Coverage (Did we lose any big names?)
    // This requires a separate list of expected anchors, or we check if "Main" items > 0
    if (totalPlaces > 0 && destinationContext.regions.every(r => !r.places.some(p => p.priority === 'main'))) {
        report.warnings.push("No 'main' priority places found in any region.");
    }

    console.log(`[Integrity] Result: ${report.passed ? 'PASS' : 'FAIL'}`, report);
    return report;
}

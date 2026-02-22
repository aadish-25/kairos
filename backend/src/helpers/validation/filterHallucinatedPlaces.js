/**
 * Hallucination Filter
 *
 * Post-Stage-2 validation that rejects any place the LLM invented
 * that doesn't exist in the original normalized places pool.
 *
 * Matching strategy (3-tier):
 * 1. Exact match (lowercase + trimmed) — fast path
 * 2. Fuzzy match  — catches minor renames: "Baga Beach" → "Baga Beachh" (typo), etc.
 *    Similarity threshold: ≥ 0.85 (Levenshtein ratio)
 * 3. Substring match — catches "Chapora" matching "Chapora Fort" or vice versa
 */

// Levenshtein distance (character edit distance)
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

// Similarity ratio: 1.0 = identical, 0.0 = completely different
function similarity(a, b) {
    const longer = Math.max(a.length, b.length);
    if (longer === 0) return 1.0;
    return (longer - levenshtein(a, b)) / longer;
}

const FUZZY_THRESHOLD = 0.82; // ≥82% similar = same place

/**
 * @param {Object} structuredContext - The LLM output with regions and places
 * @param {Array}  rawPlaces         - Original normalized places (Overpass + Geoapify merged)
 * @returns {Object}                 - Cleaned structuredContext, hallucinated places removed
 */
export function filterHallucinatedPlaces(structuredContext, rawPlaces) {
    // Build lookup arrays (lowercase + trimmed)
    const rawNames = rawPlaces.map(p => (p.name || '').toLowerCase().trim()).filter(Boolean);
    const rawNameSet = new Set(rawNames);

    let totalRemoved = 0;
    let totalFuzzy = 0;

    for (const region of (structuredContext.regions || [])) {
        if (!region.places) continue;

        const before = region.places.length;

        region.places = region.places.filter(p => {
            const norm = (p.name || '').toLowerCase().trim();
            if (!norm) return false;

            // Tier 1: Exact match
            if (rawNameSet.has(norm)) return true;

            // Tier 2: Fuzzy match — catch minor renames ("Baga Beach" → "Baga Beachfront")
            const fuzzyMatch = rawNames.find(raw => similarity(norm, raw) >= FUZZY_THRESHOLD);
            if (fuzzyMatch) {
                // Restore the original exact name from raw data so score lookup works
                p.name = rawPlaces.find(r =>
                    (r.name || '').toLowerCase().trim() === fuzzyMatch
                )?.name || p.name;
                totalFuzzy++;
                return true;
            }

            // Tier 3: Substring — "Chapora" in raw, LLM says "Chapora Fort"
            const subMatch = rawNames.find(raw =>
                norm.includes(raw) || raw.includes(norm)
            );
            if (subMatch && subMatch.length >= 5) { // min 5 chars to avoid false positives
                p.name = rawPlaces.find(r =>
                    (r.name || '').toLowerCase().trim() === subMatch
                )?.name || p.name;
                totalFuzzy++;
                return true;
            }

            // Not found — hallucinated
            console.log(`[HallucinationFilter] Removed "${p.name}" from region "${region.name}" — not in data pool`);
            totalRemoved++;
            return false;
        });

        if (region.places.length < before) {
            console.log(`[HallucinationFilter] Region "${region.name}": ${before} → ${region.places.length} places`);
        }
    }

    if (totalRemoved > 0) {
        console.log(`[HallucinationFilter] Removed: ${totalRemoved} hallucinated | Fuzzy-rescued: ${totalFuzzy}`);
    } else {
        console.log(`[HallucinationFilter] All places verified ✓ (${totalFuzzy} fuzzy-matched)`);
    }

    return structuredContext;
}

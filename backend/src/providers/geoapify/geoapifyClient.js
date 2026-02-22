/**
 * Geoapify Places API Client
 *
 * Used as a supplementary source alongside Overpass to ensure
 * famous landmarks (ranked by importance 0-1) are always present.
 *
 * Overpass: Complete data, no ranking — sorted by ID or qt.
 * Geoapify: Less complete, but importance-ranked — famous places always first.
 *
 * Strategy: Fetch top-N from Geoapify per category → merge into Overpass
 * pool by coordinate proximity (~100m). Geoapify fills gaps Overpass misses.
 */
import axios from "axios";

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
const GEOAPIFY_BASE_URL = "https://api.geoapify.com/v2/places";

/**
 * Maps our OSM tag { key, value } pairs to Geoapify category strings.
 * Returns null if no good Geoapify equivalent exists.
 */
function osmTagToGeoapifyCategory(key, value) {
    const map = {
        "natural:beach": "beach",
        "natural:peak": "natural.mountain.peak",
        "natural:cave_entrance": "natural.mountain.cave_entrance",
        "natural:water": "natural.water",
        "waterway:waterfall": "natural.water",
        "historic:fort": "tourism.sights.fort",
        "historic:castle": "tourism.sights.castle",
        "historic:monument": "tourism.sights.memorial.monument",
        "historic:ruins": "tourism.sights.ruines",
        "historic:palace": "tourism.sights.castle",
        "tourism:attraction": "tourism.attraction",
        "tourism:museum": "entertainment.museum",
        "tourism:viewpoint": "tourism.attraction.viewpoint",
        "tourism:zoo": "entertainment.zoo",
        "tourism:camp_site": "camping.camp_site",
        "amenity:place_of_worship": "religion.place_of_worship",
        "leisure:park": "leisure.park",
        "leisure:nature_reserve": "leisure.park.nature_reserve",
        "leisure:garden": "leisure.park.garden",
        "amenity:restaurant": "catering.restaurant",
        "amenity:cafe": "catering.cafe",
        "amenity:fast_food": "catering.fast_food",
        "amenity:bar": "catering.bar",
        "amenity:pub": "catering.pub",
        "amenity:nightclub": "adult.nightclub",
        "leisure:spa": "leisure.spa",
    };
    return map[`${key}:${value}`] ?? null;
}

/**
 * Fetch importance-ranked places from Geoapify for a bounding box.
 * Returns at most `limit` results sorted by importance DESC.
 *
 * @param {string} category  - Geoapify category string e.g. "beach"
 * @param {object} bbox      - { south, west, north, east }
 * @param {number} limit     - max results (20-100 recommended)
 * @returns {Array}          - Normalized place objects compatible with Overpass output
 */
async function fetchGeoapifyCategory(category, bbox, limit = 60) {
    const { south, west, north, east } = bbox;
    const filter = `rect:${west},${south},${east},${north}`;

    try {
        const response = await axios.get(GEOAPIFY_BASE_URL, {
            params: {
                categories: category,
                filter,
                limit,
                lang: "en",
                apiKey: GEOAPIFY_API_KEY,
            },
            timeout: 10000,
        });

        const features = response.data?.features ?? [];
        console.log(`[Geoapify] ${category}: ${features.length} results`);

        return features
            .filter(f => f.properties?.name && f.geometry?.coordinates)
            .map(f => ({
                // Format to match Overpass element shape so normalizeRawPlaces handles both
                type: "node",
                id: `geo_${f.properties.place_id ?? Math.random()}`,
                lat: f.geometry.coordinates[1],
                lon: f.geometry.coordinates[0],
                importance: f.properties.importance ?? 0,
                tags: {
                    name: f.properties.name,
                    // Reconstruct relevant OSM tags from Geoapify properties
                    ...(f.properties.categories?.includes("beach") && { natural: "beach" }),
                    ...(f.properties.categories?.includes("tourism.sights.fort") && { historic: "fort" }),
                    ...(f.properties.categories?.includes("tourism.sights.castle") && { historic: "castle" }),
                    ...(f.properties.categories?.includes("natural.mountain.peak") && { natural: "peak" }),
                    ...(f.properties.categories?.includes("religion.place_of_worship") && { amenity: "place_of_worship" }),
                    ...(f.properties.categories?.includes("entertainment.museum") && { tourism: "museum" }),
                    ...(f.properties.categories?.includes("tourism.attraction.viewpoint") && { tourism: "viewpoint" }),
                    ...(f.properties.categories?.includes("catering.restaurant") && { amenity: "restaurant" }),
                    ...(f.properties.categories?.includes("catering.cafe") && { amenity: "cafe" }),
                    ...(f.properties.categories?.includes("catering.bar") && { amenity: "bar" }),
                    // Wikipedia/wikidata if present (boost quality_score)
                    ...(f.properties.wiki && { wikipedia: f.properties.wiki }),
                    ...(f.properties.datasource?.raw?.wikidata && { wikidata: f.properties.datasource.raw.wikidata }),
                    ...(f.properties.website && { website: f.properties.website }),
                    // Pass importance through as a synthetic key so scoring can use it
                    "geoapify:importance": String(f.properties.importance ?? 0),
                },
            }));
    } catch (err) {
        console.error(`[Geoapify] ${category} fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Fetch Geoapify places for all HIGH-priority anchor tags in the fetch profile.
 * Only runs for high-priority tags — keeps API call count manageable.
 *
 * @param {Array}  anchorTags  - Tag array from fetch profile e.g. [{key, value, priority}]
 * @param {object} bbox        - { south, west, north, east }
 * @returns {Array}            - Combined Geoapify results (may include duplicates with Overpass)
 */
export async function fetchGeoapifySupplementary(anchorTags, bbox) {
    if (!GEOAPIFY_API_KEY) {
        console.warn("[Geoapify] No API key — skipping supplementary fetch");
        return [];
    }

    // Only fetch high + medium priority anchors from Geoapify
    const relevantTags = anchorTags.filter(t => t.priority === "high" || t.priority === "medium");

    // De-duplicate Geoapify categories (multiple OSM tags can map to same Geoapify category)
    const seen = new Set();
    const calls = [];

    for (const tag of relevantTags) {
        const geoCat = osmTagToGeoapifyCategory(tag.key, tag.value);
        if (!geoCat || seen.has(geoCat)) continue;
        seen.add(geoCat);
        // Limit per category: 80 for high priority, 40 for medium
        const limit = tag.priority === "high" ? 80 : 40;
        calls.push(fetchGeoapifyCategory(geoCat, bbox, limit));
    }

    const results = await Promise.all(calls);
    const combined = results.flat();
    console.log(`[Geoapify] Total supplementary: ${combined.length} places from ${calls.length} categories`);
    return combined;
}

/**
 * Merge Geoapify results into Overpass results.
 * Deduplication: if a Geoapify place is within 120m of an existing Overpass place → skip.
 * Otherwise: add it (sorted by importance so famous places get included first).
 *
 * @param {Array} overpassElements  - Raw Overpass OSM elements
 * @param {Array} geoapifyElements  - Normalized Geoapify elements
 * @returns {Array}                 - Merged deduplicated array
 */
export function mergeWithGeoapify(overpassElements, geoapifyElements) {
    if (!geoapifyElements || geoapifyElements.length === 0) return overpassElements;

    const DEDUP_RADIUS_DEGREES = 0.0011; // ~120m in lat/lon

    // Sort Geoapify by importance DESC so famous ones are merged first
    const sortedGeo = [...geoapifyElements].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));

    const merged = [...overpassElements];

    for (const geoPlace of sortedGeo) {
        if (!geoPlace.lat || !geoPlace.lon) continue;

        const isDuplicate = overpassElements.some(op => {
            const opLat = op.lat ?? op.center?.lat;
            const opLon = op.lon ?? op.center?.lon;
            if (!opLat || !opLon) return false;
            return (
                Math.abs(opLat - geoPlace.lat) < DEDUP_RADIUS_DEGREES &&
                Math.abs(opLon - geoPlace.lon) < DEDUP_RADIUS_DEGREES
            );
        });

        if (!isDuplicate) {
            merged.push(geoPlace);
        }
    }

    const added = merged.length - overpassElements.length;
    console.log(`[Geoapify] Merged: ${added} new places added (${overpassElements.length} Overpass + ${added} Geoapify)`);
    return merged;
}

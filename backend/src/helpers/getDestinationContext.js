import { runTravelChain } from "./planning/runTravelChain.js";
import { fetchRawPlacesForDestination } from "./data/fetchRawPlacesForDestination.js";
import { getCachedDestination, setCachedDestination } from '../cache/destinationCache.js'
import { geocodeMissingPlaces } from './data/geocodeMissingPlaces.js';
import { validateRegionCoherence } from './geo/validateRegionCoherence.js';
import { mergeFoodRegions } from './geo/mergeFoodRegions.js';

import { hydrateDestinationContext } from "./data/hydratePlaces.js";

export async function getDestinationContext(destination) {
  console.log(`[DestinationContext] Processing request for: ${destination}`);
  // 1. Try Cache
  const cacheKey = `dest_context:${destination.toLowerCase()}`;
  const cached = await getCachedDestination(destination);
  if (cached) {
    console.log(`[DestinationContext] REDIS HIT for ${destination}. Skipping geocoding pipeline.`);
    return cached;
  }
  console.log(`[DestinationContext] REDIS MISS for ${destination}. Building and geocoding fresh context...`);

  const rawPlaces = await fetchRawPlacesForDestination(destination);

  if (!rawPlaces || rawPlaces.length === 0) {
    return {
      destination,
      regions: [],
      message: "No tourism data found for this location."
    };
  }

  // 1c. V6 Pipeline (3-Stage LLM Chain)
  console.log(`[Pipeline] Starting V6 Chain...`);
  const structuredContext = await runTravelChain(destination, rawPlaces);
  console.log(`[Pipeline] Chain Complete. Regions: ${structuredContext.regions?.length}`);

  // Hydrate with Lat/Lon from raw data
  hydrateDestinationContext(structuredContext, rawPlaces);

  // [NEW] Hallucination Filter — remove LLM-invented places not in Overpass data
  const { filterHallucinatedPlaces } = await import("./validation/filterHallucinatedPlaces.js");
  filterHallucinatedPlaces(structuredContext, rawPlaces);

  // [NEW] Category Normalizer — restore internal categories + quality_scores from raw data
  const { normalizePlaceCategories } = await import("./validation/normalizePlaceCategories.js");
  normalizePlaceCategories(structuredContext, rawPlaces);

  // ---------------------------------------------------------
  // PHASE 4: PRODUCTION HARDENING PIPELINE
  // ---------------------------------------------------------

  // 1. Geocoding & Persistence (Gaps filled in-memory)
  await geocodeMissingPlaces(structuredContext, destination);

  // 2. Specialty Tag Cleaning (Remove technical metadata like 'wikidata')
  const { cleanSpecialtyTags } = await import("./data/cleanSpecialtyTags.js");
  cleanSpecialtyTags(structuredContext);

  // [NEW] 2b. ID Sanitization (Strict snake_case) to fix "south_goaa" typos
  if (structuredContext.regions) {
    const idMap = {};
    structuredContext.regions.forEach(r => {
      const oldId = r.id;
      const newId = oldId.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      // Specific typo fixes (heuristic)
      // If ends with double letter that shouldn't be there (e.g. goaa -> goa)
      // strict check: if newId ends with aa/ii/uu and length > 4, strip one char? 
      // Better: Just standard snake_case is usually enough. "south_goaa" -> "south_goaa" (still wrong).
      // We can't fix "south_goaa" without a dictionary. But strict snake_case prevents spaces/caps.

      if (newId !== oldId) {
        console.log(`[Sanitizer] Renaming Region ID: ${oldId} -> ${newId}`);
        r.id = newId;
        idMap[oldId] = newId;
      }
    });

    // Update places to match new Region IDs
    if (Object.keys(idMap).length > 0) {
      structuredContext.regions.forEach(r => {
        if (r.places) {
          r.places.forEach(p => {
            if (idMap[p.region_id]) p.region_id = idMap[p.region_id];
          });
        }
      });
    }
  }

  // 3. Schema & Category Enforcement
  const { validateSchema } = await import("./validation/validateSchema.js");

  validateSchema(structuredContext);

  // 4. Geo Validation (Reassign Outliers using Dynamic Radius)
  const { validateRegionCoherence } = await import("./geo/validateRegionCoherence.js");
  validateRegionCoherence(structuredContext);

  // [NEW] 4b. Merge Food Regions (Compactness Check)
  // structuredContext.travel_profile comes from AI
  if (structuredContext.regions && structuredContext.travel_profile) {
    // Flatten all places for the merger function
    const allPlaces = structuredContext.regions.flatMap(r => r.places || []);
    const { regions: mergedRegions } = mergeFoodRegions(structuredContext.regions, allPlaces, structuredContext.travel_profile);

    // Update context with merged regions
    structuredContext.regions = mergedRegions;
  }

  // [NEW] 4c. Food Pool Builder (Deterministic Food Enrichment)
  // Build food pools from raw data and tag with nearest regions
  const { buildFoodPool, tagFoodPoolWithRegions } = await import("./planning/foodPoolBuilder.js");
  const foodPool = buildFoodPool(rawPlaces);
  tagFoodPoolWithRegions(foodPool, structuredContext.regions);
  structuredContext._foodPool = foodPool;

  // 5. Region Drift/Compactness Check (Observability)
  const { computeRegionCompactness } = await import("./geo/computeRegionCompactness.js");
  computeRegionCompactness(structuredContext);

  // 6. Limits & Guardrails
  const { limitRegionsByTripLength } = await import("./planning/limitRegionsByTripLength.js");
  limitRegionsByTripLength(structuredContext, 5); // Default cap

  // 7. Scoring (Pre-Ranking for Allocator)
  const { rankFoodPlaces } = await import("./scoring/rankFoodPlaces.js");
  rankFoodPlaces(structuredContext);

  // 8. Global Integrity Check
  const { finalIntegrityCheck } = await import("./validation/finalIntegrityCheck.js");
  finalIntegrityCheck(structuredContext);

  // ---------------------------------------------------------

  await setCachedDestination(destination, structuredContext);

  return structuredContext;
}


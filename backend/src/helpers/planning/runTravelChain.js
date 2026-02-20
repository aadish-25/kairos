import axios from "axios";
import ApiError from "../../utils/ApiError.js";
import { validateAndRepairChain } from "./chainValidator.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:9000";

async function runStage(stageName, payload) {
    try {
        console.log(`[TravelChain] Running ${stageName}...`);
        const res = await axios.post(`${AI_SERVICE_URL}/${stageName}`, payload);
        return res.data;
    } catch (error) {
        console.error(`[TravelChain] ${stageName} Failed:`, error.message);
        if (error.response?.data) {
            console.error(`[TravelChain] AI Error Details:`, JSON.stringify(error.response.data, null, 2));
        }
        throw new ApiError(500, `AI Pipeline Failed at ${stageName}`);
    }
}

export async function runTravelChain(destination, rawPlaces) {
    console.log(`[TravelChain] Starting V6 Pipeline for ${destination} (${rawPlaces.length} places)`);

    // ----------------------------------------------------
    // STAGE 1: GEOGRAPHIC STRUCTURING (Deterministic)
    // ----------------------------------------------------
    // Optimize Payload: Stage 1 only needs Name, Geo, and Category/Tags.
    const minimalPlaces = rawPlaces.map(p => ({
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        category: p.category,
        osm_keys: p.osm_keys // needed for inland/coastal check
    }));

    const structurerOutput = await runStage("stage1", { destination, places: minimalPlaces });

    // VALIDATION (Guardrail): Ensure we have regions
    if (!structurerOutput.regions || structurerOutput.regions.length === 0) {
        throw new ApiError(500, "Stage 1 failed to generate regions.");
    }

    // ----------------------------------------------------
    // STAGE 2: CURATION (Enrichment) - PER REGION LOOP
    // ----------------------------------------------------
    // Context Limit Fix: We curate each region individually to avoid 429/413 errors.

    // 1. Prepare minimal metadata pool (optimized)
    const minimalMetadataMap = new Map();
    rawPlaces.forEach(p => {
        minimalMetadataMap.set(p.name, {
            name: p.name,
            category: p.category,
            osm_keys: p.osm_keys,
            lat: p.lat,
            lon: p.lon,
            score: p.quality_score
        });
    });

    const enrichedRegions = [];

    for (const region of structurerOutput.regions) {
        // Filter metadata relevant to this region
        const regionMeta = [];
        region.places.forEach(p => {
            const meta = minimalMetadataMap.get(p.name);
            if (meta) regionMeta.push(meta);
        });

        // Skip empty regions (shouldn't happen due to Stage 1 validation)
        if (regionMeta.length === 0) continue;

        console.log(`[TravelChain] Curating Region: ${region.name} (${regionMeta.length} places)...`);

        // Payload for this specific region
        const miniStructure = {
            name: structurerOutput.name,
            regions: [region]
        };

        try {
            const regionOutput = await runStage("stage2", {
                structure: miniStructure,
                metadata_pool: regionMeta
            });

            if (regionOutput.regions && regionOutput.regions.length > 0) {
                enrichedRegions.push(regionOutput.regions[0]);
            } else if (Array.isArray(regionOutput.regions)) { // Handle empty array
                // do nothing
            } else {
                // Fallback if structure is wrong
                console.warn(`[TravelChain] Warning: Stage 2 return invalid structure for ${region.name}. Using raw.`);
                enrichedRegions.push(region);
            }
        } catch (err) {
            console.error(`[TravelChain] Failed to curate region ${region.name}. Using raw region as fallback.`);
            enrichedRegions.push(region); // Fallback to uncurated if Stage 2 fails
        }
    }

    const curatorOutput = {
        name: structurerOutput.name,
        regions: enrichedRegions
    };

    // ----------------------------------------------------
    // STAGE 4 (Interim): VALIDATION & REPAIR (Runs on aggregated regions)
    // ----------------------------------------------------
    // [New] Self-healing step: Ensure anchors exist and food is capped.
    const validatedOutput = validateAndRepairChain(curatorOutput);

    // ----------------------------------------------------
    // STAGE 3: STRATEGY (Macro)
    // ----------------------------------------------------
    // Input: Curated Regions
    const strategistOutput = await runStage("stage3", validatedOutput);

    // ----------------------------------------------------
    // FINAL ASSEMBLY
    // ----------------------------------------------------
    const profile = strategistOutput.travel_profile || strategistOutput;

    return {
        ...validatedOutput, // Contains regions
        travel_profile: profile
    };
}

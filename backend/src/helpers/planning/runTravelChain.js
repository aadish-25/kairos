import axios from "axios";
import ApiError from "../../utils/ApiError.js";
import { validateAndRepairChain } from "./chainValidator.js";
import { writeLog } from "../../utils/logger.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:9000";

async function runStage(stageName, payload) {
    try {
        writeLog('pipeline', `[TravelChain] Running ${stageName}...`);
        const res = await axios.post(`${AI_SERVICE_URL}/${stageName}`, payload);
        return res.data;
    } catch (error) {
        writeLog('ai_errors', `[TravelChain] ${stageName} Failed: ${error.message}`);
        import('fs').then(fs => fs.writeFileSync('ai_error_debug.log', JSON.stringify(error.response?.data || error.message, null, 2)));
        if (error.response?.data) {
            writeLog('ai_errors', `[TravelChain] AI Error Details from ${stageName}:\n${JSON.stringify(error.response.data, null, 2)}`);
        }
        throw new ApiError(500, `AI Pipeline Failed at ${stageName}`);
    }
}

export async function runTravelChain(destination, rawPlaces) {
    writeLog('pipeline', `[TravelChain] Starting V6 Pipeline for ${destination} (${rawPlaces.length} places)`);

    // ----------------------------------------------------
    // STAGE 1: GEOGRAPHIC STRUCTURING (Deterministic)
    // ----------------------------------------------------
    // Optimize Payload: Stage 1 only needs Name, Geo, and Category/Tags.
    const minimalPlaces = rawPlaces.map(p => ({
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        category: p.category,
        score: p.quality_score // Critical for AI to prioritize Baga Beach over unknown beaches
    }));

    const structurerOutput = await runStage("stage1", { destination, places: minimalPlaces });

    // ----------------------------------------------------
    // STAGE 2: CURATION (Enrichment) - PER REGION LOOP
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

        writeLog('pipeline', `[TravelChain] Curating Region: ${region.name} (${regionMeta.length} places)...`);

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
                writeLog('ai_errors', `[TravelChain] Warning: Stage 2 return invalid structure for ${region.name}. Using raw.`);
                enrichedRegions.push(region);
            }
        } catch (err) {
            writeLog('ai_errors', `[TravelChain] Failed to curate region ${region.name}. Using raw region as fallback.`);
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

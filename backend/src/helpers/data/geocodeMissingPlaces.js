import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIT_LOG = path.join(__dirname, '../../data/geocoding.log');

/**
 * Robust Logging: Writes to both terminal and data/geocoding.log
 */
function logAudit(msg) {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [Geocode Audit] ${msg}`;

    // Terminal log
    console.log(formattedMsg);

    // File log
    try {
        const logDir = path.dirname(AUDIT_LOG);
        if (!fs.existsSync(logDir)) {
            console.log(`[Geocode Audit] Creating log directory: ${logDir}`);
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(AUDIT_LOG, formattedMsg + '\n');
    } catch (err) {
        console.error(`[Geocode Audit] Failed to write to log file: ${err.message}`);
    }
}

// OpenCage Geocoder (Primary)
async function fetchOpenCage(query) {
    if (!process.env.OPENCAGE_API_KEY) {
        logAudit(`CRITICAL: OpenCage API Key is missing!`);
        return null;
    }
    try {
        const url = `https://api.opencagedata.com/geocode/v1/json`;
        logAudit(`Requesting OpenCage: "${query}"`);
        const resp = await axios.get(url, {
            params: {
                q: query,
                key: process.env.OPENCAGE_API_KEY,
                limit: 1,
                no_annotations: 1
            },
            timeout: 5000
        });

        if (resp.data.results && resp.data.results.length > 0) {
            const hit = resp.data.results[0];
            const result = { lat: hit.geometry.lat, lon: hit.geometry.lng, source: 'api_opencage' };
            logAudit(`SUCCESS: OpenCage resolved "${query}" -> [${result.lat}, ${result.lon}]`);
            return result;
        }
        logAudit(`MISS: OpenCage returned zero results for "${query}"`);
    } catch (err) {
        logAudit(`ERROR: OpenCage failed for "${query}": ${err.message}`);
    }
    return null;
}

// Geoapify Geocoder (Secondary)
async function fetchGeoapify(query) {
    if (!process.env.GEOAPIFY_API_KEY) {
        logAudit(`Geoapify Key missing, skipping secondary check.`);
        return null;
    }
    try {
        const url = `https://api.geoapify.com/v1/geocode/search`;
        logAudit(`Requesting Geoapify: "${query}"`);
        const resp = await axios.get(url, {
            params: {
                text: query,
                apiKey: process.env.GEOAPIFY_API_KEY,
                limit: 1
            },
            timeout: 5000
        });

        if (resp.data.features && resp.data.features.length > 0) {
            const hit = resp.data.features[0];
            const result = { lat: hit.properties.lat, lon: hit.properties.lon, source: 'api_geoapify' };
            logAudit(`SUCCESS: Geoapify resolved "${query}" -> [${result.lat}, ${result.lon}]`);
            return result;
        }
        logAudit(`MISS: Geoapify returned zero results for "${query}"`);
    } catch (err) {
        logAudit(`ERROR: Geoapify failed for "${query}": ${err.message}`);
    }
    return null;
}

// Nominatim Geocoder (Fallback)
async function fetchNominatim(query) {
    try {
        await new Promise(r => setTimeout(r, 1000)); // Respect 1req/sec

        const url = `https://nominatim.openstreetmap.org/search`;
        logAudit(`Requesting Nominatim (Fallback): "${query}"`);
        const resp = await axios.get(url, {
            params: {
                q: query,
                format: 'json',
                limit: 1,
                user_agent: 'Kairos_AI_Travel_Planner/1.0'
            },
            timeout: 5000
        });

        if (resp.data && resp.data.length > 0) {
            const hit = resp.data[0];
            const result = { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), source: 'fallback_nominatim' };
            logAudit(`SUCCESS: Nominatim resolved "${query}" -> [${result.lat}, ${result.lon}]`);
            return result;
        }
        logAudit(`MISS: Nominatim returned zero results for "${query}"`);
    } catch (err) {
        logAudit(`ERROR: Nominatim failed for "${query}": ${err.message}`);
    }
    return null;
}

/**
 * Main Orchestrator
 * Fills coordinate gaps in the destination context.
 */
export async function geocodeMissingPlaces(destinationContext, destinationName) {
    logAudit(`>>> STARTING GEOCODE RECOVERY SESSION for "${destinationName}" <<<`);
    logAudit(`STATUS: Providers Active -> ${process.env.OPENCAGE_API_KEY ? 'OpenCage [OK]' : 'OpenCage [MISSING]'}, ${process.env.GEOAPIFY_API_KEY ? 'Geoapify [OK]' : 'Geoapify [MISSING]'}`);

    let fixedCount = 0;
    let skipCount = 0;
    let gapFound = false;

    const suffix = destinationName.toLowerCase().includes('india') ? destinationName : `${destinationName}, India`;

    for (const region of destinationContext.regions) {
        if (!region.places) continue;

        for (const place of region.places) {
            const query = `${place.name}, ${suffix}`;

            if (place.lat && place.lon) {
                skipCount++;
                continue;
            }

            gapFound = true;
            logAudit(`GAP DETECTED: "${place.name}" is missing coordinates. Initiating recovery...`);

            let result = await fetchOpenCage(query);

            if (!result) {
                logAudit(`FALLBACK: OpenCage failed for "${place.name}", trying Geoapify...`);
                result = await fetchGeoapify(query);
            }

            if (!result) {
                logAudit(`FALLBACK: Geoapify failed for "${place.name}", trying Nominatim...`);
                result = await fetchNominatim(query);
            }

            if (result) {
                place.lat = result.lat;
                place.lon = result.lon;
                place.geo_source = result.source;
                fixedCount++;
            } else {
                logAudit(`FINAL FAILURE: Unable to resolve "${place.name}" across any provider.`);
                place.geo_source = 'failed_resolution';
            }
        }
    }

    if (!gapFound) {
        logAudit(`INFO: No coordinate gaps found for "${destinationName}". All ${skipCount} places already have valid coordinates.`);
    }

    logAudit(`>>> SESSION FINISHED: ${fixedCount} resolved, ${skipCount} already present. <<<`);
}

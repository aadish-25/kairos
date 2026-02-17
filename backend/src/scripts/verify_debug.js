import { fetchRawPlacesForDestination } from '../helpers/data/fetchRawPlacesForDestination.js';
import dotenv from 'dotenv';
dotenv.config();

async function debugOverpass() {
    try {
        console.log("Debugging Overpass fetch for Goa...");
        const start = Date.now();
        const places = await fetchRawPlacesForDestination("Goa");
        console.log(`Fetched ${places.length} places in ${(Date.now() - start) / 1000}s`);
        console.log("Sample place tags:", places[0]?.tags);
    } catch (err) {
        console.error("Overpass Fetch Failed:", err);
    }
}

debugOverpass();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEBUG_LOG = path.join(__dirname, '../../data/debug_geocode.log');

export function cleanSpecialtyTags(destinationContext) {
    const technicalTags = new Set([
        'wikidata', 'source', 'wpt_symbol', 'amenity', 'osm_id',
        'wheelchair', 'website', 'opening_hours', 'addr:city',
        'addr:postcode', 'historic', 'name', 'tourism', 'name:en',
        'name:hi', 'name:kn', 'name:ru', 'name:tr', 'waterway',
        'castle_type', 'wikipedia:en', 'alt_name', 'elephant',
        'description', 'internet_access', 'internet_access:fee',
        'cuisine', 'attraction'
    ]);

    let cleanedPlaces = 0;
    let totalRemoved = 0;

    if (!destinationContext.regions) return;

    for (const region of destinationContext.regions) {
        if (!region.places) continue;

        for (const place of region.places) {
            if (Array.isArray(place.specialty)) {
                const beforeCount = place.specialty.length;
                place.specialty = place.specialty.filter(tag => {
                    if (!tag) return false;
                    const cleanTag = tag.toString().toLowerCase().trim();
                    const isTechnical = technicalTags.has(cleanTag);
                    if (isTechnical) totalRemoved++;
                    return !isTechnical;
                });

                if (place.specialty.length < beforeCount) {
                    cleanedPlaces++;
                }
            }
        }
    }

    const msg = `[CleanSpecialty] Cleaned ${cleanedPlaces} places. Total removed: ${totalRemoved} tags.`;
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
    console.log(msg);
}

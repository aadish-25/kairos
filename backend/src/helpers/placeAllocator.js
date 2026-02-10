import ApiError from "../utils/ApiError.js";

function allocatePlacesToDayBuckets(dayBuckets, destinationContext) {
    if (!Array.isArray(dayBuckets)) {
        throw new ApiError(500, "Invalid day buckets");
    }

    if (!destinationContext || !Array.isArray(destinationContext.regions)) {
        throw new ApiError(500, "Invalid destination context");
    }

    const regionMap = new Map();
    for (const region of destinationContext.regions) {
        regionMap.set(region.id, region);
    }

    const usedMainPlaces = new Set();
    const dayPlans = [];

    for (const bucket of dayBuckets) {
        const region = regionMap.get(bucket.region_id);
        if (!region) continue;

        const mainPlaces = [];
        const optionalPlaces = [];

        for (const place of region.places) {
            if (place.priority === "main" && !usedMainPlaces.has(place.name)) {
                mainPlaces.push(place);
                usedMainPlaces.add(place.name);
                if (mainPlaces.length === 2) break;
            }
        }

        for (const place of region.places) {
            if (place.priority === "optional") {
                optionalPlaces.push(place);
                if (optionalPlaces.length === 2) break;
            }
        }

        dayPlans.push({
            day: bucket.day,
            region_id: bucket.region_id,
            region_name: bucket.region_name,
            places: {
                main: mainPlaces,
                optional: optionalPlaces
            }
        });
    }

    return dayPlans;
}

export { allocatePlacesToDayBuckets };

// Sample output (3-day Goa trip):
// [
//   {
//     day: 1,
//     region_id: "north_goa",
//     region_name: "North Goa",
//     places: {
//       main: [
//         { name: "Baga Beach", type: "attraction", short_description: "...", tags: [...], priority: "main" },
//         { name: "Anjuna Flea Market", type: "experience", short_description: "...", tags: [...], priority: "main" }
//       ],
//       optional: [
//         { name: "Thalassa", type: "food", short_description: "...", tags: [...], priority: "optional" },
//         { name: "Chapora Fort", type: "attraction", short_description: "...", tags: [...], priority: "optional" }
//       ]
//     }
//   },
//   {
//     day: 2,
//     region_id: "north_goa",
//     region_name: "North Goa",
//     places: {
//       main: [ { name: "Fort Aguada", ... } ],  // Baga & Anjuna already used
//       optional: [ ... ]
//     }
//   },
//   {
//     day: 3,
//     region_id: "south_goa",
//     region_name: "South Goa",
//     places: {
//       main: [ { name: "Palolem Beach", ... }, { name: "Basilica of Bom Jesus", ... } ],
//       optional: [ ... ]
//     }
//   }
// ]


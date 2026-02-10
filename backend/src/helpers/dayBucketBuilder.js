import ApiError from "../utils/ApiError.js";

function buildDayBuckets(itineraryShape) {
    if (
        !itineraryShape ||
        !Array.isArray(itineraryShape.regions_plan)
    ) {
        throw new ApiError(500, "Invalid itinerary shape");
    }

    const buckets = [];
    let dayCounter = 1;

    for (const region of itineraryShape.regions_plan) {
        const daysInRegion = region.days;

        for (let i = 0; i < daysInRegion; i++) {
            buckets.push({
                day: dayCounter,
                region_id: region.region_id,
                region_name: region.region_name
            });
            dayCounter++;
        }
    }

    return buckets;
}

export { buildDayBuckets };

// Sample output (3-day Goa trip):
// [
//   { day: 1, region_id: "north_goa", region_name: "North Goa" },
//   { day: 2, region_id: "north_goa", region_name: "North Goa" },
//   { day: 3, region_id: "south_goa", region_name: "South Goa" }
// ]
